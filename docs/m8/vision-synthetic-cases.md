# Vision evaluation: Synthetic

The synthetic set measures rendered boards with known sprites and supplied orientation; it does not establish real screenshot accuracy.

Synthetic settings: seed 3103, board sizes 288, 432, 640 px before slight scaling, JPEG quality 72–94, 5 piece/board pairs.

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
| chesscom_cases/288 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_cases/432 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| chesscom_cases/640 | 9 | 100.00% | 100.00% | 0.00% | 100.00% |
| Overall | 135 | 99.77% | 92.59% | 0.00% | 100.00% |

Per-square includes empty squares. Exact placement compares all 64 squares. Exact full FEN uses only cases with six-field ground truth. A still image cannot establish clocks, en passant, the turn, or historical castling rights.
Review flags marked 122 squares and covered 17 of 20 wrong squares.
Review-flag coverage was 85.00%. Decoded boards needed 20 square corrections. 0 boards produced no prediction and require a new scan or manual entry.

Per-piece accuracy (uppercase White, lowercase Black, dot means empty). Scan failures count as misses.

| Expected | Squares | Correct | Accuracy |
| --- | ---: | ---: | ---: |
| K | 135 | 134 | 99.26% |
| Q | 93 | 90 | 96.77% |
| R | 244 | 240 | 98.36% |
| B | 216 | 212 | 98.15% |
| N | 212 | 211 | 99.53% |
| P | 809 | 802 | 99.13% |
| k | 135 | 135 | 100.00% |
| q | 90 | 90 | 100.00% |
| r | 241 | 241 | 100.00% |
| b | 216 | 216 | 100.00% |
| n | 200 | 200 | 100.00% |
| p | 826 | 826 | 100.00% |
| . | 5223 | 5223 | 100.00% |

Top confusions:

| Expected | Predicted | Count |
| --- | --- | ---: |
| P | . | 7 |
| R | . | 4 |
| B | . | 4 |
| Q | . | 3 |
| N | . | 1 |
| K | . | 1 |

Reproduce from vision-engine/:

    python tests/eval/evaluate.py
