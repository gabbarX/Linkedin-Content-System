import 'server-only'
import type { BusinessProfile } from '@/server/db/repositories/business-profiles'
import type { VoiceProfile } from '@/server/db/repositories/voice-profiles'

/**
 * The parts of the two onboarding records that every strategy prompt
 * carries, rendered once so the planning call, the four phase calls and
 * the week-briefing call describe the business and the voice identically.
 *
 * The business profile is the interview's own literal answers (spec §4.1),
 * so it is quoted rather than summarised: paraphrasing a coach's offer is
 * how a plan drifts away from what they actually sell. Taboos are rendered
 * as a hard exclusion list, separately, because they are the one thing the
 * model must never be creative with.
 */

function line(label: string, value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? `${label}: ${trimmed}` : null
}

export function describeBusiness(business: BusinessProfile): string {
  const lines = [
    line('Offer (what they sell)', business.offer),
    line('Price band (never mention in content; calibrates proof and CTAs)', business.priceBand),
    line('Ideal client', business.icp),
    line('Transformation (what changes in the client’s business)', business.transformation),
    line('Proof and results', business.proof),
    line('Point of view / contrarian belief', business.pointOfView),
    line('Where a reader should end up (CTA target)', business.ctaTarget),
  ].filter((entry): entry is string => entry !== null)

  return lines.join('\n')
}

export function describeTaboos(business: BusinessProfile): string {
  if (business.taboos.length === 0) return 'Off-limits topics: none declared.'
  return [
    'Off-limits topics — never plan a post that touches any of these, even obliquely:',
    ...business.taboos.map((taboo) => `- ${taboo}`),
  ].join('\n')
}

export function describeVoice(voice: VoiceProfile): string {
  const lines = [
    `Formality: ${voice.formality}`,
    `Point-of-view strength: ${voice.povStrength}`,
    `Humour: ${voice.humourLevel}`,
    `Sentence rhythm: ${voice.sentenceRhythm}`,
    voice.vocabularyMarkers.length > 0
      ? `Words and phrases they reach for: ${voice.vocabularyMarkers.join(', ')}`
      : null,
    voice.openerPatterns.length > 0
      ? `How their posts tend to open: ${voice.openerPatterns.join('; ')}`
      : null,
    voice.closerPatterns.length > 0
      ? `How their posts tend to close: ${voice.closerPatterns.join('; ')}`
      : null,
    voice.bannedPhrases.length > 0
      ? `Phrases they never use: ${voice.bannedPhrases.join(', ')}`
      : null,
  ].filter((entry): entry is string => entry !== null)

  return lines.join('\n')
}
