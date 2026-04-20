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

type Step = 'email' | 'otp'

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const sendOtp = async () => {
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        channel: 'email',
        shouldCreateUser: true,
      },
    })
    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setStep('otp')
  }

  const verifyOtp = async () => {
    if (otp.length < 8) {
      Alert.alert('Invalid code', 'Please enter the 8-digit code.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    setLoading(false)

    if (error) {
      Alert.alert('Invalid code', 'The code is incorrect or expired. Try again.')
      return
    }
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

        {step === 'email' && (
          <View style={styles.form}>
            <Text style={styles.label}>Enter your email to get started</Text>
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
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={sendOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Send code →</Text>
              }
            </TouchableOpacity>
            <Text style={styles.hint}>We'll send an 8-digit code to your email</Text>
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.form}>
            <Text style={styles.label}>Enter the code sent to</Text>
            <Text style={styles.emailDisplay}>{email}</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="12345678"
              placeholderTextColor="#4B5563"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={verifyOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Verify →</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('email')}>
              <Text style={styles.back}>← Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}
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
