import type { Config } from "tailwindcss";

const config: Config = {
  // Dark styles exist on a few screens only; nothing sets the class, so they stay off until every page supports them
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // IBM Plex Sans covers Latin glyphs; the browser falls back per glyph to Hind Siliguri for Bangla
        sans: ["var(--font-sans)", "var(--font-bn)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        slate: {
          // A shade darker than Tailwind's, so secondary text passes AA on the grey page background
          500: "#5A6A7E",
          850: "#131B2E",
          950: "#080C14",
        },
        // Trade Desk: deep navy for structure and primary actions; amber (Tailwind's scale) marks what needs attention
        primary: {
          DEFAULT: "#1E3A68",
          hover: "#172D52",
          active: "#12233F",
          light: "#EEF3FA",
          50: "#EEF3FA",
          100: "#D9E3F2",
          200: "#B5C7E3",
          300: "#8AA5CF",
          400: "#5E80B6",
          500: "#3F629C",
          600: "#2C4C82",
          700: "#1E3A68",
          800: "#172D52",
          900: "#12233F",
          950: "#0B1628",
        },
        secondary: {
          DEFAULT: "#475569",
          hover: "#334155",
          light: "#F1F5F9",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8FAFC",
          border: "#E2E8F0",
          canvas: "#F4F5F7",
          card: "#FFFFFF",
          dark: {
            DEFAULT: "#0F172A",
            canvas: "#0B0F19",
            card: "#111827",
            subtle: "#1F2937",
            border: "#1E293B",
          },
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(11, 22, 40, 0.05)",
        raised: "0 1px 2px 0 rgba(11, 22, 40, 0.06), 0 4px 12px 0 rgba(11, 22, 40, 0.08)",
        pop: "0 12px 28px -6px rgba(11, 22, 40, 0.18), 0 0 0 1px rgba(11, 22, 40, 0.06)",
        fab: "0 8px 20px -4px rgba(30, 58, 104, 0.45)",
        nav: "0 1px 2px 0 rgba(11, 22, 40, 0.04)",
      },
      // Tighter corners than Tailwind's defaults: a working tool, not a consumer app
      borderRadius: {
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.625rem",
        "3xl": "0.75rem",
        card: "0.5rem",
      },
      spacing: {
        "4.5": "1.125rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 180ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
