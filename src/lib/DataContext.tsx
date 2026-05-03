// ─── Single Source of Truth for all financial data ──────────────────────
// Every screen reads from this context. No duplicate Supabase queries.

import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Goal, Profile, Transaction } from '../types'
import { runEngine } from '../utils/engine'
import { fetchAiReport } from './api'
import { supabase } from './supabase'

const ASSETS_KEY = '@arthflow_assets'
const AI_REPORT_KEY = '@arthflow_ai_report'

interface AppDataContextType {
  profile: Profile | null
  transactions: Transaction[]
  goals: Goal[]
  assets: any
  engineResult: any
  aiReport: any
  aiReportLoading: boolean
  loading: boolean
  incomeOverride: number | null
  setIncomeOverride: (v: number | null) => void
  refreshData: () => Promise<void>
  refreshAiReport: (force?: boolean) => Promise<void>
  updateAssets: (a: any) => void
  setGoals: (g: Goal[]) => void
}

const DataContext = createContext<AppDataContextType | null>(null)

export function DataProvider({ children, session }: { children: React.ReactNode; session: any }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [assets, setAssets] = useState<any>(null)
  const [engineResult, setEngineResult] = useState<any>(null)
  const [aiReport, setAiReport] = useState<any>(null)
  const [aiReportLoading, setAiReportLoading] = useState(false)
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const forceAiRefreshRef = useRef(false)
  const isRefreshingRef = useRef(false)
  const aiReportLockRef = useRef(false)

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return null }

    const fourMonthsAgo = new Date()
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3)
    fourMonthsAgo.setDate(1)
    fourMonthsAgo.setHours(0, 0, 0, 0)

    const [profileRes, txRes, goalRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('transactions').select('*').gte('date', fourMonthsAgo.toISOString()).order('date', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    const p = profileRes.data ?? null
    let txs: Transaction[] = txRes.data ?? []
    const g = goalRes.data ?? []

    // Load assets from AsyncStorage
    let assetData = null
    try {
      const raw = await AsyncStorage.getItem(ASSETS_KEY)
      if (raw) assetData = JSON.parse(raw)
    } catch {}

    // ── Auto-seed: convert onboarding estimates into real transactions ──
    // Runs once per month when there are zero transactions and the profile
    // has onboarding expense data. Creates actual expense records so the
    // engine always operates on real transactions (no fallback path).
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTx = txs.filter(t => new Date(t.date) >= startOfMonth)
    const thisMonthExpenses = thisMonthTx.filter(t => t.type === 'expense')

    if (p && thisMonthExpenses.length === 0 && (p.expenses_essentials || p.expenses_lifestyle || p.expenses_emis)) {
      const seedKey = `@arthflow_seeded_${startOfMonth.toISOString().slice(0, 7)}`
      const alreadySeeded = await AsyncStorage.getItem(seedKey)
      if (!alreadySeeded) {
        const seedDate = new Date().toISOString()
        const seeds: { user_id: string; amount: number; category: string; type: 'expense'; note: string; date: string }[] = []
        if (p.expenses_essentials > 0) seeds.push({ user_id: user.id, amount: p.expenses_essentials, category: 'Essentials', type: 'expense', note: 'Rent & Bills', date: seedDate })
        if (p.expenses_emis > 0) seeds.push({ user_id: user.id, amount: p.expenses_emis, category: 'EMIs', type: 'expense', note: 'Loan EMIs', date: seedDate })
        if (p.expenses_lifestyle > 0) seeds.push({ user_id: user.id, amount: p.expenses_lifestyle, category: 'Lifestyle', type: 'expense', note: 'Lifestyle', date: seedDate })
        if (seeds.length > 0) {
          const { data: inserted } = await supabase.from('transactions').insert(seeds).select()
          if (inserted) txs = [...inserted, ...txs]
          await AsyncStorage.setItem(seedKey, 'true')
        }
      }
    }

    setProfile(p)
    setTransactions(txs)
    setGoals(g)
    setAssets(assetData)

    // Run engine with current-month transactions
    const thisMonthTxFinal = txs.filter(t => new Date(t.date) >= startOfMonth)
    const baseIncome = incomeOverride ?? p?.monthly_income ?? 0

    const result = runEngine({
      income: baseIncome,
      transactions: thisMonthTxFinal,
      goals: g,
      assets: assetData,
      age: p?.age ?? 0,
      profile: p,
    })
    setEngineResult(result)
    setLoading(false)

    // Return fresh data so callers can use it directly
    return { profile: p, transactions: txs, goals: g, assets: assetData, engineResult: result }
  }, [incomeOverride])

  // Fetch on mount and when incomeOverride changes
  useEffect(() => {
    if (session) fetchAll()
  }, [session, fetchAll])

  // ─── Centralized AI Report ─────────────────────────────────────────
  const loadAiReport = useCallback(async (eng: any, prof: Profile | null, txs: Transaction[], gls: Goal[], ast: any, override: number | null) => {
    if (!eng?.flow || !prof) return
    if (aiReportLockRef.current) { console.log('[AI] skipped (already loading)'); return }
    aiReportLockRef.current = true

    const flow = eng.flow
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTx = txs.filter((t: Transaction) => new Date(t.date) >= startOfMonth)
    const baseIncome = override ?? prof?.monthly_income ?? 0
    if (baseIncome === 0 && thisMonthTx.length === 0) { aiReportLockRef.current = false; return }

    const skipCache = forceAiRefreshRef.current
    forceAiRefreshRef.current = false
    setAiReportLoading(true)

    // Try cache first (unless forced)
    if (!skipCache) {
      try {
        const raw = await AsyncStorage.getItem(AI_REPORT_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          const cachedDate = new Date(parsed.ts)
          const now = new Date()
          const sameMonth = cachedDate.getFullYear() === now.getFullYear() && cachedDate.getMonth() === now.getMonth()
          if (sameMonth && parsed.ts && Date.now() - parsed.ts < 6 * 60 * 60 * 1000) {
            setAiReport(parsed.report)
            setAiReportLoading(false)
            return
          }
        }
      } catch {}
    }

    // Fetch fresh from backend
    try {
      const income = flow?.income ?? prof?.monthly_income ?? 0
      const spent = flow?.totalSpent ?? 0
      const goalSummary = gls.map((g: Goal) => `${g.name}:${g.target_amount}`).join(', ')
      const assetSummary = ast ? Object.entries(ast).filter(([,v]) => (v as number) > 0).map(([k,v]) => `${k}:${v}`).join(', ') : 'none'
      console.log('[AI] Calling backend — income:', income, 'spent:', spent, 'goals:', goalSummary, 'assets:', assetSummary, 'forceRefresh:', skipCache)
      const report = await fetchAiReport({
        forceRefresh: skipCache,
        profile: prof,
        transactions: thisMonthTx,
        goals: gls.map((goal: Goal) => {
          const now = new Date()
          const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : now.getFullYear() + 5
          const monthsLeft = Math.max(1, (targetYear - now.getFullYear()) * 12 + (11 - now.getMonth()))
          const yearsLeft = Math.ceil(monthsLeft / 12)
          const remaining = Math.max(0, (goal.target_amount || 0) - (goal.saved_amount || 0))
          const monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : 0
          return { ...goal, monthlyNeeded, yearsLeft, monthsLeft }
        }),
        assets: ast,
        monthlyFlow: {
          income,
          spent,
          saved: Math.max(0, income - spent),
          savePct: income > 0 ? Math.round(((income - spent) / income) * 100) : 0,
          lifestyle: flow?.catTotals?.lifestyle ?? 0,
          lifePct: income > 0 ? Math.round(((flow?.catTotals?.lifestyle ?? 0) / income) * 100) : 0,
          essentials: flow?.catTotals?.essentials ?? 0,
          emis: flow?.catTotals?.emis ?? 0,
        },
        engine: {
          flow: eng.flow,
          score: eng.score,
          scoreLabel: eng.scoreLabel,
          emergencyMonths: eng.emergencyMonths,
          investment: eng.investment,
          assetAnalysis: eng.assetAnalysis,
          risk: eng.risk,
          trend: eng.trend,
          avgGoalFunded: eng.avgGoalFunded,
        },
      })
      console.log('[AI] Got report, score:', report?.score)
      setAiReport(report)
      await AsyncStorage.setItem(AI_REPORT_KEY, JSON.stringify({ report, ts: Date.now() }))
    } catch (e) {
      console.error('[AI] FETCH ERROR:', e)
    } finally {
      setAiReportLoading(false)
      aiReportLockRef.current = false
    }
  }, [])

  // Helpers for child screens
  const refreshData = useCallback(async () => {
    isRefreshingRef.current = true
    forceAiRefreshRef.current = true
    await AsyncStorage.removeItem(AI_REPORT_KEY)
    const freshData = await fetchAll()
    // Directly call loadAiReport with the fresh data — don't rely on useEffect
    if (freshData) {
      await loadAiReport(freshData.engineResult, freshData.profile, freshData.transactions, freshData.goals, freshData.assets, incomeOverride)
    }
    isRefreshingRef.current = false
  }, [fetchAll, loadAiReport, incomeOverride])

  // Trigger AI report when engine/profile/data changes (but not during manual refresh)
  useEffect(() => {
    if (isRefreshingRef.current) return
    if (engineResult && profile) {
      loadAiReport(engineResult, profile, transactions, goals, assets, incomeOverride)
    }
  }, [engineResult, profile, transactions, goals, assets, incomeOverride, loadAiReport])

  const refreshAiReport = useCallback(async (force?: boolean) => {
    if (force) {
      await AsyncStorage.removeItem(AI_REPORT_KEY)
      forceAiRefreshRef.current = true
    }
    await loadAiReport(engineResult, profile, transactions, goals, assets, incomeOverride)
  }, [engineResult, profile, transactions, goals, assets, incomeOverride, loadAiReport])

  const updateAssets = useCallback(async (newAssets: any) => {
    setAssets(newAssets)
    await AsyncStorage.setItem(ASSETS_KEY, JSON.stringify(newAssets))
    // Clear cached AI report so next engine recompute triggers a fresh one
    await AsyncStorage.removeItem(AI_REPORT_KEY)
    forceAiRefreshRef.current = true
    if (profile) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const thisMonthTx = transactions.filter((t: Transaction) => new Date(t.date) >= startOfMonth)
      const baseIncome = incomeOverride ?? profile?.monthly_income ?? 0
      const result = runEngine({
        income: baseIncome,
        transactions: thisMonthTx,
        goals,
        assets: newAssets,
        age: profile?.age ?? 0,
        profile,
      })
      setEngineResult(result)
    }
  }, [profile, transactions, goals, incomeOverride])

  const value = {
    // Data
    profile,
    transactions,    // all 4 months
    goals,
    assets,
    engineResult,
    aiReport,
    aiReportLoading,
    loading,

    // Income override (used by Home screen)
    incomeOverride,
    setIncomeOverride,

    // Actions
    refreshData,     // re-fetch everything from Supabase + recompute engine + refresh AI report
    refreshAiReport, // force-refresh AI report only
    updateAssets,    // update assets + recompute engine
    setGoals,        // for local goal mutations before Supabase sync
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useAppData(): AppDataContextType {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used within DataProvider')
  return ctx as AppDataContextType
}
