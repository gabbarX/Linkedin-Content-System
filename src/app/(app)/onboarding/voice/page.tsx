import { redirect } from 'next/navigation'
import { VoiceEditor } from '@/components/onboarding/voice-editor'
import {
  EMOJI_POLICY_OPTIONS,
  FORMALITY_OPTIONS,
  HASHTAG_POLICY_OPTIONS,
  HUMOUR_LEVEL_OPTIONS,
  LINE_BREAK_STYLE_OPTIONS,
  POV_STRENGTH_OPTIONS,
  SENTENCE_RHYTHM_OPTIONS,
  type VoiceFormValues,
} from '@/lib/onboarding/voice-edit'
import { isPastStep, routeForStep } from '@/lib/onboarding/steps'
import { createServerClient } from '@/lib/supabase/server'
import { getOnboardingStep } from '@/server/db/repositories/profiles'
import { getVoiceProfile } from '@/server/db/repositories/voice-profiles'
import { continueFromVoice, saveVoice } from './actions'

/**
 * The Voice Profile review screen (Task 9, spec §4.1) -- the last of the
 * three onboarding steps this milestone builds.
 */
export default async function VoicePage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is
  // the same defensive re-check the samples and interview pages make, and
  // this page needs user.id regardless to load the profile.
  if (!user) redirect('/login')

  // I1a: a user who has already finished the voice step must not be able
  // to re-enter it and overwrite their own reviewed profile. This step has
  // no re-derivation control of its own to worry about the way samples
  // does, but the same reentry hole exists here in principle, and closing
  // it uniformly on all three onboarding pages is what makes it a rule
  // rather than a fix for one screen.
  const currentStep = await getOnboardingStep(user.id)
  if (currentStep && isPastStep(currentStep, 'voice')) {
    redirect(routeForStep(currentStep))
  }

  const profile = await getVoiceProfile(user.id)

  // A profile only ever exists once a derivation has run (the samples
  // step's `saveDerivedVoiceProfile` is the only writer that creates the
  // row). Reaching this URL with no profile means the samples step was
  // never finished -- typed in directly, a stale bookmark, the back
  // button after `startOver` cleared everything. There is nothing to
  // review yet, so send the user to the step that produces it rather than
  // rendering a form full of nulls or crashing on one below.
  if (!profile) redirect(routeForStep('samples'))

  const initial: VoiceFormValues = {
    sentenceRhythm: profile.sentenceRhythm,
    lineBreakStyle: profile.lineBreakStyle,
    emojiPolicy: profile.emojiPolicy,
    hashtagPolicy: profile.hashtagPolicy,
    povStrength: profile.povStrength,
    humourLevel: profile.humourLevel,
    formality: profile.formality,
    openerPatterns: profile.openerPatterns,
    closerPatterns: profile.closerPatterns,
    vocabularyMarkers: profile.vocabularyMarkers,
    bannedPhrases: profile.bannedPhrases,
  }

  return (
    <VoiceEditor
      derivedAtLabel={
        profile.derivedAt
          ? profile.derivedAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : null
      }
      measured={{
        avgSentenceLength: profile.avgSentenceLength,
        maxSentenceLength: profile.maxSentenceLength,
        avgParagraphLines: profile.avgParagraphLines,
      }}
      initial={initial}
      options={{
        sentenceRhythm: SENTENCE_RHYTHM_OPTIONS,
        lineBreakStyle: LINE_BREAK_STYLE_OPTIONS,
        emojiPolicy: EMOJI_POLICY_OPTIONS,
        hashtagPolicy: HASHTAG_POLICY_OPTIONS,
        povStrength: POV_STRENGTH_OPTIONS,
        humourLevel: HUMOUR_LEVEL_OPTIONS,
        formality: FORMALITY_OPTIONS,
      }}
      saveVoice={saveVoice}
      continueFromVoice={continueFromVoice}
    />
  )
}
