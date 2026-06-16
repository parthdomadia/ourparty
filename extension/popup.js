// Replaced with your Render URL in Task 9
const SERVER_HTTP = "https://ourparty-server.onrender.com";

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function showView(viewId) {
  ["view-main", "view-join"].forEach((id) => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(viewId).classList.remove("hidden");
}

function wakeServer() {
  fetch(SERVER_HTTP + "/", { method: "GET" }).catch(() => {});
}

async function connectRoom(roomId) {
  setStatus("Connecting...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ type: "connect", roomId, tabId: tab.id });
  setStatus("Waiting for partner...");
}

// Update status when partner connection state changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || !changes.partnerStatus) return;
  const status = changes.partnerStatus.newValue;
  if (status === "connected") {
    setStatus("Partner connected ✓");
  } else if (status === "waiting") {
    setStatus("Waiting for partner...");
  }
});

// On popup open — restore state if already in a room
chrome.storage.session.get(["partnerStatus", "roomId"], (result) => {
  if (result.roomId) {
    showView("view-join");
    document.getElementById("input-code").value = result.roomId;
    if (result.partnerStatus === "connected") {
      setStatus("Partner connected ✓");
    } else {
      setStatus("Waiting for partner...");
    }
  }
});

document.getElementById("btn-create").addEventListener("click", async () => {
  wakeServer();
  const code = randomCode();
  document.getElementById("input-code").value = code;
  showView("view-join");
  await connectRoom(code);
});

document.getElementById("btn-join").addEventListener("click", () => {
  wakeServer();
  showView("view-join");
  setStatus("Enter partner's code and press Join");
});

document.getElementById("btn-join-confirm").addEventListener("click", async () => {
  const code = document.getElementById("input-code").value.trim().toUpperCase();
  if (code.length !== 6) {
    setStatus("Code must be 6 characters");
    return;
  }
  await connectRoom(code);
});
