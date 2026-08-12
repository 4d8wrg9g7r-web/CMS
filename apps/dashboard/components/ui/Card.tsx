import type { HTMLAttributes } from "react";

type CardPadding = "none" | "sm" | "md";

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-5",
  md: "p-6",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  /** Adds the hover-shadow treatment used by clickable/interactive cards (e.g. MetricCard). */
  interactive?: boolean;
}

/**
 * The one card recipe used everywhere in the dashboard and public pages --
 * `shadow-panel rounded-lg border border-border bg-surface`, previously copy-pasted
 * inline at every call site. Deliberately a single-element wrapper (no CardHeader/
 * CardFooter subcomponents) since every existing call site already has its own
 * heading/section markup that varies too much to templatize without forcing a
 * disruptive rewrite -- this only centralizes the outer box.
 */
export function Card({ padding = "sm", interactive = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`shadow-panel rounded-xl border border-border bg-surface ${PADDING_CLASSES[padding]} ${
        interactive ? "transition-shadow duration-180 hover:shadow-md" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
