// Returns the <video> element for the current streaming platform, or null.
function getVideoElement() {
  const host = location.hostname;

  if (host.includes("netflix.com")) {
    return document.querySelector("video");
  }
  if (host.includes("primevideo.com")) {
    return document.querySelector("video");
  }
  if (host.includes("disneyplus.com") || host.includes("hotstar.com")) {
    return document.querySelector("video");
  }
  if (host.includes("youtube.com")) {
    return document.querySelector("video.html5-main-video");
  }
  return null;
}
