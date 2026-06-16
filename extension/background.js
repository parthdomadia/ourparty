// Replaced with your Render URL in Task 9
const SERVER_URL = "wss://ourparty-server.onrender.com";

let socket = null;
let activeTabId = null;

function connectToRoom(roomId, tabId) {
  activeTabId = tabId;

  if (socket) {
    socket.close();
  }

  chrome.storage.session.set({ partnerStatus: "waiting", roomId });

  socket = new WebSocket(`${SERVER_URL}/room/${roomId}`);

  socket.onopen = () => {
    console.log("[OurParty] connected to room:", roomId);
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "partner_joined") {
      chrome.storage.session.set({ partnerStatus: "connected" });
      return;
    }
    if (msg.type === "partner_left") {
      chrome.storage.session.set({ partnerStatus: "waiting" });
      return;
    }

    if (activeTabId !== null) {
      chrome.tabs.sendMessage(activeTabId, msg);
    }
  };

  socket.onclose = () => {
    console.log("[OurParty] disconnected");
    socket = null;
  };

  socket.onerror = (err) => {
    console.error("[OurParty] WebSocket error", err);
  };
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "connect") {
    connectToRoom(msg.roomId, sender.tab?.id ?? activeTabId);
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
});
