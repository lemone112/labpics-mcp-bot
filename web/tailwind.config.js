const { heroui } = require("@heroui/theme");

module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx,mdx}",
    "./components/**/*.{js,jsx,ts,tsx,mdx}",
    "./hooks/**/*.{js,jsx,ts,tsx,mdx}",
    "./lib/**/*.{js,jsx,ts,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/react/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    heroui({
      defaultTheme: "dark",
      themes: {
        dark: {
          colors: {
            background: "#05070d",
            foreground: "#dce7f9",
            divider: "rgba(148, 163, 184, 0.22)",
            overlay: "#04050b",
            focus: "#22d3ee",
            content1: "#0b1020",
            content2: "#11192d",
            content3: "#16223a",
            content4: "#1b2a44",
            default: {
              foreground: "#e6edf8",
              DEFAULT: "#131d2f",
            },
            primary: {
              50: "#ecfdff",
              100: "#cffafe",
              200: "#a5f3fc",
              300: "#67e8f9",
              400: "#22d3ee",
              500: "#06b6d4",
              600: "#0891b2",
              700: "#0e7490",
              800: "#155e75",
              900: "#164e63",
              foreground: "#04151e",
              DEFAULT: "#22d3ee",
            },
            secondary: {
              300: "#c4b5fd",
              400: "#a78bfa",
              500: "#8b5cf6",
              600: "#7c3aed",
              foreground: "#f4f1ff",
              DEFAULT: "#8b5cf6",
            },
            success: {
              400: "#4ade80",
              500: "#22c55e",
              600: "#16a34a",
              foreground: "#03130a",
              DEFAULT: "#22c55e",
            },
            warning: {
              400: "#fbbf24",
              500: "#f59e0b",
              600: "#d97706",
              foreground: "#1a1003",
              DEFAULT: "#f59e0b",
            },
            danger: {
              400: "#fb7185",
              500: "#f43f5e",
              600: "#e11d48",
              foreground: "#20050c",
              DEFAULT: "#f43f5e",
            },
          },
          layout: {
            radius: {
              small: "10px",
              medium: "14px",
              large: "18px",
            },
            borderWidth: {
              small: "1px",
              medium: "1px",
              large: "1px",
            },
            boxShadow: {
              small: "0 8px 22px rgba(3, 8, 20, 0.34)",
              medium: "0 12px 34px rgba(3, 8, 20, 0.4)",
              large: "0 20px 56px rgba(3, 8, 20, 0.48)",
            },
          },
        },
      },
    }),
  ],
};
