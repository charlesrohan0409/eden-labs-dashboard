const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The portal's empty state.
 *
 * Every empty slot in here used to be one line of `text-stone-400` — "No posts
 * yet.", "No calls logged yet." — and one was `text-stone-300`, effectively
 * invisible. A brand-new client's first ever login was therefore seven cards
 * of grey placeholder and three blank charts, with nothing explaining that
 * this is normal and not a broken product.
 *
 * An empty state is the first thing a new client sees, so it says what will
 * appear here and why it's empty, rather than just noting the absence.
 */
export default function PortalEmpty({ icon: Icon, title, children, compact = false }) {
  return (
    <div
      className={`text-center motion-safe:animate-fade-up ${compact ? "py-7" : "py-10"}`}
    >
      {Icon && (
        <span
          className={`w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3
            transition-colors duration-200 ${EASE}`}
        >
          <Icon size={17} className="text-stone-400" />
        </span>
      )}
      <div className="text-[14px] font-semibold text-stone-800">{title}</div>
      {children && (
        <p className="text-[13px] text-stone-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
          {children}
        </p>
      )}
    </div>
  );
}
