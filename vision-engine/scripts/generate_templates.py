"""Build deployable RGBA templates from the bundled piece sets."""
import argparse
from pathlib import Path

import cv2
import numpy as np

from app.pipeline.sprite_matching import ADDITIONAL_PIECE_SETS, CODES, ROOT, SPRITE_THEMES, read_sprite

ASSET_ROOT = Path(__file__).resolve().parents[2] / "chess.com-boards-and-pieces-2.x"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=ASSET_ROOT)
    parser.add_argument("--strips-only", action="store_true")
    args = parser.parse_args()
    for theme, (pieces, _) in SPRITE_THEMES.items():
        if pieces in ADDITIONAL_PIECE_SETS:
            directory = ROOT / "sprite-strips"
            directory.mkdir(parents=True, exist_ok=True)
            sprites = [read_sprite(args.assets / "pieces" / pieces / f"{code.lower()}.png") for code in CODES]
            path = directory / f"{theme}.png"
            if not cv2.imwrite(str(path), np.concatenate(sprites, axis=1), [cv2.IMWRITE_PNG_COMPRESSION, 9]):
                raise OSError(f"Could not write {path}")
            continue
        if args.strips_only:
            continue
        out = ROOT / theme
        out.mkdir(parents=True, exist_ok=True)
        for code in CODES:
            name = f"{code.lower()}.png"
            image = read_sprite(args.assets / "pieces" / pieces / name)
            if not cv2.imwrite(str(out / name), image, [cv2.IMWRITE_PNG_COMPRESSION, 9]):
                raise OSError(f"Could not write {out / name}")
        print(f"{theme}: {len(CODES)} sprites")


if __name__ == "__main__":
    main()
