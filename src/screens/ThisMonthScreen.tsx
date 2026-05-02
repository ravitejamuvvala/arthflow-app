import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import TopActionCard from '../components/TopActionCard'
import { fetchAiReport } from '../lib/api'
import { useAppData } from '../lib/DataContext'
import { supabase } from '../lib/supabase'
import { Transaction } from '../types'
import { commaFormat, fmtInr, getBudgetRule, getMonthlySnapshots, mapCategory, stripCommas } from '../utils/calculations'
import { getTopAction } from '../utils/engine'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE    = '#1E3A8A'
const BLUE_L  = '#DBEAFE'
const GREEN   = '#22C55E'
const GREEN_H = '#16A34A'
const GREEN_L = '#DCFCE7'
const ORANGE  = '#F59E0B'
const ORANGE_H = '#D97706'
const ORANGE_L = '#FEF3C7'
const RED     = '#EF4444'
const RED_L   = '#FEE2E2'
const TEAL    = '#14B8A6'
const TEAL_L  = '#CCFBF1'
const TXT1    = '#111827'
const TXT2    = '#6B7280'
const TXT3    = '#9CA3AF'
const BORDER  = '#E5E7EB'
const BG_SEC  = '#F1F5F9'

const CAT_CONFIG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  essentials: { label: 'Essentials', color: BLUE,   bg: BLUE_L,   emoji: '🏠' },
  lifestyle:  { label: 'Lifestyle',  color: ORANGE, bg: ORANGE_L, emoji: '✨' },
  emis:       { label: 'EMIs',       color: RED,    bg: RED_L,    emoji: '📋' },
  other:      { label: 'Other',      color: TEAL,   bg: TEAL_L,   emoji: '📦' },
}

const EMOJI_PRESETS = ['🏠','🛒','⚡','⛽','🍽️','📱','🛍️','💪','🚗','📋','✈️','🎮','💊','📚','🎵','🏥','🐾','👔','🎁','💡']

// ─── Auto-classify by keyword ───────────────────────────────────────────
const KEYWORD_MAP: { keywords: string[]; cat: string; emoji: string }[] = [
  { keywords: ['rent', 'house rent', 'room rent'], cat: 'essentials', emoji: '🏠' },
  { keywords: ['electricity', 'electric', 'power', 'light bill'], cat: 'essentials', emoji: '⚡' },
  { keywords: ['water', 'water bill'], cat: 'essentials', emoji: '💧' },
  { keywords: ['gas', 'lpg', 'cooking gas', 'cylinder'], cat: 'essentials', emoji: '🔥' },
  { keywords: ['grocery', 'groceries', 'vegetables', 'fruits', 'kirana', 'ration'], cat: 'essentials', emoji: '🛒' },
  { keywords: ['milk', 'dairy', 'doodh'], cat: 'essentials', emoji: '🥛' },
  { keywords: ['petrol', 'diesel', 'fuel', 'cng'], cat: 'essentials', emoji: '⛽' },
  { keywords: ['wifi', 'internet', 'broadband', 'fiber'], cat: 'essentials', emoji: '📶' },
  { keywords: ['mobile', 'phone', 'recharge', 'airtel', 'jio', 'vi'], cat: 'essentials', emoji: '📱' },
  { keywords: ['medicine', 'medical', 'pharmacy', 'doctor', 'hospital', 'health', 'apollo', 'clinic'], cat: 'essentials', emoji: '💊' },
  { keywords: ['insurance', 'policy', 'premium', 'lic'], cat: 'essentials', emoji: '🛡️' },
  { keywords: ['school', 'tuition', 'fee', 'fees', 'college', 'education'], cat: 'essentials', emoji: '📚' },
  { keywords: ['maid', 'servant', 'helper', 'cook', 'cleaner'], cat: 'essentials', emoji: '🧹' },
  { keywords: ['transport', 'bus', 'train', 'metro', 'auto', 'uber', 'ola', 'cab', 'taxi', 'parking'], cat: 'essentials', emoji: '🚗' },
  { keywords: ['emi', 'loan', 'home loan', 'car loan', 'personal loan', 'credit card'], cat: 'emis', emoji: '📋' },
  { keywords: ['sip', 'mutual fund', 'mf', 'investment'], cat: 'emis', emoji: '📈' },
  { keywords: ['zomato', 'swiggy', 'food order', 'dining', 'restaurant', 'cafe', 'coffee', 'starbucks', 'pizza', 'burger', 'biryani', 'lunch', 'dinner', 'breakfast'], cat: 'lifestyle', emoji: '🍽️' },
  { keywords: ['shopping', 'amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'fashion', 'dress'], cat: 'lifestyle', emoji: '🛍️' },
  { keywords: ['movie', 'movies', 'netflix', 'hotstar', 'prime', 'subscription', 'spotify', 'youtube', 'ott'], cat: 'lifestyle', emoji: '🎬' },
  { keywords: ['gym', 'fitness', 'workout', 'yoga', 'sports'], cat: 'lifestyle', emoji: '💪' },
  { keywords: ['travel', 'trip', 'vacation', 'holiday', 'flight', 'hotel', 'booking', 'oyo'], cat: 'lifestyle', emoji: '✈️' },
  { keywords: ['gift', 'birthday', 'party', 'celebration'], cat: 'lifestyle', emoji: '🎁' },
  { keywords: ['salon', 'haircut', 'spa', 'grooming', 'beauty', 'parlour'], cat: 'lifestyle', emoji: '💇' },
  { keywords: ['game', 'gaming', 'playstation', 'xbox', 'steam'], cat: 'lifestyle', emoji: '🎮' },
  { keywords: ['pet', 'dog', 'cat', 'vet'], cat: 'lifestyle', emoji: '🐾' },
  { keywords: ['charity', 'donation', 'temple', 'church', 'mosque'], cat: 'other', emoji: '🙏' },
]

function autoClassify(desc: string): { cat: string; emoji: string } | null {
  const lc = desc.toLowerCase().trim()
  if (!lc) return null
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (lc.includes(kw) || kw.includes(lc)) {
        return { cat: entry.cat, emoji: entry.emoji }
      }
    }
  }
  return null
}

export default function ThisMonthScreen({ onNavigateCoach, onNavigatePlan }: { onNavigateCoach?: () => void; onNavigatePlan?: () => void }) {
  const { profile, transactions, goals, assets, engineResult, loading, incomeOverride, setIncomeOverride, refreshData } = useAppData()
  const [refreshing, setRefreshing] = useState(false)
  const forceRefreshRef = useRef(false)

  // AI Report (screen-local — display concern only)
  const [aiReport, setAiReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportStale, setReportStale] = useState(false)

  // Expense sheet
  const [showExpSheet, setShowExpSheet] = useState(false)
  const [editItem, setEditItem] = useState<Transaction | null>(null)
  const [expDesc, setExpDesc] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expCat, setExpCat] = useState('essentials')
  const [expEmoji, setExpEmoji] = useState('🛒')
  const [expDate, setExpDate] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Income override
  const [showIncomeSheet, setShowIncomeSheet] = useState(false)
  const [incomeInput, setIncomeInput] = useState('')

  // Onboarding expense edit
  const [showOnbExpSheet, setShowOnbExpSheet] = useState(false)
  const [onbExpKey, setOnbExpKey] = useState<string>('')
  const [onbExpLabel, setOnbExpLabel] = useState('')
  const [onbExpAmount, setOnbExpAmount] = useState('')
  const [carryItems, setCarryItems] = useState<Set<string>>(new Set())

  // Derived values from shared context
  const userName = profile?.full_name || 'there'
  const userAge = profile?.age ?? 0

  const loadAiReport = useCallback(async () => {
    if (!engineResult?.flow || !profile) return
    const flow = engineResult.flow
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTx = transactions.filter(t => new Date(t.date) >= startOfMonth)
    const baseIncome = incomeOverride ?? profile?.monthly_income ?? 0
    if (baseIncome === 0 && thisMonthTx.length === 0) return

    const skipCache = forceRefreshRef.current
    forceRefreshRef.current = false
    setReportLoading(true)
    if (!skipCache) {
      try {
        const cached = await AsyncStorage.getItem('@arthflow_ai_report')
        if (cached) {
          const parsed = JSON.parse(cached)
          const cachedDate = new Date(parsed.ts)
          const now = new Date()
          const sameMonth = cachedDate.getFullYear() === now.getFullYear() && cachedDate.getMonth() === now.getMonth()
          if (sameMonth && parsed.ts && Date.now() - parsed.ts < 6 * 60 * 60 * 1000) {
            setAiReport(parsed.report)
            setReportLoading(false)
            return
          }
        }
      } catch {}
    }
    try {
      const income = flow?.income ?? profile?.monthly_income ?? 0
      const spent = flow?.totalSpent ?? 0
      const report = await fetchAiReport({
        profile,
        transactions: thisMonthTx,
        goals: goals.map(goal => {
          const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : new Date().getFullYear() + 5
          const yearsLeft = Math.max(1, targetYear - new Date().getFullYear())
          const monthsLeft = yearsLeft * 12
          const remaining = Math.max(0, (goal.target_amount || 0) - (goal.saved_amount || 0))
          const monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : 0
          return { ...goal, monthlyNeeded, yearsLeft, monthsLeft }
        }),
        assets,
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
      })
      setAiReport(report)
      await AsyncStorage.setItem('@arthflow_ai_report', JSON.stringify({ report, ts: Date.now() }))
    } catch (e) {
      console.error('AI report error:', e)
    } finally {
      setReportLoading(false)
    }
  }, [engineResult, profile, transactions, goals, assets, incomeOverride])

  useEffect(() => { loadAiReport() }, [loadAiReport])

  const onRefresh = async () => {
    setRefreshing(true)
    setReportStale(false)
    await AsyncStorage.removeItem('@arthflow_ai_report')
    forceRefreshRef.current = true
    await refreshData()
    setRefreshing(false)
  }

  const forceRefreshReport = async () => {
    setReportStale(false)
    await AsyncStorage.removeItem('@arthflow_ai_report')
    forceRefreshRef.current = true
    await refreshData()
  }

  const firstName = userName.split(' ')[0]
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // ─── Expense CRUD ──────────────────────────────────────────────
  const openAdd = (cat?: string, emoji?: string) => {
    setEditItem(null); setExpDesc(''); setExpAmount('')
    setExpCat(cat || 'essentials'); setExpEmoji(emoji || '🛒')
    setExpDate(new Date().toISOString().slice(5, 10).replace('-', ' '))
    setShowExpSheet(true)
  }

  const openEdit = (item: Transaction) => {
    setEditItem(item); setExpDesc(item.note || item.category)
    setExpAmount(String(item.amount))
    setExpCat(mapCategory(item.category || 'other')); setExpEmoji('🛒')
    const d = new Date(item.date)
    setExpDate(`${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}`)
    setShowExpSheet(true)
  }

  const saveExpense = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const amt = Number(expAmount)
    if (!expDesc.trim() || amt <= 0) return
    const payload = {
      user_id: user.id, amount: amt, category: CAT_CONFIG[expCat].label,
      type: 'expense', note: expDesc.trim(),
      date: expDate ? (() => {
        const parts = expDate.trim().split(/[\s\/\-]+/)
        if (parts.length === 2) {
          const now = new Date()
          return new Date(now.getFullYear(), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10)).toISOString()
        }
        return new Date().toISOString()
      })() : new Date().toISOString(),
    }
    if (editItem) await supabase.from('transactions').update(payload).eq('id', editItem.id)
    else await supabase.from('transactions').insert(payload)
    setShowExpSheet(false); refreshData()
  }

  const deleteExpense = async () => {
    if (!editItem) return
    await supabase.from('transactions').delete().eq('id', editItem.id)
    setShowExpSheet(false); refreshData()
  }

  if (loading || !engineResult) {
    return <View style={s.center}><ActivityIndicator color={BLUE} size="large" /></View>
  }

  const { flow, status, topProblem, action, insights } = engineResult
  const budget = getBudgetRule(userAge)
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const thisMonthTx = transactions.filter(t => new Date(t.date) >= startOfMonth)
  const thisMonthExpenses = thisMonthTx.filter(t => t.type === 'expense')

  // Previous month expenses for carry-forward
  const prevMonthStart = new Date(); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1); prevMonthStart.setDate(1); prevMonthStart.setHours(0, 0, 0, 0)
  const prevMonthExpenses = transactions.filter(t => t.type === 'expense' && new Date(t.date) >= prevMonthStart && new Date(t.date) < startOfMonth)
  const uniquePrevExpenses = Object.values(
    prevMonthExpenses.reduce((acc: Record<string, any>, t) => {
      const key = (t.note || t.category || 'other').toLowerCase().trim()
      if (!acc[key]) acc[key] = { id: t.id, note: t.note || t.category, category: t.category, amount: 0 }
      acc[key].amount += t.amount
      return acc
    }, {})
  ) as { id: string; note: string; category: string; amount: number }[]

  const carryForward = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || carryItems.size === 0) return
    const now = new Date().toISOString()
    const items = uniquePrevExpenses.filter(t => carryItems.has(t.id))
    for (const t of items) {
      await supabase.from('transactions').insert({
        user_id: user.id, amount: t.amount, category: t.category,
        type: 'expense' as const, note: t.note, date: now,
      })
    }
    setCarryItems(new Set())
    refreshData()
  }

  const snapshots = getMonthlySnapshots(transactions, profile?.monthly_income)

  return (
    <View style={s.root}>
      {/* ── App Bar (fixed) ──────────────────────────────── */}
      <View style={s.appBar}>
        <View style={s.brandRow}>
          <ArthFlowLogo size={28} />
          <Text style={s.brandText}>ARTHFLOW</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >

      {/* ── Status Hero ──────────────────────────────────── */}
      <View style={s.heroCard}>
        <View style={s.heroGlow} />
        <View style={s.heroContent}>
          <Text style={s.heroMonth}>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
          <Text style={s.heroGreeting}>{greeting()}, {firstName}! 👋</Text>

          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: status.color + '20' }]}>
            <Text style={{ fontSize: 14 }}>{status.emoji}</Text>
            <Text style={[s.statusText, { color: status.color }]}>{status.status}</Text>
          </View>
          <Text style={s.statusMessage}>{status.message}</Text>

          {/* Money Flow */}
          <View style={s.flowRow}>
            <TouchableOpacity style={s.flowBox} activeOpacity={0.7} onPress={() => { setIncomeInput(String(flow.income)); setShowIncomeSheet(true) }}>
              <Text style={s.flowLabel}>INCOME ✎</Text>
              <Text style={s.flowValue}>{fmtInr(flow.income)}</Text>
            </TouchableOpacity>
            <View style={s.flowBox}>
              <Text style={s.flowLabel}>SPENT</Text>
              <Text style={s.flowValue}>{fmtInr(flow.totalSpent)}</Text>
            </View>
            <View style={s.flowBox}>
              <Text style={s.flowLabel}>SAVED</Text>
              <Text style={[s.flowValue, { color: flow.savingsPct >= 20 ? 'rgba(34,197,94,0.9)' : 'rgba(251,191,36,0.9)' }]}>
                {flow.savingsPct}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Top Action Card ──────────────────────────────── */}
      <TopActionCard topAction={getTopAction(engineResult, userAge)} onPress={onNavigateCoach} />

      {/* ── Monthly Trend ────────────────────────────────── */}
      {snapshots.length > 1 && (
        <View style={s.card}>
          <Text style={[s.cardTitle, { marginBottom: 14 }]}>Monthly Trend</Text>
          {snapshots.map((snap, i) => {
            const isCurrent = i === snapshots.length - 1
            const spentPct = snap.income > 0 ? Math.min(100, Math.round((snap.spent / snap.income) * 100)) : 0
            const prev = i > 0 ? snapshots[i - 1] : null
            return (
              <View key={i} style={[s.trendRow, isCurrent && s.trendRowCurrent]}>
                <View style={s.trendMonthCol}>
                  <Text style={[s.trendMonth, isCurrent && { color: BLUE }]}>{snap.short}</Text>
                </View>
                <View style={s.trendContent}>
                  <View style={s.trendBarTrack}>
                    <View style={[s.trendBarFill, { width: `${spentPct}%`, backgroundColor: snap.savedPct >= 20 ? GREEN : snap.savedPct >= 5 ? ORANGE : RED }]} />
                  </View>
                  <View style={s.trendStats}>
                    <Text style={s.trendStatText}>
                      <Text style={{ color: TXT1, fontFamily: 'Manrope_700Bold' }}>{fmtInr(snap.spent)}</Text>
                      <Text style={{ color: TXT3 }}> spent</Text>
                    </Text>
                    <Text style={[s.trendSaved, { color: snap.savedPct >= 20 ? GREEN_H : snap.savedPct >= 5 ? ORANGE_H : RED }]}>
                      {snap.savedPct >= 0 ? '↑' : '↓'} {snap.savedPct}% saved
                    </Text>
                  </View>
                </View>
              </View>
            )
          })}
          {(() => {
            const curr = snapshots[snapshots.length - 1]
            const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
            if (!prev) return null
            const diff = curr.savedPct - prev.savedPct
            const msg = diff > 5
              ? `Savings up ${diff}% vs ${prev.short} — great progress! 🟢`
              : diff < -5
              ? `Spending rose ${Math.abs(diff)}% vs ${prev.short} — review lifestyle costs 🟡`
              : `Holding steady vs ${prev.short} — aim for 20%+ savings 🔵`
            return (
              <View style={s.trendInsight}>
                <Text style={s.trendInsightText}>{msg}</Text>
              </View>
            )
          })()}
        </View>
      )}

      {/* ── AI Financial Report (compact dashboard) ──── */}
      {(reportLoading || aiReport || engineResult) && (
        <TouchableOpacity
          style={s.reportCard}
          onPress={() => onNavigateCoach?.()}
          activeOpacity={0.85}
        >
          <View style={s.reportHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 16 }}>🤖</Text>
              <Text style={s.cardTitle}>AI Financial Report</Text>
            </View>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); forceRefreshReport() }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 16 }}>{reportLoading ? '⏳' : '🔄'}</Text>
            </TouchableOpacity>
            {(aiReport || engineResult) && (
              <View style={[s.reportScoreBadge, {
                backgroundColor: ((aiReport?.score ?? engineResult?.score ?? 50) >= 80 ? GREEN : (aiReport?.score ?? engineResult?.score ?? 50) >= 60 ? ORANGE : (aiReport?.score ?? engineResult?.score ?? 50) >= 40 ? ORANGE : RED) + '18'
              }]}>
                <Text style={[s.reportScoreText, {
                  color: (aiReport?.score ?? engineResult?.score ?? 50) >= 80 ? GREEN_H : (aiReport?.score ?? engineResult?.score ?? 50) >= 60 ? ORANGE_H : (aiReport?.score ?? engineResult?.score ?? 50) >= 40 ? ORANGE_H : RED
                }]}>{aiReport?.score ?? engineResult?.score ?? '—'}/100</Text>
              </View>
            )}
          </View>

          {reportStale && !reportLoading && aiReport && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); forceRefreshReport() }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}
            >
              <Text style={{ fontSize: 13 }}>💡</Text>
              <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#92400E', flex: 1 }}>Your data has changed — tap to refresh report</Text>
              <Text style={{ fontSize: 12, color: '#92400E' }}>🔄</Text>
            </TouchableOpacity>
          )}

          {aiReport ? (
            <>
              <Text style={s.reportSummary}>{aiReport.summary}</Text>

              {/* Section pills - compact overview */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {aiReport.sections?.map((sec: any, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BG_SEC, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{sec.icon}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{sec.title}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BG_SEC }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' }}>View Full Report</Text>
                <Text style={{ fontSize: 14, color: BLUE }}>→</Text>
              </View>
            </>
          ) : engineResult ? (
            <>
              <Text style={s.reportSummary}>
                {engineResult.flow?.savingsPct >= 20
                  ? `Saving ${engineResult.flow.savingsPct}% of income — above the 20% benchmark.`
                  : engineResult.flow?.income > 0
                    ? `Saving ${engineResult.flow?.savingsPct ?? 0}% — target is 20%. ${engineResult.emergencyMonths < 3 ? 'Emergency fund needs attention.' : ''}`
                    : 'Add income and expenses to see your analysis.'}
              </Text>

              {reportLoading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: BLUE_L, borderRadius: 10, marginBottom: 8 }}>
                  <ActivityIndicator color={BLUE} size="small" />
                  <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: BLUE, flex: 1 }}>Getting detailed AI analysis...</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BG_SEC }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' }}>View Full Report</Text>
                <Text style={{ fontSize: 14, color: BLUE }}>→</Text>
              </View>
            </>
          ) : null}
        </TouchableOpacity>
      )}

      {/* ── Blueprint (compact) ──────────────────────────── */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={s.cardTitle}>Money Blueprint</Text>
          <View style={s.bpBadge}><Text style={s.bpBadgeText}>{budget.label}</Text></View>
        </View>
        {flow.isEstimated && (
          <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3, marginBottom: 10 }}>Based on your onboarding budget — add expenses for actuals</Text>
        )}
        {[
          { label: 'Bills & Needs', sub: 'Rent, groceries, EMIs', emoji: '🏠', actual: flow.needsPct, target: budget.needsTarget, amount: flow.catTotals.essentials + flow.catTotals.emis, good: flow.needsPct <= budget.needsTarget, okColor: BLUE, badColor: RED },
          { label: 'Fun & Wants', sub: 'Dining, shopping, trips', emoji: '🎯', actual: flow.wantsPct, target: budget.wantsTarget, amount: flow.catTotals.lifestyle, good: flow.wantsPct <= budget.wantsTarget, okColor: ORANGE_H, badColor: RED },
          { label: 'Savings', sub: 'What you keep & grow', emoji: '💰', actual: flow.savingsPct, target: budget.savingsTarget, amount: Math.max(0, flow.savings), good: flow.savingsPct >= budget.savingsTarget, okColor: GREEN_H, badColor: ORANGE_H },
        ].map(row => {
          const barColor = row.good ? row.okColor : row.badColor
          const budgetAmount = Math.round(flow.income * row.target / 100)
          const isWealth = row.label === 'Savings'
          const overUnder = isWealth
            ? (row.amount >= budgetAmount ? `${fmtInr(row.amount - budgetAmount)} above` : `${fmtInr(budgetAmount - row.amount)} below`)
            : (row.amount <= budgetAmount ? `${fmtInr(budgetAmount - row.amount)} left` : `${fmtInr(row.amount - budgetAmount)} over`)
          return (
            <View key={row.label} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>{row.emoji}</Text>
                  <View>
                    <Text style={s.bpLabel}>{row.label}</Text>
                    <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular' }}>{row.sub}</Text>
                  </View>
                </View>
                <View style={[s.bpPill, { backgroundColor: barColor + '18' }]}>
                  <Text style={[s.bpPillText, { color: barColor }]}>{row.actual}%{row.good ? ' ✓' : ''}</Text>
                </View>
              </View>
              {/* Amount row: actual vs budget */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: TXT1 }}>{fmtInr(row.amount)}</Text>
                <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 13, color: row.good ? GREEN_H : RED }}>
                  {isWealth ? (row.good ? '✓ ' : '') : ''}{overUnder} · limit {fmtInr(budgetAmount)}
                </Text>
              </View>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(100, row.actual)}%`, backgroundColor: barColor }]} />
                <View style={[s.barMarker, { left: `${Math.min(97, row.target)}%` }]}>
                  <View style={s.barMarkerLine} />
                  <Text style={s.barMarkerLabel}>{row.target}%</Text>
                </View>
              </View>
            </View>
          )
        })}
      </View>

      {/* ── Expenses by Category ─────────────────────────── */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={s.cardTitle}>Expenses</Text>
          <TouchableOpacity onPress={() => openAdd()} activeOpacity={0.7}>
            <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 12, color: BLUE }}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Onboarding estimates — break it down into detailed items */}
        {flow.isEstimated && (profile?.expenses_essentials || profile?.expenses_lifestyle || profile?.expenses_emis) && (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular', marginBottom: 8, lineHeight: 18 }}>
              Your onboarding estimates — tap to add detailed items
            </Text>
            {[
              { key: 'needs', cat: 'essentials', emoji: '🏠', label: 'Bills & Needs', amount: (profile?.expenses_essentials ?? 0) + (profile?.expenses_emis ?? 0), color: BLUE, bg: BLUE_L, editKeys: [
                { key: 'expenses_essentials', label: 'Essentials', amount: profile?.expenses_essentials ?? 0 },
                { key: 'expenses_emis', label: 'EMIs', amount: profile?.expenses_emis ?? 0 },
              ] },
              { key: 'wants', cat: 'lifestyle', emoji: '✨', label: 'Fun & Wants', amount: profile?.expenses_lifestyle ?? 0, color: ORANGE, bg: ORANGE_L, editKeys: [
                { key: 'expenses_lifestyle', label: 'Lifestyle', amount: profile?.expenses_lifestyle ?? 0 },
              ] },
            ].filter(e => e.amount > 0).map(e => (
              <TouchableOpacity key={e.key} style={s.txRow} onPress={() => openAdd(e.cat, e.emoji)} activeOpacity={0.6}>
                <View style={s.txLeft}>
                  <Text style={s.txNote}>{e.emoji} {e.label}</Text>
                  <Text style={s.txDate}>₹{commaFormat(String(e.amount))} estimated</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: e.color, fontFamily: 'Manrope_700Bold' }}>Add details →</Text>
                  {e.editKeys.filter(ek => ek.amount > 0).map(ek => (
                    <TouchableOpacity key={ek.key} onPress={() => { setOnbExpKey(ek.key); setOnbExpLabel(ek.label); setOnbExpAmount(commaFormat(String(ek.amount))); setShowOnbExpSheet(true) }} activeOpacity={0.5} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12 }}>✏️</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Carry forward from last month */}
        {thisMonthExpenses.length === 0 && uniquePrevExpenses.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold' }}>📋 REPEAT FROM LAST MONTH</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => {
                  if (carryItems.size === uniquePrevExpenses.length) setCarryItems(new Set())
                  else setCarryItems(new Set(uniquePrevExpenses.map(t => t.id)))
                }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: TXT3, fontFamily: 'Manrope_700Bold' }}>
                    {carryItems.size === uniquePrevExpenses.length ? 'Deselect all' : 'Select all'}
                  </Text>
                </TouchableOpacity>
                {carryItems.size > 0 && (
                  <TouchableOpacity onPress={carryForward} activeOpacity={0.7}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE, fontFamily: 'Manrope_700Bold' }}>Copy ({carryItems.size}) →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular', marginBottom: 8 }}>
              Select recurring expenses to copy to this month
            </Text>
            {uniquePrevExpenses.map(t => {
              const selected = carryItems.has(t.id)
              return (
                <TouchableOpacity key={t.id} style={[s.txRow, selected && { borderWidth: 1.5, borderColor: BLUE + '40' }]} onPress={() => {
                  setCarryItems(prev => {
                    const next = new Set(prev)
                    if (next.has(t.id)) next.delete(t.id)
                    else next.add(t.id)
                    return next
                  })
                }} activeOpacity={0.6}>
                  <View style={s.txLeft}>
                    <Text style={s.txNote}>{t.note || t.category}</Text>
                    <Text style={s.txDate}>{fmtInr(t.amount)}</Text>
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? BLUE : BORDER, backgroundColor: selected ? BLUE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Recent transactions */}
        {thisMonthExpenses.length > 0 && (
          <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold', marginBottom: 8 }}>RECENT — tap to edit</Text>
              {thisMonthExpenses.map(t => (
                <TouchableOpacity key={t.id} style={s.txRow} onPress={() => openEdit(t)} activeOpacity={0.6}>
                  <View style={s.txLeft}>
                    <Text style={s.txNote}>{t.note || t.category}</Text>
                    <Text style={s.txDate}>{new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={s.txAmount}>-{fmtInr(t.amount)}</Text>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12 }}>✏️</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </View>

      <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Expense Sheet ────────────────────────────────── */}
      <Modal visible={showExpSheet} transparent animationType="slide" onRequestClose={() => setShowExpSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowExpSheet(false)}>
          <View style={s.sheetContainer} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.sheetTitle}>{editItem ? 'Edit Expense' : 'Add Expense'}</Text>
              <TouchableOpacity onPress={() => setShowExpSheet(false)} style={s.sheetClose}>
                <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Emoji + Desc */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setShowEmojiPicker(p => !p)} style={s.emojiBtn}>
                <Text style={{ fontSize: 24 }}>{expEmoji}</Text>
              </TouchableOpacity>
              <TextInput value={expDesc} onChangeText={(text) => {
                setExpDesc(text)
                const match = autoClassify(text)
                if (match) { setExpCat(match.cat); setExpEmoji(match.emoji) }
              }} placeholder="What did you spend on?" placeholderTextColor={TXT3} style={s.descInput} />
            </View>

            {showEmojiPicker && (
              <View style={s.emojiGrid}>
                {EMOJI_PRESETS.map(e => (
                  <TouchableOpacity key={e} onPress={() => { setExpEmoji(e); setShowEmojiPicker(false) }} style={[s.emojiItem, expEmoji === e && { backgroundColor: BLUE_L }]}>
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Amount */}
            <View style={s.amountRow}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
              <TextInput value={expAmount} onChangeText={setExpAmount} placeholder="0" placeholderTextColor={TXT3} keyboardType="numeric" style={s.amountInput} />
            </View>

            {/* Date */}
            <View style={[s.amountRow, { marginBottom: 12 }]}>
              <Text style={{ fontSize: 14, color: TXT3 }}>📅</Text>
              <TextInput value={expDate} onChangeText={setExpDate} placeholder="MM DD" placeholderTextColor={TXT3} style={[s.amountInput, { fontSize: 14 }]} />
            </View>

            {/* Category */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {Object.entries(CAT_CONFIG).map(([key, cfg]) => {
                const sel = expCat === key
                return (
                  <TouchableOpacity key={key} onPress={() => setExpCat(key)} style={[s.catPickChip, sel && { borderColor: cfg.color + '30', backgroundColor: cfg.bg }]}>
                    <Text style={{ fontSize: 14 }}>{cfg.emoji}</Text>
                    <Text style={[s.catPickText, sel && { color: cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {editItem && (
                <TouchableOpacity style={s.deleteBtn} onPress={deleteExpense}>
                  <Text style={{ fontSize: 15, color: '#fff' }}>🗑</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.saveBtn, (expDesc.trim() && Number(expAmount) > 0) ? {} : { backgroundColor: BG_SEC }]}
                onPress={saveExpense} disabled={!expDesc.trim() || !(Number(expAmount) > 0)}>
                <Text style={[s.saveBtnText, !(expDesc.trim() && Number(expAmount) > 0) && { color: TXT3 }]}>
                  {editItem ? 'Save Changes' : 'Add Expense'}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Income Override Sheet ─────────────────────────── */}
      <Modal visible={showIncomeSheet} transparent animationType="slide" onRequestClose={() => setShowIncomeSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowIncomeSheet(false)}>
          <View style={s.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Update This Month's Income</Text>
            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3, marginTop: 4, marginBottom: 16, lineHeight: 18 }}>
              Base: {fmtInr(profile?.monthly_income || 0)}. Add bonus, freelance, or adjust for this month.
            </Text>
            <View style={s.amountRow}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
              <TextInput value={incomeInput} onChangeText={setIncomeInput} placeholder="0" placeholderTextColor={TXT3} keyboardType="numeric" style={s.amountInput} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              {incomeOverride !== null && (
                <TouchableOpacity style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC }} onPress={() => { setIncomeOverride(null); setShowIncomeSheet(false) }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold' }}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.saveBtn, !(Number(incomeInput) > 0) && { backgroundColor: BG_SEC }]}
                onPress={() => { if (Number(incomeInput) > 0) { setIncomeOverride(Number(incomeInput)); setShowIncomeSheet(false) } }}
                disabled={!(Number(incomeInput) > 0)}>
                <Text style={[s.saveBtnText, !(Number(incomeInput) > 0) && { color: TXT3 }]}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Onboarding Expense Edit Sheet ─────────────── */}
      <Modal visible={showOnbExpSheet} transparent animationType="slide" onRequestClose={() => setShowOnbExpSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setShowOnbExpSheet(false)}>
          <View style={s.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Edit {onbExpLabel}</Text>
            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3, marginTop: 4, marginBottom: 16, lineHeight: 18 }}>
              Update your estimated monthly {onbExpLabel.toLowerCase()} for this month.
            </Text>
            <View style={s.amountRow}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
              <TextInput value={onbExpAmount} onChangeText={t => setOnbExpAmount(commaFormat(t))} placeholder="0" placeholderTextColor={TXT3} keyboardType="numeric" style={s.amountInput} autoFocus />
            </View>
            <TouchableOpacity
              style={[s.saveBtn, { marginTop: 12 }]}
              onPress={async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || !onbExpKey) return
                const val = Number(stripCommas(onbExpAmount))
                if (isNaN(val) || val < 0) return
                await supabase.from('profiles').update({ [onbExpKey]: val }).eq('id', user.id)
                await AsyncStorage.removeItem('@arthflow_ai_report')
                setShowOnbExpSheet(false)
                refreshData()
              }}>
              <Text style={s.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingVertical: 4, paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: 3, fontFamily: 'NotoSerif_700Bold' },

  // Hero
  heroCard: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 16, marginBottom: 14, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A' },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroMonth: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, fontFamily: 'Manrope_700Bold' },
  heroGreeting: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.4, lineHeight: 30, marginTop: 2, fontFamily: 'Manrope_700Bold' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  statusText: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize', fontFamily: 'Manrope_700Bold' },
  statusMessage: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6, fontFamily: 'Manrope_400Regular' },

  flowRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  flowBox: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  flowLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  flowValue: { fontSize: 17, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Problem card
  problemCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: ORANGE + '30', borderLeftWidth: 4, borderLeftColor: ORANGE },
  problemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  problemTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold', flex: 1 },
  problemMessage: { fontSize: 15, color: TXT2, lineHeight: 22, fontFamily: 'Manrope_400Regular', marginBottom: 14 },
  ctaBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
  ctaArrow: { fontSize: 16, color: '#fff', fontWeight: '800' },

  // AI Report
  reportCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BLUE + '25', borderLeftWidth: 4, borderLeftColor: BLUE },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reportScoreBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  reportScoreText: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  reportSummary: { fontSize: 15, color: TXT1, lineHeight: 22, fontFamily: 'Manrope_400Regular', marginBottom: 12 },

  // Insight chips
  insightChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: BORDER, maxWidth: 260 },
  insightChipText: { fontSize: 13, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold', lineHeight: 19, flexShrink: 1 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER },

  cardTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // Blueprint
  bpBadge: { backgroundColor: BLUE_L, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  bpBadgeText: { fontSize: 13, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },
  bpLabel: { fontSize: 15, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  bpPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bpPillText: { fontSize: 13, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: BG_SEC, position: 'relative', marginBottom: 2 },
  barFill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
  barMarker: { position: 'absolute', top: -5, alignItems: 'center' },
  barMarkerLine: { width: 2, height: 16, backgroundColor: TXT1, borderRadius: 1 },
  barMarkerLabel: { fontSize: 11, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold', marginTop: 1 },

  // Category chips
  catChip: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1 },
  catAmount: { fontSize: 16, fontWeight: '800', marginTop: 4, fontFamily: 'Manrope_700Bold' },
  catLabel: { fontSize: 12, fontWeight: '700', color: TXT3, marginTop: 2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' },

  // Transactions
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, backgroundColor: BG_SEC, borderRadius: 14 },
  txLeft: { flex: 1 },
  txNote: { fontSize: 15, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  txDate: { fontSize: 13, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  txAmount: { fontSize: 16, fontWeight: '800', color: RED, fontFamily: 'Manrope_700Bold' },

  // Trend
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  trendRowCurrent: { backgroundColor: BLUE_L, borderRadius: 12, paddingHorizontal: 8, marginHorizontal: -4 },
  trendMonthCol: { width: 32 },
  trendMonth: { fontSize: 13, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },
  trendContent: { flex: 1 },
  trendBarTrack: { height: 6, borderRadius: 3, backgroundColor: BG_SEC, overflow: 'hidden', marginBottom: 4 },
  trendBarFill: { height: 6, borderRadius: 3 },
  trendStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trendStatText: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: TXT3 },
  trendSaved: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  trendInsight: { marginTop: 10, backgroundColor: BG_SEC, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  trendInsightText: { fontSize: 13, fontWeight: '600', color: BLUE, lineHeight: 20, fontFamily: 'Manrope_400Regular' },

  // Sheets
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.65)', justifyContent: 'flex-end' },
  sheetContainer: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },

  emojiBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  descInput: { flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, fontSize: 15, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 16, backgroundColor: BG_SEC, marginBottom: 12 },
  emojiItem: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, marginBottom: 8 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  catPickChip: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: 'transparent' },
  catPickText: { fontSize: 12, fontWeight: '800', color: TXT3, textTransform: 'uppercase', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  deleteBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: RED },
  saveBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: BLUE },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
})
