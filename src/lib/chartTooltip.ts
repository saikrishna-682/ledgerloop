import type { CSSProperties } from "react";

/**
 * A frosted-glass tooltip: translucent + blurred so the chart is still
 * faintly visible underneath, with text pinned to theme colors (not the
 * data series' own color) so it stays readable regardless of which segment
 * or bar is being hovered.
 */
export const glassTooltipContentStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  padding: "8px 12px",
  fontSize: 12,
  backgroundColor: "color-mix(in oklab, var(--popover) 70%, transparent)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 8px 24px -4px rgb(0 0 0 / 0.18)",
};

export const glassTooltipItemStyle: CSSProperties = {
  color: "var(--popover-foreground)",
};

export const glassTooltipLabelStyle: CSSProperties = {
  color: "var(--popover-foreground)",
  fontWeight: 600,
};
