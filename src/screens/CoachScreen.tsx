import AsyncStorage from '@react-native-async-storage/async-storage'
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
    View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import { fetchAiChat } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Goal, Profile, Transaction } from '../types'
import { fmtInr } from '../utils/calculations'
import { generateInsights } from '../utils/insights'

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

// ─── Health Score Calculator ────────────────────────────────────────────
function calcHealthScore(txns: Transaction[], goals: Goal[], profile: Profile | null, prevTxns?: Transaction[]) {
  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings = Math.max(0, income - expense)
  const savePct = income > 0 ? (savings / income) * 100 : 0
  const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
  const lifePct = income > 0 ? (lifestyle / income) * 100 : 0

  const savingsScore = Math.min(35, Math.round((savePct / 30) * 35))
  const spendScore = Math.min(25, lifePct <= 30 ? 25 : lifePct <= 50 ? 15 : 5)
  const goalScore = goals.length > 0
    ? Math.min(20, Math.round((goals.filter(g => (g.saved_amount / g.target_amount) > 0.1).length / goals.length) * 20))
    : 10
  const consistScore = txns.length > 5 ? 15 : txns.length > 2 ? 10 : 5

  const score = Math.min(100, savingsScore + spendScore + goalScore + consistScore)

  // Real trend: compare current month vs previous month
  let trend: 'up' | 'down' | 'stable' = 'stable'
  if (prevTxns && prevTxns.length > 0) {
    const prevIncome = prevTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const prevExpense = prevTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const prevSavePct = prevIncome > 0 ? ((prevIncome - prevExpense) / prevIncome) * 100 : 0
    if (savePct > prevSavePct + 3) trend = 'up'
    else if (savePct < prevSavePct - 3) trend = 'down'
  } else {
    trend = savePct >= 20 ? 'up' : savePct >= 10 ? 'stable' : 'down'
  }

  return {
    score,
    trend,
    breakdown: [
      { label: `Savings`, score: savingsScore, max: 35, emoji: '💰', detail: `${Math.round(savePct)}% saved` },
      { label: `Spending`, score: spendScore, max: 25, emoji: '🛒', detail: `${Math.round(lifePct)}% lifestyle` },
      { label: `Goals`, score: goalScore, max: 20, emoji: '🎯', detail: `${goals.filter(g => (g.saved_amount / g.target_amount) > 0.1).length} of ${goals.length} on track` },
      { label: `Discipline`, score: consistScore, max: 20, emoji: '📊', detail: `${txns.length} logged` },
    ],
  }
}

// ─── Challenge Generator ────────────────────────────────────────────────
function getChallenges(txns: Transaction[], profile: Profile | null) {
  const income = profile?.monthly_income ?? txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const daysLeft = daysInMonth - dayOfMonth

  const challenges: { id: string; emoji: string; title: string; desc: string; difficulty: 'easy' | 'medium' | 'hard'; reward: string; color: string }[] = []

  if (lifestyle > 0) {
    const cut10 = Math.round(lifestyle * 0.1)
    challenges.push({ id: 'cut10', emoji: '✂️', title: '10% Lifestyle Cut', desc: `Trim ₹${cut10.toLocaleString('en-IN')} from lifestyle this month`, difficulty: 'medium', reward: `Save ${fmtInr(cut10)}/mo`, color: ORANGE })
  }

  if (daysLeft >= 1) {
    challenges.push({ id: 'nospend', emoji: '🚫', title: 'No-Spend Day', desc: 'Go one full day without spending anything', difficulty: 'easy', reward: 'Build discipline', color: TEAL })
  }

  if (income > 0) {
    const target500 = Math.min(500, Math.round(income * 0.01))
    challenges.push({ id: 'micro', emoji: '🐷', title: `₹${target500} Micro-Save`, desc: `Transfer ₹${target500} to savings right now`, difficulty: 'easy', reward: `${fmtInr(target500 * 12)}/year`, color: GREEN })
  }

  if (expense > income * 0.7) {
    challenges.push({ id: 'budget', emoji: '📋', title: 'Budget Week', desc: `${daysLeft} days left — stay under ${fmtInr(Math.round(Math.max(income - expense, 0) / Math.max(daysLeft, 1)) * daysLeft)}`, difficulty: 'hard', reward: 'End month positive', color: RED })
  }

  challenges.push({ id: 'track', emoji: '📝', title: 'Track Everything', desc: 'Log every expense for 7 days straight', difficulty: 'medium', reward: 'Find hidden leaks', color: BLUE })

  return challenges.slice(0, 4)
}

// ─── AI Reply (keyword-matching) ────────────────────────────────────────
function generateAIReply(msg: string, txns: Transaction[], goals: Goal[], profile: Profile | null) {
  const lc = msg.toLowerCase()

  // ── Finance-only guardrail ──
  const financeKeywords = [
    'money','spend','spent','saving','save','invest','sip','mutual','fund','stock','insurance','protect','cover','term','health','tax','80c','80d','deduction','budget','income','salary','expense','emi','loan','debt','credit','goal','retire','pension','nps','ppf','epf','pf','gold','real estate','property','rent','crypto','emergency','liquid','net worth','wealth','portfolio','return','compound','lakh','crore','inflation','bonus','hike','appraisal','slab','gst','tds','itr','fd','fixed deposit','rd','recurring','bank','upi','payment','lifestyle','essentials','dining','shopping','subscription','cut','trim','reduce','boost','improve','track','funded','needs','how am i doing','overall','score','snapshot','surplus','where to put','creep','safety net','find saving','review expense','high','overspend',
  ]
  const isFinance = financeKeywords.some(k => lc.includes(k))
  if (!isFinance) {
    return `I'm your ArthFlow finance coach — I can only help with money and finance questions! 💰\n\nAsk me about your savings, investments, taxes, insurance, budgets, or goals.`
  }

  const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExp = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const saved = Math.max(0, income - totalExp)
  const savePct = income > 0 ? Math.round((saved / income) * 100) : 0
  const age = profile?.age ?? 28
  const name = profile?.full_name?.split(' ')[0] ?? 'there'
  const monthlyIncome = profile?.monthly_income ?? income
  const lifestyle = txns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
  const lifePct = income > 0 ? Math.round((lifestyle / income) * 100) : 0

  // --- Spending / overspending ---
  if (lc.includes('spending') || lc.includes('spent') || lc.includes('high') || lc.includes('review expense') || lc.includes('cut') || lc.includes('reduc') || lc.includes('expense') || lc.includes('trim')) {
    const essentials = txns.filter(t => t.category === 'essentials').reduce((s, t) => s + t.amount, 0)
    const emis = txns.filter(t => t.category === 'emis').reduce((s, t) => s + t.amount, 0)
    const limit30 = Math.round(income * 0.30)
    const overBy = lifestyle - limit30
    return `${name}, here's your spending breakdown:\n• Essentials: ${fmtInr(essentials)} (${income > 0 ? Math.round((essentials/income)*100) : 0}%)\n• Lifestyle: ${fmtInr(lifestyle)} (${lifePct}%)${overBy > 0 ? ` — ₹${overBy.toLocaleString('en-IN')} over the 30% limit` : ''}\n• EMIs: ${fmtInr(emis)}\n\n${overBy > 0 ? `Action: Cut dining/shopping by ${fmtInr(Math.round(overBy * 0.5))} first — that's the easiest win. Cancel unused subscriptions.` : 'You\'re within limits! Review subscriptions to save more.'}`
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
    return `${name}, your emergency fund target: ${fmtInr(needed)} (6 months × ${fmtInr(totalExp)} expenses).\n\nPlan:\n• Keep it in a liquid mutual fund (6–7% returns, instant withdrawal)\n• Build it in 12 months: ${fmtInr(monthly)}/month\n• Don't use FDs — liquid funds are more accessible and tax-efficient\n• This is your #1 priority before investing.`
  }

  // --- Insurance / protection ---
  if (lc.includes('insurance') || lc.includes('protect') || lc.includes('health insurance') || lc.includes('term') || lc.includes('cover')) {
    const termCover = monthlyIncome * 12 * 15
    return `${name}, here's your insurance roadmap for age ${age}:\n\n🏥 Health Insurance:\n• Get ₹10L family floater (~₹700/mo)\n• Add super top-up for ₹50L (~₹300/mo extra)\n\n❤️ Term Life Insurance:\n• Cover: ${fmtInr(termCover)} (15× annual income)\n• Cost: ~₹700–900/month at age ${age}\n• Buy online (HDFC/ICICI/Max) — 40% cheaper\n\nTotal budget: under ${fmtInr(Math.round(monthlyIncome * 0.05))}/month (5% of income).`
  }

  // --- SIP / investing ---
  if (lc.includes('sip') || lc.includes('invest') || lc.includes('mutual') || lc.includes('surplus') || lc.includes('where to put')) {
    const idealEq = Math.min(80, 100 - age)
    const sipAmt = Math.round(saved * 0.6)
    return `${name}, investment plan for age ${age}:\n\n📈 SIP Allocation (${fmtInr(sipAmt)}/month):\n• 60% Large-cap Index Fund (Nifty 50)\n• 25% Mid/Small-cap Fund\n• 15% International (Nasdaq/S&P 500)\n\n🎯 Equity allocation: ${idealEq}% (rule: 100 minus age)\n💰 Use ELSS for tax saving under 80C\n\nStart today — even ${fmtInr(1000)}/month compounds to ₹25L+ in 20 years.`
  }

  // --- Goals ---
  if (lc.includes('goal') || lc.includes('track') || lc.includes('funded') || lc.includes('needs')) {
    if (goals.length === 0) return `${name}, you haven't set any goals yet! Head to the Plan tab to create one. I'd recommend starting with an emergency fund and a retirement goal.`
    const summaries = goals.slice(0, 3).map(g => {
      const pct = Math.min(100, Math.round(((g.saved_amount || g.current_amount || 0) / g.target_amount) * 100))
      return `• "${g.name}": ${pct}% funded (${fmtInr(g.saved_amount || g.current_amount || 0)} of ${fmtInr(g.target_amount)})`
    }).join('\n')
    return `${name}, here's your goal progress:\n\n${summaries}\n\n${goals.some(g => ((g.saved_amount || 0) / g.target_amount) < 0.25) ? 'Some goals are underfunded — consider increasing your monthly SIP or reallocating from lifestyle.' : 'Looking good! Stay consistent with monthly contributions.'}`
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
    return `${name}'s financial snapshot:\n\n💰 Income: ${fmtInr(income)}/month\n🛒 Spending: ${fmtInr(totalExp)} (${income > 0 ? Math.round((totalExp / income) * 100) : 0}%)\n📊 Savings: ${fmtInr(saved)}/month (${savePct}%)\n\n${savePct >= 20 ? "✅ Above 20% benchmark — solid!" : "⚠️ Below 20% target — let's trim lifestyle spending."}\n\nTop action: ${savePct < 20 ? 'Reduce lifestyle by 10% to hit 20% savings.' : 'Review your SIP allocation and insurance coverage.'}`

  // --- Fallback: give personalized advice based on their situation ---
  return `${name}, based on your finances:\n\n• Savings rate: ${savePct}% ${savePct >= 20 ? '✅' : '(target: 20%)'}\n• Lifestyle: ${lifePct}% of income ${lifePct <= 30 ? '✅' : '(target: ≤30%)'}\n• Goals: ${goals.length} active\n\nTop priority: ${savePct < 20 ? `Find ${fmtInr(Math.round(income * 0.20 - saved))} more in savings by trimming lifestyle.` : goals.length === 0 ? 'Set a financial goal in the Plan tab.' : 'Stay consistent and review your SIP allocation.'}\n\nAsk me about savings, investing, insurance, or tax planning!`
}

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════
export default function CoachScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [prevTxns, setPrevTxns] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assets, setAssets] = useState<any>(null)
  const [insights, setInsights] = useState<any[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())

  // Chat
  const [messages, setMessages] = useState([
    { id: '0', role: 'ai', text: 'Hi! I\'m your AI coach. Ask me anything about your money.' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [showAskBar, setShowAskBar] = useState(false)
  const chatScroll = useRef<ScrollView>(null)
  const mainScroll = useRef<ScrollView>(null)
  const chatSectionY = useRef(0)

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

  // Challenges accepted
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      // Also fetch previous month for trend comparison
      const prevMonthStart = new Date(startOfMonth)
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
      const prevMonthEnd = new Date(startOfMonth)
      prevMonthEnd.setMilliseconds(-1)

      const [txnRes, prevTxnRes, goalRes, profileRes] = await Promise.all([
        supabase.from('transactions').select('*').gte('date', startOfMonth.toISOString()).order('date', { ascending: false }),
        supabase.from('transactions').select('*').gte('date', prevMonthStart.toISOString()).lt('date', startOfMonth.toISOString()),
        supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ])

      const t = txnRes.data ?? []
      const pt = prevTxnRes.data ?? []
      const g = goalRes.data ?? []
      const p = profileRes.data ?? null

      // Load assets from AsyncStorage for insights
      let loadedAssets = null
      try {
        const raw = await AsyncStorage.getItem('@arthflow_assets')
        if (raw) loadedAssets = JSON.parse(raw)
      } catch {}

      setTxns(t)
      setPrevTxns(pt)
      setGoals(g)
      setProfile(p)
      setAssets(loadedAssets)
      setInsights(generateInsights({ transactions: t, goals: g, profile: p, assets: loadedAssets }))
    } catch (e) {
      console.error('CoachScreen loadData error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  const onRefresh = () => { setRefreshing(true); loadData() }

  const sendMessage = async (text?: string) => {
    const msg = (text || chatInput).trim()
    if (!msg) return
    // Auto-open chat if not visible
    if (!showAskBar) setShowAskBar(true)
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: msg }])
    setChatInput('')
    setTyping(true)
    animateTyping()

    // Scroll to chat section
    setTimeout(() => mainScroll.current?.scrollToEnd({ animated: true }), 300)

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

        // Also update component state so UI stays in sync
        setTxns(freshTxns)
        setGoals(freshGoals)
        setProfile(freshProfile)
        setAssets(freshAssets)
      }
    } catch (e) {
      console.error('Failed to fetch fresh data for AI chat:', e)
    }

    // Build context from fresh data
    const income = freshTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const spent = freshTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const lifestyle = freshTxns.filter(t => t.category === 'lifestyle').reduce((s, t) => s + t.amount, 0)
    const essentials = freshTxns.filter(t => t.category === 'essentials').reduce((s, t) => s + t.amount, 0)
    const emis = freshTxns.filter(t => t.category === 'emis').reduce((s, t) => s + t.amount, 0)
    const realIncome = income > 0 ? income : (freshProfile?.monthly_income ?? 0)

    const chatContext = {
      profile: freshProfile,
      transactions: freshTxns,
      goals: freshGoals,
      assets: freshAssets,
      monthlyFlow: {
        income: realIncome,
        spent,
        saved: Math.max(0, realIncome - spent),
        savePct: realIncome > 0 ? Math.round(((realIncome - spent) / realIncome) * 100) : 0,
        lifestyle,
        lifePct: realIncome > 0 ? Math.round((lifestyle / realIncome) * 100) : 0,
        essentials,
        emis,
      },
    }

    try {
      const reply = await fetchAiChat(msg, chatContext)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: reply }])
    } catch (err) {
      console.error('AI chat error:', err)
      // Fallback to local reply if backend fails
      const fallback = generateAIReply(msg, freshTxns, freshGoals, freshProfile)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'ai', text: fallback }])
    } finally {
      setTyping(false)
      dot1.setValue(0); dot2.setValue(0); dot3.setValue(0)
    }
  }

  const openChat = () => {
    if (!showAskBar) setShowAskBar(true)
    setTimeout(() => mainScroll.current?.scrollToEnd({ animated: true }), 300)
  }

  const dismiss = (idx: number) => setDismissed(prev => new Set(prev).add(idx))
  const activeInsights = insights.filter((_, i) => !dismissed.has(i))

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={BLUE} /></View>
  }

  const health = calcHealthScore(txns, goals, profile, prevTxns)
  const challenges = getChallenges(txns, profile)
  const scoreColor = health.score >= 70 ? GREEN : health.score >= 45 ? ORANGE : RED
  const trendIcon = health.trend === 'up' ? '↑' : health.trend === 'down' ? '↓' : '→'
  const trendColor = health.trend === 'up' ? GREEN : health.trend === 'down' ? RED : TXT3

  const greeting = () => {
    const h = new Date().getHours()
    const name = profile?.full_name?.split(' ')[0] ?? 'there'
    if (h < 12) return `Good morning, ${name}`
    if (h < 17) return `Good afternoon, ${name}`
    return `Good evening, ${name}`
  }

  // Daily pulse — uses real data
  const pulseMsg = () => {
    const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const dayOfMonth = new Date().getDate()
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    const pctMonth = Math.round((dayOfMonth / daysInMonth) * 100)
    const realIncome = income > 0 ? income : (profile?.monthly_income ?? 0)
    const pctBudget = realIncome > 0 ? Math.round((expense / realIncome) * 100) : 0

    if (realIncome === 0 && expense === 0) return `No transactions this month yet. Start logging to get personalised insights! 📝`
    if (realIncome === 0) return `You've spent ${fmtInr(expense)} so far. Add your income to see budget analysis.`

    const saved = Math.max(0, realIncome - expense)
    if (pctBudget < pctMonth - 10) return `Spent ${fmtInr(expense)} (${pctBudget}% of income) with ${100 - pctMonth}% of the month left. Saving ${fmtInr(saved)} so far. 🟢`
    if (pctBudget > pctMonth + 15) return `Spent ${fmtInr(expense)} (${pctBudget}% of income), only ${pctMonth}% through the month. Slow down to save more. 🟡`
    return `Spent ${fmtInr(expense)} (${pctBudget}%), ${pctMonth}% through the month. On track to save ${fmtInr(saved)}. 🔵`
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
        <View style={s.badge}>
          <TouchableOpacity onPress={openChat} activeOpacity={0.7}>
            <Text style={s.badgeTxt}>✨ AI</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={mainScroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 0, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero Card (dark navy, matches other screens) ─── */}
        <View style={s.heroCard}>
          <View style={s.heroGlow} />
          <View style={s.heroContent}>
            <Text style={s.greeting}>{greeting()}</Text>
            <View style={s.pulseCard}>
              <Text style={s.pulseTxt}>{pulseMsg()}</Text>
            </View>

            {/* Health Score */}
            <View style={s.healthSection}>
              <View style={s.healthTop}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[s.scoreCircle, { borderColor: scoreColor }]}>
                    <Text style={[s.scoreNum, { color: scoreColor }]}>{health.score}</Text>
                    <Text style={s.scoreLabel}>/ 100</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                    <Text style={[s.trendIcon, { color: trendColor }]}>{trendIcon}</Text>
                    <Text style={[s.trendText, { color: trendColor }]}>
                      {health.trend === 'up' ? 'Improving' : health.trend === 'down' ? 'Needs work' : 'Steady'}
                      {prevTxns.length > 0 ? ' vs last month' : ''}
                    </Text>
                  </View>
                </View>
                <View style={s.breakdownCol}>
                  {health.breakdown.map(b => (
                    <View key={b.label} style={s.breakdownRow}>
                      <Text style={{ fontSize: 13 }}>{b.emoji}</Text>
                      <Text style={s.breakdownLabel}>{b.label}</Text>
                      <View style={s.breakdownBarBg}>
                        <View style={[s.breakdownBarFill, { width: `${(b.score / b.max) * 100}%`, backgroundColor: b.score / b.max >= 0.7 ? GREEN : b.score / b.max >= 0.4 ? ORANGE : RED }]} />
                      </View>
                      <Text style={s.breakdownScore}>{b.score}/{b.max}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <Text style={s.healthTitle}>Financial Health</Text>
            </View>
          </View>
        </View>

        {/* ── Action Nudges ─── */}
        {activeInsights.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>🎯 Action Items</Text>
              <View style={s.countBadge}><Text style={s.countTxt}>{activeInsights.length}</Text></View>
            </View>
            {activeInsights.slice(0, 3).map((ins, i) => {
              const isWarning = ins.type === 'warning' || ins.type === 'risk'
              const cardBg = isWarning ? '#FFF7ED' : '#F0FDF4'
              const accent = isWarning ? ORANGE : GREEN
              return (
                <View key={i} style={[s.nudgeCard, { backgroundColor: cardBg, borderLeftColor: accent }]}>
                  <View style={s.nudgeTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nudgeTitle}>{ins.title}</Text>
                      <Text style={s.nudgeMsg}>{ins.message}</Text>
                    </View>
                    <TouchableOpacity onPress={() => dismiss(i)} style={s.dismissBtn}>
                      <Text style={{ fontSize: 10, color: TXT3 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {ins.action && (
                    <TouchableOpacity style={[s.nudgeCta, { backgroundColor: accent }]} activeOpacity={0.85}
                      onPress={() => sendMessage(`${ins.title}: ${ins.message}. What should I do?`)}>
                      <Text style={s.nudgeCtaTxt}>{ins.action}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </>
        )}

        {/* ── Money Challenges ─── */}
        <View style={[s.sectionRow, { marginTop: 20 }]}>
          <Text style={s.sectionTitle}>🏆 Challenges</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {challenges.map(ch => {
            const isAccepted = accepted.has(ch.id)
            return (
              <View key={ch.id} style={[s.challengeCard, isAccepted && { borderColor: ch.color + '60' }]}>
                <View style={s.diffBadge}>
                  <Text style={[s.diffTxt, { color: ch.difficulty === 'easy' ? GREEN : ch.difficulty === 'medium' ? ORANGE : RED }]}>
                    {ch.difficulty === 'easy' ? '🟢' : ch.difficulty === 'medium' ? '🟡' : '🔴'} {ch.difficulty}
                  </Text>
                </View>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>{ch.emoji}</Text>
                <Text style={s.challengeTitle}>{ch.title}</Text>
                <Text style={s.challengeDesc}>{ch.desc}</Text>
                <View style={[s.challengeReward, { backgroundColor: ch.color + '15' }]}>
                  <Text style={[s.challengeRewardTxt, { color: ch.color }]}>🎁 {ch.reward}</Text>
                </View>
                <TouchableOpacity
                  style={[s.challengeBtn, isAccepted ? { backgroundColor: ch.color + '15' } : { backgroundColor: ch.color }]}
                  onPress={() => setAccepted(prev => { const n = new Set(prev); isAccepted ? n.delete(ch.id) : n.add(ch.id); return n })}
                  activeOpacity={0.85}
                >
                  <Text style={[s.challengeBtnTxt, isAccepted && { color: ch.color }]}>{isAccepted ? '✓ Accepted' : 'Accept'}</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </ScrollView>

        {/* ── Risk & Protection ─── */}
        <View style={[s.sectionRow, { marginTop: 20 }]}>
          <Text style={s.sectionTitle}>🛡️ Risk & Protection</Text>
        </View>
        {(() => {
          const monthlyExp = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
          const liquid = assets?.liquidCash ?? 0
          const epf = assets?.epf ?? 0
          const needed6 = (monthlyExp || (profile?.expenses_essentials ?? 0) + (profile?.expenses_lifestyle ?? 0) + (profile?.expenses_emis ?? 0)) * 6
          const monthsCovered = needed6 > 0 ? Math.floor(liquid / (needed6 / 6)) : 0

          const emergencyStatus: 'ok' | 'partial' | 'missing' = monthsCovered >= 6 ? 'ok' : monthsCovered >= 1 ? 'partial' : 'missing'
          const emergencyDesc = monthsCovered >= 6
            ? `${monthsCovered} months covered ✅`
            : monthsCovered >= 1
            ? `~${monthsCovered} month${monthsCovered > 1 ? 's' : ''} covered — need 6 months.`
            : 'No emergency fund yet.'
          const emergencyImpact = monthsCovered < 6
            ? `You need ${fmtInr(needed6)} (6 months of expenses) — currently ${fmtInr(liquid)} in liquid cash.`
            : ''

          const items = [
            { id: 'emergency', label: 'Emergency Fund', icon: '🛡️', status: emergencyStatus, desc: emergencyDesc, impact: emergencyImpact },
            { id: 'health', label: 'Health Insurance', icon: '🏥', status: 'missing' as const, desc: 'Not tracked yet.', impact: 'A medical emergency can wipe out savings. Ask me for a plan.' },
            { id: 'life', label: 'Term Life Insurance', icon: '❤️', status: 'missing' as const, desc: 'Not tracked yet.', impact: 'Your family needs financial protection. Ask me for advice.' },
          ]

          return items.map(item => {
          const isMissing = item.status === 'missing'
          const isPartial = item.status === 'partial'
          const isOk = item.status === 'ok'
          const statusColor = isOk ? GREEN : isPartial ? ORANGE : RED
          const statusLabel = isOk ? 'Covered' : isPartial ? 'Partial' : 'Missing'
          const bgColor = isOk ? GREEN_L : isPartial ? ORANGE_L : RED_L
          return (
            <View key={item.id} style={[s.protCard, { borderLeftColor: statusColor }]}>
              <View style={s.protRow}>
                <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.protName}>{item.label}</Text>
                    <View style={[s.protBadge, { backgroundColor: bgColor }]}>
                      <Text style={[s.protBadgeLabel, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text style={s.protDesc}>{item.desc}</Text>
                </View>
              </View>
              {!isOk && (
                <TouchableOpacity
                  style={[s.protFixBtn, { backgroundColor: statusColor }]}
                  onPress={() => sendMessage(`I need help with ${item.label}. ${item.impact} What should I do?`)}
                  activeOpacity={0.85}
                >
                  <Text style={s.protFixBtnText}>Get advice →</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        })})()}

        {/* ── Quick Ask (Collapsible Chat) ─── */}
        <View style={{ marginTop: 24 }}>
          <TouchableOpacity style={s.askToggle} onPress={() => setShowAskBar(!showAskBar)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={s.askToggleText}>Ask your AI coach</Text>
            </View>
            <Text style={{ fontSize: 16, color: TXT3 }}>{showAskBar ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showAskBar && (
            <View style={s.chatContainer}>
              {/* Quick prompts */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                {['How am I doing?', 'Cut expenses', 'SIP plan', 'Emergency fund', 'Tax tips'].map(p => (
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
                    placeholder="Ask anything..."
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
          )}
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

  // Hero card (dark navy, matches other screens)
  heroCard: { borderRadius: 24, paddingHorizontal: 20, paddingVertical: 16, marginBottom: 14, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A' },
  heroGlow: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)', top: -30, right: -30 },
  heroContent: { position: 'relative', zIndex: 1 },
  greeting: { fontSize: 22, fontFamily: 'Manrope_700Bold', color: '#fff', marginBottom: 8 },
  pulseCard: { borderRadius: 16, padding: 14, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  pulseTxt: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 21, fontFamily: 'Manrope_400Regular', fontWeight: '600' },

  // Health score (inside hero)
  healthSection: { marginTop: 4 },
  healthTop: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  healthTitle: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, textAlign: 'center' },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 28, fontFamily: 'Manrope_700Bold' },
  scoreLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -2 },
  trendIcon: { fontSize: 16, fontWeight: '800' },
  trendText: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  breakdownCol: { flex: 1, gap: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular', color: 'rgba(255,255,255,0.55)', width: 64 },
  breakdownBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  breakdownBarFill: { height: '100%', borderRadius: 3 },
  breakdownScore: { fontSize: 11, fontFamily: 'Manrope_700Bold', color: 'rgba(255,255,255,0.45)', width: 30, textAlign: 'right' },

  // Section headers
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: TXT1 },
  countBadge: { backgroundColor: ORANGE_L, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countTxt: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: ORANGE },

  // Nudge cards
  nudgeCard: { borderLeftWidth: 3, borderRadius: 16, padding: 16, marginBottom: 10 },
  nudgeTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  nudgeTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: TXT1, marginBottom: 4 },
  nudgeMsg: { fontSize: 13, color: TXT2, lineHeight: 20, fontFamily: 'Manrope_400Regular' },
  dismissBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
  nudgeCta: { marginTop: 12, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  nudgeCtaTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#FFF' },

  // Challenges
  challengeCard: { width: 170, borderRadius: 20, padding: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: BORDER, marginBottom: 4 },
  challengeTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: TXT1, marginBottom: 4 },
  challengeDesc: { fontSize: 12, color: TXT2, lineHeight: 18, marginBottom: 10, fontFamily: 'Manrope_400Regular', minHeight: 34 },
  challengeReward: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10, alignSelf: 'flex-start' },
  challengeRewardTxt: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
  challengeBtn: { borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  challengeBtnTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#FFF' },
  diffBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6, backgroundColor: BG_SEC },
  diffTxt: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  // Protection cards
  protCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3 },
  protRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  protName: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: TXT1 },
  protBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  protBadgeLabel: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  protDesc: { fontSize: 12, color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  protFixBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  protFixBtnText: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#FFF' },

  // Ask toggle
  askToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  askToggleText: { fontSize: 15, fontFamily: 'Manrope_700Bold', color: TXT1 },

  // Chat
  chatContainer: { backgroundColor: '#FFF', borderRadius: 16, borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: 12, borderWidth: 1, borderTopWidth: 0, borderColor: BORDER },
  promptChip: { backgroundColor: BLUE_L, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  promptChipTxt: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: BLUE },
  chatList: { maxHeight: 280, marginBottom: 8 },
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
