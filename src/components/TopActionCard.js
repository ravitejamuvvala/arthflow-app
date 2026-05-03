import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

// Matches app design tokens — muted accents, white card bg, left accent stripe
const SEVERITY_STYLES = {
  urgent:  { accent: '#DC2626', accentLight: '#FEE2E2', icon: '🚨' },
  warning: { accent: '#D97706', accentLight: '#FEF3C7', icon: '⚠️' },
  good:    { accent: '#16A34A', accentLight: '#DCFCE7', icon: '🚀' },
}

export default function TopActionCard({ topAction, onPress }) {
  if (!topAction) return null

  const sev = SEVERITY_STYLES[topAction.severity] || SEVERITY_STYLES.warning

  return (
    <View style={[s.card, { borderLeftColor: sev.accent }]}>
      {/* Header row */}
      <View style={s.headerRow}>
        <Text style={s.icon}>{sev.icon}</Text>
        <Text style={s.label}>TOP ACTION</Text>
      </View>

      {/* Title */}
      <Text style={s.title}>{topAction.title}</Text>

      {/* Subtitle */}
      <Text style={s.subtitle}>{topAction.subtitle}</Text>

      {/* Impact line */}
      <Text style={s.impact}>👉 {topAction.impact}</Text>

      {/* Outcome line */}
      {topAction.outcome ? (
        <View style={[s.outcomeRow, { backgroundColor: sev.accentLight + '80' }]}>
          <Text style={s.outcomeIcon}>📈</Text>
          <Text style={s.outcomeText}>
            <Text style={{ fontWeight: '700', color: '#111827' }}>Outcome: </Text>
            <Text style={{ color: '#374151' }}>{topAction.outcome}</Text>
          </Text>
        </View>
      ) : null}

      {/* Confidence signal */}
      {topAction.confidence ? (
        <View style={s.confidenceRow}>
          <Text style={s.confidenceIcon}>🟢</Text>
          <Text style={s.confidenceText}>{topAction.confidence}</Text>
        </View>
      ) : null}

      {/* CTA Button */}
      <TouchableOpacity
        style={[s.cta, { backgroundColor: sev.accent + '10', borderColor: sev.accent + '25' }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={[s.ctaText, { color: sev.accent }]}>{topAction.ctaLabel}</Text>
        <Text style={[s.ctaArrow, { color: sev.accent }]}>›</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    fontSize: 13,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#9CA3AF',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  impact: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 10,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  outcomeIcon: {
    fontSize: 13,
    marginRight: 8,
    marginTop: 1,
  },
  outcomeText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  confidenceIcon: {
    fontSize: 10,
    marginRight: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  ctaText: {
    fontWeight: '700',
    fontSize: 14,
  },
  ctaArrow: {
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 8,
  },
})
