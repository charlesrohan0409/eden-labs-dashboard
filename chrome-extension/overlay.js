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
    // LinkedIn's aria-labels vary more than the old two-rule strip assumed:
    // "View Tom Dillon, CFA's profile", "View Tom Dillon, CFA’s graphic link",
    // "Tom Dillon, CFA • 2nd". When only the "View " prefix matched, the
    // saved author came out as "View Tom Dillon, CFA's" — visible in the
    // saved-content library and impossible to fix without re-saving.
    const stripped = aria
      .replace(/^View\s+/i, "")
      .replace(/[’'`]s\s+(profile|graphic link|photo|image).*$/i, "")
      .replace(/[’'`]s$/i, "")
      .replace(/\s*[•·]\s*(1st|2nd|3rd|3rd\+).*$/i, "")
      .replace(/\s*[-–—]\s*$/,"")
      .trim();
    if (stripped) return stripped;
    const text = (link.textContent || "").replace(/\s+/g, " ").trim();
    const beforeBullet = text.split("•")[0].trim();
    if (beforeBullet) return beforeBullet;
    // A link that's just an avatar photo (no visible text) still usually
    // carries the person's name in the image's alt text — common in feed
    // post headers, where the avatar and the name are two separate <a>s.
    return link.querySelector?.("img[alt]")?.alt?.trim() || "";
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
    // document.title ("(3) First Last - Headline | LinkedIn") is far more
    // reliable than any CSS selector, which LinkedIn's auto-generated class
    // names can and do change without notice — but it can carry an unread-
    // notification-count prefix like "(3) ", and during an in-app (SPA)
    // navigation the title itself can briefly still say the generic
    // "Feed | LinkedIn" or similar for a moment before LinkedIn updates it,
    // so this isn't relied on alone.
    const title = (document.title || "").replace(/^\(\d+\+?\)\s*/, "");
    const fromTitle = title.split(" | LinkedIn")[0].split(" - ")[0].trim();
    const looksGeneric = !fromTitle || /^(linkedin|feed|home)$/i.test(fromTitle);
    if (!looksGeneric) return fromTitle;
    const h1 = document.querySelector("h1")?.textContent?.trim();
    if (h1) return h1;
    // .text-heading-xlarge is the class LinkedIn's own profile-name heading
    // has carried for years, even though it isn't guaranteed forever — kept
    // as a last-resort fallback rather than the primary signal.
    return document.querySelector(".text-heading-xlarge")?.textContent?.trim() || "";
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

  // ---- Inbound enquiry capture (right-click in a DM thread) ---------------
  //
  // LinkedIn's messaging DOM changes often, so this tries several independent
  // strategies and stops at the first that works, rather than betting on one
  // selector. Everything it finds is a GUESS presented in an editable card —
  // the human confirms before anything is saved, which is what keeps this
  // robust against LinkedIn shipping a redesign next week.
  function detectMessageSender() {
    const out = { name: "", headline: "", profileUrl: "", photoUrl: "" };

    // 1. Walk up from the selection to the message group it belongs to, then
    //    find the profile link inside it. Most reliable, because it's scoped
    //    to the specific message you right-clicked rather than the thread.
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      let el = sel.anchorNode;
      if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
      for (let hops = 0; el && hops < 14; hops++, el = el.parentElement) {
        const link = el.querySelector?.('a[href*="/in/"]');
        if (link) {
          out.name = extractNameFromLink(link);
          out.profileUrl = link.href.split("?")[0].replace(/\/$/, "");
          out.photoUrl = findNearbyPhoto(link);
          if (out.name) break;
        }
      }
    }

    // 2. The thread header — whoever the conversation is with. Used when the
    //    selection sat in a bare text bubble with no link near it.
    if (!out.name) {
      const header = document.querySelector(
        ".msg-thread__link-to-profile, .msg-entity-lockup a[href*='/in/'], .msg-thread a[href*='/in/']"
      );
      if (header) {
        out.name = extractNameFromLink(header);
        out.profileUrl = header.href.split("?")[0].replace(/\/$/, "");
        out.photoUrl = out.photoUrl || findNearbyPhoto(header);
      }
    }

    // 3. Last resort: the document title on a thread reads "Messaging |
    //    <Name> | LinkedIn" often enough to be worth trying before giving up.
    if (!out.name) {
      const parts = (document.title || "").split("|").map((x) => x.trim());
      const candidate = parts.find((x) => x && !/messaging|linkedin|\(\d+\)/i.test(x));
      if (candidate) out.name = candidate;
    }

    return out;
  }

  const INBOUND_HOST_ID = "eden-labs-inbound-widget-host";
  function removeInboundWidget() { document.getElementById(INBOUND_HOST_ID)?.remove(); }

  function showInboundWidget(seed) {
    removeInboundWidget();
    const guess = detectMessageSender();

    const host = document.createElement("div");
    host.id = INBOUND_HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.zIndex = "2147483647";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
        .card {
          position: fixed; top: 24px; right: 24px; width: 380px;
          max-height: calc(100vh - 48px); overflow-y: auto;
          border-radius: 18px;
          background: rgba(255,255,255,.78);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255,255,255,.75);
          box-shadow: 0 2px 8px rgba(0,0,0,.06), 0 18px 52px rgba(0,0,0,.20);
          font-size: 14px; color: #1c1917;
          animation: rise .22s cubic-bezier(0.23,1,0.32,1) both;
        }
        @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .header {
          background: linear-gradient(135deg, rgba(20,83,45,.94), rgba(6,54,30,.94));
          color: #fff; padding: 14px 16px 12px;
          display: flex; align-items: center; gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,.10);
        }
        .logo { width: 28px; height: 28px; background: rgba(255,255,255,.16); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .htext { flex: 1; min-width: 0; }
        .htitle { font-size: 14px; font-weight: 650; }
        .hsub { font-size: 10.5px; opacity: .62; margin-top: 1px; }
        .close-btn { background: rgba(255,255,255,.14); border: none; border-radius: 8px; color: rgba(255,255,255,.8); cursor: pointer; width: 24px; height: 24px; font-size: 13px; display: flex; align-items: center; justify-content: center; }
        .close-btn:hover { background: rgba(255,255,255,.24); color: #fff; }
        .body { padding: 14px 16px 16px; }
        .field { margin-bottom: 10px; }
        label { display: block; font-size: 10px; font-weight: 650; color: #78716c; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
        input, textarea {
          width: 100%; padding: 8px 11px; border: 1px solid rgba(0,0,0,.10); border-radius: 10px;
          background: rgba(255,255,255,.9); font-size: 12.5px; color: #1c1917; outline: none; font-family: inherit;
        }
        input:focus, textarea:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.14); }
        textarea { resize: vertical; min-height: 76px; line-height: 1.45; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .save-btn {
          width: 100%; padding: 10px; border: none; border-radius: 12px;
          background: linear-gradient(135deg, #14532d, #0b3d20); color: #fff;
          font-size: 13px; font-weight: 650; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: transform .15s cubic-bezier(0.23,1,0.32,1), box-shadow .18s ease;
          box-shadow: 0 2px 6px rgba(20,83,45,.20), 0 8px 20px rgba(20,83,45,.16);
        }
        .save-btn:active:not(:disabled) { transform: scale(0.98); }
        .save-btn:disabled { opacity: .5; cursor: default; box-shadow: none; }
        #status { margin-bottom: 10px; padding: 9px 12px; border-radius: 10px; font-size: 12px; display: none; }
        #status.success { background: rgba(240,253,244,.95); color: #166534; border: 1px solid rgba(187,247,208,.9); }
        #status.error { background: rgba(255,241,242,.95); color: #9f1239; border: 1px solid rgba(254,205,211,.9); }
        .note { font-size: 10.5px; color: #a8a29e; line-height: 1.5; margin-top: -4px; margin-bottom: 10px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin .7s linear infinite; display: inline-block; }
        @media (prefers-reduced-motion: reduce) { .card { animation: none; } * { transition-duration: .01ms !important; } }
      </style>

      <div class="card">
        <div class="header">
          <div class="logo">EL</div>
          <div class="htext">
            <div class="htitle">Log inbound enquiry</div>
            <div class="hsub">Goes to your CRM · Inbound board</div>
          </div>
          <button class="close-btn" id="close">✕</button>
        </div>
        <div class="body">
          <div id="status"></div>
          <div class="row">
            <div class="field">
              <label>Name</label>
              <input id="name" placeholder="Who messaged" />
            </div>
            <div class="field">
              <label>Received</label>
              <input id="received" type="date" />
            </div>
          </div>
          <div class="field">
            <label>Their message</label>
            <textarea id="message"></textarea>
          </div>
          <div class="field">
            <label>Profile URL</label>
            <input id="url" placeholder="linkedin.com/in/…" />
          </div>
          <div class="note">
            Lands as unreplied, so it stays on your dashboard's Today list until you tick it off.
          </div>
          <button class="save-btn" id="save">Log enquiry</button>
        </div>
      </div>
    `;

    const $ = (id) => shadow.getElementById(id);
    $("name").value = guess.name || "";
    $("url").value = guess.profileUrl || "";
    $("message").value = seed?.message || "";
    $("received").value = new Date().toISOString().slice(0, 10);

    $("close").addEventListener("click", removeInboundWidget);
    const onKey = (e) => { if (e.key === "Escape") { removeInboundWidget(); window.removeEventListener("keydown", onKey); } };
    window.addEventListener("keydown", onKey);
    if (!guess.name) $("name").focus();

    const showStatus = (type, text) => {
      const el = $("status");
      el.className = type; el.textContent = text; el.style.display = "block";
    };

    $("save").addEventListener("click", () => {
      const name = $("name").value.trim();
      if (!name) { showStatus("error", "Who sent it? Name is required."); $("name").focus(); return; }
      const btn = $("save");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⟳</span> Saving…';
      safeSendMessage({
        type: "SAVE_INBOUND",
        enquiry: {
          name,
          headline: guess.headline || "",
          profileUrl: $("url").value.trim(),
          photoUrl: guess.photoUrl || "",
          message: $("message").value.trim(),
          channel: "linkedin",
          receivedAt: $("received").value || undefined,
        },
      }, (result) => {
        if (result?.ok) {
          showStatus("success", "✓ Logged as an inbound enquiry.");
          btn.innerHTML = "✓ Logged";
          setTimeout(removeInboundWidget, 1200);
        } else {
          showStatus("error", result?.error || "Something went wrong.");
          btn.disabled = false;
          btn.innerHTML = "Log enquiry";
        }
      });
    });
  }

  // ---- Reading a whole feed post ------------------------------------------
  //
  // Saving a highlighted fragment was the only way in before this, which
  // meant the swipe file filled up with half-sentences and no context. The
  // useful unit is the WHOLE post — and its engagement, since a hook that
  // pulled 400 reactions is worth studying and one that pulled 4 is not, and
  // nothing recorded afterwards can tell them apart.

  const POST_SELECTOR = [
    ".feed-shared-update-v2",
    "[data-urn^='urn:li:activity']",
    "[data-id^='urn:li:activity']",
    ".occludable-update",
    "[data-view-name='feed-full-update']",
    ".fie-impression-container",
  ].join(",");

  /**
   * The post container an element sits inside.
   *
   * Uses native closest(), which walks the whole ancestor chain. The first
   * version hand-rolled the walk with a 25-hop ceiling, and LinkedIn's feed
   * nests body text far deeper than that — so hovering the actual words of a
   * post found nothing and the button never appeared. A hop limit here is a
   * guess about someone else's DOM, which is exactly the kind of guess that
   * breaks silently.
   */
  function closestPost(el) {
    if (!el || !el.closest) return null;
    const hit = el.closest(POST_SELECTOR);
    if (!hit) return null;
    // LinkedIn nests several matching containers; walk out to the outermost
    // one so the button anchors to the whole post rather than a fragment.
    let outer = hit;
    for (let p = outer.parentElement; p; p = p.parentElement) {
      if (p.matches?.(POST_SELECTOR)) outer = p;
      // Stop at the feed itself — going further would match the whole list.
      if (p.matches?.("main, .scaffold-finite-scroll__content")) break;
    }
    return outer;
  }

  // Diagnostic, for when LinkedIn changes its markup again. Run
  // `__edenLabsDebugPosts()` in the console on a feed page: it reports how
  // many posts each selector currently finds.
  window.__edenLabsDebugPosts = () => {
    const rows = POST_SELECTOR.split(",").map((sel) => ({
      selector: sel,
      found: document.querySelectorAll(sel).length,
    }));
    const anyMatch = rows.some((r) => r.found > 0);
    /* eslint-disable no-console */
    console.log("%cEden Labs — hover button diagnostic", "font-weight:bold");
    console.log("overlay running :", !!window.__edenLabsOverlayInjected);
    console.table(rows);
    console.log("button in DOM   :", !!document.getElementById(HOVER_BTN_ID));
    if (!anyMatch) {
      console.warn(
        "No post containers matched. LinkedIn has changed its markup — " +
        "hover a post and run: __edenLabsWhatIsThis()"
      );
    }
    /* eslint-enable no-console */
    return rows;
  };

  // Reports the class/attribute shape of whatever is under the cursor, so a
  // markup change can be fixed from real evidence rather than a guess.
  window.__edenLabsWhatIsThis = () => {
    const el = document.querySelector(":hover:last-of-type") || document.activeElement;
    const chain = [];
    for (let n = el; n && chain.length < 12; n = n.parentElement) {
      chain.push({
        tag: n.tagName,
        class: (n.className || "").toString().slice(0, 70),
        dataId: n.getAttribute?.("data-id") || "",
        dataUrn: n.getAttribute?.("data-urn") || "",
        view: n.getAttribute?.("data-view-name") || "",
      });
    }
    // eslint-disable-next-line no-console
    console.table(chain);
    return chain;
  };

  /**
   * Expands a collapsed post before reading it.
   *
   * LinkedIn truncates long posts behind "…see more" and the hidden half is
   * genuinely absent from textContent in some layouts — so reading without
   * expanding silently saves a partial post that LOOKS complete.
   */
  function expandPost(post) {
    const more = post.querySelector(
      'button.feed-shared-inline-show-more-text__see-more-less-toggle,' +
      'button[aria-label*="see more" i],' +
      'button[aria-label*="…more" i],' +
      '.feed-shared-inline-show-more-text button'
    );
    if (more && /more/i.test(more.textContent || more.getAttribute("aria-label") || "")) {
      try { more.click(); } catch { /* layout changed — read what's there */ }
      return true;
    }
    return false;
  }

  // Lines that are LinkedIn chrome, not post content, when they appear on
  // their own — accessibility labels, section badges, timestamps, degree
  // markers, and the action-bar labels (which leak in if a selector match
  // ever includes the bar itself).
  const JUNK_LINE = new Set([
    "feed post", "suggested", "promoted", "follow", "+ follow", "following",
    "like", "comment", "comments", "repost", "send", "save", "share",
    "see more", "…see more", "show more", "load more comments",
    "1st", "2nd", "3rd", "3rd+",
  ]);
  const isJunkLine = (line) => {
    const low = line.toLowerCase();
    if (JUNK_LINE.has(low)) return true;
    // Timestamp, optionally followed by a bullet and/or a connection-degree
    // badge, in any combination — "3d", "3d •", "3d • 2nd", and (once a
    // separator between them has been space'd out) "3d 2nd" all land here.
    if (/^\d+\s*(mo|d|h|w|yr)s?\s*(•\s*)?(1st|2nd|3rd|3rd\+)?\s*$/i.test(line)) return true;
    if (/^•?\s*(1st|2nd|3rd|3rd\+)$/i.test(line)) return true;             // "• 2nd" alone
    if (/^[\d,.]+\s*(k|m)?\s*(reactions?|comments?|reposts?)$/i.test(line)) return true;
    return false;
  };

  /**
   * A copy of `el` with the chrome removed, so reading its text can't pick
   * up button labels, engagement counts, or accessibility-only badges.
   *
   * This works on a CLONE, on purpose — mutating the live post to read it
   * would risk detaching LinkedIn's own event handlers or triggering its
   * mutation-observer-driven re-renders mid-read.
   *
   * Two removal strategies, deliberately not just one:
   *  - by TAG/CLASS (`button`, `.visually-hidden`) for the chrome whose
   *    shape is predictable;
   *  - by ARIA-LABEL CONTENT (`/reaction|comment|repost/i`) for engagement
   *    counts, because their visible text is often just a bare number
   *    ("11") with the meaning carried entirely in the label — a purely
   *    visual/class-based strip would miss them and leave a stray "11"
   *    sitting in the middle of the saved text.
   */
  function stripChrome(el) {
    const clone = el.cloneNode(true);
    // Replaced with a SPACE, not removed outright — e.g. "3d" and "2nd"
    // often sit either side of an aria-hidden "•" separator, and deleting
    // that separator with nothing left in its place fuses the two into
    // "3d2nd", which the timestamp filter below no longer recognises as
    // chrome. A space preserves the word boundary without preserving the
    // separator's own visual noise.
    const spaceOut = (n) => n.replaceWith(n.ownerDocument.createTextNode(" "));
    clone.querySelectorAll('button, [aria-hidden="true"], .visually-hidden, .sr-only')
      .forEach(spaceOut);
    clone.querySelectorAll("[aria-label]").forEach((n) => {
      if (/reaction|comment|repost|profile|graphic link|photo/i.test(n.getAttribute("aria-label") || "")) {
        spaceOut(n);
      }
    });
    return clone;
  }

  /**
   * The post body, with the author's name/headline stripped so this can be
   * applied uniformly whichever element the text came from.
   *
   * A "Suggested" or "Promoted" card wraps the real post inside an extra
   * layer carrying its own accessibility label ("Feed post") and section
   * badge ("Suggested") — variants like this don't share the ordinary
   * post's class names, so the specific selectors below miss them and this
   * used to fall back to reading that OUTER wrapper's full text, badges and
   * all. Filtering by content rather than trusting whichever element
   * matched is what makes the fallback safe to use at all.
   */
  function postText(post, author) {
    const candidates = [
      post.querySelector(
        ".feed-shared-update-v2__description," +
        ".update-components-text," +
        ".update-components-update-v2__commentary," +
        ".feed-shared-inline-show-more-text," +
        ".feed-shared-text," +
        '[data-test-id="main-feed-activity-card__commentary"]'
      ),
      post,
    ].filter(Boolean);

    const authorLow = (author?.author || "").trim().toLowerCase();
    const headlineLow = (author?.headline || "").trim().toLowerCase();

    for (const raw of candidates) {
      const el = stripChrome(raw);
      // innerText preserves the line breaks that make a post readable, but
      // it's undefined outside a rendering engine and empty for some nodes —
      // textContent is the floor.
      const text = el.innerText || el.textContent || "";
      const cleaned = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => {
          if (!l) return false;
          const low = l.toLowerCase();
          if (isJunkLine(l)) return false;
          if (authorLow && low === authorLow) return false;
          if (headlineLow && low === headlineLow) return false;
          return true;
        })
        .join("\n")
        // Not anchored to the end: LinkedIn sometimes renders the truncation
        // marker inline with the paragraph rather than as a separate
        // button, so it can land mid-string once trailing chrome is gone.
        .replace(/…?\s*see more/gi, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      // A real post is more than a stray word — the specific selector is
      // tried first and accepted if it clears this bar; only the raw
      // whole-post text needs it, since that's the one that can contain
      // nothing but chrome.
      if (cleaned.length >= 20) return cleaned;
    }
    return "";
  }

  /** Engagement counts, best-effort — absent on a post with none. */
  function postStats(post) {
    const num = (t) => {
      const m = String(t || "").replace(/,/g, "").match(/([\d.]+)\s*([KM])?/i);
      if (!m) return 0;
      const n = parseFloat(m[1]) || 0;
      const suffix = (m[2] || "").toUpperCase();
      return Math.round(suffix === "K" ? n * 1000 : suffix === "M" ? n * 1000000 : n);
    };
    // Matches a SPAN as readily as a button: LinkedIn renders the reaction
    // count either way depending on whether the post has any, and keying
    // only on button silently returned 0 for the ones that do.
    const reactionEl = post.querySelector(
      '.social-details-social-counts__reactions-count,' +
      '[aria-label*="reaction" i],' +
      '[data-test-id="social-actions__reaction-count"]'
    );
    const commentEl = [...post.querySelectorAll('.social-details-social-counts__comments, button, span, a')]
      .find((n) => /\bcomments?\b/i.test(n.getAttribute?.("aria-label") || n.textContent || ""));
    return {
      reactions: num(reactionEl?.getAttribute("aria-label") || reactionEl?.textContent),
      comments: num(commentEl?.getAttribute?.("aria-label") || commentEl?.textContent),
    };
  }

  function postAuthor(post) {
    const link =
      post.querySelector('.update-components-actor__meta a[href*="/in/"]') ||
      post.querySelector('.update-components-actor a[href*="/in/"]') ||
      post.querySelector('a[href*="/in/"]');
    const headlineEl = post.querySelector(
      ".update-components-actor__description," +
      ".feed-shared-actor__description"
    );
    return {
      author: link ? extractNameFromLink(link) : "",
      authorUrl: link ? link.href.split("?")[0].replace(/\/$/, "") : "",
      authorPhoto: link ? findNearbyPhoto(link) : "",
      headline: ((headlineEl?.innerText || headlineEl?.textContent || "").split("\n")[0] || "").trim(),
    };
  }

  /** Permalink to the post itself, not the feed page it was seen on. */
  function postUrl(post) {
    const urn = post.getAttribute("data-urn") || post.getAttribute("data-id") || "";
    const id = (urn.match(/urn:li:activity:(\d+)/) || [])[1];
    if (id) return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
    const link = post.querySelector('a[href*="/feed/update/"]');
    return link ? link.href.split("?")[0] : location.href.split("?")[0];
  }

  async function readPost(post) {
    if (expandPost(post)) {
      // Let LinkedIn re-render the expanded body before reading it.
      await new Promise((r) => setTimeout(r, 220));
    }
    // Author first: postText uses the name/headline to strip them out of
    // whichever element it ends up reading, which is what makes the
    // whole-post fallback usable instead of just quieter about being wrong.
    const author = postAuthor(post);
    return {
      text: postText(post, author),
      url: postUrl(post),
      stats: postStats(post),
      ...author,
    };
  }

  // ---- "Save" in the post's own action bar ---------------------------------
  //
  // Anchored to the LIKE BUTTON, not to a container class.
  //
  // Class names are LinkedIn's private implementation detail and they churn;
  // an aria-label on the Like control is a semantic contract with screen
  // readers that they cannot casually break. Keying off function instead of
  // styling is the difference between a button that survives their next
  // redesign and one that silently disappears, which is exactly what the
  // first version did.
  //
  // It also means no coordinate maths and no hover detection: the button is
  // laid out by LinkedIn's own flexbox, next to Like / Comment / Repost /
  // Send, where a post-level action obviously belongs.

  const INJECTED_FLAG = "edenLabsSave";

  function findLikeButton(scope) {
    return scope.querySelector(
      'button[aria-label*="Like" i]:not([data-eden-save]),' +
      'button[aria-label*="React" i]:not([data-eden-save])'
    );
  }

  /** The row holding Like/Comment/Repost — the shallowest ancestor with both. */
  function actionBarOf(like) {
    let row = like.parentElement;
    for (let i = 0; row && i < 6; i++, row = row.parentElement) {
      if (row.querySelector('button[aria-label*="comment" i]')) return row;
    }
    return like.parentElement;
  }

  /**
   * The post a given action bar belongs to.
   *
   * Prefers a known container, but falls back to walking out to the first
   * ancestor that has both an author link and a real amount of text — so a
   * markup change costs us the nice selector, not the feature.
   */
  function postFromBar(bar) {
    const known = closestPost(bar);
    if (known) return known;
    for (let n = bar.parentElement; n; n = n.parentElement) {
      if (n.matches?.("main, body")) break;
      // textContent, not innerText — same trap as postText. This fallback is
      // the ONLY thing standing between a LinkedIn redesign and the feature
      // disappearing, so it must not depend on a rendering engine.
      const len = (n.innerText || n.textContent || "").length;
      if (n.querySelector('a[href*="/in/"]') && len > 120) return n;
    }
    return null;
  }

  function makeActionButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-eden-save", "1");
    btn.setAttribute("aria-label", "Save this post to Eden Labs");
    btn.title = "Save to Eden Labs";
    // A bookmark icon labelled "Save" is what LinkedIn's OWN inline save
    // action already looks like — sitting them side by side produced two
    // visually identical buttons a user could not tell apart. This uses our
    // own mark (the "EL" badge from the other widgets) and names the
    // destination rather than the verb, so it reads as a distinct
    // third-party control rather than a duplicate of the native one.
    btn.innerHTML =
      '<span style="display:inline-flex;align-items:center;justify-content:center;' +
      'width:16px;height:16px;border-radius:4px;background:#065f46;color:#fff;' +
      'font:800 9px/1 -apple-system,sans-serif;letter-spacing:-.02em;flex-shrink:0;">EL</span>' +
      '<span data-eden-save-label>Eden Labs</span>';
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 10px",
      margin: "0 2px",
      border: "none",
      borderRadius: "4px",
      background: "transparent",
      color: "rgba(0,0,0,.6)",
      font: "600 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      cursor: "pointer",
      transition: "background-color .15s ease, color .15s ease",
    });
    btn.addEventListener("mouseenter", () => { btn.style.background = "rgba(0,0,0,.08)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    return btn;
  }

  function injectSaveButton(like) {
    const bar = actionBarOf(like);
    if (!bar || bar.dataset[INJECTED_FLAG] === "1") return;
    const post = postFromBar(bar);
    if (!post) return;
    // No author link means this isn't a person's post — promoted units and
    // "people you may know" carousels carry Like buttons too, and offering
    // to save one produces an empty card.
    if (!post.querySelector('a[href*="/in/"]')) return;
    bar.dataset[INJECTED_FLAG] = "1";

    const btn = makeActionButton();
    const label = btn.querySelector("[data-eden-save-label]");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const original = label.textContent;
      label.textContent = "Reading…";
      btn.disabled = true;
      try {
        const read = await readPost(post);
        if (!read.text) { showToast("Couldn't read that post", true); return; }
        showSwipeWidget({ ...read, pageUrl: read.url, fromHover: true });
      } catch {
        showToast("Couldn't read that post", true);
      } finally {
        label.textContent = original;
        btn.disabled = false;
      }
    });
    bar.appendChild(btn);
  }

  function scanForPosts() {
    let like;
    let guard = 0;
    // Each pass handles the buttons LinkedIn has rendered so far; the
    // observer below picks up the rest as the feed loads more.
    while ((like = findLikeButton(document)) && guard++ < 60) {
      like.setAttribute("data-eden-save", "seen");
      injectSaveButton(like);
    }
  }

  // The feed is infinite and virtualised, so posts arrive forever. Debounced
  // because LinkedIn mutates the DOM constantly and re-scanning on every
  // change would be the most expensive thing on the page.
  let scanTimer = null;
  const queueScan = () => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanForPosts, 400);
  };
  if (document.body) {
    new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
    queueScan();
  }

  // ---- Hover "Save post" button --------------------------------------------
  //
  // Appears on hover rather than always: this feed is read for an hour a day
  // and a permanent button on every post is clutter in the one place that
  // has to stay readable. Hover is also how LinkedIn's own post controls
  // behave, so it doesn't read as foreign.
  //
  // One button per page, moved to whichever post is hovered, instead of one
  // injected into each. The feed is virtualised and infinite — injecting per
  // post means re-injecting forever and leaking nodes as they recycle.

  const HOVER_BTN_ID = "eden-labs-save-post-btn";
  let hoveredPost = null;

  function ensureHoverButton() {
    let btn = document.getElementById(HOVER_BTN_ID);
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = HOVER_BTN_ID;
    btn.type = "button";
    btn.title = "Save this post to Eden Labs";
    btn.innerHTML =
      '<span style="font-size:13px;line-height:1">\u2b07</span>' +
      '<span style="font-weight:650">Save</span>';
    Object.assign(btn.style, {
      // FIXED, not absolute. Absolute meant computing document coordinates
      // from window.scrollY, which breaks the moment any ancestor has a
      // transform — and LinkedIn's feed uses them. Fixed positions against
      // the viewport, which is exactly what a getBoundingClientRect() gives
      // back, so the two can't disagree.
      position: "fixed",
      zIndex: "2147483000",
      display: "none",
      alignItems: "center",
      gap: "6px",
      padding: "6px 11px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.14)",
      background: "rgba(20,20,19,.92)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      color: "#fff",
      font: "500 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,.18)",
      transition: "transform .15s cubic-bezier(.23,1,.32,1), opacity .15s ease",
      opacity: "0",
    });
    btn.addEventListener("mouseenter", () => { btn.style.transform = "translateY(-1px)"; });
    btn.addEventListener("mouseleave", () => { btn.style.transform = "none"; });
    btn.addEventListener("mousedown", () => { btn.style.transform = "scale(.96)"; });
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!hoveredPost) return;
      btn.style.pointerEvents = "none";
      btn.querySelector("span:last-child").textContent = "Reading…";
      try {
        const read = await readPost(hoveredPost);
        if (!read.text) { showToast("Couldn't read that post", true); return; }
        showSwipeWidget({ ...read, pageUrl: read.url, fromHover: true });
      } finally {
        btn.querySelector("span:last-child").textContent = "Save";
        btn.style.pointerEvents = "";
        hideHoverButton();
      }
    });
    document.body.appendChild(btn);
    return btn;
  }

  function hideHoverButton() {
    const btn = document.getElementById(HOVER_BTN_ID);
    if (btn) { btn.style.opacity = "0"; btn.style.display = "none"; }
    hoveredPost = null;
  }

  function positionHoverButton(post) {
    const btn = ensureHoverButton();
    const r = post.getBoundingClientRect();
    // Too small to be a real post, or scrolled out of view — LinkedIn keeps
    // recycled containers in the DOM with zero height.
    if (r.height < 120 || r.bottom < 0 || r.top > window.innerHeight) {
      hideHoverButton();
      return;
    }
    btn.style.display = "inline-flex";
    // Clamped into the viewport so a post whose top has scrolled past the
    // header doesn't put the button off-screen.
    const top = Math.min(Math.max(r.top + 12, 70), window.innerHeight - 50);
    btn.style.top = `${top}px`;
    btn.style.left = `${Math.max(8, r.right - 96)}px`;
    requestAnimationFrame(() => { btn.style.opacity = "1"; });
    hoveredPost = post;
  }

  document.addEventListener("mouseover", (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    // Hovering the button itself must not count as leaving the post.
    if (t.id === HOVER_BTN_ID || t.closest?.(`#${HOVER_BTN_ID}`)) return;
    const post = closestPost(t);
    // Fallback only. When the action-bar button injected successfully this
    // post already has a Save control and a second floating one would just
    // be clutter — the hover path exists for the case where LinkedIn's
    // action bar couldn't be found at all.
    const alreadyHasButton = post?.querySelector?.('[data-eden-save="1"]');
    if (post && !alreadyHasButton) positionHoverButton(post);
    else if (hoveredPost) hideHoverButton();
  }, true);

  // The button is absolutely positioned against the document, so it has to
  // follow the post it belongs to rather than staying where it was drawn.
  let repositionRaf = null;
  const reposition = () => {
    if (repositionRaf) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = null;
      if (hoveredPost?.isConnected) positionHoverButton(hoveredPost);
      else hideHoverButton();
    });
  };
  window.addEventListener("scroll", reposition, { passive: true });
  window.addEventListener("resize", reposition, { passive: true });

  // ---- Save-content widget (right-click a selection → "Save to content") --

  const SWIPE_HOST_ID = "eden-labs-swipe-widget-host";
  function removeSwipeWidget() { document.getElementById(SWIPE_HOST_ID)?.remove(); }

  function showSwipeWidget(swipe) {
    removeSwipeWidget();

    // A hover save has already read the author straight off the post, which
    // is far more reliable than walking up from wherever a text selection
    // happened to land. The selection heuristics below are the fallback for
    // the right-click path only.
    let author = swipe.author || "";
    let authorUrl = swipe.authorUrl || "";
    let authorPhoto = swipe.authorPhoto || "";

    if (!swipe.fromHover) {
      // The selection is still live when this message arrives — right-
      // clicking doesn't clear it — so the same profile-link heuristics used
      // for the universal add-to-list button can find the post's AUTHOR too.
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
            <label>Folder</label>
            <select id="folder"><option value="">Uncategorised</option></select>
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

    // Folders come from whichever account is signed in, so a client profile
    // only ever sees that client's own groupings.
    safeSendMessage({ type: "LIST_SWIPE_FOLDERS" }, (res) => {
      if (!res?.ok || !res.folders?.length) return;
      const sel = $("folder");
      if (!sel) return;
      res.folders.forEach((f) => {
        const o = document.createElement("option");
        o.value = f.id; o.textContent = f.name;
        sel.appendChild(o);
      });
    });

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
          folderId: $("folder").value || null,
          headline: swipe.headline || "",
          // Engagement at save time — see the readPost() note. Only sent
          // when it was actually read off the post, so a manual save doesn't
          // record a fake zero that later reads as "this flopped".
          stats: swipe.stats && (swipe.stats.reactions || swipe.stats.comments) ? swipe.stats : null,
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
    if (msg.type === "SHOW_INBOUND_WIDGET") showInboundWidget(msg.seed);
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

        /* Glass, tuned for LinkedIn's light grey page rather than in the
           abstract: a translucent white panel over that background needs a
           high blur AND saturation boost, or it reads as flat milky grey
           instead of glass. The 1px white inner border is what actually
           sells the edge — without it the panel has no lip and looks like a
           low-opacity rectangle. */
        .panel {
          display: none;
          width: 360px; max-height: 70vh;
          border-radius: 18px; margin-bottom: 12px; overflow: hidden;
          background: rgba(255,255,255,.72);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255,255,255,.7);
          box-shadow: 0 2px 8px rgba(0,0,0,.06), 0 16px 48px rgba(0,0,0,.20);
          animation: rise .22s cubic-bezier(0.23,1,0.32,1) both;
        }
        .panel.open { display: flex; flex-direction: column; }
        /* Never from scale(0) — an element that pops out of nothing reads as
           a glitch. A short lift plus fade is enough. */
        @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .panel-header {
          padding: 14px 16px 12px;
          background: linear-gradient(135deg, rgba(20,83,45,.92), rgba(6,54,30,.92));
          -webkit-backdrop-filter: blur(20px);
          backdrop-filter: blur(20px);
          color: #fff; flex-shrink: 0;
          border-bottom: 1px solid rgba(255,255,255,.10);
        }
        .panel-header .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .panel-header .title { font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
        .panel-header .sub { font-size: 11px; opacity: .6; margin-top: 1px; }
        .stat { text-align: right; flex-shrink: 0; }
        .stat .big { font-size: 20px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
        .stat .cap { font-size: 9.5px; opacity: .55; text-transform: uppercase; letter-spacing: .05em; margin-top: 3px; }

        /* Progress toward "everything on today's list is bookmarked". */
        .track { height: 3px; border-radius: 99px; background: rgba(255,255,255,.16); margin-top: 11px; overflow: hidden; }
        .track > i {
          display: block; height: 100%; border-radius: 99px; background: #4ade80;
          transform-origin: left; transition: transform .3s cubic-bezier(0.23,1,0.32,1);
        }

        .body { overflow-y: auto; flex: 1; }
        .body::-webkit-scrollbar { width: 8px; }
        .body::-webkit-scrollbar-thumb { background: rgba(0,0,0,.14); border-radius: 99px; border: 2px solid transparent; background-clip: content-box; }

        .add-row { padding: 12px 14px 10px; }
        .add-btn {
          width: 100%; padding: 10px; border-radius: 12px; cursor: pointer;
          background: rgba(255,255,255,.55); border: 1px dashed rgba(22,101,52,.35);
          color: #166534; font-size: 12.5px; font-weight: 600;
          transition: background .15s ease, transform .15s cubic-bezier(0.23,1,0.32,1);
        }
        @media (hover: hover) { .add-btn:hover:not(:disabled) { background: rgba(220,252,231,.8); } }
        .add-btn:active:not(:disabled) { transform: scale(0.98); }
        .add-btn:disabled { opacity: .45; cursor: default; }

        .hint { padding: 0 15px 10px; font-size: 10.5px; color: #78716c; line-height: 1.5; }

        .daygroup { padding: 0 8px; }
        .daylabel {
          display: flex; align-items: center; gap: 8px;
          padding: 9px 7px 5px; font-size: 10px; font-weight: 700;
          color: #57534e; text-transform: uppercase; letter-spacing: .06em;
        }
        .daylabel .rule { height: 1px; flex: 1; background: rgba(0,0,0,.07); }
        .daylabel .n { opacity: .5; font-weight: 600; letter-spacing: 0; }

        .row {
          display: flex; align-items: center; gap: 9px; padding: 7px;
          border-radius: 11px; font-size: 12.5px; color: #1c1917;
          transition: background .15s ease;
        }
        @media (hover: hover) { .row:hover { background: rgba(255,255,255,.7); } }
        .row.done .name { color: #a8a29e; text-decoration: line-through; }
        .row.done img, .row.done .avatar-fallback { opacity: .45; }

        .idx {
          width: 17px; flex-shrink: 0; text-align: right;
          font-size: 10.5px; font-weight: 600; color: #a8a29e;
          font-variant-numeric: tabular-nums;
        }

        /* Real checkbox, restyled — keeps keyboard focus and the native
           :checked state instead of faking both with a div. */
        .tick {
          appearance: none; -webkit-appearance: none;
          width: 17px; height: 17px; flex-shrink: 0; cursor: pointer;
          border: 1.5px solid rgba(0,0,0,.22); border-radius: 6px;
          background: rgba(255,255,255,.6);
          display: grid; place-content: center;
          transition: background .15s ease, border-color .15s ease, transform .15s cubic-bezier(0.23,1,0.32,1);
        }
        .tick:active { transform: scale(0.9); }
        .tick:checked { background: #16a34a; border-color: #16a34a; }
        .tick:checked::after {
          content: ""; width: 9px; height: 5px;
          border: 2px solid #fff; border-top: 0; border-right: 0;
          transform: rotate(-45deg) translate(1px, -1px);
        }
        .tick:focus-visible { outline: 2px solid #16a34a; outline-offset: 2px; }

        .row img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #e7e5e4; }
        .row .avatar-fallback {
          width: 26px; height: 26px; border-radius: 50%;
          background: rgba(22,163,74,.14); color: #14532d;
          font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row a {
          color: #14532d; text-decoration: none; font-size: 11px; flex-shrink: 0;
          padding: 3px 7px; border-radius: 7px; background: rgba(20,83,45,.07);
          transition: background .15s ease;
        }
        @media (hover: hover) { .row a:hover { background: rgba(20,83,45,.14); } }
        .row .remove-btn {
          background: transparent; border: none; color: #d6d3d1; cursor: pointer;
          flex-shrink: 0; padding: 3px; border-radius: 6px; line-height: 1;
          display: flex; align-items: center; justify-content: center;
          transition: color .15s ease, background .15s ease, transform .15s cubic-bezier(0.23,1,0.32,1);
        }
        @media (hover: hover) { .row .remove-btn:hover { color: #9f1239; background: rgba(255,241,242,.9); } }
        .row .remove-btn:active { transform: scale(0.9); }
        .row .remove-btn:disabled { opacity: .4; cursor: default; }

        .empty { padding: 26px 16px; text-align: center; color: #a8a29e; font-size: 12px; line-height: 1.6; }
        .not-connected { padding: 16px; text-align: center; color: #9a3412; font-size: 12px; background: rgba(255,247,237,.9); }

        /* The trigger. Bigger than before — it's the extension's front door
           on every LinkedIn page, and the old pill was easy to lose against
           a busy feed. */
        .fab {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 18px 12px 14px; border: none; border-radius: 999px;
          font-size: 13.5px; font-weight: 650; letter-spacing: -.01em;
          color: #fff; cursor: pointer;
          background: linear-gradient(135deg, rgba(20,83,45,.94), rgba(6,54,30,.94));
          -webkit-backdrop-filter: blur(16px) saturate(160%);
          backdrop-filter: blur(16px) saturate(160%);
          border: 1px solid rgba(255,255,255,.14);
          box-shadow: 0 2px 8px rgba(0,0,0,.14), 0 10px 28px rgba(20,83,45,.30);
          transition: transform .18s cubic-bezier(0.23,1,0.32,1), box-shadow .18s ease;
        }
        @media (hover: hover) { .fab:hover { box-shadow: 0 2px 8px rgba(0,0,0,.16), 0 14px 36px rgba(20,83,45,.40); } }
        .fab:active { transform: scale(0.96); }
        .fab .badge {
          background: rgba(255,255,255,.20); border-radius: 999px;
          min-width: 22px; height: 22px; padding: 0 7px; font-size: 11.5px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-variant-numeric: tabular-nums;
        }

        @media (prefers-reduced-motion: reduce) {
          .panel { animation: none; }
          * { transition-duration: .01ms !important; }
        }
      </style>

      <div class="panel" id="panel">
        <div class="panel-header">
          <div class="top">
            <div>
              <div class="title">Comment list</div>
              <div class="sub" id="scope-label">Eden Labs</div>
            </div>
            <div class="stat">
              <div class="big"><span id="done-count">0</span><span style="opacity:.45">/</span><span id="count-hdr">0</span></div>
              <div class="cap">bookmarked</div>
            </div>
          </div>
          <div class="track"><i id="progress" style="transform:scaleX(0)"></i></div>
        </div>

        <div class="body">
          <div class="add-row">
            <button class="add-btn" id="add-btn">+ Add this profile</button>
          </div>
          <div class="hint">Tick each one once you've added them to your saved LinkedIn search. Right-click any name anywhere on LinkedIn to add it here.</div>
          <div id="list"></div>
        </div>
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

    // "20 Aug" / "Today" / "Yesterday". Grouping by the day something was
    // added is what makes this a daily routine rather than one ever-growing
    // pile — you work today's batch, not all 60.
    function dayLabel(iso) {
      if (!iso) return "No date";
      const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
      if (Number.isNaN(d.getTime())) return "No date";
      const today = new Date(); today.setHours(12, 0, 0, 0);
      const diff = Math.round((today - d) / 86400000);
      if (diff === 0) return "Today";
      if (diff === 1) return "Yesterday";
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    }

    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function renderRows(targets) {
      const list = $("list");
      if (!targets.length) {
        list.innerHTML = `<div class="empty">Nothing on the list yet.<br />Visit a profile and add it, or right-click any name on LinkedIn.</div>`;
        return;
      }

      // Newest day first, and newest-added first within a day.
      const groups = new Map();
      targets.slice().reverse().forEach((t) => {
        const key = String(t.addedAt || "").slice(0, 10) || "none";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      });
      const keys = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

      // Numbering runs continuously across the whole list rather than
      // restarting per day, so "#14 of 23" stays meaningful while working
      // down it.
      let n = 0;
      list.innerHTML = keys.map((key) => {
        const items = groups.get(key);
        const rows = items.map((t) => {
          n += 1;
          const label = t.name || t.profileUrl;
          return `
            <div class="row ${t.inSearch ? "done" : ""}" data-id="${esc(t.id)}">
              <span class="idx">${n}</span>
              <input class="tick" type="checkbox" data-tick-id="${esc(t.id)}" ${t.inSearch ? "checked" : ""}
                     title="Added to my saved search" aria-label="Added to my saved search" />
              ${t.photoUrl ? `<img src="${esc(t.photoUrl)}" alt="" />` : `<span class="avatar-fallback">${esc(initials(t.name))}</span>`}
              <span class="name" title="${esc(label)}">${esc(label)}</span>
              <a href="${esc(t.profileUrl)}" target="_blank" rel="noopener">Open</a>
              <button class="remove-btn" data-remove-id="${esc(t.id)}" title="Remove from list" aria-label="Remove from list">✕</button>
            </div>`;
        }).join("");
        return `
          <div class="daygroup">
            <div class="daylabel">${esc(dayLabel(key === "none" ? "" : key))}<span class="rule"></span><span class="n">${items.length}</span></div>
            ${rows}
          </div>`;
      }).join("");
    }

    // One delegated listener rather than one per row — the list re-renders
    // wholesale on every refresh, so per-row listeners would just leak.
    $("list").addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-remove-id]");
      if (!btn) return;
      const id = btn.dataset.removeId;
      btn.disabled = true;
      btn.textContent = "…";
      safeSendMessage({ type: "DELETE_COMMENT_TARGET", id }, (result) => {
        if (result?.ok) refreshList();
        else { btn.disabled = false; btn.textContent = "✕"; showToast(result?.error || "Couldn't remove — try again.", true); }
      });
    });

    // The tick is applied optimistically: it's a checkbox, so it has already
    // visually flipped by the time this fires, and a round trip before
    // honouring it would feel broken. Reverted only if the save fails.
    $("list").addEventListener("change", (e) => {
      const box = e.target.closest?.("[data-tick-id]");
      if (!box) return;
      const id = box.dataset.tickId;
      const inSearch = box.checked;
      box.closest(".row")?.classList.toggle("done", inSearch);
      updateProgressFromDom();
      safeSendMessage({ type: "UPDATE_COMMENT_TARGET", id, patch: { inSearch } }, (result) => {
        if (result?.ok) return;
        box.checked = !inSearch;
        box.closest(".row")?.classList.toggle("done", !inSearch);
        updateProgressFromDom();
        showToast(result?.error || "Couldn't save that tick — try again.", true);
      });
    });

    // Recomputed from the DOM rather than refetching, so ticking stays
    // instant and costs no request.
    function updateProgressFromDom() {
      const boxes = [...$("list").querySelectorAll("[data-tick-id]")];
      const done = boxes.filter((b) => b.checked).length;
      $("done-count").textContent = String(done);
      $("count-hdr").textContent = String(boxes.length);
      $("progress").style.transform = `scaleX(${boxes.length ? done / boxes.length : 0})`;
    }

    function refreshList() {
      safeSendMessage({ type: "GET_COMMENT_TARGETS" }, (result) => {
        if (!result?.ok) {
          $("list").innerHTML = `<div class="not-connected">${esc(result?.error || "Not connected — open Settings to enter your PIN.")}</div>`;
          $("count").textContent = "0";
          return;
        }
        $("count").textContent = String(result.targets.length);
        renderRows(result.targets);
        updateProgressFromDom();
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
      // Fail closed rather than silently saving a blank name — LinkedIn's
      // SPA can still be mid-navigation the instant this runs, and a saved
      // row with no name is worse than a button that says "wait a second".
      if (!profile.name) {
        btn.disabled = true;
        btn.textContent = "Detecting name…";
        return;
      }
      btn.disabled = false;
      btn.textContent = `+ Add ${profile.name}`;
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
