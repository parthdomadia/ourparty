import threading
import pytest
from starlette.testclient import TestClient
from server.main import app, rooms as rooms_state

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_rooms():
    rooms_state.clear()
    yield
    rooms_state.clear()


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
    disconnected = False
    with client.websocket_connect("/room/FULL01") as ws1:
        with client.websocket_connect("/room/FULL01") as ws2:
            with client.websocket_connect("/room/FULL01") as ws3:
                try:
                    ws3.receive_json()
                except Exception:
                    disconnected = True
    assert disconnected, "Expected server to reject the third user"
