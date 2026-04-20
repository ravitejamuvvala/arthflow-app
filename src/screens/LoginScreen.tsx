import React, { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { supabase } from '../lib/supabase'
import SignUpScreen from './SignUpScreen'

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  const handleSignIn = async () => {
    if (!email.includes('@') || password.length < 6) {
      Alert.alert('Invalid input', 'Enter a valid email and password (min 6 chars).')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.log('SignIn response:', { data, error })
      if (error) {
        setLoading(false)
        Alert.alert('Sign in error', error.message)
        return
      }
      // Let auth state change in App.js handle session update
      setLoading(false)
    } catch (e) {
      setLoading(false)
      Alert.alert('Sign in error', e.message || String(e))
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
        <Text style={styles.logo}>
          Arth<Text style={styles.logoAccent}>Flow</Text>
        </Text>
        <Text style={styles.tagline}>Your monthly money operating system</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#4B5563"
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
            placeholderTextColor="#4B5563"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
          />
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
            style={[styles.btn, { backgroundColor: '#475569', marginTop: 8 }]}
            onPress={() => setShowSignUp(true)}
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
    backgroundColor: '#06091A',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    fontWeight: '800',
    fontSize: 36,
    color: '#F1F5F9',
    marginBottom: 8,
    letterSpacing: -1,
  },
  logoAccent: {
    color: '#4F8EF7',
  },
  tagline: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 48,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  emailDisplay: {
    fontSize: 14,
    color: '#4F8EF7',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0D1326',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: '#F1F5F9',
  },
  otpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: '#4F8EF7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 4,
  },
  back: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
})
