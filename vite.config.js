import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // server/ には node:test ベースの別のテストスイート（server/test/、npm test で実行）があるため除外する
    exclude: ['**/node_modules/**', 'server/**', 'dist/**'],
  },
})
