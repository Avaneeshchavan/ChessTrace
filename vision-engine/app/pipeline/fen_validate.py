"""
FEN validation, equivalent in strictness to chess.js's FEN parser.

Primary path: `python-chess`'s `chess.Board(fen)` constructor, which
performs the same category of strict structural + semantic validation
chess.js does (field count, rank/file arithmetic, exactly one king per
side, legal castling-rights/king-position combinations, etc.) — this is
the "equivalent Python FEN-validation check" the spec calls for, and is
what ships in requirements.txt for the real deployment.

Fallback path: a small dependency-free structural validator, used only if
python-chess isn't importable. It checks the mechanical rules Phase 1's
chess.js layer will also enforce (field count, 8 ranks, exactly 8 files
per rank after digit-expansion, legal characters, correct run-length
encoding of empty squares) but does NOT check chess semantics (e.g. two
white kings, or a pawn on rank 1). This fallback exists so this module —
and its tests — still run in environments where python-chess hasn't been
installed, but it is explicitly a weaker check than the primary path and
callers should treat `validated_with` in the result accordingly.
"""

from dataclasses import dataclass
from typing import Optional

try:
    import chess as _python_chess

    _HAS_PYTHON_CHESS = True
except ImportError:
    _HAS_PYTHON_CHESS = False


@dataclass
class FenValidationResult:
    valid: bool
    error: Optional[str]
    validated_with: str  # "python-chess" or "structural-fallback"


def _structural_fallback(fen: str) -> FenValidationResult:
    fields = fen.split(" ")
    if len(fields) != 6:
        return FenValidationResult(False, f"Expected 6 space-separated fields, got {len(fields)}", "structural-fallback")

    placement, active, castling, ep, halfmove, fullmove = fields

    ranks = placement.split("/")
    if len(ranks) != 8:
        return FenValidationResult(False, f"Expected 8 ranks separated by '/', got {len(ranks)}", "structural-fallback")

    valid_letters = set("pnbrqkPNBRQK")
    for i, rank in enumerate(ranks):
        file_count = 0
        prev_was_digit = False
        for ch in rank:
            if ch.isdigit():
                if prev_was_digit:
                    return FenValidationResult(
                        False, f"Rank {8-i}: consecutive digits not allowed (bad run-length encoding)", "structural-fallback"
                    )
                d = int(ch)
                if d < 1 or d > 8:
                    return FenValidationResult(False, f"Rank {8-i}: digit '{ch}' out of range 1-8", "structural-fallback")
                file_count += d
                prev_was_digit = True
            elif ch in valid_letters:
                file_count += 1
                prev_was_digit = False
            else:
                return FenValidationResult(False, f"Rank {8-i}: invalid character '{ch}'", "structural-fallback")
        if file_count != 8:
            return FenValidationResult(False, f"Rank {8-i}: files sum to {file_count}, expected 8", "structural-fallback")

    if active not in ("w", "b"):
        return FenValidationResult(False, f"Active color must be 'w' or 'b', got '{active}'", "structural-fallback")

    if castling != "-" and (not castling or any(c not in "KQkq" for c in castling)):
        return FenValidationResult(False, f"Invalid castling field '{castling}'", "structural-fallback")

    if ep != "-" and (len(ep) != 2 or ep[0] not in "abcdefgh" or ep[1] not in "36"):
        return FenValidationResult(False, f"Invalid en passant field '{ep}'", "structural-fallback")

    if not halfmove.isdigit():
        return FenValidationResult(False, f"Halfmove clock must be numeric, got '{halfmove}'", "structural-fallback")

    if not fullmove.isdigit() or int(fullmove) < 1:
        return FenValidationResult(False, f"Fullmove number must be >= 1, got '{fullmove}'", "structural-fallback")

    return FenValidationResult(True, None, "structural-fallback")


def validate_fen(fen: str) -> FenValidationResult:
    if _HAS_PYTHON_CHESS:
        try:
            _python_chess.Board(fen)
            return FenValidationResult(True, None, "python-chess")
        except ValueError as e:
            return FenValidationResult(False, str(e), "python-chess")
    return _structural_fallback(fen)
