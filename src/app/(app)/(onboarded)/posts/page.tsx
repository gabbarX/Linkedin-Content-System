import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DeletePost } from '@/components/writer/delete-post'
import { countCharacters } from '@/lib/post/measure'
import { formatIsoDate } from '@/lib/strategy/schedule'
import { FORMAT_META } from '@/lib/strategy/vocabulary'
import { createServerClient } from '@/lib/supabase/server'
import { listPosts, type Post } from '@/server/db/repositories/posts'
import { removePost } from '@/server/writer/actions'

/**
 * Every post the user has written.
 *
 * This page is what makes "we never destroy your words" true rather than
 * merely technically true. When a strategy is regenerated, `replaceStrategy`
 * deletes every slot and `posts.slot_id` is set null rather than cascading
 * (Ruling R-M5-4), so drafts survive — but a draft nobody can find is the same
 * as a deleted one. The second group below is where they live, rendered from
 * the snapshot columns each post carries precisely so it can still say what it
 * was for once its slot is gone.
 *
 * No pagination: a strategy is at most 60 slots and therefore at most 60
 * attached posts, plus whatever has detached. A list that long is fine, and
 * pagination would be machinery for a problem nobody has.
 */

function statusLabel(post: Post): string {
  if (post.status === 'approved') return 'Ready'
  if (post.finalText && post.finalText.trim().length > 0) return 'Draft'
  return 'Not started'
}

function PostRow({ post, href }: { post: Post; href: string | null }) {
  const text = post.finalText?.trim() ?? ''
  const preview = text.length > 0 ? text : post.briefHook

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        {post.slotScheduledOn && (
          <time dateTime={post.slotScheduledOn} className="text-sm font-medium">
            {formatIsoDate(post.slotScheduledOn, { weekday: true })}
          </time>
        )}
        <span className="inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium text-text-muted">
          {FORMAT_META[post.slotFormat].label}
        </span>
        <span
          className={`text-xs font-medium ${
            post.status === 'approved' ? 'text-brand' : 'text-text-muted'
          }`}
        >
          {statusLabel(post)}
        </span>
        {text.length > 0 && (
          <span className="text-xs text-text-muted">
            {countCharacters(text).toLocaleString()} characters
          </span>
        )}
      </div>

      <h3 className="mt-3 text-base font-medium">{post.slotTheme}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-text-muted">{preview}</p>

      {/* A detached post has no editor to open, so the whole text has to be
          readable here or "the writing is kept" would be a false promise.
          Native <details> keeps this a Server Component, the same trick
          slot-card.tsx uses on /calendar. */}
      {text.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-text-muted select-none hover:text-text">
            Read the whole post
          </summary>
          <p className="prose-post mt-3">{text}</p>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {href ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
            {text.length > 0 ? 'Keep editing' : 'Write it'}
          </Button>
        ) : (
          <span className="text-sm text-text-muted">
            Not on your current plan, so there is nowhere to publish it from.
          </span>
        )}
        <DeletePost postId={post.id} title={post.slotTheme} removePost={removePost} />
      </div>
    </article>
  )
}

export default async function PostsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const posts = await listPosts(user.id)
  const attached = posts
    .filter((post) => post.slotId !== null)
    .sort((a, b) => (a.slotScheduledOn ?? '').localeCompare(b.slotScheduledOn ?? ''))
  const detached = posts.filter((post) => post.slotId === null)

  return (
    <div>
      <h1 className="font-display text-3xl">Your posts</h1>
      <p className="mt-2 text-text-muted">
        Everything you have written, and everything waiting to be written.
      </p>

      {posts.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-surface p-8">
          <h2 className="text-base font-medium">Nothing written yet</h2>
          <p className="mt-2 text-sm text-text-muted">
            Your plan has the slots; pick one and write it. Start with whatever is coming up next.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/strategy" />}>
              This week&rsquo;s posts
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/calendar" />}
            >
              See all twelve weeks
            </Button>
          </div>
        </div>
      ) : (
        <>
          {attached.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl">On your current plan</h2>
              <div className="mt-4 grid gap-3">
                {attached.map((post) => (
                  <PostRow key={post.id} post={post} href={`/write/${post.slotId}`} />
                ))}
              </div>
            </section>
          )}

          {detached.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl">
                Not on your current plan{' '}
                <span className="text-base font-normal text-text-muted">({detached.length})</span>
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                You rebuilt your strategy after writing these, so the slots they were for no longer
                exist. The writing is kept — nothing you wrote is ever deleted by rebuilding a
                plan — and you can read it here or copy it out.
              </p>
              <div className="mt-4 grid gap-3">
                {detached.map((post) => (
                  <PostRow key={post.id} post={post} href={null} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
