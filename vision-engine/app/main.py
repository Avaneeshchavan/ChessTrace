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

import os

# Bound decoded image allocation before OpenCV is imported.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(16_000_000))
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
try:
    from python_multipart.exceptions import MultipartParseError
except ImportError:  # older python-multipart releases
    from multipart.exceptions import MultipartParseError
from fastapi.responses import JSONResponse

from app.pipeline.board_detection import detect_board
from app.pipeline.fen_assembly import _algebraic_square, assemble_fen
from app.pipeline.fen_validate import validate_fen
from app.pipeline.grid_slicing import THEME_GRID_CONFIGS, slice_board
from app.pipeline.orientation import detect_orientation
from app.pipeline.template_matching import get_matcher, needs_manual_review
from app.pipeline.sprite_matching import SPRITE_THEMES, classify_board
from app.schemas import BestEffortFields, ParseScreenshotResponse, SquareResult

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

LEGACY_THEMES = list(THEME_GRID_CONFIGS)
SUPPORTED_THEMES = [*SPRITE_THEMES, *LEGACY_THEMES]
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def _run_theme(board_crop, theme):
    if theme in SPRITE_THEMES:
        return classify_board(slice_board(board_crop, theme="chesscom_neo"), theme)
    squares = slice_board(board_crop, theme=theme)
    matcher = get_matcher(theme)
    classified = [[matcher.classify_square(square) for square in row] for row in squares]
    return classified, matcher.theme_match_score([c for row in classified for c in row])


def _pick_theme(board_crop, requested_theme):
    if requested_theme != "auto":
        if requested_theme not in SUPPORTED_THEMES:
            raise HTTPException(400, f"Unsupported theme. Choose from: {SUPPORTED_THEMES + ['auto']}")
        classifications, score = _run_theme(board_crop, requested_theme)
        return requested_theme, classifications, score, False

    tiles = slice_board(board_crop, theme="chesscom_neo")
    candidates = [(theme, *classify_board(tiles, theme)) for theme in SPRITE_THEMES]
    theme, classified, score = max(candidates, key=lambda candidate: candidate[2])
    if score < .38:
        # The two original glyph fixtures remain supported as a fallback.
        legacy = [(name, *_run_theme(board_crop, name)) for name in LEGACY_THEMES]
        name, result, legacy_score = max(legacy, key=lambda candidate: candidate[2])
        # The legacy correlation and sprite reconstruction scores are different
        # scales. Only prefer a clear legacy match over weak sprite evidence.
        if legacy_score >= .72:
            return name, result, legacy_score, True
    return theme, classified, score, True


class MemoryMultipartParser(MultiPartParser):
    # Starlette used max_file_size for the spool threshold in older versions.
    spool_max_size = MAX_UPLOAD_BYTES + 1
    max_file_size = MAX_UPLOAD_BYTES + 1


UPLOAD_DOCS = {"requestBody": {"required": True, "content": {"multipart/form-data": {
    "schema": {"type": "object", "required": ["file"], "properties": {
        "file": {"type": "string", "format": "binary"},
    }},
}}}}


@app.post("/detect", response_model=ParseScreenshotResponse, openapi_extra=UPLOAD_DOCS)
@app.post("/parse-screenshot", response_model=ParseScreenshotResponse, openapi_extra=UPLOAD_DOCS)
async def parse_screenshot(request: Request, theme: str = "auto", manual_orientation: Optional[str] = None):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise HTTPException(415, "Upload a multipart form with one image in the file field.")
    total = 0

    async def bounded_stream():
        nonlocal total
        async for chunk in request.stream():
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise MultiPartException("Image upload exceeds 8 MiB.")
            yield chunk

    try:
        form = await MemoryMultipartParser(request.headers, bounded_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException as error:
        raise HTTPException(413 if total > MAX_UPLOAD_BYTES else 400, str(error)) from error
    except MultipartParseError as error:
        raise HTTPException(400, "Could not parse the multipart image upload.") from error
    try:
        file = form.get("file")
        if not isinstance(file, UploadFile):
            raise HTTPException(400, "An image in the file field is required.")
        raw_bytes = await file.read()
    finally:
        await form.close()

    return await run_in_threadpool(detect_bytes, raw_bytes, theme, manual_orientation)


def detect_bytes(raw_bytes: bytes, theme="auto", manual_orientation=None):
    try:
        image = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR) if raw_bytes else None
    except cv2.error as error:
        raise HTTPException(400, "Could not decode image within the supported size limit.") from error
    if image is None or min(image.shape[:2]) < 64:
        raise HTTPException(400, "Upload a decodable board image at least 64 pixels wide and tall.")
    return analyze_image(image, theme, manual_orientation)


def analyze_image(image: np.ndarray, theme="auto", manual_orientation=None):
    warnings = []

    board_box = detect_board(image)
    if min(board_box.w, board_box.h) < 64:
        raise HTTPException(400, "The detected board is too small. Upload a closer crop.")
    if board_box.method == "fallback_whole_image":
        warnings.append(
            "Could not confidently locate the board via contour detection; "
            "using a centered square crop. Results may be unreliable "
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
                    needs_review=flagged,
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
        squares=sorted(square_results, key=lambda sq: (-int(sq.square[1]), sq.square[0])),
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
