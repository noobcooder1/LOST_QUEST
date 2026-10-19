"""Internal embedding API for LOST QUEST (PoC). Loopback only; the backend is the only intended caller.

Image bytes are processed in memory and never written to disk, logged, or sent to any external service.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from . import config
from .embedder import Embedder, ImageTooLarge, InvalidImage, cosine


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message})


async def read_limited(upload: UploadFile) -> bytes:
    """Reads at most MAX_IMAGE_BYTES + 1 bytes so an oversized upload is rejected without buffering all of it."""
    data = await upload.read(config.MAX_IMAGE_BYTES + 1)
    if len(data) > config.MAX_IMAGE_BYTES:
        raise ImageTooLarge("file too large")
    return data


def create_app(load_embedder: Callable[[], Embedder]) -> FastAPI:
    state: dict = {"embedder": None, "error": None, "loaded_at": None, "load_seconds": None}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        started = time.perf_counter()
        try:
            state["embedder"] = load_embedder()
            state["loaded_at"] = time.time()
            state["load_seconds"] = round(time.perf_counter() - started, 2)
        except Exception as exc:  # the server stays up and reports NOT_READY instead of crashing
            state["error"] = type(exc).__name__
        yield

    app = FastAPI(title="LOST QUEST image similarity (PoC)", docs_url=None, redoc_url=None, openapi_url=None,
                  lifespan=lifespan)

    def embedder_or_none() -> Embedder | None:
        return state["embedder"]

    @app.get("/health")
    def health():
        embedder = embedder_or_none()
        if embedder is None:
            return JSONResponse(status_code=503, content={"status": "NOT_READY", "error": state["error"]})
        return {"status": "OK", "model": embedder.model_name, "pretrained": embedder.pretrained, "dim": embedder.dim,
                "loadSeconds": state["load_seconds"]}

    async def embed_upload(upload: UploadFile):
        embedder = embedder_or_none()
        if embedder is None:
            return None, error(503, "MODEL_NOT_READY", "모델을 불러오는 중이거나 불러오지 못했습니다.")
        try:
            data = await read_limited(upload)
            # CPU-bound inference runs off the event loop so /health stays responsive.
            return await run_in_threadpool(embedder.embed, data), None
        except ImageTooLarge:
            return None, error(413, "IMAGE_TOO_LARGE", "이미지는 10MB, 4천만 픽셀 이하만 처리합니다.")
        except InvalidImage:
            return None, error(400, "INVALID_IMAGE", "JPEG·PNG·WebP 이미지만 처리할 수 있습니다.")

    @app.post("/v1/embeddings")
    async def embeddings(image: UploadFile = File(...)):
        started = time.perf_counter()
        vector, failure = await embed_upload(image)
        if failure:
            return failure
        embedder = embedder_or_none()
        return {"model": embedder.model_name, "pretrained": embedder.pretrained, "dim": int(vector.shape[0]),
                "embedding": [round(float(x), 7) for x in vector], "millis": round((time.perf_counter() - started) * 1000, 1)}

    @app.post("/v1/similarity")
    async def similarity(a: UploadFile = File(...), b: UploadFile = File(...)):
        started = time.perf_counter()
        va, failure = await embed_upload(a)
        if failure:
            return failure
        vb, failure = await embed_upload(b)
        if failure:
            return failure
        embedder = embedder_or_none()
        return {"model": embedder.model_name, "pretrained": embedder.pretrained, "cosine": round(cosine(va, vb), 6),
                "millis": round((time.perf_counter() - started) * 1000, 1)}

    return app


def default_app() -> FastAPI:
    from .embedder import OpenClipEmbedder
    return create_app(OpenClipEmbedder)
