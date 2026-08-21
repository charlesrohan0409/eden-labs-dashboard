import { useState } from "react";

/**
 * The little square logo shown next to an account, card or subscription.
 *
 * Three sources, in order:
 *   1. `logoUrl` — an image uploaded through /api/upload, which wins because
 *      it's the one the owner deliberately chose.
 *   2. A favicon derived from `website`, so typing "netflix.com" is enough to
 *      get a real logo without hunting for a PNG. Google's favicon service is
 *      used because it's keyless, free and already cached in most browsers.
 *      Worth knowing: it means Google sees which brands are listed here. For
 *      an internal dashboard that's an acceptable trade; the upload path
 *      exists for anything you'd rather not send.
 *   3. Initials on a tinted square — never a blank hole.
 *
 * The favicon is loaded optimistically and falls back on error, since a
 * domain with no favicon returns a 404 rather than a usable image.
 */
export function faviconFor(website) {
  if (!website) return "";
  const host = String(website)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];
  if (!host || !host.includes(".")) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

const initialsOf = (name) =>
  (name || "?")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

export default function BrandMark({ name, logoUrl, website, size = 28, tone = "bg-stone-100 text-stone-500", rounded = "rounded-lg" }) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || (failed ? "" : faviconFor(website));

  const style = { width: size, height: size };

  if (src) {
    return (
      <span className={`${rounded} overflow-hidden shrink-0 bg-white border border-line flex items-center justify-center`} style={style}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain"
          // A missing favicon 404s rather than erroring loudly, so this is
          // what actually triggers the initials fallback.
          onError={() => setFailed(true)}
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={`${rounded} shrink-0 flex items-center justify-center font-semibold ${tone}`}
      style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {initialsOf(name)}
    </span>
  );
}
