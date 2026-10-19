"""Input handling shared by the real and the fake model."""
import numpy as np
import pytest

from app.embedder import FakeEmbedder, InvalidImage, cosine, load_image, normalize
from tests.conftest import image_bytes


def test_exif_orientation_is_applied_before_embedding():
    # A phone photo stored landscape (64x48) with "rotate 90" EXIF must be decoded as portrait (48x64).
    assert load_image(image_bytes(size=(64, 48), exif_rotate=True)).size == (48, 64)
    assert load_image(image_bytes(size=(64, 48))).size == (64, 48)


def test_png_and_webp_are_accepted_and_converted_to_rgb():
    for fmt in ("PNG", "WEBP"):
        assert load_image(image_bytes(fmt=fmt)).mode == "RGB"


def test_zero_vector_is_rejected():
    with pytest.raises(InvalidImage):
        normalize(np.zeros(4, dtype=np.float32))


def test_fake_embedder_distinguishes_different_images():
    fake = FakeEmbedder()
    a, b = fake.embed(image_bytes(color=(10, 10, 10))), fake.embed(image_bytes(color=(200, 10, 10)))
    assert cosine(a, a) == pytest.approx(1.0, abs=1e-6) and cosine(a, b) < 0.999
