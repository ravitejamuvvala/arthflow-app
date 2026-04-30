import { Manrope_400Regular, Manrope_700Bold } from '@expo-google-fonts/manrope'
import { NotoSerif_700Bold, useFonts } from '@expo-google-fonts/noto-serif'
import { Feather } from '@expo/vector-icons'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ArthFlowLogo from './src/components/ArthFlowLogo'
import { supabase } from './src/lib/supabase'

import AddTransactionScreen from './src/screens/AddTransactionScreen'
import CoachScreen from './src/screens/CoachScreen'
import GoalsScreen from './src/screens/GoalsScreen'
import LoginScreen from './src/screens/LoginScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import ThisMonthScreen from './src/screens/ThisMonthScreen'

SplashScreen.preventAutoHideAsync()

export default function App() {
  const [session, setSession] = useState(null)
  const [activeTab, setActiveTab] = useState('home')
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isOnboarded, setIsOnboarded] = useState(null) // null = loading, true/false = checked

  const [fontsLoaded] = useFonts({
    NotoSerif_700Bold,
    Manrope_400Regular,
    Manrope_700Bold,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Clear stale/invalid session (e.g. expired refresh token)
        supabase.auth.signOut()
        setSession(null)
      } else {
        setSession(session)
      }
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        // Refresh token was invalid — force sign out
        supabase.auth.signOut()
        setSession(null)
        setIsOnboarded(null)
      } else {
        setSession(session)
        if (!session) setIsOnboarded(null)
      }
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Check onboarding status when session exists
  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('is_onboarded')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setIsOnboarded(data?.is_onboarded === true)
      })
      .catch(() => setIsOnboarded(false))
  }, [session])

  useEffect(() => {
    if (fontsLoaded && !authLoading) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, authLoading])

  if (!fontsLoaded || authLoading) {
    return (
      <View style={styles.splash}>
        <ArthFlowLogo size={80} />
        <Text style={styles.splashLogo}>ARTHFLOW</Text>
        <ActivityIndicator color="#1E3A8A" style={{ marginTop: 16 }} />
      </View>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  if (isOnboarded === null) {
    return (
      <View style={styles.splash}>
        <ArthFlowLogo size={80} />
        <Text style={styles.splashLogo}>ARTHFLOW</Text>
        <ActivityIndicator color="#1E3A8A" style={{ marginTop: 16 }} />
      </View>
    )
  }

  if (isOnboarded === false) {
    return (
      <SafeAreaView style={styles.container}>
        <OnboardingScreen onComplete={() => setIsOnboarded(true)} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screen}>
        {activeTab === 'home' && <ThisMonthScreen refreshTrigger={refreshKey} onNavigateCoach={() => setActiveTab('coach')} onNavigatePlan={() => setActiveTab('plan')} />}
        {activeTab === 'plan' && <GoalsScreen />}
        {activeTab === 'coach' && <CoachScreen />}
        {activeTab === 'profile' && <ProfileScreen />}
      </View>

      <View style={styles.tabBar}>
        {[
          { key: 'home', icon: 'home', label: 'Home' },
          { key: 'plan', icon: 'target', label: 'Plan' },
          { key: 'coach', icon: 'zap', label: 'Coach' },
          { key: 'profile', icon: 'user', label: 'Me' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
          >
            {activeTab === tab.key && <View style={styles.tabPill} />}
            <Feather name={tab.icon} size={20} color={activeTab === tab.key ? '#1E3A8A' : '#9CA3AF'} style={{ zIndex: 1, marginBottom: 3 }} />
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.key && <View style={styles.tabDot} />}
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={showAddTransaction} animationType="slide" presentationStyle="pageSheet">
        <AddTransactionScreen
          onSuccess={() => { setShowAddTransaction(false); setRefreshKey(k => k + 1) }}
          onCancel={() => setShowAddTransaction(false)}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  splashImage: { width: 96, height: 96, marginBottom: 16 },
  splashLogo: { fontSize: 22, fontWeight: '700', color: '#1E293B', letterSpacing: 1.5, marginTop: 14, fontFamily: 'Manrope_700Bold' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 10,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    zIndex: 1,
    position: 'relative',
    shadowColor: '#0B1B4A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 20,
  },
  tab: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 8, paddingBottom: 4, position: 'relative' },
  tabPill: { position: 'absolute', top: 2, bottom: 2, left: 8, right: 8, borderRadius: 16, backgroundColor: '#DBEAFE' },
  tabActive: {},
  tabIcon: { fontSize: 20, marginBottom: 3, zIndex: 1 },
  tabLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', fontFamily: 'Manrope_400Regular', letterSpacing: 0.4, zIndex: 1, textTransform: 'uppercase' },
  tabLabelActive: { color: '#1E3A8A', fontWeight: '800', fontFamily: 'Manrope_700Bold', letterSpacing: 0.2 },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#1E3A8A', marginTop: 3, zIndex: 1 },

})
