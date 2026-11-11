# ChessTrace MVP standing instructions (M0)

Apply these instructions to every MVP sprint task. ChessTrace uses React and Vite in `client-ui/`, Express and Prisma in `api-server/`, FastAPI and OpenCV in `vision-engine/`, and PostgreSQL with pgvector. B1–B6 were developed on `task/blockers`. The MVP targets Neon Postgres, Render API and vision services, and a Vercel client. A larger self-hosted PostgreSQL instance is a later phase.

1. Use free tiers only. Stop and tell the user if an action would incur a charge. Quote current official provider documentation for every free-tier limit the task relies on.
2. Keep corpus sizing in named `mvp` and `scale` config profiles. This includes maximum ply, minimum rating, occurrence caps, vector subsets, database byte budgets, and ANN subset sizes. Use plain PostgreSQL and pgvector so changing `DATABASE_URL` can move the application between providers.
3. Preserve Prisma migration history by adding new migrations only. Preserve SM-2 logic, Chessground CSS-class square coloring, Stockfish worker assets in `client-ui/public/`, and existing tests.
4. Run Stockfish evaluation only in the browser WASM worker.
5. Keep secrets and real user screenshots out of Git.
6. Label every measurement with its scope. Mark unmeasured results as “not measured.”
7. Capture every UI change at 1280px and 390px.
8. Use one branch per task, keep commits small, and never force-push.

Report files changed, commands and results, evidence, and pending or uncertain work.
