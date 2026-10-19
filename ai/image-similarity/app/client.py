"""How the backend will call the embedding server: every failure becomes a status, never an exception.

The Spring Boot integration will mirror this contract in Java. Image similarity is a reference indicator only,
so NO_IMAGE / UNAVAILABLE / TIMEOUT / INVALID_IMAGE simply mean "no indicator" and never lower a match score.
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from . import config


@dataclass(frozen=True)
class SimilarityResult:
    status: str  # OK, NO_IMAGE, INVALID_IMAGE, UNAVAILABLE, TIMEOUT, ERROR
    cosine: float | None = None
    model: str | None = None


class SimilarityClient:
    def __init__(self, base_url: str = f"http://{config.HOST}:{config.PORT}", timeout_seconds: float = 3.0,
                 transport: httpx.BaseTransport | None = None):
        self._client = httpx.Client(base_url=base_url, timeout=timeout_seconds, transport=transport)

    def close(self) -> None:
        self._client.close()

    def compare(self, a: bytes | None, b: bytes | None) -> SimilarityResult:
        if not a or not b:
            return SimilarityResult("NO_IMAGE")
        try:
            response = self._client.post("/v1/similarity", files={"a": ("a", a), "b": ("b", b)})
        except httpx.TimeoutException:
            return SimilarityResult("TIMEOUT")
        except httpx.TransportError:
            return SimilarityResult("UNAVAILABLE")
        if response.status_code in (400, 413):
            return SimilarityResult("INVALID_IMAGE")
        if response.status_code == 503:
            return SimilarityResult("UNAVAILABLE")
        if response.status_code != 200:
            return SimilarityResult("ERROR")
        try:
            body = response.json()
            value = float(body["cosine"])
        except (ValueError, KeyError, TypeError):
            return SimilarityResult("ERROR")
        if not -1.0 <= value <= 1.0:
            return SimilarityResult("ERROR")
        return SimilarityResult("OK", value, f"{body.get('model')}/{body.get('pretrained')}")
