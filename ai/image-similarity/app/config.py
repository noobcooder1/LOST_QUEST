"""Pinned model and safety limits for the LOST QUEST image-similarity PoC."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Pinned model. Changing any of these changes every embedding, so stored vectors must be regenerated.
MODEL_NAME = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
# Hugging Face repository that open_clip resolves for the tag above (recorded with its commit in the design doc).
HF_REPO = "laion/CLIP-ViT-B-32-laion2B-s34B-b79K"
EMBEDDING_DIM = 512
# Exact weights verified at server start (recorded by scripts/download_model.py on 2026-10-19).
HF_REVISION = "1a25a446712ba5ee05982a381eed697ef9b435cf"
WEIGHTS_FILE = "open_clip_model.safetensors"
WEIGHTS_SHA256 = "ac4f8c4b88af6d963118cbf40ad93176d092abbedfcb752601ae1866352656e6"

# Same limits as the Spring Boot upload rules (ImageService): one image up to 10 MiB.
MAX_IMAGE_BYTES = 10 * 1024 * 1024
# Decompression-bomb guard: refuse images whose pixel count exceeds this before decoding them fully.
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Loopback only: the embedding server is an internal helper of the backend, never a public service.
HOST = "127.0.0.1"
PORT = int(os.environ.get("LQ_EMBED_PORT", "8765"))

# Model weights stay inside this PoC folder (gitignored), not in a shared user cache.
CACHE_DIR = ROOT / ".cache" / "hf"


def configure_cache(offline: bool = True) -> None:
    os.environ.setdefault("HF_HOME", str(CACHE_DIR))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    # Weights are downloaded once by scripts/download_model.py; the server itself never goes online.
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"


def pinned_weights_path() -> Path:
    repo_dir = "models--" + HF_REPO.replace("/", "--")
    return CACHE_DIR / repo_dir / "snapshots" / HF_REVISION / WEIGHTS_FILE
