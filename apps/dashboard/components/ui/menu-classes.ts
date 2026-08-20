/** Shared styling for items inside an OverflowMenu — plain module so server
 * components can call it (client modules only export renderables across the
 * boundary, not callable functions). */
export function menuItemClasses(tone: "default" | "danger" = "default"): string {
  return `block w-full rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
    tone === "danger" ? "text-danger hover:bg-danger-bg" : "text-ink hover:bg-surface-muted"
  }`;
}
