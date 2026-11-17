# Vision evaluation on 15 real screenshots

The user supplied 15 screenshots of different positions using the Chess.com Cases pieces. Piece placement was transcribed from the visible boards before running the detector. Both runs used the same labels and automatic orientation. The images, names, and reference positions stayed local.

| Measure | Before Cases support | After Cases support |
| --- | ---: | ---: |
| Exact piece placement | 0 of 15 | 15 of 15 |
| Correct squares, including empty squares | 925 of 960 (96.35%) | 960 of 960 (100%) |
| Piece corrections needed | 35 | 0 |
| Squares flagged for review | 195 | 0 |
| Flag coverage of wrong squares | 35 of 35 (100%) | Not applicable (zero wrong squares) |
| Boards the scanner could process | 15 of 15 | 15 of 15 |

| Expected piece | Correct before | Correct after |
| --- | ---: | ---: |
| White rook | 15/28 | 28/28 |
| White knight | 0/12 | 12/12 |
| Black rook | 16/26 | 26/26 |

All other piece types and empty squares scored 100% in both runs. Before the change, the scanner chose Classic, missed the rooks and knights shown above, and misclassified 10 black rooks as pawns. After adding the Cases templates from the bundled assets, the same screenshots needed no corrections.

This is a before-and-after check on the same batch that revealed the missing piece set. Accuracy on other real screenshots and exact six-field FEN were not measured. The labels establish the pieces on each square, and the screenshots alone leave game metadata uncertain.

The [synthetic follow-up](vision-synthetic-cases.md) tested 135 generated boards, including 27 Cases fixtures. All 27 had exact placement. The results for the 108 existing synthetic cases matched the earlier run. Both vision smoke-test scripts passed.

From `vision-engine/` with the private manifest and original local folder:

```sh
python tests/eval/evaluate.py --manifest tests/eval/manifest.csv --images ../test
```
