"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * A collapsible sidebar group (docs/design-system.md "Navigation"): one quiet
 * primary row that discloses its secondary destinations. Auto-opens when the
 * current route lives inside it, so the user always sees where they are; the
 * group itself is never a destination — complexity stays underneath.
 */
export function SidebarNavGroup({
  label,
  icon,
  childHrefs,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  /** Route prefixes of the group's destinations, used for the auto-open + active tint. */
  childHrefs: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const containsActive = childHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const open = manuallyOpen ?? containsActive;

  return (
    <div>
      <button
        type="button"
        onClick={() => setManuallyOpen(!open)}
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
          containsActive && !open
            ? "font-semibold text-ink"
            : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink"
        }`}
      >
        <span className={containsActive ? "text-accent" : "text-ink-muted"}>{icon}</span>
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        <ChevronRight
          size={14}
          className={`text-ink-muted transition-transform duration-180 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5 pb-1">{children}</div>}
    </div>
  );
}
