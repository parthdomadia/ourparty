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
    room["timestamps"][id(websocket)] = 0.0

    try:
        while True:
            data = await websocket.receive_json()
            await _handle_message(room, websocket, data)
    except WebSocketDisconnect:
        room["users"].remove(websocket)
        del room["timestamps"][id(websocket)]
        if not room["users"]:
            del rooms[room_id]


def _partner(room: dict, sender: WebSocket):
    return next((u for u in room["users"] if u is not sender), None)


async def _handle_message(room: dict, sender: WebSocket, data: dict):
    pass  # filled in Tasks 3 and 4
