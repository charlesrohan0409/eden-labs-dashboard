/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warm neutral canvas the whole app sits on, plus the hairline that
        // separates every card from it.
        canvas: "#F4F3F0",
        line: "#E7E4DE",
        // Near-black for the one "hero" card per screen and the sidebar.
        night: "#141413",
        nightsoft: "#1E1E1C",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["'Instrument Serif'", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
