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
          DEFAULT: "#006A4E", // Bangladesh Emerald Green
          hover: "#005A42",
          light: "#E3F3EC",
          50: "#EEF8F3",
          100: "#D3EEE2",
          200: "#A8DCC5",
          300: "#73C3A2",
          400: "#35A07B",
          500: "#0B8261",
          600: "#006A4E",
          700: "#005A42",
          800: "#004532",
          900: "#002116",
        },
        secondary: {
          DEFAULT: "#C5221F",
          hover: "#A50E0E",
          light: "#FCE8E6",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8F9FA",
          border: "#E3E5E8",
          canvas: "#F6F8FA",
        },
      },
      boxShadow: {
        // Material elevation levels
        card: "0 1px 2px 0 rgb(60 64 67 / 0.08)",
        raised: "0 1px 2px 0 rgb(60 64 67 / 0.30), 0 1px 3px 1px rgb(60 64 67 / 0.15)",
        pop: "0 2px 6px 2px rgb(60 64 67 / 0.15), 0 1px 2px 0 rgb(60 64 67 / 0.30)",
        fab: "0 4px 8px 3px rgb(60 64 67 / 0.15), 0 1px 3px 0 rgb(60 64 67 / 0.30)",
        nav: "0 -1px 0 0 rgb(60 64 67 / 0.08)",
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
