// Eden Labs CRM — background service worker
// Creates the right-click context menu and passes the selected text + page
// info to the popup window when the user invokes "Save to Eden Labs CRM".

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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-lead") return;

  // Stash the context for the popup to read immediately on open.
  chrome.storage.session.set({
    pendingLead: {
      name:      (info.selectionText || "").trim(),
      pageUrl:   tab?.url   || "",
      pageTitle: tab?.title || "",
    },
  });

  // Open popup as a standalone window so it doesn't close when focus leaves
  // the original page.
  chrome.windows.create({
    url:     chrome.runtime.getURL("popup/popup.html"),
    type:    "popup",
    width:   440,
    height:  600,
    focused: true,
  });
});

// ---- Auth helper (called by popup + settings) ----------------------------

// Exchange a PIN for a 30-day session token. Returns { token } or throws.
export async function authenticate(pin) {
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
