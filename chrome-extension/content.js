// Eden Labs CRM — content script
//
// Injected on demand (via chrome.scripting.executeScript, triggered only by
// the right-click "Save to CRM" context menu — never preloaded on every
// page) into the tab the user is actively on. Renders a small floating card
// directly on top of the current page — LinkedIn, Google, wherever — inside
// a Shadow DOM so the host page's CSS can never bleed in or clash with it.
// The user never leaves the page or loses their place.
//
// Guarded against double-injection: right-clicking a second name just
// re-populates the existing widget instead of registering duplicate
// listeners or stacking a second card.

if (!window.__edenLabsCRMInjected) {
  window.__edenLabsCRMInjected = true;

  const HOST_ID = "eden-labs-crm-widget-host";

  function removeWidget() {
    document.getElementById(HOST_ID)?.remove();
  }

  function labelForUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host.includes("linkedin")) return "LinkedIn";
      if (host.includes("twitter") || host.includes("x.com")) return "X / Twitter";
      if (host.includes("google")) return "Google";
      if (host.includes("apollo")) return "Apollo";
      return host;
    } catch {
      return "Chrome Extension";
    }
  }

  // Finds the profile photo on the current LinkedIn page, if there is one.
  // Deliberately not tied to a specific class name — LinkedIn's markup is
  // auto-generated and changes without notice, so a hard-coded selector
  // would break silently sooner or later. Instead: every profile photo is
  // served from LinkedIn's media CDN, so we look for images pointing there.
  //
  // Previously this just grabbed the single largest licdn.com image
  // anywhere on the page — fine on a lone profile page, but wrong any time
  // the page shows more than one person (search results, connection lists,
  // a feed post, comments): it kept handing back whichever photo happened
  // to render biggest, regardless of whose name was actually selected.
  // Now it first looks for a photo near the text the user right-clicked —
  // walking up from the selection to the nearest ancestor that contains a
  // licdn.com image, which on LinkedIn's list/card markup is reliably the
  // same person's row/card. Falls back to the old "largest on page"
  // heuristic only if there's no usable selection to anchor on.
  function findLinkedInPhoto() {
    // Matches linkedin.com and any subdomain (www., mobile., etc.) — but not
    // some unrelated domain that merely ends in the same letters.
    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      let el = selection.anchorNode;
      if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
      // Climb a bounded number of ancestors — far enough to reach a search
      // result's <li> or a comment's container, not so far we end up back
      // at "whole page" (which would defeat the point).
      for (let hops = 0; el && hops < 10; hops++, el = el.parentElement) {
        const img = el.querySelector?.('img[src*="media.licdn.com"]');
        if (img && img.naturalWidth > 24 && img.naturalHeight > 24) return img.src;
      }
    }

    const candidates = Array.from(document.querySelectorAll('img[src*="media.licdn.com"]'))
      .filter((img) => img.naturalWidth > 60 && img.naturalHeight > 60); // skip small icons/logos
    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
    return candidates[0].src;
  }

  function showWidget(lead) {
    removeWidget(); // one at a time — a fresh right-click replaces, never stacks

    const host = document.createElement("div");
    host.id = HOST_ID;
    // Reset anything the host page might try to inherit down through it.
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.zIndex = "2147483647"; // max — always on top
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card {
          position: fixed;
          top: 24px;
          right: 24px;
          width: 360px;
          max-height: calc(100vh - 48px);
          overflow-y: auto;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,.12), 0 12px 40px rgba(0,0,0,.18);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
          font-size: 14px;
          color: #1c1917;
          animation: slide-in .18s ease-out;
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .header {
          background: #14532d;
          color: #fff;
          padding: 14px 16px 12px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 16px 16px 0 0;
        }
        .logo {
          width: 26px; height: 26px;
          background: rgba(255,255,255,.15);
          border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
        }
        .header-text { flex: 1; min-width: 0; }
        .header-title { font-size: 14px; font-weight: 600; }
        .header-sub { font-size: 10.5px; opacity: .65; margin-top: 1px; }
        .close-btn {
          background: rgba(255,255,255,.12); border: none; border-radius: 6px;
          color: rgba(255,255,255,.75); cursor: pointer;
          width: 22px; height: 22px; font-size: 14px; line-height: 1;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .close-btn:hover { background: rgba(255,255,255,.22); color: #fff; }

        .body { padding: 14px 16px 16px; }
        .photo-row {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 12px; display: none;
        }
        .photo-row img {
          width: 40px; height: 40px; border-radius: 50%;
          object-fit: cover; border: 1px solid #e7e5e4; flex-shrink: 0;
        }
        .photo-row span { font-size: 11px; color: #78716c; }
        .field { margin-bottom: 10px; }
        label {
          display: block; font-size: 10px; font-weight: 600; color: #78716c;
          text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px;
        }
        input, select, textarea {
          width: 100%; padding: 7px 10px;
          border: 1px solid #e7e5e4; border-radius: 8px;
          background: #fff; font-size: 12.5px; color: #1c1917;
          outline: none; font-family: inherit;
        }
        input:focus, select:focus, textarea:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 3px rgba(22,163,74,.12);
        }
        textarea { resize: vertical; min-height: 50px; line-height: 1.4; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

        .source-chip {
          display: flex; align-items: center; gap: 4px;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 99px; padding: 3px 9px; margin-top: 4px;
          font-size: 10.5px; color: #166534; overflow: hidden;
        }
        .source-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .save-btn {
          width: 100%; padding: 9px;
          background: #14532d; color: #fff; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .save-btn:hover:not(:disabled) { background: #166534; }
        .save-btn:disabled { opacity: .55; cursor: default; }

        #status {
          margin-bottom: 10px; padding: 8px 11px; border-radius: 8px;
          font-size: 12px; display: none;
        }
        #status.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        #status.error { background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3; }
        #status a { color: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin .7s linear infinite; display: inline-block; }
      </style>

      <div class="card">
        <div class="header">
          <div class="logo">EL</div>
          <div class="header-text">
            <div class="header-title">Save Lead</div>
            <div class="header-sub">Eden Labs CRM</div>
          </div>
          <button class="close-btn" id="close">✕</button>
        </div>
        <div class="body">
          <div id="status"></div>

          <div class="photo-row" id="photo-row">
            <img id="photo-preview" alt="" />
            <span>Photo captured from LinkedIn</span>
          </div>

          <div class="field">
            <label>Name *</label>
            <input id="name" type="text" placeholder="Full name" />
          </div>

          <div class="row">
            <div class="field">
              <label>Company</label>
              <input id="company" type="text" />
            </div>
            <div class="field">
              <label>Title</label>
              <input id="title" type="text" />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label>Stage</label>
              <select id="stage">
                <option value="lead">Lead</option>
                <option value="call_booked">Call booked</option>
                <option value="proposal_sent">Proposal sent</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div class="field">
              <label>Deal value ($)</label>
              <input id="deal-value" type="number" min="0" />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <label>Email</label>
              <input id="email" type="email" />
            </div>
            <div class="field">
              <label>Phone</label>
              <input id="phone" type="tel" />
            </div>
          </div>

          <div class="field">
            <label>Notes</label>
            <textarea id="notes" placeholder="Anything worth remembering…"></textarea>
          </div>

          <div class="field" id="source-field" style="display:none">
            <div class="source-chip">
              <span>🔗</span><span id="source-url"></span>
            </div>
          </div>

          <button class="save-btn" id="save">Save to CRM</button>
        </div>
      </div>
    `;

    const $ = (id) => shadow.getElementById(id);

    $("name").value = lead.name || "";
    if (lead.pageUrl && lead.pageUrl !== "about:blank") {
      $("source-field").style.display = "block";
      $("source-url").textContent = lead.pageUrl;
      $("source-url").title = lead.pageUrl;
    }

    // Auto-detect the profile photo the moment the card opens — no extra
    // click needed, works purely because the widget happens to be open on a
    // LinkedIn profile page already.
    const photoUrl = findLinkedInPhoto();
    if (photoUrl) {
      $("photo-preview").src = photoUrl;
      $("photo-row").style.display = "flex";
    }

    $("close").addEventListener("click", removeWidget);

    // Escape key + click-outside close it — but since the widget itself
    // isn't a page-covering overlay, "outside" just means anywhere on the
    // host page, so we listen on window in the capture phase.
    const onKey = (e) => { if (e.key === "Escape") { removeWidget(); window.removeEventListener("keydown", onKey); } };
    window.addEventListener("keydown", onKey);

    $("name").focus();

    const showStatus = (type, html) => {
      const el = $("status");
      el.className = type;
      el.innerHTML = html;
      el.style.display = "block";
    };

    const save = () => {
      const name = $("name").value.trim();
      if (!name) { showStatus("error", "Name is required."); $("name").focus(); return; }

      const sourceUrl = $("source-url").textContent?.trim() || "";
      const payload = {
        name,
        company: $("company").value.trim(),
        title: $("title").value.trim(),
        stage: $("stage").value,
        dealValue: Number($("deal-value").value) || null,
        email: $("email").value.trim(),
        phone: $("phone").value.trim(),
        notes: $("notes").value.trim(),
        source: sourceUrl ? labelForUrl(sourceUrl) : "Chrome Extension",
        url: sourceUrl,
        photoUrl: photoUrl || "",
      };

      const btn = $("save");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⟳</span> Saving…';

      chrome.runtime.sendMessage({ type: "SAVE_LEAD", lead: payload }, (result) => {
        if (chrome.runtime.lastError) {
          showStatus("error", chrome.runtime.lastError.message);
          btn.disabled = false;
          btn.innerHTML = "Save to CRM";
          return;
        }
        if (result?.ok) {
          showStatus("success", `✓ ${name} saved to CRM!`);
          btn.innerHTML = "✓ Saved";
          setTimeout(removeWidget, 1400);
        } else {
          const needsSetup = /not connected/i.test(result?.error || "");
          showStatus("error", needsSetup
            ? 'Not connected — <a id="open-settings">open Settings</a> to enter your PIN.'
            : (result?.error || "Something went wrong."));
          $("open-settings")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
          btn.disabled = false;
          btn.innerHTML = "Save to CRM";
        }
      });
    };

    $("save").addEventListener("click", save);
    $("name").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_LEAD_WIDGET") showWidget(msg.lead);
  });
}
