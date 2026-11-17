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
    "chesscom_cases": ("cases", "icy_sea"),
}
# The texture names are fixture defaults. Recognition estimates each square background.
ADDITIONAL_PIECE_SETS = (
    "8_bit", "8qetl", "alpha",
    "bases", "book", "bubblegum", "club", "condal", "dash", "ejgfv", "game_room",
    "glass", "gothic", "graffiti", "icy_sea", "light", "lolz", "luca", "marble",
    "maya", "metal", "modern", "nature", "newspaper", "ocean", "sky", "space",
    "tigers", "tournament", "vintage",
)
SPRITE_THEMES.update({f"chesscom_{name}": (name, "brown") for name in ADDITIONAL_PIECE_SETS})

CODES = [side + kind for side in "wb" for kind in "KQRBNP"]
ROOT = Path(__file__).resolve().parents[2] / "templates"
SIZE = 28
BORDER = 2
COARSE_SIZE = 14
COARSE_BORDER = 1
COARSE_VARIANTS = ((.88, 0, 0), (1., 0, 0), (1.12, 0, 0))
SHORTLIST_SIZE = 6
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


def piece_sprites(theme):
    if SPRITE_THEMES[theme][0] in ADDITIONAL_PIECE_SETS:
        strip = read_sprite(ROOT / "sprite-strips" / f"{theme}.png")
        if strip.shape[1] != strip.shape[0] * len(CODES):
            raise ValueError(f"Invalid sprite strip for {theme}")
        return np.split(strip, len(CODES), axis=1)
    return [read_sprite(ROOT / theme / f"{code.lower()}.png") for code in CODES]


@lru_cache(maxsize=12)
def atlas(theme, coarse=False):
    size, border, variants = (COARSE_SIZE, COARSE_BORDER, COARSE_VARIANTS) if coarse else (SIZE, BORDER, VARIANTS)
    rows = []
    center = ((size - 1) / 2,) * 2
    for image in piece_sprites(theme):
        sprite = premultiplied(image, size)
        for scale, x, y in variants:
            transform = cv2.getRotationMatrix2D(center, 0, scale)
            transform[:, 2] += (x, y)
            shifted = cv2.warpAffine(sprite, transform, (size, size))
            rows.append(shifted[border:-border, border:-border])
    stack = np.asarray(rows, dtype=np.float32)
    return stack[..., :3], stack[..., 3:4]


def prepare_square(square, size, border):
    sample = cv2.resize(square, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32)
    edge = sample[border:-border, border:-border]
    width = 2 if size == COARSE_SIZE else 3
    patches = (edge[:width, :width], edge[:width, -width:], edge[-width:, :width], edge[-width:, -width:])
    background = np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)
    residual = edge - background
    return background, residual, float(np.mean(residual ** 2))


def prepare_templates(rgb, alpha):
    rgb = np.ascontiguousarray(rgb.reshape(len(rgb), -1, 3))
    alpha = np.ascontiguousarray(alpha.reshape(len(alpha), -1))
    rgb_energy = np.einsum("npc,npc->n", rgb, rgb)
    alpha_energy = np.einsum("np,np->n", alpha, alpha)
    color_overlap = np.einsum("npc,np->nc", rgb, alpha)
    return rgb, alpha, rgb_energy, alpha_energy, color_overlap


def reconstruction_errors(templates, background, residual, baseline):
    rgb, alpha, rgb_energy, alpha_energy, color_overlap = templates
    pixels = residual.reshape(-1, 3)
    # Expand the squared distance to avoid rebuilding a raster for every sprite and square.
    energy = rgb_energy + alpha_energy * np.dot(background, background)
    energy -= 2 * np.einsum("nc,c->n", color_overlap, background)
    overlap = np.einsum("npc,pc->n", rgb, pixels) - np.einsum(
        "np,p->n", alpha, np.einsum("pc,c->p", pixels, background)
    )
    return np.maximum(0, baseline + (energy - 2 * overlap) / pixels.size)


@lru_cache(maxsize=12)
def detailed_templates(theme):
    return prepare_templates(*atlas(theme))


def classify_prepared(sample, theme):
    background, residual, baseline = sample
    if baseline < 36:
        return SquareClassification(None, 1 - baseline / 100, False, baseline ** .5)

    errors = reconstruction_errors(detailed_templates(theme), background, residual, baseline)
    errors = errors.reshape(len(CODES), len(VARIANTS)).min(axis=1)
    best, runner_up = np.argsort(errors)[:2]
    gain = float(np.clip(1 - errors[best] / baseline, 0, 1))
    if gain < .34:
        # Background texture can look non-uniform without fitting any piece.
        return SquareClassification(None, float(np.clip(1 - baseline ** .5 / 30, 0, 1)), False, baseline ** .5)
    margin = float((errors[runner_up] - errors[best]) / baseline)
    return SquareClassification(CODES[best], gain, margin < .08, baseline ** .5)


def prepare_board(squares, size=SIZE, border=BORDER):
    return [[prepare_square(square, size, border) for square in row] for row in squares]


def classify_board(prepared, theme):
    classified = [[classify_prepared(sample, theme) for sample in row] for row in prepared]
    # Include unexplained square detail so one lucky match cannot win auto selection.
    detail = [c for row in classified for c in row if c.empty_std >= 12 or c.piece]
    score = sum(c.confidence for c in detail if c.piece) / max(1, len(detail))
    return classified, score


@lru_cache(maxsize=1)
def coarse_atlases():
    templates = [atlas(theme, True) for theme in SPRITE_THEMES]
    return prepare_templates(*(np.concatenate(items) for items in zip(*templates)))


def shortlist_themes(squares):
    # Rank every set on low-resolution square crops before evaluating the strongest fits.
    templates = coarse_atlases()
    scores = np.zeros(len(SPRITE_THEMES))
    for row in prepare_board(squares, COARSE_SIZE, COARSE_BORDER):
        for background, residual, baseline in row:
            if baseline < 144:
                continue
            error = reconstruction_errors(templates, background, residual, baseline)
            error = error.reshape(len(SPRITE_THEMES), -1).min(axis=1)
            scores += np.maximum(0, 1 - error / baseline)
    themes = tuple(SPRITE_THEMES)
    return [themes[index] for index in np.argsort(-scores, kind="stable")[:SHORTLIST_SIZE]]
