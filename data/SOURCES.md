# Corpus sources

| Source | Type and size | Permission and import decision |
| --- | --- | --- |
| [Lichess official broadcasts](https://database.lichess.org/#broadcasts) | Tournament PGN. July 2026 24.5 MB, August 31.0 MB, September 18.4 MB, compressed. | “Broadcast games are released under the Creative Commons Attribution-ShareAlike 4.0 license.” Use first. Filter completed standard games with two qualifying ratings, a GM on one side, broadcast provenance and a clearly classical time control. Skip sources marked online. |
| [Lichess rated Standard exports](https://database.lichess.org/#standard) | Online. September 2026 29.2 GB compressed. | “Database exports are released under the Creative Commons CC0 license.” Candidate for secondary coverage. Select highly rated standard games directly from the official dump. |
| [Lichess Elite Database](https://database.nikonoel.fr/) | Online, monthly ZIP downloads. Archive size not measured. | Do not ingest — needs confirmation. The publisher page did not provide explicit redistribution terms for its curated archives. |
| [Caïssabase](https://caissabase.co.uk/) | Over-the-board master collections. Publisher describes 4.02 million games. | Do not ingest — needs confirmation. The page lists several upstream archives and did not establish redistribution terms for the combined collection. |

The automated filter uses available PGN tags. Missing time controls, ambiguous formats such as `90+30`, and explicit online venues are excluded. A title tag records the published title. Check event schedules before expanding the selection to ambiguous formats.

## Download licensed archives

Run from the repository root. The `data/raw/` directory is ignored by Git. The ingester streams the compressed input, so keep the archives in `.pgn.zst` form.

```sh
mkdir -p data/raw
curl -fL --retry 2 https://database.lichess.org/broadcast/lichess_db_broadcast_2026-08.pgn.zst -o data/raw/lichess_db_broadcast_2026-08.pgn.zst
zstd -t data/raw/lichess_db_broadcast_2026-08.pgn.zst
```

Use the July and September download buttons in the official Broadcasts table and save the files as `data/raw/lichess_db_broadcast_2026-07.pgn.zst` and `data/raw/lichess_db_broadcast_2026-09.pgn.zst`. [Lichess Broadcast exports](https://database.lichess.org/#broadcasts)

## In-app Credits copy

Tournament games are sourced from [Lichess Broadcasts](https://database.lichess.org/#broadcasts) under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). ChessTrace selects eligible games and indexes positions for search. It adjusts PGN comment formatting and quotation marks when needed for replay. Any distributed adaptations of the broadcast game data carry the same license.
