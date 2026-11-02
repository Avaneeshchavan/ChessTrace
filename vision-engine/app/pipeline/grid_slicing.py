"""
Grid slicing: divide a detected board crop into 64 playing-square images.

WHY THIS NEEDS PER-THEME CONFIGURATION
---------------------------------------
Chess.com's default board renders the a-h/1-8 coordinate labels AS SMALL
OVERLAID TEXT inside the corner squares themselves (bottom rank and
h-file), not in a separate margin. So the full detected board box IS the
8x8 playing area — cell size = board_side / 8, no trimming needed.

Lichess's default board renders coordinates in a thin margin OUTSIDE the
8x8 grid (a strip along the left and bottom edges). If we slice that
board into a naive 8x8 grid without trimming, the grid drifts: every
"row" and "column" includes a sliver of the label margin and the crops
misalign with actual squares by the time you reach row/col 8.

So each theme config below carries a `margin_fraction` — the fraction of
the board's side length occupied by the label margin, trimmed before the
8x8 divide. This is exactly the kind of per-theme constant that silently
guessing would get wrong, which is why theme selection is explicit
(see template_library.py) rather than assumed.
"""

from dataclasses import dataclass
from typing import List

import cv2
import numpy as np


@dataclass
class ThemeGridConfig:
    margin_fraction: float  # fraction of board side trimmed from ALL FOUR edges


THEME_GRID_CONFIGS = {
    "chesscom_neo": ThemeGridConfig(margin_fraction=0.0),
    # NOTE: board_detection's Canny-edge approach already isolates the pure
    # checkerboard from an outside coordinate-label margin whenever there's
    # a real contrast gap between them (labels sit on the page background,
    # not on a square) — see board_detection.py's docstring. So the margin
    # actually left over for grid_slicing to strip here is just alignment
    # slop, not the full label band. A small fixed safety margin (not the
    # ~0.035 you'd expect from the label width alone) is what's actually
    # needed; if board_detection's separation assumption breaks on a real
    # screenshot (labels closer to / touching the board edge), this is the
    # first constant to revisit.
    "lichess_cburnett": ThemeGridConfig(margin_fraction=0.005),
}


def slice_board(
    board_img: np.ndarray, theme: str, cell_px: int = 64
) -> List[List[np.ndarray]]:
    """
    Returns an 8x8 nested list of square crops, resized to (cell_px,cell_px).
    Index [row][col]: row 0 = top of the image, col 0 = left of the image.
    (Mapping row/col -> algebraic square happens later, in fen_assembly,
    once orientation is known — this function knows nothing about White
    or Black, only pixels.)
    """
    if theme not in THEME_GRID_CONFIGS:
        raise ValueError(
            f"Unsupported theme '{theme}'. Supported: {list(THEME_GRID_CONFIGS)}"
        )

    cfg = THEME_GRID_CONFIGS[theme]
    side = board_img.shape[0]
    margin = int(round(side * cfg.margin_fraction))

    playing_area = board_img[margin : side - margin, margin : side - margin]
    playing_side = playing_area.shape[0]
    step = playing_side / 8.0

    squares: List[List[np.ndarray]] = []
    for row in range(8):
        row_squares = []
        for col in range(8):
            y0, y1 = int(round(row * step)), int(round((row + 1) * step))
            x0, x1 = int(round(col * step)), int(round((col + 1) * step))
            crop = playing_area[y0:y1, x0:x1]
            if crop.size == 0:
                # Degenerate slice (can happen on tiny/odd-sized inputs) —
                # produce a blank cell rather than letting resize throw.
                crop = np.zeros((step_or(step), step_or(step), 3), dtype=np.uint8)
            resized = cv2.resize(crop, (cell_px, cell_px), interpolation=cv2.INTER_AREA)
            row_squares.append(resized)
        squares.append(row_squares)
    return squares


def step_or(step: float) -> int:
    return max(1, int(round(step)))
