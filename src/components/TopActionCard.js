import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

const SEVERITY_STYLES = {
  urgent:  { bg: '#FEE2E2', accent: '#EF4444', border: '#FECACA', icon: '🚨' },
  warning: { bg: '#FEF3C7', accent: '#D97706', border: '#FDE68A', icon: '⚠️' },
  good:    { bg: '#DCFCE7', accent: '#16A34A', border: '#BBF7D0', icon: '🚀' },
}

export default function TopActionCard({ topAction, onPress }) {
  if (!topAction) return null

  const sev = SEVERITY_STYLES[topAction.severity] || SEVERITY_STYLES.warning

  return (
    <View style={[s.card, { backgroundColor: sev.bg, borderColor: sev.border }]}>
      {/* Header row */}
      <View style={s.headerRow}>
        <Text style={s.icon}>{sev.icon}</Text>
        <Text style={s.label}>TOP ACTION</Text>
      </View>

      {/* Title */}
      <Text style={[s.title, { color: sev.accent }]}>{topAction.title}</Text>

      {/* Subtitle */}
      <Text style={s.subtitle}>{topAction.subtitle}</Text>

      {/* Impact line */}
      <Text style={s.impact}>{topAction.impact}</Text>

      {/* CTA Button */}
      <TouchableOpacity
        style={[s.cta, { backgroundColor: sev.accent }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Text style={s.ctaText}>{topAction.ctaLabel}</Text>
        <Text style={s.ctaArrow}>›</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#6B7280',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  impact: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 14,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  ctaArrow: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
})
