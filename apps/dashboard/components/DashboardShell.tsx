"use client";

import { useState } from "react";
import { Menu, Wind, X } from "lucide-react";

/**
 * The dashboard shell had zero responsive treatment -- a fixed 240px sidebar with
 * no collapse at any breakpoint, desktop-only by construction. This adds an
 * off-canvas drawer below `lg`, reusing the same fixed-overlay-plus-backdrop
 * pattern InstallCodeModal.tsx already uses for its modal, not a new interaction
 * idiom for the codebase. `layout.tsx` stays the server component (keeps its data
 * fetching); this only owns the open/closed UI state.
 */
export function DashboardShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden lg:hidden">
        <div className="flex items-center gap-2">
          <Wind size={18} strokeWidth={1.75} className="text-accent" />
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">CMS</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-sm text-ink-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Menu size={20} />
        </button>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`bg-sidebar-gradient fixed inset-y-0 left-0 z-50 flex w-[240px] shrink-0 flex-col border-r border-sidebar-border transition-transform duration-200 ease-in-out print:hidden lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-3 rounded-sm text-white/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar lg:hidden"
        >
          <X size={18} />
        </button>
        {sidebar}
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8 pt-20 md:px-10 lg:pt-8">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </main>
    </div>
  );
}
