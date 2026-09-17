'use client'

import { useState } from 'react'
import { splitAtFold } from '@/lib/post/measure'

/**
 * What this post will look like in the feed.
 *
 * The one place in the product that uses colours outside the `--lb-*` palette,
 * under a scoped exemption recorded in spec §6.1 (amended 2026-09-17) and
 * `docs/DESIGN-SYSTEM.md`. Every value comes from `var(--li-*)`, declared in
 * one block in `globals.css`; there is no literal colour in this file and no
 * LinkedIn logo or wordmark anywhere — this reproduces a layout, not a brand.
 *
 * The point of the fidelity is the fold. A writer needs to see which of their
 * lines survive above "…see more", because that is all most readers ever see,
 * and a preview in our own calm editorial palette at our own measure would
 * show them a different break point from the real one.
 *
 * The fold is an approximation and the caption says so, because LinkedIn does
 * not publish the numbers and they move with viewport and client. Better a
 * stated guide than a confident wrong answer.
 */
export type LinkedInPreviewProps = {
  text: string
  /** The author's name, as their profile shows it. */
  authorName: string
}

export function LinkedInPreview({ text, authorName }: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const { visible, hidden, folded } = splitAtFold(text)

  const initials =
    authorName
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '—'

  return (
    <div>
      <div className="linkedin-preview overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 px-4 pt-3">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--li-avatar)] text-sm font-semibold text-[var(--li-muted)]"
          >
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{authorName}</span>
            <span className="block truncate text-xs text-[var(--li-muted)]">
              Now
            </span>
          </span>
        </div>

        <div className="px-4 pt-3 pb-3">
          {text.trim().length === 0 ? (
            <p className="text-sm text-[var(--li-muted)]">
              Nothing to preview yet.
            </p>
          ) : (
            <p className="linkedin-preview-body text-sm">
              {expanded ? text : visible}
              {folded && !expanded && (
                <>
                  {'… '}
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="linkedin-preview-more cursor-pointer hover:underline"
                  >
                    see more
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <div
          className="flex items-center gap-4 border-t border-[var(--li-faint)] px-4 py-2 text-xs text-[var(--li-muted)]"
        >
          <span>Like</span>
          <span>Comment</span>
          <span>Repost</span>
          <span>Send</span>
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        {folded ? (
          <>
            {expanded ? 'Showing the whole post. ' : 'Readers see the text above the fold first. '}
            <span aria-hidden="true">·</span>{' '}
          </>
        ) : null}
        LinkedIn does not publish where the fold falls and it shifts with screen size, so treat
        this as a guide rather than an exact line.
        {folded && expanded && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-brand underline-offset-4 hover:underline"
            >
              Collapse it again
            </button>
          </>
        )}
      </p>
      {folded && !expanded && hidden.trim().length > 0 && (
        <p className="sr-only">
          The remainder of the post, hidden behind the see-more link in the preview: {hidden}
        </p>
      )}
    </div>
  )
}
