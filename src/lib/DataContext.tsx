// ─── Single Source of Truth for all financial data ──────────────────────
// Every screen reads from this context. No duplicate Supabase queries.

import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Goal, Profile, Transaction } from '../types'
import { runEngine } from '../utils/engine'
import { supabase } from './supabase'

const ASSETS_KEY = '@arthflow_assets'
const AI_REPORT_KEY = '@arthflow_ai_report'

interface AppDataContextType {
  profile: Profile | null
  transactions: Transaction[]
  goals: Goal[]
  assets: any
  engineResult: any
  loading: boolean
  incomeOverride: number | null
  setIncomeOverride: (v: number | null) => void
  refreshData: () => Promise<void>
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
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

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
    const txs = txRes.data ?? []
    const g = goalRes.data ?? []

    // Load assets from AsyncStorage
    let assetData = null
    try {
      const raw = await AsyncStorage.getItem(ASSETS_KEY)
      if (raw) assetData = JSON.parse(raw)
    } catch {}

    setProfile(p)
    setTransactions(txs)
    setGoals(g)
    setAssets(assetData)

    // Run engine with current-month transactions
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTx = txs.filter(t => new Date(t.date) >= startOfMonth)
    const baseIncome = incomeOverride ?? p?.monthly_income ?? 0

    const result = runEngine({
      income: baseIncome,
      transactions: thisMonthTx,
      goals: g,
      assets: assetData,
      age: p?.age ?? 0,
      profile: p,
    })
    setEngineResult(result)
    setLoading(false)
  }, [incomeOverride])

  // Fetch on mount and when incomeOverride changes
  useEffect(() => {
    if (session) fetchAll()
  }, [session, fetchAll])

  // Helpers for child screens
  const refreshData = useCallback(async () => {
    await fetchAll()
  }, [fetchAll])

  const updateAssets = useCallback((newAssets: any) => {
    setAssets(newAssets)
    AsyncStorage.setItem(ASSETS_KEY, JSON.stringify(newAssets))
    AsyncStorage.removeItem(AI_REPORT_KEY)
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
    loading,

    // Income override (used by Home screen)
    incomeOverride,
    setIncomeOverride,

    // Actions
    refreshData,     // re-fetch everything from Supabase + recompute engine
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
