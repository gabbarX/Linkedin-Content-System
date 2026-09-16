import { redirect } from 'next/navigation'
import { SampleList } from '@/components/onboarding/sample-list'
import { createServerClient } from '@/lib/supabase/server'
import { listWritingSamples } from '@/server/db/repositories/writing-samples'
import { retryDerivation, startOver, submitSamples } from './actions'

/**
 * The writing-samples step (spec §4.1, Task 8).
 *
 * Fetches whatever is already saved for this account and hands it to
 * `SampleList`, which decides from that alone whether to show the paste form
 * or the retry screen: a non-empty list only ever means a previous
 * derivation attempt saved samples and then failed (actions.ts saves before
 * it ever calls the model), so reloading this page mid-failure must not
 * present a blank paste form that would double up the user's samples.
 */
export default async function SamplesPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // (app)/layout.tsx already redirects an unauthenticated request; this is
  // the same defensive re-check the interview page makes, and this page
  // needs user.id regardless to load any existing samples.
  if (!user) redirect('/login')

  const existing = await listWritingSamples(user.id)

  return (
    <SampleList
      initialSamples={existing.map((sample) => ({
        id: sample.id,
        source: sample.source,
      }))}
      submitSamples={submitSamples}
      retryDerivation={retryDerivation}
      startOver={startOver}
    />
  )
}
