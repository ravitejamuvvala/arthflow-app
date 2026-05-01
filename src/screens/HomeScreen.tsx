import React, { useCallback, useEffect, useState } from 'react'
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
import { supabase } from '../lib/supabase'
import { Transaction } from '../types'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE     = '#1E3A8A'
const BLUE_L   = '#DBEAFE'
const GREEN_H  = '#16A34A'
const GREEN_L  = '#DCFCE7'
const ORANGE   = '#F59E0B'
const ORANGE_H = '#D97706'
const ORANGE_L = '#FEF3C7'
const RED      = '#EF4444'
const RED_L    = '#FEE2E2'
const TEAL     = '#14B8A6'
const TEAL_L   = '#CCFBF1'
const TXT1     = '#111827'
const TXT2     = '#6B7280'
const TXT3     = '#9CA3AF'
const BORDER   = '#E5E7EB'
const BG_SEC   = '#F1F5F9'

// ─── Category Config ────────────────────────────────────────────────────
const CAT_CONFIG = {
  essentials: { label: 'Essentials', color: BLUE,   bg: BLUE_L,   emoji: '🏠', hint: 'Rent, groceries, utilities, transport' },
  lifestyle:  { label: 'Lifestyle',  color: ORANGE, bg: ORANGE_L, emoji: '✨', hint: 'Dining, shopping, entertainment' },
  emis:       { label: 'EMIs',       color: RED,    bg: RED_L,    emoji: '📋', hint: 'Loans, credit card payments' },
  other:      { label: 'Other',      color: TEAL,   bg: TEAL_L,   emoji: '📦', hint: 'Miscellaneous expenses' },
} as const

function mapCategory(cat: string): keyof typeof CAT_CONFIG {
  const l = (cat || '').toLowerCase()
  if (['essentials', 'food', 'dining', 'transport', 'groceries', 'rent', 'bills', 'utilities', 'health'].some(k => l.includes(k))) return 'essentials'
  if (['lifestyle', 'shopping', 'entertainment', 'travel'].some(k => l.includes(k))) return 'lifestyle'
  if (['emi', 'loan', 'credit'].some(k => l.includes(k))) return 'emis'
  return 'other'
}

const EMOJI_PRESETS = ['🏠','🛒','⚡','⛽','🍽️','📱','🛍️','💪','🚗','📋','✈️','🎮','💊','📚','🎵','🏥','🐾','👔','🎁','💡']

// Age-based personalised budget rule
function deriveBudget(age: number) {
  if (age < 30) return { label: '50 / 20 / 30', needsTarget: 50, wantsTarget: 20, savingsTarget: 30, rationale: 'Age < 30 · Aggressive wealth building phase' }
  if (age < 45) return { label: '50 / 25 / 25', needsTarget: 50, wantsTarget: 25, savingsTarget: 25, rationale: 'Age 30–44 · Balanced growth & stability' }
  return { label: '55 / 25 / 20', needsTarget: 55, wantsTarget: 25, savingsTarget: 20, rationale: 'Age 45+ · Capital preservation focus' }
}

const formatINR = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

// ─── Component ──────────────────────────────────────────────────────────
type Props = {
  onAddTransaction: () => void
  onNavigateCoach?: () => void
  refreshTrigger?: number
}

export default function HomeScreen({ onAddTransaction, onNavigateCoach, refreshTrigger }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userName, setUserName] = useState('')
  const [userAge, setUserAge] = useState(28)
  const [baseIncome, setBaseIncome] = useState(0) // from profile.monthly_income
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null) // user override for this month
  const [showIncomeSheet, setShowIncomeSheet] = useState(false)
  const [incomeInput, setIncomeInput] = useState('')
  const [activeCat, setActiveCat] = useState<keyof typeof CAT_CONFIG | null>(null)
  const [showExpSheet, setShowExpSheet] = useState(false)
  const [editItem, setEditItem] = useState<Transaction | null>(null)
  const [addForCat, setAddForCat] = useState<keyof typeof CAT_CONFIG | undefined>()
  // Expense form
  const [expDesc, setExpDesc] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expCat, setExpCat] = useState<keyof typeof CAT_CONFIG>('essentials')
  const [expEmoji, setExpEmoji] = useState('🛒')
  const [expDate, setExpDate] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  // Financial pulse
  const [pulseMonth, setPulseMonth] = useState(0) // 0 = current, -1/-2/-3 = prior months

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, age, monthly_income')
      .eq('id', user.id)
      .single()

    setUserName(profile?.full_name || user.email?.split('@')[0] || 'there')
    if (profile?.age) setUserAge(profile.age)
    if (profile?.monthly_income) setBaseIncome(profile.monthly_income)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Fetch last 4 months for Financial Pulse
    const fourMonthsAgo = new Date(startOfMonth)
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3)

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', fourMonthsAgo.toISOString())
      .order('date', { ascending: false })

    setTransactions(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (refreshTrigger && refreshTrigger > 0) fetchData() }, [refreshTrigger])

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  // ─── Computed values ────────────────────────────────────────────────
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const thisMonthTx = transactions.filter(t => new Date(t.date) >= startOfMonth)
  const txIncome = thisMonthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const income = incomeOverride ?? (baseIncome || txIncome)
  const expenseItems = thisMonthTx.filter(t => t.type === 'expense')
  const totalSpent = expenseItems.reduce((s, t) => s + t.amount, 0)
  const savings = income - totalSpent
  const savingsPct = income > 0 ? Math.round((savings / income) * 100) : 0

  const catTotals = { essentials: 0, lifestyle: 0, emis: 0, other: 0 }
  const catCounts = { essentials: 0, lifestyle: 0, emis: 0, other: 0 }
  expenseItems.forEach(t => {
    const bucket = mapCategory(t.category || 'other')
    catTotals[bucket] += t.amount
    catCounts[bucket] += 1
  })

  // Build monthly snapshots for Financial Pulse
  type MonthSnap = { label: string; short: string; inc: number; spent: number; savedPct: number; needsPct: number; wantsPct: number }
  const snapMap: Record<string, { inc: number; ess: number; life: number; emis: number; oth: number }> = {}
  transactions.forEach(t => {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!snapMap[key]) snapMap[key] = { inc: 0, ess: 0, life: 0, emis: 0, oth: 0 }
    if (t.type === 'income') snapMap[key].inc += t.amount
    else {
      const b = mapCategory(t.category || 'other')
      snapMap[key][b === 'essentials' ? 'ess' : b === 'lifestyle' ? 'life' : b === 'emis' ? 'emis' : 'oth'] += t.amount
    }
  })
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthlySnaps: MonthSnap[] = Object.keys(snapMap)
    .sort()
    .map(key => {
      const [y, m] = key.split('-').map(Number)
      const s = snapMap[key]
      const sp = s.inc - (s.ess + s.life + s.emis + s.oth)
      return {
        label: `${monthNames[m]} ${y}`,
        short: monthNames[m],
        inc: s.inc,
        spent: s.ess + s.life + s.emis + s.oth,
        savedPct: s.inc > 0 ? Math.round((sp / s.inc) * 100) : 0,
        needsPct: s.inc > 0 ? Math.round(((s.ess + s.emis) / s.inc) * 100) : 0,
        wantsPct: s.inc > 0 ? Math.round((s.life / s.inc) * 100) : 0,
      }
    })
    .slice(-4)

  const pulseIdx = Math.max(0, Math.min(monthlySnaps.length - 1, monthlySnaps.length - 1 + pulseMonth))

  const needsPct = income > 0 ? Math.round(((catTotals.essentials + catTotals.emis) / income) * 100) : 0
  const wantsPct = income > 0 ? Math.round((catTotals.lifestyle / income) * 100) : 0

  const budget = deriveBudget(userAge)
  const firstName = userName.split(' ')[0]

  const openAdd = (cat?: keyof typeof CAT_CONFIG) => {
    setEditItem(null)
    setExpDesc('')
    setExpAmount('')
    setExpCat(cat || 'essentials')
    setExpEmoji('🛒')
    setExpDate(new Date().toISOString().slice(5, 10).replace('-', ' '))
    setAddForCat(cat)
    setShowExpSheet(true)
  }

  const openEdit = (item: Transaction) => {
    setEditItem(item)
    setExpDesc(item.note || item.category)
    setExpAmount(String(item.amount))
    setExpCat(mapCategory(item.category || 'other'))
    setExpEmoji('🛒')
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
      user_id: user.id,
      amount: amt,
      category: CAT_CONFIG[expCat].label,
      type: 'expense' as const,
      note: expDesc.trim(),
      date: expDate ? (() => {
        const parts = expDate.trim().split(/[\s\/\-]+/)
        if (parts.length === 2) {
          const now = new Date()
          const month = parseInt(parts[0], 10) - 1
          const day = parseInt(parts[1], 10)
          if (!isNaN(month) && !isNaN(day)) {
            return new Date(now.getFullYear(), month, day).toISOString()
          }
        }
        return new Date().toISOString()
      })() : new Date().toISOString(),
    }

    if (editItem) {
      await supabase.from('transactions').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('transactions').insert(payload)
    }
    setShowExpSheet(false)
    fetchData()
  }

  const deleteExpense = async () => {
    if (!editItem) return
    await supabase.from('transactions').delete().eq('id', editItem.id)
    setShowExpSheet(false)
    fetchData()
  }

  const activeCatItems = activeCat
    ? thisMonthTx.filter(t => t.type === 'expense' && mapCategory(t.category || 'other') === activeCat)
        .sort((a, b) => b.amount - a.amount)
    : []

  const greeting = () => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} size="large" /></View>
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      {/* ── App Bar ──────────────────────────────────────────────── */}
      <View style={styles.appBar}>
        <View style={styles.brandRow}>
          <ArthFlowLogo size={26} />
          <Text style={styles.brandText}>ARTHFLOW</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.reportBtn} activeOpacity={0.7} onPress={onNavigateCoach}>
            <Text style={{ fontSize: 12 }}>📊</Text>
            <Text style={styles.reportBtnText}>Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileAvatar} activeOpacity={0.7}>
            <Text style={styles.profileInitial}>{firstName.charAt(0).toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Greeting Hero ────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroGlow} />
        <View style={styles.heroContent}>
          <Text style={styles.heroMonth}>
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
          <Text style={styles.heroGreeting}>{greeting()}, {firstName}! 👋</Text>
          <Text style={styles.heroSub}>
            {totalSpent > 0 ? `₹${Math.round(totalSpent / 1000)}K spent so far this month` : 'No expenses logged yet'}
          </Text>

          <View style={styles.heroStats}>
            {[
              { label: 'INCOME', value: formatINR(income), sub: incomeOverride ? 'adjusted ✎' : 'base income', good: true, tappable: true },
              { label: 'SPENT', value: formatINR(totalSpent), sub: income > 0 ? `${Math.round((totalSpent / income) * 100)}% of income` : '—', good: totalSpent <= income * 0.8, tappable: false },
              { label: 'SAVED', value: `${savingsPct}%`, sub: savingsPct >= 20 ? 'on track ✓' : 'target 20%', good: savingsPct >= 20, tappable: false },
            ].map(s => (
              <TouchableOpacity key={s.label} style={styles.heroStatBox} activeOpacity={s.tappable ? 0.6 : 1}
                onPress={s.tappable ? () => { setIncomeInput(String(income)); setShowIncomeSheet(true) } : undefined}>
                <Text style={styles.heroStatLabel}>{s.label}{s.tappable ? ' ✎' : ''}</Text>
                <Text style={styles.heroStatValue}>{s.value}</Text>
                <Text style={[styles.heroStatSub, { color: s.good ? 'rgba(34,197,94,0.85)' : 'rgba(251,191,36,0.9)' }]}>{s.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Your Money Blueprint ─────────────────────────────────── */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={styles.cardTitle}>Money Blueprint</Text>
          <View style={styles.bpBadge}>
            <Text style={styles.bpBadgeText}>{budget.label}</Text>
          </View>
        </View>

        {[
          { label: 'Committed', emoji: '🏦', actual: needsPct, target: budget.needsTarget, amount: catTotals.essentials + catTotals.emis, good: needsPct <= budget.needsTarget, okColor: BLUE, badColor: RED },
          { label: 'Lifestyle', emoji: '🌟', actual: wantsPct, target: budget.wantsTarget, amount: catTotals.lifestyle, good: wantsPct <= budget.wantsTarget, okColor: ORANGE_H, badColor: RED },
          { label: 'Wealth', emoji: '📈', actual: savingsPct, target: budget.savingsTarget, amount: Math.max(0, savings), good: savingsPct >= budget.savingsTarget, okColor: GREEN_H, badColor: ORANGE_H },
        ].map(row => {
          const barColor = row.good ? row.okColor : row.badColor
          return (
            <View key={row.label} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>{row.emoji}</Text>
                  <Text style={styles.bpLabel}>{row.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3 }}>{formatINR(row.amount)}</Text>
                  <View style={[styles.bpPill, { backgroundColor: barColor + '18' }]}>
                    <Text style={[styles.bpPillText, { color: barColor }]}>
                      {row.actual}%{row.good ? ' ✓' : ''}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(100, row.actual)}%`, backgroundColor: barColor }]} />
                <View style={[styles.barMarker, { left: `${Math.min(97, row.target)}%` }]} />
              </View>
            </View>
          )
        })}

        <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 10, color: TXT3, textAlign: 'center', marginTop: 4 }}>
          Target: {budget.rationale} · Grey marker = your target
        </Text>
      </View>

      {/* ── Expense Categories ───────────────────────────────────── */}
      <View style={{ marginBottom: 16 }}>
        <View style={styles.expHeader}>
          <Text style={styles.cardTitle}>Expenses</Text>
          <TouchableOpacity style={styles.addExpBtn} onPress={() => openAdd()} activeOpacity={0.8}>
            <Text style={styles.addExpBtnIcon}>+</Text>
            <Text style={styles.addExpBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.catCard}>
          {(['essentials', 'lifestyle', 'emis', 'other'] as const).map((cat, idx) => {
            const cfg = CAT_CONFIG[cat]
            const total = catTotals[cat]
            const pct = income > 0 ? Math.round((total / income) * 100) : 0
            const count = catCounts[cat]
            return (
              <TouchableOpacity key={cat} style={[styles.catRow, idx < 3 && styles.catRowBorder]}
                activeOpacity={0.7} onPress={() => setActiveCat(cat)}>
                <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
                  <Text style={{ fontSize: 16 }}>{cfg.emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={styles.catLabel}>{cfg.label}</Text>
                    <Text style={[styles.catAmount, { color: total > 0 ? cfg.color : TXT3 }]}>
                      {total > 0 ? formatINR(total) : '—'}
                    </Text>
                  </View>
                  <View style={styles.catBarTrack}>
                    <View style={[styles.catBarFill, { width: `${Math.min(100, pct * 2)}%`, backgroundColor: cfg.color }]} />
                  </View>
                </View>
                {count > 0 && (
                  <View style={[styles.catCountBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.catCountText, { color: cfg.color }]}>{count}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 13, color: TXT3, marginLeft: 4 }}>›</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* ── Financial Pulse ──────────────────────────────────────── */}
      {monthlySnaps.length > 0 && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View>
              <Text style={styles.cardTitle}>Financial Pulse</Text>
              <Text style={{ fontSize: 11, fontWeight: '500', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' }}>Tap a month to see breakdown</Text>
            </View>
            <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: BG_SEC }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold' }}>
                {monthlySnaps.length} months
              </Text>
            </View>
          </View>

          {/* Cumulative wealth */}
          {(() => {
            const totalSaved = monthlySnaps.reduce((s, m) => s + Math.max(0, m.inc - m.spent), 0)
            return (
              <View style={styles.pulseHero}>
                <Text style={styles.pulseHeroLabel}>CUMULATIVE WEALTH BUILT</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
                  <Text style={styles.pulseHeroAmount}>{formatINR(totalSaved)}</Text>
                </View>
              </View>
            )
          })()}

          {/* Month pills */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {monthlySnaps.map((snap, i) => {
              const isSel = i === pulseIdx
              const saved = snap.inc - snap.spent
              const verdict = saved > 0 && snap.savedPct >= budget.savingsTarget ? GREEN_H : saved > 0 ? BLUE : ORANGE_H
              return (
                <TouchableOpacity key={snap.short} style={[styles.pulseMonthPill, isSel && { backgroundColor: verdict }]}
                  activeOpacity={0.7} onPress={() => setPulseMonth(i - (monthlySnaps.length - 1))}>
                  <Text style={[styles.pulseMonthText, isSel && { color: '#fff' }]}>{snap.short}</Text>
                  <Text style={[styles.pulseMonthSub, isSel && { color: 'rgba(255,255,255,0.7)' }]}>
                    {snap.savedPct}%
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Selected month breakdown */}
          {monthlySnaps[pulseIdx] && (() => {
            const snap = monthlySnaps[pulseIdx]
            const saved = snap.inc - snap.spent
            const savedPct = snap.savedPct
            const meetsTarget = savedPct >= budget.savingsTarget
            const verdictLabel = meetsTarget ? 'On Track' : 'Over Budget'
            const verdictColor = meetsTarget ? GREEN_H : ORANGE_H
            const verdictBg = meetsTarget ? GREEN_L : ORANGE_L

            return (
              <View>
                {/* Verdict */}
                <View style={[styles.verdictCard, { backgroundColor: verdictColor + '09', borderColor: verdictColor + '22' }]}>
                  <View style={[styles.verdictBadge, { backgroundColor: verdictBg }]}>
                    <Text style={[styles.verdictBadgeText, { color: verdictColor }]}>{verdictLabel}</Text>
                  </View>
                  <Text style={styles.verdictHeadline}>
                    {meetsTarget
                      ? `Wealth allocation at ${savedPct}% — above the ${budget.savingsTarget}% floor`
                      : `Wealth allocation at ${savedPct}% — below the ${budget.savingsTarget}% target`}
                  </Text>
                </View>

                {/* Budget lines */}
                <View style={{ backgroundColor: BG_SEC, borderRadius: 16, padding: 14, marginTop: 8 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, fontFamily: 'Manrope_700Bold' }}>
                    {snap.short} Budget Lines · Income {formatINR(snap.inc)}
                  </Text>
                  {[
                    { name: 'Committed Costs', pct: snap.needsPct, target: budget.needsTarget, good: snap.needsPct <= budget.needsTarget, color: snap.needsPct <= budget.needsTarget ? BLUE : RED },
                    { name: 'Discretionary', pct: snap.wantsPct, target: budget.wantsTarget, good: snap.wantsPct <= budget.wantsTarget, color: snap.wantsPct <= budget.wantsTarget ? ORANGE_H : RED },
                    { name: 'Wealth', pct: savedPct, target: budget.savingsTarget, good: meetsTarget, color: meetsTarget ? GREEN_H : ORANGE_H },
                  ].map((row, ri) => (
                    <View key={row.name} style={{ marginBottom: ri < 2 ? 14 : 0 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: row.color, fontFamily: 'Manrope_700Bold' }}>{row.name}</Text>
                        <View style={[styles.bpPill, { backgroundColor: row.color + '15' }]}>
                          <Text style={[styles.bpPillText, { color: row.color }]}>
                            {row.pct}% {row.good ? '✓' : '↓'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${Math.min(100, row.pct)}%`, backgroundColor: row.color }]} />
                        <View style={[styles.barMarker, { left: `${Math.min(97, row.target)}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )
          })()}

          {/* Pattern Insight */}
          {monthlySnaps.length >= 2 && (() => {
            const avgSaved = monthlySnaps.reduce((s, m) => s + m.savedPct, 0) / monthlySnaps.length
            const trend = monthlySnaps.length >= 2 ? monthlySnaps[monthlySnaps.length - 1].savedPct - monthlySnaps[0].savedPct : 0
            const patternMsg = trend > 5
              ? `Your savings rate improved by ${Math.abs(trend)}% over ${monthlySnaps.length} months. Keep this momentum going!`
              : trend < -5
              ? `Your savings rate dropped ${Math.abs(trend)}% over ${monthlySnaps.length} months. Review lifestyle spending to get back on track.`
              : `Avg savings rate: ${Math.round(avgSaved)}% over ${monthlySnaps.length} months. ${avgSaved >= 20 ? 'Consistent — great discipline!' : 'Push toward 20%+ for faster wealth building.'}`
            return (
              <View style={styles.patternBox}>
                <Text style={styles.patternHeader}>4-MONTH PATTERN</Text>
                <Text style={styles.patternMsg}>{patternMsg}</Text>
              </View>
            )
          })()}
        </View>
      )}

      {/* ── AI Insight Teaser ────────────────────────────────────── */}
      <TouchableOpacity style={styles.insightCard} onPress={onNavigateCoach} activeOpacity={0.85}>
        <Text style={{ fontSize: 16 }}>✨</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.insightLabel}>AI Coach · Tap for insights</Text>
          <Text style={styles.insightText} numberOfLines={1}>
            {savingsPct >= 20
              ? `Great! You're saving ${savingsPct}% — keep this up to hit your goals faster.`
              : `Your savings rate is ${savingsPct}%. Let's find ways to reach 20%.`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.insightSeeAll}>See all</Text>
          <Text style={{ fontSize: 12, color: TEAL }}>›</Text>
        </View>
      </TouchableOpacity>

      {/* ── Category Sheet Modal ─────────────────────────────────── */}
      <Modal visible={activeCat !== null} transparent animationType="slide" onRequestClose={() => setActiveCat(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setActiveCat(null)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            {activeCat && (() => {
              const cfg = CAT_CONFIG[activeCat]
              return (
                <>
                  <View style={styles.sheetHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
                        <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{cfg.label}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' }}>
                          {activeCatItems.length} item{activeCatItems.length !== 1 ? 's' : ''} · {cfg.hint}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: cfg.color, fontFamily: 'Manrope_700Bold' }}>
                        {formatINR(catTotals[activeCat])}
                      </Text>
                      <TouchableOpacity onPress={() => setActiveCat(null)}>
                        <Text style={{ fontSize: 16, color: TXT3, marginTop: 2 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView style={{ maxHeight: 300, borderTopWidth: 1, borderTopColor: BG_SEC }}>
                    {activeCatItems.length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Text style={{ fontSize: 28 }}>🧾</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: TXT3, marginTop: 8, fontFamily: 'Manrope_400Regular' }}>
                          No {cfg.label.toLowerCase()} yet
                        </Text>
                      </View>
                    ) : (
                      activeCatItems.map((item, idx) => (
                        <TouchableOpacity key={item.id} style={[styles.sheetItemRow, idx < activeCatItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: BG_SEC }]}
                          activeOpacity={0.7} onPress={() => { setActiveCat(null); setTimeout(() => openEdit(item), 300) }}>
                          <View style={[styles.sheetItemIcon, { backgroundColor: cfg.bg }]}>
                            <Text style={{ fontSize: 16 }}>
                              {item.category === 'Food & Dining' ? '🍽️' : item.category === 'Transport' ? '🚗' : cfg.emoji}
                            </Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{item.note || item.category}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' }}>
                              {new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{formatINR(item.amount)}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>

                  <TouchableOpacity style={[styles.sheetAddBtn, { backgroundColor: cfg.color }]}
                    activeOpacity={0.8} onPress={() => { setActiveCat(null); setTimeout(() => openAdd(activeCat), 300) }}>
                    <Text style={styles.sheetAddBtnText}>+ Add {cfg.label} Expense</Text>
                  </TouchableOpacity>
                </>
              )
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Expense Add/Edit Sheet ───────────────────────────────── */}
      <Modal visible={showExpSheet} transparent animationType="slide" onRequestClose={() => setShowExpSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowExpSheet(false)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>
                {editItem ? 'Edit Expense' : 'Add Expense'}
              </Text>
              <TouchableOpacity onPress={() => setShowExpSheet(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Emoji + Description */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setShowEmojiPicker(p => !p)}
                style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24 }}>{expEmoji}</Text>
              </TouchableOpacity>
              <TextInput value={expDesc} onChangeText={setExpDesc} placeholder="What did you spend on?"
                placeholderTextColor={TXT3}
                style={{ flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, fontSize: 14, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold' }} />
            </View>

            {/* Emoji Picker */}
            {showEmojiPicker && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 16, backgroundColor: BG_SEC, marginBottom: 12 }}>
                {EMOJI_PRESETS.map(e => (
                  <TouchableOpacity key={e} onPress={() => { setExpEmoji(e); setShowEmojiPicker(false) }}
                    style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: expEmoji === e ? BLUE_L : 'transparent' }}>
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Amount */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
              <TextInput value={expAmount} onChangeText={setExpAmount} placeholder="0" placeholderTextColor={TXT3}
                keyboardType="numeric"
                style={{ flex: 1, fontSize: 24, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }} />
            </View>

            {/* Date */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, marginBottom: 12 }}>
              <Text style={{ fontSize: 14, color: TXT3 }}>📅</Text>
              <TextInput value={expDate} onChangeText={setExpDate} placeholder="MM DD (e.g. 04 15)"
                placeholderTextColor={TXT3}
                style={{ flex: 1, fontSize: 14, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold' }} />
            </View>

            {/* Category chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['essentials', 'lifestyle', 'emis', 'other'] as const).map(cat => {
                const cfg = CAT_CONFIG[cat]
                const sel = expCat === cat
                return (
                  <TouchableOpacity key={cat} onPress={() => setExpCat(cat)}
                    style={{ flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', backgroundColor: sel ? cfg.bg : BG_SEC, borderWidth: 1.5, borderColor: sel ? cfg.color + '30' : 'transparent' }}>
                    <Text style={{ fontSize: 14 }}>{cfg.emoji}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: sel ? cfg.color : TXT3, textTransform: 'uppercase', letterSpacing: 0.2, marginTop: 2, fontFamily: 'Manrope_700Bold' }}>{cfg.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {editItem && (
                <TouchableOpacity style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: RED }}
                  onPress={deleteExpense}>
                  <Text style={{ fontSize: 15, color: '#fff' }}>🗑</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: (expDesc.trim() && Number(expAmount) > 0) ? BLUE : BG_SEC }}
                onPress={saveExpense} disabled={!expDesc.trim() || Number(expAmount) <= 0}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: (expDesc.trim() && Number(expAmount) > 0) ? '#fff' : TXT3, fontFamily: 'Manrope_700Bold' }}>
                  {editItem ? 'Save Changes' : 'Add Expense'}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Income Override Sheet ─────────────────────────────── */}
      <Modal visible={showIncomeSheet} transparent animationType="slide" onRequestClose={() => setShowIncomeSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowIncomeSheet(false)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>
                Update This Month's Income
              </Text>
              <TouchableOpacity onPress={() => setShowIncomeSheet(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3, marginBottom: 12, lineHeight: 18 }}>
              Base income from profile: {formatINR(baseIncome)}. Add bonus, freelance, or other income for this month.
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG_SEC, marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
              <TextInput value={incomeInput} onChangeText={setIncomeInput} placeholder="0" placeholderTextColor={TXT3}
                keyboardType="numeric"
                style={{ flex: 1, fontSize: 24, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }} />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              {incomeOverride !== null && (
                <TouchableOpacity style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC }}
                  onPress={() => { setIncomeOverride(null); setShowIncomeSheet(false) }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold' }}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: Number(incomeInput) > 0 ? BLUE : BG_SEC }}
                onPress={() => { if (Number(incomeInput) > 0) { setIncomeOverride(Number(incomeInput)); setShowIncomeSheet(false) } }}
                disabled={!(Number(incomeInput) > 0)}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Number(incomeInput) > 0 ? '#fff' : TXT3, fontFamily: 'Manrope_700Bold' }}>
                  Update Income
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

  // App Bar
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { fontSize: 15, fontWeight: '700', color: '#1E293B', letterSpacing: 1.2, fontFamily: 'Manrope_700Bold' },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE_L, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 12, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE_L, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  reportBtnText: { fontSize: 11, fontFamily: 'Manrope_700Bold', color: BLUE },

  // Hero Card
  heroCard: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 20, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A', shadowColor: BLUE, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 40, elevation: 12 },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroMonth: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  heroGreeting: { fontSize: 22, fontWeight: '800', color: '#ffffff', letterSpacing: -0.4, lineHeight: 28, fontFamily: 'Manrope_700Bold' },
  heroSub: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.55)', marginTop: 4, marginBottom: 14, fontFamily: 'Manrope_400Regular' },
  heroStats: { flexDirection: 'row', gap: 8 },
  heroStatBox: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroStatLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  heroStatValue: { fontSize: 15, fontWeight: '800', color: '#ffffff', lineHeight: 18, fontFamily: 'Manrope_700Bold' },
  heroStatSub: { fontSize: 9, fontWeight: '600', marginTop: 1, fontFamily: 'Manrope_400Regular' },

  // Card
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // Blueprint
  bpHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  bpRationale: { fontSize: 11, fontWeight: '500', color: TEAL, marginTop: 2, lineHeight: 16, fontFamily: 'Manrope_400Regular' },
  bpBadge: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BLUE },
  bpBadgeText: { fontSize: 14, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, fontFamily: 'Manrope_700Bold' },
  bpSub: { fontSize: 9, fontWeight: '700', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 16, fontFamily: 'Manrope_700Bold' },
  bpRow: { marginBottom: 16 },
  bpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 },
  bpLabel: { fontSize: 12, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  bpDesc: { fontSize: 10, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' },
  bpTip: { fontSize: 9, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_400Regular' },
  bpPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  bpPillText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: BG_SEC, position: 'relative', overflow: 'visible' },
  barFill: { height: 7, borderRadius: 4, position: 'absolute', top: 0, left: 0 },
  barMarker: { position: 'absolute', top: -3, width: 2, height: 13, backgroundColor: TXT2, opacity: 0.35, borderRadius: 1 },
  bpLegend: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
  legendItem: { flex: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: BG_SEC, alignItems: 'center' },
  legendLabel: { fontSize: 9, fontWeight: '800', color: TXT1, marginTop: 2, fontFamily: 'Manrope_700Bold' },
  legendSub: { fontSize: 8, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' },
  bpFootnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: TEAL_L },
  bpFootnoteText: { flex: 1, fontSize: 10, fontWeight: '600', color: '#0F766E', lineHeight: 16, fontFamily: 'Manrope_400Regular' },

  // Expense Categories
  expHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addExpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 },
  addExpBtnIcon: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  addExpBtnText: { fontSize: 11, fontWeight: '800', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
  catCard: { backgroundColor: '#ffffff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: BG_SEC },
  catIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 13, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  catAmount: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  catBarTrack: { height: 3, borderRadius: 2, backgroundColor: BG_SEC, overflow: 'hidden' },
  catBarFill: { height: 3, borderRadius: 2, opacity: 0.7 },
  catCountBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  catCountText: { fontSize: 10, fontWeight: '800', fontFamily: 'Manrope_700Bold' },

  // AI Insight Teaser
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 20, padding: 16, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: TEAL, borderWidth: 1, borderColor: TEAL + '20', shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  insightLabel: { fontSize: 10, fontWeight: '800', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  insightText: { fontSize: 13, fontWeight: '700', color: TXT1, lineHeight: 18, fontFamily: 'Manrope_700Bold' },
  insightSeeAll: { fontSize: 10, fontWeight: '700', color: TEAL, fontFamily: 'Manrope_700Bold' },

  // Financial Pulse
  pulseHero: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, backgroundColor: '#14532D' },
  pulseHeroLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Manrope_700Bold' },
  pulseHeroAmount: { fontSize: 26, fontWeight: '800', color: '#ffffff', letterSpacing: -0.8, fontFamily: 'Manrope_700Bold' },
  pulseMonthPill: { flex: 1, borderRadius: 16, paddingVertical: 8, alignItems: 'center', backgroundColor: BG_SEC },
  pulseMonthText: { fontSize: 11, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },
  pulseMonthSub: { fontSize: 8, fontWeight: '700', color: TXT3, marginTop: 1, fontFamily: 'Manrope_700Bold' },
  verdictCard: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  verdictBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  verdictBadgeText: { fontSize: 10, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  verdictHeadline: { fontSize: 12, fontWeight: '700', color: TXT1, lineHeight: 18, fontFamily: 'Manrope_700Bold' },

  // Pattern Insight
  patternBox: { borderRadius: 12, padding: 12, marginTop: 12, backgroundColor: BLUE_L, borderWidth: 1, borderColor: BLUE + '20' },
  patternHeader: { fontSize: 9, fontWeight: '800', color: BLUE, letterSpacing: 0.8, marginBottom: 4, fontFamily: 'Manrope_700Bold' },
  patternMsg: { fontSize: 11, fontWeight: '600', color: TXT1, lineHeight: 16, fontFamily: 'Manrope_400Regular' },

  // Sheet modals
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.65)', justifyContent: 'flex-end' },
  sheetContainer: { backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  sheetItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  sheetItemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetAddBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  sheetAddBtnText: { fontSize: 14, fontWeight: '800', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
})
