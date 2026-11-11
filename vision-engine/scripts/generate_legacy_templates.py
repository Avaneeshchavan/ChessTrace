"""
Generates the reference template library used by app/pipeline/template_matching.py.

>>> IMPORTANT / HONESTY NOTE, READ BEFORE DEPLOYING <<<
This sandbox has no network access, so this script cannot fetch the actual
Chess.com "neo" piece sprites or Lichess "cburnett" piece SVGs from their
CDNs. What it generates instead are SHAPE-ACCURATE STAND-INS built from the
Unicode chess-symbol block (U+265A-265F, DejaVu Sans has real glyphs for
these — verified in this environment), rendered as solid silhouettes with
a light fill for the "white" side and a dark fill for the "black" side.

These stand-ins are good enough to:
  - exercise the full pipeline end-to-end (board detection -> slicing ->
    matching -> FEN assembly -> validation),
  - demonstrate the silhouette-matching approach works correctly,
  - produce a real worked example with a real, chess.js/python-chess
    -parseable FEN out the other end.

They are NOT pixel-identical to Chess.com's or Lichess's actual piece
art, and matching real screenshots against them will be measurably less
accurate than matching against templates cropped from the real sprites.
BEFORE PRODUCTION USE: replace the six PNGs in each theme folder with
silhouettes extracted from real screenshots of that site/theme (crop a
clean square containing each piece type, run it through
`app.pipeline.template_library.extract_silhouette`, save the result) and
recompute side_reference.json the same way. The extraction function is
identical either way, so swapping in real assets requires no code changes
— only new PNGs and a rerun of `compute_side_reference()` below.

Run with:  python -m scripts.generate_legacy_templates
"""

import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.pipeline.template_library import extract_silhouette, mean_fill_intensity  # noqa: E402

_FONT_CANDIDATES = [
    os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),  # macOS via `brew install --cask font-dejavu-sans`
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",     # Debian / Ubuntu
]
DEJAVU_SANS = next((p for p in _FONT_CANDIDATES if os.path.isfile(p)), _FONT_CANDIDATES[-1])

# Solid/filled glyph variants only (U+265A-265F) — used as the shape
# source for BOTH sides. Real sites render white and black pieces as the
# same silhouette with different fill color, not different glyph shapes,
# so using one glyph family per shape and varying only fill color mirrors
# that and guarantees the two sides produce identical shape masks.
SHAPE_GLYPHS = {
    "K": "\u265A",
    "Q": "\u265B",
    "R": "\u265C",
    "B": "\u265D",
    "N": "\u265E",
    "P": "\u265F",
}

THEME_COLORS = {
    # (white_piece_fill, white_piece_outline, black_piece_fill, black_piece_outline)
    # Values are grayscale 0-255; real assets are full-color but silhouette
    # matching only cares about the luminance contrast used to segment
    # foreground from background, so grayscale stand-ins are sufficient.
    #
    # IMPORTANT CALIBRATION NOTE: these fill values are deliberately kept
    # at a meaningful distance (>=25 gray levels) from BOTH the light and
    # dark square background grays of their theme (chesscom_neo: light
    # ~235, dark ~133; lichess_cburnett: light ~220, dark ~145) — not just
    # from one or the other. An earlier version used a near-white fill
    # (248) that was only ~13 levels off the light-square background
    # (~235); the background-relative segmentation in
    # template_library.extract_silhouette correctly treated the outline
    # as foreground but dropped most of the FILL pixels as
    # indistinguishable from background, which then corrupted
    # mean_fill_intensity's white/black side call for any white piece
    # sitting on a light square. Real piece art avoids this failure mode
    # with shading/gradients rather than flat fill; these stand-ins avoid
    # it by simply choosing a fill tone with headroom against both square
    # colors.
    "chesscom_neo": dict(white_fill=205, white_outline=25, black_fill=35, black_outline=225),
    "lichess_cburnett": dict(white_fill=180, white_outline=20, black_fill=30, black_outline=230),
}

CANVAS_SIZE = 64
NEUTRAL_BG = 128  # mid-gray canvas; irrelevant to matching, just needs contrast for extraction


def render_glyph(glyph: str, fill: int, outline: int, canvas_size: int = CANVAS_SIZE) -> np.ndarray:
    img = Image.new("L", (canvas_size, canvas_size), color=NEUTRAL_BG)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(DEJAVU_SANS, size=int(canvas_size * 0.82))
    stroke_w = 1  # thin — see note in mean_fill_intensity on why a thick
    # stroke would bias the fill-color sample used for side classification

    bbox = draw.textbbox((0, 0), glyph, font=font, stroke_width=stroke_w)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (canvas_size - w) / 2 - bbox[0]
    y = (canvas_size - h) / 2 - bbox[1]

    draw.text((x, y), glyph, font=font, fill=fill, stroke_width=stroke_w, stroke_fill=outline)
    gray = np.array(img)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)  # extract_silhouette expects BGR-shaped input


def generate_theme(theme: str, out_dir: str):
    colors = THEME_COLORS[theme]
    os.makedirs(out_dir, exist_ok=True)

    white_intensities, black_intensities = [], []

    for shape, glyph in SHAPE_GLYPHS.items():
        white_render = render_glyph(glyph, colors["white_fill"], colors["white_outline"])
        black_render = render_glyph(glyph, colors["black_fill"], colors["black_outline"])

        white_mask = extract_silhouette(white_render)
        black_mask = extract_silhouette(black_render)

        wi = mean_fill_intensity(white_render, white_mask)
        bi = mean_fill_intensity(black_render, black_mask)
        if wi is not None:
            white_intensities.append(wi)
        if bi is not None:
            black_intensities.append(bi)

        # Shape masks from white/black renders should be near-identical
        # (same glyph, same font, same size) — average them into the
        # single canonical shape template we actually match against.
        combined = np.maximum(white_mask, black_mask)  # union guards against 1px AA differences
        cv2.imwrite(os.path.join(out_dir, f"{shape}.png"), combined)

    side_reference = {
        "white_intensity": float(np.mean(white_intensities)),
        "black_intensity": float(np.mean(black_intensities)),
    }
    with open(os.path.join(out_dir, "side_reference.json"), "w") as f:
        json.dump(side_reference, f, indent=2)

    print(f"[{theme}] wrote 6 shape templates + side_reference.json to {out_dir}")
    print(f"[{theme}] side_reference = {side_reference}")


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for theme in THEME_COLORS:
        generate_theme(theme, os.path.join(root, "templates", theme))


if __name__ == "__main__":
    main()
