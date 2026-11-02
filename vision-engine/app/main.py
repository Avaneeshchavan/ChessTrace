"""
ChessTrace Phase 2 — screenshot-to-FEN microservice.

    POST /parse-screenshot
        multipart/form-data:
            file: image upload (png/jpg screenshot of a digital chessboard)
            theme: optional, one of "chesscom_neo" | "lichess_cburnett" | "auto" (default "auto")
            manual_orientation: optional, "white_bottom" | "black_bottom" — overrides
                                automatic orientation detection entirely, for the
                                frontend's manual "flip board" toggle (point 4 in the spec)

    Returns ParseScreenshotResponse (see app/schemas.py).

ZERO-RETENTION: the uploaded image is read into memory, decoded, processed,
and discarded when the request completes. Nothing is written to disk and
no image data is logged. This is enforced structurally, not just by
convention: `cv2.imdecode` operates on an in-memory buffer and no file
path ever exists for the upload.
"""

from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.pipeline.board_detection import detect_board
from app.pipeline.fen_assembly import _algebraic_square, assemble_fen
from app.pipeline.fen_validate import validate_fen
from app.pipeline.grid_slicing import THEME_GRID_CONFIGS, slice_board
from app.pipeline.orientation import detect_orientation
from app.pipeline.template_matching import get_matcher, needs_manual_review
from app.schemas import BestEffortFields, ParseScreenshotResponse, SquareResult

import os
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ChessTrace Phase 2 — Screenshot to FEN",
    description="Digital-chessboard-screenshot -> FEN. See EXPLANATION.md for scope and limitations.",
)

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from datetime import datetime

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}

SUPPORTED_THEMES = list(THEME_GRID_CONFIGS.keys())


def _run_theme(board_crop: np.ndarray, theme: str):
    """Slices + classifies board_crop under one theme's config. Returns
    (classifications 8x8, mean_confidence_over_nonempty)."""
    squares_px = slice_board(board_crop, theme=theme)
    matcher = get_matcher(theme)
    classifications = [[matcher.classify_square(squares_px[r][c]) for c in range(8)] for r in range(8)]
    flat = [c for row in classifications for c in row]
    score = matcher.theme_match_score(flat)
    return classifications, score


def _pick_theme(board_crop: np.ndarray, requested_theme: str):
    """
    Returns (theme_name, classifications, score, auto_detected).

    If the caller named a specific supported theme, we use exactly that —
    per the spec, we do not silently guess on/override an explicit
    choice. Only "auto" triggers the try-both-and-compare behavior, and
    even then, if BOTH themes score poorly, we still return the better of
    the two rather than fabricating a third option — the low aggregate
    score itself, surfaced in `theme_match_confidence`, is the caller's
    signal that this screenshot's theme isn't confidently recognized.
    """
    if requested_theme != "auto":
        if requested_theme not in SUPPORTED_THEMES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported theme '{requested_theme}'. Supported: {SUPPORTED_THEMES + ['auto']}",
            )
        classifications, score = _run_theme(board_crop, requested_theme)
        return requested_theme, classifications, score, False

    best_theme, best_classifications, best_score = None, None, -1.0
    for theme in SUPPORTED_THEMES:
        classifications, score = _run_theme(board_crop, theme)
        if score > best_score:
            best_theme, best_classifications, best_score = theme, classifications, score
    return best_theme, best_classifications, best_score, True


@app.post("/parse-screenshot", response_model=ParseScreenshotResponse)
async def parse_screenshot(
    file: UploadFile = File(...),
    theme: str = "auto",
    manual_orientation: Optional[str] = None,
):
    raw_bytes = await file.read()  # in-memory only — never written to disk
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image. Supported: PNG, JPEG.")

    warnings = []

    board_box = detect_board(image)
    if board_box.method == "fallback_whole_image":
        warnings.append(
            "Could not confidently locate the board via contour detection; "
            "treating the entire image as the board. Results may be unreliable "
            "if the screenshot includes significant UI outside the board."
        )
    board_crop = image[board_box.y : board_box.y + board_box.h, board_box.x : board_box.x + board_box.w]

    if manual_orientation in ("white_bottom", "black_bottom"):
        orientation = manual_orientation
        orientation_method = "manual_override"
    else:
        if manual_orientation is not None:
            warnings.append(f"Ignoring invalid manual_orientation='{manual_orientation}'; auto-detecting instead.")
        orientation_result = detect_orientation(board_crop)
        orientation = orientation_result.orientation
        orientation_method = orientation_result.method
        if orientation_method == "default_no_labels_found":
            warnings.append(
                "No coordinate labels were confidently read; defaulted to White-at-bottom. "
                "Use the manual_orientation parameter / flip-board toggle if this is wrong."
            )

    theme_used, classifications, theme_score, theme_auto_detected = _pick_theme(board_crop, theme)
    if theme_score < 0.5:
        warnings.append(
            f"Low average match confidence ({theme_score:.2f}) for theme '{theme_used}'. "
            f"This screenshot may use a theme outside the supported set: {SUPPORTED_THEMES}. "
            "Results should be treated as unreliable."
        )

    piece_grid = [[classifications[r][c].piece for c in range(8)] for r in range(8)]
    assembled = assemble_fen(piece_grid, orientation)
    validation = validate_fen(assembled.fen)

    square_results = []
    low_confidence_squares = []
    for r in range(8):
        for c in range(8):
            cl = classifications[r][c]
            sq_name = _algebraic_square(r, c, orientation)
            flagged = needs_manual_review(cl)
            square_results.append(
                SquareResult(
                    square=sq_name,
                    piece=cl.piece,
                    confidence=round(cl.confidence, 4),
                    ambiguous_margin=cl.ambiguous_margin,
                )
            )
            if flagged:
                low_confidence_squares.append(sq_name)

    response = ParseScreenshotResponse(
        fen=assembled.fen,
        fen_valid=validation.valid,
        fen_validation_error=validation.error,
        piece_placement_field=assembled.piece_placement,
        best_effort_fields=BestEffortFields(
            active_color=assembled.active_color,
            castling_availability=assembled.castling,
            en_passant_target=assembled.en_passant,
        ),
        halfmove_clock=assembled.halfmove,
        fullmove_number=assembled.fullmove,
        theme_used=theme_used,
        theme_match_confidence=round(theme_score, 4),
        theme_auto_detected=theme_auto_detected,
        orientation=orientation,
        orientation_method=orientation_method,
        squares=square_results,
        low_confidence_squares=low_confidence_squares,
        warnings=warnings,
    )
    return response


@app.get("/")
async def root():
    return JSONResponse(
        {
            "service": "ChessTrace Phase 2",
            "endpoint": "POST /parse-screenshot",
            "supported_themes": SUPPORTED_THEMES + ["auto"],
            "docs": "/docs",
        }
    )
