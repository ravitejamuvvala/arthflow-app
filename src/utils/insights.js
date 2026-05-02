// ─── Insight Generator ──────────────────────────────────────────────────
// Returns structured, prioritised insights from financial data

import { fmtInr } from './calculations'

export function generateInsights({ flow, goals, profile, assets, emergencyMonths: engineEmergencyMonths, goalCalcs: engineGoalCalcs }) {
  const age = profile?.age ?? 0
  const out = []

  // ── 1. Overspending check ────────────────────────────────
  if (flow.totalSpent > flow.income * 0.7 && flow.income > 0) {
    out.push({
      type: 'warning', priority: 1,
      title: 'Spending is a bit high this month',
      message: `You've used ${Math.round((flow.totalSpent / flow.income) * 100)}% of your income. Let's trim a little to stay comfortable.`,
      action: 'Review expenses',
    })
  }

  // ── 2. Low savings ───────────────────────────────────────
  if (flow.savingsPct < 20 && flow.income > 0) {
    const gap = Math.round(flow.income * 0.20 - flow.savings)
    out.push({
      type: 'warning', priority: 1,
      title: `Let's improve your savings this month`,
      message: `You're saving ${flow.savingsPct}% — finding ${fmtInr(gap)} more would hit the 20% target.`,
      action: 'Find savings',
    })
  } else if (flow.savingsPct >= 25 && flow.income > 0) {
    out.push({
      type: 'positive', priority: 5,
      title: `Great savings rate — ${flow.savingsPct}%! 🎉`,
      message: `You're well above the 20% benchmark. Consider investing the surplus.`,
      action: 'Invest surplus',
    })
  }

  // ── 3. No emergency fund ─────────────────────────────────
  const liquidCash = assets?.liquidCash || 0
  const monthlyExpenses = flow.totalSpent || 0
  const emergencyTarget = monthlyExpenses * 6
  const emergencyMonths = engineEmergencyMonths ?? (monthlyExpenses > 0 ? +(liquidCash / monthlyExpenses).toFixed(1) : 0)

  if (emergencyMonths < 3 && monthlyExpenses > 0) {
    out.push({
      type: 'risk', priority: 1,
      title: `Emergency fund: ${emergencyMonths} months covered`,
      message: `You need ${fmtInr(emergencyTarget)} (6× expenses) in liquid savings. Currently at ${fmtInr(liquidCash)}.`,
      action: 'Build emergency fund',
    })
  }

  // ── 4. Goal gap (skip goals with no target set) ──────────
  const configuredGoals = goals.filter(g => g.target_amount > 0)
  configuredGoals.forEach((g, i) => {
    const calc = engineGoalCalcs?.[i]
    if (!calc) return
    if (calc.funded < 0.25 && calc.monthlyNeeded > flow.savings * 0.5) {
      out.push({
        type: 'warning', priority: 2,
        title: `${g.name} needs ${fmtInr(calc.monthlyNeeded)}/month`,
        message: `Only ${Math.round(calc.funded * 100)}% funded. ${calc.monthsLeft} months left to reach ${fmtInr(g.target_amount)}.`,
        action: `Boost ${g.name}`,
      })
    }
  })

  // ── 5. Lifestyle creep ───────────────────────────────────
  if (flow.wantsPct > 30 && flow.income > 0) {
    out.push({
      type: 'warning', priority: 2,
      title: 'Lifestyle spending is a bit high',
      message: `${flow.wantsPct}% on lifestyle (target: 30%). Small cuts here have the biggest impact.`,
      action: 'Reduce lifestyle',
    })
  }

  // ── 6. Insurance check (only show if no liquid assets tracked — user likely hasn't set up protection) ──
  if (flow.income > 0 && age > 25 && !assets?.hasInsurance) {
    const termNeeded = flow.income * 12 * 15
    out.push({
      type: 'neutral', priority: 4,
      title: `Have you checked your term insurance?`,
      message: `At age ${age}, a common benchmark is ${fmtInr(termNeeded)} cover (15× annual income). Compare plans online.`,
      action: 'Ask coach about insurance',
    })
  }

  // Fallback
  if (out.length === 0) {
    out.push({
      type: 'positive', priority: 5,
      title: 'Looking good! 🎉',
      message: 'No urgent actions right now. Keep tracking and stay on course.',
      action: null,
    })
  }

  return out.sort((a, b) => a.priority - b.priority)
}
