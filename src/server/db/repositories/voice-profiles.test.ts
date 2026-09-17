import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DerivedVoiceProfile } from './voice-profiles'

/**
 * I1b: `saveDerivedVoiceProfile` must refuse to overwrite a profile the
 * user has already edited, unless the caller explicitly opts in. Mocks
 * `../client` (the Prisma gateway) the same way `src/server/llm/client.test.ts`
 * mocks `@/lib/env.server` -- there is no database in this test environment
 * (`environment: 'node'`, no live Postgres), and repository modules have no
 * existing integration-test pattern to follow instead.
 */

const findUnique = vi.fn()
const upsert = vi.fn()

const getPrisma = vi.fn(() => ({
  voice_profiles: { findUnique, upsert },
}))

vi.mock('../client', () => ({ getPrisma }))

const { saveDerivedVoiceProfile, VoiceProfileEditedError } = await import('./voice-profiles')

function derivedProfile(): DerivedVoiceProfile {
  return {
    avgSentenceLength: 12,
    maxSentenceLength: 24,
    avgParagraphLines: 2,
    sentenceRhythm: 'varied',
    lineBreakStyle: 'grouped',
    emojiPolicy: 'sparing',
    hashtagPolicy: 'none',
    povStrength: 'balanced',
    humourLevel: 'dry',
    formality: 'conversational',
    openerPatterns: ['Here is the thing:'],
    closerPatterns: ['What would you do?'],
    vocabularyMarkers: ['playbook'],
    bannedPhrases: ['circle back'],
  }
}

function fakeRow(overrides: Partial<{ user_edited: boolean }> = {}) {
  return {
    user_id: 'user-1',
    avg_sentence_length: { toNumber: () => 12 },
    max_sentence_length: 24,
    avg_paragraph_lines: { toNumber: () => 2 },
    sentence_rhythm: 'varied',
    line_break_style: 'grouped',
    emoji_policy: 'sparing',
    hashtag_policy: 'none',
    pov_strength: 'balanced',
    humour_level: 'dry',
    formality: 'conversational',
    opener_patterns: ['Here is the thing:'],
    closer_patterns: ['What would you do?'],
    vocabulary_markers: ['playbook'],
    banned_phrases: ['circle back'],
    derived_at: new Date('2026-01-01T00:00:00Z'),
    user_edited: overrides.user_edited ?? false,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('saveDerivedVoiceProfile', () => {
  it('refuses to overwrite a profile the user has already edited', async () => {
    findUnique.mockResolvedValue({ user_edited: true })

    await expect(saveDerivedVoiceProfile('user-1', derivedProfile())).rejects.toBeInstanceOf(
      VoiceProfileEditedError,
    )
    expect(upsert).not.toHaveBeenCalled()
  })

  it('writes when the existing profile has not been edited', async () => {
    findUnique.mockResolvedValue({ user_edited: false })
    upsert.mockResolvedValue(fakeRow({ user_edited: false }))

    const result = await saveDerivedVoiceProfile('user-1', derivedProfile())

    expect(result.humourLevel).toBe('dry')
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('writes when no profile exists yet', async () => {
    findUnique.mockResolvedValue(null)
    upsert.mockResolvedValue(fakeRow())

    await expect(saveDerivedVoiceProfile('user-1', derivedProfile())).resolves.toBeTruthy()
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('overwrites an edited profile when the caller explicitly opts in', async () => {
    upsert.mockResolvedValue(fakeRow({ user_edited: true }))

    const result = await saveDerivedVoiceProfile('user-1', derivedProfile(), {
      overwriteUserEdited: true,
    })

    // The opt-in skips the existing-profile check entirely -- there is
    // nothing to decline on, so it never even looks.
    expect(findUnique).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(result.humourLevel).toBe('dry')
  })
})
