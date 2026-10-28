import type { Config } from "tailwindcss";

const config: Config = {
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
        // Cool slate neutrals read crisper than the default warm gray on dense business screens
        gray: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#020617",
        },
        primary: {
          DEFAULT: "#006A4E", // Bangladesh Emerald Green
          hover: "#00573F",
          light: "#E8F5EF",
          50: "#F0F8F4",
          100: "#DCEFE6",
          200: "#B5DFCC",
          300: "#84C8AB",
          400: "#3FA27D",
          500: "#0F8461",
          600: "#006A4E",
          700: "#00573F",
          800: "#064332",
          900: "#073428",
        },
        secondary: {
          DEFAULT: "#E11D48",
          hover: "#BE123C",
          light: "#FFF1F2",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8FAFC",
          border: "#E2E8F0",
          canvas: "#F3F5F8",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.04)",
        raised: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)",
        pop: "0 16px 40px -12px rgb(15 23 42 / 0.28)",
        nav: "0 -1px 0 0 rgb(15 23 42 / 0.06), 0 -8px 24px -12px rgb(15 23 42 / 0.12)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 220ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
