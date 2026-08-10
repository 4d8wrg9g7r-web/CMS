# Reports — cross-domain report builder

## Problem
Staff need answers that cut across domains — "attendance by membership status this
quarter", "giving by fund, weekly, year to date", "how many veterans joined this
year" — visualized, printable, and repeatable, without a developer writing a query
per question.

## Scope
One builder over three sources, each row linked to a Person, so person attributes
work as dimensions and filters on every source:

| | date field | dimensions | measures |
|---|---|---|---|
| **people** | createdAt (added) | status, campus, any custom field | count |
| **attendance** | occurrenceAt | + event | count, unique people |
| **giving** | receivedAt | + fund, method | total amount, count, unique people |

Grouping is either a dimension or time buckets (Sunday-start weeks / months /
years, empty buckets filled so lines don't lie). Filters: status, campus,
fund/method (giving), event (attendance), and any custom field = value. Date
ranges: presets (this month/30/90/this year/last year/all time) or custom bounds.

## Architecture
- `reporting/config.ts` (pure): `ReportConfig` + `validateReportConfig` — the single
  gate every config passes through; configs from the client AND from SavedReport
  rows are untrusted. Whitelists dims/measures per source.
- `reporting/aggregate.ts` (pure, unit-tested): bucketing, grouping,
  count/uniquePeople/sumAmount (integer cents), MAX_TIME_BUCKETS cap.
- `reporting-service.ts`: fetches slim labeled rows (REPORT_ROW_CAP 25k,
  truncation surfaced); custom-field dims/filters resolved via one values query.
  Row-level data never leaves the service — actions return aggregates only.
- **Permissions per run** (BLUEPRINT §61): the source's own permission
  (person.view / attendance.view / giving.view) PLUS person.view whenever the
  config groups or filters by person fields — aggregates over restricted fields
  still leak them. ANALYTICS_VIEWER therefore gets attendance-only reports with no
  person breakdowns.
- **SavedReport**: name + config JSON per org, re-validated on every use.

## Charts
Dependency-free (a chart library would need an ADR): horizontal bars and a line
chart in the single magnitude hue, a donut with fixed-order categorical hues
(>7 slices fold into Other), and a table — which always renders under every chart
(doubling as the palette's contrast relief). Palette validated with the dataviz
validator (CVD + contrast checks). Hover tooltips on marks; values wear text
tokens, never series color.

## PDF
Browser print over a print-clean layout — shell chrome and controls carry
print:hidden, so "Download PDF" (window.print) captures the title, headline
number, chart, and table exactly as rendered. No PDF library dependency.

## Closed AI reporting
"Ask for a report" translates a natural-language question into a ReportConfig via
Claude (`claude-opus-5`, structured output). **The model never sees data**: the
prompt contains only the question, today's date, the schema vocabulary
(sources/dimensions/measures), org configuration names+ids (campuses, funds,
events, custom-field labels), and the current config for follow-ups — no records,
no amounts, no aggregates, and results are never sent back to the API. The
returned config is untrusted input: it passes validateReportConfig and the same
per-source + person.view permission checks as a hand-built report, then runs
locally. Same propose/dispose boundary as ADR-011. Gated on `ANTHROPIC_API_KEY`;
the UI states exactly what is sent.

## Audit
`report.saved`, `report.deleted` with actor.

## Deferred
Multi-series comparisons (two measures = two charts per the one-axis rule),
period-over-period overlays, scheduled email delivery of saved reports, CSV export
of aggregates.
