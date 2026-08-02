/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens (design.md §1) — mapped to CSS custom properties
        bg: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        // shadcn/ui aliases → design tokens
        background: "var(--bg)",
        foreground: "var(--text)",
        card: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        popover: { DEFAULT: "var(--surface)", foreground: "var(--text)" },
        primary: { DEFAULT: "var(--accent)", foreground: "var(--accent-fg)" },
        secondary: { DEFAULT: "var(--surface-2)", foreground: "var(--text)" },
        muted: { DEFAULT: "var(--surface-2)", foreground: "var(--text-2)" },
        destructive: { DEFAULT: "var(--danger)", foreground: "#ffffff" },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--accent)",
        // Text scale
        text: { DEFAULT: "var(--text)", 2: "var(--text-2)", 3: "var(--text-3)" },
        // Accent
        accent: { DEFAULT: "var(--accent)", fg: "var(--accent-fg)", soft: "var(--accent-soft)", foreground: "var(--text)" },
        // Statuses
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        card: "10px",
        lg: "10px",
        md: "8px",
        sm: "6px",
        pill: "999px",
      },
      boxShadow: {
        card: "var(--elevation)",
        modal: "0 16px 48px rgba(0,0,0,.28)",
      },
      maxWidth: {
        app: "1280px",
        checkout: "560px",
        auth: "420px",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "caret-blink": { "0%,70%,100%": { opacity: "1" }, "20%,50%": { opacity: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
