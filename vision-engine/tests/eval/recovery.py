"""Measure crop and position recovery on a private dev or held-out split."""
import argparse
import csv
import hashlib
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, build_opener
import json

from evaluate import detect_bytes, HTTPException, chess


ROOT = Path(__file__).parent
FIELDS = ["image", "exact_placement", "square_corrections", "missed_flags", "exact_search"]


def image_hashes(folder):
    hashes = set()
    root = folder.resolve()
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if not path.resolve().is_relative_to(root):
            raise ValueError("Evaluation images must stay inside their split")
        with path.open("rb") as handle:
            hashes.add(hashlib.file_digest(handle, "sha256").hexdigest())
    return hashes


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def exact_lookup(api, board):
    query = urlencode({"fen": board.fen(en_passant="fen")})
    with build_opener(NoRedirects).open(f"{api}/api/search?{query}", timeout=15) as response:
        data = json.load(response)
    return "yes" if data["matchType"] == "exact" and data["matches"] else "no"


def evaluate(root, api):
    image_root = (root / "images").resolve()
    with (root / "manifest.csv").open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            path = (image_root / row["image"]).resolve()
            if not path.is_relative_to(image_root):
                raise ValueError("Evaluation images must stay inside their split")
            fields = row["expected_fen"].split()
            if len(fields) not in (1, 6):
                raise ValueError("Expected FEN must have one or six fields")
            board = chess.Board(" ".join(fields))
            if len(fields) == 1 and not board.is_valid():
                board.turn = not board.turn
            if not board.is_valid():
                raise ValueError("Expected board is invalid")
            crop = tuple(int(row[key]) if row.get(key) else None for key in ("x", "y", "width", "height"))
            orientation = row.get("orientation") or None
            if orientation not in (None, "white_bottom", "black_bottom"):
                raise ValueError("Invalid orientation")
            measurement = dict(image=row["image"], exact_placement="no", square_corrections="not measured",
                               missed_flags="not measured", exact_search="not measured")
            try:
                result = detect_bytes(path.read_bytes(), manual_orientation=orientation, crop=crop)
            except HTTPException:
                yield measurement
                continue
            corrections = [square for square in result.squares if square.piece != piece_code(board, square.square)]
            measurement.update(exact_placement="no" if corrections else "yes", square_corrections=len(corrections),
                               missed_flags=sum(not square.needs_review for square in corrections))
            if api and len(fields) == 6:
                measurement["exact_search"] = exact_lookup(api, board)
            yield measurement


def piece_code(board, square):
    piece = board.piece_at(chess.parse_square(square))
    return ("w" if piece.color else "b") + piece.symbol().upper() if piece else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("split", choices=["dev", "held-out"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--api", help="Optional disposable local search API origin")
    parser.add_argument("--output", required=True, type=Path, help="Write a private per-image CSV")
    args = parser.parse_args()
    if args.api:
        url = urlparse(args.api)
        if (url.scheme not in ("http", "https") or url.hostname not in ("localhost", "127.0.0.1", "::1")
                or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment):
            parser.error("--api must be a loopback HTTP(S) origin")
    dev, held = (args.root / name / "images" for name in ("dev", "held-out"))
    try:
        if image_hashes(dev) & image_hashes(held):
            parser.error("The dev and held-out folders share identical image bytes")
        records = list(evaluate(args.root / args.split, args.api.rstrip("/") if args.api else None))
    except (ValueError, OSError) as error:
        parser.error(str(error))
    if not records:
        parser.error("This split needs labeled images")
    with args.output.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(records)
    print(f"{args.split}: evaluated {len(records)} images. Per-image results saved to the private CSV.")


if __name__ == "__main__":
    main()
