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
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-lead" || !tab?.id) return;

  const lead = {
    name:    (info.selectionText || "").trim(),
    pageUrl: tab.url || "",
  };

  // Inject the floating-card content script into the current tab — a plain
  // classic script guarded against double-injection at the top of the file,
  // so right-clicking a second name just re-populates the existing card
  // instead of registering duplicate listeners. This replaces the old
  // chrome.windows.create() flow, which used to open a whole new OS window
  // and yank focus off whatever page (LinkedIn, etc.) the user was on.
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_LEAD_WIDGET", lead });
  } catch (err) {
    // Fails on pages Chrome doesn't allow script injection into (chrome://,
    // the Web Store, etc.) — nothing useful to do but log it.
    console.error("Eden Labs CRM: couldn't inject into this page.", err);
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
    extensionAction("logOutreach", msg.entry)
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
