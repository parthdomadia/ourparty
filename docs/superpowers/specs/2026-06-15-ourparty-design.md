# OurParty — Design Spec
_Date: 2026-06-15_

## Overview

A private browser extension for two users to watch streaming video in sync. Modelled after Teleparty but self-built, self-hosted, and scoped to exactly two people.

---

## Goals

- Keep two browsers' video playback in sync across Netflix, Amazon Prime Video, Disney+/Hotstar, and YouTube
- Either user can play, pause, or seek — changes propagate to the other immediately
- Auto-correct drift caused by buffering (if timestamps diverge by more than 2 seconds, the lagging user is auto-seeked forward)
- No chat in v1 — potential future addition

## Non-Goals

- Audio/video calling (use WhatsApp, FaceTime, etc. separately)
- Chat (deferred to v2)
- More than 2 concurrent users
- Persistent room history or watch logs

---

## System Architecture

```
┌─────────────────────────────┐                        ┌─────────────────────────────┐
│       YOUR BROWSER          │                        │     PARTNER'S BROWSER       │
│                             │                        │                             │
│  ┌─────────────────────┐    │                        │    ┌─────────────────────┐  │
│  │   popup.html/js     │    │                        │    │   popup.html/js     │  │
│  │  Create / Join Room │    │                        │    │  Create / Join Room │  │
│  └────────┬────────────┘    │                        │    └────────┬────────────┘  │
│           │                 │                        │             │               │
│  ┌────────▼────────────┐    │   WebSocket (JSON)     │    ┌────────▼────────────┐  │
│  │   background.js     │◄───┼────────────────────────┼───►│   background.js     │  │
│  │  (service worker)   │    │   events + tick msgs   │    │  (service worker)   │  │
│  └────────┬────────────┘    │                        │    └────────┬────────────┘  │
│           │ chrome.tabs     │                        │             │ chrome.tabs   │
│           │ .sendMessage    │                        │             │ .sendMessage  │
│  ┌────────▼────────────┐    │                        │    ┌────────▼────────────┐  │
│  │  content/index.js   │    │                        │    │  content/index.js   │  │
│  │  + adapters.js      │    │                        │    │  + adapters.js      │  │
│  └────────┬────────────┘    │                        │    └────────┬────────────┘  │
│           │                 │                        │             │               │
│  ┌────────▼────────────┐    │                        │    ┌────────▼────────────┐  │
│  │   <video> element   │    │                        │    │   <video> element   │  │
│  │  Netflix / Prime /  │    │                        │    │  Netflix / Prime /  │  │
│  │  Disney+ / YouTube  │    │                        │    │  Disney+ / YouTube  │  │
│  └─────────────────────┘    │                        │    └─────────────────────┘  │
└─────────────────────────────┘                        └─────────────────────────────┘
                    │                                               │
                    └──────────────────┬────────────────────────────┘
                                       │ WebSocket
                              ┌────────▼────────────┐
                              │   PYTHON SERVER     │
                              │   FastAPI (Render)  │
                              │                     │
                              │  • Room manager     │
                              │  • Event relay      │
                              │  • Drift detector   │
                              └─────────────────────┘
```

---

## Component Breakdown

### 1. Chrome Extension (JavaScript, Manifest V3)

**File structure:**
```
extension/
  manifest.json          — permissions, content script URLs, service worker
  background.js          — owns WebSocket connection, routes messages
  popup.html             — create/join room UI
  popup.js               — popup logic
  content/
    index.js             — injected into streaming page, video event hooks
    adapters.js          — per-platform video element finders
  icons/
    16.png, 48.png, 128.png
```

**Responsibilities:**

| File | Role |
|---|---|
| `manifest.json` | Declares `tabs`, `storage`, `scripting` permissions; injects content script on netflix.com, primevideo.com, disneyplus.com, youtube.com |
| `background.js` | Holds the single WebSocket to the server; relays messages between content script and server |
| `popup.html/js` | "Create Room" generates a 6-char alphanumeric code; "Join Room" accepts partner's code; both instruct background.js to connect |
| `content/index.js` | Finds `<video>` element, attaches `play`/`pause`/`seeked` listeners, sends tick every 5s, applies remote commands with echo suppression |
| `content/adapters.js` | Per-platform CSS selectors to locate the native `<video>` element |

**Platform adapter approach:**

All four platforms expose a native `<video>` HTML element. The adapter is just a selector:

```
Netflix   → document.querySelector('video')
Prime     → document.querySelector('video')
Disney+   → document.querySelector('video')
YouTube   → document.querySelector('video.html5-main-video')
```

Core sync logic is identical across all platforms — only the selector differs.

---

### 2. Python Server (FastAPI + websockets, Render free tier)

**Endpoints:**
```
GET /               — health check; extension pings this on popup open to wake Render
WS  /room/{room_id} — join or create a room
```

**In-memory state (no database):**
```python
rooms = {
    "ABC123": {
        "users": [ws1, ws2],
        "timestamps": {
            id(ws1): 143.1,
            id(ws2): 141.0
        }
    }
}
```

Rooms are ephemeral — lost on server restart. Users create a new room each session (takes seconds).

---

## Message Protocol

All messages are JSON over WebSocket.

**Client → Server:**

| Message | Meaning |
|---|---|
| `{"type": "play",  "t": 142.5}` | User pressed play at t seconds |
| `{"type": "pause", "t": 142.5}` | User paused at t seconds |
| `{"type": "seek",  "t": 310.0}` | User seeked to t seconds |
| `{"type": "tick",  "t": 143.1}` | Heartbeat every 5s — used for drift detection |

**Server → Client:**

| Message | Meaning |
|---|---|
| `{"type": "play" / "pause" / "seek", "t": ...}` | Relay of partner's event |
| `{"type": "seek", "t": 145.2}` | Drift correction — auto-seek to this position |

---

## Data Flow

### Phase 1 — Session Setup

```
YOU                             SERVER                          PARTNER
 │                                │                                │
 │── click "Create Room" ────────►│                                │
 │                                │── room "ABC123" created        │
 │◄── room code: ABC123 ──────────│                                │
 │                                │                                │
 │  [share code via WhatsApp]     │                                │
 │                                │                                │
 │                                │◄── "Join ABC123" ─────────────│
 │                                │── both users connected         │
 │◄── "partner joined" ───────────│────── "you joined" ──────────►│
 │                                │                                │
 │            ✓ Room ready — both extensions live                  │
```

### Phase 2 — Play/Pause/Seek Event

```
YOU                          BACKGROUND.JS        SERVER         PARTNER'S CONTENT SCRIPT
 │                                │                  │                    │
 │── presses ▶ ──────────────────►│                  │                    │
 │   (native video 'play' event)  │                  │                    │
 │                                │── send ─────────►│                    │
 │                                │  {"type":"play", │                    │
 │                                │   "t": 142.5}    │                    │
 │                                │                  │── relay ──────────►│
 │                                │                  │  {"type":"play",   │
 │                                │                  │   "t": 142.5}      │
 │                                │                  │              isRemote = true
 │                                │                  │              video.play()
 │                                │                  │              isRemote = false
 │                                │                  │                    │
 │         ✓ Partner's video plays at same position                       │
```

**Echo suppression — why `isRemote` matters:**

```
Without isRemote flag:
  You play → sends event → partner applies play → partner's listener fires
  → sends event back → you apply play → your listener fires → loops forever ♻️

With isRemote = true:
  You play → sends event → partner sets isRemote=true → applies play
  → listener fires but sees isRemote=true → skips sending → resets flag ✓
```

### Phase 3 — Drift Correction (every 5 seconds, automatic)

```
YOUR EXTENSION               SERVER                    PARTNER'S EXTENSION
      │                         │                              │
      │── tick {t: 143.1} ─────►│                              │
      │                         │◄───────── tick {t: 141.0} ───│
      │                         │                              │
      │                         │  diff = |143.1 - 141.0|      │
      │                         │       = 2.1s  ⚠️ > 2.0s     │
      │                         │                              │
      │                         │── seek {t: 143.1} ──────────►│
      │                         │   (seek lagging user to      │
      │                         │    the ahead user's time)    │
      │                         │                              │
      │              ✓ Both back in sync                       │
```

**Drift correction rules:**
- Threshold: 2.0 seconds
- Target: `max(t1, t2)` — always seek the lagging user forward, never pull the ahead user back
- Only the lagging user receives a seek command

---

## Render Wakeup Strategy

Render's free tier spins the server down after 15 minutes of inactivity. Since usage is ~once every 3 weeks, the server will always be cold on arrival.

**Solution:** When the popup opens, extension immediately fires `GET /` to wake the server. This gives ~40 seconds of warm-up while the users are navigating to the show and sharing the room code — by the time they press play, the server is live.

---

## Hosting

| Property | Value |
|---|---|
| Platform | Render (free tier) |
| Runtime | Python 3.11+ |
| Cold start | ~30–50 seconds |
| Usage frequency | ~once every 3 weeks |
| Wakeup trigger | Extension popup → `GET /` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Browser extension | JavaScript (Manifest V3) |
| Sync server | Python 3.11+, FastAPI, `websockets` |
| Hosting | Render (free tier) |
| Platforms supported | Netflix, Prime Video, Disney+/Hotstar, YouTube |

---

## Future Improvements (not in scope for v1)

- Chat panel alongside video
- User avatars / display names
- Emoji reactions
- Firefox support
