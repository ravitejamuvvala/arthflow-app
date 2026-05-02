// ─── Unified Decision Engine ────────────────────────────────────────────
// Single entry point: takes all user data, returns actionable output

import { calculateMonthlyRequired, fmtInr, getMoneyFlow } from './calculations'
import { generateInsights } from './insights'
import { getStatus } from './status'

export function runEngine({ income, transactions, goals, assets, age, profile }) {
  const flow = getMoneyFlow(transactions, income, profile)

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

// ─── Top Action Determiner ──────────────────────────────────────────────
// Returns the single most important action the user should take right now

export function getTopAction(engineResult) {
  const { flow, emergencyMonths, goalCalcs } = engineResult
  const savingsPct = flow?.savingsPct ?? 0
  const monthlyExpenses = flow?.totalSpent ?? 0
  const income = flow?.income ?? 0

  // Priority 1: Emergency fund < 3 months
  if (emergencyMonths < 3 && monthlyExpenses > 0) {
    const targetMonths = 6
    const monthlyTarget = Math.ceil(monthlyExpenses * 0.25) // suggest 25% of expenses
    const coverText = emergencyMonths === 0
      ? 'You have 0 months covered'
      : `You have ${emergencyMonths} month${emergencyMonths !== 1 ? 's' : ''} covered`
    return {
      key: 'emergency',
      severity: 'urgent',
      title: 'Build Emergency Fund',
      subtitle: coverText,
      impact: 'This stabilizes your finances in 6 months',
      ctaLabel: `Start ${fmtInr(monthlyTarget)}/month`,
      ctaAmount: monthlyTarget,
    }
  }

  // Priority 2: Savings < 20%
  if (savingsPct < 20 && income > 0) {
    const gap = Math.round(income * 0.20 - flow.savings)
    return {
      key: 'savings',
      severity: savingsPct < 10 ? 'urgent' : 'warning',
      title: 'Boost Your Savings',
      subtitle: `Currently saving ${savingsPct}% — target is 20%`,
      impact: `Finding ${fmtInr(gap)} more per month changes everything`,
      ctaLabel: `Save ${fmtInr(gap)} more`,
      ctaAmount: gap,
    }
  }

  // Priority 3: Goals off track
  const offTrack = (goalCalcs || []).filter(g => g.funded < 0.5 && g.monthlyNeeded > 0)
  if (offTrack.length > 0) {
    const worst = offTrack.sort((a, b) => a.funded - b.funded)[0]
    return {
      key: 'goals',
      severity: 'warning',
      title: 'Get Goals Back on Track',
      subtitle: `${offTrack.length} goal${offTrack.length > 1 ? 's' : ''} under 50% funded`,
      impact: `Allocating ${fmtInr(worst.monthlyNeeded)}/month closes the gap`,
      ctaLabel: `Boost by ${fmtInr(worst.monthlyNeeded)}/month`,
      ctaAmount: worst.monthlyNeeded,
    }
  }

  // Priority 4: Everything good — invest surplus
  const surplus = flow?.savings ?? 0
  return {
    key: 'invest',
    severity: 'good',
    title: 'Invest Your Surplus',
    subtitle: `You have ${fmtInr(surplus)} available this month`,
    impact: 'Put your money to work — even small SIPs compound fast',
    ctaLabel: `Invest ${fmtInr(surplus)}`,
    ctaAmount: surplus,
  }
}

// ─── Money Story (3-line narrative) ─────────────────────────────────────
// Returns { positive, problem, action } — each a human-readable line with ₹ amounts

export function getMoneyStory(engineResult) {
  const { flow, emergencyMonths, goalCalcs, allInsights } = engineResult
  const income = flow?.income ?? 0
  const savings = flow?.savings ?? 0
  const savingsPct = flow?.savingsPct ?? 0
  const totalSpent = flow?.totalSpent ?? 0
  const lifestyle = flow?.catTotals?.lifestyle ?? 0

  // ── Line 1: Positive insight ──────────────────────────────
  let positive
  if (savingsPct >= 20) {
    positive = `You saved ${savingsPct}% this month — that's ${fmtInr(savings)} kept`
  } else if (savings > 0) {
    positive = `You saved ${fmtInr(savings)} this month`
  } else if (income > 0) {
    positive = `You earned ${fmtInr(income)} this month`
  } else {
    positive = "You're tracking your money — that's step one"
  }

  // ── Line 2: Critical problem ──────────────────────────────
  let problem
  if (emergencyMonths < 1 && totalSpent > 0) {
    problem = `But ${fmtInr(0)} emergency fund — one surprise wipes you out`
  } else if (emergencyMonths < 3 && totalSpent > 0) {
    problem = `But only ${emergencyMonths} months of emergency cover — need 6`
  } else if (savingsPct < 10 && income > 0) {
    problem = `But only ${savingsPct}% saved — ${fmtInr(totalSpent)} is going out`
  } else if (savingsPct < 20 && income > 0) {
    const gap = Math.round(income * 0.20 - savings)
    problem = `But ${fmtInr(gap)} short of the 20% savings target`
  } else if (lifestyle > income * 0.30 && income > 0) {
    problem = `But ${fmtInr(lifestyle)} on lifestyle — that's above the 30% limit`
  } else {
    // Check if any goals are off track
    const offTrack = (goalCalcs || []).filter(g => g.funded < 0.5)
    if (offTrack.length > 0) {
      problem = `But ${offTrack.length} goal${offTrack.length > 1 ? 's' : ''} still under 50% funded`
    } else if (savings > 0 && savingsPct >= 20) {
      problem = `But ${fmtInr(savings)} is sitting idle — losing value to inflation`
    } else {
      problem = null
    }
  }

  // ── Line 3: Concrete action with ₹ ───────────────────────
  let action
  if (emergencyMonths < 3 && totalSpent > 0) {
    const monthlyTarget = Math.ceil(totalSpent * 0.25)
    action = `Start saving ${fmtInr(monthlyTarget)}/month for emergencies`
  } else if (savingsPct < 20 && income > 0) {
    const gap = Math.round(income * 0.20 - savings)
    action = `Cut ${fmtInr(gap)} from spending to hit 20% savings`
  } else if (lifestyle > income * 0.30 && income > 0) {
    const cut = Math.round(lifestyle - income * 0.30)
    action = `Trim ${fmtInr(cut)} from lifestyle this month`
  } else if (savings > 0) {
    action = `Start investing ${fmtInr(savings)}/month in SIPs`
  } else {
    action = 'Set up your first savings goal'
  }

  return { positive, problem, action }
}
