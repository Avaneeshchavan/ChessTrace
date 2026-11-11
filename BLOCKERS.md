# Blockers and pending verification

Updated 2026-11-11 after B4.

- **Resolved:** Neon baseline recovery, SM-2 deploy, and the HNSW index rebuild succeeded. Prisma reports no pending migrations. The live vault HTTP and exact/ANN search smoke tests passed.
- **Local Python:** Use `python -m uvicorn app.main:app` from `vision-engine/` in the dependency-complete environment. The bare executable on this Mac points to a different Python install.
- **Vision evaluation:** B4 is verified with synthetic renders. Real screenshot accuracy remains unmeasured until a local image manifest is supplied. See [VISION_EVAL.md](docs/VISION_EVAL.md).
