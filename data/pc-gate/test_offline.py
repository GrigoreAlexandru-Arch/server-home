"""Offline fast-fail tests for pc-access. Run inside the container: python /app/test_offline.py"""
import sys

sys.path.insert(0, "/app")
import server

# Stub real SSH execution so tests never touch the network/PC.
server._run = lambda cmd: "exit=0\nok\n"
server._SSH_BASE = ["echo"]

# Hold the real probe before any test stubs it, so the probe test below can
# exercise the actual `_pc_online()` under test (not a leftover stub).
_REAL_PC_ONLINE = server._pc_online
_REAL_CREATE_CONNECTION = server._create_connection


def _stub_pc_online(result):
    server._pc_online = lambda timeout=2.0: result


def test_offline_returns_offline_msg():
    _stub_pc_online(False)
    r = server.execute("whoami")
    assert r.startswith("error: pc.home is OFFLINE"), r


def test_online_passes_through():
    _stub_pc_online(True)
    r = server.execute("whoami")
    assert r == "exit=0\nok\n", r


def test_offline_shall_not_run_anything():
    called = {"n": 0}
    orig = server._run
    server._run = lambda cmd: called.update(n=called["n"] + 1) or "ran"
    _stub_pc_online(False)
    server.execute("whoami")
    server._run = orig
    assert called["n"] == 0, "offline path must not invoke SSH"


def test_pc_online_probes_port_22():
    # Restore the real probe under test, then inject a connection factory so
    # the OSError -> False branch genuinely runs.
    server._pc_online = _REAL_PC_ONLINE
    calls = {"n": 0}

    def fake_conn(target, timeout):
        calls["n"] += 1
        raise OSError("closed")

    server._create_connection = fake_conn
    assert server._pc_online() is False
    server._create_connection = _REAL_CREATE_CONNECTION
    assert calls["n"] == 1, "offline probe must actually attempt the connection"


def test_pc_online_true_on_success():
    # Success branch: a factory that returns a live (context-managed) port 22
    # socket means the probe reports online.
    calls = {"n": 0}
    server._pc_online = _REAL_PC_ONLINE

    import contextlib

    @contextlib.contextmanager
    def fake_conn(target, timeout):
        calls["n"] += 1
        yield object()

    server._create_connection = fake_conn
    assert server._pc_online() is True
    server._create_connection = _REAL_CREATE_CONNECTION
    assert calls["n"] == 1, "online probe must actually attempt the connection"


if __name__ == "__main__":
    test_offline_returns_offline_msg()
    test_online_passes_through()
    test_offline_shall_not_run_anything()
    test_pc_online_probes_port_22()
    test_pc_online_true_on_success()
    print("ALL TESTS PASSED")