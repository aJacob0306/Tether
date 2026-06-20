/**
 * Design tokens for the Tether mobile app.
 *
 * Colors here are the EXISTING palette extracted into named tokens — they are not
 * new colors. Spacing, radius, and type scales are added to make layout consistent
 * across screens. Theming/color refinement is intentionally deferred.
 */

export const colors = {
  // Backgrounds
  background: "#0d0e0f",
  surface: "#1b1c1d",
  surfaceAlt: "#121314",
  surfaceRaised: "#151617",

  // Borders
  border: "#2d2f31",
  borderStrong: "#3f3f46",

  // Accent (purple)
  accent: "#945cb4",
  accentSoft: "#e6b4ff",
  accentMuted: "#5f435f",
  accentBorder: "#4d2d5d",
  accentSurface: "#231a28",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af",
  textTertiary: "#6b7280",
  textOnAccent: "#ffffff",

  // Status
  working: "#16a34a",
  workingSoft: "#34d399",
  workingSurface: "#052e26",
  workingBorder: "#064e3b",
  idle: "#ca8a04",
  idleSoft: "#fbbf24",
  offline: "#9ca3af",
  danger: "#fca5a5",
  dangerStrong: "#b00020",
} as const;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Minimum comfortable tap target (px). */
export const touchTarget = 44;

export const typography = {
  display: { fontSize: 28, fontWeight: "700" as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: "700" as const, lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: "700" as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const, lineHeight: 22 },
  subhead: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "500" as const, lineHeight: 16 },
  overline: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    lineHeight: 14,
  },
} as const;

export const theme = { colors, spacing, radius, typography, touchTarget } as const;
