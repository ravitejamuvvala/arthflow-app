import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
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
import { supabase } from '../lib/supabase'
import { Goal, Profile, Transaction } from '../types'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE   = '#1E3A8A'
const BLUE_L = '#DBEAFE'
const GREEN  = '#22C55E'
const GREEN_L = '#DCFCE7'
const ORANGE = '#F59E0B'
const ORANGE_L = '#FEF3C7'
const RED    = '#EF4444'
const RED_L  = '#FEE2E2'
const TEAL   = '#14B8A6'
const TEAL_L = '#CCFBF1'
const TXT1   = '#111827'
const TXT2   = '#6B7280'
const TXT3   = '#9CA3AF'
const BORDER = '#E5E7EB'
const BG     = '#F9FAFB'
const BG_SEC = '#F1F5F9'

// ─── Types ──────────────────────────────────────────────────────────────
type Tab = 'insights' | 'chat' | 'reports'

interface InsightMetric {
  label: string
  value: string
}

interface Insight {
  id: string
  type: 'warning' | 'positive' | 'neutral' | 'risk'
  priority: number
  category: string
  title: string
  message: string
  metric?: InsightMetric
  actions?: string[]
}

interface ChatMsg {
  id: string
  role: 'user' | 'ai'
  text: string
}

// ─── Insight accent colours ─────────────────────────────────────────────
const INSIGHT_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  warning:  { border: ORANGE, bg: ORANGE_L, icon: '⚠️' },
  positive: { border: GREEN,  bg: GREEN_L,  icon: '✅' },
  neutral:  { border: TEAL,   bg: TEAL_L,   icon: 'ℹ️' },
  risk:     { border: RED,    bg: RED_L,     icon: '🛡️' },
}

// ─── Quick prompts ──────────────────────────────────────────────────────
const PROMPTS = [
  'How am I doing?',
  'Cut my expenses',
  'Best SIP for me',
  'Emergency fund plan',
  'Tax saving tips',
  'Insurance check',
]

// ─── Local AI reply (keyword-matching) ──────────────────────────────────
function generateAIReply(msg: string, txns: Transaction[], goals: Goal[], profile: Profile | null): string {
  const lc = msg.toLowerCase()
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExp = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const saved = Math.max(0, income - totalExp)
  const savePct = income > 0 ? Math.round((saved / income) * 100) : 0
  const age = profile?.age ?? 28
  const name = profile?.full_name?.split(' ')[0] ?? 'there'
  const monthlyIncome = profile?.monthly_income ?? income

  // Net worth from goals saved (rough proxy since we don't have assets in this context)
  const totalSaved = goals.reduce((s, g) => s + (g.current_amount || 0), 0)

  if (lc.includes('how am i doing') || lc.includes('overall')) {
    return `Here's your financial snapshot, ${name}: You earn ${fmtInr(income)}/month and spend ${fmtInr(totalExp)} (${income > 0 ? Math.round((totalExp / income) * 100) : 0}%). You're saving ${fmtInr(saved)}/month (${savePct}%). ${savePct >= 20 ? "That's solid — above the 20% benchmark! ✅" : "You're below the 20% savings target — let's fix that."}`
  }

  if (lc.includes('cut') || lc.includes('reduc') || lc.includes('expense')) {
    const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
    const lifestylePct = income > 0 ? Math.round((lifestyle / income) * 100) : 0
    const limit30 = Math.round(income * 0.30)
    return `Your lifestyle spending is ₹${lifestyle.toLocaleString('en-IN')}/month (${lifestylePct}% of income). The 30% rule allows ${fmtInr(limit30)} for lifestyle — ${lifestyle > limit30 ? `you could save ${fmtInr(lifestyle - limit30)} by trimming dining and shopping.` : 'you\'re within the limit!'} Try the 10% rule: cut each lifestyle category by 10% next month.`
  }

  if (lc.includes('sip') || lc.includes('invest') || lc.includes('mutual')) {
    const riskLabel = age < 30 ? 'Aggressive' : age < 40 ? 'Balanced' : age < 50 ? 'Moderate' : 'Conservative'
    const idealEq = Math.min(80, 100 - age)
    const sipAmt = Math.round(saved * 0.8)
    return `At age ${age} with ${riskLabel} profile, your ideal equity allocation is ${idealEq}%. For SIP, I recommend: 60% Nifty 50 Index Fund (low cost, broad exposure), 25% Mid/Small-cap Fund (higher growth), 15% International Fund (diversification). Start with ${fmtInr(sipAmt)}/month (80% of savings). Use ELSS funds to save up to ₹46,800 in tax under 80C.`
  }

  if (lc.includes('emergency') || lc.includes('fund')) {
    const needed = totalExp * 6
    const have = saved // approximate with monthly savings
    return `Emergency fund target: ${fmtInr(needed)} (6 months of expenses). ${totalExp > 0 ? `To fill this in 12 months, set aside ${fmtInr(Math.ceil(needed / 12))}/month in a liquid mutual fund or high-yield savings account.` : 'Add expense transactions so I can estimate your ideal fund size.'}`
  }

  if (lc.includes('tax') || lc.includes('80c') || lc.includes('saving tip')) {
    return `Tax-saving roadmap for you:\n1) PPF: Max ₹1.5L/year → saves ₹46,800 tax (30% slab)\n2) ELSS MF: Same 80C limit, 3yr lock-in, equity returns\n3) NPS: Additional ₹50,000 under 80CCD(1B) → saves ₹15,600 more\n4) Home loan interest (80EEA)\nTotal potential tax saving: ₹62,400+. Start with PPF and ELSS as they're most tax-efficient at your age.`
  }

  if (lc.includes('insurance') || lc.includes('protect') || lc.includes('check')) {
    const termCover = monthlyIncome * 12 * 15
    return `Insurance priorities for age ${age}:\n1) Term Life: ${fmtInr(termCover)} cover (15× annual income). At your age, costs ~₹700/month for ₹1Cr — cheapest you'll ever buy.\n2) Health: ₹10L personal cover (~₹700/month). Even if employer covers you, get a personal top-up.\n3) Critical illness rider: optional but recommended.\nTotal insurance budget: keep under 5% of income = ${fmtInr(Math.round(monthlyIncome * 0.05))}/month.`
  }

  if (lc.includes('save') || lc.includes('saving')) {
    const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
    if (lifestyle > 0) {
      return `Your lifestyle spending is ₹${lifestyle.toLocaleString('en-IN')} this month. Try cutting 20% to save an extra ₹${Math.round(lifestyle * 0.2).toLocaleString('en-IN')}/mo. The 50/30/20 rule suggests max 30% on lifestyle.`
    }
    return 'Track more transactions so I can find saving opportunities for you!'
  }

  if (lc.includes('goal') || lc.includes('track')) {
    if (goals.length === 0) return 'You haven\'t set any goals yet. Head to the Goals tab to create one!'
    const g = goals[0]
    const pct = Math.min(100, Math.round(((g.current_amount || 0) / g.target_amount) * 100))
    return `Your top goal "${g.name}" is ${pct}% funded (${fmtInr(g.current_amount || 0)} of ${fmtInr(g.target_amount)}). ${pct < 50 ? 'Consider increasing your SIP to catch up.' : 'Great progress — keep it up!'}`
  }

  if (lc.includes('spend') || lc.includes('summary')) {
    return `You've spent ₹${totalExp.toLocaleString('en-IN')} this month across ${txns.filter(t => t.type === 'expense').length} transactions (${savePct}% savings rate). Check the Reports tab for a category breakdown.`
  }

  return `Based on your profile (${fmtInr(monthlyIncome)}/month, age ${age}), your top action: ${savePct < 20 ? 'boost savings to 20% by trimming lifestyle spending.' : 'review asset allocation and insurance coverage for long-term protection.'}`
}

// ─── Compute insights from data (9 categories matching design) ──────────
function computeInsights(txns: Transaction[], goals: Goal[], profile: Profile | null): Insight[] {
  const out: Insight[] = []
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const essentials = txns.filter(t => t.category === 'essentials').reduce((s, t) => s + t.amount, 0)
  const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
  const emis = txns.filter(t => t.category === 'emis').reduce((s, t) => s + t.amount, 0)
  const totalExp = essentials + lifestyle + emis
  const saved = Math.max(0, income - totalExp)
  const savingsPct = income > 0 ? Math.round((saved / income) * 100) : 0
  const needsPct = income > 0 ? Math.round(((essentials + emis) / income) * 100) : 0
  const wantsPct = income > 0 ? Math.round((lifestyle / income) * 100) : 0
  const age = profile?.age ?? 28
  const incomeType = profile?.income_type ?? 'salary'
  const monthlyIncome = profile?.monthly_income ?? income
  const annualIncome = monthlyIncome * 12

  // ── 1. Budget 50/30/20 Rule ──────────────────────────
  if (needsPct > 55 && income > 0) {
    out.push({ id: 'rule-needs', type: 'warning', priority: 1, category: 'Budget 50/30/20',
      title: `Needs eating ${needsPct}% of income`,
      message: `The 50/30/20 rule caps essentials + EMIs at 50% of income. You're at ${needsPct}%. Consider refinancing high-cost EMIs (total ${fmtInr(emis)}/mo) or reducing fixed costs to free up ${fmtInr(Math.max(0, (essentials + emis) - income * 0.50))}/month.`,
      metric: { label: 'of income on needs', value: `${needsPct}%` },
      actions: ['Review EMIs', 'See savings tips'],
    })
  }

  if (wantsPct > 30 && income > 0) {
    const overshoot = lifestyle - income * 0.30
    out.push({ id: 'rule-wants', type: 'warning', priority: 2, category: 'Budget 50/30/20',
      title: `Lifestyle spend at ${wantsPct}% (limit: 30%)`,
      message: `You're spending ${fmtInr(Math.max(0, overshoot))} over the 30% lifestyle budget. Even cutting 20% saves ${fmtInr(Math.round(lifestyle * 0.20))}/month.`,
      metric: { label: 'over lifestyle limit', value: `+${fmtInr(Math.max(0, overshoot))}` },
      actions: ['Show where to cut', 'Adjust budget'],
    })
  }

  if (savingsPct < 15 && income > 0) {
    out.push({ id: 'savings-low', type: 'warning', priority: 1, category: 'Savings',
      title: `Saving only ${savingsPct}% — target is 20%`,
      message: `You're saving ${fmtInr(saved)}/month (${savingsPct}%). The 20% benchmark means ${fmtInr(Math.round(income * 0.20))}/month. A ${fmtInr(Math.round(income * 0.20 - saved))} increase via expense cuts would put you on track.`,
      metric: { label: 'savings rate', value: `${savingsPct}%` },
      actions: ['Boost savings', 'Show expense cuts'],
    })
  } else if (savingsPct >= 25 && income > 0) {
    const tenYearValue = Math.round(saved * ((Math.pow(1.01, 120) - 1) / 0.01))
    out.push({ id: 'savings-great', type: 'positive', priority: 6, category: 'Savings',
      title: `Excellent ${savingsPct}% savings rate! 🎉`,
      message: `Saving ${fmtInr(saved)}/month at ${savingsPct}% — far above the 20% rule. If invested at 12% CAGR, this alone grows to ${fmtInr(tenYearValue)} in 10 years.`,
      metric: { label: 'invested over 10yr', value: fmtInr(tenYearValue) },
      actions: ['Invest the surplus'],
    })
  }

  // ── 2. Emergency Fund (6 months rule) ────────────────────────────
  const emergencyNeeded = totalExp * 6
  // Use liquidCash from assets if available (loaded via AsyncStorage in WealthScreen)
  // For now, approximate with saved amount as proxy
  const monthsCovered = totalExp > 0 ? Math.min(12, +(saved / totalExp).toFixed(1)) : 0

  if (monthsCovered < 2 && totalExp > 0) {
    out.push({ id: 'emergency-critical', type: 'risk', priority: 1, category: 'Protection',
      title: `Emergency fund: only ${monthsCovered} months covered`,
      message: `You need ${fmtInr(emergencyNeeded)} (6× monthly expenses of ${fmtInr(totalExp)}) in liquid savings. Build this before aggressive investing.`,
      metric: { label: 'months of cover', value: `${monthsCovered}` },
      actions: ['Start emergency SIP', 'Set a goal'],
    })
  } else if (monthsCovered < 6 && totalExp > 0) {
    out.push({ id: 'emergency-partial', type: 'warning', priority: 2, category: 'Protection',
      title: `Emergency fund at ${monthsCovered}/6 months`,
      message: `You're ${(6 - monthsCovered).toFixed(1)} months short of full cover. Add ${fmtInr(Math.ceil((emergencyNeeded) / 12))}/month to liquid savings to reach ${fmtInr(emergencyNeeded)} in a year.`,
      metric: { label: 'still needed', value: fmtInr(Math.max(0, emergencyNeeded)) },
      actions: ['Top up emergency fund'],
    })
  } else if (monthsCovered >= 6) {
    out.push({ id: 'emergency-good', type: 'positive', priority: 5, category: 'Protection',
      title: `Emergency fund: ${monthsCovered} months ✓`,
      message: `You have ${monthsCovered} months of expenses in savings — above the 6-month benchmark. You're protected against sudden income loss.`,
      metric: { label: 'months of cover', value: `${monthsCovered}` },
    })
  }

  // ── 3. Term Insurance (15× annual income) ────────────────────────
  if (annualIncome > 0) {
    const termRecommended = annualIncome * 15
    out.push({ id: 'term-insurance', type: 'risk', priority: 2, category: 'Insurance',
      title: `Term life cover needed: ${fmtInr(termRecommended)}`,
      message: `Standard formula: 15× annual income = ${fmtInr(termRecommended)} term cover for age ${age}. A ₹1Cr term plan at your age costs ~₹650–800/month. Every year you wait pushes premiums up by ~5%.`,
      metric: { label: 'recommended cover', value: fmtInr(termRecommended) },
      actions: ['Compare term plans', 'Already covered ✓'],
    })
  }

  // ── 4. Health Insurance ───────────────────────────────────────────
  out.push({ id: 'health-insurance', type: 'neutral', priority: 3, category: 'Insurance',
    title: `Health cover: ₹10L recommended for age ${age}`,
    message: `For a ${age}-year-old, a personal ₹10L health cover is ideal (₹${age < 30 ? '600–900' : '900–1,400'}/month). If your employer covers you, get a personal top-up — employer covers end when you switch jobs.`,
    metric: { label: 'ideal cover', value: '₹10L' },
    actions: ['Compare health plans', 'Already covered ✓'],
  })

  // ── 5. Goal gap analysis ──────────────────────────────────────────
  const currentYear = new Date().getFullYear()
  goals.forEach(g => {
    const targetYear = new Date(g.target_date).getFullYear()
    const yearsLeft = Math.max(1, targetYear - currentYear)
    const monthsLeft = yearsLeft * 12
    const remaining = Math.max(0, g.target_amount - (g.current_amount || 0))
    const monthlyNeeded = Math.ceil(remaining / monthsLeft)
    const pct = g.target_amount > 0 ? (g.current_amount || 0) / g.target_amount : 0

    if (pct < 0.25 && g.target_amount > 0) {
      out.push({ id: `goal-gap-${g.id}`, type: 'warning', priority: 2, category: 'Goals',
        title: `${g.name} needs ${fmtInr(monthlyNeeded)}/month`,
        message: `To reach ${fmtInr(g.target_amount)} by ${targetYear} (${yearsLeft} yrs), you need ${fmtInr(monthlyNeeded)}/month. Only ${Math.round(pct * 100)}% funded. Either increase SIP or extend timeline.`,
        metric: { label: 'monthly needed', value: fmtInr(monthlyNeeded) },
        actions: [`Boost ${g.name} SIP`, 'Extend timeline'],
      })
    } else if (pct >= 0.25 && yearsLeft > 0) {
      out.push({ id: `goal-ok-${g.id}`, type: 'positive', priority: 6, category: 'Goals',
        title: `${g.name} is on track ✓`,
        message: `${Math.round(pct * 100)}% funded (${fmtInr(g.current_amount || 0)} of ${fmtInr(g.target_amount)}). On pace to hit target by ${targetYear}.`,
        metric: { label: 'funded', value: `${Math.round(pct * 100)}%` },
      })
    }
  })

  // ── 6. PPF 80C optimisation ────────────────────────────────────────
  if (incomeType === 'salary' && annualIncome > 600000) {
    const taxSaved = Math.round(150000 * 0.30)
    out.push({ id: 'ppf-80c', type: 'neutral', priority: 4, category: 'Tax Planning',
      title: 'PPF: Unlock ₹1.5L 80C tax benefit',
      message: `Investing the max ₹1.5L/year in PPF saves ${fmtInr(taxSaved)} in income tax (30% slab) + earns 7.1% risk-free. Deadline: March 31 for current FY benefit.`,
      metric: { label: 'max tax saving', value: fmtInr(taxSaved) },
      actions: ['Invest in PPF', 'Explore 80C options'],
    })
  }

  // ── 7. Net worth milestone ─────────────────────────────────────────
  if (annualIncome > 0) {
    const idealNWRatio = Math.max(0, (age - 22) * 0.5)
    const idealNW = Math.round(annualIncome * idealNWRatio)
    if (idealNWRatio > 0) {
      out.push({ id: 'nw-milestone', type: 'neutral', priority: 4, category: 'Net Worth',
        title: `Net worth target: ${fmtInr(idealNW)}`,
        message: `By age ${age}, a common benchmark is ${idealNWRatio.toFixed(1)}× annual income (${fmtInr(idealNW)} net worth). Increasing monthly investment can close the gap over 3 years.`,
        metric: { label: 'target', value: `${idealNWRatio.toFixed(1)}× income` },
        actions: ['Increase investments'],
      })
    }
  }

  // ── 8. Overall strong health ──────────────────────────────────────
  if (savingsPct >= 20 && monthsCovered >= 4) {
    out.push({ id: 'strong-overall', type: 'positive', priority: 6, category: 'Overall Health',
      title: '🌟 Strong financial foundation',
      message: `Savings rate ${savingsPct}%, ${monthsCovered} months emergency cover — you're in a strong position for your age group. Focus now on optimising asset allocation and insurance coverage.`,
      metric: { label: 'financial health', value: 'Strong' },
    })
  }

  // Fallback if nothing generated
  if (out.length === 0) {
    out.push({ id: 'all-good', type: 'positive', priority: 6, category: 'Overview',
      title: 'Looking good! 🎉',
      message: 'No urgent insights right now. Keep tracking your expenses and stay on target with your goals.',
    })
  }

  return out.sort((a, b) => a.priority - b.priority)
}

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════
export default function PlanScreen() {
  const [tab, setTab] = useState<Tab>('insights')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Data
  const [txns, setTxns] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: '0', role: 'ai', text: 'Hi! I\'m your AI financial coach. Ask me anything about your money — spending, goals, savings, or insurance.' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const chatScroll = useRef<ScrollView>(null)

  // Typing dots animation
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  const animateTyping = useCallback(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      )
    Animated.parallel([anim(dot1, 0), anim(dot2, 150), anim(dot3, 300)]).start()
  }, [dot1, dot2, dot3])

  // ─── Fetch data ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [txnRes, goalRes, profileRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).gte('date', monthStart).order('date', { ascending: false }),
        supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])

      const t = (txnRes.data || []) as Transaction[]
      const g = (goalRes.data || []) as Goal[]
      setTxns(t)
      setGoals(g)
      setProfile(profileRes.data ?? null)
      setInsights(computeInsights(t, g, profileRes.data ?? null))
    } catch (e) {
      console.error('PlanScreen loadData error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const onRefresh = () => { setRefreshing(true); loadData() }

  // ─── Send chat message ─────────────────────────────────────────────
  const sendMessage = (text?: string) => {
    const msg = (text || chatInput).trim()
    if (!msg) return
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', text: msg }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setTyping(true)
    animateTyping()

    setTimeout(() => {
      const reply = generateAIReply(msg, txns, goals, profile)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
      setTyping(false)
      dot1.setValue(0); dot2.setValue(0); dot3.setValue(0)
    }, 1200)
  }

  // ─── Dismiss insight ───────────────────────────────────────────────
  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id))
  const activeInsights = insights.filter(i => !dismissed.has(i.id))

  // ─── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={BLUE} /></View>
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      {/* ── App Bar ─────────────────────────────────────────────────── */}
      <View style={s.appBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ArthFlowLogo size={22} />
          <View style={{ width: 1, height: 18, backgroundColor: BORDER, marginHorizontal: 2 }} />
          <Text style={s.appTitle}>AI Coach</Text>
          {activeInsights.length > 0 && (
            <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: TEAL_L }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: TEAL, fontFamily: 'Manrope_700Bold' }}>{activeInsights.length} insights</Text>
            </View>
          )}
        </View>
        <View style={s.badge}><Text style={s.badgeTxt}>✨ AI Active</Text></View>
      </View>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <View style={s.tabs}>
        {(['insights', 'chat', 'reports'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'insights' ? '💡 Insights' : t === 'chat' ? '💬 Chat' : '📊 Reports'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BLUE]} />}
        >
          {activeInsights.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={s.emptyTitle}>All caught up!</Text>
              <Text style={s.emptyDesc}>No pending insights. Keep up the good work.</Text>
            </View>
          ) : (
            activeInsights.map(ins => <InsightCard key={ins.id} insight={ins} onDismiss={() => dismiss(ins.id)} />)
          )}
        </ScrollView>
      )}

      {tab === 'chat' && <ChatTab
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        sendMessage={sendMessage}
        typing={typing}
        dot1={dot1} dot2={dot2} dot3={dot3}
        chatScroll={chatScroll}
      />}

      {tab === 'reports' && (
        <ScrollView
          style={s.body}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BLUE]} />}
        >
          <ReportsContent txns={txns} goals={goals} profile={profile} />
        </ScrollView>
      )}
    </View>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// InsightCard
// ═════════════════════════════════════════════════════════════════════════
function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const colors = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.neutral
  const typeIcon = colors.icon

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded(!expanded)}
      style={[s.insightCard, { borderLeftColor: colors.border, backgroundColor: '#FFF' }]}
    >
      <View style={s.insightHeader}>
        {/* Type icon */}
        <View style={[s.insightIconBox, { backgroundColor: colors.border + '12' }]}>
          <Text style={{ fontSize: 13 }}>{typeIcon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.insightCat, { color: colors.border }]}>{insight.category}</Text>
          <Text style={s.insightTitle}>{insight.title}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {insight.metric && (
            <View style={[s.metricBadge, { backgroundColor: colors.border + '15' }]}>
              <Text style={[s.metricTxt, { color: colors.border }]}>{insight.metric.value}</Text>
            </View>
          )}
          {expanded ? (
            <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onDismiss() }} style={s.insightXBtn}>
              <Text style={{ fontSize: 10, color: TXT3 }}>✕</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 13, color: TXT3 }}>▾</Text>
          )}
        </View>
      </View>
      {expanded && (
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: BG_SEC, paddingTop: 10 }}>
          <Text style={s.insightMsg}>{insight.message}</Text>
          {insight.metric && (
            <View style={[s.metricLarge, { backgroundColor: colors.border + '12' }]}>
              <Text style={[s.metricLargeVal, { color: colors.border }]}>{insight.metric.value}</Text>
              <Text style={s.metricLargeLabel}>{insight.metric.label}</Text>
            </View>
          )}
          {insight.actions && insight.actions.length > 0 && (
            <View style={s.actionBtnRow}>
              <TouchableOpacity style={[s.actionBtnPrimary, { backgroundColor: colors.border }]}>
                <Text style={s.actionBtnPrimaryTxt}>{insight.actions[0]}</Text>
              </TouchableOpacity>
              {insight.actions[1] && (
                <TouchableOpacity style={[s.actionBtnSecondary, { borderColor: colors.border + '40' }]}>
                  <Text style={[s.actionBtnSecondaryTxt, { color: colors.border }]}>{insight.actions[1]}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// ChatTab
// ═════════════════════════════════════════════════════════════════════════
function ChatTab({
  messages, chatInput, setChatInput, sendMessage, typing,
  dot1, dot2, dot3, chatScroll,
}: {
  messages: ChatMsg[]
  chatInput: string
  setChatInput: (v: string) => void
  sendMessage: (text?: string) => void
  typing: boolean
  dot1: Animated.Value; dot2: Animated.Value; dot3: Animated.Value
  chatScroll: React.RefObject<ScrollView>
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      {/* Quick prompts */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.promptRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {PROMPTS.map((p, i) => (
          <TouchableOpacity key={i} style={s.promptChip} onPress={() => sendMessage(p)}>
            <Text style={s.promptChipTxt}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Messages */}
      <ScrollView
        ref={chatScroll}
        style={s.chatList}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(m => (
          <View key={m.id} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
            {m.role === 'ai' && <View style={s.aiAvatar}><Text style={{ fontSize: 12 }}>✨</Text></View>}
            <View style={[s.bubbleBody, m.role === 'user' ? s.bubbleBodyUser : s.bubbleBodyAI]}>
              <Text style={[s.bubbleTxt, m.role === 'user' && { color: '#FFF' }]}>{m.text}</Text>
            </View>
          </View>
        ))}
        {typing && (
          <View style={[s.bubble, s.bubbleAI]}>
            <View style={s.aiAvatar}><Text style={{ fontSize: 12 }}>✨</Text></View>
            <View style={[s.bubbleBody, s.bubbleBodyAI, { flexDirection: 'row', gap: 4, paddingVertical: 14 }]}>
              {[dot1, dot2, dot3].map((d, i) => (
                <Animated.View key={i} style={[s.typingDot, { transform: [{ translateY: d }] }]} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={s.inputBar}>
        <TextInput
          style={s.chatInput}
          value={chatInput}
          onChangeText={setChatInput}
          placeholder="Ask your AI coach..."
          placeholderTextColor={TXT3}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[s.sendBtn, !chatInput.trim() && { opacity: 0.4 }]}
          onPress={() => sendMessage()}
          disabled={!chatInput.trim()}
        >
          <Text style={s.sendTxt}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// ReportsContent — Risk Profile + Protection Check + Monthly Flow
// ═════════════════════════════════════════════════════════════════════════
const INDIGO = '#6366F1'

function deriveRisk(age: number) {
  if (age < 30)  return { label: 'Aggressive',   emoji: '🔥', color: RED,    equity: 80, debt: 15, gold: 5 }
  if (age < 40)  return { label: 'Balanced',     emoji: '⚡', color: ORANGE, equity: 65, debt: 25, gold: 10 }
  if (age < 50)  return { label: 'Moderate',     emoji: '🛡️', color: BLUE,   equity: 50, debt: 35, gold: 15 }
  return           { label: 'Conservative', emoji: '🌿', color: GREEN,  equity: 35, debt: 45, gold: 20 }
}

function fmtInr(val: number) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`
  return `₹${Math.round(val)}`
}

function ReportsContent({ txns, goals, profile }: { txns: Transaction[]; goals: Goal[]; profile: Profile | null }) {
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const essentials = txns.filter(t => t.category === 'essentials').reduce((s, t) => s + t.amount, 0)
  const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
  const emis = txns.filter(t => t.category === 'emis').reduce((s, t) => s + t.amount, 0)
  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const saved = Math.max(0, income - totalExpense)
  const max = Math.max(income, 1)

  const age = profile?.age ?? 28
  const risk = deriveRisk(age)
  const idealEquity = Math.max(30, Math.min(80, 100 - age))
  const annualIncome = (profile?.monthly_income ?? income) * 12
  const monthlyExpense = totalExpense || 1
  const emergencyTarget = monthlyExpense * 6
  const monthsCovered = income > 0 ? Math.min(6, Math.round(saved / monthlyExpense)) : 0
  const termNeeded = annualIncome * 15

  // Income History — editable state
  const [editMonthIdx, setEditMonthIdx] = useState<number | null>(null)
  const [editAmt, setEditAmt] = useState('')
  const [editNote, setEditNote] = useState('')

  const bars = [
    { label: 'Income',     value: income,     color: GREEN,  bg: GREEN_L },
    { label: 'Essentials', value: essentials,  color: BLUE,   bg: BLUE_L },
    { label: 'Lifestyle',  value: lifestyle,   color: ORANGE, bg: ORANGE_L },
    { label: 'EMIs',       value: emis,        color: RED,    bg: RED_L },
    { label: 'Saved',      value: saved,       color: TEAL,   bg: TEAL_L },
  ]

  const allocGrid = [
    { label: 'Equity', pct: risk.equity, color: GREEN },
    { label: 'Debt',   pct: risk.debt,   color: BLUE },
    { label: 'Gold',   pct: 100 - risk.equity - risk.debt > 0 ? risk.gold : 5, color: ORANGE },
    { label: 'Other',  pct: Math.max(0, 100 - risk.equity - risk.debt - risk.gold), color: TXT3 },
  ]

  return (
    <>
      {/* ── Risk Profile Card ─────────────────────────────────────── */}
      <View style={s.reportCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text style={{ fontSize: 14 }}>📊</Text>
          <Text style={s.reportTitle}>Risk Profile</Text>
        </View>

        <View style={[s.riskBadge, { backgroundColor: risk.color + '12', borderColor: risk.color + '30' }]}>
          <Text style={{ fontSize: 22 }}>{risk.emoji}</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[s.riskLabel, { color: risk.color }]}>{risk.label}</Text>
            <Text style={s.riskSub}>Age {age} · auto-derived</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: TXT3, fontFamily: 'Manrope_400Regular' }}>Ideal split</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Manrope_700Bold', color: TXT1 }}>{risk.equity}E / {risk.debt}D</Text>
          </View>
        </View>

        <View style={s.allocGrid}>
          {allocGrid.map(a => (
            <View key={a.label} style={s.allocCell}>
              <Text style={[s.allocPct, { color: a.color }]}>{a.pct}%</Text>
              <Text style={s.allocLabel}>{a.label}</Text>
            </View>
          ))}
        </View>

        {risk.equity < idealEquity - 10 && (
          <Text style={s.riskAlert}>⚡ Equity {risk.equity}% is below ideal {idealEquity}% — consider increasing SIP</Text>
        )}
      </View>

      {/* ── Protection Check Card ─────────────────────────────────── */}
      <View style={s.reportCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text style={{ fontSize: 14 }}>🛡️</Text>
          <Text style={s.reportTitle}>Protection Check</Text>
        </View>

        {[
          { emoji: '🛡️', label: 'Emergency Fund', ok: monthsCovered >= 6, detail: `${monthsCovered}/6 months covered`, need: fmtInr(emergencyTarget), status: monthsCovered >= 6 ? '✓ Covered' : '⚠ Build up' },
          { emoji: '📋', label: 'Term Insurance', ok: false, detail: `15× income = ${fmtInr(termNeeded)}`, need: fmtInr(termNeeded), status: '⚠ Review' },
          { emoji: '🏥', label: 'Health Insurance', ok: false, detail: 'Personal cover recommended', need: '₹10–25L', status: '⚠ Review' },
        ].map((row, i) => (
          <View key={row.label} style={[s.protCheckRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: BG_SEC }]}>
            <View style={[s.protCheckDot, { backgroundColor: row.ok ? GREEN : RED }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.protCheckLabel}>{row.label}</Text>
              <Text style={s.protCheckDetail}>{row.detail}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.protCheckStatus, { color: row.ok ? GREEN : RED }]}>{row.status}</Text>
              <Text style={s.protCheckNeed}>Need: {row.need}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Monthly Flow ──────────────────────────────────────────── */}
      <View style={s.reportCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text style={{ fontSize: 14 }}>📊</Text>
          <Text style={s.reportTitle}>Monthly Flow</Text>
        </View>
        <Text style={s.reportSub}>Category-wise breakdown for this month</Text>
        {bars.map(b => (
          <View key={b.label} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={s.barLabel}>{b.label}</Text>
              <Text style={[s.barLabel, { color: b.color }]}>₹{b.value.toLocaleString('en-IN')}</Text>
            </View>
            <View style={[s.barTrack, { backgroundColor: b.bg }]}>
              <View style={[s.barFill, { width: `${Math.min(100, (b.value / max) * 100)}%`, backgroundColor: b.color }]} />
            </View>
          </View>
        ))}
      </View>

      {/* ── Income History (editable) ─────────────────────────────── */}
      {(() => {
        const now = new Date()
        const months: { label: string; fullLabel: string; income: number; current: boolean; note?: string }[] = []
        for (let i = 3; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const label = d.toLocaleString('default', { month: 'short' })
          const fullLabel = `${label} ${d.getFullYear()}`
          const monthIncome = txns.filter(t => {
            if (t.type !== 'income') return false
            const td = new Date(t.date)
            return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear()
          }).reduce((s, t) => s + t.amount, 0)
          months.push({ label, fullLabel, income: monthIncome, current: i === 0 })
        }
        const hasData = months.some(m => m.income > 0)
        if (!hasData) return null
        return (
          <View style={s.reportCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 14 }}>💰</Text>
              <Text style={s.reportTitle}>Monthly Income History</Text>
            </View>
            {months.slice().reverse().map((entry, idx) => {
              const realIdx = months.length - 1 - idx
              const isEdit = editMonthIdx === realIdx
              return (
                <View key={entry.fullLabel} style={[{ paddingVertical: 10 }, idx < months.length - 1 && { borderBottomWidth: 1, borderBottomColor: BG_SEC }]}>
                  {isEdit ? (
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={editAmt}
                          onChangeText={setEditAmt}
                          placeholder={String(entry.income)}
                          placeholderTextColor={TXT3}
                          keyboardType="numeric"
                          style={{ flex: 1, backgroundColor: BG_SEC, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'Manrope_700Bold', fontSize: 13, color: TXT1 }}
                        />
                        <TextInput
                          value={editNote}
                          onChangeText={setEditNote}
                          placeholder="Note (optional)"
                          placeholderTextColor={TXT3}
                          style={{ flex: 1, backgroundColor: BG_SEC, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'Manrope_400Regular', fontSize: 12, color: TXT1 }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                        <TouchableOpacity
                          onPress={() => { setEditMonthIdx(null); setEditAmt(''); setEditNote('') }}
                          style={{ backgroundColor: BG_SEC, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
                        >
                          <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_700Bold' }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            // Save edits (currently visual only — Supabase integration can be added)
                            setEditMonthIdx(null); setEditAmt(''); setEditNote('')
                          }}
                          style={{ backgroundColor: BLUE, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
                        >
                          <Text style={{ fontSize: 12, color: '#FFF', fontFamily: 'Manrope_700Bold' }}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setEditMonthIdx(realIdx); setEditAmt(String(entry.income)); setEditNote(entry.note ?? '') }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Manrope_700Bold', color: TXT1 }}>{entry.fullLabel}</Text>
                        {entry.note && <Text style={{ fontSize: 10, color: TXT3, marginTop: 1 }}>{entry.note}</Text>}
                      </View>
                      <Text style={{ fontSize: 13, fontFamily: 'Manrope_700Bold', color: entry.note ? ORANGE : TXT1 }}>
                        {entry.income > 0 ? fmtInr(entry.income) : '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: TXT3 }}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
            {/* Comparison badge */}
            {months.length >= 2 && (() => {
              const prev = months.filter(m => !m.current && m.income > 0)
              if (prev.length === 0) return null
              const avg = prev.reduce((s, m) => s + m.income, 0) / prev.length
              const curr = months.find(m => m.current)?.income ?? 0
              const diff = curr - avg
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, borderRadius: 12, padding: 10, backgroundColor: diff >= 0 ? GREEN_L : ORANGE_L }}>
                  <Text style={{ fontSize: 12 }}>{diff >= 0 ? '📈' : '📉'}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: diff >= 0 ? GREEN : ORANGE, fontFamily: 'Manrope_400Regular' }}>
                    {diff >= 0 ? `+${fmtInr(diff)} vs avg` : `${fmtInr(Math.abs(diff))} below avg`} of prior months
                  </Text>
                </View>
              )
            })()}
          </View>
        )
      })()}
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },

  // App Bar
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: BORDER },
  appTitle: { fontSize: 22, fontFamily: 'Manrope_700Bold', color: TXT1 },
  badge: { backgroundColor: TEAL_L, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: TEAL },

  // Tabs
  tabs: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 2, gap: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: BLUE },
  tabTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: TXT3 },
  tabTxtActive: { color: BLUE },

  body: { flex: 1, padding: 16 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: TXT1, marginTop: 12 },
  emptyDesc: { fontSize: 14, color: TXT2, marginTop: 4, textAlign: 'center' },

  // Insight card
  insightCard: { borderLeftWidth: 3, borderRadius: 16, padding: 16, marginBottom: 12, backgroundColor: '#FFF', shadowColor: BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  insightHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  insightIconBox: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  insightCat: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 12, marginBottom: 3 },
  insightTitle: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: TXT1, lineHeight: 17 },
  insightMsg: { fontSize: 12, color: TXT2, lineHeight: 19, marginBottom: 4 },
  insightXBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
  metricBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  metricTxt: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  metricLarge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, alignSelf: 'flex-start' },
  metricLargeVal: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  metricLargeLabel: { fontSize: 11, color: TXT2 },
  actionBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtnPrimary: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  actionBtnPrimaryTxt: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: '#FFF' },
  actionBtnSecondary: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5 },
  actionBtnSecondaryTxt: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  // Chat
  promptRow: { backgroundColor: '#FFF', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, maxHeight: 52 },
  promptChip: { backgroundColor: BLUE_L, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  promptChipTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: BLUE },
  chatList: { flex: 1, backgroundColor: BG },
  bubble: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  aiAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: TEAL_L, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  bubbleBody: { maxWidth: '75%', padding: 12, borderRadius: 16 },
  bubbleBodyUser: { backgroundColor: BLUE, borderBottomRightRadius: 4 },
  bubbleBodyAI: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BORDER },
  bubbleTxt: { fontSize: 14, color: TXT1, lineHeight: 20 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: TXT3 },
  inputBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER },
  chatInput: { flex: 1, backgroundColor: BG_SEC, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: TXT1 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  sendTxt: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  // Reports
  reportCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  reportTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', color: TXT1 },
  reportSub: { fontSize: 12, color: TXT2, marginTop: 2, marginBottom: 4 },
  barLabel: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: TXT2 },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  // Risk Profile
  riskBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12 },
  riskLabel: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  riskSub: { fontSize: 11, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  allocGrid: { flexDirection: 'row', gap: 8, marginTop: 4 },
  allocCell: { flex: 1, borderRadius: 16, padding: 8, alignItems: 'center', backgroundColor: BG_SEC },
  allocPct: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  allocLabel: { fontSize: 9, fontFamily: 'Manrope_700Bold', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  riskAlert: { fontSize: 11, fontFamily: 'Manrope_700Bold', color: ORANGE, marginTop: 10 },

  // Protection Check (enhanced)
  protCheckRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  protCheckDot: { width: 8, height: 8, borderRadius: 4 },
  protCheckLabel: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: TXT1 },
  protCheckDetail: { fontSize: 11, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  protCheckStatus: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
  protCheckNeed: { fontSize: 10, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
  checkLabel: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: TXT1 },
  checkValue: { fontSize: 13, color: TEAL, fontFamily: 'Manrope_700Bold', marginTop: 2 },
  checkHint: { fontSize: 12, color: TXT2, marginTop: 2 },
})
