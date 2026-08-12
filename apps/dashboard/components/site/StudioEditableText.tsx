"use client";

import type { JSX } from "react";

/**
 * In-place text editing in the studio canvas (docs/domain/website.md
 * "Studio"): key single-line text fields (hero headline/subheadline, section
 * titles) render as contentEditable in studio mode and post every keystroke
 * up to the editor as cms:edit-text — the inspector field mirrors it live,
 * and Save persists through the same validated action as always. Enter
 * commits (blurs) instead of inserting a newline. Never rendered on the
 * public page.
 */
export function StudioEditableText({
  index,
  field,
  value,
  className,
  style,
  as = "span",
}: {
  index: number;
  field: string;
  value: string;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof JSX.IntrinsicElements;
}) {
  const Tag = as as "span";
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      data-editable-field={field}
      data-editable-index={index}
      className={`${className ?? ""} -mx-1 cursor-text rounded-sm px-1 outline-none transition-shadow duration-150 focus:ring-2 focus:ring-[#2566e8]/70`}
      onInput={(e) =>
        window.parent?.postMessage(
          { type: "cms:edit-text", index, field, value: String(e.currentTarget.textContent ?? "") },
          window.location.origin
        )
      }
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}
