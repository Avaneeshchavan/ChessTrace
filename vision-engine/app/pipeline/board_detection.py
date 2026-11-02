"""
Board detection: locate the chessboard within an arbitrary screenshot.

METHOD
------
1. Grayscale + blur, then adaptive threshold (not a single global Canny
   threshold, since chess.com/Lichess board colors vary and a fixed Canny
   threshold that works on a brown Lichess board can wash out a green
   Chess.com board).
2. `cv2.findContours` on the thresholded image, external contours only.
3. Filter to contours whose bounding box is approximately square
   (0.92 <= w/h <= 1.08) and whose area is at least 15% of the full image
   (rules out small UI icons/avatars that happen to be square).
4. Among survivors, take the largest by area.
5. Return an axis-aligned crop (x, y, w, h). No perspective warp is
   attempted — digital renders are never rotated/skewed the way a photo
   of a physical board would be, so a straight crop is sufficient and a
   full homography would be solving a problem that doesn't exist here.

ASSUMPTIONS THIS RELIES ON (state these to the caller / in docs)
------------------------------------------------------------------
- The board is the single largest approximately-square high-contrast
  region in the frame. This holds for a typical "screenshot the whole
  game page" or "screenshot just the board" capture.
- BREAKS WHEN:
    * The screenshot is so tightly cropped that the board doesn't have a
      clean edge against a differently-colored background (e.g. the crop
      cuts off exactly at the board edge with no surrounding margin —
      there's then no external contour to find, since there's no
      board-to-background transition inside the frame at all). In that
      degenerate case we fall back to treating the ENTIRE image as the
      board (see `_fallback_whole_image`), which is correct if and only
      if the user did crop exactly to the board.
    * A UI element elsewhere on the page is also large and square (e.g. a
      square video/webcam overlay in a streaming screenshot, or a square
      profile picture at high resolution). This is a real failure mode we
      do not fully solve — we mitigate it with the 15%-of-frame-area
      floor, but a large-enough decoy square will still win. This is
      exactly the kind of input this phase is not trying to bulletproof;
      it's flagged as a known limitation in EXPLANATION.md.
    * A second board is visible (e.g. an analysis/eval board next to the
      main board on some sites). We take the largest one, which is
      usually — but not always — the intended one.
    * The eval bar / move-list panel forms its own tall thin contour;
      the aspect-ratio filter excludes it, which is the main reason that
      filter exists.
"""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class BoardBox:
    x: int
    y: int
    w: int
    h: int
    method: str  # "contour_detection" or "fallback_whole_image"


def _fallback_whole_image(image: np.ndarray) -> BoardBox:
    h, w = image.shape[:2]
    return BoardBox(x=0, y=0, w=w, h=h, method="fallback_whole_image")


def detect_board(image: np.ndarray, min_area_fraction: float = 0.15) -> BoardBox:
    """
    image: BGR np.ndarray (as returned by cv2.imdecode)
    Returns the best-guess board bounding box.
    """
    img_h, img_w = image.shape[:2]
    full_area = img_h * img_w

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny + RETR_EXTERNAL rather than a global/adaptive threshold: the
    # board's OUTER edge (board color vs. page background) and its
    # INTERNAL edges (the checkerboard squares themselves, and piece
    # outlines) are often similar contrast, so a plain intensity
    # threshold tends to merge everything into one blob that includes the
    # page background. Canny finds edges regardless of which side is
    # "foreground", and RETR_EXTERNAL then discards every edge nested
    # inside the outermost loop — which is exactly the checkerboard/piece
    # detail we don't want at this stage — leaving just the board's outer
    # boundary.
    edges = cv2.Canny(blurred, 30, 100)
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=1)  # gentler: bridge tiny gaps only,
    # so nearby-but-separate UI elements (e.g. coordinate labels sitting just
    # outside the board) don't get fused into the board's own contour.

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_area = 0.0
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        area = w * h
        if area < min_area_fraction * full_area:
            continue
        aspect = w / float(h) if h else 0
        if not (0.92 <= aspect <= 1.08):
            continue
        if area > best_area:
            best_area = area
            best = (x, y, w, h)

    if best is None:
        return _fallback_whole_image(image)

    x, y, w, h = best
    # The dilation pass above (needed to bridge small gaps into one closed
    # boundary) also fattens that boundary outward by roughly
    # kernel_radius * iterations pixels on every side, so the raw
    # bounding box slightly overshoots the true board edge and would
    # otherwise bleed a sliver of page background into the outermost
    # rank/file's squares once sliced. Shrink back in by that same amount.
    dilate_padding = 2
    x, y = x + dilate_padding, y + dilate_padding
    w, h = max(1, w - 2 * dilate_padding), max(1, h - 2 * dilate_padding)
    # Snap to a perfect square using the smaller dimension, centered,
    # so downstream 8x8 slicing divides evenly without cumulative drift.
    side = min(w, h)
    cx, cy = x + w // 2, y + h // 2
    x2 = max(0, cx - side // 2)
    y2 = max(0, cy - side // 2)
    x2 = min(x2, img_w - side)
    y2 = min(y2, img_h - side)

    return BoardBox(x=x2, y=y2, w=side, h=side, method="contour_detection")
