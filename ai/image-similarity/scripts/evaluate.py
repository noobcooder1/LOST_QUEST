"""Cosine similarity for labelled pairs (same / similar / unrelated) with the pinned model, in process.

    .venv\\Scripts\\python.exe scripts\\evaluate.py                       # synthetic set
    .venv\\Scripts\\python.exe scripts\\evaluate.py samples\\real          # team photos (manifest.csv with a,b,label)

Prints per-pair values and per-label min/mean/max. It does NOT choose a threshold: it reports whether the labels
separate and by how much, which is what a threshold decision needs.
"""
from __future__ import annotations

import csv
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.embedder import OpenClipEmbedder, cosine  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "samples" / "generated"
    rows = list(csv.DictReader((folder / "manifest.csv").open(encoding="utf-8")))
    embedder = OpenClipEmbedder()
    cache: dict[str, object] = {}

    def vector(name: str):
        if name not in cache:
            cache[name] = embedder.embed((folder / name).read_bytes())
        return cache[name]

    by_label: dict[str, list[float]] = {}
    results = []
    for row in rows:
        value = cosine(vector(row["a"]), vector(row["b"]))
        by_label.setdefault(row["label"], []).append(value)
        results.append({**row, "cosine": round(value, 4)})
        print(f"{row['label']:<10} {value:6.3f}  {row['a']}  <->  {row['b']}")
    summary = {label: {"n": len(v), "min": round(min(v), 4), "mean": round(statistics.mean(v), 4), "max": round(max(v), 4)}
               for label, v in by_label.items()}
    print(json.dumps(summary, indent=2))
    order = ["same", "similar", "unrelated"]
    present = [label for label in order if label in summary]
    for upper, lower in zip(present, present[1:]):
        gap = round(summary[upper]["min"] - summary[lower]["max"], 4)
        print(f"separation {upper}.min - {lower}.max = {gap} ({'separated' if gap > 0 else 'OVERLAP'})")
    out = ROOT / "results" / "raw"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"evaluate_{folder.name}.json").write_text(json.dumps({"pairs": results, "summary": summary}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
