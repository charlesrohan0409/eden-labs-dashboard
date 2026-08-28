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
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // Modals scale from near-full, never from 0 — nothing in the real
        // world appears out of nothing. Origin stays centred: a modal isn't
        // anchored to a trigger the way a popover is.
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Mobile bottom-sheet variant of the same entrance. Percentage
        // translate so it works at any sheet height.
        // Streak flame: a slow, small breathing motion. A fast or large
        // pulse on something permanently on screen becomes an irritant
        // within a day — this has to survive being looked at every morning.
        "ember": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.12)", opacity: "0.85" },
        },
        // Fires once when the streak actually increases.
        "streak-pop": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "sheet-up": {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.32s cubic-bezier(0.23,1,0.32,1) both",
        "fade-in": "fade-in 0.2s cubic-bezier(0.23,1,0.32,1) both",
        "pop-in": "pop-in 0.2s cubic-bezier(0.23,1,0.32,1) both",
        "sheet-up": "sheet-up 0.28s cubic-bezier(0.32,0.72,0,1) both",
        "ember": "ember 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
        "streak-pop": "streak-pop 0.42s cubic-bezier(0.23,1,0.32,1) both",
      },
    },
  },
  plugins: [],
};
