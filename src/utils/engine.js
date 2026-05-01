// ─── Unified Decision Engine ────────────────────────────────────────────
// Single entry point: takes all user data, returns actionable output

import { calculateMonthlyRequired, getMoneyFlow } from './calculations'
import { generateInsights } from './insights'
import { getStatus } from './status'

export function runEngine({ income, transactions, goals, assets, age, profile }) {
  const flow = getMoneyFlow(transactions, income)

  // Emergency fund calculation
  const liquidCash = assets?.liquidCash || 0
  const monthlyExpenses = flow.totalSpent || (profile?.expenses_essentials || 0) + (profile?.expenses_lifestyle || 0) + (profile?.expenses_emis || 0)
  const emergencyMonths = monthlyExpenses > 0 ? +(liquidCash / monthlyExpenses).toFixed(1) : 0

  // Goal funding average (skip goals with no target set)
  const configuredGoals = goals.filter(g => g.target_amount > 0)
  const goalCalcs = configuredGoals.map(g => calculateMonthlyRequired(g))
  const avgGoalFunded = goalCalcs.length > 0 ? goalCalcs.reduce((s, c) => s + c.funded, 0) / goalCalcs.length : 0

  // Status
  const statusResult = getStatus({
    savingsPct: flow.savingsPct,
    needsPct: flow.needsPct,
    wantsPct: flow.wantsPct,
    emergencyMonths,
    goalsFunded: avgGoalFunded,
  })

  // Insights (top 2 only)
  const allInsights = generateInsights({ transactions, goals, profile, assets })
  const topInsights = allInsights.slice(0, 2)

  // Top problem + action
  const topProblem = topInsights[0]?.type !== 'positive' ? topInsights[0]?.title : null
  const action = topInsights[0]?.action || null

  return {
    flow,
    status: statusResult,
    topProblem,
    action,
    insights: topInsights,
    allInsights,
    emergencyMonths,
    goalCalcs,
  }
}
