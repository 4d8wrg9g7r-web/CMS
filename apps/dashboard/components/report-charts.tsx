"use client";

import type { ReportGroup } from "@cms/database";

/**
 * Dependency-free report charts. Palette and mark specs follow the dataviz
 * method: single hue for single-series magnitude (bar/line), fixed-order
 * categorical hues for identity (donut, never cycled, >7 folds to Other),
 * thin marks with surface gaps, values in text tokens (never series color),
 * hover tooltips via native titles, and the data table always rendered
 * alongside (which also satisfies the palette's contrast relief).
 * Validated with the skill's validator (all checks pass, light surface).
 */

const SERIES_1 = "#2a78d6";
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#52514e";

export function ReportBarChart({ groups, format }: { groups: ReportGroup[]; format: (n: number) => string }) {
  const max = Math.max(...groups.map((g) => g.value), 1);
  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label="Bar chart">
      {groups.map((g) => (
        <div key={g.label} className="group flex items-center gap-3" title={`${g.label}: ${format(g.value)}`}>
          <span className="w-36 shrink-0 truncate text-right text-xs text-ink-secondary">{g.label}</span>
          <div className="h-5 flex-1 rounded-[4px] bg-surface-muted">
            <div
              className="h-5 rounded-[4px] transition-all duration-300 group-hover:brightness-110"
              style={{ width: `${Math.max((g.value / max) * 100, g.value > 0 ? 1 : 0)}%`, backgroundColor: SERIES_1 }}
            />
          </div>
          <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-ink">{format(g.value)}</span>
        </div>
      ))}
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

export function ReportLineChart({ groups, format }: { groups: ReportGroup[]; format: (n: number) => string }) {
  const W = 720;
  const H = 240;
  const PAD = { top: 20, right: 52, bottom: 26, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(...groups.map((g) => g.value), 1));
  const x = (i: number) => PAD.left + (groups.length === 1 ? innerW / 2 : (i / (groups.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const points = groups.map((g, i) => `${x(i)},${y(g.value)}`).join(" ");
  const area = `${PAD.left},${y(0)} ${points} ${x(groups.length - 1)},${y(0)}`;
  // Sparse x labels: first, last, and a few between.
  const labelEvery = Math.max(1, Math.ceil(groups.length / 6));
  const last = groups.length - 1;

  return (
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
      {groups.length > 1 && <polygon points={area} fill={SERIES_1} opacity={0.08} />}
      <polyline points={points} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {groups.map((g, i) => (
        <g key={g.label}>
          {/* Visible dot is small; the hit target is generous per the hover spec. */}
          <circle cx={x(i)} cy={y(g.value)} r={3} fill={SERIES_1} />
          <circle cx={x(i)} cy={y(g.value)} r={11} fill="transparent">
            <title>{`${g.label}: ${format(g.value)}`}</title>
          </circle>
          {/* Selective direct labels: endpoints only, in text ink. */}
          {(i === 0 || i === last) && groups.length > 1 && g.value > 0 && (
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
  );
}

export function ReportDonutChart({ groups, format }: { groups: ReportGroup[]; format: (n: number) => string }) {
  // Fixed-order categorical hues; everything past the 7th slice folds into Other.
  const visible = groups.slice(0, 7);
  const rest = groups.slice(7);
  const slices = [
    ...visible.map((g, i) => ({ ...g, color: CATEGORICAL[i]! })),
    ...(rest.length > 0
      ? [{ label: `Other (${rest.length})`, value: rest.reduce((s, g) => s + g.value, 0), color: OTHER_COLOR }]
      : []),
  ].filter((s) => s.value > 0);
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
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 180 180" className="h-44 w-44" role="img" aria-label="Donut chart">
        {slices.length === 1 ? (
          <circle cx={CX} cy={CY} r={R} fill={slices[0]!.color} stroke="#fcfcfb" strokeWidth={2} />
        ) : (
          slices.map((s) => {
            const start = acc / total;
            acc += s.value;
            const end = acc / total;
            return (
              <path key={s.label} d={arc(start, end)} fill={s.color} stroke="#fcfcfb" strokeWidth={2}>
                <title>{`${s.label}: ${format(s.value)} (${Math.round(((end - start) * 1000)) / 10}%)`}</title>
              </path>
            );
          })
        )}
        <circle cx={CX} cy={CY} r={40} fill="#fcfcfb" />
      </svg>
      <ul className="flex min-w-44 flex-col gap-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-secondary">{s.label}</span>
            <span className="font-medium tabular-nums text-ink">{format(s.value)}</span>
            <span className="w-11 text-right text-xs tabular-nums text-ink-muted">
              {((s.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportTable({ groups, total, format }: { groups: ReportGroup[]; total: number; format: (n: number) => string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-muted">
          <th className="pb-2 pr-4 font-medium">Group</th>
          <th className="pb-2 pr-4 text-right font-medium">Value</th>
          <th className="pb-2 text-right font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.label} className="border-t border-border">
            <td className="py-1.5 pr-4">{g.label}</td>
            <td className="py-1.5 pr-4 text-right tabular-nums">{format(g.value)}</td>
            <td className="py-1.5 text-right text-xs tabular-nums text-ink-muted">
              {total > 0 ? `${((g.value / total) * 100).toFixed(1)}%` : "—"}
            </td>
          </tr>
        ))}
        <tr className="border-t border-border font-semibold">
          <td className="py-1.5 pr-4">Total</td>
          <td className="py-1.5 pr-4 text-right tabular-nums">{format(total)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}
