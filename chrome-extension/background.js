// Eden Labs CRM — background service worker
// Creates the right-click context menu and, on click, injects the floating
// save-lead card (content.js) directly into the current tab — no new window,
// no navigating away from LinkedIn/wherever the user is.

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

// ---- Auth helper (called by popup + settings) ----------------------------

// Exchange a PIN for a 30-day session token. Returns { token } or throws.
// (Not exported — nothing outside this file imports it; every other script
// talks to background.js exclusively through chrome.runtime.sendMessage.)
async function authenticate(pin) {
  const res  = await fetch(`${API}/api/auth-owner`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ pin }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Authentication failed");
  return json.token;
}

// ---- Message router (popup → background) ---------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "AUTH") {
    authenticate(msg.pin)
      .then((token) => {
        chrome.storage.local.set({ token });
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === "SAVE_LEAD") {
    chrome.storage.local.get("token", async ({ token }) => {
      if (!token) { sendResponse({ ok: false, error: "Not connected — open Settings to enter your PIN." }); return; }
      try {
        const res  = await fetch(`${API}/api/crm-lead`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify(msg.lead),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Save failed");
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (msg.type === "LOGOUT") {
    chrome.storage.local.remove("token");
    sendResponse({ ok: true });
    return true;
  }
});
