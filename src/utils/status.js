// ─── Financial Status Determination ─────────────────────────────────────
// Returns a single status based on financial health indicators

export function getStatus({ savingsPct, needsPct, wantsPct, emergencyMonths, goalsFunded }) {
  let score = 0
  let issues = []

  // Savings rate
  if (savingsPct >= 20) score += 2
  else if (savingsPct >= 10) { score += 1; issues.push('savings slightly low') }
  else { issues.push('savings need attention') }

  // Needs (essentials + EMIs)
  if (needsPct <= 50) score += 1
  else issues.push('committed expenses high')

  // Lifestyle
  if (wantsPct <= 30) score += 1
  else issues.push('lifestyle spending high')

  // Emergency fund
  if (emergencyMonths >= 6) score += 2
  else if (emergencyMonths >= 3) { score += 1; issues.push('emergency fund building') }
  else if (emergencyMonths < 3) issues.push('emergency fund critical')

  // Goals
  if (goalsFunded >= 0.5) score += 1
  else if (goalsFunded > 0) { score += 0.5; issues.push('goals need more funding') }

  // Determine status
  if (score >= 6) return { status: 'on track', emoji: '🟢', color: '#22C55E', message: "You're doing well — keep it up!" }
  if (score >= 3) return { status: 'slightly off track', emoji: '🟡', color: '#F59E0B', message: issues[0] ? `Let's work on: ${issues[0]}` : "A few tweaks will get you on track." }
  return { status: 'needs attention', emoji: '🔴', color: '#EF4444', message: issues[0] ? `Priority: ${issues[0]}` : 'Let\'s build a stronger foundation.' }
}
