import type { Config } from "tailwindcss";

/**
 * Lets `bg-accent/70`-style opacity modifiers work on a theme color backed by a CSS
 * variable. Plain `DEFAULT: "var(--accent)"` can't be opacity-modified -- Tailwind
 * needs the color decomposed into RGB channels (`--accent-rgb: 184 123 56`, set in
 * globals.css) to build `rgb(var(...) / <alpha-value>)`. Falls back to the plain hex
 * variable when no opacity modifier is present, so unmodified usages (the vast
 * majority) are unaffected.
 */
function withOpacity(rgbVariable: string, hexVariable: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined ? `var(${hexVariable})` : `rgb(var(${rgbVariable}) / ${opacityValue})`;
}

// Not annotated as `Config` directly -- Tailwind's own Config["theme"]["extend"]["colors"]
// type is narrower than what it actually accepts at runtime (function-valued colors,
// per Tailwind's documented opacity-modifier API, aren't in the declared type). Cast on
// export instead so the object literal above isn't force-narrowed while being written.
const config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        "surface-warm": "var(--surface-warm)",
        sidebar: "var(--sidebar)",
        "sidebar-secondary": "var(--sidebar-secondary)",
        "sidebar-border": "var(--sidebar-border)",
        ink: "var(--text-primary)",
        "ink-secondary": "var(--text-secondary)",
        "ink-muted": "var(--text-muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        accent: {
          DEFAULT: withOpacity("--accent-rgb", "--accent"),
          light: "var(--accent-light)",
          dark: "var(--accent-dark)",
        },
        success: {
          DEFAULT: withOpacity("--success-rgb", "--success"),
          bg: "var(--success-background)",
        },
        warning: {
          DEFAULT: withOpacity("--warning-rgb", "--warning"),
          bg: "var(--warning-background)",
        },
        danger: {
          DEFAULT: withOpacity("--danger-rgb", "--danger"),
          bg: "var(--danger-background)",
        },
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      spacing: {
        4.5: "18px",
      },
      transitionDuration: {
        180: "180ms",
      },
    },
  },
  plugins: [],
};

export default config as unknown as Config;
