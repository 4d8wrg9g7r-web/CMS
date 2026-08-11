import { ExternalLink } from "lucide-react";
import type { AppLinkTarget, AppPageBlock } from "@cms/database";

/**
 * Renders a custom app page (docs/domain/app.md) — the church's own graphics,
 * headings, text, and buttons. Link targets resolve through the caller:
 *   tab      → switch to a bottom-bar tab (href in the public app, onClick in preview)
 *   inapp    → same-tab navigation on web (in-app browser in the native shells)
 *   external → new tab on web (system browser natively)
 * Pure and serializable-props-only: used by the public app, the studio preview,
 * and later the native renderers.
 */

export type ResolvedLink = { href: string; newTab: boolean } | { onClick: () => void } | null;

export function PageBlocksView({
  blocks,
  accent,
  resolveTarget,
}: {
  blocks: AppPageBlock[];
  accent: string;
  resolveTarget: (target: AppLinkTarget) => ResolvedLink;
}) {
  const linkWrap = (target: AppLinkTarget | null, child: React.ReactNode, key: number, block: boolean) => {
    if (!target) return <div key={key}>{child}</div>;
    const resolved = resolveTarget(target);
    if (!resolved) return <div key={key}>{child}</div>;
    if ("onClick" in resolved) {
      return (
        <button key={key} type="button" onClick={resolved.onClick} className={block ? "block w-full text-left" : undefined}>
          {child}
        </button>
      );
    }
    return (
      <a
        key={key}
        href={resolved.href}
        {...(resolved.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
        className={block ? "block" : undefined}
      >
        {child}
      </a>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "image":
            return linkWrap(
              block.link,
              // eslint-disable-next-line @next/next/no-img-element -- church-uploaded graphic
              <img src={block.url} alt={block.alt} className="w-full rounded-xl object-cover" />,
              i,
              true,
            );
          case "heading":
            return (
              <h2 key={i} className="mt-1 text-lg font-bold leading-snug text-neutral-900">
                {block.text}
              </h2>
            );
          case "text":
            return (
              <p key={i} className="whitespace-pre-wrap text-sm text-neutral-700">
                {block.text}
              </p>
            );
          case "button": {
            const isExternal = block.target.kind === "external";
            return linkWrap(
              block.target,
              <span
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {block.label}
                {isExternal && <ExternalLink size={14} />}
              </span>,
              i,
              true,
            );
          }
          case "divider":
            return <hr key={i} className="border-neutral-200" />;
        }
      })}
    </div>
  );
}
