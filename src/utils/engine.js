// ─── Unified Decision Engine ────────────────────────────────────────────
// Single entry point: takes all user data, returns actionable output

import { calculateMonthlyRequired, fmtInr, getMoneyFlow, getMonthlySnapshots } from './calculations'
import { generateInsights } from './insights'

// ─── Unified Score (0-100) ──────────────────────────────────────────────
function calculateScore(flow, emergencyMonths, goalCalcs) {
  if (!flow) return 50
  let score = 25

  const savingsPct = flow.savingsPct ?? 0
  if (savingsPct >= 30) score += 25
  else if (savingsPct >= 20) score += 20
  else if (savingsPct >= 10) score += 10
  else if (savingsPct > 0) score += 5

  if (emergencyMonths >= 6) score += 20
  else if (emergencyMonths >= 3) score += 10
  else if (emergencyMonths > 0) score += 5

  if (flow.needsPct <= 50) score += 10
  if (flow.wantsPct <= 30) score += 5

  const avgFunded = goalCalcs?.length > 0
    ? goalCalcs.reduce((s, g) => s + g.funded, 0) / goalCalcs.length
    : 0
  if (avgFunded >= 0.5) score += 10
  else if (avgFunded > 0) score += 5

  return Math.min(100, score)
}

function getScoreLabel(score) {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs Work'
}

function getStatusFromScore(score) {
  if (score >= 70) return { status: 'on track', emoji: '🟢', color: '#22C55E' }
  if (score >= 45) return { status: 'slightly off track', emoji: '🟡', color: '#F59E0B' }
  return { status: 'needs attention', emoji: '🔴', color: '#EF4444' }
}

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

  // Unified score (0-100) — single source of truth
  const score = calculateScore(flow, emergencyMonths, goalCalcs)
  const scoreLabel = getScoreLabel(score)
  const statusFromScore = getStatusFromScore(score)

  // Insights (top 2 only)
  const allInsights = generateInsights({ transactions, goals, profile, assets })
  const topInsights = allInsights.slice(0, 2)

  // Top problem + action
  const topProblem = topInsights[0]?.type !== 'positive' ? topInsights[0]?.title : null
  const action = topInsights[0]?.action || null

  // ─── Investment allocation (age-based) ────────────────────
  const equityPct = Math.min(80, 100 - (age || 25))
  const debtPct = 100 - equityPct
  const suggestedSip = flow.savings > 0 ? Math.round(flow.savings * 0.6) : 0
  const investment = {
    equityPct,
    debtPct,
    suggestedSip,
    allocation: {
      largeCap: Math.round(suggestedSip * 0.60),
      midSmallCap: Math.round(suggestedSip * 0.25),
      international: Math.round(suggestedSip * 0.15),
    },
  }

  // ─── Asset diversification analysis ───────────────────────
  const assetValues = {
    liquidCash: Number(assets?.liquidCash) || 0,
    mutualFunds: Number(assets?.mutualFunds) || 0,
    stocks: Number(assets?.stocks) || 0,
    epf: Number(assets?.epf) || 0,
    ppf: Number(assets?.ppf) || 0,
    gold: Number(assets?.gold) || 0,
    realEstate: Number(assets?.realEstate) || 0,
    other: Number(assets?.other) || 0,
  }
  const netWorth = Object.values(assetValues).reduce((s, v) => s + v, 0)
  const assetPcts = {}
  let dominantAsset = { name: 'none', pct: 0 }
  for (const [key, val] of Object.entries(assetValues)) {
    const pct = netWorth > 0 ? Math.round((val / netWorth) * 100) : 0
    assetPcts[key] = pct
    if (pct > dominantAsset.pct) dominantAsset = { name: key, pct }
  }
  const nonZeroAssets = Object.values(assetValues).filter(v => v > 0).length
  const assetAnalysis = {
    netWorth,
    breakdown: assetPcts,
    dominantAsset,
    diversified: nonZeroAssets >= 3 && dominantAsset.pct <= 40,
    concentrationRisk: dominantAsset.pct > 40,
    assetCount: nonZeroAssets,
  }

  // ─── Risk assessment ──────────────────────────────────────
  const annualIncome = (flow.income || profile?.monthly_income || 0) * 12
  const termInsuranceNeeded = annualIncome * 15
  const healthInsuranceNeeded = age < 35 ? 1000000 : age < 50 ? 2500000 : 5000000 // ₹10L / ₹25L / ₹50L
  const risk = {
    emergencyMonths,
    emergencyTarget: monthlyExpenses * 6,
    emergencyGap: Math.max(0, monthlyExpenses * 6 - liquidCash),
    termInsuranceNeeded,
    healthInsuranceNeeded,
    hasInsurance: !!assets?.hasInsurance,
    riskLevel: emergencyMonths >= 6 && score >= 60 ? 'low' : emergencyMonths >= 3 ? 'medium' : 'high',
  }

  // ─── Trend analysis (last 3 months) ───────────────────────
  const snapshots = getMonthlySnapshots(transactions, flow.income)
  const recentSnapshots = snapshots.slice(-3)
  let savingsTrend = 'stable'
  if (recentSnapshots.length >= 2) {
    const pcts = recentSnapshots.map(s => s.savedPct)
    const first = pcts[0]
    const last = pcts[pcts.length - 1]
    if (last - first >= 5) savingsTrend = 'improving'
    else if (first - last >= 5) savingsTrend = 'declining'
  }
  let spendingTrend = 'stable'
  if (recentSnapshots.length >= 2) {
    const spentVals = recentSnapshots.map(s => s.spent)
    const first = spentVals[0]
    const last = spentVals[spentVals.length - 1]
    if (last > first * 1.10) spendingTrend = 'increasing'
    else if (last < first * 0.90) spendingTrend = 'decreasing'
  }
  const trend = {
    snapshots: recentSnapshots,
    savingsTrend,
    spendingTrend,
    monthsTracked: snapshots.length,
  }

  return {
    flow,
    score,
    scoreLabel,
    status: { ...statusFromScore, message: topProblem || (score >= 70 ? 'Looking good — keep it up!' : 'A few tweaks will get you on track.') },
    topProblem,
    action,
    insights: topInsights,
    allInsights,
    emergencyMonths,
    goalCalcs,
    avgGoalFunded,
    investment,
    assetAnalysis,
    risk,
    trend,
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
    const needed = Math.max(0, (targetMonths - emergencyMonths) * monthlyExpenses)
    const monthsToTarget = monthlyTarget > 0 ? Math.ceil(needed / monthlyTarget) : 0
    const coverText = emergencyMonths === 0
      ? 'You have 0 months covered'
      : `You have ${emergencyMonths} month${emergencyMonths !== 1 ? 's' : ''} covered`
    return {
      key: 'emergency',
      severity: 'urgent',
      title: 'Build Emergency Fund',
      subtitle: coverText,
      impact: 'This stabilizes your finances in 6 months',
      outcome: monthsToTarget > 0
        ? `You'll reach 6-month safety in ${monthsToTarget} months`
        : `You'll have full emergency cover`,
      confidence: 'Based on your income & monthly expenses',
      ctaLabel: `Start ${fmtInr(monthlyTarget)}/month`,
      ctaAmount: monthlyTarget,
    }
  }

  // Priority 2: Savings < 20%
  if (savingsPct < 20 && income > 0) {
    const gap = Math.round(income * 0.20 - flow.savings)
    const yearlyExtra = gap * 12
    return {
      key: 'savings',
      severity: savingsPct < 10 ? 'urgent' : 'warning',
      title: 'Boost Your Savings',
      subtitle: `Currently saving ${savingsPct}% — target is 20%`,
      impact: `Finding ${fmtInr(gap)} more per month changes everything`,
      outcome: `That's ${fmtInr(yearlyExtra)} more saved per year`,
      confidence: 'Based on your 50-30-20 budget split',
      ctaLabel: `Save ${fmtInr(gap)} more`,
      ctaAmount: gap,
    }
  }

  // Priority 3: Goals off track
  const offTrack = (goalCalcs || []).filter(g => g.funded < 0.5 && g.monthlyNeeded > 0)
  if (offTrack.length > 0) {
    const worst = offTrack.sort((a, b) => a.funded - b.funded)[0]
    const monthsSaved = worst.monthlyNeeded > 0 && worst.remaining > 0
      ? Math.round(worst.remaining / worst.monthlyNeeded)
      : 0
    return {
      key: 'goals',
      severity: 'warning',
      title: 'Get Goals Back on Track',
      subtitle: `${offTrack.length} goal${offTrack.length > 1 ? 's' : ''} under 50% funded`,
      impact: `Allocating ${fmtInr(worst.monthlyNeeded)}/month closes the gap`,
      outcome: monthsSaved > 0
        ? `Your goal can be fully funded in ${monthsSaved} months`
        : `Gets your goals back on track`,
      confidence: 'Based on your goal targets & timeline',
      ctaLabel: `Boost by ${fmtInr(worst.monthlyNeeded)}/month`,
      ctaAmount: worst.monthlyNeeded,
    }
  }

  // Priority 4: Everything good — invest surplus
  const surplus = flow?.savings ?? 0
  const yearlyCompound = Math.round(surplus * 12 * 0.12) // rough 12% annual return
  return {
    key: 'invest',
    severity: 'good',
    title: 'Invest Your Surplus',
    subtitle: `You have ${fmtInr(surplus)} available this month`,
    impact: 'Put your money to work — even small SIPs compound fast',
    outcome: yearlyCompound > 0
      ? `Could grow by ${fmtInr(yearlyCompound)} in the first year`
      : 'Start a SIP and watch your wealth compound',
    confidence: 'Based on your monthly surplus',
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
