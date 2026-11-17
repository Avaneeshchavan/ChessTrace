# Private recognition evaluation

Use `dev/images/` for labeled examples you can inspect while developing. Reserve `held-out/images/` for independently captured examples. Freeze that set before any tuning and leave it out of development decisions. Include different sites, themes, viewport sizes and orientations.

Place a private `manifest.csv` in each split. The required fields are `image` (path relative to that split's images directory) and `expected_fen` (piece placement or six fields). Optional `orientation` is a confirmed `white_bottom` or `black_bottom`. Optional pixel coordinates `x,y,width,height` must all be supplied together and describe a confirmed square crop. Leave those fields blank to measure automatic localization and orientation. Record which inputs were supplied when reporting results.

From `vision-engine/`:

```sh
python tests/eval/recovery.py dev --output /tmp/chesstrace-dev.csv
python tests/eval/recovery.py held-out --output /tmp/chesstrace-held-out.csv
python tests/eval/recovery.py held-out --api http://127.0.0.1:5001 --output /tmp/chesstrace-held-out.csv
```

The report includes exact piece placement, square edits and missed review flags. It models a reviewer who compares all predicted squares with the known board and corrects every error, including unflagged squares. It marks square corrections and missed flags as unmeasured when the scan fails. With a disposable loopback API and a six-field label, it also checks whether the corrected known position yields an exact corpus result. Search success depends on that local corpus. The script refuses byte-identical overlap between splits and refuses redirects during corpus lookup. Keep all user images, labels, and per-image output private.

Run `python tests/eval/prepare_recovery_dev.py` to reproduce the four bundled-source synthetic dev inputs. It requires an empty dev split. Use the same `--root` option in both commands to generate and evaluate examples in a separate temporary directory.
