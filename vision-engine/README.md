# ChessTrace vision engine

The vision service detects pieces in a digital board screenshot and returns an editable position. The Origin Lens client shows the detected pieces and dashed review flags, then waits for the user to search.

Run from this directory in the Python environment where the dependencies are installed:

```sh
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Use `python -m uvicorn` locally so Uvicorn runs in the same environment as OpenCV. Render installs the requirements in its vision service and runs `uvicorn app.main:app` there.

```sh
curl --fail-with-body 'http://localhost:8000/detect?theme=auto' -F 'file=@your_screenshot.png'
```

`POST /parse-screenshot` remains available as an alias. The multipart upload is limited to 8 MiB including form overhead and is processed in memory. The response includes `fen`, `fen_valid`, and 64 `squares` with algebraic keys, piece codes, match scores, and `needs_review` flags. Scores describe template fit and are not probabilities. Use the optional query parameter `manual_orientation=black_bottom` when OCR cannot infer orientation. Turn, castling, clocks and en passant are best-effort or placeholders.

Auto mode scores the classic, neo_wood, neon and wood sprite sets against the squares' local background colors. The generated templates are checked in under `templates/` so the Render service can load them without reading sibling directories. To regenerate from the bundled assets:

```sh
python -m scripts.generate_templates
```

The original glyph fixture themes remain available for compatibility. See [the classifier notes](EXPLANATION.md) and [measured results](../docs/VISION_EVAL.md).

```sh
python tests/test_pipeline.py
python tests/test_detect.py
python tests/eval/evaluate.py --output ../docs/VISION_EVAL.md
```

Synthetic cases render legal positions in memory and add slight resize and JPEG noise. To evaluate your own images locally, copy `tests/eval/manifest.example.csv` to `tests/eval/manifest.csv`, put the images in `tests/eval/images/`, and fill in each filename and its expected FEN. The optional orientation column accepts `white_bottom` or `black_bottom`; leave it blank to test OCR. Both local inputs are ignored by Git.

```sh
python tests/eval/evaluate.py --manifest tests/eval/manifest.csv
```
