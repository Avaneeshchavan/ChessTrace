"""Evaluate real CSV fixtures or deterministic, in-memory synthetic screenshots."""
import argparse
from collections import Counter, defaultdict
import csv
from pathlib import Path
import random
import sys

VISION = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(VISION))
from app.main import detect_bytes
from app.pipeline.sprite_matching import SPRITE_THEMES, premultiplied, read_sprite
import chess
import cv2
import numpy as np

ASSETS = VISION.parent / "chess.com-boards-and-pieces-2.x"
SIZES = (288, 432, 640)
SEED = 3103


def make_position(rng):
    while True:
        board = chess.Board()
        for _ in range(rng.randint(12, 96)):
            if board.is_game_over():
                break
            board.push(rng.choice(list(board.legal_moves)))
        if not board.is_game_over():
            return board


def synthetic_cases(per_size):
    rng = random.Random(SEED)
    for theme, (piece_set, board_set) in SPRITE_THEMES.items():
        texture = cv2.imread(str(ASSETS / "boards" / f"{board_set}.png"))
        if texture is None:
            raise FileNotFoundError(f"Missing board texture {board_set}")
        for side in SIZES:
            cell = side // 8
            sprites = {}
            for symbol in "KQRBNPkqrbnp":
                prefix = "w" if symbol.isupper() else "b"
                sprite = read_sprite(ASSETS / "pieces" / piece_set / f"{prefix}{symbol.lower()}.png")
                sprites[symbol] = premultiplied(sprite, cell)
            for i in range(per_size):
                board = make_position(rng)
                flipped = i % 2 == 1
                image = cv2.resize(texture, (side, side), interpolation=cv2.INTER_AREA)
                for square, piece in board.piece_map().items():
                    row, col = 7 - chess.square_rank(square), chess.square_file(square)
                    if flipped:
                        row, col = 7 - row, 7 - col
                    tile = image[row*cell:(row+1)*cell, col*cell:(col+1)*cell]
                    sprite = sprites[piece.symbol()]
                    scale = rng.uniform(.95, 1.05)
                    mat = cv2.getRotationMatrix2D(((cell - 1) / 2,) * 2, 0, scale)
                    mat[:, 2] += (rng.uniform(-.6, .6), rng.uniform(-.6, .6))
                    layer = cv2.warpAffine(sprite, mat, (cell, cell))
                    tile[:] = np.clip(layer[..., :3] + tile * (1 - layer[..., 3:4]), 0, 255)
                image = cv2.copyMakeBorder(image, 24, 36, 32, 52, cv2.BORDER_CONSTANT, value=(38, 35, 31))
                factor = rng.uniform(.93, 1.07)
                image = cv2.resize(image, None, fx=factor, fy=factor, interpolation=cv2.INTER_LINEAR)
                ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(72, 94)])
                if not ok:
                    raise ValueError("Could not JPEG encode the synthetic board")
                yield f"{theme}/{side}", board, encoded.tobytes(), "black_bottom" if flipped else "white_bottom"


def real_cases(manifest, image_root):
    root = image_root.resolve()
    with manifest.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            path = (root / row["image"]).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Evaluation images must stay under the image directory")
            orientation = row.get("orientation") or None
            if orientation not in (None, "white_bottom", "black_bottom"):
                raise ValueError(f"Invalid orientation: {orientation}")
            yield "Real CSV", chess.Board(row["expected_fen"]), path.read_bytes(), orientation


def evaluate(cases):
    groups = defaultdict(Counter)
    errors = Counter()
    for label, board, data, orientation in cases:
        expected = {chess.square_name(key): piece.symbol() for key, piece in board.piece_map().items()}
        result = detect_bytes(data, manual_orientation=orientation)
        stats = Counter(boards=1, placements=int(result.piece_placement_field == board.board_fen()),
                        full=int(result.fen == board.fen(en_passant="fen")), valid=int(result.fen_valid))
        for square in result.squares:
            symbol = square.piece
            actual = (symbol[1] if symbol[0] == "w" else symbol[1].lower()) if symbol else "."
            target = expected.get(square.square, ".")
            stats["correct"] += int(actual == target)
            stats["flagged"] += int(square.needs_review)
            if actual != target:
                errors[(target, actual)] += 1
                stats["flagged_errors"] += int(square.needs_review)
        groups[label].update(stats)
    if not groups:
        raise ValueError("No evaluation cases found")
    return groups, errors


def report(groups, errors, synthetic):
    total = sum(groups.values(), Counter())
    pct = lambda n, d: f"{100*n/d:.2f}%" if d else "—"
    header = "Synthetic" if synthetic else "Real CSV"
    lines = [
        f"# Vision evaluation: {header}", "",
        "The synthetic set measures rendered boards with known sprites and supplied orientation; it does not establish real screenshot accuracy."
        if synthetic else "Real results describe only the images in the supplied manifest.",
        "",
        f"Synthetic settings: seed {SEED}, board sizes {', '.join(map(str, SIZES))} px before slight scaling, JPEG quality 72–94, four piece/board pairs."
        if synthetic else "The optional CSV orientation column overrides OCR; omitted values use the normal detection path.",
        "",
        "| Set / board px | Boards | Per-square | Exact placement | Exact full FEN | Valid FEN |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for label, stats in [*groups.items(), ("Overall", total)]:
        n = stats["boards"]
        lines.append(f"| {label} | {n} | {pct(stats['correct'], n*64)} | {pct(stats['placements'], n)} | "
                     f"{pct(stats['full'], n)} | {pct(stats['valid'], n)} |")
    lines += [
        "", "Per-square includes empty squares. Exact placement compares all 64 squares. Exact full FEN compares all six fields to the true game state; a still image cannot recover clocks, en passant, the turn, or historical castling rights.",
        f"Review flags marked {total['flagged']} squares and covered {total['flagged_errors']} of {sum(errors.values())} wrong squares.",
        "", "Top confusions (uppercase White, lowercase Black, dot means empty):", "",
        "| Expected | Predicted | Count |", "| --- | --- | ---: |",
    ]
    lines.extend(f"| {a} | {b} | {n} |" for (a, b), n in errors.most_common(10))
    if not errors:
        lines.append("| — | — | 0 |")
    lines += ["", "Reproduce from vision-engine/:", "",
              "    python tests/eval/evaluate.py --output ../docs/VISION_EVAL.md", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, help="CSV with image, expected_fen and optional orientation")
    parser.add_argument("--images", type=Path, default=Path(__file__).parent / "images")
    parser.add_argument("--per-size", type=int, default=9)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.per_size < 1:
        parser.error("--per-size must be positive")
    cv2.setNumThreads(1)
    cases = real_cases(args.manifest, args.images) if args.manifest else synthetic_cases(args.per_size)
    groups, errors = evaluate(cases)
    markdown = report(groups, errors, synthetic=not args.manifest)
    if args.output:
        args.output.write_text(markdown, encoding="utf-8")
    print(markdown)


if __name__ == "__main__":
    main()
