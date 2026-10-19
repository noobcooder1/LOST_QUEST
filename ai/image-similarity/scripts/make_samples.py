"""Generates a deterministic synthetic sample set (no downloads, no user photos) and a labelled pair manifest.

Objects are drawn with Pillow on textured backgrounds. "same" pairs are the same drawn object under camera-like
changes (crop, rotation, light, background, compression, blur); "similar" pairs share category and/or colour;
"unrelated" pairs differ in category. Synthetic drawings are NOT real photos: they exercise the pipeline and give
a first ordering check, but thresholds must be calibrated on real photos (samples/real/).
"""
from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "generated"
SIZE = 512


def background(kind: str, seed: int) -> Image.Image:
    rnd = random.Random(seed)
    img = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(img)
    if kind == "wood":
        for y in range(SIZE):
            shade = 150 + int(25 * ((y // 7) % 2)) + rnd.randint(-8, 8)
            draw.line([(0, y), (SIZE, y)], fill=(shade, int(shade * 0.72), int(shade * 0.48)))
    elif kind == "fabric":
        for y in range(0, SIZE, 4):
            for x in range(0, SIZE, 4):
                v = 95 + rnd.randint(-12, 12)
                draw.rectangle([x, y, x + 3, y + 3], fill=(v - 20, v, v + 25))
    elif kind == "concrete":
        for y in range(0, SIZE, 3):
            for x in range(0, SIZE, 3):
                v = 165 + rnd.randint(-18, 18)
                draw.rectangle([x, y, x + 2, y + 2], fill=(v, v, v - 5))
    else:  # desk
        draw.rectangle([0, 0, SIZE, SIZE], fill=(232, 228, 220))
    return img.filter(ImageFilter.GaussianBlur(0.8))


def shadow(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    layer = Image.new("L", img.size, 0)
    ImageDraw.Draw(layer).ellipse([box[0] + 10, box[3] - 18, box[2] + 18, box[3] + 22], fill=110)
    layer = layer.filter(ImageFilter.GaussianBlur(14))
    img.paste((20, 20, 20), (0, 0), layer)


def shade(color: tuple[int, int, int], k: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(c * k))) for c in color)


def wallet(draw: ImageDraw.ImageDraw, color, style: str) -> tuple[int, int, int, int]:
    box = (120, 170, 400, 350)
    draw.rounded_rectangle(box, 22, fill=color, outline=shade(color, 0.6), width=4)
    draw.rounded_rectangle((132, 182, 388, 338), 16, outline=shade(color, 1.6), width=2)  # stitching
    if style == "bifold":
        draw.line([(260, 172), (260, 348)], fill=shade(color, 0.55), width=5)
        draw.rounded_rectangle((285, 230, 375, 290), 8, fill=(205, 205, 210))  # card edge
    else:
        draw.rounded_rectangle((330, 240, 400, 280), 10, fill=shade(color, 0.75))  # strap
        draw.ellipse((345, 250, 365, 270), fill=(200, 190, 140))  # snap button
    return box


def backpack(draw, color, _style) -> tuple[int, int, int, int]:
    box = (150, 110, 370, 410)
    draw.rounded_rectangle(box, 60, fill=color, outline=shade(color, 0.6), width=4)
    draw.rounded_rectangle((185, 240, 335, 380), 30, fill=shade(color, 1.25), outline=shade(color, 0.6), width=3)
    draw.line([(190, 260), (330, 260)], fill=(60, 60, 60), width=3)  # zipper
    draw.arc((215, 70, 305, 150), 180, 360, fill=shade(color, 0.7), width=12)  # handle
    return box


def umbrella(draw, color, _style) -> tuple[int, int, int, int]:
    draw.pieslice((90, 110, 430, 380), 180, 360, fill=color, outline=shade(color, 0.6), width=3)
    for x in (175, 260, 345):
        draw.line([(260, 112), (x, 245)], fill=shade(color, 0.7), width=2)
    draw.line([(260, 245), (260, 400)], fill=(70, 60, 50), width=7)
    draw.arc((225, 375, 265, 425), 0, 180, fill=(70, 60, 50), width=7)
    return (90, 110, 430, 420)


def earbuds(draw, color, _style) -> tuple[int, int, int, int]:
    box = (170, 190, 350, 330)
    draw.rounded_rectangle(box, 55, fill=color, outline=(180, 180, 180), width=3)
    draw.line([(176, 245), (344, 245)], fill=(185, 185, 185), width=2)
    draw.ellipse((252, 270, 268, 286), fill=(120, 200, 140))  # status LED
    return box


def phone(draw, color, _style) -> tuple[int, int, int, int]:
    box = (185, 90, 335, 420)
    draw.rounded_rectangle(box, 26, fill=color, outline=(90, 90, 95), width=4)
    draw.rounded_rectangle((197, 112, 323, 398), 14, fill=(30, 40, 60))  # screen
    draw.ellipse((252, 98, 268, 108), fill=(20, 20, 20))
    return box


def keys(draw, color, _style) -> tuple[int, int, int, int]:
    draw.ellipse((150, 150, 250, 250), outline=(170, 170, 175), width=8)  # ring
    for dx, angle in ((0, 0), (40, 25)):
        x0 = 230 + dx
        draw.rounded_rectangle((x0, 210, x0 + 150, 245), 10, fill=color)
        for t in range(4):
            draw.rectangle((x0 + 95 + t * 14, 245, x0 + 103 + t * 14, 258 + (t % 2) * 8), fill=color)
    return (150, 150, 430, 270)


DRAWERS = {"wallet": wallet, "backpack": backpack, "umbrella": umbrella, "earbuds": earbuds, "phone": phone, "keys": keys}

# (id, object, colour, style, background)
OBJECTS = [
    ("wallet_black_A", "wallet", (32, 32, 36), "strap", "wood"),
    ("wallet_black_B", "wallet", (28, 28, 30), "bifold", "desk"),
    ("wallet_brown_A", "wallet", (118, 72, 40), "strap", "wood"),
    ("backpack_navy_A", "backpack", (30, 45, 90), "", "concrete"),
    ("backpack_black_A", "backpack", (35, 35, 38), "", "fabric"),
    ("umbrella_red_A", "umbrella", (190, 40, 45), "", "concrete"),
    ("earbuds_white_A", "earbuds", (240, 240, 240), "", "desk"),
    ("phone_black_A", "phone", (25, 25, 28), "", "fabric"),
    ("keys_silver_A", "keys", (175, 175, 182), "", "wood"),
]


def render(obj: str, color, style: str, bg: str, seed: int) -> Image.Image:
    img = background(bg, seed)
    probe = Image.new("RGB", img.size)
    box = DRAWERS[obj](ImageDraw.Draw(probe), color, style)
    shadow(img, box)
    DRAWERS[obj](ImageDraw.Draw(img), color, style)
    # Soft studio light from the top left.
    light = Image.linear_gradient("L").rotate(45).resize(img.size)
    return Image.composite(ImageEnhance.Brightness(img).enhance(1.12), img, light)


def variants(base: Image.Image, obj, color, style, seed) -> dict[str, Image.Image]:
    """Camera-like changes of the SAME object (what two photos of one lost item look like)."""
    return {
        "crop": base.crop((60, 60, 470, 470)).resize((SIZE, SIZE)),
        "rotate": base.rotate(17, resample=Image.BICUBIC, fillcolor=(120, 110, 100)),
        "dark": ImageEnhance.Contrast(ImageEnhance.Brightness(base).enhance(0.6)).enhance(1.2),
        "blur": base.filter(ImageFilter.GaussianBlur(2.2)),
        "otherbg": render(obj, color, style, "fabric" if seed % 2 else "concrete", seed + 99),
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pairs: list[tuple[str, str, str]] = []
    for index, (oid, obj, color, style, bg) in enumerate(OBJECTS):
        base = render(obj, color, style, bg, index)
        base.save(OUT / f"{oid}.jpg", quality=90)
        if oid in ("wallet_black_A", "backpack_navy_A", "umbrella_red_A"):
            for name, img in variants(base, obj, color, style, index).items():
                quality = 35 if name == "dark" else 85  # also exercise heavy JPEG compression
                img.save(OUT / f"{oid}__{name}.jpg", quality=quality)
                pairs.append((f"{oid}.jpg", f"{oid}__{name}.jpg", "same"))
    pairs += [
        ("wallet_black_A.jpg", "wallet_black_B.jpg", "similar"),   # same category + colour, different design
        ("wallet_black_A.jpg", "wallet_brown_A.jpg", "similar"),   # same category + design, different colour
        ("backpack_navy_A.jpg", "backpack_black_A.jpg", "similar"),
        ("wallet_black_A.jpg", "umbrella_red_A.jpg", "unrelated"),
        ("wallet_black_A.jpg", "backpack_navy_A.jpg", "unrelated"),
        ("wallet_black_A.jpg", "earbuds_white_A.jpg", "unrelated"),
        ("wallet_black_A.jpg", "keys_silver_A.jpg", "unrelated"),
        ("phone_black_A.jpg", "umbrella_red_A.jpg", "unrelated"),
        ("earbuds_white_A.jpg", "backpack_black_A.jpg", "unrelated"),
        ("keys_silver_A.jpg", "umbrella_red_A.jpg", "unrelated"),
        ("phone_black_A.jpg", "wallet_black_B.jpg", "unrelated"),  # same colour, different category
    ]
    with (OUT / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["a", "b", "label"])
        writer.writerows(pairs)
    print(f"wrote {len(list(OUT.glob('*.jpg')))} images and {len(pairs)} pairs to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
