/**
 * ArthFlow Design System — Navy Blue Primary
 * Trust-driven finance UI with blue actions, gold logo identity.
 */

import { Platform } from 'react-native';

// ── ArthFlow Color Palette ──────────────────────────────────────────────
export const AppColors = {
  // Surfaces
  surface: '#F8FAFC',
  surfaceDim: '#F1F5F9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#F1F5F9',
  surfaceContainer: '#E5E7EB',
  surfaceContainerHigh: '#E2E8F0',

  // On-surface (text)
  onSurface: '#111827',
  onSurfaceVariant: '#6B7280',

  // Outlines / borders
  outline: '#9CA3AF',
  outlineVariant: '#E5E7EB',

  // Primary (Deep Trust Blue)
  primary: '#1E3A8A',
  primaryHover: '#1D4ED8',
  onPrimary: '#ffffff',
  primaryContainer: '#DBEAFE',
  onPrimaryContainer: '#0B1B4A',

  // Secondary (Calm Growth Green)
  secondary: '#22C55E',
  secondaryHover: '#16A34A',
  onSecondary: '#ffffff',
  secondaryContainer: '#DCFCE7',
  onSecondaryContainer: '#065F46',

  // Tertiary (Advisory Orange)
  tertiary: '#F59E0B',
  tertiaryHover: '#D97706',
  onTertiary: '#ffffff',
  tertiaryContainer: '#FEF3C7',
  onTertiaryContainer: '#92400E',

  // Error / Critical
  error: '#EF4444',
  onError: '#ffffff',
  errorContainer: '#FEE2E2',
  onErrorContainer: '#7F1D1D',

  // Semantic
  success: '#22C55E',
  successContainer: '#DCFCE7',
  onSuccess: '#ffffff',
  warning: '#F59E0B',
  warningHover: '#D97706',
  warningContainer: '#FEF3C7',

  // AI / Intelligence (Teal)
  teal: '#14B8A6',
  tealContainer: '#CCFBF1',
  onTeal: '#0F766E',

  // Premium / Special (Indigo)
  indigo: '#6366F1',
  indigoContainer: '#E0E7FF',

  // Text hierarchy
  text1: '#111827',
  text2: '#6B7280',
  text3: '#9CA3AF',

  // Borders
  border: '#E5E7EB',
  borderSecondary: '#F1F5F9',

  // Hero dark cards
  heroBgStart: '#0B1B4A',
  heroBgMid: '#1A2E6E',
  heroBgEnd: '#1E3A8A',

  // Gold (logo identity only)
  gold1: '#B8740A',
  gold2: '#C8860A',
  gold3: '#E0A820',
  gold4: '#F0CC50',
};

export const Colors = {
  light: {
    text: AppColors.text1,
    background: AppColors.surface,
    tint: AppColors.primary,
    icon: AppColors.text2,
    tabIconDefault: AppColors.text3,
    tabIconSelected: AppColors.primary,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#fff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#fff',
  },
};

export const Fonts = Platform.select({
  ios: {
    serif: 'NotoSerif-Bold',
    sans: 'Manrope-Regular',
    sansBold: 'Manrope-Bold',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    serif: 'NotoSerif_700Bold',
    sans: 'Manrope_400Regular',
    sansBold: 'Manrope_700Bold',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    serif: "'Noto Serif', Georgia, serif",
    sans: "'Manrope', system-ui, sans-serif",
    sansBold: "'Manrope', system-ui, sans-serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});
