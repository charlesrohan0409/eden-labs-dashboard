// Eden Labs CRM — settings page script

const $ = (id) => document.getElementById(id);

async function init() {
  const session = await sendMessageWithTimeout({ type: "GET_SESSION" });
  if (session?.connected) {
    showConnected(session);
  } else {
    showSetup();
  }
}

function showConnected(session) {
  $("connected-view").style.display = "block";
  $("setup-view").style.display = "none";
  if (session.role === "client") {
    $("connected-label").textContent = `Connected as ${session.label || "a client"}`;
    $("connected-copy").textContent =
      `Everything you save or log from this Chrome profile — leads, outreach — ` +
      `is scoped to ${session.label || "this client"}, not your own agency data.`;
  } else {
    $("connected-label").textContent = "Connected as Eden Labs (you)";
    $("connected-copy").textContent =
      "You're all set. Right-click any selected name on any webpage to save it as a lead in your Eden Labs CRM.";
  }
}

function showSetup() {
  $("connected-view").style.display = "none";
  $("setup-view").style.display = "block";
  $("pin").focus();
}

function showStatus(type, msg) {
  const el = $("status");
  el.className = type;
  el.textContent = msg;
  el.style.display = "block";
}

$("connect-btn").addEventListener("click", connect);
$("pin").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });

// Wraps sendMessage so a dead/unresponsive service worker fails loudly after
// 8s instead of leaving the button spinning forever with no error at all.
function sendMessageWithTimeout(message, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out — the extension's background script isn't responding. Reload the extension in chrome://extensions and try again.")), ms);
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function connect() {
  const pin = $("pin").value.trim();
  if (!pin) { showStatus("error", "Please enter a PIN."); return; }

  $("connect-btn").disabled = true;
  $("connect-btn").innerHTML = '<span class="spin">⟳</span> Connecting…';
  $("status").style.display = "none";

  try {
    const result = await sendMessageWithTimeout({ type: "AUTH", pin });
    if (result?.ok) {
      showStatus("success", "Connected! You can close this tab.");
      showConnected({ role: result.role, label: result.label });
      return;
    }
    showStatus("error", result?.error || "Connection failed. Check your PIN.");
  } catch (err) {
    showStatus("error", err.message);
  }
  $("connect-btn").disabled = false;
  $("connect-btn").innerHTML = "Connect";
}

$("disconnect-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  showSetup();
});

init();
