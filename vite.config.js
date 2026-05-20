import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Prevent backend/build artifacts from triggering HMR loops
      ignored: [
        '**/dist/**',
        '**/node_modules/**',
        '**/server.js',
        '**/.env',
        '**/.env.*',
        '**/*.log',
      ],
    },
  },
  build: {
    cssMinify: false
  }
})
