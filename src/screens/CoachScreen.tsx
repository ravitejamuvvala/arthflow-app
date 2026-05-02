import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import HealthScoreRing from '../components/HealthScoreRing'
import WhatIfSimulator from '../components/WhatIfSimulator'
import { fetchAiChat, fetchAiReport } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Goal, Profile, Transaction } from '../types'
import { fmtInr } from '../utils/calculations'
import { runEngine } from '../utils/engine'
import { buildAppReport, generateDownloadReport } from '../utils/report'

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
const BG_SEC = '#F1F5F9'
const RUPEE_ACCENT = '#1E3A8A'
const RUPEE_ACCENT_LIGHT = '#F59E0B'

// ─── Highlight ₹ amounts in text ────────────────────────────────────────
function highlightRupee(text: string, color: string = RUPEE_ACCENT, baseStyle?: any) {
  if (!text) return null
  const parts = text.split(/(₹[\d,\.]+(?:\s*(?:K|L|Cr|lakh|crore))?(?:\/\w+)?)/gi)
  if (parts.length === 1) return <Text style={baseStyle}>{text}</Text>
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) =>
        /^₹/.test(part)
          ? <Text key={i} style={{ fontWeight: '800', color }}>{part}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  )
}

// ─── AI Reply (keyword-matching fallback) ───────────────────────────────
// Reads pre-computed engineResult — no recalculation
function generateAIReply(msg: string, engineResult: any, goals: Goal[], profile: Profile | null) {
  const lc = msg.toLowerCase()

  // ── Finance-only guardrail ──
  const financeKeywords = [
    'money','spend','spent','saving','save','invest','sip','mutual','fund','stock','insurance','protect','cover','term','health','tax','80c','80d','deduction','budget','income','salary','expense','emi','loan','debt','credit','goal','retire','pension','nps','ppf','epf','pf','gold','real estate','property','rent','crypto','emergency','liquid','net worth','wealth','portfolio','return','compound','lakh','crore','inflation','bonus','hike','appraisal','slab','gst','tds','itr','fd','fixed deposit','rd','recurring','bank','upi','payment','lifestyle','essentials','dining','shopping','subscription','cut','trim','reduce','boost','improve','track','funded','needs','how am i doing','overall','score','snapshot','surplus','where to put','creep','safety net','find saving','review expense','high','overspend',
  ]
  const isFinance = financeKeywords.some(k => lc.includes(k))
  if (!isFinance) {
    return `I'm your ArthFlow finance coach — I can only help with money and finance questions! 💰\n\nAsk me about your savings, investments, taxes, insurance, budgets, or goals.`
  }

  // Pull everything from engineResult — zero recalculation
  const flow = engineResult?.flow
  const income = flow?.income ?? 0
  const totalExp = flow?.totalSpent ?? 0
  const saved = flow?.savings ?? 0
  const savePct = flow?.savingsPct ?? 0
  const lifestyle = flow?.catTotals?.lifestyle ?? 0
  const essentials = flow?.catTotals?.essentials ?? 0
  const emis = flow?.catTotals?.emis ?? 0
  const lifePct = flow?.wantsPct ?? 0
  const needsPct = flow?.needsPct ?? 0
  const emergencyMonths = engineResult?.emergencyMonths ?? 0
  const goalCalcs = engineResult?.goalCalcs ?? []
  const age = profile?.age ?? 0
  const name = profile?.full_name?.split(' ')[0] ?? 'there'
  const monthlyIncome = profile?.monthly_income ?? income
  const score = engineResult?.score ?? 50
  const investment = engineResult?.investment

  // --- Spending / overspending ---
  if (lc.includes('spending') || lc.includes('spent') || lc.includes('high') || lc.includes('review expense') || lc.includes('cut') || lc.includes('reduc') || lc.includes('expense') || lc.includes('trim')) {
    const limit30 = Math.round(income * 0.30)
    const overBy = lifestyle - limit30
    return `${name}, here's your spending breakdown:\n• Essentials: ${fmtInr(essentials)} (${needsPct}%)\n• Lifestyle: ${fmtInr(lifestyle)} (${lifePct}%)${overBy > 0 ? ` — ${fmtInr(overBy)} over the 30% limit` : ''}\n• EMIs: ${fmtInr(emis)}\n\n${overBy > 0 ? `Action: Cut dining/shopping by ${fmtInr(Math.round(overBy * 0.5))} first — that's the easiest win. Cancel unused subscriptions.` : 'You\'re within limits! Review subscriptions to save more.'}`
  }

  // --- Savings ---
  if (lc.includes('saving') || lc.includes('save') || lc.includes('improve') || lc.includes('find saving') || lc.includes('boost')) {
    const target20 = Math.round(income * 0.20)
    const gap = target20 - saved
    if (gap > 0) {
      return `${name}, you're saving ${fmtInr(saved)}/month (${savePct}%). Target: ${fmtInr(target20)} (20%).\n\nHere's how to find ${fmtInr(gap)} more:\n• Cut lifestyle by 10% → saves ${fmtInr(Math.round(lifestyle * 0.1))}\n• Review subscriptions → typically ₹500–1,500/month\n• Cook 2 more meals/week → saves ~₹2,000/month\n• Auto-transfer savings on payday so you don't spend it.`
    }
    return `Great news, ${name}! You're saving ${savePct}% (${fmtInr(saved)}/month) — above the 20% benchmark! 🎉\n\nNext step: Put surplus into SIPs or your emergency fund.`
  }

  // --- Emergency fund ---
  if (lc.includes('emergency') || lc.includes('liquid') || lc.includes('safety net')) {
    const needed = totalExp * 6
    const monthly = Math.ceil(needed / 12)
    return `${name}, your emergency fund target: ${fmtInr(needed)} (6 months × ${fmtInr(totalExp)} expenses).\nCurrently: ${emergencyMonths} months covered.\n\nPlan:\n• Keep it in a liquid mutual fund (6–7% returns, instant withdrawal)\n• Build it in 12 months: ${fmtInr(monthly)}/month\n• Don't use FDs — liquid funds are more accessible and tax-efficient\n• This is your #1 priority before investing.`
  }

  // --- Insurance / protection ---
  if (lc.includes('insurance') || lc.includes('protect') || lc.includes('health insurance') || lc.includes('term') || lc.includes('cover')) {
    const termCover = engineResult?.risk?.termInsuranceNeeded ?? monthlyIncome * 12 * 15
    return `${name}, here's your insurance roadmap for age ${age}:\n\n🏥 Health Insurance:\n• Get ₹10L family floater (~₹700/mo)\n• Add super top-up for ₹50L (~₹300/mo extra)\n\n❤️ Term Life Insurance:\n• Cover: ${fmtInr(termCover)} (15× annual income)\n• Cost: ~₹700–900/month at age ${age}\n• Buy online (HDFC/ICICI/Max) — 40% cheaper\n\nTotal budget: under ${fmtInr(Math.round(monthlyIncome * 0.05))}/month (5% of income).`
  }

  // --- SIP / investing ---
  if (lc.includes('sip') || lc.includes('invest') || lc.includes('mutual') || lc.includes('surplus') || lc.includes('where to put')) {
    const eqPct = investment?.equityPct ?? Math.min(80, 100 - age)
    const sipAmt = Math.round(saved * 0.6)
    return `${name}, investment plan for age ${age}:\n\n📈 SIP Allocation (${fmtInr(sipAmt)}/month):\n• 60% Large-cap Index Fund (Nifty 50)\n• 25% Mid/Small-cap Fund\n• 15% International (Nasdaq/S&P 500)\n\n🎯 Equity allocation: ${eqPct}% (rule: 100 minus age)\n💰 Use ELSS for tax saving under 80C\n\nStart today — even ${fmtInr(1000)}/month compounds to ₹25L+ in 20 years.`
  }

  // --- Goals ---
  if (lc.includes('goal') || lc.includes('track') || lc.includes('funded') || lc.includes('needs')) {
    if (goals.length === 0) return `${name}, you haven't set any goals yet! Head to the Plan tab to create one. I'd recommend starting with an emergency fund and a retirement goal.`
    const configuredGoals = goals.filter(g => g.target_amount > 0)
    if (configuredGoals.length === 0) return `${name}, you've picked ${goals.length} goal${goals.length > 1 ? 's' : ''} but haven't set targets yet. Head to the Plan tab to set amounts and timelines!`
    const summaries = configuredGoals.slice(0, 3).map((g, i) => {
      const calc = goalCalcs[i]
      const pct = calc ? Math.round(calc.funded * 100) : Math.min(100, Math.round(((g.saved_amount || g.current_amount || 0) / g.target_amount) * 100))
      return `• "${g.name}": ${pct}% funded (${fmtInr(g.saved_amount || g.current_amount || 0)} of ${fmtInr(g.target_amount)})`
    }).join('\n')
    return `${name}, here's your goal progress:\n\n${summaries}\n\n${configuredGoals.some(g => ((g.saved_amount || 0) / g.target_amount) < 0.25) ? 'Some goals are underfunded — consider increasing your monthly SIP or reallocating from lifestyle.' : 'Looking good! Stay consistent with monthly contributions.'}`
  }

  // --- Tax ---
  if (lc.includes('tax') || lc.includes('80c') || lc.includes('deduction'))
    return `${name}, tax saving roadmap:\n\n📋 Section 80C (₹1.5L limit):\n• PPF: ₹1.5L/year → saves ₹46,800 tax\n• ELSS: Same 80C + equity returns (3yr lock-in)\n\n📋 Section 80CCD(1B):\n• NPS: Extra ₹50K → saves ₹15,600 more\n\n📋 Section 80D:\n• Health Insurance premium: up to ₹25K\n\nTotal tax savings possible: ₹62,400+ per year.`

  // --- Lifestyle ---
  if (lc.includes('lifestyle') || lc.includes('dining') || lc.includes('shopping') || lc.includes('creep')) {
    const limit30 = Math.round(income * 0.30)
    return `${name}, lifestyle spending: ${fmtInr(lifestyle)}/month (${lifePct}% of income).\n\nThe 50-30-20 rule allows 30% max = ${fmtInr(limit30)}.\n\n${lifestyle > limit30 ? `You're ${fmtInr(lifestyle - limit30)} over. Try:\n• Set a weekly dining budget\n• Unsubscribe unused services\n• Use the 48-hour rule for impulse buys` : 'You\'re within the 30% limit — well done! Keep it steady.'}`
  }

  // --- How am I doing / overall ---
  if (lc.includes('how am i doing') || lc.includes('overall') || lc.includes('score') || lc.includes('snapshot'))
    return `${name}'s financial snapshot:\n\n💰 Income: ${fmtInr(income)}/month\n🛒 Spending: ${fmtInr(totalExp)} (${income > 0 ? Math.round((totalExp / income) * 100) : 0}%)\n📊 Savings: ${fmtInr(saved)}/month (${savePct}%)\n📈 Health Score: ${score}/100\n\n${savePct >= 20 ? "✅ Above 20% benchmark — solid!" : "⚠️ Below 20% target — let's trim lifestyle spending."}\n\nTop action: ${savePct < 20 ? 'Reduce lifestyle by 10% to hit 20% savings.' : 'Review your SIP allocation and insurance coverage.'}`

  // --- Fallback ---
  return `${name}, based on your finances:\n\n• Savings rate: ${savePct}% ${savePct >= 20 ? '✅' : '(target: 20%)'}\n• Lifestyle: ${lifePct}% of income ${lifePct <= 30 ? '✅' : '(target: ≤30%)'}\n• Goals: ${goals.length} active\n• Health Score: ${score}/100\n\nTop priority: ${savePct < 20 ? `Find ${fmtInr(Math.round(income * 0.20 - saved))} more in savings by trimming lifestyle.` : goals.length === 0 ? 'Set a financial goal in the Plan tab.' : 'Stay consistent and review your SIP allocation.'}\n\nAsk me about savings, investing, insurance, or tax planning!`
}

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════
export default function CoachScreen({ showReport }: { showReport?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assets, setAssets] = useState<any>(null)
  const [engineResult, setEngineResult] = useState<any>(null)
  const [aiReport, setAiReport] = useState<any>(null)

  // Chat
  const [messages, setMessages] = useState([
    { id: '0', role: 'ai', text: 'Hi! I\'m your AI coach. Ask me anything about your money.' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showFullAnalysis, setShowFullAnalysis] = useState(false)
  const chatScroll = useRef<ScrollView>(null)
  const mainScroll = useRef<ScrollView>(null)

  // Typing dots
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  const animateTyping = useCallback(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]))
    Animated.parallel([anim(dot1, 0), anim(dot2, 150), anim(dot3, 300)]).start()
  }, [dot1, dot2, dot3])

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const [txnRes, goalRes, profileRes] = await Promise.all([
        supabase.from('transactions').select('*').gte('date', startOfMonth.toISOString()).order('date', { ascending: false }),
        supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])

      const t = txnRes.data ?? []
      const g = goalRes.data ?? []
      const p = profileRes.data ?? null

      // Load assets from AsyncStorage
      let loadedAssets = null
      try {
        const raw = await AsyncStorage.getItem('@arthflow_assets')
        if (raw) loadedAssets = JSON.parse(raw)
      } catch {}

      setTxns(t)
      setGoals(g)
      setProfile(p)
      setAssets(loadedAssets)

      // Run the unified engine
      const baseIncome = p?.monthly_income ?? t.filter((tx: Transaction) => tx.type === 'income').reduce((s: number, tx: Transaction) => s + tx.amount, 0)
      const result = runEngine({ income: baseIncome, transactions: t, goals: g, assets: loadedAssets, age: p?.age ?? 0, profile: p })
      setEngineResult(result)

      // Load AI report from cache
      let reportLoaded = false
      try {
        const raw = await AsyncStorage.getItem('@arthflow_ai_report')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.report && parsed.ts && Date.now() - parsed.ts < 6 * 60 * 60 * 1000) {
            setAiReport(parsed.report)
            reportLoaded = true
          }
        }
      } catch {}

      // Show screen immediately — fetch AI report in background
      setLoading(false)
      setRefreshing(false)

      // If no cached report, fetch fresh (non-blocking)
      if (!reportLoaded && p) {
        try {
          const report = await fetchAiReport({
            profile: p,
            goals: g.map((goal: Goal) => {
              const targetYear = goal.target_date ? new Date(goal.target_date).getFullYear() : new Date().getFullYear() + 5
              const yearsLeft = Math.max(1, targetYear - new Date().getFullYear())
              const monthsLeft = yearsLeft * 12
              const remaining = Math.max(0, (goal.target_amount || 0) - (goal.saved_amount || 0))
              const monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : 0
              return { ...goal, monthlyNeeded, yearsLeft, monthsLeft }
            }),
            assets: loadedAssets,
            // Pass pre-computed engine data — backend enhances, doesn't recalculate
            engine: {
              flow: result.flow,
              score: result.score,
              scoreLabel: result.scoreLabel,
              emergencyMonths: result.emergencyMonths,
              investment: result.investment,
              assetAnalysis: result.assetAnalysis,
              risk: result.risk,
              trend: result.trend,
              avgGoalFunded: result.avgGoalFunded,
            },
          })
          setAiReport(report)
          await AsyncStorage.setItem('@arthflow_ai_report', JSON.stringify({ report, ts: Date.now() }))
        } catch (e) {
          console.error('CoachScreen AI report fetch error:', e)
        }
      }
    } catch (e) {
      console.error('CoachScreen loadData error:', e)
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  const onRefresh = async () => {
    setRefreshing(true)
    await AsyncStorage.removeItem('@arthflow_ai_report')
    loadData()
  }

  const sendMessage = async (text?: string) => {
    const msg = (text || chatInput).trim()
    if (!msg) return
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg }])
    setChatInput('')
    setTyping(true)
    animateTyping()

    setTimeout(() => chatScroll.current?.scrollToEnd({ animated: true }), 300)

    // Always fetch FRESH data from Supabase before sending to AI
    let freshTxns = txns
    let freshGoals = goals
    let freshProfile = profile
    let freshAssets = assets
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const [txnRes, goalRes, profileRes] = await Promise.all([
          supabase.from('transactions').select('*').gte('date', startOfMonth.toISOString()).order('date', { ascending: false }),
          supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
          supabase.from('profiles').select('*').eq('id', user.id).single(),
        ])
        freshTxns = txnRes.data ?? txns
        freshGoals = goalRes.data ?? goals
        freshProfile = profileRes.data ?? profile

        try {
          const raw = await AsyncStorage.getItem('@arthflow_assets')
          if (raw) freshAssets = JSON.parse(raw)
        } catch {}

        setTxns(freshTxns)
        setGoals(freshGoals)
        setProfile(freshProfile)
        setAssets(freshAssets)
      }
    } catch (e) {
      console.error('Failed to fetch fresh data for AI chat:', e)
    }

    // Build context from engine — no recalculation
    const chatContext = {
      profile: freshProfile,
      transactions: freshTxns.slice(0, 20),
      goals: freshGoals,
      assets: freshAssets,
      engine: engineResult ? {
        flow: engineResult.flow,
        score: engineResult.score,
        scoreLabel: engineResult.scoreLabel,
        emergencyMonths: engineResult.emergencyMonths,
        investment: engineResult.investment,
        risk: engineResult.risk,
        trend: engineResult.trend,
      } : undefined,
    }

    try {
      const reply = await fetchAiChat(msg, chatContext)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
    } catch (err) {
      console.error('AI chat error:', err)
      const fallback = generateAIReply(msg, engineResult, freshGoals, freshProfile)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: fallback }])
    } finally {
      setTyping(false)
      dot1.setValue(0); dot2.setValue(0); dot3.setValue(0)
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={BLUE} /></View>
  }

  const status = engineResult?.status
  const flow = engineResult?.flow
  const scoreColor = status?.status === 'on track' ? GREEN : status?.status === 'slightly off track' ? ORANGE : RED

  // Build structured app report
  const appReport = buildAppReport(engineResult, aiReport)
  const reportScore = appReport?.score ?? 0
  const reportScoreColor = reportScore >= 80 ? GREEN : reportScore >= 60 ? ORANGE : RED

  const toggleSection = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const downloadReport = async () => {
    const text = generateDownloadReport({
      engineResult,
      profile,
      goals,
      assets,
      transactions: txns,
      aiReport,
    })
    try {
      await Share.share({
        title: `ArthFlow Financial Report`,
        message: text,
      })
    } catch (e) {
      console.error('Share error:', e)
    }
  }

  const greeting = () => {
    const h = new Date().getHours()
    const name = profile?.full_name?.split(' ')[0] ?? 'there'
    if (h < 12) return `Good morning, ${name}`
    if (h < 17) return `Good afternoon, ${name}`
    return `Good evening, ${name}`
  }

  // Daily pulse — uses engine flow data
  const pulseMsg = () => {
    if (!flow) return 'No transactions this month yet. Start logging to get personalised insights! 📝'
    const dayOfMonth = new Date().getDate()
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const pctMonth = Math.round((dayOfMonth / daysInMonth) * 100)
    const pctBudget = flow.income > 0 ? Math.round((flow.totalSpent / flow.income) * 100) : 0

    if (flow.income === 0 && flow.totalSpent === 0) return 'No transactions this month yet. Start logging to get personalised insights! 📝'
    if (flow.income === 0) return `You've spent ${fmtInr(flow.totalSpent)} so far. Add your income to see budget analysis.`

    if (pctBudget < pctMonth - 10) return `Spent ${fmtInr(flow.totalSpent)} (${pctBudget}% of income) with ${100 - pctMonth}% of the month left. Saving ${fmtInr(flow.savings)} so far. 🟢`
    if (pctBudget > pctMonth + 15) return `Spent ${fmtInr(flow.totalSpent)} (${pctBudget}% of income), only ${pctMonth}% through the month. Slow down to save more. 🟡`
    return `Spent ${fmtInr(flow.totalSpent)} (${pctBudget}%), ${pctMonth}% through the month. On track to save ${fmtInr(flow.savings)}. 🔵`
  }

  // ═══════════════════════════════════════════════════════════════════
  return (
    <View style={s.root}>
      {/* ── App Bar ─── */}
      <View style={s.appBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ArthFlowLogo size={28} />
          <Text style={s.brandText}>ARTHFLOW</Text>
        </View>
        <TouchableOpacity style={s.badge} activeOpacity={0.7} onPress={() => mainScroll.current?.scrollToEnd({ animated: true })}>
          <Text style={s.badgeTxt}>✨ AI Coach</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={mainScroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ══ 1. FINANCIAL HEALTH SCORE ══════════════════════ */}
        <View style={s.heroCard}>
          <View style={s.heroGlow} />
          <View style={s.heroContent}>
            <Text style={s.heroMonth}>{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <Text style={s.greeting}>{greeting()}</Text>

            {/* Score display */}
            <View style={s.scoreRow}>
              <HealthScoreRing
                score={appReport?.score ?? 0}
                label={appReport?.scoreLabel}
                subtitle={appReport?.scoreLabel ? undefined : 'Loading…'}
              />
              <View style={{ flex: 1, marginLeft: 16 }}>
                {highlightRupee(appReport?.summary ?? '', RUPEE_ACCENT_LIGHT, s.scoreSummary)}
                {flow && (
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                    <View>
                      <Text style={s.flowLabel}>Saving</Text>
                      <Text style={s.flowValue}>{flow.savingsPct}%</Text>
                    </View>
                    <View>
                      <Text style={s.flowLabel}>Needs</Text>
                      <Text style={s.flowValue}>{flow.needsPct}%</Text>
                    </View>
                    <View>
                      <Text style={s.flowLabel}>Wants</Text>
                      <Text style={s.flowValue}>{flow.wantsPct}%</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ══ 1. ACTION PLAN (always visible, max 3) ════════════════ */}
        {appReport?.action_plan && appReport.action_plan.length > 0 && (
          <View style={s.actionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Text style={{ fontSize: 15 }}>✅</Text>
              <Text style={s.sectionTitle}>Action Plan</Text>
            </View>
            {appReport.action_plan.slice(0, 3).map((a: any, i: number) => {
              const prioColor = a.priority === 'high' ? RED : a.priority === 'medium' ? ORANGE : GREEN
              return (
                <View key={i} style={s.actionStep}>
                  <View style={[s.stepNumber, { backgroundColor: prioColor + '18' }]}>
                    <Text style={[s.stepNumberTxt, { color: prioColor }]}>{a.step}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.actionTitle}>{a.title}</Text>
                    <Text style={s.actionDesc} numberOfLines={2}>{highlightRupee(a.description, prioColor, undefined)}</Text>
                    <View style={[s.amountChip, { backgroundColor: prioColor + '12' }]}>
                      <Text style={[s.amountChipTxt, { color: prioColor }]}>₹{a.monthly_amount?.toLocaleString('en-IN')}/month</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {/* ══ 2. TOP PROBLEMS (always visible, max 3) ═══════════════ */}
        {appReport?.top_problems && appReport.top_problems.length > 0 && (
          <View>
            <View style={s.sectionRow}>
              <Text style={{ fontSize: 15 }}>🚨</Text>
              <Text style={s.sectionTitle}>Top Problems</Text>
              <View style={s.countBadge}>
                <Text style={s.countTxt}>{Math.min(appReport.top_problems.length, 3)}</Text>
              </View>
            </View>
            {appReport.top_problems.slice(0, 3).map((p: any, i: number) => {
              const sevColor = p.severity === 'high' ? RED : p.severity === 'medium' ? ORANGE : TXT2
              const sevBg = p.severity === 'high' ? RED_L : p.severity === 'medium' ? ORANGE_L : BG_SEC
              return (
                <View key={i} style={[s.problemCard, { borderLeftColor: sevColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <View style={[s.sevBadge, { backgroundColor: sevBg }]}>
                      <Text style={[s.sevBadgeTxt, { color: sevColor }]}>
                        {p.severity === 'high' ? '🔴 HIGH' : p.severity === 'medium' ? '🟡 MEDIUM' : '🔵 LOW'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.problemTitle}>{p.title}</Text>
                  <Text style={s.problemImpact} numberOfLines={2}>{highlightRupee(p.impact, sevColor, undefined)}</Text>
                </View>
              )
            })}
          </View>
        )}

        {/* ══ VIEW FULL ANALYSIS TOGGLE ═════════════════════ */}
        <TouchableOpacity
          style={s.fullAnalysisBtn}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            setShowFullAnalysis(prev => !prev)
          }}
          activeOpacity={0.8}
        >
          <Text style={s.fullAnalysisTxt}>
            {showFullAnalysis ? 'Hide Full Analysis' : 'View Full Analysis'}
          </Text>
          <Text style={s.fullAnalysisArrow}>{showFullAnalysis ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {/* ══ HIDDEN SECTIONS (expanded on toggle) ══════════ */}
        {showFullAnalysis && (
          <View>
            {/* ── Quick Summary ── */}
            {appReport?.quick_summary && appReport.quick_summary.length > 0 && (
              <View style={s.summaryCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 15 }}>📊</Text>
                  <Text style={s.sectionTitle}>Quick Summary</Text>
                </View>
                {appReport.quick_summary.map((item: string, i: number) => (
                  <View key={i} style={s.summaryRow}>
                    <Text style={s.summaryBullet}>•</Text>
                    {highlightRupee(item, BLUE, s.summaryText)}
                  </View>
                ))}
              </View>
            )}

            {/* ── Collapsible Detailed Sections ── */}
            {appReport?.collapsible_sections && appReport.collapsible_sections.length > 0 && (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Text style={{ fontSize: 15 }}>🔍</Text>
                  <Text style={s.sectionTitle}>Detailed Analysis</Text>
                </View>
                {appReport.collapsible_sections.map((sec: any) => (
                  <View key={sec.id} style={s.collapseCard}>
                    <TouchableOpacity
                      style={s.collapseHeader}
                      onPress={() => toggleSection(sec.id)}
                      activeOpacity={0.7}
                    >
                      <View style={s.sectionIconWrap}>
                        <Text style={{ fontSize: 16 }}>{sec.icon}</Text>
                      </View>
                      <Text style={s.collapseTitle}>{sec.title}</Text>
                      <Text style={s.collapseArrow}>{expanded[sec.id] ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {expanded[sec.id] && (
                      <View style={s.collapseBody}>
                        {sec.items?.map((item: string, j: number) => (
                          <View key={j} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                            <Text style={{ fontSize: 10, color: BLUE, marginTop: 4 }}>●</Text>
                            <Text style={s.sectionItemText} numberOfLines={2}>{highlightRupee(item, BLUE, undefined)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* ── Protection Checklist ── */}
            {appReport?.protectionChecklist?.length > 0 && (
              <View style={s.protectionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View style={[s.sectionIconWrap, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={{ fontSize: 18 }}>🛡️</Text>
                  </View>
                  <View>
                    <Text style={s.sectionCardTitle}>Protection Checklist</Text>
                    <Text style={{ fontSize: 11, color: TXT3, fontFamily: 'Manrope_400Regular' }}>Based on your age & income</Text>
                  </View>
                </View>
                {appReport.protectionChecklist.map((p: any, i: number) => {
                  const pStatusColor = p.status === 'covered' ? GREEN : p.status === 'partial' ? ORANGE : RED
                  const pStatusBg = p.status === 'covered' ? GREEN_L : p.status === 'partial' ? ORANGE_L : RED_L
                  const pStatusLabel = p.status === 'covered' ? '✅ Covered' : p.status === 'partial' ? '⚠️ Partial' : '❌ Missing'
                  return (
                    <View key={i} style={[s.protectionRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Text style={{ fontSize: 16 }}>{p.icon}</Text>
                        <Text style={s.protectionName}>{p.item}</Text>
                        <View style={[s.protectionBadge, { backgroundColor: pStatusBg }]}>
                          <Text style={[s.protectionBadgeTxt, { color: pStatusColor }]}>{pStatusLabel}</Text>
                        </View>
                      </View>
                      <View style={{ paddingLeft: 30 }}>
                        <View style={s.protectionDetail}>
                          <Text style={s.protectionLabel}>Have</Text>
                          <Text style={s.protectionValue}>{p.have}</Text>
                        </View>
                        <View style={s.protectionDetail}>
                          <Text style={s.protectionLabel}>Need</Text>
                          <Text style={[s.protectionValue, { color: BLUE, fontWeight: '700' }]}>{p.need}</Text>
                        </View>
                        {p.action && (
                          <View style={[s.protectionAction, { backgroundColor: pStatusBg }]}>
                            <Text style={{ fontSize: 12, color: pStatusColor, fontFamily: 'Manrope_400Regular', fontWeight: '600' }}>→ {p.action}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            )}

            {/* ── What-If Simulator ── */}
            <WhatIfSimulator
              goals={goals}
              currentSavings={flow?.savings ?? 0}
              income={flow?.income ?? 0}
            />
          </View>
        )}

        {/* ══ DOWNLOAD REPORT ═══════════════════════════════ */}
        <View style={s.downloadCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 20 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.downloadTitle}>Download Full Report</Text>
              <Text style={s.downloadSub}>Get detailed analysis for your records</Text>
            </View>
          </View>
          <TouchableOpacity style={s.downloadBtn} onPress={downloadReport} activeOpacity={0.85}>
            <Text style={s.downloadBtnTxt}>Export Report</Text>
            <Text style={s.downloadBtnArrow}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* ── AI Chat (always visible) ─── */}
        <View style={{ marginTop: 20 }}>
          <View style={s.chatHeader}>
            <Text style={{ fontSize: 16 }}>💬</Text>
            <Text style={s.chatHeaderText}>Ask your AI coach</Text>
          </View>

          <View style={s.chatContainer}>
            {/* Quick prompts */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
              {['How am I doing?', 'Cut expenses', 'SIP plan', 'Emergency fund', 'Tax tips', 'Insurance advice'].map(p => (
                <TouchableOpacity key={p} style={s.promptChip} onPress={() => sendMessage(p)}>
                  <Text style={s.promptChipTxt}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Messages */}
            <ScrollView
              ref={chatScroll}
              style={s.chatList}
              contentContainerStyle={{ paddingBottom: 8 }}
              onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
            >
              {messages.map(m => (
                <View key={m.id} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                  {m.role === 'ai' && <View style={s.aiAvatar}><Text style={{ fontSize: 10 }}>✨</Text></View>}
                  <View style={[s.bubbleBody, m.role === 'user' ? s.bubbleBodyUser : s.bubbleBodyAI]}>
                    <Text style={[s.bubbleTxt, m.role === 'user' && { color: '#FFF' }]}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {typing && (
                <View style={[s.bubble, s.bubbleAI]}>
                  <View style={s.aiAvatar}><Text style={{ fontSize: 10 }}>✨</Text></View>
                  <View style={[s.bubbleBody, s.bubbleBodyAI, { flexDirection: 'row', gap: 4, paddingVertical: 12 }]}>
                    {[dot1, dot2, dot3].map((d, i) => (
                      <Animated.View key={i} style={[s.typingDot, { transform: [{ translateY: d }] }]} />
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.inputBar}>
                <TextInput
                  style={s.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask anything about your money..."
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
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },

  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 4, marginBottom: 2 },
  brandText: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: 3, fontFamily: 'NotoSerif_700Bold' },
  badge: { backgroundColor: TEAL_L, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: TEAL },

  // Hero / Score card
  heroCard: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A' },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroMonth: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  greeting: { fontSize: 20, fontFamily: 'Manrope_700Bold', color: '#fff', marginBottom: 14 },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontSize: 28, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
  scoreOf: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'Manrope_700Bold', marginTop: -2 },
  scoreLabelBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 6 },
  scoreLabelText: { fontSize: 13, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  scoreSummary: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19, fontFamily: 'Manrope_400Regular' },
  flowLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  flowValue: { fontSize: 14, color: '#fff', fontFamily: 'Manrope_700Bold', marginTop: 1 },

  // Section headers
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: TXT1, flex: 1 },
  countBadge: { backgroundColor: RED_L, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countTxt: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: RED },

  // Top Problems
  problemCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4 },
  sevBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sevBadgeTxt: { fontSize: 10, fontWeight: '800', fontFamily: 'Manrope_700Bold', letterSpacing: 0.5 },
  problemTitle: { fontSize: 15, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold', marginBottom: 4 },
  problemImpact: { fontSize: 13, color: TXT2, lineHeight: 19, fontFamily: 'Manrope_400Regular' },

  // Action Plan
  actionCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: GREEN + '30', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  actionStep: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepNumberTxt: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  actionTitle: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold', marginBottom: 2 },
  actionDesc: { fontSize: 13, color: TXT2, lineHeight: 19, fontFamily: 'Manrope_400Regular', marginBottom: 6 },
  amountChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  amountChipTxt: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold' },

  // Quick Summary
  summaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'flex-start' },
  summaryBullet: { fontSize: 14, color: BLUE, fontWeight: '700', marginTop: 1 },
  summaryText: { fontSize: 14, color: TXT1, lineHeight: 20, fontFamily: 'Manrope_400Regular', flex: 1 },

  // Full Analysis toggle
  fullAnalysisBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE_L, borderRadius: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 1, borderColor: BLUE + '20' },
  fullAnalysisTxt: { fontSize: 15, fontWeight: '700', color: BLUE, fontFamily: 'Manrope_700Bold' },
  fullAnalysisArrow: { fontSize: 12, color: BLUE },

  // Collapsible sections
  collapseCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  collapseTitle: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold', flex: 1 },
  collapseArrow: { fontSize: 12, color: TXT3 },
  collapseBody: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 0 },

  // Section cards (shared)
  sectionIconWrap: { width: 34, height: 34, borderRadius: 11, backgroundColor: BLUE_L, alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  sectionItemText: { fontSize: 13, color: TXT2, lineHeight: 20, fontFamily: 'Manrope_400Regular', flex: 1 },

  // Protection checklist
  protectionCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: ORANGE + '30', borderLeftWidth: 4, borderLeftColor: ORANGE },
  protectionRow: { paddingVertical: 12 },
  protectionName: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold', flex: 1 },
  protectionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  protectionBadgeTxt: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  protectionDetail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  protectionLabel: { fontSize: 11, color: TXT3, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', width: 40 },
  protectionValue: { fontSize: 13, color: TXT1, fontFamily: 'Manrope_400Regular', flex: 1 },
  protectionAction: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },

  // Download report
  downloadCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: BLUE + '20', borderStyle: 'dashed' },
  downloadTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  downloadSub: { fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, marginTop: 4 },
  downloadBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  downloadBtnArrow: { color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 },

  // Chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 16, borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER },
  chatHeaderText: { fontSize: 15, fontFamily: 'Manrope_700Bold', color: TXT1 },
  chatContainer: { backgroundColor: '#FFF', borderRadius: 16, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: 12, borderWidth: 1, borderTopWidth: 0, borderColor: BORDER },
  promptChip: { backgroundColor: BLUE_L, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  promptChipTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: BLUE },
  chatList: { maxHeight: 320, marginBottom: 8 },
  bubble: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  aiAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: TEAL_L, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  bubbleBody: { maxWidth: '78%', padding: 10, borderRadius: 14 },
  bubbleBodyUser: { backgroundColor: BLUE, borderBottomRightRadius: 4 },
  bubbleBodyAI: { backgroundColor: BG_SEC, borderBottomLeftRadius: 4 },
  bubbleTxt: { fontSize: 14, color: TXT1, lineHeight: 20 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: TXT3 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, backgroundColor: BG_SEC, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: TXT1 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#FFF', fontSize: 16, fontWeight: '700' },
})
