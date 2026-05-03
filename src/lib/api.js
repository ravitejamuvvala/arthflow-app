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

export async function fetchAiChat(message, context) {
  const headers = await getAuthHeader()

  let res
  try {
    res = await fetch(`${CONFIG.BACKEND_URL}/insights/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ message, context }),
    })
  } catch (err) {
    console.error('Network error in AI chat:', err)
    throw new Error('Network error: ' + err.message)
  }

  if (!res.ok) {
    let msg = 'AI chat failed'
    try {
      const errData = await res.json()
      msg += ': ' + (errData.error || JSON.stringify(errData))
    } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  return data.reply
}

export async function fetchAiReport(payload) {
  const headers = await getAuthHeader()
  const url = `${CONFIG.BACKEND_URL}/insights/report`
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  }

  // Retry once on network failure (handles Render free-tier cold start)
  let res
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, opts)
      break // success
    } catch (err) {
      if (attempt === 0) {
        console.warn('[AI] First attempt failed (server may be waking up), retrying...')
        await new Promise(r => setTimeout(r, 3000))
      } else {
        console.error('Network error fetching AI report:', err)
        throw new Error('Network error: ' + err.message)
      }
    }
  }

  if (!res.ok) {
    let msg = 'AI report failed'
    try {
      const errData = await res.json()
      msg += ': ' + (errData.details || errData.error || JSON.stringify(errData))
    } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  return data.report
}
