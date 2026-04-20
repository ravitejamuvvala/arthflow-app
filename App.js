import { useEffect, useState } from 'react'
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from './src/lib/supabase'

import AddTransactionScreen from './src/screens/AddTransactionScreen'
import GoalsScreen from './src/screens/GoalsScreen'
import HomeScreen from './src/screens/HomeScreen'
import LoginScreen from './src/screens/LoginScreen'
import PlanScreen from './src/screens/PlanScreen'

export default function App() {
  const [session, setSession] = useState(null)
  const [activeTab, setActiveTab] = useState('home')
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>Arth<Text style={{ color: '#4F8EF7' }}>Flow</Text></Text>
      </View>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screen}>
        {activeTab === 'home' && <HomeScreen onAddTransaction={() => setShowAddTransaction(true)} />}
        {activeTab === 'goals' && <GoalsScreen />}
        {activeTab === 'plan' && <PlanScreen />}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'home' && styles.tabActive]} onPress={() => setActiveTab('home')}>
          <Text style={styles.tabIcon}>⊞</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Home</Text>
          {activeTab === 'home' && <View style={styles.tabDot} />}
        </TouchableOpacity>

        <View style={styles.tabSpacer} />

        <TouchableOpacity style={styles.addTabBtn} onPress={() => setShowAddTransaction(true)}>
          <Text style={styles.addTabIcon}>+</Text>
        </TouchableOpacity>

        <View style={styles.tabSpacer} />

        <TouchableOpacity style={[styles.tab, activeTab === 'goals' && styles.tabActive]} onPress={() => setActiveTab('goals')}>
          <Text style={styles.tabIcon}>🎯</Text>
          <Text style={[styles.tabLabel, activeTab === 'goals' && styles.tabLabelActive]}>Goals</Text>
          {activeTab === 'goals' && <View style={styles.tabDot} />}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.tab, activeTab === 'plan' && styles.tabActive]} onPress={() => setActiveTab('plan')}>
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'plan' && styles.tabLabelActive]}>Plan</Text>
          {activeTab === 'plan' && <View style={styles.tabDot} />}
        </TouchableOpacity>
      </View>

      <Modal visible={showAddTransaction} animationType="slide" presentationStyle="pageSheet">
        <AddTransactionScreen
          onSuccess={() => setShowAddTransaction(false)}
          onCancel={() => setShowAddTransaction(false)}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#06091A', justifyContent: 'center', alignItems: 'center' },
  splashLogo: { fontSize: 36, fontWeight: '800', color: '#F1F5F9', letterSpacing: -1 },
  container: { flex: 1, backgroundColor: '#06091A' },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0D1326',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingBottom: 8,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  tab: { alignItems: 'center', flex: 1, paddingVertical: 4, minWidth: 60 },
  tabActive: { },
  tabSpacer: { width: 8 },
  tabIcon: { fontSize: 20, marginBottom: 2 },
  tabLabel: { fontSize: 10, color: '#475569', fontWeight: '600' },
  tabLabelActive: { color: '#4F8EF7' },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4F8EF7', marginTop: 3 },
  addTabBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4F8EF7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  addTabIcon: { color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 },
})
