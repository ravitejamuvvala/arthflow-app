import AsyncStorage from '@react-native-async-storage/async-storage'
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
import { Goal, Profile, Transaction } from '../types'
import { fmtInr, getBudgetRule, getMonthlySnapshots, mapCategory } from '../utils/calculations'
import { runEngine } from '../utils/engine'

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

export default function ThisMonthScreen({ onNavigateCoach, onNavigatePlan, refreshTrigger }: { onNavigateCoach?: () => void; onNavigatePlan?: () => void; refreshTrigger?: number }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userName, setUserName] = useState('')
  const [userAge, setUserAge] = useState(28)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assets, setAssets] = useState<any>(null)
  const [engineResult, setEngineResult] = useState<any>(null)

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
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fourMonthsAgo = new Date()
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3)
    fourMonthsAgo.setDate(1)
    fourMonthsAgo.setHours(0, 0, 0, 0)

    const [profileRes, txRes, goalRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('transactions').select('*').gte('date', fourMonthsAgo.toISOString()).order('date', { ascending: false }),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    const p = profileRes.data
    const txs = txRes.data ?? []
    const g = goalRes.data ?? []

    setProfile(p)
    setTransactions(txs)
    setGoals(g)
    setUserName(p?.full_name || user.email?.split('@')[0] || 'there')
    setUserAge(p?.age ?? 28)

    // Load assets from AsyncStorage
    let assetData = null
    try {
      const raw = await AsyncStorage.getItem('@arthflow_assets')
      if (raw) assetData = JSON.parse(raw)
    } catch {}
    setAssets(assetData)

    // Run engine
    const baseIncome = incomeOverride ?? p?.monthly_income ?? 0
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const thisMonthTx = txs.filter(t => new Date(t.date) >= startOfMonth)

    const result = runEngine({
      income: baseIncome,
      transactions: thisMonthTx,
      goals: g,
      assets: assetData,
      age: p?.age ?? 28,
      profile: p,
    })
    setEngineResult(result)
    setLoading(false)
  }, [incomeOverride])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (refreshTrigger && refreshTrigger > 0) fetchData() }, [refreshTrigger])
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  const firstName = userName.split(' ')[0]
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // ─── Expense CRUD ──────────────────────────────────────────────
  const openAdd = (cat?: string) => {
    setEditItem(null); setExpDesc(''); setExpAmount('')
    setExpCat(cat || 'essentials'); setExpEmoji('🛒')
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
    setShowExpSheet(false); fetchData()
  }

  const deleteExpense = async () => {
    if (!editItem) return
    await supabase.from('transactions').delete().eq('id', editItem.id)
    setShowExpSheet(false); fetchData()
  }

  if (loading || !engineResult) {
    return <View style={s.center}><ActivityIndicator color={BLUE} size="large" /></View>
  }

  const { flow, status, topProblem, action, insights } = engineResult
  const budget = getBudgetRule(userAge)
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const thisMonthTx = transactions.filter(t => new Date(t.date) >= startOfMonth)
  const thisMonthExpenses = thisMonthTx.filter(t => t.type === 'expense')
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

      {/* ── Problem Card (only if there IS a problem) ────── */}
      {topProblem && (
        <View style={s.problemCard}>
          <View style={s.problemHeader}>
            <Text style={{ fontSize: 16 }}>⚡</Text>
            <Text style={s.problemTitle}>{topProblem}</Text>
          </View>
          <Text style={s.problemMessage}>{insights[0]?.message}</Text>
          {action && (
            <TouchableOpacity style={s.ctaBtn} onPress={onNavigateCoach} activeOpacity={0.85}>
              <Text style={s.ctaBtnText}>{action}</Text>
              <Text style={s.ctaArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Blueprint (compact) ──────────────────────────── */}
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={s.cardTitle}>Money Blueprint</Text>
          <View style={s.bpBadge}><Text style={s.bpBadgeText}>{budget.label}</Text></View>
        </View>
        {[
          { label: 'Committed', emoji: '🏦', actual: flow.needsPct, target: budget.needsTarget, amount: flow.catTotals.essentials + flow.catTotals.emis, good: flow.needsPct <= budget.needsTarget, okColor: BLUE, badColor: RED },
          { label: 'Lifestyle', emoji: '🌟', actual: flow.wantsPct, target: budget.wantsTarget, amount: flow.catTotals.lifestyle, good: flow.wantsPct <= budget.wantsTarget, okColor: ORANGE_H, badColor: RED },
          { label: 'Wealth', emoji: '📈', actual: flow.savingsPct, target: budget.savingsTarget, amount: Math.max(0, flow.savings), good: flow.savingsPct >= budget.savingsTarget, okColor: GREEN_H, badColor: ORANGE_H },
        ].map(row => {
          const barColor = row.good ? row.okColor : row.badColor
          return (
            <View key={row.label} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>{row.emoji}</Text>
                  <Text style={s.bpLabel}>{row.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3 }}>{fmtInr(row.amount)}</Text>
                  <View style={[s.bpPill, { backgroundColor: barColor + '18' }]}>
                    <Text style={[s.bpPillText, { color: barColor }]}>{row.actual}%{row.good ? ' ✓' : ''}</Text>
                  </View>
                </View>
              </View>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.min(100, row.actual)}%`, backgroundColor: barColor }]} />
                <View style={[s.barMarker, { left: `${Math.min(97, row.target)}%` }]} />
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Object.entries(CAT_CONFIG).map(([key, cfg]) => {
            const total = flow.catTotals[key] || 0
            return (
              <TouchableOpacity key={key} style={[s.catChip, { borderColor: cfg.color + '30', backgroundColor: cfg.bg }]} onPress={() => openAdd(key)} activeOpacity={0.7}>
                <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                <Text style={[s.catAmount, { color: cfg.color }]}>{fmtInr(total)}</Text>
                <Text style={s.catLabel}>{cfg.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Recent transactions */}
        {thisMonthExpenses.length > 0 && (
          <View style={{ marginTop: 14, maxHeight: 220 }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {thisMonthExpenses.map(t => (
                <TouchableOpacity key={t.id} style={s.txRow} onPress={() => openEdit(t)} activeOpacity={0.7}>
                  <View style={s.txLeft}>
                    <Text style={s.txNote}>{t.note || t.category}</Text>
                    <Text style={s.txDate}>{new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={s.txAmount}>-{fmtInr(t.amount)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {thisMonthExpenses.length > 4 && (
              <Text style={{ fontSize: 10, color: TXT3, textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_400Regular' }}>Scroll to see all {thisMonthExpenses.length} expenses</Text>
            )}
          </View>
        )}
      </View>

      {/* ── Trend (last 3 months) ────────────────────────── */}
      {snapshots.length > 1 && (
        <View style={s.card}>
          <Text style={[s.cardTitle, { marginBottom: 12 }]}>Monthly Trend</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {snapshots.map((snap, i) => (
              <View key={i} style={[s.trendBox, i === snapshots.length - 1 && { borderColor: BLUE + '30', backgroundColor: BLUE_L }]}>
                <Text style={s.trendMonth}>{snap.short}</Text>
                <Text style={[s.trendPct, { color: snap.savedPct >= 20 ? GREEN_H : ORANGE_H }]}>{snap.savedPct}%</Text>
                <Text style={s.trendLabel}>saved</Text>
                <View style={s.trendBarTrack}>
                  <View style={[s.trendBarFill, { height: `${Math.min(100, Math.max(5, snap.savedPct))}%`, backgroundColor: snap.savedPct >= 20 ? GREEN : ORANGE }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

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
  statusMessage: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, fontFamily: 'Manrope_400Regular' },

  flowRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  flowBox: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  flowLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  flowValue: { fontSize: 16, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Problem card
  problemCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: ORANGE + '30', borderLeftWidth: 4, borderLeftColor: ORANGE },
  problemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  problemTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold', flex: 1 },
  problemMessage: { fontSize: 14, color: TXT2, lineHeight: 21, fontFamily: 'Manrope_400Regular', marginBottom: 14 },
  ctaBtn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ctaBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
  ctaArrow: { fontSize: 16, color: '#fff', fontWeight: '800' },

  // Card
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER },

  cardTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // Blueprint
  bpBadge: { backgroundColor: BLUE_L, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  bpBadgeText: { fontSize: 12, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },
  bpLabel: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  bpPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bpPillText: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: BG_SEC, position: 'relative' },
  barFill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
  barMarker: { position: 'absolute', top: -3, width: 2, height: 12, backgroundColor: '#9CA3AF', borderRadius: 1 },

  // Category chips
  catChip: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1 },
  catAmount: { fontSize: 15, fontWeight: '800', marginTop: 4, fontFamily: 'Manrope_700Bold' },
  catLabel: { fontSize: 10, fontWeight: '700', color: TXT3, marginTop: 2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' },

  // Transactions
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: BG_SEC },
  txLeft: { flex: 1 },
  txNote: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  txDate: { fontSize: 12, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  txAmount: { fontSize: 15, fontWeight: '800', color: RED, fontFamily: 'Manrope_700Bold' },

  // Trend
  trendBox: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  trendMonth: { fontSize: 12, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },
  trendPct: { fontSize: 20, fontWeight: '800', marginTop: 4, fontFamily: 'Manrope_700Bold' },
  trendLabel: { fontSize: 10, color: TXT3, fontFamily: 'Manrope_400Regular' },
  trendBarTrack: { width: 6, height: 40, borderRadius: 3, backgroundColor: BG_SEC, marginTop: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  trendBarFill: { width: 6, borderRadius: 3 },

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
  catPickText: { fontSize: 10, fontWeight: '800', color: TXT3, textTransform: 'uppercase', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  deleteBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: RED },
  saveBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: BLUE },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
})
