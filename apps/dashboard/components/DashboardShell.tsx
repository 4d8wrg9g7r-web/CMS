"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu, PanelLeft, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CommandPalette } from "./CommandPalette";
import { PageTransition } from "./ui/PageTransition";

/**
 * The application shell (docs/design-system.md "Shell"): a light 250px
 * sidebar that collapses away, a quiet top bar carrying global search
 * (opens the ⌘K palette) and the one global "+ Create" menu, and the page
 * canvas. Below `lg` the sidebar becomes an off-canvas drawer.
 */

const CREATE_ITEMS: { label: string; href: string }[] = [
  { label: "Person", href: "/people/new" },
  { label: "Group", href: "/groups/new" },
  { label: "Event", href: "/events/new" },
  { label: "Message", href: "/messages/new" },
  { label: "Form", href: "/forms/new" },
  { label: "Automation", href: "/workflows/new" },
  { label: "Journey", href: "/journeys/new" },
];

function CreateMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="create-button"
        className="inline-flex h-10 items-center gap-1.5 rounded bg-accent px-4 text-sm font-semibold text-white shadow-panel transition-colors duration-180 hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <Plus size={16} /> Create <ChevronDown size={14} className="opacity-70" />
      </button>
      <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-50 mt-2 w-48 origin-top-right overflow-hidden rounded-md border border-border bg-surface py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.12)]"
            data-testid="create-menu"
          >
            {CREATE_ITEMS.map((item) => (
              <Link
                key={item.href}
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
              >
                {item.label}
              </Link>
            ))}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

export function DashboardShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Collapse preference survives reloads; read once after mount (SSR-safe).
  useEffect(() => {
    setCollapsed(localStorage.getItem("cms.sidebar.collapsed") === "1");
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem("cms.sidebar.collapsed", c ? "0" : "1");
      return !c;
    });
  };

  const openPalette = () => window.dispatchEvent(new CustomEvent("cms:open-palette"));

  return (
    <div className="flex min-h-screen bg-background">
      <CommandPalette />

      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setDrawerOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out print:hidden lg:static ${
          collapsed ? "lg:w-0 lg:overflow-hidden lg:border-r-0" : "lg:w-[250px]"
        } w-[250px] ${drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-3.5 rounded-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        >
          <X size={18} />
        </button>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur print:hidden md:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-ink-secondary hover:bg-black/[0.04] hover:text-ink lg:hidden"
          >
            <Menu size={19} />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-md p-1.5 text-ink-muted transition-colors duration-180 hover:bg-black/[0.04] hover:text-ink lg:block"
          >
            <PanelLeft size={18} />
          </button>

          <button
            type="button"
            onClick={openPalette}
            data-testid="global-search"
            className="flex h-10 w-full max-w-md items-center gap-2.5 rounded border border-border bg-surface px-3.5 text-sm text-ink-muted shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors duration-180 hover:border-border-strong"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search</span>
            <kbd className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto">
            <CreateMenu />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8 lg:px-10">
          <div className="mx-auto max-w-[1440px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
