import os
import sys

import cv2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.pipeline.board_detection import detect_board
from app.pipeline.grid_slicing import slice_board
from app.pipeline.orientation import detect_orientation
from app.pipeline.template_matching import get_matcher, needs_manual_review
from app.pipeline.fen_assembly import assemble_fen
from app.pipeline.fen_validate import validate_fen
from scripts.make_synthetic_test_board import EXAMPLE_FEN_PIECE_PLACEMENT_GROUND_TRUTH


def run_pipeline_on_image(path: str, theme: str):
    image = cv2.imread(path)
    assert image is not None, f"could not read {path}"

    board_box = detect_board(image)
    print(f"  board_detection: method={board_box.method} box=({board_box.x},{board_box.y},{board_box.w},{board_box.h}) orig={image.shape}")

    board_crop = image[board_box.y : board_box.y + board_box.h, board_box.x : board_box.x + board_box.w]

    orientation_result = detect_orientation(board_crop)
    print(f"  orientation: {orientation_result.orientation} (method={orientation_result.method})")

    squares_px = slice_board(board_crop, theme=theme)

    matcher = get_matcher(theme)
    classifications = [[matcher.classify_square(squares_px[r][c]) for c in range(8)] for r in range(8)]

    low_conf = []
    piece_grid = []
    for r in range(8):
        row = []
        for c in range(8):
            cl = classifications[r][c]
            row.append(cl.piece)
            from app.pipeline.fen_assembly import _algebraic_square

            sq = _algebraic_square(r, c, orientation_result.orientation)
            if needs_manual_review(cl):
                low_conf.append((sq, cl.piece, round(cl.confidence, 3), cl.ambiguous_margin))
        piece_grid.append(row)

    assembled = assemble_fen(piece_grid, orientation_result.orientation)
    validation = validate_fen(assembled.fen)

    print(f"  piece_placement : {assembled.piece_placement}")
    print(f"  full FEN        : {assembled.fen}")
    print(f"  fen valid       : {validation.valid} (checked with {validation.validated_with}) err={validation.error}")
    print(f"  low_confidence  : {low_conf if low_conf else 'none'}")

    return assembled, validation


if __name__ == "__main__":
    cases = [
        ("examples/synthetic_chesscom_neo.png", "chesscom_neo"),
        ("examples/synthetic_lichess_cburnett.png", "lichess_cburnett"),
    ]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    all_ok = True
    for rel_path, theme in cases:
        print(f"\n=== {theme} : {rel_path} ===")
        assembled, validation = run_pipeline_on_image(os.path.join(root, rel_path), theme)

        matches = assembled.piece_placement == EXAMPLE_FEN_PIECE_PLACEMENT_GROUND_TRUTH
        print(f"  matches ground truth piece placement: {matches}")
        if not matches:
            print(f"    expected: {EXAMPLE_FEN_PIECE_PLACEMENT_GROUND_TRUTH}")
            print(f"    got     : {assembled.piece_placement}")
        all_ok = all_ok and matches and validation.valid

    print("\n" + ("ALL TESTS PASSED" if all_ok else "SOME TESTS FAILED"))
    sys.exit(0 if all_ok else 1)
