import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const WIDTHS = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-3xl" };

// Shared across every mounted Modal — see the effect below.
let openModalCount = 0;

export default function Modal({ open, onClose, title, subtitle, children, footer, width = "md" }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onCloseRef.current?.();
    document.addEventListener("keydown", onKey);
    // Stop the page behind the overlay from scrolling on mobile.
    //
    // Reference-counted: with two modals open, the inner one closing used to
    // restore overflow to "" while the outer was still up, and the page
    // scrolled behind it. Only the last one out unlocks.
    openModalCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = "";
    };
    // onClose deliberately omitted: every call site passes an inline arrow, so
    // including it re-ran this effect on every keystroke inside any modal form,
    // rebinding the listener and rewriting body styles per character. The ref
    // keeps the handler current without the churn.
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-night/40 backdrop-blur-[2px] motion-safe:animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${WIDTHS[width]} bg-white rounded-t-2xl sm:rounded-2xl border border-line shadow-xl max-h-[92vh] sm:max-h-[86vh] flex flex-col
          motion-safe:animate-sheet-up sm:motion-safe:animate-pop-in`}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-100 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-stone-900 tracking-tight">{title}</div>
            {subtitle && <div className="text-xs text-stone-400 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 hover:text-stone-700 p-1 -m-1 shrink-0">
            <X size={17} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-stone-100 flex justify-end gap-2 shrink-0 safe-area-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
