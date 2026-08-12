# Design system

The staff dashboard's visual and interaction language. The philosophy:
**complexity lives underneath the interface, not inside it** — CMS is enormous,
and the UI's job is to make it feel small. Calm, spacious, obvious; expensive
because it is restrained, not decorated.

## Tokens (`apps/dashboard/app/globals.css`)

Every component styles itself through CSS variables consumed by the Tailwind
theme (`tailwind.config.ts`) — never raw hex in components.

| Token | Value | Use |
|---|---|---|
| `--background` | `#F5F5F7` | Page canvas only, never a card |
| `--surface` | `#FFFFFF` | Cards, panels, inputs |
| `--surface-muted` | `#F6F6F8` | Recessed content inside a card |
| `--surface-warm` | `#E9EFFC` | Accent-tinted icon chips only |
| `--sidebar` | `#EFEFF2` | The shell sidebar |
| `--text-primary` | `#1D1D1F` | Primary text |
| `--text-secondary` | `#6E6E73` | Supporting text |
| `--text-muted` | `#86868B` | Metadata; never below AA on white |
| `--border` | `rgba(0,0,0,.08)` | Hairlines |
| `--border-strong` | `rgba(0,0,0,.13)` | Inputs, emphasized edges |
| `--accent` | `#2566E8` | The one product accent |

The accent appears only on interactive UI: primary actions, active nav, links,
selections, progress, focus. Status colors (`success/warning/danger`) are quiet,
never fluorescent. The palette is deliberately neutral so each church's own
brand (app themes, site accents) reads against it without fighting the chrome.

**Typography** — Inter with the system stack. Page titles use `.text-display`
(32px, weight 650, -0.035em); hero numbers use `.text-metric` (tabular).
Body is 14–16px; nothing interactive below 14px, metadata never below 12px.

**Surfaces** — cards are `rounded-xl` (20px) with `.shadow-panel`
(`0 1px 2px rgba(0,0,0,.03), 0 8px 30px rgba(0,0,0,.04)`); controls are
`rounded` (10px). Prefer whitespace and background changes over boxes;
`prefers-reduced-motion` is honored globally.

## Shell (`components/DashboardShell.tsx`)

A light 250px sidebar (collapsible, preference persisted), a quiet top bar
(global search field that opens the palette + the one global **+ Create**
menu), and the page canvas (max 1440px). Below `lg` the sidebar is an
off-canvas drawer.

## Navigation (`app/(dashboard)/layout.tsx`)

Organized around the staff mental model, not the database: **Home, People,
Groups, Events, Giving** as primary destinations, then **Communicate**
(Messages, Forms, Automations, Journeys, Tasks), **Content** (Sermons,
Community), **Digital** (Church App, Website), **More** (Reports, Attendance,
Serving, Team, Audit Log, Developers). Groups auto-open when the current route
lives inside them. Grouping hides architecture, never capability — everything
stays one keystroke away via the palette. Product language over database
language: "Automations", not "Workflow Definitions".

## Command palette (`components/CommandPalette.tsx`)

⌘K / Ctrl-K anywhere, or the top-bar search field. Instant filtering over
destinations and create-actions; debounced entity search (people, groups,
events, forms, sermons, campaigns, reports) through
`searchService.globalSearch` — tenant-scoped, bounded (5 per type), and
permission-aware: the action (`search-actions.ts`) never queries entity types
the current role can't view. Full keyboard navigation.

## Page header (`components/ui/PageHeader.tsx`)

Title (display scale), one line of context, primary actions right-aligned,
optional back link. Detail pages share one structure: identity → metadata →
actions → tabs → content.

## Inspector (`components/ui/Inspector.tsx`)

The slide-over side panel for contextual micro-edits: inspect or act on a
row without leaving the page (rule 2 below). 400px, slides from the right in
200ms (reduced-motion aware), backdrop + Escape close, header + scrollable
body. First use: event registration rows (`EventRegistrationList`) — details,
view profile, email, cancel — all through the same permission-gated server
actions as before. Full pages remain the answer for complex editing.

## Workspaces

**Communicate** (`/communicate`) ties the reach-people tools into one landing:
role-aware create tiles (message, form, automation, journey), recently sent
blasts, automation list, and the follow-up tasks they produce. **Giving**
pages share `GivingSectionNav` (Overview / Campaigns / Online giving / Funds /
Statements) and lead with one hero number; campaign detail draws the ledger
large. Detail pages (person, group, event) share the identity-header + stat
strip + tabs structure.

## Rules

1. UI work goes through the established service layer — the design system
   never bypasses tenant scoping, permissions, or audit.
2. Modals only for destructive confirmation; side panels for contextual
   editing; full pages for complex creation.
3. Motion 150–300ms, subtle; never used to hide slowness.
4. Every empty state teaches: what this is, why it matters, one action.
5. Errors say what happened and what to do next, with a recovery link.
