import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PostEditor } from '@/components/writer/post-editor'
import { WritePostButton } from '@/components/writer/write-post-button'
import { formatIsoDate } from '@/lib/strategy/schedule'
import { FORMAT_META } from '@/lib/strategy/vocabulary'
import { createServerClient } from '@/lib/supabase/server'
import { getPostBySlot } from '@/server/db/repositories/posts'
import { getProfile } from '@/server/db/repositories/profiles'
import { getStrategy } from '@/server/db/repositories/strategies'
import {
  chooseVariant,
  polishDraft,
  regenerateVariants,
  resolvePolishAction,
  saveDraft,
  setReady,
  writePost,
} from '@/server/writer/actions'

/**
 * Write one post (spec §4.4).
 *
 * Inside `(onboarded)`, so auth, onboarding-step and entitlement guards are
 * inherited rather than rewritten — a user without a live subscription never
 * reaches this page, and the actions re-check anyway because a server action is
 * a public HTTP endpoint.
 *
 * `maxDuration` is 300 for the same reason `/strategy` needs it: Next applies
 * the *page's* maxDuration to the server actions invoked from it, and a
 * generation here is four model calls. Milestone 3 measured a six-call strategy
 * build at 141 s with the fallback engaged, so 120 would leave no margin.
 */
export const maxDuration = 300

export default async function WritePostPage({
  params,
}: {
  params: Promise<{ slotId: string }>
}) {
  const { slotId } = await params

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profile, strategy] = await Promise.all([getProfile(user.id), getStrategy(user.id)])
  if (!profile) redirect('/login')

  if (!strategy) {
    return (
      <div>
        <h1 className="font-display text-3xl">Write a post</h1>
        <p className="mt-4 text-text-muted">
          You do not have a strategy yet, so there is nothing to write against.
        </p>
        <div className="mt-6">
          <Button nativeButton={false} render={<Link href="/strategy" />}>
            Go to your strategy
          </Button>
        </div>
      </div>
    )
  }

  // Found inside the user's own strategy, so it is scoped by construction:
  // naming another user's slot id simply finds nothing.
  const slot = strategy.slots.find((candidate) => candidate.id === slotId)
  if (!slot) {
    return (
      <div>
        <h1 className="font-display text-3xl">Write a post</h1>
        <p className="mt-4 text-text-muted">
          That post is not part of your current plan. It may have been replaced when you last
          rebuilt your strategy.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button nativeButton={false} render={<Link href="/calendar" />}>
            See your calendar
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/posts" />}>
            Your drafts
          </Button>
        </div>
      </div>
    )
  }

  const pillarName =
    strategy.pillars.find((pillar) => pillar.id === slot.pillarId)?.name ?? 'Pillar'
  const authorName = profile.fullName?.trim() || profile.email

  const header = (
    <header>
      <p className="text-sm text-text-muted">
        <Link href="/calendar" className="text-brand underline-offset-4 hover:underline">
          Calendar
        </Link>{' '}
        <span aria-hidden="true">/</span> Week {slot.weekIndex}
      </p>
      <h1 className="mt-2 font-display text-3xl">{slot.theme}</h1>
      <p className="mt-2 text-sm text-text-muted">
        <time dateTime={slot.scheduledOn} className="font-medium text-text">
          {formatIsoDate(slot.scheduledOn, { weekday: true })}
        </time>{' '}
        · {pillarName} · {FORMAT_META[slot.format].label}
      </p>
      <p className="mt-3 text-base">{slot.angle}</p>
    </header>
  )

  // Ruling R-M5-12: briefing is a week-level operation that already exists on
  // /strategy and that Milestone 6 automates. A per-slot briefing path here
  // would be a second way to do the same thing, and the two would drift.
  if (slot.status !== 'briefed') {
    return (
      <div>
        {header}
        <div className="mt-8 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-base font-medium">This week isn’t briefed yet</h2>
          <p className="mt-2 text-sm text-text-muted">
            Briefs are written a week at a time, so the posts in a week hang together. Write week{' '}
            {slot.weekIndex}’s briefs first and this post is ready to draft.
          </p>
          <div className="mt-4">
            <Button nativeButton={false} render={<Link href="/strategy" />}>
              Go to your strategy
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const post = await getPostBySlot(user.id, slot.id)

  const brief = (
    <section className="mt-8 rounded-lg border border-border bg-surface p-6">
      <h2 className="text-base font-medium">The brief</h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">Hook</dt>
          <dd className="mt-1">{post ? post.briefHook : slot.hook}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">
            Key points
          </dt>
          <dd className="mt-1">
            <ol className="list-decimal space-y-1 pl-5">
              {(post ? post.briefKeyPoints : slot.keyPoints).map((point, index) => (
                <li key={index}>{point}</li>
              ))}
            </ol>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">
            Proof to lean on
          </dt>
          <dd className="mt-1">
            {(post ? post.briefProof : slot.proofPoint) ??
              'None from the profile fits this post -- do not invent any.'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-text-muted uppercase">
            Call to action
          </dt>
          <dd className="mt-1">{post ? post.briefCta : slot.cta}</dd>
        </div>
      </dl>
    </section>
  )

  if (!post || post.variants.length === 0) {
    return (
      <div>
        {header}
        {brief}
        <div className="mt-8">
          <p className="mb-4 text-sm text-text-muted">
            {post
              ? 'The brief is written and saved. The drafts did not finish last time — writing them again costs nothing you have already paid for.'
              : 'Three drafts, same brief, three different ways in. You pick one and edit it.'}
          </p>
          <WritePostButton slotId={slot.id} writePost={writePost} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {header}
      {brief}
      <PostEditor
        postId={post.id}
        authorName={authorName}
        variants={post.variants}
        initialText={post.finalText ?? ''}
        initialVariantIndex={post.variantIndex}
        initialStatus={post.status}
        pendingPolish={post.polishedText}
        chooseVariant={chooseVariant}
        saveDraft={saveDraft}
        setReady={setReady}
        polishDraft={polishDraft}
        resolvePolish={resolvePolishAction}
        regenerateVariants={regenerateVariants}
      />
    </div>
  )
}
