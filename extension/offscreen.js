// Owns the WebSocket connection. Lives in an offscreen document instead of
// the background service worker because MV3 service workers are killed
// after ~30s idle, which would otherwise drop the connection. Offscreen
// documents can only use chrome.runtime (not chrome.storage or chrome.tabs),
// so storage/tab updates are relayed through background.js.
const SERVER_URL = "wss://ourparty-server.onrender.com";

let socket = null;

function connectToRoom(roomId) {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket(`${SERVER_URL}/room/${roomId}`);

  socket.onopen = () => {
    console.log("[OurParty] connected to room:", roomId);
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log("[OurParty] received:", msg.type, msg);
    chrome.runtime.sendMessage({ source: "offscreen", ...msg });
  };

  socket.onclose = () => {
    console.log("[OurParty] disconnected");
    socket = null;
  };

  socket.onerror = (err) => {
    console.error("[OurParty] WebSocket error", err);
  };
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;

  if (msg.type === "connect") {
    connectToRoom(msg.roomId);
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
});
