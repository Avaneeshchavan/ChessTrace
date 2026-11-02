# ChessTrace Phase 2 — Screenshot to FEN

FastAPI microservice: digital-chessboard screenshot in, standard FEN out.
Feeds directly into Phase 1's Postgres search layer (fenCore hash +
HNSW). See **EXPLANATION.md** for the confidence threshold, theme-support
scoping, FEN-compliance guarantee, and a full worked example — read that
first if you're evaluating this deliverable.

## Layout

```
app/
  main.py                    FastAPI app — POST /parse-screenshot
  schemas.py                 Pydantic response models
  pipeline/
    board_detection.py       Locate the board in an arbitrary screenshot
    grid_slicing.py           8x8 slicing, per-theme label-margin handling
    template_library.py      Silhouette extraction + side classification (shared)
    template_matching.py     Live per-square classification + confidence
    orientation.py           White/Black-at-bottom via coordinate-label OCR
    fen_assembly.py          8x8 grid + orientation -> standard FEN
    fen_validate.py          Strict FEN validation (python-chess, or fallback)
templates/
  chesscom_neo/, lichess_cburnett/   Generated template libraries (6 shapes + side_reference.json each)
scripts/
  generate_templates.py       Builds the template library (READ THE DOCSTRING — synthetic stand-ins, see EXPLANATION.md §0)
  make_synthetic_test_board.py  Builds the worked-example test screenshots
tests/
  test_pipeline.py            End-to-end pipeline test against the worked example
examples/
  synthetic_chesscom_neo.png, synthetic_lichess_cburnett.png
EXPLANATION.md
requirements.txt
```

## Running it

```bash
pip install -r requirements.txt --break-system-packages   # or use a venv
python -m scripts.generate_templates                      # build template library (once)
uvicorn app.main:app --reload
```

```bash
curl -X POST http://localhost:8000/parse-screenshot \
  -F "file=@your_screenshot.png" \
  -F "theme=auto"
```

## Verifying the pipeline without a live server

```bash
python -m scripts.make_synthetic_test_board   # (re)builds examples/*.png
python -m tests.test_pipeline                 # runs board detection -> ... -> FEN validation end to end
```

This environment had no network access, so `requirements.txt` packages
(fastapi, python-chess, pytesseract, etc.) could not be installed or
run here — the OpenCV/NumPy/Pillow-only pipeline stages (board
detection, grid slicing, template matching, FEN assembly) ARE tested and
verified in this sandbox; `app/main.py`'s FastAPI wiring is syntax-
checked (`python -m py_compile`) but not live-request-tested. Standard,
well-trodden FastAPI usage, but worth a smoke test in an environment
with pip access before treating it as production-verified.
