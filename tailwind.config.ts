import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#006A4E", // Bangladesh Emerald Green
          hover: "#00523C",
          light: "#E6F4EA",
        },
        secondary: {
          DEFAULT: "#F42A41", // Bangladesh Red
          hover: "#D02034",
          light: "#FDE8EA",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F9FAFB",
          border: "#E5E7EB",
        },
      },
    },
  },
  plugins: [],
};

export default config;
