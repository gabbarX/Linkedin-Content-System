import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // Hooks are load-bearing now (the commit gate blocks commits), so they
    // are tested like any other code.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '.claude/hooks/**/*.test.mjs'],
    passWithNoTests: true,
  },
})
