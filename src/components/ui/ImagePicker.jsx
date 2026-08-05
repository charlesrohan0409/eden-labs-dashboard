import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { fileToImage } from "../../lib/media";

/**
 * Pick an image from the machine and hand back a stored URL. Files are
 * downscaled on the way in; when Supabase Storage lands, `fileToImage`
 * uploads and this component keeps the same shape.
 */
export default function ImagePicker({ label, hint, value, onChange, round = false, size = 64 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (file) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const img = await fileToImage(file);
      onChange(img.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative shrink-0 border border-line bg-stone-50 overflow-hidden flex items-center justify-center ${round ? "rounded-full" : "rounded-xl"}`}
        style={{ width: size, height: size }}
      >
        {value ? (
          <>
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onChange("")}
              aria-label={`Remove ${label}`}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-night/80 text-white flex items-center justify-center"
            >
              <X size={10} />
            </button>
          </>
        ) : (
          <Upload size={16} className="text-stone-300" />
        )}
      </div>

      <div className="min-w-0">
        <div className="text-xs font-medium text-stone-600">{label}</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handle(e.target.files?.[0])}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 border border-line bg-white rounded-full px-3 py-1.5 hover:bg-stone-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {value ? "Replace" : "Upload"}
        </button>
        {hint && !error && <div className="text-[11px] text-stone-400 mt-1">{hint}</div>}
        {error && <div className="text-[11px] text-rose-600 mt-1">{error}</div>}
      </div>
    </div>
  );
}
