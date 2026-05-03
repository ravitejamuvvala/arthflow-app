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
import ArthFlowLogo from '../components/ArthFlowLogo'
import { useAppData } from '../lib/DataContext'
import { supabase } from '../lib/supabase'
import { commaFormat, stripCommas } from '../utils/calculations'

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
  const { refreshData } = useAppData()
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
    if (!amount || isNaN(Number(stripCommas(amount))) || Number(stripCommas(amount)) <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.')
      return
    }
    if (!category) {
      Alert.alert('Select category', 'Please pick a category.')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      Alert.alert('Session expired', 'Please sign in again.')
      return
    }

    const { error } = await supabase.from('transactions').insert([{
      user_id: user.id,
      amount: Number(stripCommas(amount)),
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

    // Refresh shared data context so all screens see the new transaction
    await refreshData()
    onSuccess()
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <ArthFlowLogo size={24} />
          <Text style={styles.brandText}>ARTHFLOW</Text>
        </View>

        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add transaction</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, type === 'income' && styles.toggleActiveGreen]}
            onPress={() => switchType('income')}
          >
            <Text style={[styles.toggleText, type === 'income' && styles.toggleTextActive]}>
              Income
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, type === 'expense' && styles.toggleActive]}
            onPress={() => switchType('expense')}
          >
            <Text style={[styles.toggleText, type === 'expense' && styles.toggleTextActive]}>
              Expense
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            value={amount}
            onChangeText={t => setAmount(commaFormat(t))}
            keyboardType="number-pad"
            returnKeyType="done"
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
          placeholderTextColor="#9CA3AF"
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 48 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 12 },
  brandText: { fontSize: 15, fontWeight: '700', color: '#1E293B', letterSpacing: 1.2, fontFamily: 'Manrope_700Bold' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  cancel: { fontSize: 15, color: '#6B7280', width: 56, fontFamily: 'Manrope_400Regular' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', fontFamily: 'Manrope_700Bold' },
  toggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 16, padding: 4, marginBottom: 32, borderWidth: 1, borderColor: '#E5E7EB' },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  toggleActive: { backgroundColor: '#1E3A8A' },
  toggleActiveGreen: { backgroundColor: '#22C55E' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', fontFamily: 'Manrope_700Bold' },
  toggleTextActive: { color: '#fff' },
  amountContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  rupee: { fontSize: 36, fontWeight: '700', color: '#6B7280', marginRight: 4, fontFamily: 'Manrope_700Bold' },
  amountInput: { fontSize: 56, fontWeight: '800', color: '#111827', minWidth: 120, letterSpacing: -2, fontFamily: 'Manrope_700Bold' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: 'Manrope_700Bold' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB' },
  categoryChipActive: { backgroundColor: 'rgba(30,58,138,0.08)', borderColor: '#1E3A8A' },
  categoryText: { fontSize: 15, color: '#6B7280', fontWeight: '500', fontFamily: 'Manrope_400Regular' },
  categoryTextActive: { color: '#1E3A8A', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  noteInput: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: '#111827', marginBottom: 32, fontFamily: 'Manrope_400Regular' },
  submitBtn: { backgroundColor: '#1E3A8A', borderRadius: 16, paddingVertical: 18, alignItems: 'center', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.38, shadowRadius: 24, elevation: 6 },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
})
