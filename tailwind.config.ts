import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        "background-deep": "var(--bg-deep)",
        foreground: "var(--text)",
        "muted-foreground": "var(--text-dim)",
        "subtle-foreground": "var(--text-muted)",
        panel: "var(--surface)",
        "panel-elevated": "var(--surface-2)",
        border: "var(--border)",
        primary: "var(--accent)",
        "primary-foreground": "var(--text-inverse)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        info: "var(--sky)",
        success: "var(--green)",
        warning: "var(--warm)",
        destructive: "var(--red)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elev)",
        glow: "var(--shadow-glow)",
        primary: "var(--shadow-primary)",
      },
      fontFamily: {
        sans: "var(--font-body)",
        display: "var(--font-display)",
        serif: "var(--font-serif)",
        mono: "var(--font-mono)",
      },
      maxWidth: {
        container: "var(--container)",
        "container-narrow": "var(--container-narrow)",
      },
    },
  },
} satisfies Config;
