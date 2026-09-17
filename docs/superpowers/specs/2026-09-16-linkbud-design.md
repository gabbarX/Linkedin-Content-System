# LinkBud — Design Spec

**Date:** 2026-09-16
**Status:** Approved
**Owner:** Ankit (solo founder, customer zero)

---

## 1. Product definition

LinkBud is a LinkedIn content system for **solo B2B coaches and consultants**.

It learns the user's business, offer and writing voice; produces a 12-week content strategy; drafts posts in their voice against current trends in their niche; the user approves each post and LinkBud publishes it; and it reports which posts produced clicks and conversations.

**Positioning:** *The only LinkedIn tool that writes toward your actual offer, and shows you which posts booked calls.*

"AI writes your LinkedIn posts" is table stakes in 2026 — Taplio, Supergrow, AuthoredUp, Kleo and EasyGen all claim it. The wedge is **offer-aware strategy** plus **closed-loop attribution**. Both are product differences, not model differences, so a new model release does not erase them.

### 1.1 Ideal customer profile

Solo coach or consultant selling a high-ticket B2B service or program. One person, one LinkedIn profile, no team, no approval chain.

**Explicitly not v1:** agencies managing multiple client profiles, B2B sales teams, company pages. Multi-tenancy is a v2 decision contingent on solo retention, not a day-one assumption.

### 1.2 Pricing

Single SKU: **$49/month**, 14-day trial, card required.

One price means no plan gating, no usage metering, no credit ledger, no proration — an entire billing subsystem skipped. Estimated LLM cost is $2–6/user/month, absorbed with a soft rate limit. No free tier at launch.

**Paywall position:** the user signs up, completes the interview, pastes writing samples, and receives their Voice Profile and full 12-week strategy for free. The card is required before any post is generated and before LinkedIn is connected. They have invested ten minutes and seen real output; LinkBud has spent a few cents on a stranger.

---

## 2. Hard constraints

These derive from LinkedIn's API Terms of Use, User Agreement and platform documentation, verified 2026-09-16. They are not preferences. Any change to this section requires re-verifying the underlying source.

| Constraint | Source | Consequence for the build |
|---|---|---|
| "Use the APIs to automate posting" is prohibited | API ToS §3.1(26) | **Every publish is a user-initiated tap.** No unattended auto-publish, no "set and forget" mode, at any tier. |
| `r_member_social` (read a member's own posts) is closed to new access requests | LinkedIn dev docs | Voice is learned from **user-pasted samples**. LinkBud never fetches a user's posts. |
| Self-serve OIDC returns `sub`, name, email, picture only | Sign In with LinkedIn v2 | Business context comes from the **guided interview**. No headline, About or experience is available. |
| Documents (carousels), multiImage and `memberCreatorPostAnalytics` require Community Management API approval | CMA docs | **v1 is text-only.** Visual studio and the analytics ingest unlock together on CMA approval. |
| Scraping and browser automation are prohibited; remedy is account restriction | User Agreement §8.2(2), §8.2(13) | **No Chrome extension, no session cookies, no headless browser.** A hard architectural boundary, not a trade-off to revisit. |
| Member social activity may be stored for 48 hours | Marketing API Data Storage Requirements | Persist **our own generated content, post URNs and numeric metrics**. Purge LinkedIn-returned social content within 48h via a scheduled job. |
| Apps may not store social-network tokens off-device | Apple App Store 5.1.1(v) | **Web / installable PWA only.** Server-side scheduling is incompatible with a native iOS build under this rule. Native is a separate, later decision. |
| Share on LinkedIn rate limit: 150 req/member/day, 100k/app/day | LinkedIn rate limit docs | Soft per-user publish cap well below 150. Surface remaining quota in the UI. |
| CMA cannot be requested on an app that already holds Share on LinkedIn / OIDC | CMA app review docs | **Two LinkedIn apps.** App A (self-serve, live now), App B (clean, CMA application filed day one). |

### 2.1 Risk accepted

LinkedIn's terms restrict the scheduler category. Sanctioned schedulers (Buffer, Hootsuite, Publer) operate under a Marketing Partner agreement. Until CMA approval lands, LinkBud does not have one. Approve-then-publish is the most defensible posture available — every API call is a human action — but the category risk is real and permanent. This is an accepted business risk, documented so it is never rediscovered as a surprise.

Competitive note: Taplio, Supergrow, AuthoredUp and Kleo are **not** LinkedIn partners and rely on extensions or session authentication. Kleo's in-LinkedIn extension was reportedly withdrawn after a LinkedIn cease-and-desist. LinkBud does not take that path, because the enforcement risk lands on the *customer's* account, not ours.

---

## 3. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript | One language, one repo, one deploy. Claude writes Next.js more reliably than any alternative — for a solo vibecoded project that outweighs framework elegance. |
| UI | Tailwind CSS + shadcn/ui | Composable primitives the design system can be expressed in directly. |
| Data | Supabase Postgres, accessed through **Prisma** | Prisma owns the schema and every query. It connects as the `postgres` role, which has BYPASSRLS. |
| Authorization | **Application-level, in repositories** | *Amended 2026-09-16.* Ownership is enforced by `src/server/db/repositories`, where every function takes an explicit `userId`, guarded by an ESLint rule that blocks importing the raw client elsewhere. |
| Data API | Row-level security, keyed to `auth.uid()` | RLS is retained and must never be dropped: the anon key is public, so RLS is what protects the PostgREST path. It no longer constrains Prisma. |
| Auth | Supabase Auth — **email + password**, magic link, Google | LinkedIn is a *connection*, never the login. See §3.1. Password sign-in added 2026-09-16 — see the amendment below. |
| Hosting | Vercel + Vercel Cron | Cron drives the job engine. No separate worker service. |
| LLM | **Single gateway, two possible providers: Gemini or OpenRouter** | One module, one request shape, one bill. The provider is chosen by which key is set — Gemini first. Provider added 2026-09-17 — see the amendment below. |
| Trends | Exa | Purpose-built for fresh, semantically filtered retrieval, and cheapest at this volume. Accessed through a `SearchProvider` interface so Tavily or Perplexity can be swapped in without touching `radar`. |
| Billing | Stripe | Subscriptions + trial. |
| Email | Resend | Approval nudges, trial reminders. |

*Amended 2026-09-16, on the auth row:* email + password was added as a third
sign-in method. The spec originally named magic link and Google only, on the
reasoning that a password is one more thing for a solo coach to lose.

What changed is that both original methods proved to have a hard external
dependency. The magic link needs Supabase's email templates pointed at
`/auth/confirm`, which is a dashboard change no code can make; Google needs an
OAuth client configured. Until one of those is done there is no way into the
product at all — not for a customer, and not for the person building it. An
authentication design whose every path depends on configuration outside the
repository cannot be the only design.

Password sign-in has no such dependency: `scripts/seed-dev-user.mjs` creates a
confirmed account and sets a password through the admin API, and sign-in is a
single call. It is also what most people expect.

This is recorded as a real product decision, not a development shortcut — the
previous shortcut, a development-only bypass route, was deleted precisely
because scaffolding that only works on one machine proves nothing about the
product. Whether password sign-in is *offered prominently* at launch is a
separate question, deliberately left open; the mechanism exists either way.

*Amended 2026-09-16, after Milestone 1:* this row read "Next.js 15" when the spec was approved. `create-next-app` scaffolded **16.3.5** at build time, which is what the branch ships; the version is recorded here so the spec and the code agree.

### 3.1 Why LinkedIn is not the login

LinkedIn access tokens expire (~60 days) and members can revoke them at any time. If LinkedIn were the identity provider, a revoked grant would lock a paying customer out of their own strategy and drafts. Instead: Supabase Auth owns identity; the LinkedIn connection is a disconnectable, re-authorisable integration. This also lets onboarding deliver value *before* the user is asked to authorise anything.

### 3.2 Embeddings

OpenRouter does not serve embeddings. Exemplar matching in v1 uses **format and structure heuristics** (post length band, opener type, list vs narrative, paragraph count) rather than vector similarity. If semantic matching proves necessary, a dedicated embeddings key is added behind the same `llm` module interface. (Gemini, added as a provider on 2026-09-17, does serve embeddings — so if that key is the one configured, Milestone 8 has the option without a third service. The v1 decision stands until heuristics are measured and found wanting.)

---

## 4. Modules

Eight modules. Each has one purpose, a defined interface, and can be understood and tested without reading the others.

### 4.1 `onboarding`

**Input:** a guided interview plus 5–10 pasted posts (or 2 written samples if the user is starting fresh).

**Interview covers:** the offer and its price band, ICP, the transformation sold, proof and results, point of view and contrarian beliefs, topics they refuse to post about, target CTA destination, posting cadence (3–5/week) and preferred posting times, and timezone.

Timezone and cadence are captured here because the job engine cannot schedule an approval nudge without them, and asking later means a broken first week.

**Output — two durable, user-editable records:**

- **Business Profile** — offer, ICP, transformation, proof points, POV, taboos, CTA target.
- **Voice Profile** — structured fields: sentence rhythm, average and max sentence length, line-break habits, opener patterns, closer patterns, vocabulary markers, emoji policy, hashtag policy, banned phrases, POV strength, humour level, formality.

Editability is the point. When output feels wrong, the user has a dial to turn, and we have a debuggable artifact rather than a black box.

**Interface:** `deriveVoiceProfile(samples) -> VoiceProfile`, `deriveBusinessProfile(interview) -> BusinessProfile`

### 4.2 `strategy`

Generates 4–5 content pillars and a 12-week narrative arc: authority → problem-aware → offer-aware → invitation.

Lays out **the whole 12 weeks at once**. The user picks a posting cadence during onboarding (3, 4 or 5 posts per week; default 3). Twelve weeks at that cadence yields 36–60 slots, each carrying a date, pillar, theme, angle, format and a one-line brief. This is the day-one deliverable the user sees before the paywall.

Daily posting is deliberately not offered. A solo coach who commits to seven posts a week abandons the system in week two, and the abandoned plan is what they cancel over.

**Only the next week's slots are drafted in full.** Generating 84 complete posts up front is expensive, stale by week three, and leaves the learning loop nothing to steer. Later weeks remain open to revision from learnings and trends.

**Interface:** `generateStrategy(business, voice) -> Strategy`, `draftWeek(strategy, weekIndex) -> Slot[]`

### 4.3 `radar`

A daily job builds search queries from the user's niche and pillars, queries the search provider, and runs an LLM filter pass that scores relevance and drafts an angle connecting each item to the user's offer.

Surfaces 5–10 items on the dashboard. Each carries a one-tap "write about this" that injects the item into the writer's brief stage.

**Interface:** `refreshRadar(userId) -> TrendItem[]`

### 4.4 `writer`

Four stages:

1. **Brief** — slot + strategy + business profile + active learnings + optional trend item produce a tight brief: angle, hook direction, proof to use, CTA.
2. **Variants** — three voice-matched drafts generated in parallel from the one brief. The shared brief keeps all three on-strategy rather than three unrelated angles.
3. **Selection** — the user picks one variant, which opens in the editor with the other two visible alongside so lines can be copied across manually. "Blend" is a human editing action, not an AI merge step. The chosen index and any cross-copied text are recorded as preference signals.
4. **Polish** — optional single revision pass against an explicit rubric: voice match, hook strength, offer relevance, LinkedIn formatting.

Context per generation: Voice Profile + the 3 most format-similar real samples + brief.

**Interface:** `buildBrief(slot, ctx) -> Brief`, `generateVariants(brief, voice) -> Variant[3]`, `polish(post, voice) -> Post`

### 4.5 `publisher`

The most important interface in the system, because the adapter behind it changes twice.

```ts
interface LinkedInAdapter {
  connect(userId: string): Promise<Connection>
  refreshToken(conn: Connection): Promise<Connection>
  publishText(conn: Connection, post: Post, idempotencyKey: string): Promise<{ urn: string }>
  fetchPostAnalytics?(conn: Connection, urn: string): Promise<PostMetrics>
  capabilities(): {
    document: boolean
    multiImage: boolean
    image: boolean
    analytics: boolean
  }
}
```

- **`ShareOnLinkedInAdapter`** — ships now. Self-serve `w_member_social` + OIDC. `capabilities()` returns analytics/document/multiImage false.
- **`CommunityManagementAdapter`** — drops in on CMA approval. Flips capabilities true, enables `fetchPostAnalytics`, unlocks documents.
- **`AyrshareAdapter`** — escape hatch if approval drags past the point of pain. Carries a cost and a third-party OAuth consent screen; only adopted deliberately.

**No code above this interface knows which adapter is live.** The UI reads `capabilities()` to decide which features to show. Switching adapters is a config change plus one file.

### 4.6 `jobs`

A `jobs` table in Postgres. Vercel Cron hits a worker route every 5 minutes. Workers claim due rows with `SELECT ... FOR UPDATE SKIP LOCKED`, with attempt counts and exponential backoff.

**Every publish carries an idempotency key.** A retry must never double-post to a customer's feed. This is the single highest-consequence invariant in the system.

Job types: `approval_nudge` (correct minute, user's timezone), `draft_week`, `refresh_radar`, `poll_analytics` (post-CMA), `synthesise_learnings`, `purge_linkedin_content` (48h compliance), `trial_reminder`.

Long LLM generation runs in a streaming route rather than a cron worker, so it is not bound by cron execution limits.

### 4.7 `attribution`

Every post CTA is rewritten to a LinkBud short link on a dedicated short domain (written throughout as `lnkb.to/xxxx`; the actual domain is bought in Milestone 0 and set via env var) that redirects to the user's Calendly, landing page or booking URL. Clicks are logged with timestamp, referrer and user agent.

Three days after publication, a single-tap prompt: *"Did this post start a conversation?"* — no / a DM / a call booked / a client signed.

These two signals are the honest version of "leads, not likes." Click data is ours, not LinkedIn's, so it works from day one with no API dependency. Post-CMA, `LINK_CLICKS` from `memberCreatorPostAnalytics` corroborates it.

### 4.8 `learnings`

Named, visible, user-editable records. Examples:

- *"Your contrarian hooks outperform story hooks 2:1."*
- *"You consistently cut em-dashes from drafts."*
- *"Tuesday 8am outperforms Thursday 5pm."*

Written nightly from four signals: which variant was chosen, the diff between draft and published text, click-through rate, and self-reported outcomes. Injected into the brief stage.

Every learning is visible and deletable. Legible learning beats magic learning — the user can see the system working, and can correct it when it draws the wrong conclusion.

---

## 5. Data model

Core tables.

*Amended 2026-09-16.* The authorization model changed when Prisma was adopted. RLS is **enabled and forced** on every table and remains the guard on Supabase's Data API — reachable by anyone holding the public anon key. It does **not** constrain Prisma, which connects as a BYPASSRLS role (verified: `postgres` and `service_role` have `rolbypassrls = true`; `anon` and `authenticated` do not). Ownership on the Prisma path is enforced in application code by the repositories.

`profiles.id` holds `auth.users.id` but carries no foreign key to it: a cross-schema FK forces Prisma to introspect all 27 Supabase Auth tables, which its migration engine would then consider its own to manage. Cascade-on-delete is preserved by an explicit trigger instead (`supabase/migrations/0002`).

| Table | Purpose |
|---|---|
| `profiles` | Supabase Auth mirror, timezone, onboarding state |
| `business_profiles` | Offer, ICP, transformation, proof, POV, taboos, CTA target |
| `voice_profiles` | Structured voice fields, user-edited |
| `writing_samples` | Pasted posts, with derived format metadata for exemplar matching |
| `strategies` | The 12-week arc, generated-at, version |
| `pillars` | 4–5 content pillars per strategy |
| `slots` | Dated slots for the 12 weeks (36–60, per cadence): pillar, theme, angle, format, brief, status |
| `posts` | draft → approved → scheduled → published → failed. Holds `variant_index`, `final_text`, `edit_diff`, `linkedin_urn` |
| `post_variants` | The three generated drafts per post |
| `linkedin_connections` | Encrypted tokens, expiry, granted scopes, adapter id |
| `jobs` | type, payload, run_at, attempts, status, idempotency_key |
| `short_links` | slug → destination, post_id |
| `link_clicks` | short_link_id, ts, referrer, ua_hash |
| `post_metrics` | Numeric metrics only. Post-CMA. |
| `outcome_reports` | Self-reported result per post |
| `learnings` | text, category, confidence, source_signal, active |
| `trend_items` | Radar output, per user, with relevance score and suggested angle |
| `subscriptions` | Stripe customer, subscription, status, trial_end |

LinkedIn access and refresh tokens are encrypted at rest. No LinkedIn-returned social content is persisted beyond 48 hours.

*Amended 2026-09-16, after Milestone 1:* the first row read `users`. The table is named **`profiles`** — a `public.users` sitting beside Supabase's own `auth.users` is a trap, and `supabase/migrations/0001_profiles.sql` creates `public.profiles`.

---

## 6. The daily surface

The dashboard is the front door, in **three bands**:

1. **Needs you now** — approvals due, drafts to review, next scheduled slot.
2. **What's happening in your world** — today's radar items, each one tap from a draft.
3. **What's working** — clicks, reported conversations, active learnings.

Calendar (the 12-week board) and Strategy are one click away, not the front door. They are planning surfaces, opened weekly; the dashboard is the daily habit.

### 6.1 Design direction

**Calm editorial.** Warm off-white ground, near-black text, one restrained accent, real typographic hierarchy, generous whitespace, minimal chrome. The core act in this product is reading and approving words — the interface should behave like a writing tool, not a control panel.

Explicitly banned: purple/indigo gradients, glassmorphism, neon on dark, emoji as UI iconography, more than one accent colour, decorative shadows. These are the default signatures of AI-generated interfaces and they make a paid product read as a weekend project.

---

## 7. Quality gates

**TDD is mandatory** for code where a silent bug costs money or credibility:

- Stripe billing and trial state transitions
- The LinkedIn adapter and token refresh
- The job engine: claiming, backoff, retry, and idempotency
- Attribution: short link resolution, click counting, deduplication
- The 48-hour purge job

**Not required** for UI components and prompt construction. Asserting that an LLM returned a non-empty string is theatre, not testing.

**Hard gate before any commit:** typecheck, lint and build must pass. Enforced by a hook, not by discipline.

---

## 8. Build order

| # | Milestone | Contents |
|---|---|---|
| 0 | Accounts | Incorporate, domain, business email, LinkedIn Page, LinkedIn App A (Share on LinkedIn), LinkedIn App B + CMA application filed, Stripe, Resend |
| 1 | Foundation | Scaffold, Supabase schema + RLS, auth, app shell, design system |
| 2 | Onboarding | **LLM gateway**, interview, sample paste, Voice Profile, Business Profile, both editable |
| 3 | Strategy | Pillars, 12-week arc, dated slots at chosen cadence, calendar view |
| 4 | Paywall | Stripe, trial, gating after strategy |
| 5 | Writer | Brief, 3 variants, editor with LinkedIn-accurate preview (gateway already built in M2) |
| 6 | Jobs + Publisher | Jobs table, cron, Share on LinkedIn adapter, approve-then-publish, nudges |
| 7 | Attribution | Short links, click log, outcome prompt |
| 8 | Radar | Daily trend job, dashboard band, one-tap draft |
| 9 | Learnings | Nightly synthesis, visible learning records |
| 10 | v2 (on CMA approval) | Analytics ingest, carousel studio, performance-weighted exemplars |

*Amended 2026-09-16.* The LLM gateway moved from Milestone 5 to Milestone 2.
As written, this order could not be followed: §4.1 requires
`deriveVoiceProfile(samples)` in Milestone 2 and §4.2 requires
`generateStrategy(business, voice)` in Milestone 3, both of which need a model,
while the gateway was not scheduled until Milestone 5. Milestone 5 now builds
the writer on a gateway that already exists rather than introducing one.

Two consequences follow. The gateway becomes a Milestone 2 dependency, so
`OPENROUTER_API_KEY` is required from Milestone 2 rather than Milestone 5. And
the numeric Voice Profile fields — average and maximum sentence length, and
the emoji, hashtag and line-break counts — are computed in code rather than
asked of the model: they are arithmetic over the samples, the writer depends on
them being right, and counting is a known weakness of language models. The
model supplies the judgement fields it is actually suited to.

*Amended 2026-09-17.* The gateway gained a second possible provider. §3 named
OpenRouter as the single gateway; it is still a single gateway — one module,
one entry point, one request shape, one validation path — but the provider
behind it is now chosen by which API key is configured, Gemini first.

The reason is measured, not preferential. On 2026-09-17 OpenRouter's free tier
could not complete a strategy at all: the pinned default model answered `503
Upstream error from Nvidia: Service temporarily overloaded` on every call, and
the free fallback then ran past the gateway's 90-second timeout on the real
structured-output calls. Two consecutive browser runs of Regenerate failed, at
131 s and 156 s, with the user-facing failure path working correctly each time.
The free tier is additionally capped at 50 requests a day account-wide, and one
strategy build is six calls. A product whose core action cannot complete is not
blocked on a better retry policy; it is blocked on a provider that answers.

Three things this deliberately does not change. There is still exactly one
module that makes model calls, so the model choice, the spend and the failure
behaviour remain one decision. No caller chooses a provider, and none can — a
caller that pins a model pins it on whichever provider is configured. And both
providers are reached over the same OpenAI-shaped `/chat/completions` with
`response_format: json_schema`, which is why this is a table of two endpoints
rather than two clients; a third provider needing a different request shape is
the moment to split them, not before.

`OPENROUTER_API_KEY` is therefore no longer required: from Milestone 2 onward
the gateway needs `GEMINI_API_KEY` **or** `OPENROUTER_API_KEY`, and says so by
name when it has neither.

Milestone 0 runs in parallel from day one. The CMA application has a reported 3–4 month turnaround with no SLA, so it must be filed before any code that depends on it is planned.

---

## 9. Out of scope for v1

Agencies and multi-tenancy · carousels and image generation · native iOS/Android apps · a built-in CRM · free tier · credit metering · unattended auto-publish · comment and DM automation · LinkedIn-native trend data · engagement pods · competitor tracking.

Each of these is a deliberate exclusion with a reason recorded above, not an oversight.
