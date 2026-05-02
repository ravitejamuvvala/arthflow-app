import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

const SIZE = 100
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function getScoreTheme(score) {
  if (score >= 70) return { color: '#22C55E', bg: '#DCFCE7', label: 'Good', sub: 'On track' }
  if (score >= 50) return { color: '#F59E0B', bg: '#FEF3C7', label: 'Fair', sub: 'Needs attention' }
  return { color: '#EF4444', bg: '#FEE2E2', label: 'Poor', sub: 'Needs work' }
}

export default function HealthScoreRing({ score, label, subtitle, size = SIZE }) {
  const safeScore = Math.max(0, Math.min(100, score ?? 0))
  const theme = getScoreTheme(safeScore)
  const displayLabel = label || theme.label
  const displaySub = subtitle || theme.sub

  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const progress = circumference - (safeScore / 100) * circumference

  return (
    <View style={s.container}>
      {/* Ring */}
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background ring */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress ring */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={progress}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        {/* Score text in center */}
        <View style={[s.centerText, { width: size, height: size }]}>
          <Text style={s.scoreNum}>{safeScore}</Text>
          <Text style={s.scoreOf}>/100</Text>
        </View>
      </View>

      {/* Label + subtitle below or beside — caller decides layout */}
      <View style={s.labelWrap}>
        <View style={[s.labelBadge, { backgroundColor: theme.color + '25' }]}>
          <Text style={[s.labelText, { color: theme.color }]}>{displayLabel}</Text>
        </View>
        <Text style={s.subText}>{displaySub}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centerText: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Manrope_700Bold',
  },
  scoreOf: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Manrope_700Bold',
    marginTop: -2,
  },
  labelWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  labelBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Manrope_700Bold',
  },
  subText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
})
