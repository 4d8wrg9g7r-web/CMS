import type { ReactNode } from "react";

/**
 * The one page-header recipe (docs/design-system.md "Page header"): a big,
 * confident title, one quiet line of context under it, and the page's primary
 * action(s) on the right. Detail pages pass `back` for a small return link
 * above the title. No breadcrumbs unless hierarchy genuinely matters.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-8 ${className}`}>
      {back}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display text-[32px] leading-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-[15px] text-ink-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
      </div>
    </div>
  );
}
