import { CONFIG } from './config'
import { supabase } from './supabase'

async function getAuthHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchInsight(payload) {
  const headers = await getAuthHeader()

  let res
  try {
    res = await fetch(`${CONFIG.BACKEND_URL}/insights/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('Network error fetching insight:', err)
    throw new Error('Network error fetching insight: ' + err.message)
  }

  if (!res.ok) {
    let msg = 'Failed to fetch insight'
    try {
      const errData = await res.json()
      msg += ': ' + (errData.error || JSON.stringify(errData))
    } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  return data.insight
}

export const fetchAiInsight = fetchInsight
