import Slider from '@react-native-community/slider'
import React, { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { fmtInr } from '../utils/calculations'
import { getSliderBounds, simulateGoals } from '../utils/simulator'

const BLUE   = '#1E3A8A'
const GREEN  = '#22C55E'
const GREEN_L = '#DCFCE7'
const RED    = '#EF4444'
const RED_L  = '#FEE2E2'
const ORANGE = '#F59E0B'
const ORANGE_L = '#FEF3C7'
const TXT1   = '#111827'
const TXT2   = '#6B7280'

/** Format months as "X yrs Y mo" or just "Y mo" */
function fmtTime(months) {
  const abs = Math.abs(months)
  const y = Math.floor(abs / 12)
  const m = abs % 12
  if (y > 0 && m > 0) return `${y}y ${m}mo`
  if (y > 0) return `${y}y`
  return `${m}mo`
}
const TXT3   = '#9CA3AF'
const BORDER = '#E5E7EB'

export default function WhatIfSimulator({ goals, currentSavings, income }) {
  const bounds = useMemo(
    () => getSliderBounds({ currentSavings: currentSavings || 0, income: income || 0 }),
    [currentSavings, income]
  )

  const [simAmount, setSimAmount] = useState(currentSavings || bounds.min)

  const result = useMemo(
    () => simulateGoals({
      goals: goals || [],
      currentMonthly: currentSavings || 0,
      simMonthly: simAmount,
    }),
    [goals, currentSavings, simAmount]
  )

  const handleChange = useCallback((val) => {
    setSimAmount(Math.round(val / bounds.step) * bounds.step)
  }, [bounds.step])

  if (!goals || goals.filter(g => g.target_amount > 0).length === 0) {
    return (
      <View style={s.card}>
        <View style={s.headerRow}>
          <Text style={s.headerIcon}>🔮</Text>
          <Text style={s.headerLabel}>WHAT-IF SIMULATOR</Text>
        </View>
        <Text style={s.emptyText}>Set a financial goal to unlock the simulator</Text>
      </View>
    )
  }

  const isIncrease = simAmount > (currentSavings || 0)
  const isDecrease = simAmount < (currentSavings || 0)
  const deltaColor = result.deltaMonths > 0 ? GREEN : result.deltaMonths < 0 ? RED : TXT2
  const deltaBg = result.deltaMonths > 0 ? GREEN_L : result.deltaMonths < 0 ? RED_L : '#F1F5F9'

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.headerIcon}>🔮</Text>
        <Text style={s.headerLabel}>WHAT-IF SIMULATOR</Text>
      </View>

      {/* Slider label */}
      <Text style={s.sliderLabel}>Monthly Investment</Text>
      <View style={s.amountRow}>
        <Text style={s.amountValue}>{fmtInr(simAmount)}</Text>
        <Text style={s.amountPerMonth}>/month</Text>
        {simAmount !== (currentSavings || 0) && (
          <View style={[s.deltaBadge, { backgroundColor: isIncrease ? GREEN_L : RED_L }]}>
            <Text style={[s.deltaBadgeTxt, { color: isIncrease ? GREEN : RED }]}>
              {isIncrease ? '+' : ''}{fmtInr(simAmount - (currentSavings || 0))}
            </Text>
          </View>
        )}
      </View>

      {/* Slider */}
      <Slider
        style={s.slider}
        minimumValue={bounds.min}
        maximumValue={bounds.max}
        step={bounds.step}
        value={simAmount}
        onValueChange={handleChange}
        minimumTrackTintColor={BLUE}
        maximumTrackTintColor={BORDER}
        thumbTintColor={BLUE}
      />
      <View style={s.sliderBounds}>
        <Text style={s.boundText}>{fmtInr(bounds.min)}</Text>
        <Text style={s.boundText}>{fmtInr(bounds.max)}</Text>
      </View>

      {/* Result summary */}
      <View style={[s.resultCard, { backgroundColor: deltaBg, borderColor: deltaColor + '30' }]}>
        <Text style={[s.resultText, { color: deltaColor }]}>{result.summary}</Text>
      </View>

      {/* Per-goal breakdown */}
      {result.goals.length > 0 && (
        <View style={s.goalList}>
          {result.goals.map((g, i) => (
            <View key={i} style={s.goalRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.goalName} numberOfLines={1}>{g.name}</Text>
                <Text style={s.goalDetail}>
                  {fmtTime(g.originalMonths)} → <Text style={{ fontWeight: '800', color: deltaColor }}>{fmtTime(g.newMonths)}</Text>
                </Text>
              </View>
              {g.delta !== 0 && (
                <View style={[s.goalDelta, { backgroundColor: g.delta > 0 ? GREEN_L : RED_L }]}>
                  <Text style={[s.goalDeltaTxt, { color: g.delta > 0 ? GREEN : RED }]}>
                    {g.delta > 0 ? `${fmtTime(g.delta)} faster` : `${fmtTime(g.delta)} slower`}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BLUE + '20',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: TXT3,
    fontFamily: 'Manrope_700Bold',
  },
  emptyText: {
    fontSize: 14,
    color: TXT2,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingVertical: 16,
  },
  sliderLabel: {
    fontSize: 12,
    color: TXT3,
    fontWeight: '600',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
    gap: 4,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '800',
    color: BLUE,
    fontFamily: 'Manrope_700Bold',
  },
  amountPerMonth: {
    fontSize: 14,
    color: TXT3,
    fontFamily: 'Manrope_400Regular',
  },
  deltaBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  deltaBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderBounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  boundText: {
    fontSize: 11,
    color: TXT3,
    fontFamily: 'Manrope_400Regular',
  },
  resultCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  goalList: {
    gap: 8,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  goalName: {
    fontSize: 14,
    fontWeight: '700',
    color: TXT1,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 2,
  },
  goalDetail: {
    fontSize: 13,
    color: TXT2,
    fontFamily: 'Manrope_400Regular',
  },
  goalDelta: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
  },
  goalDeltaTxt: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
})
