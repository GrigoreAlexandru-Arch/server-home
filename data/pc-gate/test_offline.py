"""Offline fast-fail tests for pc-access. Run inside the container: python /app/test_offline.py"""
import sys

sys.path.insert(0, "/app")
import server

# Stub real SSH execution so tests never touch the network/PC.
server._run = lambda cmd: "exit=0\nok\n"
server._SSH_BASE = ["echo"]


def test_offline_returns_offline_msg():
    server._pc_online = lambda timeout=2.0: False
    r = server.execute("whoami")
    assert r.startswith("error: pc.home is OFFLINE"), r


def test_online_passes_through():
    server._pc_online = lambda timeout=2.0: True
    r = server.execute("whoami")
    assert r == "exit=0\nok\n", r


def test_offline_shall_not_run_anything():
    called = {"n": 0}
    orig = server._run
    server._run = lambda cmd: called.update(n=called["n"] + 1) or "ran"
    server._pc_online = lambda timeout=2.0: False
    server.execute("whoami")
    server._run = orig
    assert called["n"] == 0, "offline path must not invoke SSH"


def test_pc_online_probes_port_22():
    def fake_conn(target, timeout):
        raise OSError("closed")
    server._create_connection = fake_conn
    assert server._pc_online() is False
    server._create_connection = _real_or_dummy()


def _real_or_dummy():
    import socket
    return socket.create_connection


if __name__ == "__main__":
    test_offline_returns_offline_msg()
    test_online_passes_through()
    test_offline_shall_not_run_anything()
    test_pc_online_probes_port_22()
    print("ALL TESTS PASSED")