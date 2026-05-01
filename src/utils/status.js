// ─── Financial Status Determination ─────────────────────────────────────
// Returns a single status based on financial health indicators

export function getStatus({ savingsPct, needsPct, wantsPct, emergencyMonths, goalsFunded }) {
  let score = 0
  let issues = []

  // Savings rate (weight: 2)
  if (savingsPct >= 20) score += 2
  else if (savingsPct >= 10) { score += 1; issues.push(`saving ${savingsPct}% — aim for 20% to build wealth faster`) }
  else if (savingsPct > 0) { issues.push(`only saving ${savingsPct}% of income — 20% is the target`) }
  else { issues.push('no savings this month — every rupee is being spent') }

  // Needs (essentials + EMIs)
  if (needsPct <= 50) score += 1
  else issues.push(`essentials + EMIs at ${needsPct}% of income (target: under 50%)`)

  // Lifestyle
  if (wantsPct <= 30) score += 1
  else issues.push(`lifestyle spending at ${wantsPct}% of income (target: under 30%)`)

  // Emergency fund (weight: 2)
  if (emergencyMonths >= 6) score += 2
  else if (emergencyMonths >= 3) { score += 1; issues.push(`emergency fund covers ${emergencyMonths} months (target: 6 months)`) }
  else if (emergencyMonths > 0) { issues.push(`emergency fund only ${emergencyMonths} months — need 6 months of expenses`) }
  else { issues.push('no emergency fund detected — this is your top priority') }

  // Goals
  if (goalsFunded >= 0.5) score += 1
  else if (goalsFunded > 0) { score += 0.5; issues.push(`goals only ${Math.round(goalsFunded * 100)}% funded on average`) }

  // Determine status with specific messages
  if (score >= 6) {
    const positiveMsg = savingsPct >= 30
      ? `Saving ${savingsPct}% is excellent — you're ahead of most!`
      : `Saving ${savingsPct}% and spending within limits. Solid month.`
    return { status: 'on track', emoji: '🟢', color: '#22C55E', message: positiveMsg }
  }
  if (score >= 3) {
    return { status: 'slightly off track', emoji: '🟡', color: '#F59E0B', message: issues[0] || "A few tweaks will get you on track." }
  }
  return { status: 'needs attention', emoji: '🔴', color: '#EF4444', message: issues[0] || 'Multiple areas need improvement.' }
}
