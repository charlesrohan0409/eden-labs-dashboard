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

let SESSION = { role: null, clientId: null, label: null };

function applySession(session) {
  SESSION = session || SESSION;
  const chip = $("role-chip");
  chip.style.display = "inline-block";
  if (session.role === "client") {
    const who = session.label || "a client";
    $("header-sub").textContent = `Everything saves to ${who}`;
    chip.textContent = who;
    chip.classList.add("client");
    $("outreach-scope").textContent =
      `Each save adds a new entry for ${who} — log the same day twice if you worked two lists.`;
  } else {
    $("header-sub").textContent = "Everything saves to Eden Labs";
    chip.textContent = "Eden Labs";
    chip.classList.remove("client");
  }
  loadCampaigns();
}

// ---- Lead lists + scripts for the outreach pickers --------------------------
// Fetched per session, so a client profile only ever sees that client's
// campaigns. Failing quietly is correct here: the entry still saves without
// a list, it just can't be diagnosed later.
function loadCampaigns() {
  chrome.runtime.sendMessage({ type: "LIST_CAMPAIGNS" }, (res) => {
    if (!res?.ok) return;
    const fill = (el, rows, blank) => {
      el.innerHTML = "";
      const none = document.createElement("option");
      none.value = ""; none.textContent = blank;
      el.appendChild(none);
      (rows || []).forEach((r) => {
        const o = document.createElement("option");
        o.value = r.id; o.textContent = r.name;
        el.appendChild(o);
      });
      // One list means no decision to make — pick it.
      if ((rows || []).length === 1) el.value = rows[0].id;
    };
    fill($("oc-list"), res.lists, "Unassigned");
    fill($("oc-script"), res.scripts, "No script");
  });
}

// ---- Reply names ------------------------------------------------------------
// The boxes appear only when a reply count is entered, and exactly that many
// of them. Capturing names is worth it from the reply stage down; capturing
// everyone contacted is both unreadable and expensive to store.
function syncRepliedNames() {
  const n = Number($("oc-replied").value) || 0;
  const field = $("replied-names-field");
  const box = $("replied-names");
  if (!n) { field.style.display = "none"; box.innerHTML = ""; return; }
  field.style.display = "";
  $("replied-names-label").textContent = `Who replied? (${n})`;
  const existing = [...box.querySelectorAll("input")].map((i) => i.value);
  box.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = i === 0 ? "Name  ·  or  Name | Company" : "Name";
    inp.value = existing[i] || "";
    inp.style.marginBottom = "6px";
    box.appendChild(inp);
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
$("oc-replied").addEventListener("input", syncRepliedNames);

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
    listId:   $("oc-list").value || null,
    scriptId: $("oc-script").value || null,
    notes:    $("oc-notes").value.trim(),
    linkedinConnectionsSent:      Number($("oc-sent").value) || 0,
    linkedinConnectionsAccepted:  Number($("oc-accepted").value) || 0,
    linkedinConversationsStarted: Number($("oc-convos").value) || 0,
    linkedinReplied:              Number($("oc-replied").value) || 0,
    linkedinCallsBooked:          Number($("oc-calls").value) || 0,
    linkedinDealsClosed:          Number($("oc-closed").value) || 0,
    repliedNames: [...document.querySelectorAll("#replied-names input")]
      .map((i) => i.value.trim())
      .filter(Boolean),
  };

  const anything = ["linkedinConnectionsSent", "linkedinConnectionsAccepted",
    "linkedinConversationsStarted", "linkedinReplied", "linkedinCallsBooked",
    "linkedinDealsClosed"].some((k) => entry[k] > 0);
  if (!anything) { showStatus("error", "Enter at least one number."); return; }

  const btn = $("save-outreach-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⟳</span> Saving…';

  const result = await chrome.runtime.sendMessage({ type: "LOG_OUTREACH", entry });

  btn.disabled = false;
  btn.innerHTML = "Log entry";

  if (result.ok) {
    const who = SESSION.role === "client" ? (SESSION.label || "this client") : "Eden Labs";
    showStatus("success", `✓ Logged for ${who}.`);
    // Clear the counts so a second list on the same day starts from zero
    // rather than silently re-submitting the first list's numbers.
    ["oc-sent", "oc-accepted", "oc-convos", "oc-replied", "oc-calls", "oc-closed", "oc-notes"]
      .forEach((id) => { $(id).value = ""; });
    syncRepliedNames();
  } else {
    showStatus("error", result.error || "Something went wrong.");
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
