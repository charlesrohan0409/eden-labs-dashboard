// One source of truth for the colors charts and inline styles use, so every
// screen reads as the same system. Tailwind classes cover everything else.

export const COLORS = {
  canvas: "#F4F3F0",
  line: "#E7E4DE",
  night: "#141413",
  nightSoft: "#1E1E1C",
  // Accent ramp — emerald, the Eden Labs brand color.
  accent: "#047857",
  accentSoft: "#10B981",
  accentWash: "#ECFDF5",
  // Supporting hues, used sparingly to separate series in a chart.
  teal: "#0D9488",
  amber: "#B45309",
  violet: "#7C3AED",
  sky: "#0369A1",
  rose: "#DC2626",
  muted: "#A8A29E",
  gridline: "#EFEDE8",
};

// Categorical series order. Chart series pull from here in sequence so two
// charts on the same screen never disagree about what "series 2" looks like.
export const SERIES = [COLORS.accent, COLORS.teal, COLORS.amber, COLORS.violet, COLORS.sky];

export const chartTooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    padding: "8px 10px",
  },
  labelStyle: { fontWeight: 600, color: COLORS.night, marginBottom: 2 },
  cursor: { fill: "rgba(0,0,0,0.03)" },
};

export const axisTick = { fontSize: 11, fill: COLORS.muted };
