// Eden Labs — LinkedIn commenting-list overlay
//
// Unlike content.js (injected on demand, only on a right-click), this file
// is declared directly in the manifest's content_scripts and runs on every
// linkedin.com page load. It renders a small pinned button in the corner
// that expands into a panel for building today's "who to comment on" list —
// stays pinned deliberately, so it survives scrolling a search results page
// while you work through it profile by profile.
//
// Guarded by its OWN injection flag, not content.js's — reusing
// __edenLabsCRMInjected here would set it first and silently break the
// right-click save-lead card, since that flag is what content.js's own
// on-demand injection checks before deciding whether to run.
if (!window.__edenLabsOverlayInjected) {
  window.__edenLabsOverlayInjected = true;

  const HOST_ID = "eden-labs-overlay-host";
  const STORAGE_KEY = "commentListOpen"; // persisted open/closed across page loads on this device

  // Same "biggest headshot on the page wins" signal content.js's lead-save
  // card uses — see its findLinkedInPhoto for the full reasoning. Kept as a
  // separate (lighter) copy here since this file has no selection context to
  // fall back to; it only ever needs the CURRENT profile's own big photo.
  function findOwnPhoto() {
    const isLogo = (img) => /company-logo|school-logo|org-logo/i.test(img.src);
    const isHeadshot = (img) => /profile-displayphoto/i.test(img.src) && !isLogo(img);
    const bigEnough = (img) => img.naturalWidth > 24 && img.naturalHeight > 24;
    const area = (img) => img.naturalWidth * img.naturalHeight;
    const headshots = Array.from(document.querySelectorAll('img[src*="media.licdn.com"]'))
      .filter((img) => bigEnough(img) && isHeadshot(img));
    if (!headshots.length) return "";
    headshots.sort((a, b) => area(b) - area(a));
    return headshots[0].src;
  }

  function currentProfile() {
    const isProfilePage = /^\/in\//.test(location.pathname);
    const nameEl = document.querySelector("h1");
    const headlineEl = document.querySelector(".text-body-medium, [data-generated-suggestion-target]");
    return {
      isProfilePage,
      name: isProfilePage ? (nameEl?.textContent || "").trim() : "",
      headline: isProfilePage ? (headlineEl?.textContent || "").trim() : "",
      profileUrl: isProfilePage ? location.origin + location.pathname.replace(/\/$/, "") : "",
      photoUrl: isProfilePage ? findOwnPhoto() : "",
    };
  }

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
        .list { padding: 6px 8px; }
        .row {
          display: flex; align-items: center; gap: 8px; padding: 7px 8px;
          border-radius: 8px; font-size: 12px; color: #1c1917;
        }
        .row:hover { background: #fafaf9; }
        .row img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #e7e5e4; }
        .row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row a { color: #14532d; text-decoration: none; font-size: 11px; }
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
        list.innerHTML = `<div class="empty">Nothing on the list yet — visit a profile and add it.</div>`;
        return;
      }
      list.innerHTML = targets.slice().reverse().map((t) => `
        <div class="row">
          ${t.photoUrl ? `<img src="${t.photoUrl}" alt="" />` : `<img alt="" />`}
          <span class="name" title="${t.name || t.profileUrl}">${t.name || t.profileUrl}</span>
          <a href="${t.profileUrl}" target="_blank" rel="noopener">Open</a>
        </div>
      `).join("");
    }

    function refreshList() {
      chrome.runtime.sendMessage({ type: "GET_COMMENT_TARGETS" }, (result) => {
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
        chrome.runtime.sendMessage({ type: "ADD_COMMENT_TARGET", target: profile }, (result) => {
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

    chrome.runtime.sendMessage({ type: "GET_SESSION" }, (session) => {
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
