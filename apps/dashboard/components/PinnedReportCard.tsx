"use client";

import Link from "next/link";
import { ReportBarChart, ReportLineChart, ReportRoundChart, ReportTable, type ChartSeries } from "./report-charts";

/**
 * A pinned saved report on the dashboard Overview (docs/domain/reports.md). The
 * server page re-runs the report per viewer and passes the finished series here;
 * this client boundary exists only because the chart components take a format
 * function, which can't cross the server/client divide.
 */

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function PinnedReportCard({
  name,
  chart,
  measure,
  series,
  totals,
}: {
  name: string;
  chart: string;
  measure: string;
  series: ChartSeries[];
  totals: number[];
}) {
  const format = (n: number) => (measure === "sumAmount" ? formatCents(n) : n.toLocaleString("en-US"));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{name}</h3>
        <Link
          href="/reports"
          className="rounded-sm text-xs font-medium text-accent hover:text-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Open in Reports
        </Link>
      </div>
      {chart === "line" ? (
        <ReportLineChart series={series} format={format} />
      ) : chart === "bar" ? (
        <ReportBarChart series={series} format={format} />
      ) : chart === "pie" || chart === "donut" ? (
        <ReportRoundChart series={series} format={format} hole={chart === "donut"} />
      ) : (
        <ReportTable series={series} totals={totals} format={format} />
      )}
    </div>
  );
}
