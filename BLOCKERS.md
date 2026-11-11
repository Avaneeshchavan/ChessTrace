# Blockers and pending verification

Updated 2026-11-11 after B3.

- **Resolved:** the previous three failing API runs are historical. The default `node --test` suite now passes all 27 tests. The SM-2 harness is fixed; the live search diagnostic is available explicitly as `npm run test:search`.
- **Neon migration pending:** the database became reachable and matches the pre-SM-2 baseline, but lacks the five scheduling columns. The user’s terminal run left a failed baseline record after a connection failure and attempted enum creation. A new read-only diff confirmed the baseline still matches. Follow [docs/MIGRATIONS.md](docs/MIGRATIONS.md), then run its live HTTP test command. The default HTTP integration test uses mocked Prisma persistence.
- **HNSW index discrepancy:** Neon records `0001_manual_vector_index` as applied, but `pg_indexes` has no `idx_position_vector_hnsw`. The migration file is unchanged. The migration guide includes a command to re-run its idempotent SQL before deployment.
- **Local Python executable mismatch:** bare `uvicorn` points to Python 3.12 without OpenCV. `python -m uvicorn app.main:app` uses the dependency-complete Python 3.13 environment and passed the health check. Use a consistent project environment locally.
