import Link from "next/link";

/**
 * Quiet section navigation shared by the Giving pages
 * (docs/design-system.md "Detail pages") — one consistent row instead of a
 * pile of buttons in every corner.
 */

const SECTIONS = [
  { label: "Overview", href: "/giving" },
  { label: "Campaigns", href: "/giving/campaigns" },
  { label: "Online giving", href: "/giving/online" },
  { label: "Funds", href: "/giving/funds" },
  { label: "Statements", href: "/giving/statements" },
];

export function GivingSectionNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-border" aria-label="Giving sections">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          aria-current={active === s.href ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-180 ${
            active === s.href
              ? "border-accent font-semibold text-ink"
              : "border-transparent font-medium text-ink-secondary hover:text-ink"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
