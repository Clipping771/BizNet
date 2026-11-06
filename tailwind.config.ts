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
        // Inter covers Latin glyphs; the browser falls back per glyph to Hind Siliguri for Bangla
        sans: ["var(--font-inter)", "var(--font-bn)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        // Stripe / Linear slate neutrals
        slate: {
          850: "#131B2E",
          950: "#080C14",
        },
        // Deep Ocean Teal theme: Deep Teal (#0F766E) for primary actions, soft Mint Teal (#F0FDFA) for active states
        primary: {
          DEFAULT: "#0F766E",
          hover: "#115E59",
          active: "#134E4A",
          light: "#F0FDFA",
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
          950: "#042F2E",
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
          canvas: "#F8FAFC",
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
        card: "0 0 0 1px rgba(0, 0, 0, 0.08)",
        raised: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 12px 0 rgba(0, 0, 0, 0.08)",
        pop: "0 10px 25px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03), 0 0 0 1px rgba(0, 0, 0, 0.06)",
        fab: "0 8px 20px -4px rgba(15, 118, 110, 0.45)",
        nav: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
        card: "0.5rem",
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
