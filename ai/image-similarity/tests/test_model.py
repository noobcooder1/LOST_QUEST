"""Real pinned model. Skipped when the weights are not downloaded (run scripts/download_model.py first)."""
import pytest

from app import config
from app.embedder import OpenClipEmbedder, cosine
from tests.conftest import image_bytes

pytestmark = pytest.mark.skipif(not config.pinned_weights_path().is_file(), reason="pinned weights not downloaded")


@pytest.fixture(scope="module")
def embedder():
    return OpenClipEmbedder()


def test_pinned_model_and_dimension(embedder):
    assert (embedder.model_name, embedder.pretrained, embedder.dim) == (config.MODEL_NAME, config.PRETRAINED, config.EMBEDDING_DIM)


def test_same_bytes_give_identical_vectors_and_restart_is_reproducible(embedder):
    data = image_bytes()
    first = embedder.embed(data)
    assert cosine(first, embedder.embed(data)) == pytest.approx(1.0, abs=1e-6)
    restarted = OpenClipEmbedder()  # a fresh model instance behaves like a server restart
    assert cosine(first, restarted.embed(data)) == pytest.approx(1.0, abs=1e-5)
