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
  // Fire-and-forget — just gets Render's free tier to spin up
  fetch(SERVER_HTTP + "/", { method: "GET" }).catch(() => {});
}

async function connectRoom(roomId) {
  setStatus("Connecting...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ type: "connect", roomId, tabId: tab.id });
  setStatus(`Room: ${roomId}`);
}

document.getElementById("btn-create").addEventListener("click", async () => {
  wakeServer();
  const code = randomCode();
  document.getElementById("input-code").value = code;
  showView("view-join");
  setStatus(`Share this code: ${code}`);
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
