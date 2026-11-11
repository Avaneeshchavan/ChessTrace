"""Compare alpha-composited piece sprites against the local square color.

Each candidate keeps its piece color and outline. Fit several centered scales
and small offsets to tolerate imperfect crops. Scores describe reconstruction
quality and separation, not calibrated probabilities.
"""
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from app.pipeline.template_matching import SquareClassification

SPRITE_THEMES = {
    "chesscom_classic": ("classic", "blue"),
    "chesscom_neo_wood": ("neo_wood", "brown"),
    "chesscom_neon": ("neon", "neon"),
    "chesscom_wood": ("wood", "dark_wood"),
}
CODES = [side + kind for side in "wb" for kind in "KQRBNP"]
ROOT = Path(__file__).resolve().parents[2] / "templates"
SIZE = 28
BORDER = 2
VARIANTS = [(1.0, x, y) for y in (-1, 0, 1) for x in (-1, 0, 1)] + [
    (scale, 0, 0) for scale in (.88, .94, 1.06, 1.12)
]


def read_sprite(path):
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None or image.ndim != 3 or image.shape[2] != 4:
        raise ValueError(f"Expected a transparent RGBA piece sprite: {path}")
    return image


def premultiplied(sprite, size):
    alpha = sprite[:, :, 3].astype(np.float32) / 255
    pixels = np.dstack((sprite[:, :, :3] * alpha[:, :, None], alpha))
    return cv2.resize(pixels, (size, size), interpolation=cv2.INTER_AREA)


@lru_cache(maxsize=len(SPRITE_THEMES))
def atlas(theme):
    rows = []
    center = ((SIZE - 1) / 2,) * 2
    for code in CODES:
        sprite = premultiplied(read_sprite(ROOT / theme / f"{code.lower()}.png"), SIZE)
        for scale, x, y in VARIANTS:
            transform = cv2.getRotationMatrix2D(center, 0, scale)
            transform[:, 2] += (x, y)
            shifted = cv2.warpAffine(sprite, transform, (SIZE, SIZE))
            rows.append(shifted[BORDER:-BORDER, BORDER:-BORDER])
    stack = np.asarray(rows, dtype=np.float32)
    return stack[..., :3], stack[..., 3:4]


def classify_square(square, theme):
    rgb, alpha = atlas(theme)
    sample = cv2.resize(square, (SIZE, SIZE), interpolation=cv2.INTER_AREA).astype(np.float32)
    edge = sample[BORDER:-BORDER, BORDER:-BORDER]
    patches = (edge[:3, :3], edge[:3, -3:], edge[-3:, :3], edge[-3:, -3:])
    background = np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)
    residual = edge - background
    baseline = float(np.mean(residual ** 2))
    if baseline < 36:
        return SquareClassification(None, 1 - baseline / 100, False, baseline ** .5)

    delta = rgb - alpha * background - residual
    errors = np.mean(delta ** 2, axis=(1, 2, 3)).reshape(len(CODES), len(VARIANTS)).min(axis=1)
    best, runner_up = np.argsort(errors)[:2]
    gain = float(np.clip(1 - errors[best] / baseline, 0, 1))
    if gain < .34:
        # Background texture can look non-uniform without fitting any piece.
        return SquareClassification(None, float(np.clip(1 - baseline ** .5 / 30, 0, 1)), False, baseline ** .5)
    margin = float((errors[runner_up] - errors[best]) / baseline)
    return SquareClassification(CODES[best], gain, margin < .08, baseline ** .5)


def classify_board(squares, theme):
    classified = [[classify_square(square, theme) for square in row] for row in squares]
    # Include unexplained square detail in the denominator: one lucky match
    # cannot win auto selection by classifying every other piece as empty.
    detail = [c for row in classified for c in row if c.empty_std >= 12 or c.piece]
    score = sum(c.confidence for c in detail if c.piece) / max(1, len(detail))
    return classified, score
