import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useRef, useState } from 'react'
import {
    Animated,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import { supabase } from '../lib/supabase'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE    = '#1E3A8A'
const BLUE_L  = '#DBEAFE'
const GREEN   = '#22C55E'
const GREEN_L = '#DCFCE7'
const GREEN_H = '#16A34A'
const ORANGE  = '#F59E0B'
const ORANGE_L= '#FEF3C7'
const TEAL    = '#14B8A6'
const TEAL_L  = '#CCFBF1'
const TXT1    = '#111827'
const TXT2    = '#6B7280'
const TXT3    = '#9CA3AF'
const BORDER  = '#E5E7EB'
const BG_SEC  = '#F1F5F9'
const RED     = '#EF4444'
const INDIGO  = '#6366F1'

// ─── Risk Profile ───────────────────────────────────────────────────────
type RiskProfile = 'aggressive' | 'balanced' | 'moderate' | 'conservative'
function deriveRiskProfile(age: number): RiskProfile {
  if (age <= 30) return 'aggressive'
  if (age <= 40) return 'balanced'
  if (age <= 55) return 'moderate'
  return 'conservative'
}
const RISK_LABELS: Record<RiskProfile, { label: string; emoji: string; equity: number; debt: number; color: string }> = {
  aggressive:   { label: 'Aggressive Growth', emoji: '🔥', equity: 80, debt: 20, color: '#EF4444' },
  balanced:     { label: 'Balanced Growth',   emoji: '⚡', equity: 65, debt: 35, color: '#F59E0B' },
  moderate:     { label: 'Moderate',          emoji: '🛡️', equity: 50, debt: 50, color: '#3B82F6' },
  conservative: { label: 'Conservative',      emoji: '🌿', equity: 30, debt: 70, color: '#22C55E' },
}

// ─── Asset Portfolio ────────────────────────────────────────────────────
interface AssetPortfolio {
  liquidCash: number; mutualFunds: number; stocks: number; epf: number
  ppf: number; gold: number; realEstate: number; other: number
}
const ASSET_FIELDS: { key: keyof AssetPortfolio; emoji: string; label: string; sublabel: string }[] = [
  { key: 'liquidCash',  emoji: '💵', label: 'Liquid Cash & Savings',    sublabel: 'Savings a/c, FD under 1 year' },
  { key: 'mutualFunds', emoji: '📈', label: 'Mutual Funds',             sublabel: 'Current portfolio value' },
  { key: 'epf',         emoji: '🏦', label: 'EPF / PF',                sublabel: 'Employee provident fund balance' },
  { key: 'ppf',         emoji: '📊', label: 'PPF',                     sublabel: 'Public provident fund balance' },
  { key: 'gold',        emoji: '✨', label: 'Gold',                    sublabel: 'Jewellery + SGB + ETF in ₹' },
  { key: 'stocks',      emoji: '📉', label: 'Stocks / Direct Equity',  sublabel: 'Current portfolio value' },
  { key: 'realEstate',  emoji: '🏘️', label: 'Real Estate (Investment)', sublabel: 'Excluding your primary home' },
  { key: 'other',       emoji: '💡', label: 'Other Investments',       sublabel: 'NPS, bonds, crypto, etc.' },
]

const INCOME_MIN = 10000
const INCOME_MAX = 500000
const { width: SCREEN_W } = Dimensions.get('window')

const GOAL_CHIPS = [
  { id: 'house',      label: 'Buy a House',     emoji: '🏠', defaultTarget: 2000000 },
  { id: 'emergency',  label: 'Emergency Fund',  emoji: '🛡️', defaultTarget: 180000  },
  { id: 'retirement', label: 'Retirement',      emoji: '🌅', defaultTarget: 10000000 },
  { id: 'travel',     label: 'Travel',          emoji: '✈️', defaultTarget: 150000  },
  { id: 'education',  label: 'Education',       emoji: '🎓', defaultTarget: 500000  },
  { id: 'car',        label: 'Buy a Car',       emoji: '🚗', defaultTarget: 800000  },
  { id: 'wedding',    label: 'Wedding',         emoji: '💍', defaultTarget: 1000000 },
  { id: 'business',   label: 'Start a Business',emoji: '💼', defaultTarget: 500000  },
]

function fmtInr(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`
  return `₹${val}`
}

// ─── Slider ─────────────────────────────────────────────────────────────
function SliderRow({ label, sublabel, value, min, max, step, color, onChange }: {
  label: string; sublabel?: string; value: number; min: number; max: number; step: number; color: string; onChange: (v: number) => void
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  const trackWidth = SCREEN_W - 80

  const onTouch = (pageX: number) => {
    const raw = ((pageX - 40) / trackWidth) * (max - min) + min
    const snapped = Math.round(raw / step) * step
    onChange(Math.max(min, Math.min(max, snapped)))
  }

  return (
    <View style={s.sliderWrap}>
      <View style={s.sliderHeader}>
        <View>
          <Text style={s.sliderLabel}>{label}</Text>
          {sublabel && <Text style={s.sliderSub}>{sublabel}</Text>}
        </View>
        <View style={[s.sliderBadge, { backgroundColor: color + '18' }]}>
          <Text style={[s.sliderBadgeText, { color }]}>{fmtInr(value)}</Text>
        </View>
      </View>
      <View
        style={s.sliderTrackWrap}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => onTouch(e.nativeEvent.pageX)}
        onResponderMove={e => onTouch(e.nativeEvent.pageX)}
      >
        <View style={s.sliderTrackBg} />
        <View style={[s.sliderTrackFill, { width: `${pct}%`, backgroundColor: color }]} />
        <View style={[s.sliderThumb, { left: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={s.sliderMinMax}>
        <Text style={s.sliderMinMaxText}>{fmtInr(min)}</Text>
        <Text style={s.sliderMinMaxText}>{fmtInr(max)}</Text>
      </View>
    </View>
  )
}

// ─── Step Indicator ─────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.stepRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.stepDot, i < current ? s.stepDotActive : null]} />
      ))}
      <Text style={s.stepLabel}>{current}/{total}</Text>
    </View>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────
type Props = { onComplete: () => void }

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep]             = useState(0)
  // Step 1: Basics
  const [name, setName]             = useState('')
  const [age, setAge]               = useState(28)
  const [incomeType, setIncomeType] = useState<'salary' | 'business' | 'freelance'>('salary')
  // Step 2: Income & Expenses
  const [income, setIncome]         = useState(80000)
  const [essentials, setEssentials] = useState(25000)
  const [lifestyle, setLifestyle]   = useState(15000)
  const [emis, setEmis]             = useState(10000)
  // Step 3: Goals (select only)
  const [selectedGoals, setSelectedGoals] = useState<string[]>([])
  const [saving, setSaving]         = useState(false)

  const fadeAnim = useRef(new Animated.Value(1)).current

  const totalExpenses = essentials + lifestyle + emis
  const savings  = income - totalExpenses
  const savePct  = income > 0 ? Math.round((savings / income) * 100) : 0
  const spendPct = income > 0 ? Math.round((totalExpenses / income) * 100) : 0
  const riskProfile = deriveRiskProfile(age)
  const riskCfg     = RISK_LABELS[riskProfile]

  const toggleGoal = (id: string) => {
    setSelectedGoals(p => p.includes(id) ? p.filter(g => g !== id) : [...p, id])
  }

  const animateTo = (nextStep: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep)
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    })
  }

  const handleFinish = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Upsert profile with onboarding data
    await supabase.from('profiles').upsert({
      id: user.id,
      full_name: name || 'Friend',
      monthly_income: income,
      income_type: incomeType,
      expenses_essentials: essentials,
      expenses_lifestyle: lifestyle,
      expenses_emis: emis,
      is_onboarded: true,
      age: age,
    })

    // Also persist onboarding flag locally as a reliable fallback
    await AsyncStorage.setItem(`@arthflow_onboarded_${user.id}`, 'true')

    // Create goals from selected chips with default targets
    if (selectedGoals.length > 0) {
      const goalRows = selectedGoals.map(id => {
        const chip = GOAL_CHIPS.find(c => c.id === id)
        return {
          user_id: user.id,
          name: chip?.label ?? id,
          target_amount: chip?.defaultTarget ?? income * 6,
          saved_amount: 0,
          target_date: `${new Date().getFullYear() + 5}-12-31`,
        }
      })
      await supabase.from('goals').insert(goalRows)
    }

    setSaving(false)
    onComplete()
  }

  // ─── Step 0: Welcome ───────────────────────────────────────────────
  const renderWelcome = () => (
    <View style={s.stepContainer}>
      {/* Navy hero */}
      <View style={s.welcomeHero}>
        <View style={s.heroBlob1} />
        <View style={s.heroBlob2} />
        <View style={s.heroWatermark} pointerEvents="none">
          <ArthFlowLogo size={120} />
        </View>
        <View style={s.welcomeHeroContent}>
          <ArthFlowLogo size={60} />
          <Text style={s.welcomeLogoText}>ARTHFLOW</Text>
          <Text style={s.welcomeTagline}>Your AI wealth partner</Text>
        </View>
      </View>

      <View style={s.welcomeBody}>
        <Text style={s.welcomeTitle}>Build real wealth — in 5 minutes</Text>
        <Text style={s.welcomeDesc}>
          Tell us about your finances once. ArthFlow AI creates a personalised wealth plan that evolves every month.
        </Text>

        {[
          { emoji: '📊', color: BLUE,   bg: BLUE_L,   title: 'Complete wealth picture',   desc: 'Assets, goals, income — one dashboard' },
          { emoji: '🎯', color: TEAL,   bg: TEAL_L,   title: 'AI-driven goal planning',    desc: 'Exact instruments to invest in, to hit every goal' },
          { emoji: '🛡️', color: ORANGE, bg: ORANGE_L, title: 'Risk & protection insights', desc: 'Age-matched advice for your life stage' },
        ].map(item => (
          <View key={item.title} style={s.featureRow}>
            <View style={[s.featureIcon, { backgroundColor: item.bg }]}>
              <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.featureTitle}>{item.title}</Text>
              <Text style={s.featureDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={s.navArea}>
        <TouchableOpacity style={s.primaryBtn} onPress={() => animateTo(1)} activeOpacity={0.85}>
          <Text style={s.primaryBtnText}>Get Started</Text>
          <Text style={s.primaryBtnArrow}>›</Text>
        </TouchableOpacity>
        <Text style={s.trustText}>Trusted by 50,000+ Indians building wealth</Text>
      </View>
    </View>
  )

  // ─── Step 1: Basics ─────────────────────────────────────────────
  const renderBasics = () => {
    const agePct = ((age - 18) / (70 - 18)) * 100
    const ageTrackW = SCREEN_W - 80
    const onAgeTouch = (pageX: number) => {
      const raw = ((pageX - 40) / ageTrackW) * (70 - 18) + 18
      setAge(Math.max(18, Math.min(70, Math.round(raw))))
    }
    return (
      <View style={s.stepContainer}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepBodyScroll} showsVerticalScrollIndicator={false}>
          <StepDots current={1} total={4} />
          <Text style={s.stepTitle}>Let's start with you</Text>
          <Text style={s.stepDesc}>This personalises your entire experience.</Text>

          {/* Name */}
          <Text style={s.fieldLabel}>Your name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Arjun Sharma"
            placeholderTextColor={TXT3}
            style={s.textInput}
          />

          {/* Age */}
          <View style={{ marginTop: 24 }}>
            <View style={s.sliderHeader}>
              <Text style={s.fieldLabel}>Your age</Text>
              <View style={[s.sliderBadge, { backgroundColor: BLUE + '18' }]}>
                <Text style={[s.sliderBadgeText, { color: BLUE }]}>{age} years</Text>
              </View>
            </View>
            <View
              style={s.sliderTrackWrap}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={e => onAgeTouch(e.nativeEvent.pageX)}
              onResponderMove={e => onAgeTouch(e.nativeEvent.pageX)}
            >
              <View style={s.sliderTrackBg} />
              <View style={[s.sliderTrackFill, { width: `${agePct}%`, backgroundColor: BLUE }]} />
              <View style={[s.sliderThumb, { left: `${agePct}%`, backgroundColor: BLUE }]} />
            </View>
            <View style={s.sliderMinMax}>
              <Text style={s.sliderMinMaxText}>18</Text>
              <Text style={s.sliderMinMaxText}>70</Text>
            </View>
          </View>

          {/* Income type */}
          <Text style={[s.fieldLabel, { marginTop: 24 }]}>Income type</Text>
          <View style={s.incomeTypeRow}>
            {(['salary', 'business', 'freelance'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[s.incomeTypeChip, incomeType === type && s.incomeTypeChipActive]}
                onPress={() => setIncomeType(type)}
              >
                <Text style={[s.incomeTypeChipText, incomeType === type && s.incomeTypeChipTextActive]}>
                  {type === 'salary' ? '💼 Salaried' : type === 'business' ? '📊 Business' : '👤 Freelance'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={s.navArea}>
          <View style={s.navRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => animateTo(0)}>
              <Text style={s.backBtnText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, { flex: 1 }, !name.trim() && { backgroundColor: BG_SEC }]}
              onPress={() => animateTo(2)}
              activeOpacity={0.85}
              disabled={!name.trim()}
            >
              <Text style={[s.primaryBtnText, !name.trim() && { color: TXT3 }]}>Continue</Text>
              {name.trim() ? <Text style={s.primaryBtnArrow}>›</Text> : null}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ─── Step 2: Income & Expenses ───────────────────────────────────
  const renderIncomeExpenses = () => (
    <View style={s.stepContainer}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepBodyScroll} showsVerticalScrollIndicator={false}>
        <StepDots current={2} total={4} />
        <Text style={s.stepTitle}>Your monthly money flow</Text>
        <Text style={s.stepDesc}>This is your base — AI adjusts when income changes month to month.</Text>

        {/* Income card */}
        <View style={s.incomeCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View>
              <Text style={s.sliderLabel}>Monthly Income</Text>
              <Text style={s.sliderSub}>Your take-home / net income</Text>
            </View>
            <View style={[s.sliderBadge, { backgroundColor: BLUE + '15' }]}>
              <Text style={[s.sliderBadgeText, { color: BLUE, fontSize: 16 }]}>{fmtInr(income)}</Text>
            </View>
          </View>
          <SliderRow label="" value={income} min={INCOME_MIN} max={INCOME_MAX} step={5000} color={BLUE} onChange={setIncome} />
        </View>

        {/* Expense breakdown card */}
        <View style={s.expenseCard}>
          <Text style={[s.sliderLabel, { fontWeight: '800', marginBottom: 16 }]}>Monthly Expenses Breakdown</Text>
          <View style={{ gap: 20 }}>
            <SliderRow label="Essentials" sublabel="Rent, groceries, utilities, transport" value={essentials} min={5000} max={Math.round(income * 0.7)} step={500} color={BLUE} onChange={setEssentials} />
            <SliderRow label="Lifestyle" sublabel="Dining, shopping, entertainment" value={lifestyle} min={0} max={Math.round(income * 0.5)} step={500} color={ORANGE} onChange={setLifestyle} />
            <SliderRow label="EMIs / Loans" sublabel="Home loan, car loan, personal loan" value={emis} min={0} max={Math.round(income * 0.5)} step={500} color={INDIGO} onChange={setEmis} />
          </View>
        </View>

        {/* Savings preview */}
        <View style={[s.savingsPreview, { backgroundColor: savings >= 0 ? GREEN_L : '#FEE2E2', borderColor: savings >= 0 ? '#BBF7D0' : '#FCA5A5' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.savingsLabel, { color: savings >= 0 ? GREEN_H : RED }]}>Monthly Savings</Text>
            <Text style={s.savingsAmount}>{fmtInr(Math.abs(savings))}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 11, color: TXT3 }}>Savings rate</Text>
            <Text style={[s.savingsRate, { color: savings >= 0 ? GREEN_H : RED }]}>{savePct}%</Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.navArea}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => animateTo(1)}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={() => animateTo(3)} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Continue</Text>
            <Text style={s.primaryBtnArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  // ─── Step 3: Goals (select only) ───────────────────────────────────
  const renderGoals = () => (
    <View style={s.stepContainer}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepBodyScroll} showsVerticalScrollIndicator={false}>
        <StepDots current={3} total={4} />
        <Text style={s.stepTitle}>What are you working towards?</Text>
        <Text style={s.stepDesc}>Select your goals — you can set targets and amounts later in the Goals tab.</Text>

        <View style={s.goalsGrid}>
          {GOAL_CHIPS.map(({ id, label, emoji }) => {
            const selected = selectedGoals.includes(id)
            return (
              <TouchableOpacity key={id} style={[s.goalChip, selected && s.goalChipSelected]} onPress={() => toggleGoal(id)} activeOpacity={0.75}>
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
                <Text style={[s.goalChipText, selected && s.goalChipTextSelected]}>{label}</Text>
                {selected && (
                  <View style={s.goalCheck}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {selectedGoals.length > 0 && (
          <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: TEAL_L, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 14 }}>✨</Text>
            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: TEAL, flex: 1, lineHeight: 18 }}>
              {selectedGoals.length} goal{selectedGoals.length !== 1 ? 's' : ''} selected. You can set target amounts and timelines in the Goals tab after setup.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={s.navArea}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => animateTo(2)}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.primaryBtn, { flex: 1 }]}
            onPress={() => animateTo(4)}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>
              {selectedGoals.length > 0 ? 'Build my plan' : 'Skip for now'}
            </Text>
            <Text style={s.primaryBtnArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  // ─── Step 5: AI Summary ─────────────────────────────────────────
  const renderSummary = () => {
    // Engine-driven insight
    const planInsight = savePct >= 20
      ? `You're saving ${savePct}% — above the 20% benchmark. Start a SIP to grow your surplus.`
      : savePct >= 10
      ? `Saving ${savePct}%. Trim lifestyle by ${fmtInr(Math.round(lifestyle * 0.15))} to reach 20%.`
      : savings > 0
      ? `Saving only ${savePct}%. Cut ₹${Math.round((income * 0.2 - savings)).toLocaleString('en-IN')} from spending to build wealth.`
      : `You're spending more than you earn. Reduce expenses by ${fmtInr(Math.abs(savings))} to break even.`

    return (
      <View style={s.stepContainer}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {/* Dark hero */}
          <View style={s.summaryHero}>
            <View style={s.heroBlob1} />
            <View style={s.heroBlob2} />
            <View style={s.heroWatermark} pointerEvents="none">
              <ArthFlowLogo size={100} />
            </View>
            <View style={{ position: 'relative', zIndex: 1, alignItems: 'center' }}>
              <ArthFlowLogo size={28} />
              <Text style={s.summaryGreeting}>Hello, {name || 'Friend'} 👋</Text>
              <Text style={s.summaryHeadline}>Here's your plan</Text>

              <View style={s.summaryStats}>
                {[
                  { label: 'Income', value: fmtInr(income) },
                  { label: 'Expenses', value: fmtInr(totalExpenses) },
                  { label: 'Savings', value: fmtInr(Math.max(0, savings)) },
                ].map(({ label, value }) => (
                  <View key={label} style={{ alignItems: 'center' }}>
                    <Text style={s.summaryStatVal}>{value}</Text>
                    <Text style={s.summaryStatLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 16 }}>
            {/* Risk profile card */}
            <View style={s.summaryCard}>
              <View style={[s.riskIconBox, { backgroundColor: riskCfg.color + '15' }]}>
                <Text style={{ fontSize: 26 }}>{riskCfg.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.riskTitle}>Risk Profile: {riskCfg.label}</Text>
                <Text style={s.riskSub}>Age {age} · {riskCfg.equity}% equity / {riskCfg.debt}% debt recommended</Text>
              </View>
            </View>

            {/* What AI will do */}
            <View style={s.summaryCard}>
              <View style={{ width: '100%' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 14 }}>✨</Text>
                  <Text style={[s.sliderLabel, { fontWeight: '800' }]}>What ArthFlow AI will do for you</Text>
                </View>
                {[
                  `Build investment plans for your ${selectedGoals.length || 0} goal${selectedGoals.length !== 1 ? 's' : ''}`,
                  'Track income changes month to month',
                  'Alert you when you\'re off track on spending',
                  'Identify protection gaps based on your age & assets',
                ].map((txt, i) => (
                  <View key={i} style={[s.aiDoRow, i < 3 && { borderBottomWidth: 1, borderBottomColor: BG_SEC }]}>
                    <View style={s.aiDoCheck}>
                      <Text style={{ fontSize: 10, color: GREEN_H }}>✓</Text>
                    </View>
                    <Text style={s.aiDoText}>{txt}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* SEBI disclaimer */}
            <View style={s.sebiBox}>
              <Text style={s.sebiText}>
                ⚠️ ArthFlow AI provides educational financial insights, not SEBI-registered investment advice. Always consult a qualified advisor before investing.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={s.navArea}>
          <TouchableOpacity style={s.primaryBtn} onPress={handleFinish} activeOpacity={0.85} disabled={saving}>
            <Text style={s.primaryBtnText}>{saving ? 'Setting up...' : 'Enter ArthFlow'}</Text>
            <Text style={s.primaryBtnArrow}>⚡</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const steps = [renderWelcome, renderBasics, renderIncomeExpenses, renderGoals, renderSummary]

  return (
    <View style={s.root}>
      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {steps[step]()}
      </Animated.View>
    </View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  stepContainer: { flex: 1 },

  // Welcome hero
  welcomeHero: { backgroundColor: '#0B1B4A', paddingTop: 72, paddingBottom: 56, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  heroBlob1: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(30,58,138,0.55)' },
  heroBlob2: { position: 'absolute', bottom: -40, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(200,134,10,0.12)' },
  heroWatermark: { position: 'absolute', right: -10, bottom: -10, opacity: 0.04, zIndex: 0 },
  welcomeHeroContent: { alignItems: 'center', zIndex: 1 },
  welcomeLogoText: { fontFamily: 'Manrope_700Bold', fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 2, marginTop: 12 },
  welcomeTagline: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 6 },
  welcomeBody: { flex: 1, paddingHorizontal: 24, paddingTop: 28, gap: 18 },
  welcomeTitle: { fontFamily: 'Manrope_700Bold', fontSize: 24, fontWeight: '800', color: TXT1, letterSpacing: -0.3, lineHeight: 30 },
  welcomeDesc: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: TXT3, lineHeight: 22, marginBottom: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, fontWeight: '800', color: TXT1 },
  featureDesc: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT3, marginTop: 1 },

  // Steps
  stepBody: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  stepBodyScroll: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 20 },
  stepTitle: { fontFamily: 'Manrope_700Bold', fontSize: 24, fontWeight: '800', color: TXT1, letterSpacing: -0.3, lineHeight: 30, marginTop: 20 },
  stepDesc: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: TXT3, marginTop: 6, lineHeight: 22 },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { height: 4, width: 8, borderRadius: 2, backgroundColor: BG_SEC },
  stepDotActive: { width: 28, backgroundColor: BLUE },
  stepLabel: { fontFamily: 'Manrope_400Regular', fontSize: 12, fontWeight: '600', color: TXT3, marginLeft: 4 },

  // Slider
  sliderWrap: { marginTop: 8 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sliderLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, fontWeight: '700', color: TXT1 },
  sliderSub: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: TXT3, marginTop: 1 },
  sliderBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  sliderBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 15, fontWeight: '800' },
  sliderTrackWrap: { height: 40, justifyContent: 'center', position: 'relative' },
  sliderTrackBg: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: BG_SEC },
  sliderTrackFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3 },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4, borderWidth: 3, borderColor: '#fff' },
  sliderMinMax: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sliderMinMaxText: { fontFamily: 'Manrope_400Regular', fontSize: 11, fontWeight: '600', color: TXT3 },

  // Income step
  incomeTypeRow: { flexDirection: 'row', gap: 10 },
  incomeTypeChip: { flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', backgroundColor: '#fff' },
  incomeTypeChipActive: { borderColor: BLUE, backgroundColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  incomeTypeChipText: { fontFamily: 'Manrope_700Bold', fontSize: 12, fontWeight: '700', color: TXT2 },
  incomeTypeChipTextActive: { color: '#fff' },

  // Basics step
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13, fontWeight: '700', color: TXT2, marginBottom: 8, marginTop: 0 },
  textInput: { height: 52, borderRadius: 16, backgroundColor: BG_SEC, paddingHorizontal: 16, fontFamily: 'Manrope_700Bold', fontSize: 16, fontWeight: '700', color: TXT1 },
  riskCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginTop: 16, borderWidth: 1 },
  riskTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, fontWeight: '800', color: TXT1 },
  riskSub: { fontFamily: 'Manrope_400Regular', fontSize: 11, fontWeight: '500', color: TXT2, marginTop: 2 },

  // Income & Expenses step
  incomeCard: { borderRadius: 20, backgroundColor: '#fff', padding: 16, marginTop: 20, borderWidth: 1, borderColor: BORDER, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 2 },
  expenseCard: { borderRadius: 20, backgroundColor: '#fff', padding: 16, marginTop: 12, borderWidth: 1, borderColor: BORDER, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 2 },
  savingsPreview: { flexDirection: 'row', borderRadius: 20, padding: 16, marginTop: 12, borderWidth: 1, alignItems: 'center' },
  savingsLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, fontWeight: '700' },
  savingsAmount: { fontFamily: 'Manrope_700Bold', fontSize: 24, fontWeight: '800', color: TXT1, marginTop: 2 },
  savingsRate: { fontFamily: 'Manrope_700Bold', fontSize: 20, fontWeight: '800' },

  // Assets step
  netWorthPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginTop: 16, marginBottom: 8, backgroundColor: '#0B1B4A' },
  netWorthLabel: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  netWorthAmount: { fontFamily: 'Manrope_700Bold', fontSize: 20, fontWeight: '800', color: '#E0A820' },
  assetFieldCard: { borderRadius: 18, backgroundColor: '#fff', padding: 16, marginTop: 12, borderWidth: 1, borderColor: BORDER, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 2 },
  currencyInputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: BG_SEC, height: 52, paddingHorizontal: 16, gap: 8 },
  currencyPrefix: { fontFamily: 'Manrope_700Bold', fontSize: 16, fontWeight: '700', color: TXT3 },
  currencyInput: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 18, fontWeight: '800', color: TXT1 },

  // Goal detail editors
  goalDetailCard: { borderRadius: 18, backgroundColor: '#fff', marginBottom: 12, borderWidth: 1, borderColor: BORDER, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 2, overflow: 'hidden' },
  goalDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  goalDetailName: { fontFamily: 'Manrope_700Bold', fontSize: 13, fontWeight: '800', color: TXT1 },
  goalDetailSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, fontWeight: '600', color: TXT3 },
  goalDetailBody: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: BG_SEC, paddingTop: 12 },
  goalDetailFieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, fontWeight: '700', color: TXT2, marginBottom: 6 },

  // Summary step
  summaryHero: { backgroundColor: '#0B1B4A', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 24, position: 'relative', overflow: 'hidden' },
  summaryGreeting: { fontFamily: 'Manrope_400Regular', fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 16, marginBottom: 4 },
  summaryHeadline: { fontFamily: 'Manrope_700Bold', fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  summaryStats: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 24 },
  summaryStatVal: { fontFamily: 'Manrope_700Bold', fontSize: 18, fontWeight: '800', color: '#E0A820' },
  summaryStatLabel: { fontFamily: 'Manrope_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 20, padding: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 2 },
  riskIconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aiDoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  aiDoCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: GREEN_L, alignItems: 'center', justifyContent: 'center' },
  aiDoText: { fontFamily: 'Manrope_400Regular', fontSize: 13, fontWeight: '500', color: TXT1, flex: 1 },
  sebiBox: { borderRadius: 18, padding: 14, backgroundColor: ORANGE_L, borderWidth: 1, borderColor: '#FDE68A' },
  sebiText: { fontFamily: 'Manrope_400Regular', fontSize: 11, fontWeight: '600', color: '#92400E', lineHeight: 18 },

  // Expenses summary (legacy - keep for compat)
  summaryBox: { borderRadius: 16, padding: 16, marginTop: 24, borderWidth: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel: { fontFamily: 'Manrope_400Regular', fontSize: 13, fontWeight: '600', color: TXT2 },
  summaryRowValue: { fontFamily: 'Manrope_700Bold', fontSize: 14, fontWeight: '800', color: TXT1 },
  summaryRowValueBig: { fontFamily: 'Manrope_700Bold', fontSize: 15, fontWeight: '800' },

  // Goal chips
  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  goalChip: { width: (SCREEN_W - 60) / 2, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 2, borderColor: BORDER, backgroundColor: '#fff' },
  goalChipSelected: { borderColor: BLUE, backgroundColor: BLUE_L },
  goalChipText: { fontFamily: 'Manrope_400Regular', fontSize: 12, fontWeight: '600', color: TXT3, flex: 1 },
  goalChipTextSelected: { fontFamily: 'Manrope_700Bold', fontWeight: '800', color: BLUE },
  goalCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },

  // Navigation
  navArea: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  navRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: { backgroundColor: BLUE, borderRadius: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 24, elevation: 8 },
  primaryBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, fontWeight: '800', color: '#fff' },
  primaryBtnArrow: { fontSize: 20, fontWeight: '300', color: '#fff' },
  backBtn: { width: 56, borderRadius: 16, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 24, fontWeight: '300', color: TXT2 },
  trustText: { fontFamily: 'Manrope_400Regular', fontSize: 11, fontWeight: '600', color: TXT3, textAlign: 'center', marginTop: 12 },
})
