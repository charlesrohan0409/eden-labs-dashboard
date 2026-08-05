// Turning uploaded files into something we can store and preview.
//
// Everything here produces a data URL, which is fine while the app persists to
// localStorage but will not scale — a handful of full-size photos blows past
// the ~5MB quota. Images are therefore downscaled and re-encoded before they
// are stored. When Supabase lands, `fileToImage` becomes an upload to Supabase
// Storage and these functions return the public URL instead.

const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.82;

// Rough guard so a 4K video doesn't silently break the whole save.
export const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale an image to at most MAX_DIMENSION on its long edge and re-encode
 * it, so a 6MB phone photo becomes a couple of hundred KB.
 */
export async function fileToImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const dataUrl = await readFileAsDataUrl(file);

  // SVGs have no meaningful pixel size to scale to; keep them as-is.
  if (file.type === "image/svg+xml") return { url: dataUrl, name: file.name };

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode that image."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Transparent PNGs would go black on a JPEG re-encode, so keep PNG for those.
  const keepPng = file.type === "image/png";
  if (!keepPng) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);

  return {
    url: canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", JPEG_QUALITY),
    name: file.name,
    width: w,
    height: h,
  };
}

export async function fileToVideo(file) {
  if (!file.type.startsWith("video/")) throw new Error("That file isn't a video.");
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video is over 8MB. Keep it small until file storage is wired up.");
  }
  return { url: await readFileAsDataUrl(file), name: file.name, mime: file.type };
}

export const humanSize = (bytes) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
