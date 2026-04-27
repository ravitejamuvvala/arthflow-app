import React, { useState } from 'react';
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
} from 'react-native';
import ArthFlowLogo from '../components/ArthFlowLogo';
import { supabase } from '../lib/supabase';


type SignUpScreenProps = {
  onSignUpSuccess?: () => void;
  onCancel?: () => void;
};

export default function SignUpScreen({ onSignUpSuccess, onCancel }: SignUpScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (pw) => {
    // At least 1 capital, 1 special, 1 number, min 6 chars
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{6,}$/.test(pw);
  };

  const handleSignUp = async () => {
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!validatePassword(password)) {
      Alert.alert(
        'Weak password',
        'Password must be at least 6 characters, include 1 capital letter, 1 special character, and 1 number.'
      );
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up error', error.message);
    } else {
      Alert.alert('Success', 'Check your email for a confirmation link.');
      if (onSignUpSuccess) onSignUpSuccess();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={{ alignSelf: 'center', marginBottom: 12 }}>
          <ArthFlowLogo size={64} />
        </View>
        <View style={styles.headerRow}>
          {onCancel && (
            <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.logo}>Sign Up</Text>
          <View style={{ width: 48 }} />
        </View>
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
          <Text
            style={[
              styles.passwordPolicy,
              password.length > 0 && !validatePassword(password) && styles.passwordPolicyInvalid,
            ]}
          >
            Password must be at least 6 characters, include 1 capital letter, 1 special character, and 1 number.
          </Text>
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign Up</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtnText: {
    color: '#1E3A8A',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Manrope_700Bold',
  },
  logoImage: {
    width: 64,
    height: 64,
    alignSelf: 'center',
    marginBottom: 12,
  },
  logo: {
    fontWeight: '700',
    fontSize: 22,
    color: '#1E293B',
    marginBottom: 0,
    letterSpacing: 1.5,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
  },
    passwordPolicy: {
      fontSize: 12,
      color: '#6B7280',
      marginTop: 2,
      marginBottom: 2,
      fontFamily: 'Manrope_400Regular',
    },
    passwordPolicyInvalid: {
      color: '#EF4444',
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
  btn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
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
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
});
