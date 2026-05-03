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
    const { data: { session: sess } } = await supabase.auth.getSession()
    const user = sess?.user
    if (!user) { setLoading(false); return null }

    const fetchStart = new Date()
    fetchStart.setMonth(fetchStart.getMonth() - 4)
    fetchStart.setDate(1)
    fetchStart.setHours(0, 0, 0, 0)

    const [profileRes, txRes, goalRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('transactions').select('*').gte('date', fetchStart.toISOString()).order('date', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    const p = profileRes.data ?? null
    let txs: Transaction[] = txRes.data ?? []
    const g = goalRes.data ?? []

    // Load assets: Supabase (primary) → AsyncStorage (fallback cache)
    let assetData = p?.assets ?? null
    if (!assetData) {
      try {
        const raw = await AsyncStorage.getItem(ASSETS_KEY)
        if (raw) {
          assetData = JSON.parse(raw)
          // Migrate local-only assets to Supabase
          if (user && assetData) {
            await supabase.from('profiles').update({ assets: assetData }).eq('id', user.id)
          }
        }
      } catch {}
    } else {
      // Keep AsyncStorage in sync as cache
      try { await AsyncStorage.setItem(ASSETS_KEY, JSON.stringify(assetData)) } catch {}
    }

    // ── One-time cleanup: remove previously auto-seeded DB records ──
    // Earlier code wrote onboarding estimates as real DB rows. Remove them
    // so they don't double-count with user's actual transactions.
    const SEED_CLEANUP_KEY = '@arthflow_seed_cleanup_done'
    const cleanupDone = await AsyncStorage.getItem(SEED_CLEANUP_KEY)
    if (!cleanupDone && user) {
      const seedNotes = ['Rent & Bills', 'Loan EMIs', 'Lifestyle']
      const { data: staleSeeds } = await supabase
        .from('transactions')
        .select('id, note')
        .eq('user_id', user.id)
        .in('note', seedNotes)
      if (staleSeeds && staleSeeds.length > 0) {
        await supabase.from('transactions').delete().in('id', staleSeeds.map(s => s.id))
        txs = txs.filter(t => !seedNotes.includes(t.note ?? ''))
      }
      await AsyncStorage.setItem(SEED_CLEANUP_KEY, 'true')
    }

    setProfile(p)
    setTransactions(txs)
    setGoals(g)
    setAssets(assetData)

    // Run engine with current-month transactions — single source of truth
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTxFinal = txs.filter(t => new Date(t.date) >= startOfMonth)
    const baseIncome = incomeOverride ?? p?.monthly_income ?? 0

    // ── Fetch saved monthly plan (locked budget rule for this month) ──
    const currentMonth = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`
    const { data: existingPlan } = await supabase
      .from('monthly_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', currentMonth)
      .single()

    // Also fetch last month's plan for compliance scoring
    const prevMonthDate = new Date(startOfMonth)
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`
    const { data: prevPlan } = await supabase
      .from('monthly_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('month', prevMonth)
      .single()

    const result: any = runEngine({
      income: baseIncome,
      transactions: thisMonthTxFinal,
      allTransactions: txs,
      goals: g,
      assets: assetData,
      age: p?.age ?? 0,
      profile: p,
      savedPlan: prevPlan ?? null,
    })

    // ── Persist monthly plan if not yet saved for this month ──
    if (!existingPlan && result.budget && baseIncome > 0) {
      const planRow = {
        user_id: user.id,
        month: currentMonth,
        needs_target: result.budget.needsTarget,
        wants_target: result.budget.wantsTarget,
        savings_target: result.budget.savingsTarget,
        label: result.budget.label,
        rationale: result.budget.rationale,
        strategy: result.budget.strategy ?? null,
        verdict_text: result.budget.verdict?.text ?? null,
        verdict_type: result.budget.verdict?.type ?? 'positive',
        category_patterns: result.budget.categoryPatterns ?? [],
        compliance_score: result.budget.compliance ?? null,
        goal_sip_needed: result.budget.goalSipNeeded ?? 0,
        goal_sip_gap: result.budget.goalSipGap ?? 0,
      }
      await supabase.from('monthly_plans').upsert(planRow, { onConflict: 'user_id,month' })
      // Use the freshly computed plan
      result.budget._locked = true
      result.budget._month = currentMonth
    } else if (existingPlan) {
      // Lock the budget to the saved plan — override engine's computed values
      result.budget.needsTarget = existingPlan.needs_target
      result.budget.wantsTarget = existingPlan.wants_target
      result.budget.savingsTarget = existingPlan.savings_target
      result.budget.label = existingPlan.label
      result.budget.rationale = existingPlan.rationale
      result.budget.categoryPatterns = existingPlan.category_patterns ?? []
      result.budget.compliance = existingPlan.compliance_score
      result.budget.goalSipNeeded = existingPlan.goal_sip_needed ?? 0
      result.budget.goalSipGap = existingPlan.goal_sip_gap ?? 0
      result.budget._locked = true
      result.budget._month = currentMonth

      // Re-compute strategy + verdict with locked targets but current spending
      const flow = result.flow
      const _savingsPct = flow.savingsPct ?? 0
      const ratName = existingPlan.rationale.split(' — ')[0]
      result.budget.strategy = _savingsPct >= existingPlan.savings_target
        ? `${ratName} · saving ${_savingsPct}% against ${existingPlan.savings_target}% target`
        : `${ratName} · saving ${_savingsPct}% — target is ${existingPlan.savings_target}%`

      const _needsGap = Math.round(flow.needsPct - existingPlan.needs_target)
      const _wantsGap = Math.round(flow.wantsPct - existingPlan.wants_target)
      const _savingsGap = Math.round(existingPlan.savings_target - _savingsPct)
      const _wantsOver = _wantsGap > 0 ? Math.round(flow.income * _wantsGap / 100) : 0
      const _needsOver = _needsGap > 0 ? Math.round(flow.income * _needsGap / 100) : 0

      let verdictText = ''
      let verdictType = 'positive'
      if (flow.income <= 0) {
        verdictText = 'Add income to see your budget split'
        verdictType = 'warning'
      } else if (_needsGap > 5 && _savingsGap > 0) {
        verdictText = `Essentials at ${flow.needsPct}% — ₹${_needsOver.toLocaleString('en-IN')} over budget`
        verdictType = 'critical'
      } else if (_savingsGap > 0 && _wantsGap > 0) {
        verdictText = `Trim lifestyle by ${_wantsGap}% (₹${_wantsOver.toLocaleString('en-IN')}) → more to invest`
        verdictType = 'warning'
      } else if (_savingsGap > 0) {
        verdictText = `${_savingsGap}% below savings goal — room to grow wealth`
        verdictType = 'warning'
      } else {
        verdictText = 'Well balanced this month ✓'
        verdictType = 'positive'
      }
      result.budget.verdict = { text: verdictText, type: verdictType }
      result.budget.blueprintHint = verdictText
    }

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
    if (aiReportLockRef.current) { return }
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
          debtHealth: eng.debtHealth,
          runway: eng.runway,
          lifestyleCreep: eng.lifestyleCreep,
          budget: eng.budget ? {
            label: eng.budget.label,
            needsTarget: eng.budget.needsTarget,
            wantsTarget: eng.budget.wantsTarget,
            savingsTarget: eng.budget.savingsTarget,
            rationale: eng.budget.rationale,
            strategy: eng.budget.strategy,
            verdict: eng.budget.verdict,
            goalSipNeeded: eng.budget.goalSipNeeded,
            goalSipGap: eng.budget.goalSipGap,
            compliance: eng.budget.compliance,
          } : undefined,
          goalHorizonPlan: eng.goalHorizonPlan ? {
            totalSipNeeded: eng.goalHorizonPlan.totalSipNeeded,
            totalSipRaw: eng.goalHorizonPlan.totalSipRaw,
            sipCapped: eng.goalHorizonPlan.sipCapped,
            liquidUsed: eng.goalHorizonPlan.liquidUsed,
            excessLiquid: eng.goalHorizonPlan.excessLiquid,
            stretchGoals: eng.goalHorizonPlan.stretchGoals,
            buckets: eng.goalHorizonPlan.buckets?.map((b: any) => ({
              label: b.label,
              totalSip: b.totalSip,
              totalLiquidUsed: b.totalLiquidUsed,
              goals: b.goals?.map((g: any) => ({
                name: g.name,
                monthlySip: g.monthlySip,
                liquidAllocated: g.liquidAllocated,
                priority: g.priority,
              })),
            })),
          } : undefined,
          liquidFundAnalysis: eng.liquidFundAnalysis,
        },
      })
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
    // Save to Supabase (primary) + AsyncStorage (cache)
    const { data: { session: sess } } = await supabase.auth.getSession()
    if (sess?.user) {
      await supabase.from('profiles').update({ assets: newAssets }).eq('id', sess.user.id)
    }
    await AsyncStorage.setItem(ASSETS_KEY, JSON.stringify(newAssets))
    // Clear cached AI report so next engine recompute triggers a fresh one
    await AsyncStorage.removeItem(AI_REPORT_KEY)
    forceAiRefreshRef.current = true
    // Re-fetch everything (will use locked monthly plan from Supabase)
    await fetchAll()
  }, [fetchAll])

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
