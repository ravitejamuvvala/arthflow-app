import { CONFIG } from './config'
import { supabase } from './supabase'

async function getAuthHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchInsight(payload) {
  const headers = await getAuthHeader()

  const res = await fetch(`${CONFIG.BACKEND_URL}/insights/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })

  if (!res.ok) throw new Error('Failed to fetch insight')

  const data = await res.json()
  return data.insight
}

export const fetchAiInsight = fetchInsight
