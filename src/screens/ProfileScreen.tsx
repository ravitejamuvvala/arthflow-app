import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'
import { supabase } from '../lib/supabase'
import { Goal, Profile, Transaction } from '../types'
import { commaFormat, stripCommas } from '../utils/calculations'

// ─── Design Tokens ──────────────────────────────────────────────────────
const BLUE    = '#1E3A8A'
const BLUE_L  = '#DBEAFE'
const GREEN   = '#22C55E'
const GREEN_H = '#16A34A'
const GREEN_L = '#DCFCE7'
const ORANGE  = '#F59E0B'
const ORANGE_H= '#D97706'
const ORANGE_L= '#FEF3C7'
const RED     = '#EF4444'
const TEAL    = '#14B8A6'
const TEAL_L  = '#CCFBF1'
const INDIGO  = '#6366F1'
const INDIGO_L= '#E0E7FF'
const TXT1    = '#111827'
const TXT2    = '#6B7280'
const TXT3    = '#9CA3AF'
const BORDER  = '#E5E7EB'
const BG_SEC  = '#F1F5F9'

const { width: SCREEN_W } = Dimensions.get('window')
const STORAGE_KEY = '@arthflow_assets'

// ─── Asset Config ───────────────────────────────────────────────────────
interface AssetPortfolio {
  liquidCash: number; mutualFunds: number; stocks: number; epf: number
  ppf: number; gold: number; realEstate: number; other: number
}
const defaultAssets: AssetPortfolio = {
  liquidCash: 0, mutualFunds: 0, stocks: 0, epf: 0,
  ppf: 0, gold: 0, realEstate: 0, other: 0,
}

interface AssetConfig {
  key: keyof AssetPortfolio; label: string; subLabel: string
  emoji: string; color: string; bg: string; description: string
}
const ASSET_CONFIG: AssetConfig[] = [
  { key: 'liquidCash',  label: 'Cash & Savings',   subLabel: 'Bank + FD < 1yr',        emoji: '💵', color: GREEN,  bg: GREEN_L,  description: 'Savings account, current account, and fixed deposits under 1 year.' },
  { key: 'mutualFunds', label: 'Mutual Funds',     subLabel: 'SIP + Lump sum',         emoji: '📈', color: BLUE,   bg: BLUE_L,   description: 'Total current value of all mutual fund investments.' },
  { key: 'stocks',      label: 'Stocks',           subLabel: 'Direct equity portfolio', emoji: '📊', color: INDIGO, bg: INDIGO_L, description: 'Current market value of your direct stock portfolio.' },
  { key: 'epf',         label: 'EPF / PF',         subLabel: 'Employee Provident Fund', emoji: '🏦', color: TEAL,   bg: TEAL_L,   description: 'Your accumulated EPF balance.' },
  { key: 'ppf',         label: 'PPF',              subLabel: 'Public Provident Fund',   emoji: '🔒', color: '#8B5CF6', bg: '#EDE9FE', description: 'Public Provident Fund balance. Tax-free under 80C.' },
  { key: 'gold',        label: 'Gold',             subLabel: 'Physical + SGB + ETF',    emoji: '🥇', color: ORANGE, bg: ORANGE_L, description: 'Total value of gold holdings.' },
  { key: 'realEstate',  label: 'Real Estate',      subLabel: 'Investment properties',   emoji: '🏠', color: RED,    bg: '#FEE2E2', description: 'Current market value of investment properties.' },
  { key: 'other',       label: 'Other Assets',     subLabel: 'NPS · Bonds · Crypto',    emoji: '🔧', color: TXT2,   bg: BG_SEC,   description: 'NPS, bonds, crypto, and other investments.' },
]

function fmtInr(val: number) {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
  if (val >= 1000)   return `₹${(val / 1000).toFixed(1)}K`
  return `₹${Math.round(val)}`
}

function totalNetWorth(a: AssetPortfolio): number {
  return Object.values(a).reduce((s, v) => s + v, 0)
}

// ─── Wealth Insights (dynamic) ──────────────────────────────────────────
function getWealthInsights(assets: AssetPortfolio, nw: number) {
  if (nw === 0) return []
  const insights: string[] = []
  const pcts = Object.entries(assets).map(([k, v]) => ({ key: k, pct: nw > 0 ? Math.round((v / nw) * 100) : 0, val: v }))
  const top = pcts.sort((a, b) => b.pct - a.pct)[0]
  if (top && top.pct > 50) {
    const cfg = ASSET_CONFIG.find(c => c.key === top.key)
    insights.push(`You're ${top.pct}% in ${cfg?.label || top.key} — consider diversifying`)
  }
  if ((assets.liquidCash / nw) < 0.05 && nw > 100000) {
    insights.push('Your cash is quite low — keep 3–6 months expenses liquid')
  }
  if (assets.gold > 0 && (assets.gold / nw) > 0.15) {
    insights.push('Gold is over 15% of portfolio — ideal range is 5–10%')
  }
  return insights
}

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const [userName, setUserName]     = useState('')
  const [userEmail, setUserEmail]   = useState('')
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [goals, setGoals]           = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [assets, setAssets]         = useState<AssetPortfolio>(defaultAssets)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [weeklyDigest, setWeeklyDigest]   = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showTnC, setShowTnC]         = useState(false)
  const [showAbout, setShowAbout]     = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [editName, setEditName]       = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editDob, setEditDob]         = useState('')
  const [editPhone, setEditPhone]     = useState('')
  const [editEmail, setEditEmail]     = useState('')
  const [editIncome, setEditIncome]   = useState('')
  const [editType, setEditType]       = useState<string>('salary')
  const [showSignOut, setShowSignOut] = useState(false)
  const [showIncome, setShowIncome] = useState(false)
  const [showNetWorth, setShowNetWorth] = useState(false)
  const [activeAssetSheet, setActiveAssetSheet] = useState<keyof AssetPortfolio | null>(null)
  const [assetInputValue, setAssetInputValue] = useState('')

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email ?? '')

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const fourMonthsAgo = new Date()
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3)
    fourMonthsAgo.setDate(1)
    fourMonthsAgo.setHours(0, 0, 0, 0)

    const [txResult, allTxResult, goalsResult, profileResult] = await Promise.all([
      supabase.from('transactions').select('*').gte('date', startOfMonth.toISOString()),
      supabase.from('transactions').select('*').gte('date', fourMonthsAgo.toISOString()),
      supabase.from('goals').select('*'),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ])

    setTransactions(txResult.data ?? [])
    setAllTransactions(allTxResult.data ?? [])
    setGoals(goalsResult.data ?? [])
    const p = profileResult.data ?? null
    setProfile(p)
    setUserName(p?.full_name || user.email?.split('@')[0] || 'User')

    // Load assets from AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) setAssets(JSON.parse(raw))
    } catch {}

    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  const saveAsset = (key: keyof AssetPortfolio, val: number) => {
    setAssets(prev => {
      const next = { ...prev, [key]: val }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      // Clear cached AI report so Coach/Home screens use fresh asset data
      AsyncStorage.removeItem('@arthflow_ai_report')
      return next
    })
  }

  const handleSignOut = () => setShowSignOut(true)
  const confirmSignOut = async () => {
    setSigningOut(true)
    // Clear all local cached data before signing out
    const keys = await AsyncStorage.getAllKeys()
    const arthKeys = keys.filter(k => k.startsWith('@arthflow_'))
    if (arthKeys.length) await AsyncStorage.multiRemove(arthKeys)
    await supabase.auth.signOut()
    setSigningOut(false)
    setShowSignOut(false)
  }

  const handleRestartOnboarding = async () => {
    Alert.alert('Restart Onboarding', 'This will reset your financial setup. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').update({ is_onboarded: false }).eq('id', user.id)
          await supabase.auth.refreshSession()
          const { data: { session } } = await supabase.auth.getSession()
          if (session) await supabase.auth.signOut()
        }
      }},
    ])
  }

  if (loading) {
    return <View style={st.center}><ActivityIndicator color={BLUE} size="large" /></View>
  }

  const income     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthlyIncome = profile?.monthly_income ?? 0
  const age = profile?.age ?? 0

  // Streak
  const getStreak = () => {
    let streak = 0
    const now = new Date()
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthTx = allTransactions.filter(t => {
        const td = new Date(t.date)
        return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear()
      })
      const mInc = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const mExp = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      if (mInc - mExp > 0 || i === 0) streak++
      else break
    }
    return streak
  }
  const streak = getStreak()

  // Wealth
  const nw = totalNetWorth(assets)
  const wealthInsights = getWealthInsights(assets, nw)
  const activeCfg = ASSET_CONFIG.find(c => c.key === activeAssetSheet)

  // Allocation segments
  const allocSegments = ASSET_CONFIG
    .map(cfg => ({ label: cfg.label, value: assets[cfg.key], color: cfg.color, emoji: cfg.emoji }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)

  return (
    <View style={st.container}>
      {/* App Bar */}
      <View style={st.appBar}>
        <View style={st.brandRow}>
          <ArthFlowLogo size={28} />
          <Text style={st.brandText}>ARTHFLOW</Text>
        </View>
        <TouchableOpacity style={st.editBtn} activeOpacity={0.7} onPress={() => { setEditName(userName); setEditLastName(''); setEditDob(profile?.dob || ''); setEditPhone(profile?.phone || ''); setEditEmail(userEmail); setEditIncome(monthlyIncome ? commaFormat(String(monthlyIncome)) : ''); setEditType(profile?.income_type || 'salary'); setShowEdit(true) }}>
          <Text style={st.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >

      {/* ─── Hero Profile Card ─── */}
      <View style={st.heroCard}>
        <View style={st.heroBlob1} />
        <View style={st.heroBlob2} />
        <View style={st.heroWatermark} pointerEvents="none">
          <ArthFlowLogo size={120} />
        </View>
        <View style={st.heroContent}>
          <View style={st.heroUserRow}>
            <View style={st.heroAvatar}>
              <Text style={st.heroAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.heroUserName}>{userName}</Text>
              <Text style={st.heroUserSub}>
                {(() => {
                  const t = profile?.income_type
                  const map: Record<string, string> = { salary: '💼 Salaried', business: '🏢 Business', freelance: '👤 Freelance', homemaker: '🏠 Homemaker', student: '🎓 Student', retired: '🏖️ Retired' }
                  return map[t || ''] || (t ? `✏️ ${t.charAt(0).toUpperCase() + t.slice(1)}` : '💼 Salaried')
                })()}{age > 0 ? ` · Age ${age}` : ''}
              </Text>
              <View style={st.heroMemberRow}>
                <View style={st.heroMemberDot} />
                <Text style={st.heroMemberText}>Member since {(() => { const d = (profile as any)?.created_at ? new Date((profile as any).created_at) : new Date(); return d.toLocaleString('default', { month: 'long', year: 'numeric' }); })()}</Text>
              </View>
            </View>
          </View>
          <View style={st.heroStatsGrid}>
            <TouchableOpacity style={st.heroStatBox} onPress={() => setShowIncome(!showIncome)} activeOpacity={0.7}>
              <Text style={{ fontSize: 14 }}>💰</Text>
              <Text style={st.heroStatValue}>{showIncome ? fmtInr(monthlyIncome || income) : '••••'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={st.heroStatLabel}>Income</Text>
                <Text style={{ fontSize: 10 }}>{showIncome ? '🙈' : '👁️'}</Text>
              </View>
            </TouchableOpacity>
            <View style={st.heroStatBox}>
              <Text style={{ fontSize: 14 }}>🔥</Text>
              <Text style={st.heroStatValue}>{streak} mo</Text>
              <Text style={st.heroStatLabel}>Streak</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Net Worth & Wealth ─── */}
      <View style={st.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <TouchableOpacity onPress={() => setShowNetWorth(!showNetWorth)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={st.cardTitle}>Net Worth</Text>
            <Text style={{ fontSize: 10 }}>{showNetWorth ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#E0A820', fontFamily: 'Manrope_700Bold' }}>
            {showNetWorth ? fmtInr(nw) : '••••'}
          </Text>
        </View>

        {/* Allocation bar with labels */}
        {nw > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 8 }}>
              {allocSegments.map(seg => (
                <View key={seg.label} style={{ flex: seg.value / nw, backgroundColor: seg.color, minWidth: 2 }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {allocSegments.map(seg => {
                const pct = Math.round((seg.value / nw) * 100)
                return (
                  <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color }} />
                    <Text style={{ fontSize: 12, color: TXT2, fontFamily: 'Manrope_400Regular' }}>{seg.label} {pct}%</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Asset visual cards */}
        <View style={{ gap: 8 }}>
          {ASSET_CONFIG.map(cfg => {
            const val = assets[cfg.key]
            const pct = nw > 0 ? Math.round((val / nw) * 100) : 0
            return (
              <TouchableOpacity
                key={cfg.key}
                onPress={() => { setActiveAssetSheet(cfg.key); setAssetInputValue(val > 0 ? commaFormat(String(val)) : '') }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: val > 0 ? cfg.bg : BG_SEC }}
                activeOpacity={0.7}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: val > 0 ? cfg.color + '18' : BORDER, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{cfg.label}</Text>
                  <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular' }}>{cfg.subLabel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: val > 0 ? cfg.color : TXT3, fontFamily: 'Manrope_700Bold' }}>
                    {showNetWorth ? (val > 0 ? fmtInr(val) : '₹0') : '••••'}
                  </Text>
                  {val > 0 && nw > 0 && <Text style={{ fontSize: 12, color: TXT3, fontFamily: 'Manrope_400Regular', marginTop: 1 }}>{pct}%</Text>}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Wealth insights */}
        {wealthInsights.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {wealthInsights.map((ins, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, backgroundColor: ORANGE_L }}>
                <Text style={{ fontSize: 12 }}>⚡</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: ORANGE_H, flex: 1, fontFamily: 'Manrope_400Regular' }}>{ins}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ─── Settings: Notifications ─── */}
      <View style={st.settingsGroup}>
        <Text style={st.settingsGroupTitle}>NOTIFICATIONS</Text>
        <View style={st.settingsCard}>
          <View style={st.settingsItem}>
            <View style={[st.settingsIcon, { backgroundColor: BLUE_L }]}>
              <Text style={{ fontSize: 15 }}>🔔</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.settingsLabel}>AI Spending Nudges</Text>
              <Text style={st.settingsDesc}>Alerts when approaching budget limits</Text>
            </View>
            <Switch value={notifications} onValueChange={setNotifications} trackColor={{ false: '#E2E8F0', true: BLUE }} thumbColor="#fff" />
          </View>
          <View style={st.settingsDivider} />
          <View style={st.settingsItem}>
            <View style={[st.settingsIcon, { backgroundColor: BLUE_L }]}>
              <Text style={{ fontSize: 15 }}>📬</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.settingsLabel}>Weekly Digest</Text>
              <Text style={st.settingsDesc}>Sunday financial summary</Text>
            </View>
            <Switch value={weeklyDigest} onValueChange={setWeeklyDigest} trackColor={{ false: '#E2E8F0', true: BLUE }} thumbColor="#fff" />
          </View>
        </View>
      </View>

      {/* ─── Settings: Account ─── */}
      <View style={st.settingsGroup}>
        <Text style={st.settingsGroupTitle}>ACCOUNT</Text>
        <View style={st.settingsCard}>
          <TouchableOpacity onPress={() => { setEditName(userName); setEditLastName(''); setEditDob(profile?.dob || ''); setEditPhone(profile?.phone || ''); setEditEmail(userEmail); setEditIncome(monthlyIncome ? commaFormat(String(monthlyIncome)) : ''); setEditType(profile?.income_type || 'salary'); setShowEdit(true) }}>
            <SettingsRow icon="👤" label="Edit Profile" desc={`${userName} · ${userEmail}`} />
          </TouchableOpacity>
          <View style={st.settingsDivider} />
          <SettingsRow icon="📅" label="Monthly Plan Reset" desc="Auto-resets on 1st of each month" />
          <View style={st.settingsDivider} />
          <TouchableOpacity onPress={handleRestartOnboarding}>
            <SettingsRow icon="🔄" label="Restart Onboarding" desc="Re-setup your money flow" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Settings: Support & Legal ─── */}
      <View style={st.settingsGroup}>
        <Text style={st.settingsGroupTitle}>SUPPORT & LEGAL</Text>
        <View style={st.settingsCard}>
          <TouchableOpacity onPress={() => { setFeedbackSent(false); setFeedbackText(''); setShowFeedback(true) }}>
            <SettingsRow icon="💬" label="Send Feedback" desc="Share ideas or report issues" />
          </TouchableOpacity>
          <View style={st.settingsDivider} />
          <TouchableOpacity onPress={() => setShowTnC(true)}>
            <SettingsRow icon="📄" label="Terms & Conditions" desc="Usage terms and data policy" />
          </TouchableOpacity>
          <View style={st.settingsDivider} />
          <TouchableOpacity onPress={() => setShowAbout(true)}>
            <SettingsRow icon="ℹ️" label="About & Privacy" desc="ArthFlow v2.0.0 · Privacy commitment" />
          </TouchableOpacity>
          <View style={st.settingsDivider} />
          <TouchableOpacity onPress={handleSignOut} disabled={signingOut}>
            <View style={st.settingsItem}>
              <View style={[st.settingsIcon, { backgroundColor: '#FEE2E2' }]}>
                <Text style={{ fontSize: 15 }}>🚪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.settingsLabel, { color: RED }]}>
                  {signingOut ? 'Signing out...' : 'Sign Out'}
                </Text>
              </View>
              <Text style={[st.chevron, { color: RED }]}>›</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={st.footer}>
        <Text style={st.footerVersion}>ArthFlow v2.0.0</Text>
        <Text style={st.footerMade}>Made with ❤️ for better money habits</Text>
      </View>
      </ScrollView>

      {/* ─── Asset Edit Sheet ─── */}
      <Modal visible={!!activeAssetSheet} animationType="slide" transparent onRequestClose={() => setActiveAssetSheet(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.65)' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActiveAssetSheet(null)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 16 }} />
            {activeCfg && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: activeCfg.bg }}>
                    <Text style={{ fontSize: 22 }}>{activeCfg.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>{activeCfg.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' }}>{activeCfg.subLabel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setActiveAssetSheet(null)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, color: TXT2 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 14, color: TXT2, lineHeight: 22, marginBottom: 16, marginTop: 8, paddingLeft: 4, fontFamily: 'Manrope_400Regular' }}>{activeCfg.description}</Text>
                <View style={{ borderRadius: 20, padding: 20, alignItems: 'center', backgroundColor: '#0B1B4A', marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: 'Manrope_700Bold' }}>Current value of {activeCfg.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 32, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginRight: 4, fontFamily: 'Manrope_700Bold' }}>₹</Text>
                    <TextInput
                      value={assetInputValue}
                      onChangeText={t => setAssetInputValue(commaFormat(t))}
                      placeholder="0"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      keyboardType="number-pad"
                      returnKeyType="done"
                      autoFocus
                      selectTextOnFocus
                      onSubmitEditing={() => { if (activeAssetSheet) { saveAsset(activeAssetSheet, Number(stripCommas(assetInputValue)) || 0); setActiveAssetSheet(null) } }}
                      style={{ fontSize: 40, fontWeight: '800', color: '#E0A820', letterSpacing: -1.5, textAlign: 'center', minWidth: 120, fontFamily: 'Manrope_700Bold' }}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => { if (activeAssetSheet) { saveAsset(activeAssetSheet, Number(stripCommas(assetInputValue)) || 0); setActiveAssetSheet(null) } }}
                  style={{ borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE }}
                >
                  <Text style={{ fontSize: 14, color: '#fff' }}>✓</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' }}>Save {activeCfg.label}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Edit Profile Sheet ─── */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '92%' }]}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <View>
                <Text style={st.modalTitle}>Edit Profile</Text>
                <Text style={{ fontSize: 12, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' }}>All fields are optional except name</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEdit(false)} style={st.modalCloseBtn}>
                <Text style={st.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              <Text style={st.editSectionTitle}>Identity</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.editFieldLabel}>FIRST NAME</Text>
                  <TextInput style={st.editInput} value={editName} onChangeText={setEditName} placeholder="Arjun" placeholderTextColor={TXT3} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.editFieldLabel}>LAST NAME</Text>
                  <TextInput style={st.editInput} value={editLastName} onChangeText={setEditLastName} placeholder="Sharma" placeholderTextColor={TXT3} />
                </View>
              </View>

              <Text style={st.editFieldLabel}>DATE OF BIRTH</Text>
              <TextInput style={st.editInput} value={editDob} onChangeText={setEditDob} placeholder="YYYY-MM-DD" placeholderTextColor={TXT3} />

              <Text style={st.editSectionTitle}>Contact <Text style={{ fontSize: 10, fontWeight: '500', color: TXT3 }}>(optional)</Text></Text>
              <Text style={st.editFieldLabel}>PHONE NUMBER</Text>
              <TextInput style={st.editInput} value={editPhone} onChangeText={setEditPhone} placeholder="+91 9876543210" placeholderTextColor={TXT3} keyboardType="phone-pad" />
              <Text style={st.editFieldLabel}>EMAIL ADDRESS</Text>
              <TextInput style={st.editInput} value={editEmail} onChangeText={setEditEmail} placeholder="arjun@email.com" placeholderTextColor={TXT3} keyboardType="email-address" autoCapitalize="none" />

              <Text style={st.editSectionTitle}>Income</Text>
              <Text style={st.editFieldLabel}>EMPLOYMENT TYPE</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {[
                  { key: 'salary',    emoji: '💼', label: 'Salaried' },
                  { key: 'business',  emoji: '🏢', label: 'Business' },
                  { key: 'freelance', emoji: '👤', label: 'Freelance' },
                  { key: 'homemaker', emoji: '🏠', label: 'Homemaker' },
                  { key: 'student',   emoji: '🎓', label: 'Student' },
                  { key: 'retired',   emoji: '🏖️', label: 'Retired' },
                  { key: 'other',     emoji: '✏️', label: 'Other' },
                ].map(t => (
                  <TouchableOpacity key={t.key} style={[st.editTypeBtn, editType === t.key && st.editTypeBtnActive]} onPress={() => setEditType(t.key)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 16 }}>{t.emoji}</Text>
                    <Text style={[st.editTypeBtnText, editType === t.key && { color: BLUE }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.editFieldLabel}>MONTHLY TAKE-HOME INCOME</Text>
              <View style={st.editIncomeRow}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
                <TextInput style={st.editIncomeInput} value={editIncome} onChangeText={t => setEditIncome(commaFormat(t))} placeholder="0" placeholderTextColor={TXT3} keyboardType="number-pad" returnKeyType="done" />
              </View>
            </ScrollView>

            <TouchableOpacity style={st.editSaveBtn} activeOpacity={0.85} onPress={async () => {
              const { data: { user } } = await supabase.auth.getUser()
              if (user) {
                const updates: any = {}
                const fullName = [editName.trim(), editLastName.trim()].filter(Boolean).join(' ')
                if (fullName) updates.full_name = fullName
                if (editIncome) updates.monthly_income = Number(stripCommas(editIncome))
                if (editType) updates.income_type = editType
                if (editDob) {
                  updates.dob = editDob
                  const d = new Date(editDob)
                  if (!isNaN(d.getTime())) {
                    const today = new Date()
                    let a = today.getFullYear() - d.getFullYear()
                    if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) a--
                    if (a > 0 && a < 120) updates.age = a
                  }
                }
                if (editPhone.trim()) updates.phone = editPhone.trim()
                if (editEmail.trim()) updates.email = editEmail.trim()
                if (Object.keys(updates).length > 0) {
                  await supabase.from('profiles').update(updates).eq('id', user.id)
                  // Clear cached AI report so Coach/Home screens use fresh profile data
                  await AsyncStorage.removeItem('@arthflow_ai_report')
                }
              }
              setShowEdit(false)
              fetchData()
            }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' }}>✓ Save Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Feedback Sheet ─── */}
      <Modal visible={showFeedback} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Send Feedback</Text>
              <TouchableOpacity onPress={() => setShowFeedback(false)} style={st.modalCloseBtn}>
                <Text style={st.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {feedbackSent ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: GREEN_L, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 24 }}>✓</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>Thank you! 🙏</Text>
                <Text style={{ fontSize: 13, color: TXT2, textAlign: 'center', marginTop: 6, lineHeight: 20, fontFamily: 'Manrope_400Regular' }}>Your feedback helps us make ArthFlow better for everyone.</Text>
                <TouchableOpacity style={[st.editSaveBtn, { marginTop: 16, width: '60%' }]} onPress={() => setShowFeedback(false)}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: TXT2, marginBottom: 12, lineHeight: 20, fontFamily: 'Manrope_400Regular' }}>What's on your mind? We read every message.</Text>
                <TextInput style={st.feedbackInput} value={feedbackText} onChangeText={setFeedbackText} placeholder="Share an idea, report a bug, or just say hi..." placeholderTextColor={TXT3} multiline numberOfLines={5} textAlignVertical="top" />
                <TouchableOpacity style={[st.editSaveBtn, { backgroundColor: feedbackText.trim().length >= 5 ? TEAL : BG_SEC }]} activeOpacity={0.85} onPress={() => { setFeedbackSent(true); setFeedbackText('') }} disabled={feedbackText.trim().length < 5}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: feedbackText.trim().length >= 5 ? '#fff' : TXT3, fontFamily: 'Manrope_700Bold' }}>Send Feedback</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Terms & Conditions Sheet ─── */}
      <Modal visible={showTnC} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '85%' }]}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Terms & Conditions</Text>
              <TouchableOpacity onPress={() => setShowTnC(false)} style={st.modalCloseBtn}>
                <Text style={st.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {[
                { title: '1. Purpose', text: 'ArthFlow is a personal finance management tool designed to help you track expenses, manage goals, and receive AI-generated financial insights. It is not a registered investment advisor (RIA) under SEBI regulations.' },
                { title: '2. Not Financial Advice', text: 'All AI insights, projections, and educational content in ArthFlow are for informational purposes only. They do not constitute investment, legal, or tax advice. Always consult a SEBI-registered investment advisor before making investment decisions.' },
                { title: '3. Data Storage', text: 'All your financial data is stored securely via Supabase. ArthFlow does not share your data with third parties. You are solely responsible for the accuracy of data you enter.' },
                { title: '4. Accuracy', text: 'While we strive for accurate calculations (50/30/20 rule, emergency fund, insurance estimates), all figures are illustrative. Actual financial outcomes may differ based on market conditions and individual circumstances.' },
                { title: '5. User Responsibility', text: "You are responsible for the financial decisions you make using this app. ArthFlow's creators are not liable for any losses arising from reliance on this app's insights or projections." },
              ].map(s => (
                <View key={s.title} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: TXT1, marginBottom: 4, fontFamily: 'Manrope_700Bold' }}>{s.title}</Text>
                  <Text style={{ fontSize: 12, color: TXT2, lineHeight: 20, fontFamily: 'Manrope_400Regular' }}>{s.text}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: TXT3, marginTop: 4, fontFamily: 'Manrope_400Regular' }}>Last updated: April 2026</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── About & Privacy Sheet ─── */}
      <Modal visible={showAbout} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '85%' }]}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>About & Privacy</Text>
              <TouchableOpacity onPress={() => setShowAbout(false)} style={st.modalCloseBtn}>
                <Text style={st.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={st.aboutAppRow}>
                <View style={st.aboutAppIcon}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: ORANGE }}>A</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' }}>ArthFlow</Text>
                  <Text style={{ fontSize: 12, color: TXT2, fontFamily: 'Manrope_400Regular' }}>Version 2.0.0 · Built for India</Text>
                </View>
              </View>
              {[
                { title: 'Our Mission', text: 'ArthFlow helps everyday Indians take control of their finances using simple, powerful AI-powered insights — without jargon, without judgment.' },
                { title: 'Privacy First', text: 'We believe your financial data is deeply personal. ArthFlow stores data securely with Supabase authentication. No ads, no tracking.' },
                { title: 'SEBI Compliance', text: 'ArthFlow is a personal finance tool, not a registered investment advisor. We do not recommend specific securities, mutual fund schemes, or investment products. All content is educational and illustrative.' },
                { title: 'Data Security', text: 'Your data is encrypted and stored securely. Deleting your account removes all your data permanently.' },
                { title: 'Contact', text: 'Questions or concerns? Email us at support@arthflow.in — we respond within 24 hours on business days.' },
              ].map(s => (
                <View key={s.title} style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: TXT1, marginBottom: 4, fontFamily: 'Manrope_700Bold' }}>{s.title}</Text>
                  <Text style={{ fontSize: 12, color: TXT2, lineHeight: 20, fontFamily: 'Manrope_400Regular' }}>{s.text}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Sign Out Confirmation ─── */}
      <Modal visible={showSignOut} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <View style={st.sheetHandle} />
            <Text style={{ fontSize: 17, fontWeight: '800', color: TXT1, marginBottom: 6, fontFamily: 'Manrope_700Bold' }}>Sign Out?</Text>
            <Text style={{ fontSize: 13, color: TXT2, lineHeight: 22, marginBottom: 20, fontFamily: 'Manrope_400Regular' }}>
              Your data is saved securely and won't be lost. You can sign back in anytime.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: BG_SEC }} onPress={() => setShowSignOut(false)}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: RED }} onPress={confirmSignOut} disabled={signingOut}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' }}>{signingOut ? 'Signing out...' : 'Sign Out'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function SettingsRow({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <View style={st.settingsItem}>
      <View style={[st.settingsIcon, { backgroundColor: BLUE_L }]}>
        <Text style={{ fontSize: 15 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.settingsLabel}>{label}</Text>
        <Text style={st.settingsDesc}>{desc}</Text>
      </View>
      <Text style={st.chevron}>›</Text>
    </View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingVertical: 4, paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: 3, fontFamily: 'NotoSerif_700Bold' },

  heroCard: { borderRadius: 24, padding: 24, marginBottom: 20, overflow: 'hidden', position: 'relative', backgroundColor: '#0B1B4A', shadowColor: BLUE, shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.38, shadowRadius: 60, elevation: 12 },
  heroBlob1: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(30,58,138,0.55)' },
  heroBlob2: { position: 'absolute', bottom: -40, left: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(200,134,10,0.12)' },
  heroWatermark: { position: 'absolute', right: -10, bottom: -10, opacity: 0.04, zIndex: 0 },
  heroContent: { position: 'relative', zIndex: 1 },
  heroUserRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20, marginBottom: 20 },
  heroAvatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { fontSize: 26, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },
  heroUserName: { fontSize: 24, fontWeight: '800', color: '#E0A820', letterSpacing: -0.4, fontFamily: 'Manrope_700Bold' },
  heroUserSub: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'Manrope_400Regular' },
  heroMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  heroMemberDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  heroMemberText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)', fontFamily: 'Manrope_400Regular' },
  heroStatsGrid: { flexDirection: 'row', gap: 8 },
  heroStatBox: { flex: 1, borderRadius: 14, padding: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  heroStatValue: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  heroStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: 'Manrope_400Regular' },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  cardTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  assetChip: { width: (SCREEN_W - 40 - 10 - 32) / 2, borderRadius: 16, padding: 12, backgroundColor: '#fff', borderWidth: 1 },

  settingsGroup: { marginBottom: 16 },
  settingsGroupTitle: { fontSize: 13, fontWeight: '700', color: TXT3, letterSpacing: 1, marginBottom: 8, fontFamily: 'Manrope_700Bold' },
  settingsCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  settingsItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  settingsIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontSize: 15, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  settingsDesc: { fontSize: 14, fontWeight: '500', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  settingsDivider: { height: 1, backgroundColor: BG_SEC, marginHorizontal: 20 },
  chevron: { fontSize: 22, color: TXT3, fontWeight: '300' },

  footer: { alignItems: 'center', paddingVertical: 20 },
  footerVersion: { fontSize: 14, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_700Bold' },
  footerMade: { fontSize: 13, fontWeight: '500', color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.6)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 15, color: TXT2 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 16 },

  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE_L, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 13, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },
  editSectionTitle: { fontSize: 14, fontWeight: '800', color: TXT1, marginBottom: 10, marginTop: 16, fontFamily: 'Manrope_700Bold' },
  editFieldLabel: { fontSize: 13, fontWeight: '700', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontFamily: 'Manrope_700Bold' },
  editInput: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: TXT1, backgroundColor: BG_SEC, marginBottom: 12, fontFamily: 'Manrope_400Regular' },
  editTypeBtn: { width: '30%', flexGrow: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: 'transparent', gap: 2 },
  editTypeBtnActive: { backgroundColor: BLUE_L, borderColor: BLUE + '40' },
  editTypeBtnText: { fontSize: 12, fontWeight: '800', color: TXT3, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Manrope_700Bold' },
  editIncomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: BG_SEC, marginBottom: 12 },
  editIncomeInput: { flex: 1, fontSize: 22, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  editSaveBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16, backgroundColor: BLUE },

  feedbackInput: { borderRadius: 16, padding: 14, fontSize: 14, color: TXT1, backgroundColor: BG_SEC, minHeight: 120, marginBottom: 8, fontFamily: 'Manrope_400Regular', textAlignVertical: 'top' },
  aboutAppRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14, marginBottom: 20, backgroundColor: BG_SEC },
  aboutAppIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1B4A' },
})
