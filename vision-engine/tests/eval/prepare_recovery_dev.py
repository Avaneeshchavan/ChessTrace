"""Generate four public, synthetic dev examples for the crop recovery harness."""
import argparse
import csv
from pathlib import Path

import cv2
import numpy as np

from evaluate import VISION, synthetic_cases
from app.main import locate_bytes

ROOT = Path(__file__).parent / "dev"
SAMPLE_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT.parent, help="Parent of the dev and held-out splits")
    root = parser.parse_args().root / "dev"
    folder = root / "images"
    if (root / "manifest.csv").exists() or any((folder / name).exists() for name in
                                              ("clean.png", "cropped.png", "flipped.jpg", "fallback.png")):
        parser.error("Use an empty dev split for generated examples")
    folder.mkdir(parents=True, exist_ok=True)
    sample = (VISION.parent / "client-ui/public/product/guided-e4.png").read_bytes()
    located = locate_bytes(sample)["crop"]
    x, y, size = (located[key] for key in ("x", "y", "size"))
    image = cv2.imdecode(np.frombuffer(sample, dtype=np.uint8), cv2.IMREAD_COLOR)
    cropped = image[y:y + size, x:x + size]
    cv2.imwrite(str(folder / "cropped.png"), cropped)
    (folder / "clean.png").write_bytes(sample)

    flipped = next(case for case in synthetic_cases(2, True) if case[3] == "black_bottom")
    _, board, data, orientation, _ = flipped
    (folder / "flipped.jpg").write_bytes(data)

    # The board occupies less than 15% of this frame so the detector proposes a centered crop.
    fallback = np.full((size * 3, size * 4, 3), 30, np.uint8)
    y2, x2 = size, size // 2
    fallback[y2:y2 + size, x2:x2 + size] = cropped
    cv2.imwrite(str(folder / "fallback.png"), fallback)

    with (root / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(("image", "expected_fen", "orientation", "x", "y", "width", "height"))
        writer.writerows([
            ("clean.png", SAMPLE_FEN, "", x, y, size, size),
            ("cropped.png", SAMPLE_FEN, "", 0, 0, size, size),
            ("flipped.jpg", board.fen(en_passant="fen"), orientation, "", "", "", ""),
            ("fallback.png", SAMPLE_FEN, "", x2, y2, size, size),
        ])


if __name__ == "__main__":
    main()
