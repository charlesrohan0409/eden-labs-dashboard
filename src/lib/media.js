// Turning uploaded files into something we can store and preview.
//
// Images/videos/documents are downscaled and re-encoded client-side (same as
// before), then uploaded to Supabase Storage via /api/upload — callers get
// back a public URL, not a data: URL. This used to just return the data URL
// itself for storage directly in the app_data JSON blob, which is exactly
// why that blob ballooned to ~1MB for 3 clients' photos alone, re-sent in
// full on every page load and every single mutation. A Storage URL is a
// couple dozen bytes; the actual image bytes now live in Storage and get
// fetched once, by the browser, only when something actually renders it.

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

// Posts a data: URL to /api/upload and hands back the Storage URL that
// replaces it everywhere it's stored. `token` is whichever session the
// caller has — the owner's, or a client's own portal session (a client can
// attach post media through their portal, so the upload endpoint accepts
// either role — see api/_dataHandlers.js's handleUpload).
async function uploadDataUrl(dataUrl, filename, token) {
  if (!token) throw new Error("Not signed in — can't upload.");
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dataUrl, filename }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Upload failed (${res.status}).`);
  return json.url;
}

/**
 * Downscale an image to at most MAX_DIMENSION on its long edge, re-encode
 * it, and upload it — so a 6MB phone photo becomes a couple hundred KB in
 * Storage instead of sitting inline in every request.
 */
export async function fileToImage(file, token) {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const dataUrl = await readFileAsDataUrl(file);

  // SVGs have no meaningful pixel size to scale to; upload as-is.
  if (file.type === "image/svg+xml") {
    return { url: await uploadDataUrl(dataUrl, file.name, token), name: file.name };
  }

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

  const resizedDataUrl = canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", JPEG_QUALITY);
  return {
    url: await uploadDataUrl(resizedDataUrl, file.name, token),
    name: file.name,
    width: w,
    height: h,
  };
}

export async function fileToVideo(file, token) {
  if (!file.type.startsWith("video/")) throw new Error("That file isn't a video.");
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Video is over 8MB — keep it small.");
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { url: await uploadDataUrl(dataUrl, file.name, token), name: file.name, mime: file.type };
}

// A signed contract, scanned and uploaded as a PDF/DOCX/image.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export async function fileToDocument(file, token) {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`File is ${humanSize(file.size)} — keep uploaded contracts under 5MB.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  return { url: await uploadDataUrl(dataUrl, file.name, token), name: file.name, mime: file.type };
}

export const humanSize = (bytes) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
