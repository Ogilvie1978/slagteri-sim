import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fdf4e7",
          100: "#fae3bc",
          200: "#f5c97a",
          300: "#eeaa3a",
          400: "#e08e10",
          500: "#c47a0a",
          600: "#9e6108",
          700: "#784906",
          800: "#523204",
          900: "#2e1b02",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
