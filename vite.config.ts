import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE_PATH || '/',
  build: { target: 'es2023', chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
})
