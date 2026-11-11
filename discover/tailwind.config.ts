import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f6f8",
          100: "#e6ebf0",
          200: "#c9d3de",
          300: "#9aadc0",
          400: "#6a849c",
          500: "#4d677f",
          600: "#3b5165",
          700: "#304253",
          800: "#293746",
          900: "#242f3b",
          950: "#141c24",
        },
        accent: {
          DEFAULT: "#0f7a6c",
          soft: "#d7efe9",
          muted: "#1a9a88",
        },
        warn: "#b45309",
        danger: "#b42318",
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(20,28,36,0.06), 0 8px 24px rgba(20,28,36,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
