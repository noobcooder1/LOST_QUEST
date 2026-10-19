"""End-to-end failure drill against a real server process (pinned model by default, --fake for the stand-in).

Starts run_server.py on a free loopback port, then checks: normal comparison, missing photo, invalid photo,
client timeout, server killed (crash), restart with reproducible vectors, loopback-only listening socket and
no outbound connections from the server process during inference.
"""
from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.client import SimilarityClient  # noqa: E402

SAMPLES = ROOT / "samples" / "generated"
sys.stdout.reconfigure(encoding="utf-8")
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(port: int, fake: bool) -> tuple[subprocess.Popen, float]:
    args = [sys.executable, str(ROOT / "run_server.py"), "--port", str(port)] + (["--fake"] if fake else [])
    started = time.perf_counter()
    proc = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 120
    while time.time() < deadline:
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health", timeout=1).status_code == 200:
                return proc, time.perf_counter() - started
        except httpx.TransportError:
            pass
        if proc.poll() is not None:
            raise RuntimeError("server exited during start")
        time.sleep(0.3)
    raise RuntimeError("server did not become ready")


def embedding(port: int, data: bytes) -> list[float]:
    return httpx.post(f"http://127.0.0.1:{port}/v1/embeddings", files={"image": ("x.jpg", data)}, timeout=30).json()["embedding"]


def main() -> None:
    fake = "--fake" in sys.argv
    port = free_port()
    procs: list[subprocess.Popen] = []
    try:
        run(fake, port, procs)
    finally:
        for proc in procs:  # never leave a server running, even when a check raises
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=30)
    failed = [name for name, ok, _ in results if not ok]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} checks passed" + (f"; FAILED: {failed}" if failed else ""))
    out = ROOT / "results" / "raw"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"failure_drill{'_fake' if fake else ''}.json").write_text(
        json.dumps([{"check": n, "ok": ok, "detail": d} for n, ok, d in results], indent=2, ensure_ascii=False), encoding="utf-8")
    sys.exit(1 if failed else 0)


def run(fake: bool, port: int, procs: list) -> None:
    a = (SAMPLES / "wallet_black_A.jpg").read_bytes()
    b = (SAMPLES / "wallet_black_A__crop.jpg").read_bytes()
    c = (SAMPLES / "umbrella_red_A.jpg").read_bytes()

    proc, ready_seconds = start(port, fake)
    procs.append(proc)
    check("server ready", True, f"{ready_seconds:.1f}s to /health OK")
    server = psutil.Process(proc.pid)
    listening = sorted({conn.laddr.ip for child in [server, *server.children(recursive=True)]
                        for conn in child.net_connections(kind="inet") if conn.status == psutil.CONN_LISTEN})
    check("listens on loopback only", listening == ["127.0.0.1"], str(listening))

    client = SimilarityClient(base_url=f"http://127.0.0.1:{port}", timeout_seconds=30)
    same = client.compare(a, b)
    unrelated = client.compare(a, c)
    check("same-item photo scores higher than unrelated", same.status == unrelated.status == "OK" and same.cosine > unrelated.cosine,
          f"same={same.cosine} unrelated={unrelated.cosine}")
    remote = [conn for child in [server, *server.children(recursive=True)] for conn in child.net_connections(kind="inet")
              if conn.raddr and conn.raddr.ip not in ("127.0.0.1", "::1")]
    check("no outbound connections from the server", not remote, str(remote))
    check("missing photo -> NO_IMAGE (no request)", client.compare(None, a).status == "NO_IMAGE")
    check("invalid photo -> INVALID_IMAGE", client.compare(b"not an image", a).status == "INVALID_IMAGE")
    big = bytes([0xFF, 0xD8]) + b"0" * (10 * 1024 * 1024 + 10)  # JPEG magic, then more than 10 MiB
    check("oversized photo -> INVALID_IMAGE (413)", client.compare(big, a).status == "INVALID_IMAGE")
    hurried = SimilarityClient(base_url=f"http://127.0.0.1:{port}", timeout_seconds=0.001)
    check("client timeout -> TIMEOUT", hurried.compare(a, b).status == "TIMEOUT")
    rss = sum(p.memory_info().rss for p in [server, *server.children(recursive=True)])
    check("server process memory measured", True, f"{round(rss / 1024 / 1024, 1)} MiB RSS")
    before = embedding(port, a)

    for child in server.children(recursive=True):  # simulated crash of the whole server process tree
        child.kill()
    proc.kill()
    proc.wait(timeout=30)
    check("server down -> UNAVAILABLE", client.compare(a, b).status == "UNAVAILABLE")

    proc, ready_seconds = start(port, fake)
    procs.append(proc)
    after = embedding(port, a)
    max_diff = max(abs(x - y) for x, y in zip(before, after))
    check("restart: same vector for the same photo", max_diff < 1e-5, f"max |diff| = {max_diff:.2e}, ready in {ready_seconds:.1f}s")
    check("restart: comparisons work again", client.compare(a, b).status == "OK")


if __name__ == "__main__":
    main()
