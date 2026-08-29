/**
 * The loading states.
 *
 * The idea: a small stack of cards riffling into place, the way a deck gets
 * squared up. It's the app's own furniture — every screen here is cards —
 * so the wait reads as the dashboard assembling itself rather than as a
 * generic spinner someone bolted on. Three cards, each rotating in from a
 * slight fan, with a green "ink" line sweeping across the top card as if
 * the data were being written onto it.
 *
 * Why it's built this way:
 *
 *  - **Only `transform` and `opacity` animate.** This renders while the
 *    main thread is parsing and executing the very bundle it's waiting for.
 *    Anything touching layout or paint would stutter at precisely the
 *    moment the animation exists to reassure. The sweeping line is a
 *    `translateX` on a clipped element, not an animated `width`.
 *
 *  - **CSS, never JS.** Same reason: CSS animation runs off the main
 *    thread and keeps its framerate while React hydrates.
 *
 *  - **Nothing appears from nothing.** The cards start at `scale(0.92)`
 *    and a visible rotation, not `scale(0)`. Real objects don't pop into
 *    existence, and this is the first thing a user sees — it sets the bar
 *    for everything after it.
 *
 *  - **The loop is 1.6s and the cards are staggered 130ms apart.** Long
 *    enough to read as deliberate, short enough that the wait feels
 *    shorter than it is. A languid loader makes an identical wait feel
 *    slower.
 *
 *  - **The label waits 700ms.** A route that resolves in 100ms should
 *    flash nothing readable; text that appears and vanishes faster than it
 *    can be read is noise, and it makes a fast load feel broken.
 *
 *  - **Reduced motion keeps the stack and the ink sweep** (opacity only,
 *    no movement) and drops the riffle. Reduced motion means gentler, not
 *    nothing — the page should still look alive, just not kinetic.
 */

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

// Back to front. The last one is the "top" card and carries the ink sweep.
const CARDS = [
  { rotate: -9, x: -7, delay: 0,   tone: "bg-emerald-900/15" },
  { rotate: 5,  x: 4,  delay: 130, tone: "bg-emerald-800/30" },
  { rotate: 0,  x: 0,  delay: 260, tone: "bg-emerald-800", top: true },
];

function Stack({ scale = 1 }) {
  return (
    <div
      className="relative"
      style={{ width: 52 * scale, height: 40 * scale }}
      aria-hidden="true"
    >
      {CARDS.map((c, i) => (
        <div
          key={i}
          className={`absolute inset-0 rounded-[5px] ${c.tone}
            motion-safe:animate-[eden-riffle_1600ms_var(--eden-ease)_infinite]`}
          style={{
            "--eden-ease": EASE,
            "--r": `${c.rotate}deg`,
            "--x": `${c.x}px`,
            animationDelay: `${c.delay}ms`,
            // The resting transform, so a reduced-motion viewer still sees
            // a fanned stack rather than three squares stacked flat.
            transform: `translateX(${c.x}px) rotate(${c.rotate}deg)`,
          }}
        >
          {c.top && (
            // The ink sweep. Clipped by the card, moved with translateX —
            // a width animation here would cost layout on every frame.
            <div className="absolute inset-0 overflow-hidden rounded-[5px]">
              <div
                className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent
                  motion-safe:animate-[eden-ink_1600ms_var(--eden-ease)_infinite]"
                style={{ "--eden-ease": EASE, animationDelay: "260ms" }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Boot / auth gate — the screen is otherwise empty, so this carries the brand. */
export function FullScreenLoader({ label = "Getting things ready" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-canvas">
      <div className="motion-safe:animate-[eden-rise_460ms_var(--eden-ease)_both]" style={{ "--eden-ease": EASE }}>
        <Stack scale={1.25} />
      </div>
      <div
        className="text-[13px] text-stone-400 tracking-tight opacity-0
          motion-safe:animate-[eden-label_400ms_var(--eden-ease)_700ms_forwards] motion-reduce:opacity-100"
        style={{ "--eden-ease": EASE }}
      >
        {label}
      </div>
      <LoaderKeyframes />
    </div>
  );
}

/** Route swap — the chrome is already on screen, so this stays quiet. */
export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center py-24">
      <Stack />
      <LoaderKeyframes />
    </div>
  );
}

/**
 * Keyframes live with the component rather than in tailwind.config, so the
 * loader is one self-contained file. It's the only thing in the app that
 * uses them, and motion defined two directories away is what gets broken by
 * an unrelated config edit.
 */
function LoaderKeyframes() {
  return (
    <style>{`
      @keyframes eden-riffle {
        0%, 100% { transform: translateX(var(--x)) rotate(var(--r)) scale(0.92); opacity: 0.55; }
        30%      { transform: translateX(0)        rotate(0deg)     scale(1);    opacity: 1; }
        60%      { transform: translateX(0)        rotate(0deg)     scale(1);    opacity: 1; }
      }
      @keyframes eden-ink {
        0%       { transform: translateX(-160%); }
        55%,100% { transform: translateX(260%); }
      }
      @keyframes eden-rise {
        from { opacity: 0; transform: scale(0.94) translateY(6px); }
        to   { opacity: 1; transform: scale(1)    translateY(0); }
      }
      @keyframes eden-label {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      /* Gentler, not absent: the stack keeps its fan and the ink keeps
         pulsing in place, but nothing moves across the screen. */
      @media (prefers-reduced-motion: reduce) {
        [class*="animate-[eden-riffle"] { animation: none !important; }
        [class*="animate-[eden-ink"] {
          animation: eden-fade 1.8s ease-in-out infinite !important;
          transform: none !important;
        }
        @keyframes eden-fade { 0%,100% { opacity: 0.15; } 50% { opacity: 0.5; } }
      }
    `}</style>
  );
}
