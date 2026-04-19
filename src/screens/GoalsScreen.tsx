import React, { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator, Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { Goal } from '../types'

export default function GoalsScreen() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchGoals = useCallback(async () => {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true })

    setGoals(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGoals() }, [fetchGoals])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchGoals()
    setRefreshing(false)
  }

  const addGoal = async () => {
    if (!name.trim()) { Alert.alert('Enter goal name'); return }
    if (!targetAmount || isNaN(Number(targetAmount))) { Alert.alert('Enter valid target amount'); return }
    if (!targetDate) { Alert.alert('Enter target date (YYYY-MM-DD)'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('goals').insert([{
      user_id: user?.id,
      name: name.trim(),
      target_amount: Number(targetAmount),
      saved_amount: 0,
      target_date: targetDate,
    }])

    setSaving(false)

    if (error) { Alert.alert('Error', 'Could not save goal.'); return }

    setShowModal(false)
    setName(''); setTargetAmount(''); setTargetDate('')
    fetchGoals()
  }

  const formatINR = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`
    return `₹${Math.round(n)}`
  }

  const monthsLeft = (targetDate: string) => {
    const diff = new Date(targetDate).getTime() - Date.now()
    const months = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30))
    return Math.max(months, 0)
  }

  const monthlyNeeded = (goal: Goal) => {
    const months = monthsLeft(goal.target_date)
    if (months === 0) return 0
    return Math.ceil((goal.target_amount - goal.saved_amount) / months)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4F8EF7" size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F8EF7" />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Your goals</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {goals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>No goals yet</Text>
            <Text style={styles.emptySub}>Add your first goal — home, travel, emergency fund</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>Add a goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.map((goal) => {
            const pct = Math.min((goal.saved_amount / goal.target_amount) * 100, 100)
            const months = monthsLeft(goal.target_date)
            const needed = monthlyNeeded(goal)
            const isOnTrack = pct >= ((100 - months * (100 / (months + 1))) || 50)
            const remaining = goal.target_amount - goal.saved_amount

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHead}>
                  <Text style={styles.goalName}>{goal.name}</Text>
                  <View style={[styles.badge, isOnTrack ? styles.badgeGreen : styles.badgeAmber]}>
                    <Text style={[styles.badgeText, isOnTrack ? styles.badgeTextGreen : styles.badgeTextAmber]}>
                      {isOnTrack ? 'On track' : 'At risk'}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBg}>
                  <View style={[
                    styles.progressFill,
                    { width: `${pct}%`, backgroundColor: isOnTrack ? '#34D399' : '#4F8EF7' }
                  ]} />
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatINR(goal.saved_amount)}</Text>
                    <Text style={styles.statLabel}>Saved</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatINR(remaining)}</Text>
                    <Text style={styles.statLabel}>Remaining</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{months}mo</Text>
                    <Text style={styles.statLabel}>Left</Text>
                  </View>
                </View>

                <View style={[styles.insightRow, isOnTrack ? styles.insightGreen : styles.insightAmber]}>
                  <Text style={[styles.insightText, isOnTrack ? styles.insightTextGreen : styles.insightTextAmber]}>
                    {isOnTrack
                      ? `You need ${formatINR(needed)}/month — you're on track. Keep it up.`
                      : `At current pace, you'll miss this goal. You need ${formatINR(needed)}/month.`
                    }
                  </Text>
                </View>

                <TouchableOpacity style={styles.adjustBtn}>
                  <Text style={styles.adjustBtnText}>Adjust plan</Text>
                </TouchableOpacity>
              </View>
            )
          })
        )}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New goal</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Goal name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Home down payment"
              placeholderTextColor="#4B5563"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.fieldLabel}>Target amount (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1200000"
              placeholderTextColor="#4B5563"
              value={targetAmount}
              onChangeText={setTargetAmount}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>Target date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2026-12-31"
              placeholderTextColor="#4B5563"
              value={targetDate}
              onChangeText={setTargetDate}
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={addGoal}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save goal</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06091A' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#06091A', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9', letterSpacing: -0.5 },
  addBtn: { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)' },
  addBtnText: { color: '#4F8EF7', fontWeight: '700', fontSize: 14 },
  emptyCard: { backgroundColor: '#0D1326', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  emptyBtn: { backgroundColor: '#4F8EF7', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  goalCard: { backgroundColor: '#0D1326', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  goalName: { fontSize: 16, fontWeight: '700', color: '#F1F5F9' },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeGreen: { backgroundColor: 'rgba(52,211,153,0.15)' },
  badgeAmber: { backgroundColor: 'rgba(251,191,36,0.15)' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextGreen: { color: '#34D399' },
  badgeTextAmber: { color: '#FBBF24' },
  progressBg: { height: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 16 },
  progressFill: { height: '100%', borderRadius: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  stat: { flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: '#F1F5F9' },
  statLabel: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  insightRow: { borderRadius: 16, padding: 16 },
  insightGreen: { backgroundColor: 'rgba(52,211,153,0.08)' },
  insightAmber: { backgroundColor: 'rgba(79,142,247,0.08)' },
  insightText: { fontSize: 13, lineHeight: 20 },
  insightTextGreen: { color: '#34D399' },
  insightTextAmber: { color: '#4F8EF7' },
  adjustBtn: { marginTop: 16, backgroundColor: '#0F172A', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  adjustBtnText: { color: '#F1F5F9', fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { backgroundColor: '#0D1326', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#F1F5F9' },
  modalClose: { color: '#94A3B8', fontSize: 15 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { backgroundColor: '#0D1326', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: '#F1F5F9', marginBottom: 16 },
  saveBtn: { backgroundColor: '#4F8EF7', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
