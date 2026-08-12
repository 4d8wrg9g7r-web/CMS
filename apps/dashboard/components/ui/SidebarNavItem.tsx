"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One item of the light sidebar (docs/design-system.md "Navigation"). Active
 * state = accent text on a white pill; everything else stays quiet so the nav
 * reads as a list of places, not a wall of buttons.
 */
export function SidebarNavItem({
  href,
  label,
  icon,
  badge,
  nested = false,
}: {
  href: string;
  label: string;
  // A pre-rendered element (e.g. <LayoutDashboard size={17} />), not a component
  // reference -- component references can't cross the server/client boundary since
  // this is a Client Component receiving props from a Server Component parent.
  icon: React.ReactNode;
  badge?: number;
  /** Secondary destination inside an expanded nav group. */
  nested?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md text-sm transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
        nested ? "h-9 pl-[38px] pr-3" : "h-11 px-3"
      } ${
        isActive
          ? "bg-surface font-semibold text-accent shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          : "text-ink-secondary hover:bg-black/[0.04] hover:text-ink"
      }`}
    >
      {!nested && <span className={isActive ? "text-accent" : "text-ink-muted"}>{icon}</span>}
      <span className={`flex-1 truncate ${isActive ? "" : "font-medium"}`}>{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs font-medium text-ink-secondary">{badge}</span>
      )}
    </Link>
  );
}
