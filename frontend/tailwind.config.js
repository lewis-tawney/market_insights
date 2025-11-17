import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: {
          DEFAULT: "hsl(var(--background))",
          muted: "hsl(var(--background-muted))",
          raised: "hsl(var(--background-raised))",
        },
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        ringAccent: "hsl(var(--ring-accent))",
        trading: {
          charcoal: "#0f1117",
          basalt: "#151922",
          graphite: "#1a1f2b",
          slate: "#1f2431",
          cyan: "#4bdff7",
          emerald: "#2de89d",
          amber: "#f9b44c",
          rose: "#ff6f91",
        },
      },
      borderRadius: {
        xs: "0.2rem",
        sm: "0.35rem",
        md: "0.5rem",
        lg: "0.6rem",
        xl: "1.1rem",
        "2xl": "1.75rem",
        "3xl": "2.5rem",
      },
      spacing: {
        gutter: ".7rem",
        stack: "1rem",
        panel: "1rem",
        rail: "2rem",
        shell: "1.5rem",
      },
      fontFamily: {
        sans: ["'Inter'", "'SF Pro Text'", "'Segoe UI'", ...fontFamily.sans],
        mono: [
          "'JetBrains Mono'",
          "'SFMono-Regular'",
          "'Menlo'",
          ...fontFamily.mono,
        ],
      },
      fontSize: {
        "body-xs": ["0.75rem", { lineHeight: "1.3" }],
        body: ["0.875rem", { lineHeight: "1.55" }],
        "body-lg": ["0.9375rem", { lineHeight: "1.6" }],
        "heading-sm": ["1.3rem", { lineHeight: "1.4" }],
        "heading-md": ["1.4rem", { lineHeight: "1.35" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.3" }],
        "heading-xl": ["1.75rem", { lineHeight: "1.25" }],
      },
      boxShadow: {
        shell: "0 20px 45px rgba(6, 11, 20, 0.45)",
        card: "0 8px 20px rgba(5, 8, 15, 0.35)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
