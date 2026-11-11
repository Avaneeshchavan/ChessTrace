# ChessTrace

ChessTrace searches chess positions by exact board state and by structural similarity. It uses a React client, an Express API backed by PostgreSQL with pgvector, and a FastAPI vision service that parses board screenshots.

The 2026-11-11 Neon scratch run measured **1,000 games and 79,855 positions** from the bundled historical PGN. At that size, PostgreSQL execution p95 was **0.500 ms for exact lookup** and **0.449 ms for ANN** across 1,000 sampled lookups. These are database measurements on a temporary corpus, excluding network and API time.

- [Data and capacity](docs/DATA.md): measured storage, recommended corpus size, exact PGN downloads and ingestion commands.
- [Benchmarks](docs/BENCHMARKS.md): latency, recall@10 and methodology.
- [Migration recovery](docs/MIGRATIONS.md): Neon baseline recovery and live vault check.
- [Project status](docs/STATUS.md): current checks and remaining blockers.
