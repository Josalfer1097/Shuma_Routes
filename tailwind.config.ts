import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--shuma-bg)",
        foreground: "var(--shuma-text)",
        shuma: {
          bg: "var(--shuma-bg)",
          surface: "var(--shuma-surface)",
          border: "var(--shuma-border)",
          blue: "var(--shuma-blue)",
          "blue-mid": "var(--shuma-blue-mid)",
          accent: "var(--shuma-accent)",
          text: "var(--shuma-text)",
          muted: "var(--shuma-muted)",
          danger: "var(--shuma-danger)",
          warning: "var(--shuma-warning)",
          success: "var(--shuma-success)",
        }
      },
      fontFamily: {
        exo: ["var(--font-exo-2)", "sans-serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
      }
    },
  },
  plugins: [],
};
export default config;
