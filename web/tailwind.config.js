const { heroui } = require("@heroui/theme");

const sharedLayout = {
  radius: {
    small: "8px",
    medium: "10px",
    large: "14px",
  },
  borderWidth: {
    small: "1px",
    medium: "1px",
    large: "1px",
  },
  boxShadow: {
    small: "none",
    medium: "none",
    large: "none",
  },
};

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
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [
    heroui({
      defaultTheme: "light",
      layout: sharedLayout,
      themes: {
        light: {
          colors: {
            background: "#f4f5f7",
            foreground: "#1f2937",
            divider: "rgba(15, 23, 42, 0.08)",
            overlay: "rgba(15, 23, 42, 0.42)",
            focus: "#2f6df6",
            content1: "#ffffff",
            content2: "#f9fafb",
            content3: "#f3f4f6",
            content4: "#eceff3",
            default: {
              foreground: "#374151",
              DEFAULT: "#f3f4f6",
            },
            primary: {
              50: "#eef5ff",
              100: "#dbe9ff",
              200: "#bfd9ff",
              300: "#93bfff",
              400: "#669fff",
              500: "#2f6df6",
              600: "#245fd7",
              700: "#1f4fb0",
              800: "#1f448f",
              900: "#1e3b74",
              foreground: "#ffffff",
              DEFAULT: "#2f6df6",
            },
            secondary: {
              100: "#f3f6ff",
              200: "#e9efff",
              300: "#d9e6ff",
              400: "#c4d7ff",
              500: "#9ebbf8",
              600: "#7f9de0",
              foreground: "#1f335f",
              DEFAULT: "#9ebbf8",
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
        },
        dark: {
          extend: "dark",
          colors: {
            background: "#090d16",
            foreground: "#dce7f9",
            divider: "rgba(148, 163, 184, 0.22)",
            overlay: "#04050b",
            focus: "#669fff",
            content1: "#11172a",
            content2: "#171f35",
            content3: "#1d2942",
            content4: "#22334e",
            default: {
              foreground: "#e6edf8",
              DEFAULT: "#192138",
            },
            primary: {
              100: "#dbe9ff",
              200: "#bfd9ff",
              300: "#93bfff",
              400: "#669fff",
              500: "#2f6df6",
              600: "#245fd7",
              700: "#1f4fb0",
              800: "#1f448f",
              foreground: "#eef0ff",
              DEFAULT: "#669fff",
            },
            secondary: {
              300: "#d9e6ff",
              400: "#c4d7ff",
              500: "#9ebbf8",
              600: "#7f9de0",
              foreground: "#eff4ff",
              DEFAULT: "#9ebbf8",
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
        },
      },
    }),
  ],
};
