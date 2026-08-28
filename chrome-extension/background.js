// Eden Labs CRM — background service worker
// Creates the right-click context menu and, on click, injects the floating
// save-lead card (content.js) directly into the current tab — no new window,
// no navigating away from LinkedIn/wherever the user is.
//
// Classic script, deliberately NOT "type": "module" in the manifest — that
// caused a stale service-worker registration bug once before, so shared
// helpers get duplicated across files here rather than imported.

const API = "https://dashboard.theedenlabs.com";

// ---- Context menu --------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-lead",
    // %s is replaced by Chrome with the selected text
    title: 'Save "%s" to Eden Labs CRM',
    contexts: ["selection"],
  });

  // Right-click ANY profile link — a name in the feed, a connections-list
  // row, a sidebar "People also viewed" card, a search result — and add it
  // to the comment list. Not restricted to being ON a profile page, unlike
  // overlay.js's pinned "+ Add this profile" button, which only knows about
  // the page you're currently viewing.
  chrome.contextMenus.create({
    id: "add-comment-target",
    title: "Add to Eden Labs comment list",
    contexts: ["link"],
    documentUrlPatterns: ["*://*.linkedin.com/*"],
    targetUrlPatterns: ["*://*.linkedin.com/in/*"],
  });

  // Right-click selected post text on LinkedIn to save it to the content
  // library (data.swipeFile) — the extension-capture half of Phase 3's
  // saved-content upgrade, which previously only had a manual add form on
  // the dashboard itself.
  chrome.contextMenus.create({
    id: "save-swipe",
    title: 'Save "%s" to Eden Labs content',
    contexts: ["selection"],
    documentUrlPatterns: ["*://*.linkedin.com/*"],
  });

  // Capture a DM as an inbound enquiry. Restricted to /messaging/ pages so
  // it doesn't clutter the menu everywhere — and because sender detection
  // only has anything to work with inside a thread.
  chrome.contextMenus.create({
    id: "save-inbound",
    title: 'Log "%s" as an inbound enquiry',
    contexts: ["selection"],
    documentUrlPatterns: ["*://*.linkedin.com/messaging/*"],
  });
});

// Chrome's contextMenus API hands the click handler a linkUrl but never the
// link's visible TEXT — so overlay.js listens for the native `contextmenu`
// event itself (fires synchronously right before the menu opens) and ships
// its best guess at the name/photo over here ahead of time. Keyed by tab,
// since multiple LinkedIn tabs can be open at once.
const contextTargets = new Map();
chrome.tabs.onRemoved.addListener((tabId) => contextTargets.delete(tabId));

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "save-lead") {
    const lead = {
      name:    (info.selectionText || "").trim(),
      pageUrl: tab.url || "",
    };

    // Inject the floating-card content script into the current tab — a
    // plain classic script guarded against double-injection at the top of
    // the file, so right-clicking a second name just re-populates the
    // existing card instead of registering duplicate listeners. This
    // replaces the old chrome.windows.create() flow, which used to open a
    // whole new OS window and yank focus off whatever page the user was on.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_LEAD_WIDGET", lead });
    } catch (err) {
      // Fails on pages Chrome doesn't allow script injection into
      // (chrome://, the Web Store, etc.) — nothing useful to do but log it.
      console.error("Eden Labs CRM: couldn't inject into this page.", err);
    }
    return;
  }

  if (info.menuItemId === "add-comment-target") {
    const target = contextTargets.get(tab.id);
    if (!target) {
      chrome.tabs.sendMessage(tab.id, {
        type: "TOAST", error: true,
        text: "Couldn't find a profile there — try right-clicking directly on their name.",
      });
      return;
    }
    // Fail closed rather than saving a nameless row — the same fix the
    // pinned panel's own "+ Add this profile" button already got, applied
    // here too since this is a second path into the same list.
    if (!target.name) {
      chrome.tabs.sendMessage(tab.id, {
        type: "TOAST", error: true,
        text: "Couldn't detect a name there — try right-clicking directly on the text of their name.",
      });
      return;
    }
    extensionAction("addCommentTarget", target)
      .then(() => chrome.tabs.sendMessage(tab.id, { type: "TOAST", text: `✓ Added ${target.name || "profile"} to comment list` }))
      .catch((err) => chrome.tabs.sendMessage(tab.id, { type: "TOAST", error: true, text: err.message }));
    return;
  }

  if (info.menuItemId === "save-inbound") {
    const text = (info.selectionText || "").trim();
    if (!text) return;
    // overlay.js does the sender detection, because it can read the live DOM
    // and the still-live selection; background has neither.
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_INBOUND_WIDGET", seed: { message: text } });
    return;
  }

  if (info.menuItemId === "save-swipe") {
    const text = (info.selectionText || "").trim();
    if (!text) return;
    // overlay.js (always present on linkedin.com) renders the confirm/edit
    // card and does its own author/photo detection from the still-live
    // selection — auto-detected author info is a best guess and deserves a
    // chance to be corrected before it's saved, same reasoning as the
    // lead-save card.
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_SWIPE_WIDGET", swipe: { text, pageUrl: tab.url || "" } });
    return;
  }
});

// ---- Auth: role-aware login ------------------------------------------------
//
// One PIN box, two possible identities. This is what makes "a Chrome profile
// dedicated to one client's LinkedIn login" a real workflow: sign that
// profile's extension in with the CLIENT's own portal PIN (not the owner's),
// and everything logged from it — outreach, saved posts, leads — is scoped
// to that client automatically, without a picker to get wrong.
//
// Tries the owner endpoint first; a 401 there falls back to the client
// endpoint. Whichever succeeds determines { role, clientId }. For a client
// session we also fetch the portal data once, purely to read the client's
// name for display — the token itself only carries clientId.
async function authenticateOwner(pin) {
  const res  = await fetch(`${API}/api/auth-owner`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ pin }),
  });
  const json = await res.json();
  if (!res.ok) return null;
  return { token: json.token, role: "owner", clientId: null, label: "Eden Labs (you)" };
}

async function authenticateClient(pin) {
  const res  = await fetch(`${API}/api/auth-client`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ pin }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "That PIN didn't match.");

  let label = "Client";
  try {
    const portalRes = await fetch(`${API}/api/portal-data`, {
      headers: { Authorization: `Bearer ${json.token}` },
    });
    const portalJson = await portalRes.json();
    label = portalJson?.data?.clients?.[0]?.name || label;
  } catch {
    // Non-fatal — the session still works, it just shows a generic label.
  }
  return { token: json.token, role: "client", clientId: json.clientId, label };
}

async function authenticate(pin) {
  const owner = await authenticateOwner(pin);
  if (owner) return owner;
  return authenticateClient(pin);
}

// ---- Extension action envelope --------------------------------------------
// Every write (save a lead, log outreach, save a swipe post, manage the
// comment list) goes through this one endpoint — see handleExtension in
// api/_dataHandlers.js for the allowlist and the owner/client scoping.
async function extensionAction(action, payload) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) throw new Error("Not connected — open Settings to enter your PIN.");
  const res  = await fetch(`${API}/api/extension`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ---- Message router (popup/settings/content scripts → background) --------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SET_CONTEXT_TARGET") {
    if (sender?.tab?.id != null) contextTargets.set(sender.tab.id, msg.target);
    return; // fire-and-forget, no response needed
  }

  if (msg.type === "AUTH") {
    authenticate(msg.pin)
      .then((session) => {
        chrome.storage.local.set(session);
        sendResponse({ ok: true, role: session.role, label: session.label });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === "SAVE_LEAD") {
    extensionAction("saveLead", msg.lead)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "LOG_OUTREACH") {
    // logOutreachEntry, not the old logOutreach: entries now APPEND with a
    // lead list and script attached, rather than upserting one row per day.
    // Two lists worked on the same day is normal and the old shape couldn't
    // hold it.
    extensionAction("logOutreachEntry", msg.entry)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "LIST_CAMPAIGNS") {
    extensionAction("listCampaigns", {})
      .then((json) => sendResponse({ ok: true, lists: json.lists || [], scripts: json.scripts || [] }))
      .catch(() => sendResponse({ ok: false, lists: [], scripts: [] }));
    return true;
  }

  if (msg.type === "SAVE_INBOUND") {
    extensionAction("saveInbound", msg.enquiry)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "SAVE_SWIPE") {
    extensionAction("saveSwipe", msg.swipe)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "ADD_COMMENT_TARGET") {
    extensionAction("addCommentTarget", msg.target)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "UPDATE_COMMENT_TARGET") {
    extensionAction("updateCommentTarget", { id: msg.id, patch: msg.patch })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "DELETE_COMMENT_TARGET") {
    extensionAction("deleteCommentTarget", { id: msg.id })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_COMMENT_TARGETS") {
    extensionAction("listCommentTargets", {})
      .then((json) => sendResponse({ ok: true, targets: json.targets || [] }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "GET_SESSION") {
    chrome.storage.local.get(["token", "role", "clientId", "label"]).then((s) => {
      sendResponse({ connected: !!s.token, role: s.role || null, clientId: s.clientId || null, label: s.label || null });
    });
    return true;
  }

  if (msg.type === "LOGOUT") {
    chrome.storage.local.remove(["token", "role", "clientId", "label"]);
    sendResponse({ ok: true });
    return true;
  }
});
