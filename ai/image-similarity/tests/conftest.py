import io
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def image_bytes(color=(30, 30, 30), size=(64, 48), fmt="JPEG", exif_rotate=False) -> bytes:
    img = Image.new("RGB", size, color)
    img.paste((250, 250, 250), (0, 0, size[0] // 2, size[1] // 3))  # asymmetric mark so rotation matters
    buffer = io.BytesIO()
    if exif_rotate:
        exif = Image.Exif()
        exif[0x0112] = 6  # Orientation: rotate 90 CW when displayed
        img.save(buffer, fmt, exif=exif)
    else:
        img.save(buffer, fmt)
    return buffer.getvalue()


@pytest.fixture
def jpeg() -> bytes:
    return image_bytes()
