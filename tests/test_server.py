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


def test_play_relayed_to_partner():
    """play event from ws1 is received by ws2."""
    received = []

    def listen(ws):
        received.append(ws.receive_json())

    with client.websocket_connect("/room/RELAY1") as ws1:
        with client.websocket_connect("/room/RELAY1") as ws2:
            t = threading.Thread(target=listen, args=(ws2,))
            t.start()
            ws1.send_json({"type": "play", "t": 100.0})
            t.join(timeout=3)

    assert received == [{"type": "play", "t": 100.0}]


def test_pause_relayed_to_partner():
    """pause event from ws2 is received by ws1."""
    received = []

    def listen(ws):
        received.append(ws.receive_json())

    with client.websocket_connect("/room/RELAY2") as ws1:
        with client.websocket_connect("/room/RELAY2") as ws2:
            t = threading.Thread(target=listen, args=(ws1,))
            t.start()
            ws2.send_json({"type": "pause", "t": 200.5})
            t.join(timeout=3)

    assert received == [{"type": "pause", "t": 200.5}]


def test_seek_relayed_to_partner():
    """seek event from ws1 is received by ws2."""
    received = []

    def listen(ws):
        received.append(ws.receive_json())

    with client.websocket_connect("/room/RELAY3") as ws1:
        with client.websocket_connect("/room/RELAY3") as ws2:
            t = threading.Thread(target=listen, args=(ws2,))
            t.start()
            ws1.send_json({"type": "seek", "t": 310.0})
            t.join(timeout=3)

    assert received == [{"type": "seek", "t": 310.0}]


def test_sender_does_not_receive_own_event():
    """Events are only relayed to the partner, never echoed back to sender."""
    received_by_sender = []
    received_by_partner = []

    def listen_sender(ws):
        try:
            received_by_sender.append(ws.receive_json())
        except Exception:
            pass

    def listen_partner(ws):
        try:
            received_by_partner.append(ws.receive_json())
        except Exception:
            pass

    with client.websocket_connect("/room/ECHO01") as ws1:
        with client.websocket_connect("/room/ECHO01") as ws2:
            t_partner = threading.Thread(target=listen_partner, args=(ws2,))
            t_sender  = threading.Thread(target=listen_sender,  args=(ws1,))
            t_partner.start()
            t_sender.start()
            ws1.send_json({"type": "play", "t": 50.0})
            t_partner.join(timeout=3)
            t_sender.join(timeout=0.5)

    assert received_by_partner == [{"type": "play", "t": 50.0}], \
        "Partner did not receive the event — relay is broken"
    assert received_by_sender == [], \
        "Sender received its own event — echo suppression is broken"


def test_drift_correction_sent_to_lagging_user():
    """When tick timestamps differ by >2s, the lagging user receives a seek."""
    received_by_ws2 = []

    def listen(ws):
        received_by_ws2.append(ws.receive_json())

    with client.websocket_connect("/room/DRIFT1") as ws1:
        with client.websocket_connect("/room/DRIFT1") as ws2:
            t = threading.Thread(target=listen, args=(ws2,))
            t.start()
            ws1.send_json({"type": "tick", "t": 150.0})
            ws2.send_json({"type": "tick", "t": 147.0})  # 3s behind
            t.join(timeout=3)

    assert received_by_ws2 == [{"type": "seek", "t": 150.0}]


def test_no_drift_correction_within_threshold():
    """When tick timestamps differ by <2s, no seek is sent."""
    received = []

    def listen(ws):
        try:
            received.append(ws.receive_json())
        except Exception:
            pass

    with client.websocket_connect("/room/NODRIFT") as ws1:
        with client.websocket_connect("/room/NODRIFT") as ws2:
            t = threading.Thread(target=listen, args=(ws2,))
            t.start()
            ws1.send_json({"type": "tick", "t": 150.0})
            ws2.send_json({"type": "tick", "t": 149.0})  # 1s — within threshold
            t.join(timeout=2)

    assert received == []


def test_drift_correction_targets_max_timestamp():
    """Seek target is the ahead user's timestamp, not an average."""
    received_by_ws1 = []

    def listen(ws):
        received_by_ws1.append(ws.receive_json())

    with client.websocket_connect("/room/DRIFT2") as ws1:
        with client.websocket_connect("/room/DRIFT2") as ws2:
            t = threading.Thread(target=listen, args=(ws1,))
            t.start()
            ws1.send_json({"type": "tick", "t": 100.0})  # ws1 is behind
            ws2.send_json({"type": "tick", "t": 105.0})  # ws2 is ahead
            t.join(timeout=3)

    assert received_by_ws1 == [{"type": "seek", "t": 105.0}]
