// Pure business formulas. All guard against null/zero denominators.
export const safeDiv = (a: number, b: number): number | null => (b === 0 || !Number.isFinite(b) ? null : a / b);
/** ((current - previous) / previous) * 100, null when there is no usable previous value */
export const pctChange = (cur: number, prev: number | null | undefined): number | null =>
  prev === null || prev === undefined || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100;
export const profit = (revenue: number, cost: number) => revenue - cost;
export const margin = (profitV: number, revenue: number): number | null => { const d = safeDiv(profitV, revenue); return d === null ? null : d * 100; };
export const aov = (revenue: number, orders: number): number | null => safeDiv(revenue, orders);
export type KpiStatus = 'Achieved' | 'On Track' | 'At Risk' | 'Below Target';
/** >=100% Achieved; >= warning% On Track; >= warning/2 At Risk; otherwise Below Target */
export function kpiStatus(achievementPct: number, warningPct = 80): KpiStatus {
  if (achievementPct >= 100) return 'Achieved';
  if (achievementPct >= warningPct) return 'On Track';
  if (achievementPct >= warningPct / 2) return 'At Risk';
  return 'Below Target';
}
