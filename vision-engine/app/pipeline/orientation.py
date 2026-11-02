"""
Orientation detection: White-at-bottom (normal) vs. Black-at-bottom (flipped).

METHOD
------
Per the spec, this must come from VISIBLE COORDINATE LABELS, not from
guessing off piece positions (a guess-from-pieces heuristic would silently
misfire on any non-standard position, which is exactly the kind of
starting-position-shaped material this tool exists to digitize).

We crop the thin strip along the bottom edge of the detected board (where
both Chess.com and Lichess draw the file labels 'a'-'h', either overlaid
on the board's bottom-rank squares or in the outside margin — either way
it's the bottom edge) and OCR it with pytesseract, restricted to a
single-character whitelist (a-h, 1-8) to keep the OCR fast and cut down
on garbage misreads from anti-aliased small text.

  - If the leftmost recognized character on the bottom edge is 'a' (and,
    as a cross-check, the rightmost is 'h') -> files run a..h left to
    right -> White-at-bottom (standard orientation).
  - If the leftmost is 'h' -> files run h..a left to right -> flipped ->
    Black-at-bottom.
  - If OCR finds nothing confident, or pytesseract/tesseract isn't
    available in the environment, we DEFAULT to White-at-bottom and
    report `orientation_method = "default_no_labels_found"` so the API
    response can expose a manual "flip board" toggle rather than
    silently committing to a guess. This satisfies the spec's requirement
    to default + expose a manual override, rather than inferring
    orientation from piece layout.
"""

from dataclasses import dataclass

import cv2
import numpy as np

try:
    import pytesseract

    _HAS_TESSERACT = True
except ImportError:
    _HAS_TESSERACT = False


@dataclass
class OrientationResult:
    orientation: str  # "white_bottom" or "black_bottom"
    method: str  # "coordinate_label_ocr" or "default_no_labels_found"


def detect_orientation(board_img: np.ndarray, label_strip_fraction: float = 0.06) -> OrientationResult:
    if not _HAS_TESSERACT:
        return OrientationResult(orientation="white_bottom", method="default_no_labels_found")

    side = board_img.shape[0]
    strip_h = max(8, int(side * label_strip_fraction))
    bottom_strip = board_img[side - strip_h : side, :]

    gray = cv2.cvtColor(bottom_strip, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (gray.shape[1] * 3, gray.shape[0] * 3), interpolation=cv2.INTER_CUBIC)

    config = "--psm 7 -c tessedit_char_whitelist=abcdefgh12345678"
    try:
        data = pytesseract.image_to_data(
            gray, config=config, output_type=pytesseract.Output.DICT
        )
    except Exception:
        return OrientationResult(orientation="white_bottom", method="default_no_labels_found")

    # Collect (x_position, char) pairs for confident single-character reads
    found = []
    for i, text in enumerate(data.get("text", [])):
        text = text.strip()
        if len(text) == 1 and text.isalpha() and text in "abcdefgh":
            conf = float(data["conf"][i]) if data["conf"][i] not in ("-1", -1) else -1.0
            if conf >= 40.0:
                found.append((data["left"][i], text))

    if len(found) < 2:
        return OrientationResult(orientation="white_bottom", method="default_no_labels_found")

    found.sort(key=lambda t: t[0])
    leftmost_char = found[0][1]
    rightmost_char = found[-1][1]

    if leftmost_char == "a" and rightmost_char == "h":
        return OrientationResult(orientation="white_bottom", method="coordinate_label_ocr")
    if leftmost_char == "h" and rightmost_char == "a":
        return OrientationResult(orientation="black_bottom", method="coordinate_label_ocr")

    # Ambiguous/partial read (e.g. only middle labels visible) — don't guess.
    return OrientationResult(orientation="white_bottom", method="default_no_labels_found")
