// ─── Structured Report Generator ────────────────────────────────────────
// Builds app report structure + download report text from engine output

import { fmtInr } from './calculations'

// ═══════════════════════════════════════════════════════════════════════
// A. Build structured app report from engine + AI data
// ═══════════════════════════════════════════════════════════════════════

export function buildAppReport(engineResult, aiReport) {
  if (!engineResult) return null
  const { flow, emergencyMonths, goalCalcs, allInsights, status } = engineResult

  // Use engine's unified score — AI can override if present
  const score = aiReport?.score ?? engineResult.score ?? 50
  const scoreLabel = aiReport?.scoreLabel ?? engineResult.scoreLabel ?? getScoreLabel(score)
  const summary = aiReport?.summary ?? buildLocalSummary(engineResult)

  // Top Problems (max 3)
  const top_problems = (allInsights || [])
    .filter(i => i.type !== 'positive')
    .slice(0, 3)
    .map(i => ({
      title: i.title,
      impact: i.message,
      severity: i.priority <= 1 ? 'high' : i.priority <= 2 ? 'medium' : 'low',
    }))

  // Action Plan (max 5)
  const action_plan = buildActionPlan(engineResult)

  // Quick Summary bullets
  const quick_summary = buildQuickSummary(engineResult)

  // Collapsible sections: use AI sections (exclude health/actions which are shown separately)
  const allSections = aiReport?.sections || []
  const collapsible_sections = allSections.filter(s =>
    ['spending', 'goals', 'investment', 'assets', 'trends'].includes(s.id)
  )

  return {
    score,
    scoreLabel,
    summary,
    top_problems,
    action_plan,
    quick_summary,
    collapsible_sections,
    protectionChecklist: aiReport?.protectionChecklist || [],
  }
}

// getScoreLabel — fallback if engine doesn't provide one
function getScoreLabel(score) {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs Work'
}

function buildLocalSummary(engineResult) {
  if (!engineResult?.flow) return 'Add transactions to see your financial summary.'
  const { flow, emergencyMonths } = engineResult
  const parts = []
  if (flow.savingsPct >= 20) parts.push(`Saving ${flow.savingsPct}% of income`)
  else if (flow.income > 0) parts.push(`Saving ${flow.savingsPct}% — below the 20% target`)
  if (emergencyMonths < 3) parts.push('emergency fund needs attention')
  else parts.push(`${emergencyMonths} months of emergency cover`)
  return parts.join(', ') + '.'
}

function buildActionPlan(engineResult) {
  if (!engineResult?.flow) return []
  const { flow, emergencyMonths, goalCalcs, risk } = engineResult
  const plan = []
  let step = 1

  if (emergencyMonths < 6 && flow.totalSpent > 0) {
    const amt = Math.ceil(flow.totalSpent * 0.25)
    const gap = risk?.emergencyGap ?? Math.max(0, flow.totalSpent * 6 - (flow.totalSpent * emergencyMonths))
    const monthsToFull = amt > 0 ? Math.ceil(gap / amt) : 0
    plan.push({
      step: step++,
      title: `Save ${fmtInr(amt)}/month`,
      description: 'Into a highly liquid instrument for your emergency safety net',
      outcome: monthsToFull > 0 ? `Emergency fund covered in ${monthsToFull} months` : 'Full 6-month safety net achieved',
      monthly_amount: amt,
      priority: emergencyMonths < 3 ? 'high' : 'medium',
    })
  }

  if (flow.savingsPct < 20 && flow.income > 0) {
    const gap = Math.round(flow.income * 0.20 - flow.savings)
    const yearlyExtra = gap * 12
    plan.push({
      step: step++,
      title: `Find ${fmtInr(gap)} more to save`,
      description: 'Trim lifestyle & subscriptions to hit the 20% benchmark',
      outcome: `That's ${fmtInr(yearlyExtra)} extra saved per year`,
      monthly_amount: gap,
      priority: flow.savingsPct < 10 ? 'high' : 'medium',
    })
  }

  if (flow.wantsPct > 30 && flow.income > 0) {
    const excess = Math.round(flow.catTotals.lifestyle - flow.income * 0.30)
    plan.push({
      step: step++,
      title: `Reduce lifestyle by ${fmtInr(excess)}`,
      description: 'Dining, shopping & subscriptions are above the 30% limit',
      outcome: `Frees up ${fmtInr(excess)}/month for savings or investments`,
      monthly_amount: excess,
      priority: 'medium',
    })
  }

  const underfunded = (goalCalcs || []).filter(g => g.funded < 0.5 && g.monthlyNeeded > 0)
  if (underfunded.length > 0) {
    const total = underfunded.reduce((s, g) => s + g.monthlyNeeded, 0)
    const worstName = underfunded.sort((a, b) => a.funded - b.funded)[0]?.goalName || 'your goals'
    plan.push({
      step: step++,
      title: `Allocate ${fmtInr(total)}/month to goals`,
      description: `${underfunded.length} goal${underfunded.length > 1 ? 's' : ''} under 50% funded`,
      outcome: `Gets ${worstName} back on track`,
      monthly_amount: total,
      priority: 'medium',
    })
  }

  if (flow.savingsPct >= 20 && flow.savings > 0) {
    const sipAmt = Math.round(flow.savings * 0.6)
    const yearGrowth = Math.round(sipAmt * 12 * 0.12)
    plan.push({
      step: step++,
      title: `Invest ${fmtInr(sipAmt)}/month`,
      description: 'Put your surplus to work via systematic investments',
      outcome: `Could grow by ~${fmtInr(yearGrowth)} in the first year`,
      monthly_amount: sipAmt,
      priority: 'low',
    })
  }

  return plan.slice(0, 5)
}

function buildQuickSummary(engineResult) {
  if (!engineResult?.flow) return ['No data yet — add transactions']
  const { flow, emergencyMonths } = engineResult
  return [
    `Savings: ${flow.savingsPct}% of income (${fmtInr(flow.savings)}/month)`,
    `Emergency fund: ${emergencyMonths} months covered`,
    `Spending: ${flow.income > 0 ? Math.round((flow.totalSpent / flow.income) * 100) : 0}% of income (${fmtInr(flow.totalSpent)})`,
    `Needs: ${flow.needsPct}% | Wants: ${flow.wantsPct}%`,
  ]
}

// ═══════════════════════════════════════════════════════════════════════
// B. Generate downloadable report (plain text)
// ═══════════════════════════════════════════════════════════════════════

export function generateDownloadReport({ engineResult, profile, goals, assets, transactions, aiReport }) {
  const monthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
  const flow = engineResult?.flow
  const emergencyMonths = engineResult?.emergencyMonths ?? 0
  const goalCalcs = engineResult?.goalCalcs ?? []
  const appReport = buildAppReport(engineResult, aiReport)
  const income = flow?.income ?? 0
  const name = profile?.full_name || 'User'
  const age = profile?.age ?? 0
  const divider = '─'.repeat(50)
  const doubleDivider = '═'.repeat(50)

  const lines = []
  const add = (...args) => args.forEach(l => lines.push(l))
  const blank = () => lines.push('')

  add(doubleDivider)
  add(`  ARTHFLOW — Personal Financial Report`)
  add(`  ${monthYear}`)
  add(`  Prepared for: ${name}`)
  add(doubleDivider)
  blank()

  // Score
  add(`FINANCIAL HEALTH SCORE: ${appReport?.score ?? 'N/A'}/100 — ${appReport?.scoreLabel ?? 'N/A'}`)
  if (appReport?.summary) add(appReport.summary)
  blank()

  // 1. Financial Snapshot
  add(divider)
  add('1. FINANCIAL SNAPSHOT')
  add(divider)
  add(`• Name: ${name}`)
  add(`• Age: ${age}`)
  add(`• Monthly Income: ${fmtInr(income)}`)
  add(`• Total Expenses: ${fmtInr(flow?.totalSpent ?? 0)}`)
  add(`• Monthly Savings: ${fmtInr(flow?.savings ?? 0)} (${flow?.savingsPct ?? 0}%)`)
  add(`• Emergency Fund: ${emergencyMonths} months covered`)
  const netWorth = engineResult?.assetAnalysis?.netWorth ?? 0
  add(`• Net Worth: ${fmtInr(netWorth)}`)
  blank()

  // 2. Income vs Expense Breakdown
  add(divider)
  add('2. INCOME vs EXPENSE BREAKDOWN')
  add(divider)
  add(`• Income: ${fmtInr(income)}`)
  add(`• Essentials: ${fmtInr(flow?.catTotals?.essentials ?? 0)} (${flow?.needsPct ?? 0}% of income)`)
  add(`• Lifestyle: ${fmtInr(flow?.catTotals?.lifestyle ?? 0)} (${flow?.wantsPct ?? 0}% of income)`)
  add(`• EMIs: ${fmtInr(flow?.catTotals?.emis ?? 0)}`)
  add(`• Other: ${fmtInr(flow?.catTotals?.other ?? 0)}`)
  add(`• Net Savings: ${fmtInr(flow?.savings ?? 0)}`)
  blank()
  const idealRule = age < 30 ? '50/20/30' : age < 45 ? '50/25/25' : '55/25/20'
  add(`• Recommended Budget Rule (age ${age}): ${idealRule} (Needs/Wants/Savings)`)
  add(`• Your Ratio: ${flow?.needsPct ?? 0}/${flow?.wantsPct ?? 0}/${flow?.savingsPct ?? 0}`)
  blank()

  // 3. Savings Analysis
  add(divider)
  add('3. SAVINGS ANALYSIS')
  add(divider)
  const savingsPct = flow?.savingsPct ?? 0
  add(`• Current Savings Rate: ${savingsPct}%`)
  add(`• Target: 20% minimum`)
  if (savingsPct < 20 && income > 0) {
    const gap = Math.round(income * 0.20 - (flow?.savings ?? 0))
    add(`• Gap: ${fmtInr(gap)}/month needed to reach target`)
    add(`• Suggestion: Automate ${fmtInr(gap)} transfer on payday`)
  } else if (savingsPct >= 20) {
    add(`• Status: Exceeding target — excellent!`)
    add(`• Next Step: Invest surplus via SIPs`)
  }
  blank()

  // 4. Goal Planning
  add(divider)
  add('4. GOAL PLANNING')
  add(divider)
  const configuredGoals = (goals || []).filter(g => g.target_amount > 0)
  if (configuredGoals.length === 0) {
    add('• No goals configured yet')
    add('• Recommended: Set up Emergency Fund, Retirement, and one short-term goal')
  } else {
    configuredGoals.forEach((g, i) => {
      const calc = goalCalcs[i]
      const pct = calc ? Math.round(calc.funded * 100) : Math.min(100, Math.round(((g.saved_amount || g.current_amount || 0) / g.target_amount) * 100))
      add(`• ${g.name}:`)
      add(`  Target: ${fmtInr(g.target_amount)} | Saved: ${fmtInr(g.saved_amount || g.current_amount || 0)} (${pct}%)`)
      if (calc) add(`  Monthly Required: ${fmtInr(calc.monthlyNeeded)} | ${calc.monthsLeft} months left`)
      add(`  Status: ${pct >= 50 ? 'On track' : 'Needs attention'}`)
    })
  }
  blank()

  // 5. Allocation Principles
  add(divider)
  add('5. ALLOCATION PRINCIPLES')
  add(divider)
  const inv = engineResult?.investment
  const idealEq = inv?.equityPct ?? Math.min(80, 100 - age)
  add(`• General equity allocation guideline (age ${age}): ~${idealEq}%`)
  add(`• General debt allocation guideline: ~${100 - idealEq}%`)
  if (inv?.suggestedSip > 0) {
    add(`• Investable surplus: ${fmtInr(inv.suggestedSip)}/month`)
    add(`• Consider diversifying across large-cap, mid-cap, and international categories`)
  }
  add(`• Tax-saving instruments under Section 80C can also serve as investments`)
  add(`• Consult a SEBI-registered advisor for specific fund selection`)
  blank()

  // 6. Risk & Protection
  add(divider)
  add('6. RISK & PROTECTION')
  add(divider)
  const riskData = engineResult?.risk
  const emergencyTarget = riskData?.emergencyTarget ?? (flow?.totalSpent ?? 0) * 6
  add(`• Emergency Fund:`)
  add(`  Current: ${emergencyMonths} months (${fmtInr(assets?.liquidCash ?? 0)})`)
  add(`  Target: 6 months (${fmtInr(emergencyTarget)})`)
  add(`  Status: ${emergencyMonths >= 6 ? 'Covered' : emergencyMonths >= 3 ? 'Partial — keep building' : 'Critical — top priority'}`)
  blank()
  const termCover = riskData?.termInsuranceNeeded ?? income * 12 * 15
  add(`• Term Life Insurance:`)
  add(`  Recommended Cover: ${fmtInr(termCover)} (15× annual income)`)
  add(`  Compare plans online for the best rates at age ${age}`)
  blank()
  add(`• Health Insurance:`)
  add(`  Common benchmark: ₹10-25L family floater coverage`)
  add(`  Compare plans on aggregator sites for your age group`)
  blank()

  // 7. 12-Month Action Plan
  add(divider)
  add('7. 12-MONTH ACTION PLAN')
  add(divider)
  const actions = appReport?.action_plan || []
  if (actions.length > 0) {
    add('IMMEDIATE (Month 1-3):')
    actions.filter(a => a.priority === 'high').forEach(a => {
      add(`  ${a.step}. ${a.title} — ${a.description}`)
    })
    blank()
    add('SHORT-TERM (Month 3-6):')
    actions.filter(a => a.priority === 'medium').forEach(a => {
      add(`  ${a.step}. ${a.title} — ${a.description}`)
    })
    blank()
    add('ONGOING (Month 6-12):')
    actions.filter(a => a.priority === 'low').forEach(a => {
      add(`  ${a.step}. ${a.title} — ${a.description}`)
    })
    if (actions.every(a => a.priority !== 'low')) {
      add('  • Continue all habits above')
      add('  • Review and rebalance portfolio')
      add('  • Reassess goals and increase contributions with income growth')
    }
  } else {
    add('  1. Track all expenses for 30 days')
    add('  2. Set up emergency fund auto-transfer')
    add('  3. Start systematic investments')
    add('  4. Compare term + health insurance plans')
    add('  5. Set 2-3 financial goals with deadlines')
  }
  blank()

  add(doubleDivider)
  add('Generated by ArthFlow · Your Personal Finance Education Tool')
  add(`Report Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  add('')
  add('DISCLAIMER: This report is for educational purposes only and does not')
  add('constitute SEBI-registered investment advice. Consult a qualified')
  add('financial advisor before making investment decisions.')
  add(doubleDivider)

  return lines.join('\n')
}
