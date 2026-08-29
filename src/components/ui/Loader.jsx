/**
 * The loading states.
 *
 * Two of them, because a full-page boot and a lazy route swap are different
 * moments and deserve different weight. Both are built from the same idea:
 * the Eden Labs mark, drawn as three bars that settle into place — the same
 * shape as the bar charts and progress meters the app is full of, so the
 * wait looks like the product rather than like a generic spinner bolted on.
 *
 * Deliberate choices worth keeping:
 *
 *  - Nothing scales from 0 and nothing fades from nothing. The bars start
 *    at a visible height and grow; the mark starts at scale(0.96). Objects
 *    in the real world don't pop into existence, and a loader is the first
 *    thing a user sees — it sets the standard for everything after it.
 *
 *  - Only `transform` and `opacity` are animated. Both skip layout and
 *    paint and run on the compositor, which matters more here than
 *    anywhere else in the app: this thing renders while the main thread is
 *    busy parsing and executing the very bundle it's waiting for. A loader
 *    animating `height` would stutter at exactly the moment it's meant to
 *    reassure.
 *
 *  - CSS animations, not JS. Same reason — they keep running off the main
 *    thread while React hydrates.
 *
 *  - The bars are staggered by 110ms, not more. Long stagger reads as slow,
 *    and the whole point of a loader's motion is to make the wait feel
 *    shorter than it is. A brisk cycle does that; a languid one does the
 *    opposite even when the wait is identical.
 *
 *  - The label only appears after 600ms (`delayed`). A route that resolves
 *    in 80ms should flash nothing readable — text that appears and vanishes
 *    faster than it can be read is noise, and it makes a fast load feel
 *    janky rather than fast.
 */

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

// Three bars, mid / tall / short — an actual silhouette rather than three
// identical rectangles, so it reads as a mark and not as a progress bar.
const BARS = [
  { h: 14, delay: 0 },
  { h: 22, delay: 110 },
  { h: 10, delay: 220 },
];

function Mark({ size = 1 }) {
  return (
    <div
      className="inline-flex items-end gap-[3px] motion-safe:animate-[eden-mark-in_420ms_var(--eden-ease)_both]"
      style={{ "--eden-ease": EASE, height: 22 * size }}
      aria-hidden="true"
    >
      {BARS.map((b, i) => (
        <span
          key={i}
          className="block w-[5px] rounded-[2px] bg-emerald-800 origin-bottom
            motion-safe:animate-[eden-bar_1100ms_var(--eden-ease)_infinite]"
          style={{
            "--eden-ease": EASE,
            height: b.h * size,
            animationDelay: `${b.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** Boot / auth gate — the whole screen is empty, so this carries the brand. */
export function FullScreenLoader({ label = "Loading" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-canvas">
      <Mark size={1.4} />
      <div className="text-[13px] text-stone-400 tracking-tight opacity-0 motion-safe:animate-[eden-label_400ms_var(--eden-ease)_600ms_forwards] motion-reduce:opacity-100"
        style={{ "--eden-ease": EASE }}>
        {label}
      </div>
      <LoaderKeyframes />
    </div>
  );
}

/** Route swap — the chrome around it is already on screen, so this stays quiet. */
export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <Mark />
      <LoaderKeyframes />
    </div>
  );
}

/**
 * Keyframes live here rather than in tailwind.config so the loader is one
 * self-contained file — it's the only thing in the app that uses them, and
 * a component whose motion is defined two directories away is the kind of
 * thing that gets broken by an unrelated config edit.
 *
 * `scaleY` on a bottom origin rather than `height`: same visual result,
 * none of the layout cost. See the file header.
 */
function LoaderKeyframes() {
  return (
    <style>{`
      @keyframes eden-bar {
        0%, 100% { transform: scaleY(0.45); opacity: 0.45; }
        45%      { transform: scaleY(1);    opacity: 1; }
      }
      @keyframes eden-mark-in {
        from { opacity: 0; transform: scale(0.96) translateY(4px); }
        to   { opacity: 1; transform: scale(1)    translateY(0); }
      }
      @keyframes eden-label {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      /* Reduced motion keeps the mark and the label — they carry the
         information — and drops only the repeating vertical movement,
         which is the part that can actually cause discomfort. */
      @media (prefers-reduced-motion: reduce) {
        [class*="animate-[eden-bar"] { animation: none !important; opacity: 0.8; }
      }
    `}</style>
  );
}
