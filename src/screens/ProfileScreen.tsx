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
const TXT1    = '#111827'
const TXT2    = '#6B7280'
const TXT3    = '#9CA3AF'
const BORDER  = '#E5E7EB'
const BG_SEC  = '#F1F5F9'

const { width: SCREEN_W } = Dimensions.get('window')

type ProtectionStatus = 'missing' | 'partial' | 'ok'
interface ProtectionItem { id: string; label: string; status: ProtectionStatus; icon: string; desc: string; impact: string }

const PROTECTION_ITEMS: ProtectionItem[] = [
  { id: 'health',    label: 'Health Insurance',    status: 'missing',  icon: '🏥', desc: 'No policy found.',           impact: 'A medical emergency can wipe out your savings in weeks.' },
  { id: 'emergency', label: 'Emergency Fund',      status: 'partial',  icon: '🛡️', desc: '1 month covered.',           impact: 'You need 6 months of expenses. You\'re at ~1 month covered.' },
  { id: 'life',      label: 'Term Life Insurance', status: 'missing',  icon: '❤️', desc: 'No coverage.',              impact: 'Without coverage, your family loses financial protection if something happens.' },
  { id: 'income',    label: 'Income Protection',   status: 'ok',       icon: '💼', desc: 'PF/ESI active via employer.',impact: 'You\'re covered through your employer.' },
]

const STATUS_CFG: Record<ProtectionStatus, { bg: string; dot: string; label: string; labelColor: string }> = {
  ok:      { bg: GREEN_L,    dot: GREEN,    label: 'Protected',   labelColor: GREEN_H },
  partial: { bg: ORANGE_L,   dot: ORANGE,   label: 'Partial',     labelColor: ORANGE_H },
  missing: { bg: '#FFF7ED',  dot: '#F97316', label: 'Not covered', labelColor: '#C2410C' },
}

function fmtInr(val: number) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
  if (val >= 1000)   return `₹${(val / 1000).toFixed(1)}K`
  return `₹${Math.round(val)}`
}

export default function ProfileScreen() {
  const [userName, setUserName]     = useState('')
  const [userEmail, setUserEmail]   = useState('')
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [goals, setGoals]           = useState<Goal[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
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
  const [showValues, setShowValues] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email ?? '')
    setUserName(user.email?.split('@')[0] ?? 'User')

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Fetch last 4 months of transactions for history
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
    setProfile(profileResult.data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const handleSignOut = () => {
    setShowSignOut(true)
  }

  const confirmSignOut = async () => {
    setSigningOut(true)
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
          // Force reload - the App.js onboarding check will kick in
          await supabase.auth.refreshSession()
          // Trigger auth state change to re-check onboarding
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            await supabase.auth.signOut()
          }
        }
      }},
    ])
  }

  const income     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings    = income - expenses
  const monthlyIncome = profile?.monthly_income ?? 0

  // Streak: count consecutive months with positive savings
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

  const savePct = income > 0 ? Math.max(0, Math.round(((income - expenses) / income) * 100)) : 0
  const age = profile?.age ?? 28
  const riskLabel = age < 30 ? 'Aggressive' : age < 40 ? 'Balanced' : age < 50 ? 'Moderate' : 'Conservative'
  const riskEmoji = age < 30 ? '🔥' : age < 40 ? '⚡' : age < 50 ? '🛡️' : '🌿'

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    )
  }

  const streak = getStreak()

  return (
    <View style={st.container}>
      {/* App Bar (fixed) */}
      <View style={st.appBar}>
        <View style={st.brandRow}>
          <ArthFlowLogo size={28} />
          <Text style={st.brandText}>ARTHFLOW</Text>
        </View>
        <TouchableOpacity style={st.editBtn} activeOpacity={0.7} onPress={() => { setEditName(userName); setEditLastName(''); setEditDob(profile?.dob || ''); setEditPhone(profile?.phone || ''); setEditEmail(userEmail); setEditIncome(String(monthlyIncome || '')); setEditType(profile?.income_type || 'salary'); setShowEdit(true) }}>
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
                {profile?.income_type === 'business' ? '🏢 Business' : profile?.income_type === 'freelance' ? '👤 Freelance' : '💼 Salaried'}
              </Text>
              <View style={st.heroMemberRow}>
                <View style={st.heroMemberDot} />
                <Text style={st.heroMemberText}>Member since {(() => { const d = (profile as any)?.created_at ? new Date((profile as any).created_at) : new Date(); return d.toLocaleString('default', { month: 'long', year: 'numeric' }); })()}</Text>
              </View>
            </View>
          </View>
          <View style={st.heroStatsGrid}>
            {[
              { emoji: '💰', value: fmtInr(monthlyIncome || income), label: 'Income', sensitive: true },
              { emoji: '�', value: `${streak} mo`, label: 'Streak', sensitive: false },
              { emoji: '📈', value: `${savePct}%`, label: 'Saving', sensitive: false },
              { emoji: riskEmoji, value: riskLabel.slice(0, 6), label: 'Risk', sensitive: false },
            ].map(s => (
              <View key={s.label} style={st.heroStatBox}>
                <Text style={{ fontSize: 14 }}>{s.emoji}</Text>
                <Text style={st.heroStatValue}>{s.sensitive && !showValues ? '••••' : s.value}</Text>
                <Text style={st.heroStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => setShowValues(!showValues)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13 }}>{showValues ? '🙈' : '👁️'}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', fontFamily: 'Manrope_700Bold' }}>{showValues ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>

          {/* DOB / Phone row */}
          {(profile?.dob || profile?.phone || age) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
              {age > 0 && <Text style={{ fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)', fontFamily: 'Manrope_400Regular' }}>🎂 Age {age}</Text>}
              {profile?.phone ? <Text style={{ fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.45)', fontFamily: 'Manrope_400Regular' }}>📞 {profile.phone}</Text> : null}
            </View>
          )}
        </View>
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
          <TouchableOpacity onPress={() => { setEditName(userName); setEditLastName(''); setEditDob(profile?.dob || ''); setEditPhone(profile?.phone || ''); setEditEmail(userEmail); setEditIncome(String(monthlyIncome || '')); setEditType(profile?.income_type || 'salary'); setShowEdit(true) }}>
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

      {/* Footer */}
      <View style={st.footer}>
        <Text style={st.footerVersion}>ArthFlow v2.0.0</Text>
        <Text style={st.footerMade}>Made with ❤️ for better money habits</Text>
      </View>
      </ScrollView>

      {/* ─── Edit Profile Sheet ─── */}
      <Modal visible={showEdit} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { maxHeight: '92%' }]}>
            <View style={st.sheetHandle} />
            <View style={st.modalHeader}>
              <View>
                <Text style={st.modalTitle}>Edit Profile</Text>
                <Text style={{ fontSize: 11, color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' }}>All fields are optional except name</Text>
              </View>
              <TouchableOpacity onPress={() => setShowEdit(false)} style={st.modalCloseBtn}>
                <Text style={st.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
              {/* Identity */}
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
              {editDob.length >= 10 && (() => {
                const d = new Date(editDob)
                if (isNaN(d.getTime())) return null
                const today = new Date()
                let derivedAge = today.getFullYear() - d.getFullYear()
                if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) derivedAge--
                if (derivedAge <= 0 || derivedAge >= 120) return null
                const rp = derivedAge <= 30 ? 'Aggressive' : derivedAge <= 40 ? 'Balanced' : derivedAge <= 55 ? 'Moderate' : 'Conservative'
                const rpEmoji = derivedAge <= 30 ? '🔥' : derivedAge <= 40 ? '⚡' : derivedAge <= 55 ? '🛡️' : '🌿'
                const rpColor = derivedAge <= 30 ? RED : derivedAge <= 40 ? ORANGE : derivedAge <= 55 ? BLUE : GREEN
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 8, paddingHorizontal: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: rpColor + '15' }}>
                      <Text style={{ fontSize: 12 }}>{rpEmoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: rpColor, fontFamily: 'Manrope_700Bold' }}>Age {derivedAge} · {rp} investor</Text>
                    </View>
                  </View>
                )
              })()}

              {/* Contact */}
              <Text style={st.editSectionTitle}>Contact <Text style={{ fontSize: 10, fontWeight: '500', color: TXT3 }}>(optional)</Text></Text>
              <Text style={st.editFieldLabel}>PHONE NUMBER</Text>
              <TextInput style={st.editInput} value={editPhone} onChangeText={setEditPhone} placeholder="+91 9876543210" placeholderTextColor={TXT3} keyboardType="phone-pad" />
              <Text style={st.editFieldLabel}>EMAIL ADDRESS</Text>
              <TextInput style={st.editInput} value={editEmail} onChangeText={setEditEmail} placeholder="arjun@email.com" placeholderTextColor={TXT3} keyboardType="email-address" autoCapitalize="none" />

              {/* Income */}
              <Text style={st.editSectionTitle}>Income</Text>
              <Text style={st.editFieldLabel}>EMPLOYMENT TYPE</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(['salary', 'business', 'freelance'] as const).map(t => (
                  <TouchableOpacity key={t} style={[st.editTypeBtn, editType === t && st.editTypeBtnActive]} onPress={() => setEditType(t)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 16 }}>{t === 'salary' ? '💼' : t === 'business' ? '🏢' : '🎯'}</Text>
                    <Text style={[st.editTypeBtnText, editType === t && { color: BLUE }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.editFieldLabel}>MONTHLY TAKE-HOME INCOME</Text>
              <View style={st.editIncomeRow}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: TXT3 }}>₹</Text>
                <TextInput style={st.editIncomeInput} value={editIncome} onChangeText={setEditIncome} placeholder="0" placeholderTextColor={TXT3} keyboardType="numeric" />
              </View>
            </ScrollView>

            <TouchableOpacity style={st.editSaveBtn} activeOpacity={0.85} onPress={async () => {
              const { data: { user } } = await supabase.auth.getUser()
              if (user) {
                const updates: any = {}
                const fullName = [editName.trim(), editLastName.trim()].filter(Boolean).join(' ')
                if (fullName) updates.full_name = fullName
                if (editIncome) updates.monthly_income = Number(editIncome)
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
              <Text style={{ fontSize: 11, color: TXT3, marginTop: 4, fontFamily: 'Manrope_400Regular' }}>Last updated: April 2026</Text>
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

      {/* ─── Sign Out Confirmation Sheet ─── */}
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

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },

  // App Bar
  appBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingVertical: 4, paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 17, fontWeight: '700', color: '#1A1A2E', letterSpacing: 3, fontFamily: 'NotoSerif_700Bold' },
  divider: { width: 1, height: 18, backgroundColor: BORDER, marginHorizontal: 4 },
  barTitle: { fontSize: 14, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  barSub: { fontSize: 11, fontWeight: '600', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },

  // Hero Card
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
  heroMemberText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', fontFamily: 'Manrope_400Regular' },
  heroStatsGrid: { flexDirection: 'row', gap: 8 },
  heroStatBox: { flex: 1, borderRadius: 14, padding: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  heroStatValue: { fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 2, fontFamily: 'Manrope_700Bold' },
  heroStatLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: 'Manrope_400Regular' },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  gapsBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  gapsBadgeText: { fontSize: 13, fontWeight: '800', color: '#C2410C', fontFamily: 'Manrope_700Bold' },

  // Risk warning
  riskWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 20, padding: 16, marginBottom: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  riskWarningTitle: { fontSize: 15, fontWeight: '800', color: '#92400E', fontFamily: 'Manrope_700Bold' },
  riskWarningDesc: { fontSize: 14, fontWeight: '500', color: '#B45309', marginTop: 4, lineHeight: 21, fontFamily: 'Manrope_400Regular' },

  // Protection card
  protCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 12, borderWidth: 1, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  protStripe: { height: 3 },
  protBody: { padding: 16 },
  protRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  protIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  protNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
  protName: { fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  protBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  protBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  protBadgeLabel: { fontSize: 11, fontWeight: '800', fontFamily: 'Manrope_700Bold' },
  protDesc: { fontSize: 13, fontWeight: '500', color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  protImpact: { fontSize: 13, fontWeight: '600', color: '#92400E', marginTop: 6, lineHeight: 19, fontFamily: 'Manrope_400Regular' },
  protFixBtn: { marginTop: 12, backgroundColor: BLUE, borderRadius: 16, paddingVertical: 12, alignItems: 'center', shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  protFixBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: 'Manrope_700Bold' },

  // Card (generic)
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },

  // History bars
  historyBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  historyCol: { flex: 1, alignItems: 'center', gap: 6 },
  historyValue: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  historyBarBg: { width: '100%', height: 70, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: BG_SEC, overflow: 'hidden', position: 'relative' },
  historyBarFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  historyMonth: { fontSize: 12, fontWeight: '500', color: TXT3, fontFamily: 'Manrope_400Regular' },
  historyMonthCurrent: { fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },
  historyInsight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderRadius: 16, padding: 12, backgroundColor: BLUE_L, borderWidth: 1, borderColor: 'rgba(30,58,138,0.15)' },
  historyInsightText: { fontSize: 13, fontWeight: '600', color: BLUE, lineHeight: 19, flex: 1, fontFamily: 'Manrope_400Regular' },

  // Summary grid
  summaryGrid: { flexDirection: 'row', gap: 10 },
  summaryItem: { flex: 1, backgroundColor: BG_SEC, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: TXT3, marginBottom: 4, fontFamily: 'Manrope_400Regular' },
  summaryValue: { fontSize: 17, fontWeight: '800', fontFamily: 'Manrope_700Bold' },

  // Settings
  settingsGroup: { marginBottom: 16 },
  settingsGroupTitle: { fontSize: 12, fontWeight: '700', color: TXT3, letterSpacing: 1, marginBottom: 8, fontFamily: 'Manrope_700Bold' },
  settingsCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, shadowColor: 'rgba(30,58,138,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 24, elevation: 2 },
  settingsItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  settingsIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontSize: 15, fontWeight: '700', color: TXT1, fontFamily: 'Manrope_700Bold' },
  settingsDesc: { fontSize: 13, fontWeight: '500', color: TXT3, marginTop: 1, fontFamily: 'Manrope_400Regular' },
  settingsDivider: { height: 1, backgroundColor: BG_SEC, marginHorizontal: 20 },
  chevron: { fontSize: 22, color: TXT3, fontWeight: '300' },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 20 },
  footerVersion: { fontSize: 13, fontWeight: '600', color: TXT3, fontFamily: 'Manrope_700Bold' },
  footerMade: { fontSize: 12, fontWeight: '500', color: TXT3, marginTop: 2, fontFamily: 'Manrope_400Regular' },

  // Fix modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.6)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 15, color: TXT2 },
  modalIconBox: { borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 20, backgroundColor: BLUE_L, borderWidth: 1, borderColor: 'rgba(30,58,138,0.2)' },
  modalImpact: { fontSize: 14, fontWeight: '600', color: BLUE, marginTop: 8, lineHeight: 22, textAlign: 'center', fontFamily: 'Manrope_400Regular' },
  modalAction: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: BORDER },
  modalActionPrimary: { backgroundColor: BLUE, borderColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 6 },
  modalActionText: { fontSize: 14, fontWeight: '800', color: TXT2, fontFamily: 'Manrope_700Bold' },

  // Edit Profile button
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE_L, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 12, fontWeight: '800', color: BLUE, fontFamily: 'Manrope_700Bold' },

  // Sheet handle
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 16 },

  // Edit Profile form
  editSectionTitle: { fontSize: 13, fontWeight: '800', color: TXT1, marginBottom: 10, marginTop: 16, fontFamily: 'Manrope_700Bold' },
  editFieldLabel: { fontSize: 12, fontWeight: '700', color: TXT3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontFamily: 'Manrope_700Bold' },
  editInput: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: TXT1, backgroundColor: BG_SEC, marginBottom: 12, fontFamily: 'Manrope_400Regular' },
  editTypeBtn: { flex: 1, borderRadius: 16, paddingVertical: 10, alignItems: 'center', backgroundColor: BG_SEC, borderWidth: 1.5, borderColor: 'transparent' },
  editTypeBtnActive: { backgroundColor: BLUE_L, borderColor: BLUE + '40' },
  editTypeBtnText: { fontSize: 11, fontWeight: '800', color: TXT3, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Manrope_700Bold' },
  editIncomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: BG_SEC, marginBottom: 12 },
  editIncomeInput: { flex: 1, fontSize: 22, fontWeight: '800', color: TXT1, fontFamily: 'Manrope_700Bold' },
  editSaveBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16, backgroundColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },

  // Feedback
  feedbackInput: { borderRadius: 16, padding: 14, fontSize: 14, color: TXT1, backgroundColor: BG_SEC, minHeight: 120, marginBottom: 8, fontFamily: 'Manrope_400Regular', textAlignVertical: 'top' },

  // About
  aboutAppRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14, marginBottom: 20, backgroundColor: BG_SEC },
  aboutAppIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1B4A' },
})
