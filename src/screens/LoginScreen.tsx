import React, { useState } from 'react'
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

import ArthFlowLogo from '../components/ArthFlowLogo'
import { supabase } from '../lib/supabase'
import SignUpScreen from './SignUpScreen'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSignIn = async () => {
    setErrorMsg('')
    if (!email.includes('@') || password.length < 6) {
      setErrorMsg('Enter a valid email and password (min 6 chars).')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.log('SignIn response:', { data, error })
      if (error) {
        setLoading(false)
        setErrorMsg('Invalid credentials.')
        return
      }
      // Let auth state change in App.js handle session update
      setLoading(false)
    } catch (e) {
      setLoading(false)
      setErrorMsg('Something went wrong. Please try again.')
    }
  }

  if (showSignUp) {
    return <SignUpScreen onSignUpSuccess={() => setShowSignUp(false)} onCancel={() => setShowSignUp(false)} />
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={{ alignSelf: 'center', marginBottom: 16 }}>
          <ArthFlowLogo size={80} />
        </View>
        <Text style={styles.logo}>ARTHFLOW</Text>
        <Text style={styles.tagline}>Your monthly money operating system</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
          />
          {errorMsg !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              {errorMsg === 'Invalid credentials.' && (
                <Text style={styles.errorText}>
                  Don't have an account?{' '}
                  <Text style={styles.errorLink} onPress={() => { setErrorMsg(''); setShowSignUp(true) }}>Sign Up</Text>
                </Text>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#64748B', marginTop: 8 }]}
            onPress={() => { setErrorMsg(''); setShowSignUp(true) }}
            disabled={loading}
          >
            <Text style={styles.btnText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 80,
    height: 80,
    alignSelf: 'center',
    marginBottom: 16,
  },
  logo: {
    fontWeight: '700',
    fontSize: 22,
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: 1.5,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
  },
  logoAccent: {
    color: '#1E3A8A',
  },
  tagline: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 48,
    textAlign: 'center',
    fontFamily: 'Manrope_400Regular',
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    fontFamily: 'Manrope_700Bold',
  },
  emailDisplay: {
    fontSize: 14,
    color: '#1E3A8A',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Manrope_400Regular',
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  hint: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
  back: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  errorLink: {
    color: '#1E3A8A',
    fontWeight: '800',
    fontFamily: 'Manrope_700Bold',
    textDecorationLine: 'underline',
  },
})
