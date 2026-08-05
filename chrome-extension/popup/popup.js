// Eden Labs CRM — popup script
// Reads the pending lead context (set by background.js when the user right-
// clicked), renders it into the form, and sends the final contact to the
// background service worker which POSTs it to /api/crm-lead.

const $ = (id) => document.getElementById(id);

// ---- Boot: check auth + pre-fill ------------------------------------------

async function init() {
  // Is the extension connected (has a stored token)?
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    $("not-connected").style.display = "flex";
    $("save-btn").disabled = true;
  }

  // Read pending lead stashed by background.js (context menu flow).
  // If opened via toolbar icon there's no pending lead — form stays blank.
  const { pendingLead } = await chrome.storage.session.get("pendingLead");
  if (pendingLead) {
    if (pendingLead.name)    $("name").value = pendingLead.name;
    if (pendingLead.pageUrl) fillSourceUrl(pendingLead.pageUrl);
    // Clear so the next right-click doesn't re-use stale data
    chrome.storage.session.remove("pendingLead");
  }

  $("name").focus();
  $("name").select();
}

function fillSourceUrl(url) {
  if (!url || url === "about:blank") return;
  $("source-field").style.display = "block";
  $("source-url-display").textContent = url;
  $("source-url-display").title = url;
}

// ---- Actions --------------------------------------------------------------

$("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("connect-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("save-btn").addEventListener("click", saveLead);

// Also submit on Enter inside the name field
$("name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveLead();
});

async function saveLead() {
  const name = $("name").value.trim();
  if (!name) {
    showStatus("error", "Name is required.");
    $("name").focus();
    return;
  }

  const sourceUrl = $("source-url-display").textContent?.trim() || "";

  const lead = {
    name,
    company:    $("company").value.trim()    || "",
    title:      $("title").value.trim()      || "",
    stage:      $("stage").value,
    dealValue:  Number($("deal-value").value) || null,
    email:      $("email").value.trim()      || "",
    phone:      $("phone").value.trim()      || "",
    notes:      $("notes").value.trim()      || "",
    source:     sourceUrl ? labelForUrl(sourceUrl) : "Chrome Extension",
    url:        sourceUrl,
  };

  $("save-btn").disabled = true;
  $("save-btn").innerHTML = '<span class="spin">⟳</span> Saving…';

  const result = await chrome.runtime.sendMessage({ type: "SAVE_LEAD", lead });

  if (result.ok) {
    showStatus("success", `✓ ${name} saved to CRM!`);
    $("save-btn").innerHTML = "✓ Saved";
    setTimeout(() => window.close(), 1400);
  } else {
    showStatus("error", result.error || "Something went wrong.");
    $("save-btn").disabled = false;
    $("save-btn").innerHTML = "Save to CRM";
  }
}

// ---- Helpers --------------------------------------------------------------

function showStatus(type, msg) {
  const el = $("status");
  el.className = type;
  el.textContent = msg;
  el.style.display = "block";
}

function labelForUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("twitter") || host.includes("x.com")) return "X / Twitter";
    if (host.includes("google"))  return "Google";
    if (host.includes("apollo"))  return "Apollo";
    return host;
  } catch {
    return "Chrome Extension";
  }
}

// ---- Init -----------------------------------------------------------------
init();
