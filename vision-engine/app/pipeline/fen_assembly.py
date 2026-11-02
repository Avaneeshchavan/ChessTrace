"""
FEN assembly: turn an 8x8 grid of classifications + orientation into a
strictly standard FEN string.

FEN FIELD 1 (piece placement) RULES ENFORCED HERE
----------------------------------------------------
- Ranks listed rank 8 first down to rank 1 last, separated by "/".
- Within each rank, files a through h, left to right.
- Consecutive empty squares collapsed into a single digit (e.g. three
  empty squares in a row -> "3", never "111").
- Piece letters: uppercase for White (KQRBNP), lowercase for Black.

ORIENTATION MAPPING
--------------------
`squares` is indexed [row][col] in IMAGE space: row 0 = top of the image,
col 0 = left of the image. This function is the one place that knows how
image space maps to algebraic space, given orientation:

  - white_bottom (standard): image row 0 (top) = rank 8, image row 7
    (bottom) = rank 1. image col 0 (left) = file a, col 7 (right) = file h.
    No reindexing needed — rows already run rank8->rank1 top-to-bottom,
    columns already run a->h left-to-right.
  - black_bottom (board flipped): image row 0 (top) = rank 1 (White's
    back rank now drawn at the top), image row 7 (bottom) = rank 8. The
    board is flipped both vertically AND horizontally versus the
    standard view, so image col 0 (left) = file h, col 7 (right) = file a.
    To get the standard rank8->rank1 / a->h output order we reverse both
    the row order and, within each row, the column order.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

PIECE_TO_FEN_LETTER = {
    "wK": "K", "wQ": "Q", "wR": "R", "wB": "B", "wN": "N", "wP": "P",
    "bK": "k", "bQ": "q", "bR": "r", "bB": "b", "bN": "n", "bP": "p",
}

FILES = "abcdefgh"


def _algebraic_square(row: int, col: int, orientation: str) -> str:
    """Maps an image-space (row,col) to its algebraic square name, given orientation."""
    if orientation == "white_bottom":
        file_idx = col
        rank_num = 8 - row
    elif orientation == "black_bottom":
        file_idx = 7 - col
        rank_num = row + 1
    else:
        raise ValueError(f"Unknown orientation '{orientation}'")
    return f"{FILES[file_idx]}{rank_num}"


def reorder_for_fen(squares: List[List[Optional[str]]], orientation: str) -> List[List[Optional[str]]]:
    """Returns an 8x8 grid reordered so that grid[0] is rank 8 (a..h) and
    grid[7] is rank 1 (a..h), i.e. exactly FEN's field-1 iteration order."""
    if orientation == "white_bottom":
        return [row[:] for row in squares]  # already in the right order
    elif orientation == "black_bottom":
        return [list(reversed(row)) for row in reversed(squares)]
    else:
        raise ValueError(f"Unknown orientation '{orientation}'")


def assemble_piece_placement(squares: List[List[Optional[str]]], orientation: str) -> str:
    """
    squares: 8x8, squares[row][col] in IMAGE space, values are piece codes
    like "wK"/"bP" or None for empty.
    Returns FEN field 1 only (piece placement), e.g.
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    """
    ordered = reorder_for_fen(squares, orientation)

    rank_strings = []
    for rank_row in ordered:
        parts = []
        empty_run = 0
        for cell in rank_row:
            if cell is None:
                empty_run += 1
            else:
                if empty_run:
                    parts.append(str(empty_run))
                    empty_run = 0
                letter = PIECE_TO_FEN_LETTER.get(cell)
                if letter is None:
                    raise ValueError(f"Unrecognized piece code '{cell}'")
                parts.append(letter)
        if empty_run:
            parts.append(str(empty_run))
        rank_strings.append("".join(parts))

    return "/".join(rank_strings)


def heuristic_castling_rights(
    squares: List[List[Optional[str]]], orientation: str
) -> str:
    """
    Best-effort only — labeled as such in the API response. Checks whether
    the king and each rook are still sitting on their standard starting
    squares; if the king has moved, both that side's rights are dropped;
    if a specific rook has moved, only that side is dropped. This CANNOT
    detect a rook/king that moved away and returned to its start square,
    which is the fundamental reason this is a heuristic and not a fact.
    """
    ordered = reorder_for_fen(squares, orientation)  # ordered[0]=rank8 ... ordered[7]=rank1

    def piece_at(rank_num: int, file_letter: str) -> Optional[str]:
        row = 8 - rank_num
        col = FILES.index(file_letter)
        return ordered[row][col]

    rights = ""
    if piece_at(1, "e") == "wK":
        if piece_at(1, "h") == "wR":
            rights += "K"
        if piece_at(1, "a") == "wR":
            rights += "Q"
    if piece_at(8, "e") == "bK":
        if piece_at(8, "h") == "bR":
            rights += "k"
        if piece_at(8, "a") == "bR":
            rights += "q"

    return rights if rights else "-"


@dataclass
class AssembledFen:
    fen: str
    piece_placement: str
    active_color: str
    castling: str
    en_passant: str
    halfmove: int
    fullmove: int


def assemble_fen(squares: List[List[Optional[str]]], orientation: str) -> AssembledFen:
    piece_placement = assemble_piece_placement(squares, orientation)
    active_color = "w"  # always defaulted — see schemas.BestEffortFields
    castling = heuristic_castling_rights(squares, orientation)
    en_passant = "-"  # always defaulted
    halfmove, fullmove = 0, 1  # always placeholders

    fen = f"{piece_placement} {active_color} {castling} {en_passant} {halfmove} {fullmove}"
    return AssembledFen(
        fen=fen,
        piece_placement=piece_placement,
        active_color=active_color,
        castling=castling,
        en_passant=en_passant,
        halfmove=halfmove,
        fullmove=fullmove,
    )
