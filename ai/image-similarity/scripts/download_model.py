"""One explicit download of the pinned OpenCLIP weights into ./.cache (gitignored), then prints what was pinned.

After this step the server loads the model offline (HF_HUB_OFFLINE=1 is set by run scripts that need it).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    config.configure_cache(offline=False)
    import open_clip

    open_clip.create_model_and_transforms(config.MODEL_NAME, pretrained=config.PRETRAINED, cache_dir=str(config.CACHE_DIR))
    weights = sorted(p for p in config.CACHE_DIR.rglob("*") if p.is_file() and p.suffix in {".safetensors", ".bin", ".pt"})
    report = {
        "model": config.MODEL_NAME, "pretrained": config.PRETRAINED, "hf_repo": config.HF_REPO,
        "open_clip": open_clip.__version__,
        "files": [{"path": str(p.relative_to(config.CACHE_DIR)), "bytes": p.stat().st_size, "sha256": sha256(p)} for p in weights],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
