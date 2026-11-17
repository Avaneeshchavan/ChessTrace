# Release process

1. Open a PR into `main` and wait for client, API, vision and release-gate checks. The release gate builds the client and checks SPA rewrites, the Stockfish binary and headers, and the scan fixture offline. GitHub says Actions is “free for public repositories using standard GitHub-hosted runners.” The workflow guards these jobs on public visibility and uses standard runners. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
2. Build the reviewed commit in the existing Vercel projects. Keep public aliases on the current deployment while verifying the candidate. Use matching frontend and API preview origins, and allow the exact frontend origin in the preview API and scanner CORS configuration. Use an authenticated preview session when protected. Keep preview credentials out of logs and Git.
3. Run the read-only smoke check from the repository root against the candidate origins. It checks deep links, WASM headers, health, CORS, search, replay and a synthetic screenshot. Account and vault writes are outside the read-only run. If preview protection prevents a check, record which check is blocked and verify it through an authenticated preview before promotion.

   ```sh
   VERIFY_READ_ONLY=1 API_URL=https://api.example.invalid \
     VISION_URL=https://vision.example.invalid \
     node scripts/verify-deploy.mjs https://client.example.invalid
   ```

4. Record the previous Vercel deployment IDs and live Render commit. If an additive migration is in scope, verify it on scratch first and review the SQL before touching production. Deploy compatible API changes before the client. Promote the tested Vercel deployments, then rerun the read-only check with public origins. Render stays manual. Deploy the reviewed SHA when vision code changes and verify the public scanner.
5. If the release fails, restore the last verified Vercel deployments and use Render rollback to the prior known-good commit if needed. Restore the client before the API if the new client depends on new API behavior. Keep additive schema changes in place for compatible code rollback. Record the verified public commit and the rollback targets in the release record.

[Promoting Vercel deployments](https://vercel.com/docs/deployments/promoting-a-deployment) · [Render deploys and rollback](https://render.com/docs/deploys)
