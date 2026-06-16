from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Any

app = FastAPI()

# rooms[room_id] = {"users": [ws, ...], "timestamps": {id(ws): float}}
rooms: dict[str, dict[str, Any]] = {}


@app.get("/")
async def health():
    return {"status": "ok"}


@app.websocket("/room/{room_id}")
async def room_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    if room_id not in rooms:
        rooms[room_id] = {"users": [], "timestamps": {}}

    room = rooms[room_id]

    if len(room["users"]) >= 2:
        await websocket.close(code=4000, reason="Room full")
        return

    room["users"].append(websocket)

    # If this is the second user joining, notify both that partner is connected
    if len(room["users"]) == 2:
        for user in room["users"]:
            await user.send_json({"type": "partner_joined"})

    try:
        while True:
            data = await websocket.receive_json()
            await _handle_message(room, websocket, data)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if websocket in room["users"]:
            room["users"].remove(websocket)
        # Notify remaining user that partner left
        partner = next((u for u in room["users"] if u is not websocket), None)
        if partner:
            try:
                await partner.send_json({"type": "partner_left"})
            except Exception:
                pass
        if id(websocket) in room["timestamps"]:
            del room["timestamps"][id(websocket)]
        if not room["users"]:
            del rooms[room_id]


def _partner(room: dict, sender: WebSocket):
    return next((u for u in room["users"] if u is not sender), None)


async def _handle_message(room: dict, sender: WebSocket, data: dict):
    msg_type = data.get("type")
    try:
        t = float(data.get("t", 0.0))
    except (TypeError, ValueError):
        return
    partner = _partner(room, sender)

    if msg_type in ("play", "pause", "seek"):
        if partner:
            await partner.send_json({"type": msg_type, "t": t})

    elif msg_type == "tick":
        room["timestamps"][id(sender)] = t
        partner = _partner(room, sender)
        if partner:
            partner_t = room["timestamps"].get(id(partner), t)
            diff = abs(t - partner_t)
            if diff > 2.0:
                ahead_t = max(t, partner_t)
                lagging = sender if t < partner_t else partner
                await lagging.send_json({"type": "seek", "t": ahead_t})
