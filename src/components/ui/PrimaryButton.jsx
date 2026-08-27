const VARIANTS = {
  primary: "bg-emerald-800 text-white hover:bg-emerald-900 border border-transparent",
  dark: "bg-night text-white hover:bg-nightsoft border border-transparent",
  ghost: "bg-white text-stone-600 border border-line hover:bg-stone-50",
  soft: "bg-emerald-50 text-emerald-800 border border-transparent hover:bg-emerald-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700 border border-transparent",
};

const SIZES = {
  sm: "text-xs px-3 py-1.5 gap-1",
  md: "text-sm px-4 py-2 gap-1.5",
};

export default function PrimaryButton({
  children, onClick, icon: Icon, iconClassName = "", className = "",
  variant = "primary", size = "md", disabled = false, type = "button", title,
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      // Press feedback on the app's primary pressable. It had none: a click
      // produced no acknowledgement until the resulting work finished, which
      // on a slow save reads as "did that register?". Transform-only and
      // motion-safe, so it costs nothing and respects reduced-motion.
      className={`inline-flex items-center justify-center font-medium rounded-full
        transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]
        motion-safe:active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {Icon && <Icon size={size === "sm" ? 13 : 15} className={iconClassName} />}
      {children}
    </button>
  );
}
