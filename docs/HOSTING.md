# M4 hosting and verification

Use Neon for PostgreSQL, two Render Free web services for the API and image scanner, and Vercel Hobby for the client.

- **Neon Free.** Neon lists “1 GB of storage per project” and “100 CU-hours of compute per project per month.” On Free, the idle compute window is “5 minutes.” [Neon allowances](https://neon.com/blog/neon-free-plan-1-gb-per-project) · [Neon scale to zero](https://neon.com/blog/why-you-want-a-database-that-scales-to-zero)
- **Render Free.** Render “grants 750 Free instance hours to each workspace per calendar month” and says a free service spins down after “15 minutes without receiving any inbound traffic.” Render describes about one minute to wake. The `free` compute plan lists “0.1 CPU” and “512 MB.” Two services share the workspace allowance. Leave both idle between visits and check usage on the Render billing page. Continuous traffic to both exceeds the shared allowance. Render also meters build minutes and outbound bandwidth, which can incur overages with billing enabled. Confirm included usage before deploying. [Render free limits](https://render.com/docs/free) · [Render compute plans](https://render.com/docs/compute-plans)
- **Vercel Hobby.** Vercel restricts Hobby to “non-commercial, personal use only.” For a later commercial rollout, Vercel Pro is the applicable upgrade and is outside this MVP's zero-cost scope. [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- **Monitoring.** UptimeRobot Free offers “50 monitors, 5-minute checks.” Set up an HTTPS monitor for the **Vercel frontend** and point it at the public client URL. Use Render's built-in service health checks and check both backends manually when diagnosing an incident. A five-minute external check against Render keeps a service active because its interval is shorter than the idle timeout, which consumes the shared hours. [UptimeRobot Free](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan) · [Render free limits](https://render.com/docs/free)

## Configure and release

1. Run `npm run corpus:report` and `npx prisma migrate status` from `api-server/` with the intended Neon target. The M3 database already has the compact corpus and HNSW index. Review the target before running `npx prisma migrate deploy` if migrations are pending. The Render build generates the Prisma client. Database migrations are an explicit release step.
2. Create or select the Vercel Hobby project with `client-ui` as the root directory and Node 22. Copy the stable client origin into Render's CORS settings. Both services accept a comma-separated list of full origins. Add preview origins individually if needed. [Vercel project config](https://vercel.com/docs/project-configuration/vercel-json)
3. Apply the Render Blueprint on the release branch. Set the API's `CORS_ORIGIN`, `DATABASE_URL`, and `DIRECT_URL` in Render. Use Neon's pooled URL for `DATABASE_URL` with `connection_limit=2` and the direct URL for `DIRECT_URL`. The API shares one Prisma client. Let Render generate `JWT_SECRET` for a new API service. Preserve the existing secret when updating an established service so existing sessions remain valid. The Blueprint enables compact search. Set the vision service's `ALLOWED_ORIGINS` to the same client origins. The Docker image includes Tesseract for board orientation. [Render Blueprint reference](https://render.com/docs/blueprint-spec) · [Prisma connection pool](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool)
4. Set `VITE_API_BASE_URL` and `VITE_VISION_ENGINE_URL` in Vercel to the two Render HTTPS origins and rebuild. The bundled Vercel config sets SPA fallback and the Stockfish MIME and cache headers. [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
5. Run the verifier from the repository root with Node 22. It creates one synthetic account and one saved puzzle after read-only search and image checks pass. Use `VERIFY_FEN` if the deployment's corpus lacks the default e4 position.

```sh
API_URL=https://api.example.invalid VISION_URL=https://vision.example.invalid \
  node scripts/verify-deploy.mjs https://client.example.invalid
```

## Evidence

The local verifier passed against a disposable PostgreSQL corpus, the Express API, FastAPI vision, and a local static server applying the Vercel route and header rules. It verified both deep links, Stockfish headers, both CORS preflights, register and login, exact and similarity search, screenshot parsing, replay, saving a puzzle, and the due queue.

The verifier also passed with the vision image limited to 0.1 CPU and 512 MiB on local ARM64 Docker. The container's cgroup recorded a peak of 82,055,168 bytes during startup and one synthetic screenshot request. This test supports the two-service layout for light traffic. Concurrent upload load and hosted memory were not measured.

The API exited with an error when started against a disposable schema without search tables. A read-only Neon check confirmed the migration history is up to date and the verifier's default position returns an exact match.

Chrome verified a simulated API wake-up and the responsive banner on the local client at [1280px](m4/cold-start-1280.png) and [390px](m4/cold-start-390.png).

Render and Vercel sign-in is needed to configure the live services. Production verifier output, live 390px capture, hosted peak memory, and real cold-start timing are pending.
