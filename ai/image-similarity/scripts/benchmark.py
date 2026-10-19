"""CPU load time, memory and per-image latency of the pinned model (in process).

Measures a 512x512 JPEG and a phone-sized 4000x3000 JPEG (decode + resize dominate for large photos).
"""
from __future__ import annotations

import io
import json
import os
import platform
import statistics
import sys
import time
from pathlib import Path

import psutil
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.embedder import OpenClipEmbedder  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RUNS = int(os.environ.get("LQ_BENCH_RUNS", "30"))


def mib(value: int) -> float:
    return round(value / 1024 / 1024, 1)


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(round(p / 100 * (len(ordered) - 1))))], 1)


def main() -> None:
    process = psutil.Process()
    rss_before = process.memory_info().rss
    started = time.perf_counter()
    embedder = OpenClipEmbedder()
    load_seconds = round(time.perf_counter() - started, 2)
    rss_loaded = process.memory_info().rss

    small = (ROOT / "samples" / "generated" / "wallet_black_A.jpg").read_bytes()
    buffer = io.BytesIO()
    Image.open(io.BytesIO(small)).resize((4000, 3000)).save(buffer, "JPEG", quality=90)
    large = buffer.getvalue()

    report = {"cpu": platform.processor(), "logicalCpus": psutil.cpu_count(), "python": platform.python_version(),
              "loadSeconds": load_seconds, "rssBeforeMiB": mib(rss_before), "rssAfterLoadMiB": mib(rss_loaded), "runs": RUNS}
    peak = rss_loaded
    for label, data in (("512px", small), ("4000x3000", large)):
        embedder.embed(data)  # warm-up
        times = []
        for _ in range(RUNS):
            t = time.perf_counter()
            embedder.embed(data)
            times.append((time.perf_counter() - t) * 1000)
            peak = max(peak, process.memory_info().rss)
        report[label] = {"bytes": len(data), "p50ms": percentile(times, 50), "p95ms": percentile(times, 95),
                         "meanms": round(statistics.mean(times), 1)}
    report["rssPeakMiB"] = mib(peak)
    print(json.dumps(report, indent=2))
    out = ROOT / "results" / "raw"
    out.mkdir(parents=True, exist_ok=True)
    (out / "benchmark.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
