"use client";

/**
 * Studio selection wrapper (docs/domain/website.md): in studio preview mode
 * every public-site section is wrapped in one of these. Hovering outlines the
 * section with its kind label; clicking posts the section index to the parent
 * studio window instead of following links. Only ever rendered when the
 * viewer is signed-in staff of the site's own organization — the public page
 * never carries this.
 */
export function StudioSectionTarget({ index, kind, children }: { index: number; kind: string; children: React.ReactNode }) {
  return (
    <div
      className="group/studio relative cursor-pointer"
      data-studio-section={index}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.parent?.postMessage({ type: "cms:select-section", index }, window.location.origin);
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-10 rounded-sm ring-2 ring-inset ring-transparent transition-all duration-150 group-hover/studio:ring-[#2566e8]" />
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-[#2566e8] px-2 py-0.5 text-xs font-semibold text-white opacity-0 transition-opacity duration-150 group-hover/studio:opacity-100">
        {kind}
      </span>
      {children}
    </div>
  );
}
