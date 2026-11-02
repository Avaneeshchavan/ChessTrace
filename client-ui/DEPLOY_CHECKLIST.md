# Deployment Verification Checklist

After deploying the services to Render (`api-server`, `vision-engine`) and Vercel (`client-ui`), please perform the following sanity checks:

## 1. WebWorker Initialization
- [ ] Navigate to **Sandbox** or **Turning Points**.
- [ ] Observe the evaluation bar. It should eventually respond and update.
- [ ] If it stays silent, check the browser console for `Uncaught (in promise) Worker is not defined` or 404 errors on `stockfish-worker.js`.

## 2. API Cold Start & Health Check (App)
- [ ] Force-quit or restart the API server on Render, or wait for it to sleep.
- [ ] Hard-refresh the `client-ui` site.
- [ ] You should see the top banner: "Reconnecting to ChessTrace servers…"
- [ ] It should disappear within 30-45 seconds, indicating the server is awake.

## 3. Vision Engine Cold Start & Health Check (Origin Lens)
- [ ] Navigate to the **Origin Lens** page immediately after sleep.
- [ ] The drop zone should be disabled (opaque/grayed out).
- [ ] It should display: "Waking up the vision engine — this can take up to a minute..."
- [ ] Wait up to 60 seconds. It should eventually transition to the active state ("Upload Screenshot").

## 4. Feature Sanity Checks
- [ ] **Origin Lens:** Upload an image and verify that the parsing works correctly.
- [ ] **Pattern Vault & Spaced Repetition:** Ensure you can load the review queue and rate puzzles.
- [ ] **Dashboard:** Verify the heatmap and metrics render correctly.
