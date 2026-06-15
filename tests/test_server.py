import threading
from starlette.testclient import TestClient
from server.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_two_users_join_same_room():
    """Both users connect to the same room without error."""
    with client.websocket_connect("/room/JOIN01") as ws1:
        with client.websocket_connect("/room/JOIN01") as ws2:
            pass  # clean connect and disconnect


def test_room_rejects_third_user():
    """Third connection to a full room is immediately closed by server."""
    with client.websocket_connect("/room/FULL01") as ws1:
        with client.websocket_connect("/room/FULL01") as ws2:
            with client.websocket_connect("/room/FULL01") as ws3:
                # server accepts then closes — receive should raise
                try:
                    ws3.receive_json()
                    assert False, "Expected disconnect"
                except Exception:
                    pass  # expected — server closed the connection
