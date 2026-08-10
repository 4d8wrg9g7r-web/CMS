"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNavItem({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  // A pre-rendered element (e.g. <LayoutDashboard size={17} />), not a component
  // reference -- component references can't cross the server/client boundary since
  // this is a Client Component receiving props from a Server Component parent.
  icon: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
        isActive
          ? "bg-[rgba(181,123,57,0.13)] text-white"
          : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
      }`}
    >
      <span className={isActive ? "text-accent-light" : "text-white/40"}>{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80">{badge}</span>
      )}
    </Link>
  );
}
