"use client";

import { useState, type ReactNode } from "react";
import { Check, Eye, EyeOff, GripVertical, Loader2, SlidersHorizontal } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { saveDashboardLayoutAction } from "../app/(dashboard)/dashboard/actions";
import type { DashboardConfig, DashboardSection } from "@cms/database";

/**
 * Personal "edit dashboard" mode (docs/domain/reports.md): drag (or arrow-key
 * buttons) to reorder pinned report cards and eye-toggle sections on/off. The
 * server page fetches everything the viewer's permissions allow and passes the
 * rendered sections in; this component only arranges and hides — hiding is
 * preference, never access control. Layout persists per user via
 * saveDashboardLayoutAction on Done.
 */

export interface CustomizerReportCard {
  id: string;
  name: string;
  node: ReactNode;
}

export interface CustomizerSection {
  key: DashboardSection;
  label: string;
  node: ReactNode;
}

export function DashboardCustomizer({
  initialConfig,
  /** Non-report sections that exist for this viewer, in fixed render order. */
  sectionsBefore,
  sectionsAfter,
  reportCards,
  hasPinnedReports,
}: {
  initialConfig: DashboardConfig;
  sectionsBefore: CustomizerSection[];
  sectionsAfter: CustomizerSection[];
  reportCards: CustomizerReportCard[];
  hasPinnedReports: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState<string[]>(reportCards.map((c) => c.id));
  const [hidden, setHidden] = useState<Set<DashboardSection>>(new Set(initialConfig.hiddenSections));
  const [dragId, setDragId] = useState<string | null>(null);

  const orderedCards = [...reportCards].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const toggleSection = (key: DashboardSection) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const moveCard = (id: string, delta: -1 | 1) =>
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = prev.filter((id) => id !== dragId);
      next.splice(next.indexOf(targetId), 0, dragId);
      return next;
    });
  };

  const done = async () => {
    setSaving(true);
    await saveDashboardLayoutAction({ config: { reportOrder: order, hiddenSections: [...hidden] } });
    setSaving(false);
    setEditing(false);
  };

  const sectionShell = (section: CustomizerSection, content: ReactNode) => {
    const isHidden = hidden.has(section.key);
    if (!editing) return isHidden ? null : <div key={section.key}>{content}</div>;
    return (
      <div key={section.key} data-section={section.key} className="rounded-lg border border-dashed border-accent/50 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{section.label}</span>
          <button
            type="button"
            onClick={() => toggleSection(section.key)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
              isHidden ? "bg-surface-muted text-ink-muted" : "text-ink-secondary hover:bg-surface-muted"
            }`}
          >
            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />} {isHidden ? "Hidden" : "Shown"}
          </button>
        </div>
        <div className={isHidden ? "opacity-40" : undefined}>{content}</div>
      </div>
    );
  };

  const reportsSection: CustomizerSection = { key: "pinnedReports", label: "Pinned reports", node: null };
  const reportsContent = (
    <div className="grid gap-6 lg:grid-cols-2">
      {orderedCards.map((card, i) => (
        <div
          key={card.id}
          draggable={editing}
          onDragStart={() => setDragId(card.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => {
            if (editing) e.preventDefault();
          }}
          onDrop={() => dropOn(card.id)}
          className={editing ? `cursor-grab ${dragId === card.id ? "opacity-50" : ""}` : undefined}
        >
          {editing && (
            <div className="mb-1 flex items-center gap-1 px-1 text-ink-muted">
              <GripVertical size={14} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{card.name}</span>
              <button
                type="button"
                aria-label={`Move ${card.name} earlier`}
                disabled={i === 0}
                onClick={() => moveCard(card.id, -1)}
                className="rounded px-1.5 py-0.5 text-xs hover:bg-surface-muted disabled:opacity-30"
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Move ${card.name} later`}
                disabled={i === orderedCards.length - 1}
                onClick={() => moveCard(card.id, 1)}
                className="rounded px-1.5 py-0.5 text-xs hover:bg-surface-muted disabled:opacity-30"
              >
                →
              </button>
            </div>
          )}
          {card.node}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {editing ? (
          <button type="button" onClick={done} disabled={saving} className={buttonClasses("primary", "sm")}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Done
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={buttonClasses("secondary", "sm")}>
            <SlidersHorizontal size={14} /> Edit dashboard
          </button>
        )}
      </div>

      <div className="flex flex-col gap-8">
        {sectionsBefore.map((s) => sectionShell(s, s.node))}
        {hasPinnedReports && sectionShell(reportsSection, reportsContent)}
        {/* Events + activity keep their side-by-side layout; hiding one lets the other keep its column. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">{sectionsAfter.map((s) => sectionShell(s, s.node))}</div>
      </div>
    </div>
  );
}
