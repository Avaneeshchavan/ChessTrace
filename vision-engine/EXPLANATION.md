# ChessTrace Phase 2 — EXPLANATION.md

Screenshot-to-FEN microservice for digital chessboard renders. This
document covers: the confidence threshold and why it's set where it is,
the theme-support limitation and how it's enforced (not silently
guessed), exactly how output guarantees strict FEN compliance for
chess.js, and a worked example.

---

## 0. Honesty note on the template library (read this first)

This environment has no network access, so the template library was NOT
built from real Chess.com "neo" or Lichess "cburnett" sprite assets.
`scripts/generate_templates.py` generates shape-accurate stand-ins from
Unicode chess glyphs (DejaVu Sans has real glyphs at U+265A-265F),
rendered as solid silhouettes with theme-appropriate fill/outline
contrast. Board detection, grid slicing, orientation detection, FEN
assembly, and FEN validation are all exercised end-to-end and produce a
real, valid, chess.js/python-chess-parseable FEN — but piece-matching
accuracy against REAL screenshots will depend on swapping in templates
cropped from the real site assets, which requires no code changes (see
the docstring at the top of `generate_templates.py` for exactly how).

The worked example in section 4 uses synthetic test images for the same
reason — there was no way to pull a real screenshot in this sandbox.

---

## 1. Confidence threshold: what it is and why

Two independent, separately-named constants gate whether a square's
classification is trusted (`app/pipeline/template_matching.py`):

**Absolute threshold — 0.60** on `cv2.TM_CCOEFF_NORMED` (normalized
cross-correlation, theoretical range [-1, 1], clipped to [0, 1] for
reporting). Matching is done on BINARY SILHOUETTES (see section 2), not
raw pixels, so two silhouettes of the same shape at the same size
correlate near 1.0 even under moderate resize/compression noise; a
genuinely wrong shape scores well below 0.60 in testing. This is a
placeholder calibrated against the synthetic template set — recalibrate
once real assets are in place (the worked example is explicit about
this).

**Margin threshold — 0.08** between the best and second-best shape score.
Catches squares where two shapes both score reasonably well (the
absolute threshold alone would pass these). A square can clear 0.60 and
still fail the margin check; either failure flags it.

**A third, separately-calibrated threshold for empty squares — 0.30.**
Empty-square confidence comes from a grayscale-std check
(`1 - std/10`), which lives on a completely different scale than the
shape-correlation score above. Reusing 0.60 here flagged a large
fraction of correctly-identified empty squares (see
`EMPTY_LOW_CONFIDENCE_THRESHOLD`'s docstring) — a safe failure mode, but
one that drowns the review queue with non-issues. `needs_manual_review()`
in `template_matching.py` is the single place that applies the right
threshold for each case; both the API and the test suite call it rather
than re-implementing the logic.

## 2. Design choice: silhouette matching, not raw-pixel matching

A naive design stores 12 full-color piece crops per theme and
`matchTemplate`s the raw query square against them, needing 24 templates
(light-square and dark-square variants of all 12) since the same piece
looks different depending on the square color underneath it. Instead:

1. **Empty-square check first** — a near-uniform grayscale std means no
   piece, full stop. Cheaper and more reliable than template-matching
   "nothing," and avoids `matchTemplate`'s degenerate behavior on a
   constant-value template.
2. **Background-relative silhouette extraction** — for non-empty
   squares, the square's own corner pixels estimate its background
   color, and any pixel differing from that estimate by more than 25
   gray levels is piece foreground. This produces one binary mask per
   square regardless of whether the underlying square is light or dark.
   (An earlier version used Otsu thresholding instead; it silently
   fails whenever a piece's fill color sits close in brightness to the
   square's background, since Otsu then splits "outline" from
   "background+fill" instead of "background" from "piece." Fixed by
   estimating background directly rather than assuming a bimodal split.)
3. **Shape matching against 6 templates, not 12** — the mask is matched
   against one silhouette template per PIECE KIND (K/Q/R/B/N/P). White
   and black pieces of the same kind are shape-identical; only fill
   color differs.
4. **Side (white/black) resolved separately**, by clustering the masked
   pixels' grayscale values into two groups (k-means, k=2) and taking
   the larger group's mean as the fill color, then comparing against the
   theme's known white/black fill references. Averaging over the WHOLE
   mask (fill + outline together) washes out the signal, since fill and
   outline are deliberately rendered in opposite contrast; an even
   earlier version tried stripping the outline by eroding the mask,
   which for thin shapes (a rook's crenellations) erodes away nearly the
   entire piece and leaves an unrepresentative handful of pixels. The
   k-means approach doesn't depend on shape thinness.

This nets out to exactly what the spec asks for — a best guess across
all 12 piece types plus empty, with a confidence score per square — via
a decomposition that's more robust to the light/dark-square variation
every real screenshot will have.

## 3. Theme-support limitation: explicit, not silently guessed

Supported themes are a named, closed list: `chesscom_neo`,
`lichess_cburnett` (`SUPPORTED_THEMES` in `template_library.py`). The API
accepts `theme=chesscom_neo|lichess_cburnett|auto`:

- **A specific theme is named** → used exactly as given. No fallback, no
  silent substitution.
- **`auto` (default)** → both supported themes are run, and the one with
  the higher mean per-square confidence (over non-empty squares) wins.
  Both results were computed anyway, so `theme_used` and
  `theme_match_confidence` in the response tell the caller which one was
  picked and how confidently.
- **An unsupported theme name** → HTTP 400, not a silent fallback to the
  nearest supported theme.
- **A supported theme that still scores poorly** (both auto candidates
  under 0.5 mean confidence) → the better of the two is still returned
  (there's no third option to fall back to), but a `warnings` entry says
  so explicitly, since this is the situation where results are least
  trustworthy — an unrecognized theme, not just a hard-to-read square.

Chess.com and Lichess also differ in WHERE they draw coordinate labels
(chess.com overlays them inside the corner squares; Lichess draws them
in a margin outside the 8x8 grid), which is why `grid_slicing.py` keeps
a per-theme margin-trim config rather than one global constant — see
that file's docstring for the mechanics, and section 4 below for how
board detection interacts with it.

## 4. Worked example

Synthetic test screenshots (`examples/synthetic_chesscom_neo.png`,
`examples/synthetic_lichess_cburnett.png`) — an 8x8 board embedded in a
larger canvas with page-background margin, so board detection genuinely
exercises contour search rather than being handed a pre-cropped image.
Ground-truth position (not the starting position, so this actually
demonstrates the pipeline):

```
2k2r2/pp3ppp/2n2n2/4p3/3P4/2N2N2/PP3PPP/2K2R2
```

Run via `python -m tests.test_pipeline`:

**chess.com_neo theme — exact match, zero low-confidence squares:**
```
FEN: 2k2r2/pp3ppp/2n2n2/4p3/3P4/2N2N2/PP3PPP/2K2R2 w - - 0 1
fen_valid: True (validated with python-chess's chess.Board() constructor)
```

**lichess_cburnett theme — 62/64 squares exact, both errors self-flagged:**
```
FEN: 2k2r2/pp3ppp/2n2n2/4p3/3P4/2N2N2/NP3PPP/2K2r2 w - - 0 1
fen_valid: True
low_confidence_squares includes: a2 (misread as wN, actually wP), f1 (misread as bR, actually wR)
```

Both of Lichess's two real errors landed in `low_confidence_squares` —
neither was a confident wrong answer. That's the confidence-handling
requirement (point 6 in the spec) working as intended: the system
doesn't know these two squares are wrong, but it correctly knows it
isn't sure about them, which is the honest thing it can offer given
silhouette-only shape matching against synthetic stand-in templates.

To reproduce: `python -m scripts.generate_templates` (builds the
template library), `python -m scripts.make_synthetic_test_board` (builds
the two example screenshots), `python -m tests.test_pipeline` (runs the
full pipeline against both and checks against ground truth).

## 5. Strict FEN compliance for chess.js — how it's guaranteed

- **Piece placement**: assembled rank-by-rank (rank 8 → rank 1), file-by-
  file (a → h) within each rank, by `fen_assembly.py`, which is the only
  place image-space (row, col) gets mapped to algebraic space, keyed off
  detected/overridden orientation. Consecutive empty squares are
  collapsed into a single run-length digit by construction (the assembly
  loop accumulates an `empty_run` counter and only ever emits it as one
  digit) — "111" is not a representable output of this code path.
- **Active color, castling, en passant**: always exactly `w` /
  `KQkq`-subset-or-`-` / `-` per the field grammar; never anything else.
- **Halfmove/fullmove**: always the literal placeholder `0 1`.
- **Final gate**: every assembled FEN is passed through
  `fen_validate.validate_fen()` before being returned. That function
  prefers `python-chess`'s `chess.Board(fen)` constructor — real
  structural + semantic FEN validation (field count, exactly one king
  per side, rank arithmetic, legal castling/king-position combinations),
  the same category of strictness chess.js applies — and only falls back
  to a dependency-free structural-only check if `python-chess` isn't
  importable (documented as strictly weaker in that module's docstring).
  `fen_valid` and `fen_validation_error` are both surfaced in the API
  response, so a malformed FEN is caught and reported by THIS
  microservice, never silently passed downstream to break Phase 1's
  `chess.js` layer.

## 6. Known limitations (beyond the honesty note in section 0)

- **Board detection** (`board_detection.py`) assumes the board is the
  largest approximately-square, high-contrast region in the frame.
  Breaks on: an aggressively-cropped screenshot with no background
  margin around the board (falls back to treating the whole image as
  the board); a large square decoy elsewhere in the frame (e.g. a webcam
  overlay); a second board in frame (takes the largest, not necessarily
  the intended one).
- **Orientation detection** (`orientation.py`) only trusts OCR'd
  coordinate labels (via `pytesseract`, itself a wrapper around the
  system `tesseract` binary — see `requirements.txt`). No labels found,
  or `pytesseract`/`tesseract` unavailable → defaults to White-at-bottom
  and reports `orientation_method="default_no_labels_found"`, which is
  exactly the signal the frontend's manual flip-board toggle should
  listen for.
- **Castling heuristic** (`fen_assembly.heuristic_castling_rights`) can't
  detect a king or rook that moved and returned to its starting square —
  a real limitation of any single-frame heuristic, not just this
  implementation, and labeled `castling_is_heuristic: true` in the
  response for exactly that reason.
- **En passant** is always `-`. A single frame cannot justify anything
  else, per the original spec, and this is not treated as a limitation
  to work around.
