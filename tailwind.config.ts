import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        site: "var(--bg)",
        surface: "var(--surface)",
        main: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        border: "var(--border)",
        navy: {
          800: "#1E293B",
          900: "#0F172A",
          950: "#071229",
        },
        emerald: {
          base: "#0B6E55",
          accent: "#0FA36B",
          mint: "#5BE3AB",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        container: "1160px",
      },
      borderRadius: {
        card: "18px",
        btn: "12px",
      },
      spacing: {
        sectionDesktop: "96px",
        sectionMobile: "64px",
      },
    },
  },
  plugins: [],
};

export default config;
