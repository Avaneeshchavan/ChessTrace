import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Zero-budget note: stockfish.wasm needs cross-origin isolation
// (COOP/COEP headers) to use SharedArrayBuffer/threads. The multi-threaded
// build falls back to single-threaded automatically if these headers are
// absent, so this is optional but recommended for eval speed even on the
// free Vite dev server and Vercel's free tier (both let you set headers
// via vercel.json / a small dev-server middleware) at no cost.
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: {
    format: 'es',
  },
});
