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
      keyframes: {
        // Entrance for staggered list items — never scales from 0, only
        // moves/fades, per the motion rules this app follows.
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.32s cubic-bezier(0.23,1,0.32,1) both",
      },
    },
  },
  plugins: [],
};
