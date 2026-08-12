"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { GlobalSearchResults } from "@cms/database";
import { globalSearchAction } from "../app/(dashboard)/search-actions";

/**
 * The command palette (docs/design-system.md "Command palette"): ⌘K / Ctrl-K
 * anywhere in the dashboard, or the top-bar search field. Typing filters
 * navigation + create actions instantly and searches real entities (people,
 * groups, events, forms, sermons, campaigns, reports) through a debounced,
 * permission-aware server action. Everything is reachable from the keyboard.
 */

interface StaticCommand {
  label: string;
  hint?: string;
  href: string;
  keywords: string;
}

const DESTINATIONS: StaticCommand[] = [
  { label: "Home", href: "/dashboard", keywords: "home overview dashboard" },
  { label: "People", href: "/people", keywords: "people person members directory" },
  { label: "Groups", href: "/groups", keywords: "groups small" },
  { label: "Events", href: "/events", keywords: "events calendar" },
  { label: "Messages", href: "/messages", keywords: "messages email communicate blast" },
  { label: "Forms", href: "/forms", keywords: "forms" },
  { label: "Automations", href: "/workflows", keywords: "automations workflows" },
  { label: "Journeys", href: "/journeys", keywords: "journeys pathway" },
  { label: "Tasks", href: "/tasks", keywords: "tasks todo follow up" },
  { label: "Giving", href: "/giving", keywords: "giving donations money" },
  { label: "Campaigns", href: "/giving/campaigns", keywords: "campaigns pledge building fund" },
  { label: "Online giving settings", href: "/giving/online", keywords: "stripe online giving settings text" },
  { label: "Reports", href: "/reports", keywords: "reports analytics charts" },
  { label: "Attendance", href: "/attendance", keywords: "attendance check in" },
  { label: "Sermons", href: "/sermons", keywords: "sermons messages media watch" },
  { label: "Community", href: "/community", keywords: "community feed posts moderation" },
  { label: "Church App", href: "/app-studio", keywords: "app studio mobile church app" },
  { label: "Website", href: "/website", keywords: "website site builder pages" },
  { label: "Serving", href: "/serving", keywords: "serving volunteers teams" },
  { label: "Team", href: "/team", keywords: "team staff roles invite" },
  { label: "Audit Log", href: "/audit-log", keywords: "audit log history" },
  { label: "Developers", href: "/developers", keywords: "developers api keys webhooks" },
  { label: "Settings", href: "/settings", keywords: "settings organization" },
];

const ACTIONS: StaticCommand[] = [
  { label: "Add person", hint: "Create", href: "/people/new", keywords: "add new person member create" },
  { label: "Create group", hint: "Create", href: "/groups/new", keywords: "add new group create" },
  { label: "Create event", hint: "Create", href: "/events/new", keywords: "add new event create" },
  { label: "Send message", hint: "Create", href: "/messages/new", keywords: "send email message blast create new" },
  { label: "Build form", hint: "Create", href: "/forms/new", keywords: "new form create build" },
  { label: "Create automation", hint: "Create", href: "/workflows/new", keywords: "new workflow automation create" },
  { label: "Create journey", hint: "Create", href: "/journeys/new", keywords: "new journey create" },
  { label: "Import people", hint: "Create", href: "/people/import", keywords: "import csv upload people" },
];

const EMPTY: GlobalSearchResults = { people: [], groups: [], events: [], forms: [], sermons: [], campaigns: [], reports: [] };

interface Row {
  key: string;
  group: string;
  label: string;
  sublabel?: string | null;
  href: string;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef("");

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setActive(0);
  }, []);

  // Global shortcuts: ⌘K/Ctrl-K toggles; the top bar fires cms:open-palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cms:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cms:open-palette", onOpen);
    };
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced entity search; stale responses are dropped.
  useEffect(() => {
    if (!open) return;
    latestQuery.current = query;
    if (query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const q = query;
      const r = await globalSearchAction(q).catch(() => null);
      if (r && latestQuery.current === q) setResults(r);
    }, 180);
  }, [query, open]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const matchStatic = (commands: StaticCommand[], group: string) =>
      commands
        .filter((c) => !q || c.label.toLowerCase().includes(q) || c.keywords.includes(q))
        .slice(0, q ? 6 : 8)
        .map((c) => ({ key: `${group}:${c.href}`, group, label: c.label, sublabel: c.hint, href: c.href }));

    const entity = (hits: { id: string; label: string; sublabel: string | null }[], group: string, href: (id: string) => string) =>
      hits.map((h) => ({ key: `${group}:${h.id}`, group, label: h.label, sublabel: h.sublabel, href: href(h.id) }));

    return [
      ...matchStatic(ACTIONS, "Actions"),
      ...entity(results.people, "People", (id) => `/people/${id}`),
      ...entity(results.groups, "Groups", (id) => `/groups/${id}`),
      ...entity(results.events, "Events", (id) => `/events/${id}`),
      ...entity(results.campaigns, "Campaigns", (id) => `/giving/campaigns/${id}`),
      ...entity(results.forms, "Forms", (id) => `/forms/${id}`),
      ...entity(results.sermons, "Sermons", () => `/sermons`),
      ...entity(results.reports, "Reports", () => `/reports`),
      ...matchStatic(DESTINATIONS, "Go to"),
    ];
  }, [query, results]);

  useEffect(() => {
    setActive(0);
  }, [rows.length, query]);

  const select = (row: Row) => {
    close();
    router.push(row.href);
  };

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/25 p-4 pt-[12vh]" onClick={close} role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.06),0_24px_60px_rgba(0,0,0,0.18)]"
        onClick={(e) => e.stopPropagation()}
        data-testid="command-palette"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={17} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && rows[active]) {
                e.preventDefault();
                select(rows[active]);
              }
            }}
            placeholder="Search people, events, giving — or type a command…"
            className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
            aria-label="Search"
          />
          <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-ink-muted sm:block">esc</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto py-2" role="listbox">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {query.trim().length >= 2 ? "Nothing found — try a name, event, or fund." : "Type to search everything in CMS."}
            </p>
          ) : (
            rows.map((row, i) => {
              const header = row.group !== lastGroup ? row.group : null;
              lastGroup = row.group;
              return (
                <div key={row.key}>
                  {header && (
                    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted first:pt-1">{header}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => select(row)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                      i === active ? "bg-surface-muted text-ink" : "text-ink-secondary"
                    }`}
                  >
                    <span className="flex-1 truncate font-medium text-ink">{row.label}</span>
                    {row.sublabel ? <span className="truncate text-xs text-ink-muted">{row.sublabel}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
