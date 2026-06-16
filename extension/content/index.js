// Polls until the <video> element appears, then calls callback.
// Streaming sites load the player dynamically so it may not exist at page load.
function waitForVideo(callback) {
  const video = getVideoElement();
  if (video) {
    callback(video);
    return;
  }
  const observer = new MutationObserver(() => {
    const v = getVideoElement();
    if (v) {
      observer.disconnect();
      callback(v);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

let isRemote = false;

// True once the extension is reloaded/updated while this page is still open;
// chrome.runtime calls throw "Extension context invalidated" after that point.
function isContextValid() {
  return !!(chrome.runtime && chrome.runtime.id);
}

function attachSync(video) {
  const send = (type) => {
    if (isRemote) return; // skip — this event was triggered by a remote command
    if (!isContextValid()) return;
    try {
      chrome.runtime.sendMessage({ type, t: video.currentTime });
    } catch (e) {
      // Extension was reloaded; this tab needs a refresh to reconnect.
    }
  };

  video.addEventListener("play",   () => send("play"));
  video.addEventListener("pause",  () => send("pause"));
  video.addEventListener("seeked", () => send("seek"));

  // Heartbeat for drift correction
  const heartbeat = setInterval(() => {
    if (!isContextValid()) {
      clearInterval(heartbeat);
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "tick", t: video.currentTime });
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 5000);

  // Handle incoming commands from background.js
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "play") {
      isRemote = true;
      video.play().finally(() => { isRemote = false; });
    } else if (msg.type === "pause") {
      isRemote = true;
      video.pause();
      isRemote = false;
    } else if (msg.type === "seek") {
      isRemote = true;
      video.currentTime = msg.t;
      // Give the seeked event time to fire before clearing the flag
      setTimeout(() => { isRemote = false; }, 200);
    }
  });
}

waitForVideo(attachSync);
