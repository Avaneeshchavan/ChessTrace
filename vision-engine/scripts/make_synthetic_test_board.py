"""
Builds a synthetic "screenshot" of a chess position for testing/demo
purposes, since this sandbox has no network access to pull a real
Chess.com or Lichess screenshot (see README.md for the honesty note on
what would change with a real one).

The synthetic image includes: a page-colored background margin around the
board (to genuinely exercise board_detection's contour search rather than
handing it a pre-cropped image), a checkered board in the requested
theme's colors, pieces drawn with the SAME glyph-rendering approach used
for the templates (full color this time, matching how a real site would
render them), and — for the lichess theme — an outside coordinate-label
margin (chesscom labels are drawn overlaid inside the corner squares
instead, matching that site's real layout).
"""

import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.generate_templates import SHAPE_GLYPHS, THEME_COLORS, DEJAVU_SANS  # noqa: E402

SQUARE_COLORS = {
    "chesscom_neo": {"light": (238, 238, 210), "dark": (118, 150, 86)},  # RGB
    "lichess_cburnett": {"light": (240, 217, 181), "dark": (181, 136, 99)},
}

FILES = "abcdefgh"


def draw_piece(draw: ImageDraw.ImageDraw, cx: int, cy: int, size: int, piece_code: str, theme: str):
    side, shape = piece_code[0], piece_code[1]
    colors = THEME_COLORS[theme]
    fill = colors["white_fill"] if side == "w" else colors["black_fill"]
    outline = colors["white_outline"] if side == "w" else colors["black_outline"]
    glyph = SHAPE_GLYPHS[shape]

    font = ImageFont.truetype(DEJAVU_SANS, size=int(size * 0.8))
    stroke_w = 1
    bbox = draw.textbbox((0, 0), glyph, font=font, stroke_width=stroke_w)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = cx - w / 2 - bbox[0]
    y = cy - h / 2 - bbox[1]
    draw.text((x, y), glyph, font=font, fill=(fill, fill, fill), stroke_width=stroke_w, stroke_fill=(outline, outline, outline))


def render_board_image(
    piece_grid,  # 8x8, row0=rank8..row7=rank1 (i.e. standard/white-bottom order), None or "wK" etc
    theme: str,
    cell_px: int = 64,
    page_margin: int = 80,
    label_margin_px: int = 22,
) -> np.ndarray:
    colors = SQUARE_COLORS[theme]
    has_outside_labels = theme == "lichess_cburnett"
    board_px = cell_px * 8
    outside = label_margin_px if has_outside_labels else 0

    canvas_w = board_px + outside + 2 * page_margin
    canvas_h = board_px + outside + 2 * page_margin
    img = Image.new("RGB", (canvas_w, canvas_h), (30, 32, 36))  # dark page background
    draw = ImageDraw.Draw(img)

    board_x0 = page_margin
    board_y0 = page_margin
    playing_x0 = board_x0 + outside
    playing_y0 = board_y0

    for row in range(8):
        for col in range(8):
            light = (row + col) % 2 == 0
            color = colors["light"] if light else colors["dark"]
            x0 = playing_x0 + col * cell_px
            y0 = playing_y0 + row * cell_px
            draw.rectangle([x0, y0, x0 + cell_px, y0 + cell_px], fill=color)

    if has_outside_labels:
        font = ImageFont.truetype(DEJAVU_SANS, size=int(label_margin_px * 0.55))
        for col in range(8):
            x0 = playing_x0 + col * cell_px
            draw.text((x0 + cell_px // 2 - 4, playing_y0 + board_px + 5), FILES[col], font=font, fill=(200, 200, 200))
        for row in range(8):
            y0 = playing_y0 + row * cell_px
            rank_label = str(8 - row)
            draw.text((board_x0 + 2, y0 + cell_px // 2 - 6), rank_label, font=font, fill=(200, 200, 200))
    else:
        # chesscom-style: overlay small labels inside the corner squares
        font = ImageFont.truetype(DEJAVU_SANS, size=int(cell_px * 0.16))
        for col in range(8):
            row = 7
            light = (row + col) % 2 == 0
            txt_color = colors["dark"] if light else colors["light"]
            x0 = playing_x0 + col * cell_px
            y0 = playing_y0 + row * cell_px
            draw.text((x0 + 3, y0 + cell_px - 16), FILES[col], font=font, fill=txt_color)
        for row in range(8):
            col = 7
            light = (row + col) % 2 == 0
            txt_color = colors["dark"] if light else colors["light"]
            x0 = playing_x0 + col * cell_px
            y0 = playing_y0 + row * cell_px
            draw.text((x0 + cell_px - 12, y0 + 2), str(8 - row), font=font, fill=txt_color)

    for row in range(8):
        for col in range(8):
            piece = piece_grid[row][col]
            if piece:
                x0 = playing_x0 + col * cell_px
                y0 = playing_y0 + row * cell_px
                draw_piece(draw, x0 + cell_px // 2, y0 + cell_px // 2, cell_px, piece, theme)

    arr = np.array(img)
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return bgr


# A real, slightly tactical mid-game position (not the starting position,
# so the worked example actually demonstrates the pipeline rather than
# just re-deriving a hardcoded FEN). White-bottom orientation.
# Row 0 = rank 8 ... Row 7 = rank 1, Col 0 = file a ... Col 7 = file h.
EXAMPLE_POSITION = [
    [None,  None,  "bK",  None,  None,  "bR",  None,  None ],  # rank 8
    ["bP",  "bP",  None,  None,  None,  "bP",  "bP",  "bP" ],  # rank 7
    [None,  None,  "bN",  None,  None,  "bN",  None,  None ],  # rank 6
    [None,  None,  None,  None,  "bP",  None,  None,  None ],  # rank 5
    [None,  None,  None,  "wP",  None,  None,  None,  None ],  # rank 4
    [None,  None,  "wN",  None,  None,  "wN",  None,  None ],  # rank 3
    ["wP",  "wP",  None,  None,  None,  "wP",  "wP",  "wP" ],  # rank 2
    [None,  None,  "wK",  None,  None,  "wR",  None,  None ],  # rank 1
]

EXAMPLE_FEN_PIECE_PLACEMENT_GROUND_TRUTH = "2k2r2/pp3ppp/2n2n2/4p3/3P4/2N2N2/PP3PPP/2K2R2"


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "examples")
    os.makedirs(out_dir, exist_ok=True)

    for theme in ("chesscom_neo", "lichess_cburnett"):
        img = render_board_image(EXAMPLE_POSITION, theme)
        path = os.path.join(out_dir, f"synthetic_{theme}.png")
        cv2.imwrite(path, img)
        print(f"wrote {path}  shape={img.shape}")
