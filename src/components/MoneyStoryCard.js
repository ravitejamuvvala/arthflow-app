import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function MoneyStoryCard({ story, onPress }) {
  if (!story) return null

  const hasProblem = !!story.problem

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.headerIcon}>📖</Text>
        <Text style={s.headerLabel}>YOUR MONEY STORY</Text>
      </View>

      {/* Line 1: Positive */}
      <View style={s.line}>
        <Text style={s.emoji}>👍</Text>
        <Text style={s.positiveText}>{story.positive}</Text>
      </View>

      {/* Line 2: Problem */}
      {hasProblem && (
        <View style={s.line}>
          <Text style={s.emoji}>⚠️</Text>
          <Text style={s.problemText}>{story.problem}</Text>
        </View>
      )}

      {/* Line 3: Action */}
      <View style={s.line}>
        <Text style={s.emoji}>👉</Text>
        <Text style={s.actionText}>{story.action}</Text>
      </View>

      {/* CTA */}
      <TouchableOpacity style={s.cta} onPress={onPress} activeOpacity={0.85}>
        <Text style={s.ctaText}>View Full Plan</Text>
        <Text style={s.ctaArrow}>›</Text>
      </TouchableOpacity>
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
    borderColor: '#E5E7EB',
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
    fontSize: 14,
    marginRight: 6,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#9CA3AF',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  emoji: {
    fontSize: 15,
    marginRight: 10,
    marginTop: 1,
  },
  positiveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
    flex: 1,
    lineHeight: 21,
  },
  problemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D97706',
    flex: 1,
    lineHeight: 21,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E3A8A',
    flex: 1,
    lineHeight: 21,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 6,
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
