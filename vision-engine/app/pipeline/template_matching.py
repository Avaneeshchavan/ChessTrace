"""
Live piece classification for a single cropped square, and theme-level
aggregation used for auto theme selection.

CONFIDENCE THRESHOLD & JUSTIFICATION (see also EXPLANATION.md)
------------------------------------------------------------------
Two independent checks gate whether a square's classification is trusted:

1. ABSOLUTE THRESHOLD (default 0.60 on normalized cross-correlation,
   TM_CCOEFF_NORMED, range [-1,1] clipped to [0,1] for reporting): binary
   silhouettes of the SAME shape at the same size correlate at ~0.9-1.0
   even under moderate JPEG/scale noise, since matchTemplate on two
   binary masks is really just measuring overlap of foreground pixels.
   0.60 is set low enough to tolerate real-world antialiasing and
   compression artifacts around piece edges, but high enough that a
   genuinely wrong shape (e.g. bishop vs. pawn, which share a rounded top
   but differ substantially in body silhouette) reliably scores well
   below it in testing against the synthetic set. This is a placeholder
   default calibrated against synthetic templates only — the worked
   example section in EXPLANATION.md is explicit that recalibration
   against real screenshots is expected before production use.

2. MARGIN CHECK (default 0.08 between best and second-best shape score):
   catches the case where a square is genuinely ambiguous — e.g. a small,
   heavily anti-aliased piece where two shapes both score reasonably
   well. A square can clear the absolute threshold and still fail the
   margin check; either failure adds it to `low_confidence_squares`.

Both constants are named below, not buried in logic, specifically so they
can be tuned from one place once real screenshots are available to
calibrate against.
"""

import json
import os
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

from app.pipeline.template_library import (
    SHAPE_KINDS,
    ThemeSideReference,
    extract_silhouette,
    is_empty_square,
    mean_fill_intensity,
)

ABSOLUTE_CONFIDENCE_THRESHOLD = 0.60
MARGIN_THRESHOLD = 0.08

# Empty-square confidence (1 - std/10, see classify_square) lives on a
# different scale than piece-shape confidence (a normalized cross-
# correlation score) — reusing the 0.60 piece threshold for empties
# flags a large fraction of CORRECTLY identified empty squares (ones with
# a modest-but-sub-threshold std, e.g. faint square-color gradients or
# compression noise) as needing manual review, which is technically safe
# but drowns out the flags that actually matter. This threshold is
# calibrated separately, against the empty-confidence formula specifically.
EMPTY_LOW_CONFIDENCE_THRESHOLD = 0.30

TEMPLATES_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "templates"
)


@dataclass
class SquareClassification:
    piece: Optional[str]  # e.g. "wN", or None for empty
    confidence: float  # 0.0-1.0
    ambiguous_margin: bool
    empty_std: float  # diagnostic: grayscale std used for the empty check


class ThemeMatcher:
    """Loads one theme's shape templates + side reference once, reused per-square."""

    def __init__(self, theme: str):
        self.theme = theme
        theme_dir = os.path.join(TEMPLATES_ROOT, theme)
        if not os.path.isdir(theme_dir):
            raise ValueError(
                f"No template directory for theme '{theme}' at {theme_dir}. "
                f"Run scripts/generate_templates.py first."
            )

        self.shape_templates: Dict[str, np.ndarray] = {}
        for shape in SHAPE_KINDS:
            path = os.path.join(theme_dir, f"{shape}.png")
            mask = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
            if mask is None:
                raise FileNotFoundError(f"Missing template: {path}")
            self.shape_templates[shape] = mask

        ref_path = os.path.join(theme_dir, "side_reference.json")
        with open(ref_path) as f:
            ref = json.load(f)
        self.side_reference = ThemeSideReference(
            white_intensity=ref["white_intensity"], black_intensity=ref["black_intensity"]
        )

    def classify_square(self, square_bgr: np.ndarray) -> SquareClassification:
        empty, std = is_empty_square(square_bgr)
        if empty:
            # Confidence in "this is empty" scales with how far below the
            # threshold the std is — a std near 0 is very confidently
            # empty; a std just under the cutoff is a weaker call.
            conf = float(np.clip(1.0 - (std / 10.0), 0.0, 1.0))
            return SquareClassification(piece=None, confidence=conf, ambiguous_margin=False, empty_std=std)

        silhouette = extract_silhouette(square_bgr)

        scores: Dict[str, float] = {}
        for shape, template in self.shape_templates.items():
            result = cv2.matchTemplate(silhouette, template, cv2.TM_CCOEFF_NORMED)
            scores[shape] = float(result.max())

        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        best_shape, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) > 1 else -1.0

        confidence = float(np.clip(best_score, 0.0, 1.0))
        ambiguous = (best_score - second_score) < MARGIN_THRESHOLD

        fill_intensity = mean_fill_intensity(square_bgr, silhouette)
        side = self.side_reference.classify(fill_intensity) if fill_intensity is not None else "w"

        return SquareClassification(
            piece=f"{side}{best_shape}",
            confidence=confidence,
            ambiguous_margin=ambiguous,
            empty_std=std,
        )

    def theme_match_score(self, classifications) -> float:
        """Mean confidence over non-empty squares only — used to pick a
        theme automatically when the caller doesn't specify one. Empty
        squares are excluded because empty-detection is theme-agnostic
        (pure std check) and would dilute the signal that actually
        distinguishes 'this is chesscom_neo' from 'this is lichess_cburnett'."""
        non_empty = [c.confidence for c in classifications if c.piece is not None]
        if not non_empty:
            return 0.0
        return float(np.mean(non_empty))


def needs_manual_review(classification: "SquareClassification") -> bool:
    """Single source of truth for the low_confidence_squares list — used by
    both the API layer and tests, so the two thresholds above are only
    ever compared against in one place."""
    if classification.piece is None:
        return classification.confidence < EMPTY_LOW_CONFIDENCE_THRESHOLD
    return classification.confidence < ABSOLUTE_CONFIDENCE_THRESHOLD or classification.ambiguous_margin


_MATCHER_CACHE: Dict[str, ThemeMatcher] = {}


def get_matcher(theme: str) -> ThemeMatcher:
    if theme not in _MATCHER_CACHE:
        _MATCHER_CACHE[theme] = ThemeMatcher(theme)
    return _MATCHER_CACHE[theme]
