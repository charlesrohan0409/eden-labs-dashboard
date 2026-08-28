// Renders a PDF's pages to images so a carousel post previews the way
// LinkedIn actually shows it.
//
// The previous approach embedded the PDF in an <iframe> and let the browser's
// own viewer draw it. That is a DOCUMENT viewer: grey chrome, its own
// scrollbar, and for a multi-page file it scrolls continuously instead of
// paging. LinkedIn renders a document post as discrete swipeable SLIDES with
// a title bar underneath — so the preview was showing something the reader
// would never see, which defeats the point of a preview.
//
// pdf.js is loaded lazily, only once a PDF is actually attached, so the
// ~350KB never lands on anyone who is writing a text post.

let pdfjsPromise = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then(async (lib) => {
      // The worker has to be pointed at a real URL. Resolving it through
      // Vite's bundler (rather than a CDN) keeps this working offline and
      // keeps the version locked to whatever is installed.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * Renders every page (up to `max`) to a PNG data URL.
 *
 * `scale` is deliberately generous: these are shown at roughly 500px wide on
 * a retina display, and a page rendered at 1x looks visibly soft next to the
 * real thing.
 */
export async function renderPdfSlides(url, { max = 20, scale = 2 } = {}) {
  const pdfjs = await getPdfjs();
  // Hold the loading TASK, not just the document: in pdf.js 6 `destroy()`
  // lives on the task and the document only has `cleanup()`. Calling
  // doc.destroy() throws, which surfaced as "couldn't render" on a PDF whose
  // pages had in fact all rendered fine.
  const task = pdfjs.getDocument({ url, isEvalSupported: false });
  const doc = await task.promise;
  const count = Math.min(doc.numPages, max);
  const pages = [];

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    // White ground: a PDF page has no background of its own, and without
    // this a transparent page renders black on the dark canvas default.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, background: "#ffffff" }).promise;
    pages.push({
      src: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });
    canvas.width = canvas.height = 0; // let the bitmap go immediately
  }

  const total = doc.numPages;
  await task.destroy();
  return { pages, total };
}
