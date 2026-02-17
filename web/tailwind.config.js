const { heroui } = require("@heroui/theme");

const sharedLayout = {
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
    small: "0 6px 16px rgba(20, 24, 40, 0.06)",
    medium: "0 14px 30px rgba(20, 24, 40, 0.08)",
    large: "0 22px 48px rgba(20, 24, 40, 0.12)",
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
            background: "#f5f6fb",
            foreground: "#111827",
            divider: "rgba(15, 23, 42, 0.08)",
            overlay: "rgba(15, 23, 42, 0.42)",
            focus: "#635bff",
            content1: "#ffffff",
            content2: "#f8f9ff",
            content3: "#f2f4ff",
            content4: "#ebefff",
            default: {
              foreground: "#1f2937",
              DEFAULT: "#eef1fb",
            },
            primary: {
              50: "#eeefff",
              100: "#e0e1ff",
              200: "#c8caff",
              300: "#aaacff",
              400: "#8786ff",
              500: "#635bff",
              600: "#5648f6",
              700: "#473bd1",
              800: "#3932a6",
              900: "#2f2c80",
              foreground: "#ffffff",
              DEFAULT: "#635bff",
            },
            secondary: {
              100: "#f5f1ff",
              200: "#ece3ff",
              300: "#ddccff",
              400: "#c5a9ff",
              500: "#aa82ff",
              600: "#9567ff",
              foreground: "#22163f",
              DEFAULT: "#aa82ff",
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
            focus: "#8786ff",
            content1: "#11172a",
            content2: "#171f35",
            content3: "#1d2942",
            content4: "#22334e",
            default: {
              foreground: "#e6edf8",
              DEFAULT: "#192138",
            },
            primary: {
              100: "#e0e1ff",
              200: "#c8caff",
              300: "#aaacff",
              400: "#8786ff",
              500: "#635bff",
              600: "#5648f6",
              700: "#473bd1",
              800: "#3932a6",
              foreground: "#eef0ff",
              DEFAULT: "#8786ff",
            },
            secondary: {
              300: "#ddccff",
              400: "#c5a9ff",
              500: "#aa82ff",
              600: "#9567ff",
              foreground: "#f9f5ff",
              DEFAULT: "#aa82ff",
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
