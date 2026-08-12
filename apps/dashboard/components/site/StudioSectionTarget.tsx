"use client";

import { useState } from "react";

/**
 * Studio selection wrapper (docs/domain/website.md): in studio preview mode
 * every public-site section is wrapped in one of these. Hovering outlines the
 * section with its kind label and a drag handle; clicking posts the section
 * index to the parent studio window instead of following links; dragging the
 * handle onto another section posts cms:reorder-section (the drop indicator
 * shows where it will land — before or after, by pointer position). Only ever
 * rendered when the viewer is signed-in staff of the site's own organization —
 * the public page never carries this.
 */
export function StudioSectionTarget({ index, kind, children }: { index: number; kind: string; children: React.ReactNode }) {
  const [dropSide, setDropSide] = useState<null | "above" | "below">(null);

  return (
    <div
      className="group/studio relative cursor-pointer"
      data-studio-section={index}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.parent?.postMessage({ type: "cms:select-section", index }, window.location.origin);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/x-cms-section")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        setDropSide(e.clientY < rect.top + rect.height / 2 ? "above" : "below");
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDropSide(null);
        const from = Number.parseInt(e.dataTransfer.getData("text/x-cms-section"), 10);
        if (Number.isNaN(from)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let to = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
        if (from < to) to -= 1;
        if (from !== to) window.parent?.postMessage({ type: "cms:reorder-section", from, to }, window.location.origin);
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-10 rounded-sm ring-2 ring-inset ring-transparent transition-all duration-150 group-hover/studio:ring-[#2566e8]" />
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-[#2566e8] px-2 py-0.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-150 group-hover/studio:opacity-100">
        {kind}
      </span>
      <span
        draggable
        data-drag-handle={index}
        title="Drag to reorder"
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("text/x-cms-section", String(index));
          e.dataTransfer.effectAllowed = "move";
        }}
        className="absolute right-2 top-2 z-10 cursor-grab select-none rounded border border-slate-200 bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-600 opacity-0 shadow-sm transition-opacity duration-150 active:cursor-grabbing group-hover/studio:opacity-100"
      >
        ⠿ Drag
      </span>
      {dropSide && (
        <div
          data-drop-indicator={dropSide}
          className={`pointer-events-none absolute inset-x-0 z-20 h-1 bg-[#2566e8] ${dropSide === "above" ? "top-0" : "bottom-0"}`}
        />
      )}
      {children}
    </div>
  );
}
