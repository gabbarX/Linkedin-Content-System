import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `server-only` throws on import outside a React Server Component, so
      // under Vitest -- plain Node -- every module carrying that guard was
      // untestable. Next still resolves the real package at build time, so the
      // client/server boundary it enforces is unaffected.
      'server-only': fileURLToPath(
        new URL('./src/test/server-only-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // Hooks are load-bearing now (the commit gate blocks commits), so they
    // are tested like any other code.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '.claude/hooks/**/*.test.mjs'],
    passWithNoTests: true,
  },
})
