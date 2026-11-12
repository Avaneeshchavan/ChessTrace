import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { chessTracePwa } from './pwa/build.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chessTracePwa()],
})
