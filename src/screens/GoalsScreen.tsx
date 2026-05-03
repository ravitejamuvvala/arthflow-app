import React, { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    LayoutAnimation,
    Modal,
    PanResponder,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import { useAppData } from '../lib/DataContext'
import { supabase } from '../lib/supabase'
import { Goal } from '../types'
import { commaFormat, fmtInr, stripCommas } from '../utils/calculations'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE     = '#1E3A8A'
const BLUE_L   = '#DBEAFE'
const GREEN    = '#22C55E'
const GREEN_H  = '#16A34A'
const GREEN_L  = '#DCFCE7'
const ORANGE   = '#F59E0B'
const ORANGE_H = '#D97706'
const ORANGE_L = '#FEF3C7'
const RED      = '#EF4444'
const TEAL     = '#14B8A6'
const TEAL_L   = '#CCFBF1'
const TXT1     = '#111827'
const TXT2     = '#6B7280'
const TXT3     = '#9CA3AF'
const BORDER   = '#E5E7EB'
const BG_SEC   = '#F1F5F9'

const GOAL_EMOJIS = ['🏠','✈️','🎓','🚗','💍','🛡️','🌅','💻','📱','🏋️','🏖️','🌏','👶','🎸','⛵','🏡','💰','🎯','📈','🌱']

// ─── Preset Goals ───────────────────────────────────────────────────────
const PRESET_GOALS = [
  { name: 'Child Education',  emoji: '🎓', defaultYears: 10, defaultTarget: 2500000 },
  { name: 'Child Marriage',   emoji: '💍', defaultYears: 15, defaultTarget: 3000000 },
  { name: 'Buy a Car',        emoji: '🚗', defaultYears: 3,  defaultTarget: 1000000 },
  { name: "Mom's Corpus",     emoji: '🙏', defaultYears: 5,  defaultTarget: 2000000 },
  { name: 'Buy a House',      emoji: '🏠', defaultYears: 10, defaultTarget: 5000000 },
  { name: 'Emergency Fund',   emoji: '🛡️', defaultYears: 2,  defaultTarget: 500000  },
  { name: 'Retirement Fund',  emoji: '🌅', defaultYears: 20, defaultTarget: 10000000 },
] as const

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: RED,    bg: '#FEE2E2' },
  medium: { label: 'Medium', color: ORANGE, bg: ORANGE_L  },
  low:    { label: 'Low',    color: GREEN,  bg: GREEN_L   },
} as const

const goalEmoji = (name: string) => {
  const n = name.toLowerCase()
  if (n.includes('house') || n.includes('home')) return '🏠'
  if (n.includes('emergency') || n.includes('safety')) return '🛡️'
  if (n.includes('travel') || n.includes('trip') || n.includes('europe')) return '✈️'
  if (n.includes('retire')) return '🌅'
  if (n.includes('car')) return '🚗'
  if (n.includes('education') || n.includes('study')) return '🎓'
  if (n.includes('wedding') || n.includes('marriage')) return '💍'
  if (n.includes('invest') || n.includes('fund')) return '💰'
  return '🎯'
}

// ─── Exact INR format (₹1,42,000 not ₹1.4L) ───────────────────────────
function formatINRExact(n: number): string {
  if (n <= 0) return '₹0'
  const s = Math.round(n).toString()
  if (s.length <= 3) return `₹${s}`
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return `₹${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function GoalsScreen() {
  const { goals, engineResult, loading: dataLoading, refreshData } = useAppData()
  const [refreshing, setRefreshing] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)

  // Form state
  const [fEmoji, setFEmoji] = useState('🎯')
  const [fName, setFName] = useState('')
  const [fTarget, setFTarget] = useState('')
  const [fSaved, setFSaved] = useState('')
  const [fYear, setFYear] = useState(new Date().getFullYear() + 5)
  const [fMonthly, setFMonthly] = useState('')
  const [fPriority, setFPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [fYearText, setFYearText] = useState(String(new Date().getFullYear() + 5))
  const yearInputFocused = useRef(false)

  // Sync year text when slider changes year (but not while user is typing)
  useEffect(() => { if (!yearInputFocused.current) setFYearText(String(fYear)) }, [fYear])

  const onRefresh = async () => { setRefreshing(true); await refreshData(); setRefreshing(false) }

  const openAdd = () => {
    setShowPresets(true)
  }

  const selectPreset = (preset: typeof PRESET_GOALS[number]) => {
    // Check if goal with this name already exists
    const existing = goals.find(g => g.name.toLowerCase() === preset.name.toLowerCase())
    if (existing) {
      setShowPresets(false)
      Alert.alert(
        'Goal already exists',
        `"${preset.name}" is already in your goals. Would you like to modify it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Modify', onPress: () => openEdit(existing) },
        ]
      )
      return
    }
    setShowPresets(false)
    setEditGoal(null)
    setFEmoji(preset.emoji); setFName(preset.name)
    setFTarget(commaFormat(String(preset.defaultTarget))); setFSaved('0')
    const yr = new Date().getFullYear() + preset.defaultYears
    setFYear(yr); setFYearText(String(yr))
    setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const openCustomGoal = () => {
    setShowPresets(false)
    setEditGoal(null)
    setFEmoji('🎯'); setFName(''); setFTarget(''); setFSaved('0')
    const yr = new Date().getFullYear() + 5
    setFYear(yr); setFYearText(String(yr))
    setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const openEdit = (g: Goal) => {
    setEditGoal(g)
    setFEmoji(goalEmoji(g.name)); setFName(g.name)
    setFTarget(commaFormat(String(g.target_amount))); setFSaved(String(g.saved_amount))
    const yr = g.target_date ? new Date(g.target_date).getFullYear() : new Date().getFullYear() + 5
    setFYear(yr); setFYearText(String(yr))
    setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const saveGoal = async () => {
    if (!fName.trim()) { Alert.alert('Enter goal name'); return }
    if (!fTarget || Number(stripCommas(fTarget)) <= 0) { Alert.alert('Enter valid target amount'); return }

    const { data: { session: sess } } = await supabase.auth.getSession()
    const user = sess?.user
    if (!user) return

    const payload = {
      user_id: user.id,
      name: fName.trim(),
      target_amount: Number(stripCommas(fTarget)),
      saved_amount: Number(fSaved) || 0,
      target_date: `${fYear}-12-31`,
      priority: fPriority,
    }

    const { error } = editGoal
      ? await supabase.from('goals').update(payload).eq('id', editGoal.id)
      : await supabase.from('goals').insert(payload)
    if (error) { Alert.alert('Error', 'Could not save goal. Please try again.'); return }
    setShowSheet(false)
    refreshData()
  }

  const deleteGoal = async () => {
    if (!editGoal) return
    Alert.alert('Delete goal?', `Are you sure you want to delete "${editGoal.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('goals').delete().eq('id', editGoal.id)
        if (error) { Alert.alert('Error', 'Could not delete goal.'); return }
        setShowSheet(false)
        refreshData()
      }},
    ])
  }

  // ─── Computed (from engine) ─────────────────────────────────────
  const configuredGoals = goals.filter(g => g.target_amount > 0)
  const totalTarget = configuredGoals.reduce((s, g) => s + g.target_amount, 0)
  const needsSetupCount = goals.length - configuredGoals.length
  const thisYear    = new Date().getFullYear()

  // Goal horizon plan from engine — single source of truth
  const plan = engineResult?.goalHorizonPlan
  const goalProjections = plan?.goalProjections ?? []
  const totalMonthlySIP = plan?.totalSipNeeded ?? 0
  const nearestGoal = plan?.nearestGoal ?? null
  const liquidAnalysis = engineResult?.liquidFundAnalysis
  const stretchGoals = plan?.stretchGoals ?? []
  const sipCapped = plan?.sipCapped ?? false

  // Year slider drag
  const { width: SCREEN_W } = Dimensions.get('window')
  const sliderRef = useRef<View>(null)
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateYearFromTouch(e.nativeEvent.pageX),
      onPanResponderMove: (e) => updateYearFromTouch(e.nativeEvent.pageX),
    })
  ).current

  const updateYearFromTouch = (pageX: number) => {
    sliderRef.current?.measureInWindow((x, _y, width) => {
      if (width <= 0) return
      const pct = Math.max(0, Math.min(1, (pageX - x) / width))
      const yr = Math.round(thisYear + pct * 40)
      setFYear(Math.max(thisYear, Math.min(thisYear + 40, yr)))
    })
  }

  if (dataLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} size="large" /></View>
  }

  return (
    <View style={styles.container}>
      {/* ── App Bar (fixed) ────────────────────────────────────── */}
      <View style={styles.appBar}>
        <View style={styles.brandRow}>
          <ArthFlowLogo size={28} />
          <Text style={styles.brandText}>ARTHFLOW</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ New Goal</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}>

        {/* ── Summary Banner ─────────────────────────────────────── */}
        {goals.length > 0 && totalTarget > 0 && (
          <View style={styles.heroCard}>
            <View style={styles.heroGlow} />
            <View style={styles.heroWatermark} pointerEvents="none">
              <ArthFlowLogo size={120} />
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroLabel}>{configuredGoals.length} GOAL{configuredGoals.length !== 1 ? 'S' : ''} PLANNED</Text>
              <Text style={styles.heroAmount}>{fmtInr(totalTarget)}</Text>
              <Text style={styles.heroSub}>total target</Text>

              {/* Key stats row */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                {totalMonthlySIP > 0 && (
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Manrope_400Regular' }}>Total SIP needed</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold', marginTop: 2 }}>{formatINRExact(totalMonthlySIP)}/mo</Text>
                  </View>
                )}
                {nearestGoal && (
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 10 }}>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Manrope_400Regular' }}>Nearest goal</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold', marginTop: 2 }} numberOfLines={1}>{nearestGoal.name}</Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Manrope_400Regular', marginTop: 1 }}>{nearestGoal.yearsLeft}y · {fmtInr(nearestGoal.targetAmount)}</Text>
                  </View>
                )}
              </View>

              {needsSetupCount > 0 && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 8 }}>
                  {needsSetupCount} goal{needsSetupCount !== 1 ? 's' : ''} need setup ↓
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Emergency Fund Status ──────────────────────────────── */}
        {liquidAnalysis && liquidAnalysis.emergencyTarget > 0 && (
          <View style={[styles.realityCard, { marginBottom: 14 }]}>
            <View style={styles.realityHeader}>
              <Text style={styles.realityIcon}>{liquidAnalysis.emergencyStatus === 'covered' ? '✅' : liquidAnalysis.emergencyStatus === 'building' ? '🔶' : '🔴'}</Text>
              <Text style={styles.realityTitle}>EMERGENCY FUND</Text>
              <View style={[styles.bucketBadge, {
                backgroundColor: liquidAnalysis.emergencyStatus === 'covered' ? GREEN_L : liquidAnalysis.emergencyStatus === 'building' ? ORANGE_L : '#FEE2E2'
              }]}>
                <Text style={[styles.bucketBadgeText, {
                  color: liquidAnalysis.emergencyStatus === 'covered' ? GREEN_H : liquidAnalysis.emergencyStatus === 'building' ? ORANGE_H : RED
                }]}>
                  {liquidAnalysis.emergencyMonths >= 6 ? `${liquidAnalysis.emergencyMonths} months` : `${liquidAnalysis.emergencyMonths} of 6 months`}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.realityBarWrap}>
              <View style={styles.realityBarTrack}>
                <View style={[styles.realityBarFill, {
                  width: `${Math.min(100, Math.round((liquidAnalysis.liquidCash / Math.max(1, liquidAnalysis.emergencyTarget)) * 100))}%`,
                  backgroundColor: liquidAnalysis.emergencyStatus === 'covered' ? GREEN : liquidAnalysis.emergencyStatus === 'building' ? ORANGE : RED
                }]} />
              </View>
              <Text style={[styles.realityBarLabel, { color: TXT2 }]}>{formatINRExact(liquidAnalysis.liquidCash)} / {formatINRExact(liquidAnalysis.emergencyTarget)}</Text>
            </View>

            {/* Liquid allocation breakdown */}
            {liquidAnalysis.excessLiquid > 0 && (
              <View style={{ marginTop: 8, padding: 10, backgroundColor: GREEN_L, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: GREEN_H, fontFamily: 'Manrope_700Bold' }}>
                  {formatINRExact(liquidAnalysis.excessLiquid)} excess liquid
                  {liquidAnalysis.liquidUsedForGoals > 0 ? ` → ${formatINRExact(liquidAnalysis.liquidUsedForGoals)} allocated to short-term goals` : ' → available for goals'}
                </Text>
              </View>
            )}
            {liquidAnalysis.emergencyGap > 0 && (
              <View style={{ marginTop: 8, padding: 10, backgroundColor: '#FEF3C7', borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: ORANGE_H, fontFamily: 'Manrope_400Regular' }}>
                  {formatINRExact(liquidAnalysis.emergencyGap)} more needed · ~{formatINRExact(Math.ceil(liquidAnalysis.emergencyGap / 6))}/mo for 6 months
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Plan vs Reality Card ───────────────────────────────── */}
        {configuredGoals.length > 0 && totalMonthlySIP > 0 && (() => {
          const monthlySavings = plan?.monthlySavings ?? 0
          const gap = plan?.gap ?? 0
          const fundedPct = plan?.fundedPct ?? 0
          const hasGap = gap > 0

          // Horizon buckets from engine
          const activeBuckets = plan?.buckets ?? []

          return (
            <View style={styles.realityCard}>
              {/* Header */}
              <View style={styles.realityHeader}>
                <Text style={styles.realityIcon}>{hasGap ? '📊' : '✅'}</Text>
                <Text style={styles.realityTitle}>{hasGap ? 'PLAN vs REALITY' : 'FULLY FUNDED'}</Text>
              </View>

              {/* SIP needed vs savings comparison */}
              <View style={styles.realityCompareRow}>
                <View style={styles.realityCompareItem}>
                  <Text style={styles.realityCompareLabel}>SIP needed</Text>
                  <Text style={styles.realityCompareValue}>{formatINRExact(totalMonthlySIP)}</Text>
                </View>
                <View style={[styles.realityCompareItem, { backgroundColor: hasGap ? '#FEF2F2' : '#F0FDF4' }]}>
                  <Text style={styles.realityCompareLabel}>Your savings</Text>
                  <Text style={[styles.realityCompareValue, { color: hasGap ? RED : GREEN_H }]}>{formatINRExact(monthlySavings)}</Text>
                </View>
                <View style={styles.realityCompareItem}>
                  <Text style={styles.realityCompareLabel}>{hasGap ? 'Gap' : 'Surplus'}</Text>
                  <Text style={[styles.realityCompareValue, { color: hasGap ? RED : GREEN_H }]}>{formatINRExact(Math.abs(gap))}</Text>
                </View>
              </View>

              {/* Funding progress bar */}
              <View style={styles.realityBarWrap}>
                <View style={styles.realityBarTrack}>
                  <View style={[styles.realityBarFill, { width: `${fundedPct}%`, backgroundColor: hasGap ? ORANGE : GREEN }]} />
                </View>
                <Text style={[styles.realityBarLabel, { color: hasGap ? ORANGE_H : GREEN_H }]}>{fundedPct}% funded</Text>
              </View>

              {/* Divider */}
              <View style={styles.realityDivider} />

              {/* Goal breakdown summary */}
              <Text style={styles.realityWhatIf}>Your {configuredGoals.length} goal{configuredGoals.length !== 1 ? 's' : ''} at a glance</Text>
              <Text style={styles.realityCagrNote}>
                {activeBuckets.map((b: any, i: number) => {
                  const bucketTarget = b.totalRemaining ?? b.goals.reduce((s: number, g: any) => s + g.remaining, 0)
                  const part = `${b.goals.length} ${b.goals.length === 1 ? 'is' : 'are'} ${b.label.split(' (')[0].toLowerCase()} (${fmtInr(bucketTarget)} needed)`
                  if (i === 0) return part.charAt(0).toUpperCase() + part.slice(1)
                  if (i === activeBuckets.length - 1) return ` and ${part}`
                  return `, ${part}`
                }).join('')}.{'\n'}Each is matched to the right instruments for its timeline.
              </Text>

              {activeBuckets.map((bucket: any) => {
                const bucketSip = bucket.totalSip ?? bucket.goals.reduce((s: number, g: any) => s + g.monthlyNeeded, 0)
                const bucketTarget = bucket.totalRemaining ?? bucket.goals.reduce((s: number, g: any) => s + g.remaining, 0)
                const bucketAdvice = bucket.advice ?? bucket.goals[0]?.advice
                return (
                  <View key={bucket.key} style={[styles.bucketCard, { borderColor: bucketAdvice.tagColor + '30' }]}>
                    {/* Bucket header */}
                    <View style={styles.bucketHeader}>
                      <Text style={{ fontSize: 16 }}>{bucket.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bucketTitle}>{bucket.label}</Text>
                        <Text style={styles.bucketMeta}>{bucket.goals.length} goal{bucket.goals.length > 1 ? 's' : ''} · {fmtInr(bucketTarget)} needed</Text>
                      </View>
                      <View style={[styles.bucketBadge, { backgroundColor: bucketAdvice.tagColor + '15' }]}>
                        <Text style={[styles.bucketBadgeText, { color: bucketAdvice.tagColor }]}>{bucketAdvice.tag}</Text>
                      </View>
                    </View>

                    {/* Liquid allocation note for short-term bucket */}
                    {bucket.totalLiquidUsed > 0 && (
                      <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
                        <Text style={{ fontSize: 11, color: GREEN_H, fontFamily: 'Manrope_400Regular' }}>
                          💧 {formatINRExact(bucket.totalLiquidUsed)} from liquid funds reduces SIP needed
                        </Text>
                      </View>
                    )}

                    {/* Goals in this bucket */}
                    {bucket.goals.map((gp: any) => (
                      <View key={gp.id} style={styles.bucketGoalRow}>
                        <Text style={{ fontSize: 13 }}>{goalEmoji(gp.name)}</Text>
                        <Text style={styles.bucketGoalName} numberOfLines={1}>{gp.name}</Text>
                        {gp.priority === 'stretch' && (
                          <View style={{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: ORANGE_L, marginRight: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: ORANGE_H, fontFamily: 'Manrope_700Bold' }}>STRETCH</Text>
                          </View>
                        )}
                        <Text style={[styles.bucketGoalSip, { color: gp.priority === 'stretch' ? TXT3 : bucketAdvice.tagColor }]}>{fmtInr(gp.monthlyNeeded)}/mo</Text>
                      </View>
                    ))}

                    {/* Invest via line */}
                    <View style={[styles.bucketInvestRow, { backgroundColor: bucketAdvice.tagColor + '08' }]}>
                      <Text style={[styles.bucketInvestText, { color: bucketAdvice.tagColor }]}>Invest {formatINRExact(bucketSip)}/mo · {bucketAdvice.cagrRange} CAGR</Text>
                    </View>

                    {/* Instruments for this bucket */}
                    <View style={styles.bucketAllocWrap}>
                      {bucketAdvice.instruments.map((inst: any) => (
                        <View key={inst.label} style={styles.bucketAllocRow}>
                          <View style={[styles.bucketAllocDot, { backgroundColor: inst.color }]} />
                          <Text style={styles.bucketAllocLabel}>{inst.label}</Text>
                          <Text style={[styles.bucketAllocPct, { color: inst.color }]}>{inst.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )
              })}

              {sipCapped && stretchGoals.length > 0 && (
                <View style={[styles.realityWarnBox, { backgroundColor: '#F3E8FF', borderColor: '#7C3AED' }]}>
                  <Text style={[styles.realityWarnText, { color: '#6D28D9' }]}>
                    📌 SIP capped at 40% of income. {stretchGoals.length} goal{stretchGoals.length > 1 ? 's' : ''} marked as stretch — extend timeline or increase income to fund them.
                  </Text>
                </View>
              )}

              {hasGap && (
                <View style={styles.realityWarnBox}>
                  <Text style={styles.realityWarnText}>💡 Your savings cover {fundedPct}% of the total SIP needed. Consider prioritising high-priority goals or extending timelines for others.</Text>
                </View>
              )}

              {!hasGap && (
                <View style={[styles.realityWarnBox, { backgroundColor: GREEN_L, borderColor: GREEN }]}>
                  <Text style={[styles.realityWarnText, { color: GREEN_H }]}>+ {formatINRExact(Math.abs(gap))} surplus → build emergency corpus or start wealth SIP</Text>
                </View>
              )}

              <Text style={styles.realityDisclaimer}>Mutual fund investments are subject to market risks. Past performance does not guarantee future returns. The above is for educational purposes only — not investment advice. Please consult a SEBI-registered advisor.</Text>
            </View>
          )
        })()}

        {/* ── Goal Cards ─────────────────────────────────────────── */}
        {goals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 48 }}>🎯</Text>
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptySub}>
              Add a financial goal and see how much you need to save at different return rates.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={openAdd}>
              <Text style={styles.primaryBtnText}>+ Add First Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.map((goal) => {
            const needsSetup = !goal.target_amount || goal.target_amount <= 0
            const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : thisYear + 5
            const yearsLeft = Math.max(0, targetYear - thisYear)
            const emoji = goalEmoji(goal.name)

            // Goal needs setup — show a simple setup prompt card
            if (needsSetup) {
              return (
                <TouchableOpacity key={goal.id} style={[styles.goalCard, { borderColor: ORANGE + '40' }]} onPress={() => openEdit(goal)} activeOpacity={0.8}>
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: ORANGE_L, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 24 }}>{emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalName}>{goal.name}</Text>
                        <Text style={{ fontSize: 13, color: ORANGE_H, fontFamily: 'Manrope_400Regular', marginTop: 2 }}>Tap to set target amount & timeline</Text>
                      </View>
                      <View style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: ORANGE_L }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: ORANGE_H, fontFamily: 'Manrope_700Bold' }}>Set up →</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }

            // Get horizon-based advice from engine projection
            const gp = goalProjections.find((p: any) => p.id === goal.id)
            const advice = gp?.advice ?? { bucket: 'medium', bucketLabel: 'Medium-term', tag: 'Moderate', tagColor: '#14B8A6', cagr: 10, cagrRange: '8–11%', risk: 'Moderate risk', emoji: '⚖️', instruments: [], rationale: '' }
            const remaining = gp?.remaining ?? Math.max(0, goal.target_amount - goal.saved_amount)
            const monthlySIP = gp?.monthlyNeeded ?? 0
            const goalColor = BLUE

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={{ padding: 16 }}>
                  {/* Header row */}
                  <View style={styles.goalHeader}>
                    <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: goalColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.goalName}>{goal.name}</Text>
                        {goal.priority && (() => {
                          const pc = PRIORITY_CONFIG[goal.priority as keyof typeof PRIORITY_CONFIG]
                          return pc ? (
                            <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: pc.bg }}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: pc.color, fontFamily: 'Manrope_700Bold' }}>{pc.label}</Text>
                            </View>
                          ) : null
                        })()}
                        {gp?.priority === 'stretch' && (
                          <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: ORANGE_L }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: ORANGE_H, fontFamily: 'Manrope_700Bold' }}>STRETCH</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.goalAmounts}>
                        {fmtInr(goal.target_amount)}
                      </Text>
                      <Text style={styles.goalYears}>
                        {yearsLeft > 0 ? `${yearsLeft} yrs left · by ${targetYear}` : `Target: ${targetYear}`}
                      </Text>
                    </View>

                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(goal)}>
                      <Text style={{ fontSize: 13 }}>✏️</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Horizon-based recommendation */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                      setExpandedGoalId(prev => prev === goal.id ? null : goal.id)
                    }}
                    style={[styles.goalAdviceWrap, { borderColor: advice.tagColor + '25' }]}
                  >
                    {/* SIP amount + horizon tag */}
                    <View style={styles.goalAdviceTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalAdviceSipLabel}>{advice.emoji} Invest via</Text>
                        <Text style={[styles.goalAdviceSipAmt, { color: advice.tagColor }]}>{formatINRExact(monthlySIP)}/mo</Text>
                      </View>
                      <View style={[styles.goalAdviceBadge, { backgroundColor: advice.tagColor + '15' }]}>
                        <Text style={[styles.goalAdviceBadgeText, { color: advice.tagColor }]}>{advice.tag}</Text>
                        <Text style={styles.goalAdviceCagr}>{advice.cagrRange} CAGR</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: TXT3, marginLeft: 6 }}>{expandedGoalId === goal.id ? '▲' : '▼'}</Text>
                    </View>

                    {/* Liquid allocation note for this goal */}
                    {gp?.liquidAllocated > 0 && (
                      <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
                        <Text style={{ fontSize: 11, color: GREEN_H, fontFamily: 'Manrope_400Regular' }}>
                          💧 {formatINRExact(gp.liquidAllocated)} covered from liquid funds
                        </Text>
                      </View>
                    )}

                    {/* Instruments — collapsible */}
                    {expandedGoalId === goal.id && (
                      <View>
                        <View style={styles.goalAdviceInstruments}>
                          {advice.instruments.map((inst: any) => (
                            <View key={inst.label} style={styles.goalAdviceInstRow}>
                              <View style={[styles.goalAdviceInstDot, { backgroundColor: inst.color }]} />
                              <Text style={styles.goalAdviceInstLabel}>{inst.label}</Text>
                              <Text style={[styles.goalAdviceInstPct, { color: inst.color }]}>{inst.pct}%</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.goalAdviceRationale}>{advice.rationale}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* ── Goal Add/Edit Sheet ──────────────────────────────────── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSheet(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{editGoal ? 'Edit Goal' : 'New Goal'}</Text>
                <TouchableOpacity onPress={() => setShowSheet(false)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Emoji + Name */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity onPress={() => setShowEmojiPicker(p => !p)}
                  style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24 }}>{fEmoji}</Text>
                </TouchableOpacity>
                <TextInput value={fName} onChangeText={setFName} placeholder="Goal name (e.g. Europe Trip)"
                  placeholderTextColor={TXT3}
                  style={styles.formInput} />
              </View>

              {showEmojiPicker && (
                <View style={styles.emojiGrid}>
                  {GOAL_EMOJIS.map(e => (
                    <TouchableOpacity key={e} onPress={() => { setFEmoji(e); setShowEmojiPicker(false) }}
                      style={[styles.emojiBtn, fEmoji === e && { backgroundColor: BLUE_L }]}>
                      <Text style={{ fontSize: 20 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Target Amount */}
              <Text style={styles.formLabel}>TARGET AMOUNT</Text>
              <View style={styles.currencyRow}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput value={fTarget} onChangeText={t => setFTarget(commaFormat(t))} placeholder="0" placeholderTextColor={TXT3}
                  keyboardType="number-pad" returnKeyType="done" style={styles.currencyInput} autoFocus />
              </View>

              {/* Target Year */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={styles.formLabel}>TARGET YEAR</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_400Regular' }}>
                  {fYear - thisYear > 0 ? `${fYear - thisYear} yrs from now` : 'this year'}
                </Text>
              </View>
              {/* Year input + slider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <View ref={sliderRef} style={{ flex: 1, height: 28, justifyContent: 'center' }} {...sliderPan.panHandlers}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: BG_SEC }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: BLUE,
                      width: `${Math.min(100, ((fYear - thisYear) / 40) * 100)}%` }} />
                  </View>
                  <View style={{
                    position: 'absolute',
                    left: `${Math.min(100, ((fYear - thisYear) / 40) * 100)}%`,
                    marginLeft: -10,
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: '#fff', borderWidth: 2.5, borderColor: BLUE,
                    shadowColor: BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
                  }} />
                </View>
                <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: BLUE + '30', alignItems: 'center' }}>
                  <TextInput
                    value={fYearText}
                    onChangeText={(text) => {
                      setFYearText(text)
                      const n = parseInt(text, 10)
                      if (!isNaN(n) && n >= thisYear && n <= thisYear + 40) setFYear(n)
                    }}
                    onFocus={() => { yearInputFocused.current = true }}
                    onBlur={() => {
                      yearInputFocused.current = false
                      const n = parseInt(fYearText, 10)
                      if (!isNaN(n) && n >= thisYear && n <= thisYear + 40) { setFYear(n); setFYearText(String(n)) }
                      else { setFYear(thisYear + 5); setFYearText(String(thisYear + 5)) }
                    }}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={4}
                    selectTextOnFocus
                    style={{ fontSize: 18, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold', textAlign: 'center', minWidth: 52, padding: 0 }}
                  />
                </View>
              </View>

              {/* Priority */}
              <Text style={styles.formLabel}>PRIORITY</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                {(['high', 'medium', 'low'] as const).map(p => {
                  const cfg = PRIORITY_CONFIG[p]
                  const sel = fPriority === p
                  return (
                    <TouchableOpacity key={p} onPress={() => setFPriority(p)}
                      style={[styles.priorityChip, { backgroundColor: sel ? cfg.bg : BG_SEC, borderColor: sel ? cfg.color + '50' : 'transparent' }]}>
                      <Text style={[styles.priorityChipText, { color: sel ? cfg.color : TXT3 }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                {editGoal && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={deleteGoal}>
                    <Text style={{ fontSize: 15, color: '#fff' }}>🗑</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: (fName.trim() && Number(stripCommas(fTarget)) > 0) ? BLUE : BG_SEC }]}
                  onPress={saveGoal} disabled={!fName.trim() || Number(stripCommas(fTarget)) <= 0}>
                  <Text style={[styles.saveBtnText, { color: (fName.trim() && Number(stripCommas(fTarget)) > 0) ? '#fff' : TXT3 }]}>
                    {editGoal ? 'Save Changes' : 'Create Goal'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Preset Goals Picker ──────────────────────────────────── */}
      <Modal visible={showPresets} transparent animationType="slide" onRequestClose={() => setShowPresets(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowPresets(false)}>
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose a Goal</Text>
              <TouchableOpacity onPress={() => setShowPresets(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.presetGrid}>
              {PRESET_GOALS.map((preset) => {
                const exists = goals.some(g => g.name.toLowerCase() === preset.name.toLowerCase())
                return (
                  <TouchableOpacity key={preset.name} onPress={() => selectPreset(preset)}
                    style={[styles.presetTile, exists && styles.presetTileExists]} activeOpacity={0.7}>
                    {exists && (
                      <View style={styles.presetExistsBadge}>
                        <Text style={styles.presetExistsText}>Added</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 28 }}>{preset.emoji}</Text>
                    <Text style={styles.presetName}>{preset.name}</Text>
                    <Text style={styles.presetMeta}>
                      {fmtInr(preset.defaultTarget)} · {preset.defaultYears}y
                    </Text>
                  </TouchableOpacity>
                )
              })}
              <TouchableOpacity style={styles.presetTileCustom} onPress={openCustomGoal} activeOpacity={0.7}>
                <Text style={{ fontSize: 28 }}>✏️</Text>
                <Text style={styles.presetName}>Custom Goal</Text>
                <Text style={styles.presetMeta}>Set your own</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

  // App Bar
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingVertical: 4, paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: 3, fontFamily: 'NotoSerif_700Bold' },
  divider: { width: 1, height: 20, backgroundColor: BORDER, marginHorizontal: 6 },
  barTitle: { fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  barSub: { fontSize: 13, fontWeight: '600', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 4 },
  addBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Hero
  heroCard: { borderRadius: 20, padding: 16, marginBottom: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A', shadowColor: BLUE, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 40, elevation: 12 },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroWatermark: { position: 'absolute', right: -10, bottom: -10, opacity: 0.04, zIndex: 0 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Manrope_700Bold' },
  heroAmount: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  heroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'Manrope_400Regular' },

  // Plan vs Reality card
  realityCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.06)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 20, elevation: 2 },
  realityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  realityIcon: { fontSize: 18 },
  realityTitle: { fontSize: 14, fontWeight: '800', color: TXT1, letterSpacing: 0.5, fontFamily: 'Manrope_700Bold' },
  realityCompareRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  realityCompareItem: { flex: 1, backgroundColor: BG_SEC, borderRadius: 12, padding: 10, alignItems: 'center' },
  realityCompareLabel: { fontSize: 10, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_400Regular', marginBottom: 2 },
  realityCompareValue: { fontSize: 14, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  realityBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  realityBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: BG_SEC, overflow: 'hidden' },
  realityBarFill: { height: 8, borderRadius: 4 },
  realityBarLabel: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  realityDivider: { height: 1, backgroundColor: BORDER, marginBottom: 14 },
  realityWhatIf: { fontSize: 14, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold', marginBottom: 4 },
  realityCagrNote: { fontSize: 13, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_400Regular', marginBottom: 12 },
  realityWarnBox: { borderRadius: 12, padding: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginBottom: 12 },
  realityWarnText: { fontSize: 12, fontWeight: '700', color: '#991B1B', fontFamily: 'Manrope_700Bold', lineHeight: 18 },
  // Now-unused old styles kept for compat (can be removed later)
  realityAllocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  realityAllocTitle: { fontSize: 12, fontWeight: '700', color: TXT2, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  realityAllocBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  realityAllocBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  realityAllocRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  realityAllocDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  realityAllocLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_400Regular' },
  realityAllocPct: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  realityDisclaimer: { fontSize: 10, color: TXT3, fontFamily: 'Manrope_400Regular', textAlign: 'center', marginTop: 14 },

  // Horizon bucket cards (inside Plan vs Reality)
  bucketCard: { borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 10, backgroundColor: '#FAFBFD' },
  bucketHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bucketTitle: { fontSize: 13, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  bucketMeta: { fontSize: 11, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  bucketBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bucketBadgeText: { fontSize: 10, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  bucketGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 4 },
  bucketGoalName: { flex: 1, fontSize: 13, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_400Regular' },
  bucketGoalSip: { fontSize: 13, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  bucketInvestRow: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginTop: 6, marginBottom: 2, alignItems: 'center' },
  bucketInvestText: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  bucketAllocWrap: { marginTop: 8, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 },
  bucketAllocRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  bucketAllocDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  bucketAllocLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_400Regular' },
  bucketAllocPct: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_700Bold' },

  // Goal Card
  goalCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  goalCardWarn: { borderColor: '#FDE68A' },
  offTrackBanner: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: ORANGE_L },
  offTrackText: { fontSize: 13, fontWeight: '700', color: ORANGE_H, fontFamily: 'Manrope_700Bold' },
  goalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  goalArcOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  goalArcPct: { fontSize: 12, fontWeight: '800', lineHeight: 14, fontFamily: 'Manrope_700Bold' },
  goalName: { fontSize: 16, fontWeight: '800', color: TXT1, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  goalAmounts: { fontSize: 14, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_700Bold' },
  goalYears: { fontSize: 13, fontWeight: '500', color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },

  // Goal card advice (horizon-based)
  goalAdviceWrap: { marginTop: 12, borderWidth: 1, borderRadius: 16, padding: 12, backgroundColor: '#FAFBFD' },
  goalAdviceTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  goalAdviceSipLabel: { fontSize: 11, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_400Regular' },
  goalAdviceSipAmt: { fontSize: 18, fontWeight: '800', fontFamily: 'Manrope_700Bold', marginTop: 2 },
  goalAdviceBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  goalAdviceBadgeText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  goalAdviceCagr: { fontSize: 10, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  goalAdviceInstruments: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 },
  goalAdviceInstRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  goalAdviceInstDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  goalAdviceInstLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_400Regular' },
  goalAdviceInstPct: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  goalAdviceRationale: { fontSize: 11, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_400Regular', marginTop: 8, fontStyle: 'italic' },

  // Projection toggle
  projToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 10, backgroundColor: TEAL_L },
  projToggleActive: { backgroundColor: TEAL },
  projToggleText: { fontSize: 14, fontWeight: '800', color: TEAL, fontFamily: 'Manrope_700Bold' },

  // Info box
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, padding: 12, backgroundColor: BLUE_L },
  infoText: { flex: 1, fontSize: 14, fontWeight: '600', color: BLUE, lineHeight: 20, fontFamily: 'Manrope_400Regular' },

  // Scenario card
  scenarioCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  scenarioHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  scenarioTitle: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioRisk: { fontSize: 12, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' },
  scenarioNeedLabel: { fontSize: 12, fontWeight: '700', color: TXT3, fontFamily: 'Manrope_700Bold' },
  scenarioNeedVal: { fontSize: 16, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: BG_SEC },
  scenarioBodyLabel: { fontSize: 12, fontWeight: '700', color: TXT3, fontFamily: 'Manrope_700Bold' },
  scenarioBodyVal: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioResultBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  scenarioResultText: { fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioAssets: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BG_SEC },
  scenarioAssetsText: { fontSize: 12, fontWeight: '600', color: TXT2, lineHeight: 18, fontFamily: 'Manrope_400Regular' },

  // SEBI
  sebiBox: { borderRadius: 16, padding: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  sebiText: { fontSize: 12, fontWeight: '600', color: '#92400E', lineHeight: 18, fontFamily: 'Manrope_400Regular' },

  // Empty
  emptyCard: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: TXT1, marginTop: 12, fontFamily: 'Manrope_700Bold' },
  emptySub: { fontSize: 15, fontWeight: '500', color: TXT3, textAlign: 'center', marginTop: 4, marginBottom: 20, lineHeight: 22, fontFamily: 'Manrope_400Regular' },
  primaryBtn: { backgroundColor: BLUE, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, shadowColor: BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 6 },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.65)', justifyContent: 'flex-end' },
  sheetContainer: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // Form
  formInput: { flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC, fontSize: 16, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold' },
  formLabel: { fontSize: 13, fontWeight: '700', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: 'Manrope_700Bold' },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC, marginBottom: 20 },
  currencyPrefix: { fontSize: 18, fontWeight: '700', color: TXT3 },
  currencyInput: { flex: 1, fontSize: 24, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 16, backgroundColor: BG_SEC, marginBottom: 16 },
  emojiBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  yearBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  yearBtnText: { fontSize: 18, fontWeight: '700', color: TXT1 },
  yearPreset: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: 'transparent' },
  yearPresetText: { fontSize: 13, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },
  priorityChip: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5 },
  priorityChipText: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  deleteBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: RED },
  saveBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_700Bold' },

  // Preset picker — tile grid
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  presetTile: { width: '47%' as any, borderRadius: 16, padding: 14, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center', minHeight: 100, position: 'relative' },
  presetTileExists: { backgroundColor: '#F0FDF4', opacity: 0.75 },
  presetTileCustom: { width: '47%' as any, borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 100, borderWidth: 1.5, borderColor: BLUE + '30', borderStyle: 'dashed' },
  presetName: { fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold', marginTop: 8, textAlign: 'center' },
  presetMeta: { fontSize: 13, fontWeight: '600', color: TXT3, marginTop: 3, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  presetExistsBadge: { position: 'absolute', top: 8, right: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: GREEN_L },
  presetExistsText: { fontSize: 11, fontWeight: '800', color: GREEN_H, fontFamily: 'Manrope_700Bold' },
})
