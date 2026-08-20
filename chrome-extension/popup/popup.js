// Eden Labs — popup script
// Opens when the toolbar icon is clicked. Two tabs: save a lead manually
// (no text-selection context involved — that flow lives in content.js's
// in-page card instead), and log today's LinkedIn outreach without leaving
// whatever page you're on.

const $ = (id) => document.getElementById(id);

// ---- Boot: check auth + reflect role ---------------------------------------

async function init() {
  $("outreach-date").value = new Date().toISOString().slice(0, 10);

  const session = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
  if (!session?.connected) {
    $("not-connected").style.display = "flex";
    $("save-lead-btn").disabled = true;
    $("save-outreach-btn").disabled = true;
  } else {
    applySession(session);
  }

  // Pre-fill the source chip from whatever tab the popup was opened on top
  // of — the same "which page is this from" context the in-page card gets
  // automatically, since the popup has no text-selection to inherit it from.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !tab.url.startsWith("chrome://")) {
      $("source-field").style.display = "block";
      $("source-url-display").textContent = tab.url;
      $("source-url-display").title = tab.url;
    }
  } catch {
    // Not fatal — the lead still saves, just without a source URL.
  }

  $("name").focus();
}

function applySession(session) {
  const chip = $("role-chip");
  if (session.role === "client") {
    $("header-sub").textContent = `Scoped to ${session.label || "a client"}`;
    chip.textContent = "Client";
    chip.style.display = "inline-block";
    $("outreach-scope").textContent =
      `Sets today's totals for ${session.label || "this client"}'s LinkedIn outreach — this overwrites, so enter the full day's count, not just what changed.`;
  } else {
    $("header-sub").textContent = "Eden Labs CRM";
    chip.style.display = "none";
  }
}

// ---- Tabs -------------------------------------------------------------------

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.panel).classList.add("active");
    $("status").style.display = "none";
  });
});

// ---- Actions ----------------------------------------------------------------

$("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("connect-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("save-lead-btn").addEventListener("click", saveLead);
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") saveLead(); });
$("save-outreach-btn").addEventListener("click", saveOutreach);

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

  $("save-lead-btn").disabled = true;
  $("save-lead-btn").innerHTML = '<span class="spin">⟳</span> Saving…';

  const result = await chrome.runtime.sendMessage({ type: "SAVE_LEAD", lead });

  if (result.ok) {
    showStatus("success", `✓ ${name} saved to CRM!`);
    $("save-lead-btn").innerHTML = "✓ Saved";
    setTimeout(() => window.close(), 1400);
  } else {
    showStatus("error", result.error || "Something went wrong.");
    $("save-lead-btn").disabled = false;
    $("save-lead-btn").innerHTML = "Save to CRM";
  }
}

async function saveOutreach() {
  const date = $("outreach-date").value;
  if (!date) { showStatus("error", "Pick a date."); return; }

  const entry = {
    date,
    linkedinConnectionsSent:      Number($("oc-sent").value) || 0,
    linkedinConnectionsAccepted:  Number($("oc-accepted").value) || 0,
    linkedinConversationsStarted: Number($("oc-convos").value) || 0,
    linkedinReplied:              Number($("oc-replied").value) || 0,
    linkedinCallsBooked:          Number($("oc-calls").value) || 0,
  };

  $("save-outreach-btn").disabled = true;
  $("save-outreach-btn").innerHTML = '<span class="spin">⟳</span> Saving…';

  const result = await chrome.runtime.sendMessage({ type: "LOG_OUTREACH", entry });

  if (result.ok) {
    showStatus("success", `✓ Outreach saved for ${date}.`);
    $("save-outreach-btn").innerHTML = "Save outreach for this day";
    $("save-outreach-btn").disabled = false;
  } else {
    showStatus("error", result.error || "Something went wrong.");
    $("save-outreach-btn").disabled = false;
    $("save-outreach-btn").innerHTML = "Save outreach for this day";
  }
}

// ---- Helpers ------------------------------------------------------------

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
