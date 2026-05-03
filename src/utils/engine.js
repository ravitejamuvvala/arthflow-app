// ─── Unified Decision Engine ────────────────────────────────────────────
// Single entry point: takes all user data, returns actionable output

import { calculateMonthlyRequired, fmtInr, getMoneyFlow, getMonthlySnapshots } from './calculations'
import { generateInsights } from './insights'

// ─── Unified Score (0-100) ──────────────────────────────────────────────
// Comprehensive score using adaptive budget + insurance + debt + trend + diversification
function calculateScore({ flow, emergencyMonths, goalCalcs, budget, debtHealth, risk, trend, assetAnalysis, lifestyleCreep }) {
  if (!flow) return 50

  const savingsPct = flow.savingsPct ?? 0
  const savingsTarget = budget?.savingsTarget ?? 20
  const needsTarget = budget?.needsTarget ?? 50
  const wantsTarget = budget?.wantsTarget ?? 30

  let score = 0

  // 1. Savings vs adaptive target (25 pts)
  const savingsRatio = savingsTarget > 0 ? savingsPct / savingsTarget : 0
  if (savingsRatio >= 1) score += 25
  else if (savingsRatio >= 0.8) score += 20
  else if (savingsRatio >= 0.5) score += 12
  else if (savingsPct > 0) score += 5

  // 2. Emergency fund (20 pts)
  if (emergencyMonths >= 6) score += 20
  else if (emergencyMonths >= 3) score += 12
  else if (emergencyMonths > 0) score += 5

  // 3. Needs vs adaptive target (10 pts)
  if (flow.needsPct <= needsTarget) score += 10
  else if (flow.needsPct <= needsTarget + 10) score += 5

  // 4. Wants vs adaptive target (5 pts)
  if (flow.wantsPct <= wantsTarget) score += 5
  else if (flow.wantsPct <= wantsTarget + 10) score += 2

  // 5. Goal funding (10 pts)
  const avgFunded = goalCalcs?.length > 0
    ? goalCalcs.reduce((s, g) => s + g.funded, 0) / goalCalcs.length
    : 0
  if (avgFunded >= 0.5) score += 10
  else if (avgFunded > 0) score += 5

  // 6. Insurance coverage (10 pts)
  const hasTermIns = risk?.hasTermInsurance ?? false
  const hasHealthIns = risk?.hasHealthInsurance ?? false
  if (hasTermIns && hasHealthIns) score += 10
  else if (hasTermIns || hasHealthIns) score += 5

  // 7. Debt health (10 pts)
  const dti = debtHealth?.dtiRatio ?? 0
  if (dti === 0) score += 10
  else if (dti <= 30) score += 8
  else if (dti <= 40) score += 4

  // 8. Savings trend (5 pts)
  if (trend?.savingsTrend === 'improving') score += 5
  else if (trend?.savingsTrend === 'stable') score += 3

  // 9. Asset diversification (5 pts)
  if (assetAnalysis?.diversified) score += 5
  else if ((assetAnalysis?.assetCount ?? 0) >= 2) score += 2

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

// ─── Months until target year (month-level precision) ───────────────────
function monthsUntilYear(targetYear) {
  const now = new Date()
  return Math.max(1, (targetYear - now.getFullYear()) * 12 + (11 - now.getMonth()))
}

// ─── Horizon-based instrument recommendation ────────────────────────────
// Maps goal time-horizon → appropriate instruments, expected CAGR, risk level
function getHorizonAdvice(yearsLeft) {
  if (yearsLeft <= 1) return {
    bucket: 'short', bucketLabel: 'Short-term', tag: 'Capital Safety',
    tagColor: '#22C55E', cagr: 5, cagrRange: '4–6%', risk: 'Very low risk',
    emoji: '🔒',
    instruments: [
      { label: 'Liquid fund',                pct: 40, color: '#16A34A' },
      { label: 'FD / savings account',       pct: 40, color: '#0D9488' },
      { label: 'Ultra-short debt fund',      pct: 20, color: '#3B82F6' },
    ],
    rationale: 'Capital preservation is critical for goals < 1 year away',
  }
  if (yearsLeft <= 3) return {
    bucket: 'short', bucketLabel: 'Short-term', tag: 'Low Risk',
    tagColor: '#22C55E', cagr: 7, cagrRange: '6–8%', risk: 'Low risk',
    emoji: '🛡️',
    instruments: [
      { label: 'Short-duration debt MF',     pct: 40, color: '#16A34A' },
      { label: 'FD / RD',                    pct: 30, color: '#0D9488' },
      { label: 'Conservative hybrid MF',     pct: 20, color: '#3B82F6' },
      { label: 'Gold / sovereign gold bond', pct: 10, color: '#F59E0B' },
    ],
    rationale: 'Limited equity exposure for 1–3 year goals to protect capital',
  }
  if (yearsLeft <= 5) return {
    bucket: 'medium', bucketLabel: 'Medium-term', tag: 'Moderate',
    tagColor: '#14B8A6', cagr: 10, cagrRange: '8–11%', risk: 'Moderate risk',
    emoji: '⚖️',
    instruments: [
      { label: 'Balanced / hybrid MF',       pct: 35, color: '#3B82F6' },
      { label: 'Large-cap equity MF (SIP)',   pct: 30, color: '#6366F1' },
      { label: 'Debt / corporate bond fund', pct: 25, color: '#16A34A' },
      { label: 'Gold',                       pct: 10, color: '#F59E0B' },
    ],
    rationale: 'Balanced mix — equity for growth, debt for stability',
  }
  if (yearsLeft <= 10) return {
    bucket: 'long', bucketLabel: 'Long-term', tag: 'Growth',
    tagColor: '#6366F1', cagr: 12, cagrRange: '10–13%', risk: 'Moderate-high risk',
    emoji: '📈',
    instruments: [
      { label: 'Large-cap equity MF (SIP)',  pct: 40, color: '#3B82F6' },
      { label: 'Mid / small-cap MF (SIP)',   pct: 25, color: '#6366F1' },
      { label: 'International equity MF',    pct: 15, color: '#8B5CF6' },
      { label: 'Debt / PPF',                 pct: 10, color: '#16A34A' },
      { label: 'Gold',                       pct: 10, color: '#F59E0B' },
    ],
    rationale: '5–10 year horizon allows equity compounding with diversification',
  }
  return {
    bucket: 'vlong', bucketLabel: 'Long-term', tag: 'Aggressive Growth',
    tagColor: '#7C3AED', cagr: 13, cagrRange: '12–15%', risk: 'Higher risk',
    emoji: '🚀',
    instruments: [
      { label: 'Large-cap equity MF (SIP)',  pct: 35, color: '#3B82F6' },
      { label: 'Mid / small-cap MF (SIP)',   pct: 25, color: '#6366F1' },
      { label: 'International equity MF',    pct: 20, color: '#8B5CF6' },
      { label: 'PPF / EPF / NPS',            pct: 10, color: '#16A34A' },
      { label: 'Gold / commodity',           pct: 10, color: '#F59E0B' },
    ],
    rationale: '10+ year goals benefit from aggressive equity allocation via SIP',
  }
}

// ─── Compute SIP using a given annual CAGR ──────────────────────────────
function sipForGoal(remaining, months, annualCagr) {
  if (remaining <= 0 || months <= 0) return 0
  const r = annualCagr / 100 / 12
  return r > 0 ? Math.ceil(remaining * r / (Math.pow(1 + r, months) - 1)) : Math.ceil(remaining / months)
}

// ─── Build complete goal horizon plan ───────────────────────────────────
function buildGoalHorizonPlan(configuredGoals, monthlySavings) {
  const thisYear = new Date().getFullYear()

  // Per-goal projections with horizon advice
  const goalProjections = configuredGoals.map(g => {
    const targetYear = g.target_date ? new Date(g.target_date).getFullYear() : thisYear + 5
    const months = monthsUntilYear(targetYear)
    const yearsLeft = Math.ceil(months / 12)
    const remaining = Math.max(0, g.target_amount - g.saved_amount)
    const advice = getHorizonAdvice(yearsLeft)
    const monthlyNeeded = sipForGoal(remaining, months, advice.cagr)
    return {
      id: g.id, name: g.name, targetAmount: g.target_amount,
      savedAmount: g.saved_amount, targetYear, yearsLeft, months,
      remaining, monthlyNeeded, advice,
    }
  })

  const totalSipNeeded = goalProjections.reduce((s, g) => s + g.monthlyNeeded, 0)
  const gap = totalSipNeeded - (monthlySavings || 0)
  const fundedPct = monthlySavings > 0 ? Math.min(100, Math.round((monthlySavings / totalSipNeeded) * 100)) : 0
  const nearestGoal = goalProjections.filter(g => g.yearsLeft > 0).sort((a, b) => a.yearsLeft - b.yearsLeft)[0] || null

  // Group into horizon buckets
  const bucketDefs = [
    { key: 'short', label: 'Short-term (1–3 yrs)', emoji: '🛡️' },
    { key: 'medium', label: 'Medium-term (3–5 yrs)', emoji: '⚖️' },
    { key: 'long', label: 'Long-term (5+ yrs)', emoji: '📈' },
  ]
  const buckets = bucketDefs.map(def => {
    const goals = goalProjections.filter(gp => {
      const b = gp.advice.bucket
      if (def.key === 'short') return b === 'short'
      if (def.key === 'medium') return b === 'medium'
      return b === 'long' || b === 'vlong'
    })
    const totalSip = goals.reduce((s, g) => s + g.monthlyNeeded, 0)
    const totalRemaining = goals.reduce((s, g) => s + g.remaining, 0)
    return {
      ...def,
      goals,
      totalSip,
      totalRemaining,
      advice: goals.length > 0 ? goals[0].advice : null,
    }
  }).filter(b => b.goals.length > 0)

  return {
    goalProjections,
    totalSipNeeded,
    gap,
    fundedPct,
    funded: gap <= 0,
    nearestGoal,
    buckets,
    monthlySavings: monthlySavings || 0,
  }
}

export { getHorizonAdvice, sipForGoal }

// ─── Adaptive Budget Rule ───────────────────────────────────────────────
// Computes a personalised budget split from the user's actual financial data.
// Adjusts the base age-tier for EMI load, emergency gaps, goal urgency, etc.

function computeAdaptiveBudget({ age, income, emiAmount, emergencyMonths, nearestGoalYears, incomeType }) {
  // 1. Age-based seed (classic 50/30/20 variant)
  let needs, wants, save
  if (age < 30)      { needs = 50; wants = 20; save = 30 }
  else if (age < 45)  { needs = 50; wants = 25; save = 25 }
  else                { needs = 55; wants = 25; save = 20 }

  // 2. Adjust needs upward if EMIs already force it
  const emiPct = income > 0 ? Math.round((emiAmount / income) * 100) : 0
  if (emiPct > 0) {
    // Essentials floor = non-EMI essentials (assume at least 25%) + actual EMI %
    const essentialsFloor = 25 + emiPct
    if (essentialsFloor > needs) {
      const bump = essentialsFloor - needs
      needs = essentialsFloor
      // Compress lifestyle first, then savings
      const wantsCut = Math.min(bump, wants - 10)
      wants -= wantsCut
      save -= (bump - wantsCut)
    }
  }

  // 3. Boost savings if emergency fund is critically low
  if (emergencyMonths < 3) {
    const boost = emergencyMonths < 1 ? 10 : 5
    const available = wants - 10
    const actualBoost = Math.min(boost, available)
    if (actualBoost > 0) {
      save += actualBoost
      wants -= actualBoost
    }
  }

  // 4. Boost savings if a goal is urgent (< 3 years away)
  if (nearestGoalYears !== null && nearestGoalYears < 3) {
    const goalBoost = nearestGoalYears < 1.5 ? 5 : 3
    const available = wants - 10
    const actualBoost = Math.min(goalBoost, available)
    if (actualBoost > 0) {
      save += actualBoost
      wants -= actualBoost
    }
  }

  // 5. Variable income (freelance/business) needs more buffer
  if (incomeType && ['freelance', 'business', 'other'].includes(incomeType.toLowerCase())) {
    const buffer = 3
    const available = wants - 10
    const actualBuffer = Math.min(buffer, available)
    if (actualBuffer > 0) {
      save += actualBuffer
      wants -= actualBuffer
    }
  }

  // 6. Apply hard caps and re-balance
  needs = Math.min(65, Math.max(30, needs))
  save = Math.max(15, save)
  wants = Math.max(10, wants)
  // Normalize to 100
  const total = needs + wants + save
  if (total !== 100) {
    // Adjust wants (the flexible bucket) to make it 100
    wants = 100 - needs - save
    if (wants < 10) {
      wants = 10
      // If still over, compress needs
      needs = 100 - wants - save
    }
  }

  // 7. Pick a human-readable label + rationale
  let label, rationale
  if (emiPct > 25) {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Debt-Adjusted — EMIs raised your essentials floor'
  } else if (emergencyMonths < 3) {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Safety First — building emergency cover'
  } else if (nearestGoalYears !== null && nearestGoalYears < 3) {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Goal Sprint — near-term goal needs priority'
  } else if (age < 30) {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Wealth Builder — aggressive savings for your age'
  } else if (age < 45) {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Balanced Growth — steady saving + living well'
  } else {
    label = `${needs} / ${wants} / ${save}`
    rationale = 'Capital Preservation — protecting what you built'
  }

  return { needsTarget: needs, wantsTarget: wants, savingsTarget: save, label, rationale }
}

export function runEngine({ income, transactions, allTransactions, goals, assets, age, profile }) {
  const flow = getMoneyFlow(transactions, income, profile)

  // ─── Stable monthly expense estimate ──────────────────────
  // Use last month's actual spending (from allTransactions) for a stable estimate.
  // Falls back to profile onboarding data, then current month's partial spend.
  const prevMonthExpenses = (() => {
    if (!allTransactions || allTransactions.length === 0) return 0
    const now = new Date()
    const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const pmEnd   = new Date(now.getFullYear(), now.getMonth(), 1)
    return allTransactions
      .filter(t => t.type === 'expense' && new Date(t.date) >= pmStart && new Date(t.date) < pmEnd)
      .reduce((s, t) => s + t.amount, 0)
  })()
  const profileExpenses = (profile?.expenses_essentials || 0) + (profile?.expenses_lifestyle || 0) + (profile?.expenses_emis || 0)
  const monthlyExpenses = prevMonthExpenses || profileExpenses || flow.totalSpent || 0

  // Emergency fund calculation
  const liquidCash = assets?.liquidCash || 0
  const emergencyMonths = monthlyExpenses > 0 ? +(liquidCash / monthlyExpenses).toFixed(1) : 0
  const emergencyTarget = monthlyExpenses * 6
  const emergencyGap = Math.max(0, emergencyTarget - liquidCash)

  // Goal funding average (skip goals with no target set)
  const configuredGoals = goals.filter(g => g.target_amount > 0)
  const goalCalcs = configuredGoals.map(g => calculateMonthlyRequired(g))
  const avgGoalFunded = goalCalcs.length > 0 ? goalCalcs.reduce((s, c) => s + c.funded, 0) / goalCalcs.length : 0

  // Score computed AFTER all sub-computations (see below)

  // Insights — deferred until after budget is computed (see below)

  // ─── Investment allocation (age-based, emergency-first) ──
  const equityPct = Math.min(80, 100 - (age || 25))
  const debtPct = 100 - equityPct
  // Prioritise emergency fund: set aside up to 50% of savings or 1/6th of gap
  const emergencyContribution = emergencyGap > 0 && flow.savings > 0
    ? Math.round(Math.min(flow.savings * 0.5, emergencyGap / 6))
    : 0
  const investableSurplus = Math.max(0, flow.savings - emergencyContribution)
  const suggestedSip = Math.round(investableSurplus * 0.6)
  const investment = {
    equityPct,
    debtPct,
    suggestedSip,
    emergencyContribution,
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
  const yearsToRetirement = Math.max(1, 60 - (age || 25))
  const emiOutstanding = (flow.catTotals?.emis ?? 0) * 60 // Conservative 5-year liability estimate

  // Needs-based term insurance: income replacement + outstanding liabilities − existing assets
  const termInsuranceNeeded = Math.max(0,
    annualIncome * yearsToRetirement + emiOutstanding - netWorth
  )

  // Health insurance: honest benchmark ranges (cannot personalize without health/city/family data)
  const healthInsuranceRange = age < 35
    ? { min: 500000, max: 1500000, label: '₹5-15L' }
    : age < 50
    ? { min: 1000000, max: 2500000, label: '₹10-25L' }
    : { min: 1500000, max: 5000000, label: '₹15-50L' }

  const risk = {
    emergencyMonths,
    emergencyTarget,
    emergencyGap,
    termInsuranceNeeded,
    termConfidence: 'estimated', // Uses income, liabilities, assets — but not dependents/existing cover
    termBreakdown: {
      incomeReplacement: annualIncome * yearsToRetirement,
      liabilities: emiOutstanding,
      existingAssets: netWorth,
    },
    healthInsuranceRange,
    healthConfidence: 'benchmark', // Industry norms by age — no health/city/family data
    hasTermInsurance: !!assets?.hasTermInsurance,
    termCoverAmount: Number(assets?.termCoverAmount) || 0,
    hasHealthInsurance: !!assets?.hasHealthInsurance,
    healthCoverAmount: Number(assets?.healthCoverAmount) || 0,
    // Legacy — true if either insurance is present
    hasInsurance: !!(assets?.hasTermInsurance || assets?.hasHealthInsurance || assets?.hasInsurance),
    riskLevel: emergencyMonths >= 6 ? 'low' : emergencyMonths >= 3 ? 'medium' : 'high',
  }

  // ─── Trend analysis (last 3 months) ───────────────────────
  const snapshots = getMonthlySnapshots(allTransactions || transactions, flow.income)
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

  // ─── Debt-to-Income Ratio ─────────────────────────────────
  const emiTotal = flow.catTotals?.emis ?? 0
  const dtiRatio = flow.income > 0 ? Math.round((emiTotal / flow.income) * 100) : 0
  const debtHealth = {
    dtiRatio,
    emiAmount: emiTotal,
    status: dtiRatio <= 30 ? 'healthy' : dtiRatio <= 40 ? 'caution' : 'danger',
    // Banks typically reject new loans above 50% DTI
    canTakeMoreDebt: dtiRatio < 40,
    headroom: flow.income > 0 ? Math.max(0, Math.round(flow.income * 0.40 - emiTotal)) : 0,
  }

  // ─── Total Savings Runway (worst-case resilience) ─────────
  const totalLiquidAssets = (Number(assets?.liquidCash) || 0) + (Number(assets?.mutualFunds) || 0) + (Number(assets?.stocks) || 0)
  const totalRunwayMonths = monthlyExpenses > 0 ? +(totalLiquidAssets / monthlyExpenses).toFixed(1) : 0
  const runway = {
    liquidOnlyMonths: emergencyMonths,
    totalMonths: totalRunwayMonths,
    totalLiquidAssets,
    status: totalRunwayMonths >= 12 ? 'strong' : totalRunwayMonths >= 6 ? 'adequate' : 'fragile',
  }

  // ─── Lifestyle Creep Detection ────────────────────────────
  let lifestyleCreep = { detected: false, message: null, pctChange: 0 }
  if (recentSnapshots.length >= 2) {
    // Check if lifestyle spending grew while income stayed flat
    const lifestyleNow = flow.catTotals?.lifestyle ?? 0
    const incomeFirst = recentSnapshots[0].income || 0
    const incomeLast = recentSnapshots[recentSnapshots.length - 1].income || 0
    const incomeGrowth = incomeFirst > 0 ? ((incomeLast - incomeFirst) / incomeFirst) * 100 : 0
    // Approximate prior lifestyle from spent ratio — use the oldest snapshot's spending pattern
    const spentFirst = recentSnapshots[0].spent || 0
    const spentLast = recentSnapshots[recentSnapshots.length - 1].spent || 0
    const spendingGrowth = spentFirst > 0 ? ((spentLast - spentFirst) / spentFirst) * 100 : 0
    // Creep = spending grew significantly more than income
    if (spendingGrowth > 10 && spendingGrowth > incomeGrowth + 5) {
      lifestyleCreep = {
        detected: true,
        message: `Spending up ${Math.round(spendingGrowth)}% while income ${incomeGrowth > 2 ? `only grew ${Math.round(incomeGrowth)}%` : 'stayed flat'}`,
        pctChange: Math.round(spendingGrowth),
      }
    }
  }

  // ─── Goal Horizon Plan ─────────────────────────────────────
  const goalHorizonPlan = buildGoalHorizonPlan(configuredGoals, flow.savings)

  // ─── Adaptive Budget ──────────────────────────────────────
  const nearestGoalYears = goalHorizonPlan?.nearestGoal?.yearsLeft ?? null
  const budget = computeAdaptiveBudget({
    age: age || 25,
    income: flow.income,
    emiAmount: debtHealth.emiAmount,
    emergencyMonths,
    nearestGoalYears,
    incomeType: profile?.income_type,
  })

  // Insights (after budget so thresholds are adaptive)
  const allInsights = generateInsights({ flow, goals, profile, assets, emergencyMonths, goalCalcs, budget })
  const topInsights = allInsights.slice(0, 2)
  const topProblem = topInsights[0]?.type !== 'positive' ? topInsights[0]?.title : null
  const action = topInsights[0]?.action || null

  // ─── Unified Score (0-100) — computed after all signals ───
  const score = calculateScore({ flow, emergencyMonths, goalCalcs, budget, debtHealth, risk, trend, assetAnalysis, lifestyleCreep })
  const scoreLabel = getScoreLabel(score)
  const statusFromScore = getStatusFromScore(score)

  // ─── Status message — general health summary (not top problem) ─
  const savingsTarget = budget?.savingsTarget ?? 20
  const savingsPct = flow.savingsPct ?? 0
  let statusMessage
  if (!flow.income || flow.income === 0) {
    statusMessage = 'Add income to see your financial health.'
  } else if (score >= 80) {
    statusMessage = `Saving ${savingsPct}% — above ${savingsTarget}% target. Great job!`
  } else if (score >= 60) {
    const parts = []
    if (savingsPct >= savingsTarget) parts.push(`Saving ${savingsPct}% ✓`)
    else parts.push(`Saving ${savingsPct}% — target ${savingsTarget}%`)
    if (!risk?.hasTermInsurance || !risk?.hasHealthInsurance) parts.push('insurance gaps')
    statusMessage = parts.join(', ')
  } else if (score >= 40) {
    const gaps = []
    if (savingsPct < savingsTarget) gaps.push(`savings at ${savingsPct}% vs ${savingsTarget}%`)
    if (emergencyMonths < 3) gaps.push('low emergency cover')
    if (debtHealth?.dtiRatio > 40) gaps.push('high debt load')
    statusMessage = gaps.length > 0 ? `Focus areas: ${gaps.join(', ')}` : 'A few tweaks will get you on track.'
  } else {
    statusMessage = 'Multiple areas need attention — start with the top action below.'
  }

  return {
    flow,
    score,
    scoreLabel,
    status: { ...statusFromScore, message: statusMessage },
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
    debtHealth,
    runway,
    lifestyleCreep,
    goalHorizonPlan,
    budget,
  }
}

// ─── Top Action Determiner ──────────────────────────────────────────────
// Returns the single most important action the user should take right now.
// Priority: protect → stabilize → grow (financial planning pyramid)

export function getTopAction(engineResult, age = 25) {
  if (!engineResult) return null
  const {
    flow, emergencyMonths, debtHealth,
    goalHorizonPlan, risk,
  } = engineResult
  const savingsPct = flow?.savingsPct ?? 0
  const monthlyExpenses = flow?.totalSpent ?? 0
  const income = flow?.income ?? 0
  const savings = flow?.savings ?? 0
  const budget = engineResult.budget
  const savingsTarget = budget.savingsTarget

  // ── P1: Debt crisis (DTI > 40%) ──────────────────────────────
  if (debtHealth && debtHealth.status === 'danger' && income > 0) {
    const emiAmt = debtHealth.emiAmount
    const dti = debtHealth.dtiRatio
    const targetEmi = Math.round(income * 0.30)
    const reduceBy = Math.max(0, emiAmt - targetEmi)
    return {
      key: 'debt',
      severity: 'urgent',
      title: 'Reduce Your Debt Load',
      subtitle: `EMIs are ${dti}% of income — danger zone (>40%)`,
      impact: `Reducing EMIs by ${fmtInr(reduceBy)}/mo brings you to a safe 30%`,
      outcome: `Frees up ${fmtInr(reduceBy)}/mo for savings & goals`,
      confidence: `Based on ${fmtInr(emiAmt)}/mo in EMIs vs ${fmtInr(income)} income`,
      ctaLabel: `Cut ${fmtInr(reduceBy)}/mo in EMIs`,
      ctaAmount: reduceBy,
    }
  }

  // ── P2: Term life insurance (age ≥ 25, has income, no cover) ─
  if (!risk?.hasTermInsurance && age >= 25 && income > 0) {
    const coverNeeded = risk?.termInsuranceNeeded ?? Math.round(income * 12 * 15)
    const coverLabel = coverNeeded >= 10000000 ? `${Math.round(coverNeeded / 10000000)}Cr`
      : coverNeeded >= 100000 ? `${Math.round(coverNeeded / 100000)}L` : fmtInr(coverNeeded)
    // Approximate premium: ₹600-800/mo per ₹1Cr for age 25-35
    const approxPremium = Math.round((coverNeeded / 10000000) * 700)
    return {
      key: 'term_insurance',
      severity: 'urgent',
      title: 'Get Term Life Insurance',
      subtitle: `No term cover — your family has zero income protection`,
      impact: `A ₹${coverLabel} cover costs only ~${fmtInr(approxPremium)}/mo at age ${age}`,
      outcome: `Protects ${Math.round(coverNeeded / (income * 12))} years of income for your family`,
      confidence: `Estimated from your income, liabilities & assets`,
      ctaLabel: `Get ₹${coverLabel} cover`,
      ctaAmount: approxPremium,
    }
  }

  // ── P3: Health insurance (age ≥ 22, has income, no cover) ────
  if (!risk?.hasHealthInsurance && age >= 22 && income > 0) {
    const range = risk?.healthInsuranceRange ?? { label: '₹5-15L' }
    return {
      key: 'health_insurance',
      severity: 'urgent',
      title: 'Get Health Insurance',
      subtitle: `No health cover — one hospitalisation can wipe out savings`,
      impact: `A ${range.label} family floater costs ₹500-1,500/mo at age ${age}`,
      outcome: `Protects your emergency fund & savings from medical bills`,
      confidence: `Benchmark range for age ${age} — consult an advisor for exact cover`,
      ctaLabel: `Get ${range.label} cover`,
      ctaAmount: 1000,
    }
  }

  // ── P4: Emergency fund < 3 months ────────────────────────────
  if (emergencyMonths < 3 && monthlyExpenses > 0) {
    const targetMonths = 6
    const monthlyTarget = Math.ceil(monthlyExpenses * 0.25)
    const needed = Math.max(0, (targetMonths - emergencyMonths) * monthlyExpenses)
    const monthsToTarget = monthlyTarget > 0 ? Math.ceil(needed / monthlyTarget) : 0
    const coverText = emergencyMonths === 0
      ? 'You have 0 months of expenses covered'
      : `Only ${emergencyMonths} month${emergencyMonths !== 1 ? 's' : ''} of expenses covered`
    return {
      key: 'emergency',
      severity: 'urgent',
      title: 'Build Emergency Fund',
      subtitle: coverText,
      impact: `Set aside ${fmtInr(monthlyTarget)}/mo in a liquid fund`,
      outcome: monthsToTarget > 0
        ? `You'll reach 6-month safety net in ${monthsToTarget} months`
        : `You'll have full emergency cover`,
      confidence: `Based on ${fmtInr(monthlyExpenses)}/mo expenses`,
      ctaLabel: `Start ${fmtInr(monthlyTarget)}/mo`,
      ctaAmount: monthlyTarget,
    }
  }

  // ── P5: Savings below target ─────────────────────────────────
  if (savingsPct < savingsTarget && income > 0) {
    const gap = Math.round(income * savingsTarget / 100 - savings)
    const yearlyExtra = gap * 12
    const lifestyle = flow?.catTotals?.lifestyle ?? 0
    const lifestylePct = income > 0 ? Math.round((lifestyle / income) * 100) : 0
    const wantsTarget = budget.wantsTarget ?? 30
    const lifestyleOver = lifestylePct > wantsTarget
    const hint = lifestyleOver
      ? `Lifestyle spending is ${lifestylePct}% (target ${wantsTarget}%) — start there`
      : `Review your top 2-3 expenses for quick wins`
    return {
      key: 'savings',
      severity: savingsPct < 10 ? 'urgent' : 'warning',
      title: 'Boost Your Savings Rate',
      subtitle: `Saving ${savingsPct}% — target is ${savingsTarget}% for your age`,
      impact: `${hint}`,
      outcome: `Finding ${fmtInr(gap)}/mo more = ${fmtInr(yearlyExtra)} extra per year`,
      confidence: `Based on your ${budget.label} budget rule`,
      ctaLabel: `Save ${fmtInr(gap)} more/mo`,
      ctaAmount: gap,
    }
  }

  // ── P6: SIP gap — nearest goal focus ─────────────────────────
  if (goalHorizonPlan && !goalHorizonPlan.funded && goalHorizonPlan.totalSipNeeded > 0) {
    const { totalSipNeeded, gap, fundedPct, nearestGoal } = goalHorizonPlan
    if (nearestGoal) {
      const adv = nearestGoal.advice
      const instrumentHint = adv?.instruments?.[0]?.label ?? 'SIP'
      return {
        key: 'sip_gap',
        severity: fundedPct < 50 ? 'urgent' : 'warning',
        title: `Fund "${nearestGoal.name}"`,
        subtitle: `${nearestGoal.yearsLeft}y away — needs ${fmtInr(nearestGoal.monthlyNeeded)}/mo via ${instrumentHint}`,
        impact: `Total SIP gap: ${fmtInr(gap)}/mo across all goals`,
        outcome: `${adv?.tag ?? 'Matched'} strategy · ${adv?.cagrRange ?? ''} expected CAGR`,
        confidence: `Based on ${nearestGoal.yearsLeft}-year horizon & ${adv?.risk ?? 'matched'} instruments`,
        ctaLabel: `Start ${fmtInr(nearestGoal.monthlyNeeded)}/mo`,
        ctaAmount: nearestGoal.monthlyNeeded,
      }
    }
    return {
      key: 'sip_gap',
      severity: fundedPct < 50 ? 'urgent' : 'warning',
      title: 'Close Your SIP Gap',
      subtitle: `Goals need ${fmtInr(totalSipNeeded)}/mo — you save ${fmtInr(goalHorizonPlan.monthlySavings)}/mo`,
      impact: `${fmtInr(gap)}/mo gap — start with the nearest-deadline goal`,
      outcome: 'Head to the Plan tab for per-goal instrument breakdown',
      confidence: 'Based on goal timelines & horizon-matched returns',
      ctaLabel: `Bridge ${fmtInr(gap)}/mo`,
      ctaAmount: gap,
    }
  }

  // ── P7: All good — invest surplus with goal context ──────────
  const surplus = savings
  if (goalHorizonPlan && goalHorizonPlan.funded && goalHorizonPlan.totalSipNeeded > 0) {
    const extraSurplus = Math.max(0, surplus - goalHorizonPlan.totalSipNeeded)
    const yearlyGrowth = Math.round(extraSurplus * 12 * 0.12)
    return {
      key: 'invest_surplus',
      severity: 'good',
      title: 'Grow Your Wealth',
      subtitle: `All goals funded! ${fmtInr(extraSurplus)}/mo surplus after SIPs`,
      impact: 'Redirect surplus into long-term wealth building',
      outcome: yearlyGrowth > 0
        ? `Could compound to ${fmtInr(yearlyGrowth)} extra in year 1`
        : 'Start a wealth SIP for long-term compounding',
      confidence: 'All goals on track — surplus verified from your data',
      ctaLabel: extraSurplus > 0 ? `Invest ${fmtInr(extraSurplus)}/mo` : 'Start Wealth SIP',
      ctaAmount: extraSurplus,
    }
  }

  // Fallback — no goals set
  const yearlyCompound = Math.round(surplus * 12 * 0.10)
  return {
    key: 'invest',
    severity: 'good',
    title: surplus > 0 ? 'Put Your Savings to Work' : 'Set Up Your Goals',
    subtitle: surplus > 0
      ? `${fmtInr(surplus)}/mo is sitting idle — make it grow`
      : 'Add your financial goals to get personalised guidance',
    impact: surplus > 0
      ? 'Even a small SIP compounds significantly over time'
      : 'Goals help ArthFlow calculate exactly how much to invest',
    outcome: surplus > 0 && yearlyCompound > 0
      ? `${fmtInr(surplus)}/mo at ~10% could grow by ${fmtInr(yearlyCompound)} in year 1`
      : 'Head to the Plan tab to add your first goal',
    confidence: surplus > 0 ? 'Based on your monthly surplus' : '',
    ctaLabel: surplus > 0 ? `Start ${fmtInr(surplus)}/mo SIP` : 'Set Goals →',
    ctaAmount: surplus,
  }
}

// ─── Money Story (3-line narrative) ─────────────────────────────────────
// Returns { positive, problem, action } — each a human-readable line with ₹ amounts

export function getMoneyStory(engineResult, age = 25) {
  const { flow, emergencyMonths, goalCalcs, allInsights } = engineResult
  const income = flow?.income ?? 0
  const savings = flow?.savings ?? 0
  const savingsPct = flow?.savingsPct ?? 0
  const totalSpent = flow?.totalSpent ?? 0
  const lifestyle = flow?.catTotals?.lifestyle ?? 0
  const budget = engineResult.budget
  const savingsTarget = budget.savingsTarget
  const wantsTarget = budget.wantsTarget

  // ── Line 1: Positive insight ──────────────────────────────
  let positive
  if (savingsPct >= savingsTarget) {
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
  } else if (savingsPct < savingsTarget && income > 0) {
    const gap = Math.round(income * savingsTarget / 100 - savings)
    problem = `But ${fmtInr(gap)} short of the ${savingsTarget}% savings target`
  } else if (lifestyle > income * wantsTarget / 100 && income > 0) {
    problem = `But ${fmtInr(lifestyle)} on lifestyle — that's above the ${wantsTarget}% limit`
  } else {
    // Check if any goals are off track
    const offTrack = (goalCalcs || []).filter(g => g.funded < 0.5)
    if (offTrack.length > 0) {
      problem = `But ${offTrack.length} goal${offTrack.length > 1 ? 's' : ''} still under 50% funded`
    } else if (savings > 0 && savingsPct >= savingsTarget) {
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
  } else if (savingsPct < savingsTarget && income > 0) {
    const gap = Math.round(income * savingsTarget / 100 - savings)
    action = `Cut ${fmtInr(gap)} from spending to hit ${savingsTarget}% savings`
  } else if (lifestyle > income * wantsTarget / 100 && income > 0) {
    const cut = Math.round(lifestyle - income * wantsTarget / 100)
    action = `Trim ${fmtInr(cut)} from lifestyle this month`
  } else if (savings > 0) {
    action = `Start investing ${fmtInr(savings)}/month in SIPs`
  } else {
    action = 'Set up your first savings goal'
  }

  return { positive, problem, action }
}
