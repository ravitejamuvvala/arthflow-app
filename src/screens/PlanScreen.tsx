import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator, RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { fetchInsight } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Goal, Profile, Transaction } from '../types'

export default function PlanScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [txResult, goalsResult, profileResult] = await Promise.all([
      supabase.from('transactions').select('*').gte('date', startOfMonth.toISOString()),
      supabase.from('goals').select('*'),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ])

    setTransactions(txResult.data ?? [])
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

  const loadInsight = async () => {
    setInsightLoading(true)
    setInsightError(false)
    try {
      const income = transactions
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0)

      const text = await fetchInsight({
        income,
        transactions: transactions.map((t) => ({
          amount: t.amount,
          category: t.category,
          type: t.type,
        })),
        goals: goals.map((g) => ({
          name: g.name,
          target_amount: g.target_amount,
          saved_amount: g.saved_amount,
        })),
      })
      setInsight(text)
    } catch {
      setInsightError(true)
    }
    setInsightLoading(false)
  }

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const savings = income - expenses
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0

  const formatINR = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
    return `₹${Math.round(n)}`
  }

  const byCategory = transactions
    .filter((t) => t.type === 'expense')
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount
      return acc
    }, {})

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4F8EF7" size="large" />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F8EF7" />}
    >
      <Text style={styles.title}>Your plan</Text>

      <View style={styles.card}>
        <View style={styles.insightTag}>
          <Text style={styles.insightTagText}>Personalized insight</Text>
        </View>
        <Text style={styles.planHeadline}>
          {savingsRate >= 25
            ? `You're saving ${formatINR(savings)}/month — above average. Let's optimize further.`
            : savingsRate >= 20
            ? `You're saving ${savingsRate}% — right at the target. Let's push a little harder.`
            : `You're saving ${savingsRate}% — below the 20% target. Let's fix this.`
          }
        </Text>

        {[
          { label: 'Monthly income', value: formatINR(income), color: '#F1F5F9' },
          { label: 'Spending', value: formatINR(expenses), color: '#F87171' },
          { label: 'Savings', value: `${formatINR(savings)} · ${savingsRate}%`, color: '#34D399' },
          { label: 'Savings potential', value: income > 0 ? `+${formatINR(income * 0.3 - savings)} available` : '—', color: '#FBBF24' },
        ].map((row) => (
          <View key={row.label} style={styles.planRow}>
            <Text style={styles.planLabel}>{row.label}</Text>
            <Text style={[styles.planValue, { color: row.color }]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {topCategories.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardSectionLabel}>Top spending categories</Text>
          {topCategories.map(([cat, amt]) => (
            <View key={cat} style={styles.catRow}>
              <Text style={styles.catName}>{cat}</Text>
              <View style={styles.catBarContainer}>
                <View style={[styles.catBar, { width: `${Math.min((amt / expenses) * 100, 100)}%` }]} />
              </View>
              <Text style={styles.catAmt}>{formatINR(amt)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.aiCard}>
        <View style={styles.aiCardHeader}>
          <View style={styles.aiTag}>
            <Text style={styles.aiTagText}>⚡ AI Insight</Text>
          </View>
          <Text style={styles.aiPowered}>Powered by Claude</Text>
        </View>

        {!insight && !insightLoading && !insightError && (
          <>
            <Text style={styles.aiTitle}>Get your personalised money insight</Text>
            <Text style={styles.aiSub}>
              ArthFlow AI analyses your spending and goals to give you one specific action to take this month.
            </Text>
            <TouchableOpacity style={styles.aiBtn} onPress={loadInsight}>
              <Text style={styles.aiBtnText}>Generate insight</Text>
            </TouchableOpacity>
          </>
        )}

        {insightLoading && (
          <View style={styles.aiLoading}>
            <ActivityIndicator color="#4F8EF7" />
            <Text style={styles.aiLoadingText}>Analysing your finances...</Text>
          </View>
        )}

        {insight && !insightLoading && (
          <>
            <Text style={styles.aiInsightText}>{insight}</Text>
            <TouchableOpacity style={styles.aiRefreshBtn} onPress={loadInsight}>
              <Text style={styles.aiRefreshText}>Refresh insight</Text>
            </TouchableOpacity>
          </>
        )}

        {insightError && !insightLoading && (
          <>
            <Text style={styles.aiErrorText}>Could not load insight. Please try again.</Text>
            <TouchableOpacity style={styles.aiBtn} onPress={loadInsight}>
              <Text style={styles.aiBtnText}>Try again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06091A' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#06091A', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9', letterSpacing: -0.5, marginBottom: 20 },
  card: { backgroundColor: '#0D1326', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  insightTag: { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  insightTagText: { fontSize: 11, fontWeight: '700', color: '#4F8EF7' },
  planHeadline: { fontSize: 15, fontWeight: '700', color: '#F1F5F9', lineHeight: 22, marginBottom: 16 },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  planLabel: { fontSize: 13, color: '#94A3B8' },
  planValue: { fontSize: 13, fontWeight: '600' },
  cardSectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  catName: { fontSize: 13, color: '#94A3B8', width: 100 },
  catBarContainer: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  catBar: { height: '100%', backgroundColor: '#4F8EF7', borderRadius: 4 },
  catAmt: { fontSize: 13, fontWeight: '600', color: '#F1F5F9', width: 56, textAlign: 'right' },
  aiCard: { backgroundColor: '#0D1326', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)' },
  aiCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  aiTag: { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  aiTagText: { fontSize: 12, fontWeight: '700', color: '#4F8EF7' },
  aiPowered: { fontSize: 11, color: '#475569' },
  aiTitle: { fontSize: 16, fontWeight: '700', color: '#F1F5F9', marginBottom: 8 },
  aiSub: { fontSize: 14, color: '#94A3B8', lineHeight: 21, marginBottom: 20 },
  aiBtn: { backgroundColor: '#4F8EF7', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  aiBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  aiLoadingText: { fontSize: 14, color: '#94A3B8' },
  aiInsightText: { fontSize: 16, color: '#F1F5F9', lineHeight: 26, marginBottom: 20, fontWeight: '500' },
  aiRefreshBtn: { alignItems: 'center' },
  aiRefreshText: { color: '#4F8EF7', fontSize: 14, fontWeight: '600' },
  aiErrorText: { fontSize: 14, color: '#F87171', marginBottom: 16 },
})
