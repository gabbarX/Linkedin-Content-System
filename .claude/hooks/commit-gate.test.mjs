import { describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { normalizeProjectDir } from './commit-gate.mjs'

/**
 * Regression test for the bug that made the commit gate fail inside the hook
 * while the identical command passed in a terminal.
 *
 * Claude Code sets CLAUDE_PROJECT_DIR with a LOWERCASE Windows drive letter
 * ("c:/Users/..."), and the hook passed it straight to spawnSync as cwd.
 * Vitest treats "c:" and "C:" as different module-resolution roots, so the
 * test files and the runner loaded separate copies of vitest's context and
 * every describe() threw "Cannot read properties of undefined (reading
 * 'config')" — a collection failure, not an assertion failure.
 */
describe('normalizeProjectDir', () => {
  it('canonicalises a real directory to its true on-disk casing', () => {
    const cwd = process.cwd()
    expect(normalizeProjectDir(cwd)).toBe(realpathSync.native(cwd))
  })

  it.runIf(process.platform === 'win32')(
    'uppercases a lowercase Windows drive letter',
    () => {
      const lower = process.cwd().replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`)
      expect(lower).toMatch(/^[a-z]:/)
      expect(normalizeProjectDir(lower)).toMatch(/^[A-Z]:/)
    },
  )

  it('returns the input unchanged when the path does not exist', () => {
    const missing = 'Z:/definitely/not/a/real/path/linkbud'
    expect(normalizeProjectDir(missing)).toBe(missing)
  })

  it('never throws on empty or undefined input', () => {
    expect(() => normalizeProjectDir('')).not.toThrow()
    expect(() => normalizeProjectDir(undefined)).not.toThrow()
  })
})
