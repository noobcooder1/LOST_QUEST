"""Starts the embedding server on 127.0.0.1 only.

    .venv\\Scripts\\python.exe run_server.py            # real OpenCLIP model (weights must be downloaded first)
    .venv\\Scripts\\python.exe run_server.py --fake     # deterministic fake model, for tests/drills
"""
from __future__ import annotations

import argparse
import ipaddress

import uvicorn

from app import config
from app.main import create_app, default_app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=config.PORT)
    parser.add_argument("--host", default=config.HOST)
    parser.add_argument("--fake", action="store_true")
    args = parser.parse_args()
    if not ipaddress.ip_address(args.host).is_loopback:
        raise SystemExit("Refusing to bind a non-loopback address: the embedding server must stay internal.")
    if args.fake:
        from app.embedder import FakeEmbedder
        app = create_app(FakeEmbedder)
    else:
        app = default_app()
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning", access_log=False, workers=1)


if __name__ == "__main__":
    main()
