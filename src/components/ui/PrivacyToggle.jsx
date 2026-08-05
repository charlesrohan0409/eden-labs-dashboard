import { Eye, EyeOff } from "lucide-react";
import { useCurrency } from "../../hooks/useCurrency";

// Small icon button that flips the app-wide "hide dollar amounts"
// preference — sits right next to the $ icon on the hero revenue tiles
// (Dashboard, Finance) so it's reachable exactly where the sensitive number
// is, rather than buried in a settings page. See useCurrency.jsx for how the
// masking itself works.
export default function PrivacyToggle({ dark = false, className = "" }) {
  const { hideAmounts, toggleHideAmounts } = useCurrency();
  const Icon = hideAmounts ? EyeOff : Eye;

  return (
    <button
      onClick={toggleHideAmounts}
      title={hideAmounts ? "Show amounts" : "Hide amounts"}
      aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
        dark
          ? "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
          : "bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600"
      } ${className}`}
    >
      <Icon size={13} />
    </button>
  );
}
