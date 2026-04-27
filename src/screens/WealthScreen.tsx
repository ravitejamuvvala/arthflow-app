import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useState } from 'react'
import {
    Dimensions,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import ArthFlowLogo from '../components/ArthFlowLogo'

// ─── Design Tokens ────────────────────────────────────────────────────────────
const F_BOLD = 'Manrope_700Bold'
const F_REG  = 'Manrope_400Regular'
const BG     = '#F8FAFC'
const BLUE   = '#1E3A8A'
const BLUE_L = '#DBEAFE'
const GREEN  = '#22C55E'
const GREEN_L = '#DCFCE7'
const ORANGE = '#F59E0B'
const ORANGE_L = '#FEF3C7'
const RED    = '#EF4444'
const TEAL   = '#14B8A6'
const TEAL_L = '#CCFBF1'
const INDIGO = '#6366F1'
const INDIGO_L = '#E0E7FF'
const TXT1   = '#111827'
const TXT2   = '#6B7280'
const TXT3   = '#9CA3AF'
const BORDER = '#E5E7EB'
const BG_SEC = '#F1F5F9'

const SCREEN_W = Dimensions.get('window').width

// ─── Asset Portfolio Type ─────────────────────────────────────────────────────
interface AssetPortfolio {
  liquidCash:  number
  mutualFunds: number
  stocks:      number
  epf:         number
  ppf:         number
  gold:        number
  realEstate:  number
  other:       number
}

const defaultAssets: AssetPortfolio = {
  liquidCash: 0, mutualFunds: 0, stocks: 0, epf: 0,
  ppf: 0, gold: 0, realEstate: 0, other: 0,
}

const STORAGE_KEY = '@arthflow_assets'

// ─── Asset Config ─────────────────────────────────────────────────────────────
interface AssetConfig {
  key:         keyof AssetPortfolio
  label:       string
  subLabel:    string
  emoji:       string
  color:       string
  bg:          string
  description: string
  tips:        string
}

const ASSET_CONFIG: AssetConfig[] = [
  { key: 'liquidCash',  label: 'Cash & Savings',   subLabel: 'Bank + FD < 1yr',        emoji: '💵', color: GREEN,  bg: GREEN_L,  description: 'Savings account, current account, and fixed deposits under 1 year.', tips: 'Ideal range: 3–6 months of expenses for emergency access.' },
  { key: 'mutualFunds', label: 'Mutual Funds',     subLabel: 'SIP + Lump sum',         emoji: '📈', color: BLUE,   bg: BLUE_L,   description: 'Total current value of all mutual fund investments (equity + debt + hybrid).', tips: 'Equity MFs historically return 12–15% CAGR over 10+ years.' },
  { key: 'stocks',      label: 'Stocks',           subLabel: 'Direct equity portfolio', emoji: '📊', color: INDIGO, bg: INDIGO_L, description: 'Current market value of your direct stock portfolio (NSE/BSE).', tips: 'High potential but higher risk — ideal only if you track markets actively.' },
  { key: 'epf',         label: 'EPF / PF',         subLabel: 'Employee Provident Fund', emoji: '🏦', color: TEAL,   bg: TEAL_L,   description: 'Your accumulated EPF balance (employer + employee contributions).', tips: 'EPF earns ~8.1% p.a. — one of the safest retirement instruments.' },
  { key: 'ppf',         label: 'PPF',              subLabel: 'Public Provident Fund',   emoji: '🔒', color: '#8B5CF6', bg: '#EDE9FE', description: 'Public Provident Fund balance. Tax-free under 80C, 15yr lock-in.', tips: 'Max ₹1.5L/year. Invest before April 5 to earn full year\'s interest.' },
  { key: 'gold',        label: 'Gold',             subLabel: 'Physical + SGB + ETF',    emoji: '🥇', color: ORANGE, bg: ORANGE_L, description: 'Total value of gold holdings — jewellery, Sovereign Gold Bonds, and Gold ETFs.', tips: 'Ideal 5–10% of portfolio. SGBs earn extra 2.5% annual interest.' },
  { key: 'realEstate',  label: 'Real Estate',      subLabel: 'Investment properties',   emoji: '🏠', color: RED,    bg: '#FEE2E2', description: 'Current market value of investment properties (exclude primary home).', tips: 'Real estate provides rental yield + appreciation but is illiquid.' },
  { key: 'other',       label: 'Other Assets',     subLabel: 'NPS · Bonds · Crypto',    emoji: '🔧', color: TXT2,   bg: BG_SEC,   description: 'NPS balance, government bonds, crypto, and other alternative investments.', tips: 'NPS (National Pension System) offers additional 80CCD(1B) benefit of ₹50,000.' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtInr(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`
  return `₹${n.toLocaleString('en-IN')}`
}

function totalNetWorth(a: AssetPortfolio): number {
  return Object.values(a).reduce((s, v) => s + v, 0)
}

// ─── Asset Edit Sheet ─────────────────────────────────────────────────────────
function AssetSheet({ cfg, currentValue, onClose, onSave }: {
  cfg: AssetConfig
  currentValue: number
  onClose: () => void
  onSave: (val: number) => void
}) {
  const [value, setValue] = useState(currentValue > 0 ? String(currentValue) : '')

  return (
    <Modal visible animationType="slide" transparent>
      <View style={sh.overlay}>
        <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={sh.sheet}>
          {/* Drag handle */}
          <View style={sh.handle} />

          {/* Header */}
          <View style={sh.header}>
            <View style={[sh.emojiBox, { backgroundColor: cfg.bg }]}>
              <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sh.headerTitle}>{cfg.label}</Text>
              <Text style={sh.headerSub}>{cfg.subLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={sh.closeBtn}>
              <Text style={{ fontSize: 16, color: TXT2 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={sh.desc}>{cfg.description}</Text>

          {/* Amount input card */}
          <View style={sh.inputCard}>
            <Text style={sh.inputLabel}>Current value of {cfg.label}</Text>
            <View style={sh.inputRow}>
              <Text style={sh.rupee}>₹</Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numeric"
                style={sh.input}
              />
            </View>
          </View>

          {/* Tip */}
          <View style={[sh.tipBox, { backgroundColor: cfg.bg }]}>
            <Text style={{ fontSize: 14 }}>💡</Text>
            <Text style={[sh.tipText, { color: cfg.color }]}>{cfg.tips}</Text>
          </View>

          {/* Save button */}
          <TouchableOpacity
            onPress={() => { onSave(Number(value) || 0); onClose() }}
            style={sh.saveBtn}
          >
            <Text style={{ fontSize: 14, color: '#fff' }}>✓</Text>
            <Text style={sh.saveBtnText}>Save {cfg.label}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Allocation Bar ───────────────────────────────────────────────────────────
function AllocationBar({ assets, nw }: { assets: AssetPortfolio; nw: number }) {
  const segments = ASSET_CONFIG
    .map(cfg => ({ label: cfg.label, value: assets[cfg.key], color: cfg.color, emoji: cfg.emoji }))
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)

  if (nw === 0) return null

  return (
    <View style={s.allocCard}>
      <Text style={s.sectionTitle}>Asset Allocation</Text>

      {/* Stacked bar */}
      <View style={s.allocBar}>
        {segments.map(seg => (
          <View
            key={seg.label}
            style={{ flex: seg.value / nw, backgroundColor: seg.color, minWidth: 0 }}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={s.allocLegend}>
        {segments.map(seg => {
          const pct = Math.round((seg.value / nw) * 100)
          return (
            <View key={seg.label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: seg.color }]} />
              <Text style={s.legendLabel}>{seg.emoji} {seg.label}</Text>
              <Text style={s.legendPct}>{pct}%</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WealthScreen() {
  const [assets, setAssets] = useState<AssetPortfolio>(defaultAssets)
  const [activeSheet, setActiveSheet] = useState<keyof AssetPortfolio | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Load from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setAssets(JSON.parse(raw)) } catch {}
      }
    })
  }, [])

  // Save to AsyncStorage on change
  const saveAsset = useCallback((key: keyof AssetPortfolio, val: number) => {
    setAssets(prev => {
      const next = { ...prev, [key]: val }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) try { setAssets(JSON.parse(raw)) } catch {}
      setRefreshing(false)
    })
  }, [])

  const nw = totalNetWorth(assets)
  const activeCfg = ASSET_CONFIG.find(c => c.key === activeSheet)

  return (
    <View style={s.root}>
      {/* ── App Bar ──────────────────────────────────────────── */}
      <View style={s.appBar}>
        <ArthFlowLogo size={28} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.appBarLabel}>NET WORTH</Text>
          <Text style={s.appBarValue}>{fmtInr(nw)}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        {/* ── Hero ──────────────────────────────────────────── */}
        <View style={s.heroPad}>
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>Total Net Worth</Text>
            <View style={s.heroRow}>
              <Text style={s.heroRupee}>₹</Text>
              <Text style={s.heroAmount}>
                {nw >= 100000 ? `${(nw / 100000).toFixed(2)}L` : nw.toLocaleString('en-IN')}
              </Text>
            </View>
            <Text style={s.heroHint}>Tap any asset below to update its value</Text>
          </View>
        </View>

        {/* ── Asset Grid ────────────────────────────────────── */}
        <View style={s.gridPad}>
          <Text style={s.sectionTitle}>Your Asset Portfolio</Text>
          <View style={s.grid}>
            {ASSET_CONFIG.map(cfg => {
              const val = assets[cfg.key]
              const pct = nw > 0 ? Math.round((val / nw) * 100) : 0
              const cardW = (SCREEN_W - 16 * 2 - 12) / 2
              return (
                <TouchableOpacity
                  key={cfg.key}
                  onPress={() => setActiveSheet(cfg.key)}
                  style={[s.assetCard, { width: cardW, borderColor: val > 0 ? cfg.color + '25' : BORDER, overflow: 'hidden' }]}
                  activeOpacity={0.7}
                >
                  {/* Progress fill */}
                  {val > 0 && pct > 0 && (
                    <View style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: `${Math.min(pct * 2, 40)}%`,
                      backgroundColor: cfg.color, opacity: 0.05,
                      borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
                    }} />
                  )}
                  <View style={s.assetTop}>
                    <View style={[s.assetEmoji, { backgroundColor: cfg.bg }]}>
                      <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
                    </View>
                    {val > 0 && (
                      <View style={[s.assetBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.assetBadgeText, { color: cfg.color }]}>{pct}%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.assetName}>{cfg.label}</Text>
                  <Text style={s.assetSub}>{cfg.subLabel}</Text>
                  <View style={s.assetBottom}>
                    <Text style={[s.assetVal, { color: val > 0 ? cfg.color : TXT3 }]}>
                      {val > 0 ? fmtInr(val) : '₹0'}
                    </Text>
                    <Text style={{ fontSize: 14, color: TXT3 }}>›</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── Allocation Bar ────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <AllocationBar assets={assets} nw={nw} />
        </View>

        {/* ── Tip Card ──────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={s.tipCard}>
            <Text style={{ fontSize: 20, marginRight: 12 }}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.tipTitle}>Keep assets updated</Text>
              <Text style={s.tipDesc}>
                More accurate asset data means better AI insights in your Coach tab — including allocation advice, goal projections, and insurance recommendations.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Asset Edit Sheet ──────────────────────────────── */}
      {activeSheet && activeCfg && (
        <AssetSheet
          cfg={activeCfg}
          currentValue={assets[activeSheet]}
          onClose={() => setActiveSheet(null)}
          onSave={val => saveAsset(activeSheet, val)}
        />
      )}
    </View>
  )
}

// ─── Main Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // App Bar
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, height: 56, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: BORDER,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 24,
  },
  appBarLabel: { fontFamily: F_BOLD, fontSize: 10, fontWeight: '700', color: TXT3, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  appBarValue: { fontFamily: F_BOLD, fontSize: 16, fontWeight: '800', color: '#E0A820' },

  // Hero
  heroPad: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  heroCard: {
    borderRadius: 24, padding: 20,
    backgroundColor: '#0B1B4A',
    shadowColor: BLUE, shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.45, shadowRadius: 60,
  },
  heroLabel: { fontFamily: F_BOLD, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: 1.2, marginBottom: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  heroRupee: { fontFamily: F_BOLD, fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.5)', lineHeight: 38 },
  heroAmount: { fontFamily: F_BOLD, fontSize: 38, fontWeight: '800', color: '#E0A820', letterSpacing: -1.5 },
  heroHint: { fontFamily: F_REG, fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.4)' },

  // Section
  sectionTitle: { fontFamily: F_BOLD, fontSize: 14, fontWeight: '800', color: TXT1, marginBottom: 12 },

  // Grid
  gridPad: { paddingHorizontal: 16, paddingBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  assetCard: {
    borderRadius: 20, padding: 16, backgroundColor: '#fff', borderWidth: 1,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24,
    elevation: 3,
  },
  assetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  assetEmoji: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assetBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  assetBadgeText: { fontFamily: F_BOLD, fontSize: 9, fontWeight: '800' },
  assetName: { fontFamily: F_BOLD, fontSize: 12, fontWeight: '800', color: TXT1, marginBottom: 2 },
  assetSub: { fontFamily: F_REG, fontSize: 10, fontWeight: '500', color: TXT3, marginBottom: 6 },
  assetBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetVal: { fontFamily: F_BOLD, fontSize: 16, fontWeight: '800' },

  // Allocation
  allocCard: {
    borderRadius: 20, padding: 16, backgroundColor: '#fff',
    borderWidth: 1, borderColor: BORDER,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 24,
  },
  allocBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16 },
  allocLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: F_REG, fontSize: 11, fontWeight: '600', color: TXT2 },
  legendPct: { fontFamily: F_BOLD, fontSize: 11, fontWeight: '800', color: TXT1 },

  // Tip
  tipCard: {
    borderRadius: 20, padding: 16, backgroundColor: TEAL_L,
    borderWidth: 1, borderColor: TEAL + '20',
    flexDirection: 'row', alignItems: 'flex-start',
  },
  tipTitle: { fontFamily: F_BOLD, fontSize: 13, fontWeight: '800', color: '#0F766E', marginBottom: 4 },
  tipDesc: { fontFamily: F_REG, fontSize: 12, fontWeight: '500', color: '#0F766E', lineHeight: 18, opacity: 0.85 },
})

// ─── Sheet Styles ─────────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17,24,39,0.65)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, maxWidth: 480,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: BG_SEC, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  emojiBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F_BOLD, fontSize: 17, fontWeight: '800', color: TXT1 },
  headerSub: { fontFamily: F_REG, fontSize: 12, fontWeight: '500', color: TXT3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: BG_SEC, alignItems: 'center', justifyContent: 'center' },
  desc: { fontFamily: F_REG, fontSize: 13, fontWeight: '500', color: TXT2, lineHeight: 21, marginBottom: 16, marginTop: 8, paddingLeft: 4 },
  inputCard: {
    borderRadius: 20, padding: 20, alignItems: 'center',
    backgroundColor: '#0B1B4A', marginBottom: 12,
  },
  inputLabel: { fontFamily: F_BOLD, fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  rupee: { fontFamily: F_BOLD, fontSize: 32, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginRight: 4 },
  input: { fontFamily: F_BOLD, fontSize: 40, fontWeight: '800', color: '#E0A820', letterSpacing: -1.5, textAlign: 'center', minWidth: 120 },
  tipBox: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 8, marginBottom: 20 },
  tipText: { fontFamily: F_BOLD, fontSize: 12, fontWeight: '600', lineHeight: 18, flex: 1 },
  saveBtn: {
    borderRadius: 16, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BLUE,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 16,
  },
  saveBtnText: { fontFamily: F_BOLD, fontSize: 14, fontWeight: '800', color: '#fff' },
})
