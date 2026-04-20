import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { Transaction } from '../types'

type Props = {
  onAddTransaction: () => void
}

export default function HomeScreen({ onAddTransaction }: Props) {
  const [signingOut, setSigningOut] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userName, setUserName] = useState('')

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserName(user.email?.split('@')[0] ?? 'there')

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', startOfMonth.toISOString())
      .order('date', { ascending: false })

    setTransactions(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const expenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const savings = income - expenses
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0
  const isOnTrack = savingsRate >= 20

  const spendPct = income > 0 ? Math.min((expenses / income) * 100, 100) : 0
  const savePct = income > 0 ? Math.min((savings / income) * 100, 100) : 0

  const formatINR = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
    return `₹${Math.round(n)}`
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4F8EF7" size="large" />
      </View>
    )
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    setSigningOut(false)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F8EF7" />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Good morning, {userName}</Text>
          <View style={[styles.statusPill, isOnTrack ? styles.pillGreen : styles.pillAmber]}>
            <View style={[styles.statusDot, isOnTrack ? styles.dotGreen : styles.dotAmber]} />
            <Text style={[styles.statusText, isOnTrack ? styles.textGreen : styles.textAmber]}>
              {isOnTrack ? "You're on track" : 'Needs attention'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut}>
          <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign Out'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>This month's money flow</Text>
        <Text style={styles.bigAmount}>{formatINR(income)}</Text>
        <Text style={styles.subText}>
          Total income · {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>

        <View style={styles.flowBar}>
          <View style={[styles.flowSpend, { width: `${spendPct}%` }]} />
          <View style={[styles.flowSave, { width: `${Math.max(savePct, 0)}%` }]} />
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4F8EF7' }]} />
            <Text style={styles.legendText}>Spend {formatINR(expenses)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#34D399' }]} />
            <Text style={styles.legendText}>Save {formatINR(Math.max(savings, 0))}</Text>
          </View>
        </View>
      </View>

      {income === 0 ? (
        <View style={styles.alertCard}>
          <Text style={styles.alertBadge}>Get started</Text>
          <Text style={styles.alertTitle}>Add your first income entry</Text>
          <Text style={styles.alertSub}>
            Tell ArthFlow what you earned this month to start tracking your money flow.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={onAddTransaction}>
            <Text style={styles.btnText}>Add income</Text>
          </TouchableOpacity>
        </View>
      ) : !isOnTrack ? (
        <View style={styles.alertCard}>
          <Text style={styles.alertBadge}>⚠ Attention</Text>
          <Text style={styles.alertTitle}>
            Your savings rate is {savingsRate}% — target is 20%
          </Text>
          <Text style={styles.alertSub}>
            You need to save {formatINR(income * 0.2)} this month. You're {formatINR(income * 0.2 - savings)} short.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={onAddTransaction}>
            <Text style={styles.btnText}>Fix this</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.alertCard, styles.alertCardGreen]}>
          <Text style={[styles.alertBadge, styles.badgeGreen]}>✓ On track</Text>
          <Text style={styles.alertTitle}>
            Great work! You're saving {savingsRate}% this month
          </Text>
          <Text style={styles.alertSub}>
            You've saved {formatINR(savings)} so far. Keep it up.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>At a glance</Text>
        {[
          { label: 'Total income', value: formatINR(income), color: '#F1F5F9' },
          { label: 'Total expenses', value: formatINR(expenses), color: '#F87171' },
          { label: 'Net savings', value: formatINR(Math.max(savings, 0)), color: '#34D399' },
          { label: 'Savings rate', value: `${savingsRate}%`, color: savingsRate >= 20 ? '#34D399' : '#FBBF24' },
        ].map((row) => (
          <View key={row.label} style={styles.statRow}>
            <Text style={styles.statLabel}>{row.label}</Text>
            <Text style={[styles.statValue, { color: row.color }]}>{row.value}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={onAddTransaction}>
        <Text style={styles.addBtnText}>+ Add transaction</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  signOutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1A2233', borderRadius: 8 },
  signOutText: { color: '#F87171', fontWeight: '700', fontSize: 13 },
  container: { flex: 1, backgroundColor: '#06091A' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#06091A', justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 20 },
  greeting: { fontSize: 13, color: '#94A3B8', marginBottom: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillGreen: { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.25)' },
  pillAmber: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.25)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotGreen: { backgroundColor: '#34D399' },
  dotAmber: { backgroundColor: '#FBBF24' },
  statusText: { fontSize: 13, fontWeight: '600' },
  textGreen: { color: '#34D399' },
  textAmber: { color: '#FBBF24' },
  card: { backgroundColor: '#0D1326', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardLabel: { fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  bigAmount: { fontSize: 32, fontWeight: '800', color: '#F1F5F9', letterSpacing: -1, marginBottom: 4 },
  subText: { fontSize: 12, color: '#94A3B8', marginBottom: 16 },
  flowBar: { height: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexDirection: 'row', marginBottom: 10 },
  flowSpend: { height: '100%', backgroundColor: '#4F8EF7', borderRadius: 8 },
  flowSave: { height: '100%', backgroundColor: '#34D399' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 12, color: '#94A3B8' },
  alertCard: { backgroundColor: '#1A1408', borderRadius: 20, padding: 20, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#FBBF24', borderWidth: 1, borderColor: 'rgba(251,191,36,0.15)' },
  alertCardGreen: { backgroundColor: '#0A1A12', borderLeftColor: '#34D399', borderColor: 'rgba(52,211,153,0.15)' },
  alertBadge: { fontSize: 11, fontWeight: '700', color: '#92400E', backgroundColor: 'rgba(251,191,36,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginBottom: 10, overflow: 'hidden' },
  badgeGreen: { color: '#065F46', backgroundColor: 'rgba(52,211,153,0.2)' },
  alertTitle: { fontSize: 16, fontWeight: '700', color: '#F1F5F9', marginBottom: 6 },
  alertSub: { fontSize: 13, color: '#94A3B8', lineHeight: 20, marginBottom: 16 },
  btnPrimary: { backgroundColor: '#4F8EF7', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  statLabel: { fontSize: 13, color: '#94A3B8' },
  statValue: { fontSize: 14, fontWeight: '600' },
  addBtn: { backgroundColor: '#0D1326', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)', borderStyle: 'dashed' },
  addBtnText: { color: '#4F8EF7', fontSize: 15, fontWeight: '600' },
})
