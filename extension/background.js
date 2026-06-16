// The actual WebSocket lives in offscreen.js (see offscreen.html), since
// offscreen documents aren't subject to the service worker idle timeout.
// Offscreen documents can only use chrome.runtime, so this script owns
// chrome.storage and chrome.tabs on its behalf.
let activeTabId = null;
let creatingOffscreenPromise = null;

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }
  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Maintain a persistent WebSocket connection to the sync server.",
  });
  await creatingOffscreenPromise;
  creatingOffscreenPromise = null;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source === "offscreen") {
    if (msg.type === "partner_joined") {
      chrome.storage.session.set({ partnerStatus: "connected" });
    } else if (msg.type === "partner_left") {
      chrome.storage.session.set({ partnerStatus: "waiting" });
    } else if (activeTabId !== null) {
      const { source, ...payload } = msg;
      chrome.tabs.sendMessage(activeTabId, payload);
    }
    return;
  }

  if (msg.target === "offscreen") return; // our own relayed message, ignore here

  if (msg.type === "connect") {
    activeTabId = msg.tabId;
    chrome.storage.session.set({ partnerStatus: "waiting", roomId: msg.roomId });
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ target: "offscreen", type: "connect", roomId: msg.roomId }).catch(() => {});
    });
    return;
  }

  if (["play", "pause", "seek", "tick"].includes(msg.type)) {
    chrome.runtime.sendMessage({ target: "offscreen", ...msg }).catch(() => {});
  }
});
