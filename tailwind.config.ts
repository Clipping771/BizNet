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
        // Workspace-style neutral greys; 500 and up pass WCAG AA as text on white
        gray: {
          50: "#F8F9FA",
          100: "#F1F3F4",
          200: "#E3E5E8",
          300: "#C7CBD1",
          400: "#9AA0A6",
          500: "#5F6368",
          600: "#4D5156",
          700: "#3C4043",
          800: "#2D2F31",
          900: "#1F1F1F",
          950: "#121212",
        },
        primary: {
          DEFAULT: "#0A66C2", // Global Professional B2B Blue (LinkedIn standard)
          hover: "#004182",
          light: "#E8F0FE",
          50: "#F0F7FF",
          100: "#E0EFFF",
          200: "#B9DCFE",
          300: "#7CB9FC",
          400: "#3892F7",
          500: "#0A66C2",
          600: "#0252A2",
          700: "#004182",
          800: "#003264",
          900: "#002347",
        },
        secondary: {
          DEFAULT: "#D97706",
          hover: "#B45309",
          light: "#FEF3C7",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8FAFC",
          border: "#E2E8F0",
          canvas: "#F3F4F6", // LinkedIn standard clean light-gray canvas
        },
      },
      boxShadow: {
        card: "0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
        raised: "0 0 0 1px rgba(0, 0, 0, 0.12), 0 4px 14px rgba(0, 0, 0, 0.08)",
        pop: "0 10px 28px -4px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04)",
        fab: "0 6px 16px rgba(10, 102, 194, 0.35)",
        nav: "0 1px 3px rgba(0, 0, 0, 0.08)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms cubic-bezier(0.2, 0, 0, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
