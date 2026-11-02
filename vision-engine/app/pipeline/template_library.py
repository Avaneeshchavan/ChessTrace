"""
Template library: shared silhouette-extraction logic + the 12-piece code
mapping, used both by the offline template generator
(scripts/generate_templates.py) and the live matcher (template_matching.py).

KEY DESIGN CHOICE: SILHOUETTE MATCHING, NOT RAW-PIXEL MATCHING
-----------------------------------------------------------------
A naive approach stores 12 full-color piece crops per theme and
`matchTemplate`s the raw query square against them. That approach is
fragile here because the SAME piece glyph appears on both a light square
and a dark square, and a raw-pixel/raw-color match conflates "is this a
knight" with "is this square light or dark" — you'd need light-square and
dark-square variants of all 12 templates (24 templates) and the light/dark
distinction still leaks into the match score as noise.

Instead, both templates and live query squares are reduced to a binary
FOREGROUND SILHOUETTE via Otsu thresholding before matching:
  - Empty squares are near-uniform in intensity (no strong internal edge),
    so they're detected directly via a low standard-deviation check —
    cheaper and more reliable than trying to template-match "nothing".
  - Non-empty squares get an Otsu threshold, with polarity resolved so
    the piece (which occupies a minority of the square's area) is always
    foreground=255 regardless of whether the underlying square is light
    or dark, and regardless of whether the piece itself is the white or
    black side.
  - Only the 6 SHAPES (P,N,B,R,Q,K) are matched via silhouette; the
    WHITE/BLACK side is then resolved separately by sampling the mean
    grayscale intensity inside the matched foreground mask against each
    theme's two known fill-intensity references (see `classify_side`).
    White and black pieces of the same type are shape-identical — the
    only thing that differs is fill color/intensity — so folding side
    detection into the same template-matching step would just be
    re-deriving this same decomposition, less transparently and less
    robustly (matchTemplate's score would be dominated by the fill-color
    difference in ways that are harder to reason about and to threshold).
This nets out to the same practical result the spec asks for — a
best-guess across all 12 piece types plus empty, with a confidence score
per square — via a decomposition that is more robust to the light/dark
square variation every real screenshot will have.
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

# Unicode chess symbols (U+2654-265F). The 2654-2659 range is the
# "white" (outline/hollow) glyph variant per piece kind; 265A-265F is the
# "black" (filled/solid) variant. This split conveniently matches the
# white/black piece distinction we need for the synthetic template set.
PIECE_GLYPHS = {
    "wK": "\u2654",
    "wQ": "\u2655",
    "wR": "\u2656",
    "wB": "\u2657",
    "wN": "\u2658",
    "wP": "\u2659",
    "bK": "\u265A",
    "bQ": "\u265B",
    "bR": "\u265C",
    "bB": "\u265D",
    "bN": "\u265E",
    "bP": "\u265F",
}

PIECE_CODES = list(PIECE_GLYPHS.keys())  # 12 codes
SHAPE_KINDS = ["K", "Q", "R", "B", "N", "P"]  # 6 shapes shared by both sides

EMPTY_STD_THRESHOLD = 10.0  # grayscale std below this => treat square as empty
TEMPLATE_SIZE = 56  # px, silhouette mask side length


def _inset(square_bgr: np.ndarray, fraction: float = 0.12) -> np.ndarray:
    """
    Crops out a thin border around the square before analysis. Two
    independent sources of contamination live in that border and neither
    is signal: (1) sub-pixel misalignment between the detected board box
    and the true grid lines leaves a sliver of the NEIGHBORING square's
    color at each cell's edge, and (2) Chess.com's default theme overlays
    small coordinate-label text inside the corner squares' own borders.
    Both would otherwise inflate this square's measured std enough to
    trip the empty-square check on a square that's actually empty.
    """
    h, w = square_bgr.shape[:2]
    dy, dx = int(h * fraction), int(w * fraction)
    return square_bgr[dy : h - dy, dx : w - dx]


def is_empty_square(square_bgr: np.ndarray) -> Tuple[bool, float]:
    """Returns (is_empty, grayscale_std). Low std = visually uniform = no piece."""
    gray = cv2.cvtColor(_inset(square_bgr), cv2.COLOR_BGR2GRAY)
    std = float(gray.std())
    return std < EMPTY_STD_THRESHOLD, std


BACKGROUND_DIFF_THRESHOLD = 25  # grayscale levels a pixel must differ from the
# square's own background estimate to count as piece foreground


def extract_silhouette(square_bgr: np.ndarray, size: int = TEMPLATE_SIZE) -> np.ndarray:
    """
    Returns a `size x size` uint8 binary mask (0/255) with the piece
    silhouette as foreground (255), regardless of square/piece color.
    Caller should check `is_empty_square` first; this function assumes
    there IS a piece to extract and will produce a degenerate (near-empty
    or near-full) mask if called on a truly blank square.

    METHOD: background-relative thresholding, not Otsu. An earlier version
    used Otsu's method directly on the square, which silently fails
    whenever a piece's FILL color is close in brightness to the square's
    background (a real and common case: a white piece rendered on a light
    square) — Otsu then draws its split between "outline" and
    "background+fill" instead of between "background" and "piece", so the
    resulting mask captures only a thin outline ring and both the shape
    match and the fill-color sampling done downstream become unreliable.
    Instead we estimate the background color directly from the square's
    own corners (piece glyphs are inset/centered with a clear margin on
    every standard theme, so corner pixels are reliably background) and
    flag any pixel that differs from that estimate by more than
    `BACKGROUND_DIFF_THRESHOLD` gray levels as foreground. This captures
    the piece's full silhouette — fill AND outline — regardless of how
    close the fill color happens to sit to the background.
    """
    gray = cv2.cvtColor(_inset(square_bgr), cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    patch = max(2, min(h, w) // 8)
    corner_pixels = np.concatenate(
        [
            gray[0:patch, 0:patch].ravel(),
            gray[0:patch, w - patch : w].ravel(),
            gray[h - patch : h, 0:patch].ravel(),
            gray[h - patch : h, w - patch : w].ravel(),
        ]
    )
    background_estimate = float(np.median(corner_pixels))

    diff = np.abs(gray.astype(np.int16) - int(round(background_estimate))).astype(np.uint8)
    _, mask = cv2.threshold(diff, BACKGROUND_DIFF_THRESHOLD, 255, cv2.THRESH_BINARY)

    resized = cv2.resize(mask, (size, size), interpolation=cv2.INTER_AREA)
    _, resized = cv2.threshold(resized, 127, 255, cv2.THRESH_BINARY)
    return resized


def mean_fill_intensity(square_bgr: np.ndarray, silhouette: np.ndarray) -> Optional[float]:
    """
    Estimated fill-color intensity of the piece, used to classify
    white-piece vs. black-piece once the shape (K/Q/R/B/N/P) is already
    known.

    The full silhouette mask mixes two populations of pixels: the piece's
    INTERIOR FILL and its OUTLINE STROKE, which standard piece art
    deliberately renders in opposite contrast (a white piece = light fill
    + dark outline; a black piece = dark fill + light outline) so it
    reads clearly on both light and dark squares. Averaging over the
    whole mask blends both bands together and can land in a middle value
    that doesn't clearly indicate either side.

    Rather than trying to strip the outline geometrically (eroding the
    mask), which for thin shapes like a rook's crenellations can erode
    away nearly the ENTIRE piece and leave an unrepresentative handful of
    pixels, this clusters the masked pixels' intensities into two groups
    via k-means and takes the mean of whichever cluster has MORE pixels.
    Fill reliably outweighs outline stroke by area for every standard
    piece glyph, so the majority cluster is the fill color regardless of
    the piece's specific shape or how thin its outline is.

    Returns None if nothing usable remains (shouldn't happen if
    `is_empty_square` was checked first, but guarded defensively).
    """
    if silhouette.sum() == 0:
        return None

    gray = cv2.cvtColor(_inset(square_bgr), cv2.COLOR_BGR2GRAY)
    mask_resized = cv2.resize(silhouette, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_NEAREST)
    values = gray[mask_resized == 255].astype(np.float32).reshape(-1, 1)
    if values.size == 0:
        return None
    if values.size < 8:
        # Too few pixels to cluster meaningfully — just average them.
        return float(values.mean())

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(values, 2, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
    labels = labels.flatten()
    counts = [int(np.sum(labels == 0)), int(np.sum(labels == 1))]
    majority_cluster = int(np.argmax(counts))
    return float(centers.flatten()[majority_cluster])


@dataclass
class ThemeSideReference:
    """Mean fill intensity of white vs. black pieces for one theme, learned
    once from the synthetic template set (see generate_templates.py) and
    reused at inference time for the light/dark-piece decision."""

    white_intensity: float
    black_intensity: float

    def classify(self, sampled_intensity: float) -> str:
        d_white = abs(sampled_intensity - self.white_intensity)
        d_black = abs(sampled_intensity - self.black_intensity)
        return "w" if d_white <= d_black else "b"


SUPPORTED_THEMES = ("chesscom_neo", "lichess_cburnett")


def template_dir(theme: str, base_dir: str) -> str:
    if theme not in SUPPORTED_THEMES:
        raise ValueError(f"Unsupported theme '{theme}'. Supported: {SUPPORTED_THEMES}")
    return f"{base_dir}/{theme}"
