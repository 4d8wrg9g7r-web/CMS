"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/Input";
import { auditActionLabel, timeAgo } from "../lib/format";

export interface AuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: Date;
  actorName: string;
}

/** Compact "key: value, key: value" rendering -- these are small structured payloads (role changed, email invited, sync counts), not documents worth a full JSON viewer. */
function formatMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(", ");
}

export function AuditLogList({ events }: { events: AuditLogRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? events.filter((e) => {
        const label = auditActionLabel(e.action).toLowerCase();
        return label.includes(q) || e.actorName.toLowerCase().includes(q) || e.targetType.toLowerCase().includes(q);
      })
    : events;

  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search by action, person, or type..."
          className="pl-9"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          {events.length === 0 ? "No activity yet." : "No events match your search."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((event) => {
            const metadataLabel = formatMetadata(event.metadata);
            return (
              <li key={event.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-ink">
                    <span className="font-medium">{event.actorName}</span> &middot; {auditActionLabel(event.action)}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">{timeAgo(event.createdAt)}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {event.targetType}
                  {metadataLabel && <span> &mdash; {metadataLabel}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
