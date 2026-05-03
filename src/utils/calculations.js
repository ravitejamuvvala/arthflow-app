// ─── Financial Calculations Engine ──────────────────────────────────────
// Pure functions — no Supabase or side effects

export function mapCategory(cat) {
  const l = (cat || '').toLowerCase()
  if (['essentials', 'food', 'dining', 'transport', 'groceries', 'rent', 'bills', 'utilities', 'health'].some(k => l.includes(k))) return 'essentials'
  if (['lifestyle', 'shopping', 'entertainment', 'travel'].some(k => l.includes(k))) return 'lifestyle'
  if (['emi', 'loan', 'credit'].some(k => l.includes(k))) return 'emis'
  return 'other'
}

export function fmtInr(val) {
  if (val >= 10000000) return `₹${parseFloat((val / 10000000).toFixed(2))}Cr`
  if (val >= 100000) return `₹${parseFloat((val / 100000).toFixed(2))}L`
  if (val >= 1000) return `₹${parseFloat((val / 1000).toFixed(1))}K`
  return `₹${Math.round(val)}`
}

/** Format a number string with Indian commas (12,34,567) for live input display */
export function commaFormat(numStr) {
  const digits = numStr.replace(/[^0-9]/g, '')
  if (!digits) return ''
  const n = digits.replace(/^0+(?=\d)/, '') // strip leading zeros
  if (n.length <= 3) return n
  const last3 = n.slice(-3)
  const rest = n.slice(0, -3)
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${formatted},${last3}`
}

/** Strip commas from formatted string → raw digit string */
export function stripCommas(str) {
  return (str || '').replace(/,/g, '')
}

export function getMoneyFlow(transactions, baseIncome, profile) {
  const income = baseIncome || transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense')
  const totalSpent = expenses.reduce((s, t) => s + t.amount, 0)

  const catTotals = { essentials: 0, lifestyle: 0, emis: 0, other: 0 }
  expenses.forEach(t => {
    catTotals[mapCategory(t.category || 'other')] += t.amount
  })

  const savings = income - totalSpent
  const savingsPct = income > 0 ? Math.round((savings / income) * 100) : 0

  const needsPct = income > 0 ? Math.round(((catTotals.essentials + catTotals.emis) / income) * 100) : 0
  const wantsPct = income > 0 ? Math.round((catTotals.lifestyle / income) * 100) : 0

  return { income, totalSpent, savings, savingsPct, catTotals, needsPct, wantsPct }
}

export function calculateMonthlyRequired(goal) {
  const now = new Date()
  const targetDate = new Date(goal.target_date)
  const monthsLeft = Math.max(1, (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth()))
  const remaining = Math.max(0, goal.target_amount - (goal.saved_amount || goal.current_amount || 0))
  return { monthlyNeeded: Math.ceil(remaining / monthsLeft), monthsLeft, remaining, funded: goal.target_amount > 0 ? ((goal.saved_amount || goal.current_amount || 0) / goal.target_amount) : 0 }
}

export function getMonthlySnapshots(transactions, baseIncome) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const snapMap = {}
  transactions.forEach(t => {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!snapMap[key]) snapMap[key] = { inc: 0, spent: 0 }
    if (t.type === 'income') snapMap[key].inc += t.amount
    else snapMap[key].spent += t.amount
  })
  return Object.keys(snapMap).sort().map(key => {
    const [y, m] = key.split('-').map(Number)
    const s = snapMap[key]
    const inc = s.inc || baseIncome || 0
    return {
      label: `${monthNames[m]} ${y}`,
      short: monthNames[m],
      income: inc,
      spent: s.spent,
      savedPct: inc > 0 ? Math.round(((inc - s.spent) / inc) * 100) : 0,
    }
  }).slice(-5)
}
