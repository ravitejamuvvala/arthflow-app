import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Clear corrupted / expired session storage so the app
// doesn't keep throwing "Refresh Token Not Found"
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Supabase already clears its own keys, but wipe any
    // lingering auth artefacts from AsyncStorage just in case.
    AsyncStorage.getAllKeys().then(keys => {
      const authKeys = keys.filter(k => k.startsWith('sb-'))
      if (authKeys.length) AsyncStorage.multiRemove(authKeys)
    }).catch(() => {})
  }
})