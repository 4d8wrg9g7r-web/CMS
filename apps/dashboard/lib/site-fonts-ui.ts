import type { SiteFontId } from "@cms/database";

/**
 * Client-safe mirror of SITE_FONTS from packages/database/src/site/site-config.ts
 * (client components must not import @cms/database at runtime — Prisma/node:crypto
 * must stay out of the browser bundle). parseSiteConfig re-validates the font id
 * server-side on save, so drift here can mislabel a choice but never inject a
 * font-family string.
 */
export const SITE_FONTS_UI: { id: SiteFontId; label: string; stack: string }[] = [
  {
    id: "modern",
    label: "Modern",
    stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  { id: "classic", label: "Classic", stack: "Georgia, 'Times New Roman', Times, serif" },
  { id: "elegant", label: "Elegant", stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  { id: "friendly", label: "Friendly", stack: "'Trebuchet MS', Verdana, 'Segoe UI', sans-serif" },
  // Self-hosted webfonts (public/fonts, @font-face in globals.css — the
  // dashboard loads the same faces, so panel previews render for real).
  { id: "inter", label: "Inter", stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { id: "fraunces", label: "Fraunces", stack: "'Fraunces', Georgia, serif" },
  { id: "lora", label: "Lora", stack: "'Lora', Georgia, serif" },
  { id: "outfit", label: "Outfit", stack: "'Outfit', ui-sans-serif, system-ui, sans-serif" },
];
