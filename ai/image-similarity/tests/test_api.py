"""HTTP contract with the deterministic fake model (no weights needed)."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config
from app.embedder import FakeEmbedder
from app.main import create_app
from tests.conftest import image_bytes


@pytest.fixture
def client():
    with TestClient(create_app(FakeEmbedder)) as test_client:
        yield test_client


def test_health_reports_model(client):
    body = client.get("/health").json()
    assert body["status"] == "OK" and body["model"] == "fake" and body["dim"] == 16


def test_embedding_is_normalized_and_deterministic(client, jpeg):
    first = client.post("/v1/embeddings", files={"image": ("x.jpg", jpeg, "image/jpeg")}).json()
    second = client.post("/v1/embeddings", files={"image": ("y.jpg", jpeg, "image/jpeg")}).json()
    assert first["embedding"] == second["embedding"]
    assert abs(sum(x * x for x in first["embedding"]) - 1.0) < 1e-4


def test_similarity_of_identical_images_is_one(client, jpeg):
    body = client.post("/v1/similarity", files={"a": ("a", jpeg), "b": ("b", jpeg)}).json()
    assert body["cosine"] == pytest.approx(1.0, abs=1e-5)


@pytest.mark.parametrize("payload", [b"", b"not an image", b"GIF89a" + b"\x00" * 20])
def test_rejects_non_images(client, payload):
    response = client.post("/v1/embeddings", files={"image": ("x.jpg", payload, "image/jpeg")})
    assert response.status_code == 400 and response.json()["code"] == "INVALID_IMAGE"


def test_rejects_gif_even_if_decodable(client):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, "GIF")
    response = client.post("/v1/embeddings", files={"image": ("x.gif", buffer.getvalue())})
    assert response.status_code == 400


def test_rejects_oversized_file(client, monkeypatch, jpeg):
    monkeypatch.setattr(config, "MAX_IMAGE_BYTES", len(jpeg) - 1)
    response = client.post("/v1/embeddings", files={"image": ("x.jpg", jpeg)})
    assert response.status_code == 413 and response.json()["code"] == "IMAGE_TOO_LARGE"


def test_rejects_pixel_bombs(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_IMAGE_PIXELS", 100)
    response = client.post("/v1/embeddings", files={"image": ("x.png", image_bytes(size=(20, 20), fmt="PNG"))})
    assert response.status_code == 413


def test_missing_part_is_a_client_error(client, jpeg):
    assert client.post("/v1/similarity", files={"a": ("a", jpeg)}).status_code == 422


def test_model_load_failure_reports_not_ready_instead_of_crashing(jpeg):
    def broken():
        raise RuntimeError("weights missing")

    with TestClient(create_app(broken)) as test_client:
        assert test_client.get("/health").status_code == 503
        response = test_client.post("/v1/embeddings", files={"image": ("x.jpg", jpeg)})
        assert response.status_code == 503 and response.json()["code"] == "MODEL_NOT_READY"


def test_no_docs_endpoints_exposed(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_server_refuses_non_loopback_bind(monkeypatch):
    import run_server
    monkeypatch.setattr("sys.argv", ["run_server.py", "--host", "0.0.0.0", "--fake"])
    with pytest.raises(SystemExit):
        run_server.main()
