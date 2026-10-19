"""Image -> L2-normalized embedding. The real model and a deterministic fake share one interface."""
from __future__ import annotations

import hashlib
import io
import threading
from typing import Protocol

import numpy as np
from PIL import Image, ImageOps

from . import config


class InvalidImage(ValueError):
    """The bytes are not a supported, safely decodable image."""


class ImageTooLarge(ValueError):
    """The file or its pixel count exceeds the limits."""


def load_image(data: bytes) -> Image.Image:
    """Validates and decodes untrusted bytes. Never trusts the file name or the client's content type."""
    if not data:
        raise InvalidImage("empty file")
    if len(data) > config.MAX_IMAGE_BYTES:
        raise ImageTooLarge("file too large")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format not in config.ALLOWED_FORMATS:
                raise InvalidImage("unsupported format")
            width, height = probe.size
            if width <= 0 or height <= 0 or width * height > config.MAX_IMAGE_PIXELS:
                raise ImageTooLarge("too many pixels")
            probe.verify()
        image = Image.open(io.BytesIO(data))
        image.load()
    except (InvalidImage, ImageTooLarge):
        raise
    except Exception as exc:  # PIL raises many types for corrupt input
        raise InvalidImage("cannot decode image") from exc
    # Phone photos carry their rotation in EXIF; apply it so a rotated upload of the same item still matches.
    return ImageOps.exif_transpose(image).convert("RGB")


class Embedder(Protocol):
    model_name: str
    pretrained: str
    dim: int

    def embed(self, data: bytes) -> np.ndarray: ...


class OpenClipEmbedder:
    """OpenCLIP on CPU. Loading takes seconds, so it happens once at server start."""

    def __init__(self, model_name: str = config.MODEL_NAME, pretrained: str = config.PRETRAINED, threads: int | None = None):
        config.configure_cache(offline=True)
        if (model_name, pretrained) == (config.MODEL_NAME, config.PRETRAINED):
            verify_pinned_weights()
        import open_clip
        import torch

        if threads:
            torch.set_num_threads(threads)
        self._torch = torch
        self.model_name = model_name
        self.pretrained = pretrained
        model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained,
                                                                      cache_dir=str(config.CACHE_DIR))
        model.eval()
        self._model = model
        self._preprocess = preprocess
        self.dim = int(model.visual.output_dim)
        # PyTorch CPU inference is not guaranteed thread-safe for one module; serialize calls.
        self._lock = threading.Lock()

    def embed(self, data: bytes) -> np.ndarray:
        tensor = self._preprocess(load_image(data)).unsqueeze(0)
        with self._lock, self._torch.inference_mode():
            vector = self._model.encode_image(tensor)[0].float().cpu().numpy()
        return normalize(vector)


class ModelUnavailable(RuntimeError):
    """The pinned weights are missing or do not match the recorded checksum."""


def verify_pinned_weights() -> None:
    path = config.pinned_weights_path()
    if not path.is_file():
        raise ModelUnavailable("pinned weights not downloaded (run scripts/download_model.py)")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    if digest.hexdigest() != config.WEIGHTS_SHA256:
        raise ModelUnavailable("weights checksum mismatch")


class FakeEmbedder:
    """Deterministic stand-in for tests: identical bytes give identical vectors, no model download."""

    model_name = "fake"
    pretrained = "sha256"
    dim = 16

    def embed(self, data: bytes) -> np.ndarray:
        load_image(data)  # same validation as the real embedder
        digest = hashlib.sha256(data).digest()
        vector = np.frombuffer((digest * 2)[: self.dim * 2], dtype=np.uint8).astype(np.float32)[: self.dim] - 127.5
        return normalize(vector)


def normalize(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm == 0.0:
        raise InvalidImage("degenerate embedding")
    return (vector / norm).astype(np.float32)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Both vectors are L2-normalized, so the dot product is the cosine similarity, clipped to [-1, 1]."""
    return float(np.clip(np.dot(a, b), -1.0, 1.0))
