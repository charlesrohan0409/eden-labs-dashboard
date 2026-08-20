// Eden Labs — LinkedIn overlay
//
// Unlike content.js (injected on demand, only on a right-click), this file
// is declared directly in the manifest's content_scripts and runs on every
// linkedin.com page load. It provides three things:
//   1. A pinned "comment list" panel (bottom-right button) for building
//      today's "who to comment on" list, one profile page at a time.
//   2. A right-click-anywhere path to the same list — a name in the feed, a
//      connections row, a sidebar suggestion — via a link-context menu item
//      background.js registers; this file supplies the name/photo it can't.
//   3. A right-click-selection path to save a LinkedIn post's text to the
//      content library (data.swipeFile), with a confirm/edit card for the
//      auto-detected author.
//
// Guarded by its OWN injection flag, not content.js's — reusing
// __edenLabsCRMInjected here would set it first and silently break the
// right-click save-lead card, since that flag is what content.js's own
// on-demand injection checks before deciding whether to run.
if (!window.__edenLabsOverlayInjected) {
  window.__edenLabsOverlayInjected = true;

  // ---- Shared profile-link helpers ----------------------------------------
  // Used both by the pinned panel's "add this profile" button (which knows
  // the CURRENT page is a profile) and by the right-click/selection flows
  // (which have to find the nearest profile link to an arbitrary click or
  // selection point instead).

  const isLogo = (img) => /company-logo|school-logo|org-logo/i.test(img.src);
  const isHeadshot = (img) => /profile-displayphoto/i.test(img.src) && !isLogo(img);
  // Falls back to the CSS-rendered size when natural* is still 0 — LinkedIn
  // lazy-loads/decodes images, so at the moment a button is clicked the
  // photo may not have finished decoding yet even though it's already laid
  // out at its intended size. Relying on naturalWidth alone was silently
  // dropping the photo (and, on the size-disambiguation path below, could
  // misjudge which image is "biggest") whenever that race lost.
  const dim = (img) => ({ w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 });
  const bigEnough = (img) => { const d = dim(img); return d.w > 24 && d.h > 24; };
  const area = (img) => { const d = dim(img); return d.w * d.h; };

  function findNearestProfileLink(el) {
    let node = el;
    for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
      if (node.matches?.('a[href*="/in/"]')) return node;
      const nested = node.querySelector?.('a[href*="/in/"]');
      if (nested) return nested;
    }
    return el.closest?.('a[href*="/in/"]') || null;
  }

  function extractNameFromLink(link) {
    // aria-labels are often "View <Name>'s profile" or just "<Name>" — more
    // reliable than textContent, which on a card-style link picks up the
    // headline, "• 2nd", "Follow", etc. all mashed together.
    const aria = link.getAttribute("aria-label") || "";
    const stripped = aria.replace(/^View\s+/i, "").replace(/[’']s profile$/i, "").trim();
    if (stripped) return stripped;
    const text = (link.textContent || "").replace(/\s+/g, " ").trim();
    return text.split("•")[0].trim();
  }

  function findNearbyPhoto(link) {
    let node = link;
    for (let hops = 0; node && hops < 5; hops++, node = node.parentElement) {
      const img = node.querySelector?.('img[src*="media.licdn.com"][src*="profile-displayphoto"]');
      if (img) return img.src;
    }
    return "";
  }

  // ---- Current-profile-page detection (for the pinned panel's own button) --

  function bestProfileName() {
    // document.title ("First Last - Headline | LinkedIn") is far more
    // reliable than any CSS selector, which LinkedIn's auto-generated class
    // names can and do change without notice.
    const fromTitle = (document.title || "").split(" | LinkedIn")[0].split(" - ")[0].trim();
    if (fromTitle && fromTitle.toLowerCase() !== "linkedin") return fromTitle;
    return document.querySelector("h1")?.textContent?.trim() || "";
  }

  function findOwnPhoto() {
    const headshots = Array.from(document.querySelectorAll('img[src*="media.licdn.com"]'))
      .filter((img) => bigEnough(img) && isHeadshot(img));
    if (!headshots.length) return "";
    // The subject's own photo renders dramatically larger than the small
    // nav-bar avatar of whoever's logged in (which also matches the
    // profile-displayphoto path) — same size-leader heuristic content.js's
    // findLinkedInPhoto uses for the right-click save-lead card.
    headshots.sort((a, b) => area(b) - area(a));
    return headshots[0].src;
  }

  function currentProfile() {
    const isProfilePage = /^\/in\//.test(location.pathname);
    const headlineEl = document.querySelector(".text-body-medium, [data-generated-suggestion-target]");
    return {
      isProfilePage,
      name: isProfilePage ? bestProfileName() : "",
      headline: isProfilePage ? (headlineEl?.textContent || "").trim() : "",
      profileUrl: isProfilePage ? location.origin + location.pathname.replace(/\/$/, "") : "",
      photoUrl: isProfilePage ? findOwnPhoto() : "",
    };
  }

  function initials(name) {
    return (name || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
  }

  // ---- Safe messaging -------------------------------------------------------
  // Reloading the extension from chrome://extensions invalidates every
  // already-open tab's connection to it — Chrome doesn't clean this up on
  // its own, and chrome.runtime.sendMessage throws synchronously once it
  // happens. A plain page reload fixes it (fresh content script, fresh
  // connection); this just stops that window from spamming the extension's
  // error log with "Extension context invalidated" in the meantime.
  function extensionAlive() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }
  function safeSendMessage(msg, cb) {
    if (!extensionAlive()) { cb?.(null); return; }
    try {
      chrome.runtime.sendMessage(msg, (result) => {
        if (chrome.runtime.lastError) { cb?.(null); return; }
        cb?.(result);
      });
    } catch {
      cb?.(null);
    }
  }

  // ---- Toast ---------------------------------------------------------------
  // Feedback for actions that don't open any card of their own — right-click
  // "add to comment list" needs *some* confirmation that it worked.

  function showToast(text, isError) {
    const host = document.createElement("div");
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.bottom = "76px";
    host.style.right = "20px";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .toast {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          background: ${isError ? "#9f1239" : "#14532d"}; color: #fff;
          padding: 10px 16px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
          max-width: 300px; box-shadow: 0 4px 16px rgba(0,0,0,.22);
          animation: rise .2s cubic-bezier(0.23,1,0.32,1) both;
        }
        @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      </style>
      <div class="toast">${text}</div>
    `;
    setTimeout(() => host.remove(), 2600);
  }

  // ---- Universal "add to comment list" (right-click on any profile link) --
  // Chrome's contextMenus API gives the click handler a linkUrl but never
  // the link's visible text or a nearby photo, so this listens for the
  // native `contextmenu` event itself (fires synchronously right before the
  // menu opens) and ships the best-guess name/photo to background.js ahead
  // of time, keyed by tab — background reads it back when the menu item is
  // actually clicked.
  document.addEventListener("contextmenu", (e) => {
    const link = findNearestProfileLink(e.target);
    if (!link || !/\/in\/[^/?#]+/.test(link.href)) return;
    safeSendMessage({
      type: "SET_CONTEXT_TARGET",
      target: {
        profileUrl: link.href.split("?")[0].replace(/\/$/, ""),
        name: extractNameFromLink(link),
        photoUrl: findNearbyPhoto(link),
        headline: "",
      },
    });
  }, true);

  // ---- Save-content widget (right-click a selection → "Save to content") --

  const SWIPE_HOST_ID = "eden-labs-swipe-widget-host";
  function removeSwipeWidget() { document.getElementById(SWIPE_HOST_ID)?.remove(); }

  function showSwipeWidget(swipe) {
    removeSwipeWidget();

    // The selection is still live when this message arrives — right-
    // clicking doesn't clear it — so the same profile-link heuristics used
    // for the universal add-to-list button can find the post's AUTHOR too.
    let author = "", authorUrl = "", authorPhoto = "";
    const selection = window.getSelection();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      let el = selection.anchorNode;
      if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
      for (let hops = 0; el && hops < 12 && !author; hops++, el = el.parentElement) {
        const link = el.querySelector?.('a[href*="/in/"]') || (el.matches?.('a[href*="/in/"]') ? el : null);
        if (link) {
          author = extractNameFromLink(link);
          authorUrl = link.href.split("?")[0].replace(/\/$/, "");
          authorPhoto = findNearbyPhoto(link);
        }
      }
    }

    const host = document.createElement("div");
    host.id = SWIPE_HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.zIndex = "2147483647";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card {
          position: fixed; top: 24px; right: 24px; width: 360px;
          max-height: calc(100vh - 48px); overflow-y: auto;
          background: #fff; border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,.12), 0 12px 40px rgba(0,0,0,.18);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          font-size: 14px; color: #1c1917;
          animation: slide-in .18s ease-out;
        }
        @keyframes slide-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        .header {
          background: #14532d; color: #fff; padding: 14px 16px 12px;
          display: flex; align-items: center; gap: 9px; border-radius: 16px 16px 0 0;
        }
        .logo { width: 26px; height: 26px; background: rgba(255,255,255,.15); border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
        .header-text { flex: 1; min-width: 0; }
        .header-title { font-size: 14px; font-weight: 600; }
        .header-sub { font-size: 10.5px; opacity: .65; margin-top: 1px; }
        .close-btn { background: rgba(255,255,255,.12); border: none; border-radius: 6px; color: rgba(255,255,255,.75); cursor: pointer; width: 22px; height: 22px; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .close-btn:hover { background: rgba(255,255,255,.22); color: #fff; }
        .body { padding: 14px 16px 16px; }
        .field { margin-bottom: 10px; }
        label { display: block; font-size: 10px; font-weight: 600; color: #78716c; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
        input, select, textarea { width: 100%; padding: 7px 10px; border: 1px solid #e7e5e4; border-radius: 8px; background: #fff; font-size: 12.5px; color: #1c1917; outline: none; font-family: inherit; }
        input:focus, select:focus, textarea:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.12); }
        textarea { resize: vertical; line-height: 1.4; }
        #swipe-text { min-height: 90px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .author-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .author-row img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid #e7e5e4; flex-shrink: 0; }
        .save-btn { width: 100%; padding: 9px; background: #14532d; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .save-btn:hover:not(:disabled) { background: #166534; }
        .save-btn:disabled { opacity: .55; cursor: default; }
        #status { margin-bottom: 10px; padding: 8px 11px; border-radius: 8px; font-size: 12px; display: none; }
        #status.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        #status.error { background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin .7s linear infinite; display: inline-block; }
      </style>
      <div class="card">
        <div class="header">
          <div class="logo">EL</div>
          <div class="header-text">
            <div class="header-title">Save to content</div>
            <div class="header-sub">Eden Labs content library</div>
          </div>
          <button class="close-btn" id="close">✕</button>
        </div>
        <div class="body">
          <div id="status"></div>
          <div class="field">
            <label>Post text</label>
            <textarea id="swipe-text"></textarea>
          </div>
          <div class="row">
            <div class="field">
              <label>Author</label>
              <input id="author" type="text" placeholder="Who wrote it" />
            </div>
            <div class="field">
              <label>Tag</label>
              <select id="tag">
                <option value="hook">Hook</option>
                <option value="story">Story</option>
                <option value="format">Format</option>
                <option value="cta">CTA</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Note (optional)</label>
            <textarea id="note" style="min-height:44px" placeholder="Why this one's worth saving…"></textarea>
          </div>
          <button class="save-btn" id="save">Save to content</button>
        </div>
      </div>
    `;

    const $ = (id) => shadow.getElementById(id);
    $("swipe-text").value = swipe.text || "";
    $("author").value = author;

    $("close").addEventListener("click", removeSwipeWidget);
    const onKey = (e) => { if (e.key === "Escape") { removeSwipeWidget(); window.removeEventListener("keydown", onKey); } };
    window.addEventListener("keydown", onKey);

    const showStatus = (type, html) => {
      const el = $("status");
      el.className = type;
      el.innerHTML = html;
      el.style.display = "block";
    };

    $("save").addEventListener("click", () => {
      const text = $("swipe-text").value.trim();
      if (!text) { showStatus("error", "Post text can't be empty."); return; }
      const btn = $("save");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⟳</span> Saving…';
      safeSendMessage({
        type: "SAVE_SWIPE",
        swipe: {
          text,
          author: $("author").value.trim(),
          authorUrl, authorPhoto,
          url: swipe.pageUrl || "",
          tag: $("tag").value,
          note: $("note").value.trim(),
        },
      }, (result) => {
        if (result?.ok) {
          showStatus("success", "✓ Saved to content library!");
          btn.innerHTML = "✓ Saved";
          setTimeout(removeSwipeWidget, 1200);
        } else {
          showStatus("error", result?.error || "Something went wrong.");
          btn.disabled = false;
          btn.innerHTML = "Save to content";
        }
      });
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOAST") showToast(msg.text, msg.error);
    if (msg.type === "SHOW_SWIPE_WIDGET") showSwipeWidget(msg.swipe);
  });

  // ---- Pinned comment-list panel -------------------------------------------

  const HOST_ID = "eden-labs-overlay-host";

  function mount() {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.bottom = "20px";
    host.style.right = "20px";
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
        .fab {
          display: flex; align-items: center; gap: 7px;
          background: #14532d; color: #fff; border: none; border-radius: 999px;
          padding: 10px 16px 10px 12px; font-size: 12.5px; font-weight: 600;
          cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.22);
          transition: transform .18s cubic-bezier(0.23,1,0.32,1), background .15s ease;
        }
        .fab:hover { background: #166534; }
        .fab:active { transform: scale(0.96); }
        .fab .badge {
          background: rgba(255,255,255,.18); border-radius: 999px;
          min-width: 18px; height: 18px; padding: 0 5px; font-size: 10.5px;
          display: flex; align-items: center; justify-content: center;
        }
        .panel {
          display: none;
          width: 300px; max-height: 420px; overflow-y: auto;
          background: #fff; border-radius: 14px; margin-bottom: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,.12), 0 12px 40px rgba(0,0,0,.18);
          animation: rise .2s cubic-bezier(0.23,1,0.32,1) both;
        }
        .panel.open { display: block; }
        @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .panel-header {
          background: #14532d; color: #fff; padding: 12px 14px;
          display: flex; align-items: center; justify-content: space-between;
          border-radius: 14px 14px 0 0; position: sticky; top: 0;
        }
        .panel-header .title { font-size: 13px; font-weight: 600; }
        .panel-header .sub { font-size: 10.5px; opacity: .65; }
        .add-row { padding: 12px 14px; border-bottom: 1px solid #f0f0ee; }
        .add-btn {
          width: 100%; padding: 8px; background: #f0fdf4; border: 1px dashed #86efac;
          border-radius: 10px; color: #166534; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: background .15s ease, transform .15s cubic-bezier(0.23,1,0.32,1);
        }
        .add-btn:hover:not(:disabled) { background: #dcfce7; }
        .add-btn:active:not(:disabled) { transform: scale(0.98); }
        .add-btn:disabled { opacity: .5; cursor: default; }
        .hint { padding: 8px 14px 0; font-size: 10.5px; color: #a8a29e; line-height: 1.5; }
        .list { padding: 6px 8px; }
        .row {
          display: flex; align-items: center; gap: 8px; padding: 7px 8px;
          border-radius: 8px; font-size: 12px; color: #1c1917;
        }
        .row:hover { background: #fafaf9; }
        .row img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #e7e5e4; }
        .row .avatar-fallback {
          width: 24px; height: 24px; border-radius: 50%; background: #dcfce7; color: #14532d;
          font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row a { color: #14532d; text-decoration: none; font-size: 11px; flex-shrink: 0; }
        .empty { padding: 18px 14px; text-align: center; color: #a8a29e; font-size: 12px; }
        .not-connected { padding: 14px; text-align: center; color: #9a3412; font-size: 12px; background: #fff7ed; }
      </style>

      <div class="panel" id="panel">
        <div class="panel-header">
          <div>
            <div class="title">Comment list</div>
            <div class="sub" id="scope-label">Eden Labs</div>
          </div>
        </div>
        <div class="add-row">
          <button class="add-btn" id="add-btn">+ Add this profile</button>
        </div>
        <div class="hint">Tip: right-click any name anywhere on LinkedIn — feed, connections, search — and choose "Add to Eden Labs comment list".</div>
        <div class="list" id="list"></div>
      </div>

      <button class="fab" id="fab">
        <span>💬 Comment list</span>
        <span class="badge" id="count">0</span>
      </button>
    `;

    const $ = (id) => shadow.getElementById(id);

    let open = false;
    const setOpen = (v) => {
      open = v;
      $("panel").classList.toggle("open", open);
      if (open) refreshList();
    };
    $("fab").addEventListener("click", () => setOpen(!open));

    function renderRows(targets) {
      const list = $("list");
      if (!targets.length) {
        list.innerHTML = `<div class="empty">Nothing on the list yet — visit a profile and add it, or right-click any name on LinkedIn.</div>`;
        return;
      }
      list.innerHTML = targets.slice().reverse().map((t) => `
        <div class="row">
          ${t.photoUrl ? `<img src="${t.photoUrl}" alt="" />` : `<span class="avatar-fallback">${initials(t.name)}</span>`}
          <span class="name" title="${t.name || t.profileUrl}">${t.name || t.profileUrl}</span>
          <a href="${t.profileUrl}" target="_blank" rel="noopener">Open</a>
        </div>
      `).join("");
    }

    function refreshList() {
      safeSendMessage({ type: "GET_COMMENT_TARGETS" }, (result) => {
        if (!result?.ok) {
          $("list").innerHTML = `<div class="not-connected">${result?.error || "Not connected — open Settings to enter your PIN."}</div>`;
          $("count").textContent = "0";
          return;
        }
        $("count").textContent = String(result.targets.length);
        renderRows(result.targets);
      });
    }

    function updateAddButton() {
      const profile = currentProfile();
      const btn = $("add-btn");
      if (!profile.isProfilePage) {
        btn.disabled = true;
        btn.textContent = "Visit a profile to add it";
        return;
      }
      btn.disabled = false;
      btn.textContent = `+ Add ${profile.name || "this profile"}`;
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Adding…";
        safeSendMessage({ type: "ADD_COMMENT_TARGET", target: profile }, (result) => {
          if (result?.ok) {
            btn.textContent = "✓ Added";
            refreshList();
            setTimeout(updateAddButton, 1200);
          } else {
            btn.disabled = false;
            btn.textContent = result?.error || "Couldn't add — try again";
          }
        });
      };
    }

    safeSendMessage({ type: "GET_SESSION" }, (session) => {
      $("scope-label").textContent = session?.role === "client" ? (session.label || "Client") : "Eden Labs";
    });

    updateAddButton();
    // LinkedIn is a single-page app — the URL changes without a full
    // navigation, so the "add this profile" button needs to re-evaluate on
    // an interval rather than only once at inject time.
    setInterval(updateAddButton, 1500);
  }

  mount();
}
