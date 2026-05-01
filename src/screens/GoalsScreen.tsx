import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import GoalArc from '../components/GoalArc'
import { supabase } from '../lib/supabase'
import { Goal } from '../types'

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
const INDIGO   = '#6366F1'
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

const formatINR = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

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

// ─── SEBI-Compliant Projection Engine ───────────────────────────────────
function buildProjection(targetAmount: number, currentSaved: number, targetYear: number, monthlySIP: number) {
  const years = Math.max(1, targetYear - new Date().getFullYear())
  const months = years * 12
  const remaining = Math.max(0, targetAmount - currentSaved)

  const RATES = [
    { label: 'Conservative', emoji: '🛡️', returnPct: 6,  riskLabel: 'Low risk',    color: GREEN,  assets: 'Govt schemes, fixed-return, capital preservation' },
    { label: 'Balanced',     emoji: '⚖️', returnPct: 10, riskLabel: 'Medium risk',  color: TEAL,   assets: 'Mix of equity & fixed-income' },
    { label: 'Growth',       emoji: '🚀', returnPct: 13, riskLabel: 'Higher risk',  color: INDIGO, assets: 'Equity-oriented (domestic & intl markets)' },
  ]

  const scenarios = RATES.map(s => {
    const r = s.returnPct / 100 / 12
    const monthlyNeeded = remaining <= 0 ? 0 : r > 0
      ? Math.ceil(remaining * r / (Math.pow(1 + r, months) - 1))
      : Math.ceil(remaining / months)
    const projected = currentSaved + (r > 0
      ? monthlySIP * ((Math.pow(1 + r, months) - 1) / r)
      : monthlySIP * months)
    return { ...s, monthlyNeeded, projected: Math.round(projected) }
  })

  const r8 = 0.08 / 12
  const projAt8 = currentSaved + monthlySIP * ((Math.pow(1 + r8, months) - 1) / r8)
  const simpleNeeded = remaining > 0 ? Math.ceil(remaining / months) : 0

  return { scenarios, simpleNeeded, canAchieve: projAt8 >= targetAmount * 0.9, yearsLeft: years }
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  // expandedId removed — no more projection scenarios on this screen

  // Form state
  const [fEmoji, setFEmoji] = useState('🎯')
  const [fName, setFName] = useState('')
  const [fTarget, setFTarget] = useState('')
  const [fSaved, setFSaved] = useState('')
  const [fYear, setFYear] = useState(new Date().getFullYear() + 5)
  const [fMonthly, setFMonthly] = useState('')
  const [fPriority, setFPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const fetchGoals = useCallback(async () => {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true })
    setGoals(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const onRefresh = async () => { setRefreshing(true); await fetchGoals(); setRefreshing(false) }

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
    setFTarget(String(preset.defaultTarget)); setFSaved('0')
    setFYear(new Date().getFullYear() + preset.defaultYears)
    setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const openCustomGoal = () => {
    setShowPresets(false)
    setEditGoal(null)
    setFEmoji('🎯'); setFName(''); setFTarget(''); setFSaved('0')
    setFYear(new Date().getFullYear() + 5); setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const openEdit = (g: Goal) => {
    setEditGoal(g)
    setFEmoji(goalEmoji(g.name)); setFName(g.name)
    setFTarget(String(g.target_amount)); setFSaved(String(g.saved_amount))
    const yr = g.target_date ? new Date(g.target_date).getFullYear() : new Date().getFullYear() + 5
    setFYear(yr); setFMonthly(''); setFPriority('medium')
    setShowSheet(true)
  }

  const saveGoal = async () => {
    if (!fName.trim()) { Alert.alert('Enter goal name'); return }
    if (!fTarget || Number(fTarget) <= 0) { Alert.alert('Enter valid target amount'); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      name: fName.trim(),
      target_amount: Number(fTarget),
      saved_amount: Number(fSaved) || 0,
      target_date: `${fYear}-12-31`,
    }

    if (editGoal) {
      await supabase.from('goals').update(payload).eq('id', editGoal.id)
    } else {
      await supabase.from('goals').insert(payload)
    }
    setShowSheet(false)
    fetchGoals()
  }

  const deleteGoal = async () => {
    if (!editGoal) return
    Alert.alert('Delete goal?', `Are you sure you want to delete "${editGoal.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('goals').delete().eq('id', editGoal.id)
        setShowSheet(false)
        fetchGoals()
      }},
    ])
  }

  // ─── Computed ───────────────────────────────────────────────────
  const configuredGoals = goals.filter(g => g.target_amount > 0)
  const totalSaved  = configuredGoals.reduce((s, g) => s + g.saved_amount, 0)
  const totalTarget = configuredGoals.reduce((s, g) => s + g.target_amount, 0)
  const overallPct  = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0
  const needsSetupCount = goals.length - configuredGoals.length
  const thisYear    = new Date().getFullYear()

  // Year slider drag
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

  if (loading) {
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
            <View style={styles.heroContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>ACROSS {configuredGoals.length} GOAL{configuredGoals.length !== 1 ? 'S' : ''}</Text>
                  <Text style={styles.heroAmount}>{formatINR(totalSaved)}</Text>
                  <Text style={styles.heroSub}>saved of {formatINR(totalTarget)} target</Text>
                  {needsSetupCount > 0 && (
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 4 }}>
                      {needsSetupCount} goal{needsSetupCount !== 1 ? 's' : ''} need setup ↓
                    </Text>
                  )}
                </View>
                <View style={{ position: 'relative', width: 64, height: 64 }}>
                  <GoalArc progress={overallPct} color={ORANGE} size={64} strokeWidth={6} bgColor="rgba(255,255,255,0.15)" />
                  <View style={styles.heroArcText}>
                    <Text style={styles.heroArcPct}>{overallPct}%</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

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
            const pct = needsSetup ? 0 : Math.min((goal.saved_amount / goal.target_amount) * 100, 100)
            const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : thisYear + 5
            const yearsLeft = Math.max(0, targetYear - thisYear)
            const monthlySIP = (needsSetup || yearsLeft <= 0) ? 0 : Math.ceil((goal.target_amount - goal.saved_amount) / (yearsLeft * 12))
            const proj = needsSetup ? null : buildProjection(goal.target_amount, goal.saved_amount, targetYear, monthlySIP)
            const onTrack = proj?.canAchieve ?? false
            const goalColor = needsSetup ? ORANGE : (onTrack ? BLUE : ORANGE)
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

            return (
              <View key={goal.id} style={[styles.goalCard, !onTrack && styles.goalCardWarn]}>
                {/* Off-track banner */}
                {!onTrack && yearsLeft > 0 && (
                  <View style={styles.offTrackBanner}>
                    <Text style={styles.offTrackText}>⚠ Need to increase monthly contribution to stay on track</Text>
                  </View>
                )}

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
                      </View>
                      <Text style={styles.goalAmounts}>
                        {formatINR(goal.target_amount)}
                      </Text>
                      <Text style={styles.goalYears}>
                        {yearsLeft > 0 ? `${yearsLeft} yrs left · by ${targetYear}` : `Target: ${targetYear}`}
                      </Text>
                    </View>

                    <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(goal)}>
                      <Text style={{ fontSize: 13 }}>✏️</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Monthly needed */}
                  {proj && (
                  <View style={styles.sipRow}>
                    <Text style={{ fontSize: 14, color: goalColor }}>📈</Text>
                    <Text style={styles.sipText}>Save {formatINR(proj.simpleNeeded)}/mo to reach goal</Text>
                  </View>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* ── Goal Add/Edit Sheet ──────────────────────────────────── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSheet(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                <TextInput value={fTarget} onChangeText={setFTarget} placeholder="0" placeholderTextColor={TXT3}
                  keyboardType="numeric" style={styles.currencyInput} />
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
                    value={String(fYear)}
                    onChangeText={(text) => {
                      const n = parseInt(text, 10)
                      if (!isNaN(n) && n >= thisYear && n <= thisYear + 40) setFYear(n)
                      else if (text === '') setFYear(thisYear)
                    }}
                    keyboardType="numeric"
                    maxLength={4}
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
                  style={[styles.saveBtn, { backgroundColor: (fName.trim() && Number(fTarget) > 0) ? BLUE : BG_SEC }]}
                  onPress={saveGoal} disabled={!fName.trim() || Number(fTarget) <= 0}>
                  <Text style={[styles.saveBtnText, { color: (fName.trim() && Number(fTarget) > 0) ? '#fff' : TXT3 }]}>
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
                      {formatINR(preset.defaultTarget)} · {preset.defaultYears}y
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
  barSub: { fontSize: 12, fontWeight: '600', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 4 },
  addBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Hero
  heroCard: { borderRadius: 20, padding: 16, marginBottom: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A', shadowColor: BLUE, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 40, elevation: 12 },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Manrope_700Bold' },
  heroAmount: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  heroSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'Manrope_400Regular' },
  heroArcText: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  heroArcPct: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Goal Card
  goalCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  goalCardWarn: { borderColor: '#FDE68A' },
  offTrackBanner: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: ORANGE_L },
  offTrackText: { fontSize: 12, fontWeight: '700', color: ORANGE_H, fontFamily: 'Manrope_700Bold' },
  goalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  goalArcOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  goalArcPct: { fontSize: 12, fontWeight: '800', lineHeight: 14, fontFamily: 'Manrope_700Bold' },
  goalName: { fontSize: 15, fontWeight: '800', color: TXT1, marginBottom: 2, fontFamily: 'Manrope_700Bold' },
  goalAmounts: { fontSize: 13, fontWeight: '600', color: TXT2, fontFamily: 'Manrope_700Bold' },
  goalYears: { fontSize: 12, fontWeight: '500', color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  editBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },

  // SIP row
  sipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: BG_SEC, marginBottom: 12 },
  sipText: { flex: 1, fontSize: 13, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  sipStatus: { fontSize: 13, fontWeight: '700', fontFamily: 'Manrope_700Bold' },

  // Projection toggle
  projToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 10, backgroundColor: TEAL_L },
  projToggleActive: { backgroundColor: TEAL },
  projToggleText: { fontSize: 13, fontWeight: '800', color: TEAL, fontFamily: 'Manrope_700Bold' },

  // Info box
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, padding: 12, backgroundColor: BLUE_L },
  infoText: { flex: 1, fontSize: 13, fontWeight: '600', color: BLUE, lineHeight: 19, fontFamily: 'Manrope_400Regular' },

  // Scenario card
  scenarioCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  scenarioHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  scenarioTitle: { fontSize: 13, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioRisk: { fontSize: 11, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' },
  scenarioNeedLabel: { fontSize: 11, fontWeight: '700', color: TXT3, fontFamily: 'Manrope_700Bold' },
  scenarioNeedVal: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: BG_SEC },
  scenarioBodyLabel: { fontSize: 11, fontWeight: '700', color: TXT3, fontFamily: 'Manrope_700Bold' },
  scenarioBodyVal: { fontSize: 14, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioResultBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  scenarioResultText: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scenarioAssets: { paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BG_SEC },
  scenarioAssetsText: { fontSize: 10, fontWeight: '600', color: TXT2, lineHeight: 16, fontFamily: 'Manrope_400Regular' },

  // SEBI
  sebiBox: { borderRadius: 16, padding: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  sebiText: { fontSize: 10, fontWeight: '600', color: '#92400E', lineHeight: 16, fontFamily: 'Manrope_400Regular' },

  // Empty
  emptyCard: { backgroundColor: '#fff', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: TXT1, marginTop: 12, fontFamily: 'Manrope_700Bold' },
  emptySub: { fontSize: 14, fontWeight: '500', color: TXT3, textAlign: 'center', marginTop: 4, marginBottom: 20, lineHeight: 21, fontFamily: 'Manrope_400Regular' },
  primaryBtn: { backgroundColor: BLUE, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, shadowColor: BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 6 },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.65)', justifyContent: 'flex-end' },
  sheetContainer: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // Form
  formInput: { flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC, fontSize: 16, fontWeight: '600', color: TXT1, fontFamily: 'Manrope_700Bold' },
  formLabel: { fontSize: 12, fontWeight: '700', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: 'Manrope_700Bold' },
  currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: BG_SEC, marginBottom: 20 },
  currencyPrefix: { fontSize: 18, fontWeight: '700', color: TXT3 },
  currencyInput: { flex: 1, fontSize: 24, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 16, backgroundColor: BG_SEC, marginBottom: 16 },
  emojiBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  yearBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  yearBtnText: { fontSize: 18, fontWeight: '700', color: TXT1 },
  yearPreset: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: 'transparent' },
  yearPresetText: { fontSize: 12, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },
  priorityChip: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5 },
  priorityChipText: { fontSize: 13, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  deleteBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: RED },
  saveBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_700Bold' },

  // Preset picker — tile grid
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  presetTile: { width: '47%' as any, borderRadius: 16, padding: 14, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center', minHeight: 100, position: 'relative' },
  presetTileExists: { backgroundColor: '#F0FDF4', opacity: 0.75 },
  presetTileCustom: { width: '47%' as any, borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 100, borderWidth: 1.5, borderColor: BLUE + '30', borderStyle: 'dashed' },
  presetName: { fontSize: 14, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold', marginTop: 8, textAlign: 'center' },
  presetMeta: { fontSize: 12, fontWeight: '600', color: TXT3, marginTop: 3, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  presetExistsBadge: { position: 'absolute', top: 8, right: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: GREEN_L },
  presetExistsText: { fontSize: 9, fontWeight: '800', color: GREEN_H, fontFamily: 'Manrope_700Bold' },
})
