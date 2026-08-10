import { Card } from "./Card";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  /** Renders bare (no card border/shadow) for use inside a list that's already inside a Card -- most existing call sites are this shape. */
  bare?: boolean;
}

/**
 * Generalizes the "icon + centered copy" pattern the Analytics stub screen already
 * used, to replace the half-dozen independently hand-written empty-state paragraphs
 * scattered across the app. Degrades gracefully to a plain sentence when only
 * `description` is passed, so adopting it isn't a forced visual upgrade everywhere.
 */
export function EmptyState({ icon, title, description, action, bare = true }: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && <span className="text-ink-muted">{icon}</span>}
      {title && <p className="text-sm font-medium text-ink">{title}</p>}
      <p className="text-sm text-ink-secondary">{description}</p>
      {action}
    </div>
  );

  if (bare) return content;
  return <Card padding="none">{content}</Card>;
}
