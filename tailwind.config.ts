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
        // Brand: a confident modern blue for actions and focus; amber stays the "needs attention" signal
        primary: {
          DEFAULT: "#2550E6",
          hover: "#1D40C7",
          active: "#1A35A1",
          light: "#EEF3FF",
          50: "#EEF3FF",
          100: "#DCE6FF",
          200: "#C0D1FF",
          300: "#94B1FE",
          400: "#6288FA",
          500: "#3D66F2",
          600: "#2550E6",
          700: "#1D40C7",
          800: "#1A35A1",
          900: "#1B307F",
          950: "#111B47",
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
          canvas: "#F6F7FB",
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
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.04), 0 1px 3px 0 rgba(16, 24, 40, 0.03)",
        raised: "0 4px 8px -2px rgba(16, 24, 40, 0.06), 0 12px 28px -8px rgba(16, 24, 40, 0.12)",
        pop: "0 20px 40px -12px rgba(16, 24, 40, 0.22), 0 0 0 1px rgba(16, 24, 40, 0.05)",
        fab: "0 10px 24px -6px rgba(37, 80, 230, 0.55)",
        glow: "0 0 0 1px rgba(37, 80, 230, 0.08), 0 24px 60px -20px rgba(37, 80, 230, 0.35)",
        nav: "0 1px 2px 0 rgba(11, 22, 40, 0.04)",
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        card: "1rem",
      },
      spacing: {
        "4.5": "1.125rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(0.16, 1, 0.3, 1) both",
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
