# Vision evaluation: Synthetic

The synthetic set measures rendered boards with known sprites and supplied orientation; it does not establish real screenshot accuracy.

Synthetic settings: seed 3103, board sizes 288, 432, 640 px before slight scaling, JPEG quality 72–94, four piece/board pairs.

| Set / board px | Boards | Per-square | Exact placement | Exact full FEN | Valid FEN |
| --- | ---: | ---: | ---: | ---: | ---: |
| chesscom_classic/288 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_classic/432 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_classic/640 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_neo_wood/288 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_neo_wood/432 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_neo_wood/640 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_neon/288 | 9 | 97.40% | 33.33% | 0.00% | 100.00% |
| chesscom_neon/432 | 9 | 99.65% | 88.89% | 0.00% | 100.00% |
| chesscom_neon/640 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_wood/288 | 9 | 99.48% | 66.67% | 0.00% | 100.00% |
| chesscom_wood/432 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_wood/640 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| Overall | 108 | 99.71% | 90.74% | 0.00% | 100.00% |

Per-square includes empty squares. Exact placement compares all 64 squares. Exact full FEN compares all six fields to the true game state; a still image cannot recover clocks, en passant, the turn, or historical castling rights.
Review flags marked 105 squares and covered 17 of 20 wrong squares.

Top confusions (uppercase White, lowercase Black, dot means empty):

| Expected | Predicted | Count |
| --- | --- | ---: |
| P | . | 7 |
| R | . | 4 |
| B | . | 4 |
| Q | . | 3 |
| N | . | 1 |
| K | . | 1 |

Reproduce from vision-engine/:

    python tests/eval/evaluate.py --output ../docs/VISION_EVAL.md
