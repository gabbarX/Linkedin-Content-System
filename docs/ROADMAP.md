# Roadmap

Build order from spec §8. Milestone 0 (`docs/ACCOUNTS.md`) runs in parallel from day one; Milestone 1, the foundation, is complete.

Each milestone gets its own implementation plan written in `docs/superpowers/plans/` **when it starts**, not before. Planning a milestone three ahead produces a plan that is wrong by the time it is used — the previous milestone always teaches something that changes it.

One milestone at a time, on its own branch, merged only when `npm run verify` passes.

---

## Blocked on Community Management API approval

**Milestone 10 is entirely blocked.** Nothing in it can be started, prototyped or stubbed until LinkedIn approves the CMA application filed in Milestone 0 step 6. The reported turnaround is 3–4 months with no SLA, and a rejection requires a brand-new app rather than a re-application — see `docs/LINKEDIN-COMPLIANCE.md`.

Three earlier milestones ship a deliberately reduced version and gain capability on approval, but none of them are blocked:

- **Milestone 6** ships `ShareOnLinkedInAdapter` (text-only). `CommunityManagementAdapter` drops into the same interface later.
- **Milestone 7** measures outcomes with our own click data and self-reported results, which need no LinkedIn API at all. `LINK_CLICKS` from LinkedIn corroborates it post-approval.
- **Milestone 9** synthesises learnings from signals we own. Performance-weighted exemplars wait for Milestone 10.

If approval never arrives, everything through Milestone 9 still ships and the product still works. That is the point of the design.

---

## Milestone 2 — Onboarding

- Guided interview capturing the offer and price band, ICP, transformation sold, proof and results, POV and contrarian beliefs, taboo topics, CTA destination, cadence (3–5/week, default 3), preferred posting time and timezone.
- Paste flow for 5–10 real posts, or 2 written samples for someone starting fresh, with derived format metadata stored for later exemplar matching.
- `deriveVoiceProfile` and `deriveBusinessProfile` producing two durable records.
- Both records fully user-editable, because when output feels wrong the user needs a dial to turn.

*Plan written when this milestone starts.*

## Milestone 3 — Strategy

- 4–5 content pillars and a 12-week narrative arc: authority → problem-aware → offer-aware → invitation.
- All 36–60 dated slots laid out at once at the chosen cadence, each with pillar, theme, angle, format and a one-line brief.
- Calendar view of the twelve weeks — one click from the dashboard, not the front door.
- Only the next week is drafted in full; later weeks stay open to revision from trends and learnings.

*Plan written when this milestone starts.*

## Milestone 4 — Paywall

- Stripe subscription at $49/month, 14-day trial, card required.
- Gate positioned after the strategy is delivered and before any post is generated or LinkedIn is connected.
- Webhook endpoint and trial state machine: trialing → active → past_due → canceled.
- `trial_reminder` emails through Resend.

TDD-mandatory: every state transition here moves real money.

*Plan written when this milestone starts.*

## Milestone 5 — Writer

- Four-stage pipeline: brief → three parallel variants from one shared brief → user selection → optional polish pass.
- Editor with a LinkedIn-accurate preview, with the two unchosen variants visible alongside so lines can be copied across by hand.
- Gateway wiring (built early, in Milestone 2), with provider-appropriate prompt caching so the Voice Profile context is not re-billed on every variant.
- Preference signals recorded: chosen variant index, cross-copied text, and the draft-to-published diff.

*Plan written when this milestone starts.*

## Milestone 6 — Jobs and Publisher

- `jobs` table, Vercel Cron worker on a 5-minute tick, `SELECT ... FOR UPDATE SKIP LOCKED` claiming, attempt counts and exponential backoff.
- `LinkedInAdapter` interface and `ShareOnLinkedInAdapter`: OAuth connect, token refresh, `publishText` with an idempotency key, `capabilities()` reporting analytics and documents as unavailable.
- Approve-then-publish: the tap is the trigger, always. `approval_nudge` jobs fire at the right minute in the user's timezone.
- `purge_linkedin_content` job enforcing the 48-hour rule from day one, not retrofitted.

TDD-mandatory throughout. A retry that double-posts to a customer's feed is the worst bug this product can have.

*Plan written when this milestone starts.*

## Milestone 7 — Attribution

- Short-link service on the dedicated short domain: slug generation, resolution, redirect.
- Click log with timestamp, referrer and hashed user agent, with deduplication.
- CTA rewriting at publish time so every published post carries a tracked link.
- Three-days-after prompt: "Did this post start a conversation?" — no / a DM / a call booked / a client signed.

TDD-mandatory: link resolution, click counting and deduplication.

*Plan written when this milestone starts.*

## Milestone 8 — Radar

- Daily job building search queries from the user's niche and pillars.
- Exa behind a `SearchProvider` interface, so the vendor can change without touching `radar`.
- LLM filter pass scoring relevance and drafting an angle that connects each item to the user's offer.
- Dashboard band showing 5–10 items, each one tap from a draft with the item injected into the brief stage.

*Plan written when this milestone starts.*

## Milestone 9 — Learnings

- Nightly synthesis job reading four signals: chosen variant, draft-to-published diff, click-through rate, self-reported outcomes.
- Named, human-readable learning records with a category, confidence and source signal.
- Every learning visible, editable and deletable by the user — legible learning beats magic learning.
- Active learnings injected into the writer's brief stage, closing the loop.

*Plan written when this milestone starts.*

## Milestone 10 — v2, on CMA approval only

**Blocked. Do not start any part of this before LinkedIn approves the Community Management API application.**

- `CommunityManagementAdapter` dropped in behind the existing `LinkedInAdapter` interface, flipping `capabilities()` to true and enabling `fetchPostAnalytics`.
- Analytics ingest: `poll_analytics` jobs storing numeric metrics only, with LinkedIn-returned social content still purged inside 48 hours.
- Carousel studio — document and multi-image posts, the format this audience actually publishes for educational content.
- Performance-weighted exemplars: the writer's exemplar matching moves from format heuristics to real post performance.

*Plan written when approval lands — and not before, because what LinkedIn actually grants determines what this milestone contains.*

---

## Deliberately not on this roadmap

Agencies and multi-tenancy · carousels before CMA approval · native iOS/Android apps · a built-in CRM · a free tier · credit metering · unattended auto-publish · comment and DM automation · LinkedIn-native trend data · engagement pods · competitor tracking.

Each is an exclusion with a recorded reason in spec §9, not an oversight. Adding one back is a conversation with the human, not a pull request.
