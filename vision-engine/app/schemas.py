"""
Pydantic models for the /parse-screenshot response.

Design note: the three fields that genuinely cannot be determined from a
single static image (active color, castling availability, en-passant
target) are surfaced as their OWN top-level fields — not just baked into
the fen string — so a frontend can render them as editable controls
(radio buttons, checkboxes) and let the user correct them BEFORE the
corrected fenCore is sent on to Phase 1's search layer. See EXPLANATION.md
section 3.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class SquareResult(BaseModel):
    square: str  # algebraic, e.g. "e4"
    piece: Optional[str] = None  # "wP","bK",... or None for empty
    confidence: float  # 0.0-1.0, best template-match score for this square
    ambiguous_margin: bool = Field(
        False,
        description=(
            "True if the top match beat the runner-up by less than the "
            "configured margin, even if its raw confidence cleared the "
            "absolute threshold. Two visually similar pieces (e.g. a "
            "queen vs. a king silhouette at low resolution) can both "
            "score high; margin catches that case that a bare threshold "
            "would miss."
        ),
    )


class BestEffortFields(BaseModel):
    """The three fields a single static image cannot truly determine."""

    active_color: str = Field(
        ..., description="'w' or 'b'. Always defaulted to 'w' — see EXPLANATION.md."
    )
    active_color_is_default: bool = True

    castling_availability: str = Field(
        ...,
        description=(
            "Best-effort heuristic from king/rook starting-square occupancy. "
            "NOT a certainty — e.g. a rook that has moved and moved back "
            "looks identical to one that never moved."
        ),
    )
    castling_is_heuristic: bool = True

    en_passant_target: str = Field(
        "-", description="Always '-'. A single frame can never justify anything else."
    )
    en_passant_is_default: bool = True


class ParseScreenshotResponse(BaseModel):
    fen: str
    fen_valid: bool
    fen_validation_error: Optional[str] = None

    piece_placement_field: str  # field 1 of the FEN, for convenience

    best_effort_fields: BestEffortFields

    halfmove_clock: int = 0
    fullmove_number: int = 1
    clocks_are_placeholder: bool = Field(
        True,
        description="halfmove/fullmove are always '0 1' placeholders — Phase 1 strips them anyway.",
    )

    theme_used: str  # e.g. "chesscom_neo", "lichess_cburnett", or "unrecognized"
    theme_match_confidence: float
    theme_auto_detected: bool

    orientation: str  # "white_bottom" or "black_bottom"
    orientation_method: str  # "coordinate_label_ocr" or "default_no_labels_found"

    squares: List[SquareResult]  # all 64, in a8..h1 reading order
    low_confidence_squares: List[str]  # algebraic squares needing manual review

    warnings: List[str] = []
