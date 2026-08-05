import { Link2 } from "lucide-react";
import Logo from "./Logo";

export default function MobileTopBar({ onPreviewPortal }) {
  return (
    <div className="md:hidden sticky top-0 z-20 bg-night text-white px-4 py-3 flex items-center justify-between gap-3">
      <Logo size={30} tone="dark" showBadge={false} />
      <button
        onClick={onPreviewPortal}
        className="flex items-center gap-1.5 text-xs text-stone-300 border border-white/10 rounded-full px-3 py-1.5 shrink-0"
      >
        <Link2 size={13} /> Portal
      </button>
    </div>
  );
}
