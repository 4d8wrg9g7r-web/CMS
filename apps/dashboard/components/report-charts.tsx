"use client";

import type { ReportGroup } from "@cms/database";

/**
 * Dependency-free report charts. Palette and mark specs follow the dataviz
 * method: single hue for single-series magnitude, a fixed second hue (never
 * cycled) for two-period comparisons — color follows the period, identically in
 * every chart — with a legend whenever two series render. Categorical hues in
 * fixed order for pie/donut identity (>7 folds into Other); comparisons render
 * as side-by-side small multiples sharing one color mapping rather than
 * double-encoding one plot. Thin marks with surface gaps, values in text tokens,
 * native-title tooltips, and the data table always renders alongside (the
 * palette's contrast relief). Validated with the skill's validator.
 */

const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#52514e";

/** One aligned series; when two are passed their groups share labels and length. */
export interface ChartSeries {
  label: string;
  groups: ReportGroup[];
}

export function seriesColor(index: number): string {
  return index === 0 ? SERIES_1 : SERIES_2;
}

function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
      {series.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: seriesColor(i) }} />
          <span className="text-ink-secondary">{s.label}</span>
        </span>
      ))}
    </div>
  );
}

export function ReportBarChart({ series, format }: { series: ChartSeries[]; format: (n: number) => string }) {
  const labels = series[0]?.groups.map((g) => g.label) ?? [];
  const max = Math.max(...series.flatMap((s) => s.groups.map((g) => g.value)), 1);
  return (
    <div role="img" aria-label="Bar chart">
      <Legend series={series} />
      <div className="flex flex-col gap-2">
        {labels.map((label, row) => (
          <div key={label} className="group flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-right text-xs text-ink-secondary">{label}</span>
            <div className="flex flex-1 flex-col gap-0.5">
              {series.map((s, i) => {
                const value = s.groups[row]?.value ?? 0;
                return (
                  <div
                    key={s.label}
                    className={series.length > 1 ? "h-3 rounded-[4px] bg-surface-muted" : "h-5 rounded-[4px] bg-surface-muted"}
                    title={`${s.label} — ${label}: ${format(value)}`}
                  >
                    <div
                      className="h-full rounded-[4px] transition-all duration-300 group-hover:brightness-110"
                      style={{
                        width: `${Math.max((value / max) * 100, value > 0 ? 1 : 0)}%`,
                        backgroundColor: seriesColor(i),
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums text-ink">
              {format(series[0]?.groups[row]?.value ?? 0)}
              {series.length > 1 && (
                <span className="block font-normal text-ink-muted">{format(series[1]?.groups[row]?.value ?? 0)}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rounds a scale ceiling up to a "nice" number (1/2/2.5/5 × 10^n). */
function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

export function ReportLineChart({ series, format }: { series: ChartSeries[]; format: (n: number) => string }) {
  const W = 720;
  const H = 240;
  const PAD = { top: 20, right: 52, bottom: 26, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const groups0 = series[0]?.groups ?? [];
  const count = groups0.length;
  const max = niceMax(Math.max(...series.flatMap((s) => s.groups.map((g) => g.value)), 1));
  const x = (i: number) => PAD.left + (count === 1 ? innerW / 2 : (i / (count - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = Math.max(1, Math.ceil(count / 6));
  const last = count - 1;
  const single = series.length === 1;

  return (
    <div>
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="#eeede9" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(max * f) + 3} textAnchor="end" fontSize={10} fill="#52514e">
              {format(max * f)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#c9c8c3" strokeWidth={1} />
        {single && count > 1 && (
          <polygon
            points={`${PAD.left},${y(0)} ${groups0.map((g, i) => `${x(i)},${y(g.value)}`).join(" ")} ${x(last)},${y(0)}`}
            fill={SERIES_1}
            opacity={0.08}
          />
        )}
        {series.map((s, si) => (
          <g key={s.label}>
            <polyline
              points={s.groups.map((g, i) => `${x(i)},${y(g.value)}`).join(" ")}
              fill="none"
              stroke={seriesColor(si)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.groups.map((g, i) => (
              <g key={`${s.label}-${g.label}`}>
                <circle cx={x(i)} cy={y(g.value)} r={3} fill={seriesColor(si)} />
                <circle cx={x(i)} cy={y(g.value)} r={11} fill="transparent">
                  <title>{`${s.label} — ${g.label}: ${format(g.value)}`}</title>
                </circle>
              </g>
            ))}
          </g>
        ))}
        {groups0.map((g, i) => (
          <g key={`x-${g.label}`}>
            {/* Selective direct labels: endpoints only, single series only. */}
            {single && (i === 0 || i === last) && count > 1 && g.value > 0 && (
              <text
                x={x(i)}
                y={y(g.value) - 8}
                textAnchor={i === 0 ? "start" : "end"}
                fontSize={11}
                fontWeight={600}
                fill="#0b0b0b"
              >
                {format(g.value)}
              </text>
            )}
            {i % labelEvery === 0 || i === last ? (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#52514e">
                {g.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function RoundChart({
  groups,
  colorByLabel,
  format,
  hole,
  title,
}: {
  groups: ReportGroup[];
  colorByLabel: Map<string, string>;
  format: (n: number) => string;
  hole: boolean;
  title?: string;
}) {
  const slices = groups.filter((g) => g.value > 0);
  const total = slices.reduce((s, g) => s + g.value, 0) || 1;
  const CX = 90;
  const CY = 90;
  const R = 70;
  const arc = (startFrac: number, endFrac: number) => {
    const a0 = 2 * Math.PI * startFrac - Math.PI / 2;
    const a1 = 2 * Math.PI * endFrac - Math.PI / 2;
    const large = endFrac - startFrac > 0.5 ? 1 : 0;
    return `M ${CX} ${CY} L ${CX + R * Math.cos(a0)} ${CY + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${
      CX + R * Math.cos(a1)
    } ${CY + R * Math.sin(a1)} Z`;
  };
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 180 180" className="h-40 w-40" role="img" aria-label={hole ? "Donut chart" : "Pie chart"}>
        {slices.length === 1 ? (
          <circle cx={CX} cy={CY} r={R} fill={colorByLabel.get(slices[0]!.label)} stroke="#fcfcfb" strokeWidth={2} />
        ) : (
          slices.map((s) => {
            const start = acc / total;
            acc += s.value;
            const end = acc / total;
            return (
              <path key={s.label} d={arc(start, end)} fill={colorByLabel.get(s.label)} stroke="#fcfcfb" strokeWidth={2}>
                <title>{`${title ? `${title} — ` : ""}${s.label}: ${format(s.value)} (${Math.round((end - start) * 1000) / 10}%)`}</title>
              </path>
            );
          })
        )}
        {hole && <circle cx={CX} cy={CY} r={40} fill="#fcfcfb" />}
      </svg>
      {title && <span className="text-xs font-medium text-ink-secondary">{title}</span>}
    </div>
  );
}

export function ReportRoundChart({
  series,
  format,
  hole,
}: {
  series: ChartSeries[];
  format: (n: number) => string;
  hole: boolean;
}) {
  // One shared color mapping across both periods: color follows the category.
  const base = series[0]?.groups ?? [];
  const visible = base.slice(0, 7).map((g) => g.label);
  const colorByLabel = new Map<string, string>(visible.map((label, i) => [label, CATEGORICAL[i]!]));
  const fold = (groups: ReportGroup[]): ReportGroup[] => {
    const kept = groups.filter((g) => colorByLabel.has(g.label));
    const other = groups.filter((g) => !colorByLabel.has(g.label)).reduce((s, g) => s + g.value, 0);
    return other > 0 ? [...kept, { label: "Other", value: other }] : kept;
  };
  colorByLabel.set("Other", OTHER_COLOR);
  const folded = series.map((s) => ({ ...s, groups: fold(s.groups) }));
  const legendLabels = [...new Set(folded.flatMap((s) => s.groups.filter((g) => g.value > 0).map((g) => g.label)))];
  const primaryTotals = new Map(folded[0]!.groups.map((g) => [g.label, g.value]));

  return (
    <div className="flex flex-wrap items-center gap-8">
      <div className="flex flex-wrap items-start gap-6">
        {folded.map((s) => (
          <RoundChart
            key={s.label}
            groups={s.groups}
            colorByLabel={colorByLabel}
            format={format}
            hole={hole}
            title={series.length > 1 ? s.label : undefined}
          />
        ))}
      </div>
      <ul className="flex min-w-44 flex-col gap-1.5 text-sm">
        {legendLabels.map((label) => (
          <li key={label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: colorByLabel.get(label) }} />
            <span className="min-w-0 flex-1 truncate text-ink-secondary">{label}</span>
            <span className="font-medium tabular-nums text-ink">{format(primaryTotals.get(label) ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportTable({
  series,
  totals,
  format,
}: {
  series: ChartSeries[];
  totals: number[];
  format: (n: number) => string;
}) {
  const labels = series[0]?.groups.map((g) => g.label) ?? [];
  const comparing = series.length > 1;
  const change = (cur: number, prev: number) =>
    prev === 0 ? (cur === 0 ? "—" : "new") : `${cur >= prev ? "+" : ""}${(((cur - prev) / prev) * 100).toFixed(1)}%`;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-muted">
          <th className="pb-2 pr-4 font-medium">Group</th>
          <th className="pb-2 pr-4 text-right font-medium">{comparing ? series[0]!.label : "Value"}</th>
          {comparing && <th className="pb-2 pr-4 text-right font-medium">{series[1]!.label}</th>}
          {comparing ? (
            <th className="pb-2 text-right font-medium">Change</th>
          ) : (
            <th className="pb-2 text-right font-medium">Share</th>
          )}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, row) => {
          const cur = series[0]?.groups[row]?.value ?? 0;
          const prev = series[1]?.groups[row]?.value ?? 0;
          return (
            <tr key={label} className="border-t border-border">
              <td className="py-1.5 pr-4">{label}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{format(cur)}</td>
              {comparing && <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{format(prev)}</td>}
              <td className="py-1.5 text-right text-xs tabular-nums text-ink-muted">
                {comparing
                  ? change(cur, prev)
                  : (totals[0] ?? 0) > 0
                    ? `${((cur / totals[0]!) * 100).toFixed(1)}%`
                    : "—"}
              </td>
            </tr>
          );
        })}
        <tr className="border-t border-border font-semibold">
          <td className="py-1.5 pr-4">Total</td>
          <td className="py-1.5 pr-4 text-right tabular-nums">{format(totals[0] ?? 0)}</td>
          {comparing && <td className="py-1.5 pr-4 text-right tabular-nums text-ink-secondary">{format(totals[1] ?? 0)}</td>}
          <td className="py-1.5 text-right text-xs tabular-nums text-ink-muted">
            {comparing ? change(totals[0] ?? 0, totals[1] ?? 0) : ""}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
