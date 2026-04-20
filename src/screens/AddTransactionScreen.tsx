import React, { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../lib/supabase'

const EXPENSE_CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Entertainment',
  'Health', 'Bills & Utilities', 'Rent', 'Other',
]

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other']

type Props = {
  onSuccess: () => void
  onCancel: () => void
}

export default function AddTransactionScreen({ onSuccess, onCancel }: Props) {
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const switchType = (t: 'income' | 'expense') => {
    setType(t)
    setCategory('')
  }

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.')
      return
    }
    if (!category) {
      Alert.alert('Select category', 'Please pick a category.')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('transactions').insert([{
      user_id: user?.id,
      amount: Number(amount),
      category,
      type,
      note: note || null,
      date: new Date().toISOString(),
    }])

    setLoading(false)

    if (error) {
      Alert.alert('Error', 'Could not save transaction. Please try again.')
      return
    }

    onSuccess()
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add transaction</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, type === 'expense' && styles.toggleActive]}
            onPress={() => switchType('expense')}
          >
            <Text style={[styles.toggleText, type === 'expense' && styles.toggleTextActive]}>
              Expense
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, type === 'income' && styles.toggleActiveGreen]}
            onPress={() => switchType('income')}
          >
            <Text style={[styles.toggleText, type === 'income' && styles.toggleTextActive]}>
              Income
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor="#4B5563"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            autoFocus
          />
        </View>

        <Text style={styles.sectionLabel}>Category</Text>
        <View style={styles.categoryGrid}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Note (optional)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="e.g. Lunch with team"
          placeholderTextColor="#4B5563"
          value={note}
          onChangeText={setNote}
          maxLength={100}
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Save transaction</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06091A' },
  content: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  cancel: { fontSize: 15, color: '#94A3B8', width: 56 },
  title: { fontSize: 17, fontWeight: '700', color: '#F1F5F9' },
  toggle: { flexDirection: 'row', backgroundColor: '#0D1326', borderRadius: 14, padding: 4, marginBottom: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  toggleActive: { backgroundColor: '#4F8EF7' },
  toggleActiveGreen: { backgroundColor: '#34D399' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  toggleTextActive: { color: '#fff' },
  amountContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  rupee: { fontSize: 36, fontWeight: '700', color: '#94A3B8', marginRight: 4 },
  amountInput: { fontSize: 56, fontWeight: '800', color: '#F1F5F9', minWidth: 120, letterSpacing: -2 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#0D1326', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  categoryChipActive: { backgroundColor: 'rgba(79,142,247,0.15)', borderColor: '#4F8EF7' },
  categoryText: { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
  categoryTextActive: { color: '#4F8EF7', fontWeight: '700' },
  noteInput: { backgroundColor: '#0D1326', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: '#F1F5F9', marginBottom: 32 },
  submitBtn: { backgroundColor: '#4F8EF7', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
