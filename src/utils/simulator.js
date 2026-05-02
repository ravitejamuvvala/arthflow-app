// ─── What-If Simulation Engine ──────────────────────────────────────────
// Given goals and a monthly investment amount, calculates timeline deltas


/**
 * Simulate goal timelines at different monthly investment amounts.
 *
 * @param {Object} params
 * @param {Array}  params.goals          - user goals (with target_amount, saved_amount, target_date)
 * @param {number} params.currentMonthly - current monthly savings/investment (baseline)
 * @param {number} params.simMonthly     - simulated monthly amount
 * @returns {{ goals: Array, summary: string, deltaMonths: number }}
 */
export function simulateGoals({ goals, currentMonthly, simMonthly }) {
  const now = new Date()
  const configured = (goals || []).filter(g => g.target_amount > 0)

  if (configured.length === 0) {
    return {
      goals: [],
      summary: 'Set a financial goal first to use the simulator.',
      deltaMonths: 0,
    }
  }

  // Distribute investment proportionally across goals by remaining amount
  const goalData = configured.map(g => {
    const saved = g.saved_amount || g.current_amount || 0
    const remaining = Math.max(0, g.target_amount - saved)
    const targetDate = new Date(g.target_date)
    const originalMonths = Math.max(1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
      (targetDate.getMonth() - now.getMonth())
    )
    return { ...g, saved, remaining, originalMonths }
  })

  const totalRemaining = goalData.reduce((s, g) => s + g.remaining, 0)
  if (totalRemaining === 0) {
    return {
      goals: goalData.map(g => ({
        name: g.name,
        originalMonths: g.originalMonths,
        newMonths: 0,
        delta: -g.originalMonths,
        reached: true,
      })),
      summary: 'All goals are fully funded! 🎉',
      deltaMonths: 0,
    }
  }

  // Calculate per-goal allocation (proportional to remaining)
  const simResults = goalData.map(g => {
    const share = totalRemaining > 0 ? g.remaining / totalRemaining : 0

    const currentAlloc = Math.max(1, Math.round(currentMonthly * share))
    const simAlloc = Math.max(1, Math.round(simMonthly * share))

    const currentTime = Math.ceil(g.remaining / currentAlloc)
    const simTime = Math.ceil(g.remaining / simAlloc)
    const delta = currentTime - simTime

    return {
      name: g.name,
      target: g.target_amount,
      remaining: g.remaining,
      originalMonths: currentTime,
      newMonths: simTime,
      delta,
      reached: simTime <= 0,
      currentAlloc,
      simAlloc,
    }
  })

  const totalDelta = simResults.reduce((s, g) => s + g.delta, 0)
  const avgDelta = Math.round(totalDelta / simResults.length)

  let summary
  if (avgDelta > 0) {
    const years = Math.floor(avgDelta / 12)
    const months = avgDelta % 12
    const timeStr = years > 0
      ? `${years} year${years > 1 ? 's' : ''}${months > 0 ? ` ${months} month${months > 1 ? 's' : ''}` : ''}`
      : `${months} month${months > 1 ? 's' : ''}`
    summary = `You'll reach your goals ${timeStr} earlier`
  } else if (avgDelta < 0) {
    const abs = Math.abs(avgDelta)
    const years = Math.floor(abs / 12)
    const months = abs % 12
    const timeStr = years > 0
      ? `${years} year${years > 1 ? 's' : ''}${months > 0 ? ` ${months} month${months > 1 ? 's' : ''}` : ''}`
      : `${months} month${months > 1 ? 's' : ''}`
    summary = `This would delay your goals by ${timeStr}`
  } else {
    summary = 'Same timeline as current plan'
  }

  return { goals: simResults, summary, deltaMonths: avgDelta }
}

/**
 * Calculate min/max/step for the slider based on user's financial data.
 */
export function getSliderBounds({ currentSavings, income }) {
  const min = Math.max(1000, Math.round((currentSavings * 0.3) / 1000) * 1000)
  const max = Math.min(income || 500000, Math.round((currentSavings * 3) / 1000) * 1000)
  const step = max > 100000 ? 5000 : max > 50000 ? 2000 : 1000
  return { min, max: Math.max(min + step, max), step }
}
