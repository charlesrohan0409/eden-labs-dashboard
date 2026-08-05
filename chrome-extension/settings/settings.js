// Eden Labs CRM — settings page script

const $ = (id) => document.getElementById(id);

async function init() {
  const { token } = await chrome.storage.local.get("token");
  if (token) {
    showConnected();
  } else {
    showSetup();
  }
}

function showConnected() {
  $("connected-view").style.display = "block";
  $("setup-view").style.display = "none";
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

async function connect() {
  const pin = $("pin").value.trim();
  if (!pin) { showStatus("error", "Please enter your PIN."); return; }

  $("connect-btn").disabled = true;
  $("connect-btn").innerHTML = '<span class="spin">⟳</span> Connecting…';
  $("status").style.display = "none";

  const result = await chrome.runtime.sendMessage({ type: "AUTH", pin });

  if (result.ok) {
    showStatus("success", "Connected! You can close this tab.");
    showConnected();
  } else {
    showStatus("error", result.error || "Connection failed. Check your PIN.");
    $("connect-btn").disabled = false;
    $("connect-btn").innerHTML = "Connect";
  }
}

$("disconnect-btn").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  showSetup();
});

init();
