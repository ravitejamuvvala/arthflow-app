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
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`
  return `₹${Math.round(val)}`
}

export function getMoneyFlow(transactions, baseIncome) {
  const income = baseIncome || transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense')
  const totalSpent = expenses.reduce((s, t) => s + t.amount, 0)
  const savings = income - totalSpent
  const savingsPct = income > 0 ? Math.round((savings / income) * 100) : 0

  const catTotals = { essentials: 0, lifestyle: 0, emis: 0, other: 0 }
  expenses.forEach(t => {
    catTotals[mapCategory(t.category || 'other')] += t.amount
  })

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

export function getBudgetRule(age) {
  if (age < 30) return { label: '50 / 20 / 30', needsTarget: 50, wantsTarget: 20, savingsTarget: 30, rationale: 'Aggressive wealth building' }
  if (age < 45) return { label: '50 / 25 / 25', needsTarget: 50, wantsTarget: 25, savingsTarget: 25, rationale: 'Balanced growth' }
  return { label: '55 / 25 / 20', needsTarget: 55, wantsTarget: 25, savingsTarget: 20, rationale: 'Capital preservation' }
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
  }).slice(-4)
}
