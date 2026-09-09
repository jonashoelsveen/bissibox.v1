/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        card: "#141414",
        border: "#262626",
        "text-primary": "#fafafa",
        "text-muted": "#737373",
        accent: "#3b82f6",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
