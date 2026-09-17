# Architecture

LinkBud is one Next.js 16 App Router application in TypeScript, deployed to Vercel, talking to one Supabase Postgres database with row-level security on every table. There is no separate backend service and no worker process — Vercel Cron hits a route handler, and that route handler is the job engine.

Rationale for every choice here lives in `docs/superpowers/specs/2026-09-16-linkbud-design.md`. This document carries the operational map: what exists, what is planned, what each module is allowed to depend on.

---

## What exists today

The foundation (Milestone 1) is complete. Everything in this section is real code you can read:

| Area | Files | State |
|---|---|---|
| Configuration | `src/lib/env.public.ts`, `src/lib/env.server.ts` (+ tests) | Zod-validated. `getServerEnv()` parses the full server schema and throws on anything missing; `getPublicEnv()` does the same for the three `NEXT_PUBLIC_*` values the Supabase clients depend on, and is what every live path calls. `publicEnv` is the non-throwing accessor, used where a missing value must not be fatal — the sign-in redirect URL, and the proxy's credential check. These are the only modules that read `process.env`. Split in Milestone 4 so a client-safe file can no longer see the name of a server secret. |
| Supabase clients | `src/lib/supabase/browser.ts`, `server.ts`, `admin.ts` | Three clients. `browser` and `server` use the anon key; `admin` uses the service role and carries `import 'server-only'` so an accidental client import fails the build. |
| Schema | `supabase/migrations/0001_profiles.sql` | One table, `public.profiles`, RLS enabled, three own-row policies, a `handle_new_user()` signup trigger and a `touch_updated_at()` trigger. |
| Auth | `src/app/(auth)/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`, `src/lib/auth/safe-next.ts` | Magic link + Google. The callback validates its redirect target through `safeNext()` (tested) so `?next=` cannot be used as an open redirect. |
| Session | `src/proxy.ts` | Refreshes the Supabase session on every matched request when credentials are configured, and bails out untouched when they are not. It does **not** guard routes. Next.js 16 renamed this file convention from `middleware` to `proxy`. |
| Shell | `src/app/(app)/layout.tsx`, `src/components/app-nav.tsx`, `src/app/(app)/dashboard/page.tsx` | The session guard lives in the `(app)` layout: no user, redirect to `/login`. The dashboard renders the three bands as empty states. |
| Design system | `src/app/globals.css`, `src/components/ui/*` | See `docs/DESIGN-SYSTEM.md`. |

Two of the eight product modules below exist as of Milestone 3:

| Module | Files | State |
|---|---|---|
| `onboarding` (Milestone 2) | `src/lib/onboarding/*`, `src/server/onboarding/*`, `src/server/db/repositories/{business-profiles,voice-profiles,writing-samples}.ts`, `src/app/(app)/onboarding/{interview,samples,voice}/`, `src/app/(app)/settings/business/` | Interview, samples, derived and editable Voice Profile, editable Business Profile. Migration `0003`. |
| LLM gateway | `src/server/llm/client.ts`, `src/server/llm/complete-with-fallback.ts` | `completeJson` (one call, strict `json_schema`, validated on return) and a bounded, tested provider fallback beside it. |
| `writer` (Milestone 5) | `src/lib/post/*`, `src/server/writer/*`, `src/server/db/repositories/posts.ts`, `src/app/(app)/(onboarded)/write/[slotId]/`, `src/app/(app)/(onboarded)/posts/`, `src/components/writer/*` | Brief, three named variants, editor with a LinkedIn preview, optional polish, preference signals. Migration `0006`. Rulings in `docs/superpowers/plans/2026-09-17-linkbud-writer.md`. |
| `strategy` (Milestone 3) | `src/lib/strategy/{vocabulary,schedule}.ts`, `src/server/strategy/*`, `src/server/db/repositories/strategies.ts`, `src/app/(app)/onboarding/strategy/`, `src/app/(app)/(onboarded)/{strategy,calendar}/`, `src/components/strategy/*` | Pillars, arc, 36–60 dated slots, the coming week briefed in full, `/strategy` and `/calendar`. Migration `0004`. Rulings in `docs/superpowers/plans/2026-09-16-linkbud-strategy.md`. |

The onboarding step machine (`src/lib/onboarding/steps.ts`) routes `interview`, `samples`, `voice` and `strategy` to their pages; `paywall` is Milestone 4's and still falls back to the dashboard.

**The other five — `radar`, `publisher`, `jobs`, `attribution`, `learnings` — do not exist yet.** There is no `src/server/publisher/`, no `jobs` table. Do not import from them, do not describe them as implemented, and do not assume a helper exists because this document names its signature.

---

## The eight modules

Each has one purpose, a defined interface, and can be understood and tested without reading the others. Signatures are from spec §4 and are the contract; the implementation milestone is noted against each.

### `onboarding` — Milestone 2

**Purpose.** Turn a guided interview plus 5–10 pasted posts (or 2 written samples for someone starting fresh) into two durable, user-editable records: a **Business Profile** (offer and price band, ICP, transformation sold, proof, POV, taboos, CTA target) and a **Voice Profile** (sentence rhythm, average and max sentence length, line-break habits, opener and closer patterns, vocabulary markers, emoji and hashtag policy, banned phrases, POV strength, humour level, formality).

The interview also captures timezone, posting cadence (3–5/week, default 3) and preferred posting time, because the job engine cannot schedule an approval nudge without them and asking later means a broken first week.

```ts
deriveVoiceProfile(samples: WritingSample[]): Promise<VoiceProfile>
deriveBusinessProfile(interview: InterviewAnswers): Promise<BusinessProfile>
```

**Depends on:** the LLM gateway and the database. Nothing else.
**Never depends on:** LinkedIn. Voice comes from pasted samples; business context comes from the interview. See `docs/LINKEDIN-COMPLIANCE.md`.

### `strategy` — Milestone 3

**Purpose.** Generate 4–5 content pillars and a 12-week narrative arc (authority → problem-aware → offer-aware → invitation), laid out all at once as 36–60 dated slots at the user's chosen cadence. Each slot carries a date, pillar, theme, angle, format and one-line brief. This is the day-one deliverable the user sees before the paywall.

Only the next week's slots are drafted in full. Generating 84 complete posts up front is expensive, stale by week three, and leaves the learning loop nothing to steer.

```ts
generateStrategy(business: BusinessProfile, voice: VoiceProfile): Promise<Strategy>
draftWeek(strategy: Strategy, weekIndex: number): Promise<Slot[]>
```

**Depends on:** `onboarding` outputs (Business Profile, Voice Profile).

### `radar` — Milestone 8

**Purpose.** A daily job builds search queries from the user's niche and pillars, queries the search provider, and runs an LLM filter pass that scores relevance and drafts an angle connecting each item to the user's offer. Surfaces 5–10 items on the dashboard, each one tap from a draft.

```ts
refreshRadar(userId: string): Promise<TrendItem[]>
```

**Depends on:** `onboarding` (niche), `strategy` (pillars), and a `SearchProvider` interface. Exa is the implementation; `radar` must not import an Exa SDK directly, so Tavily or Perplexity can be swapped in without touching this module.

### `writer` — Milestone 5

**Purpose.** Four stages, in order:

1. **Brief** — slot + strategy + business profile + active learnings + optional trend item produce a tight brief: angle, hook direction, proof to use, CTA.
2. **Variants** — three voice-matched drafts generated in parallel from the one brief. The shared brief is what keeps all three on-strategy instead of three unrelated angles.
3. **Selection** — the user picks one; it opens in the editor with the other two visible alongside so lines can be copied across by hand. "Blend" is a human editing action, not an AI merge step. The chosen index and any cross-copied text are recorded as preference signals.
4. **Polish** — optional single revision pass against an explicit rubric: voice match, hook strength, offer relevance, LinkedIn formatting.

Context per generation: Voice Profile + the 3 most format-similar real samples + the brief. Exemplar matching uses format and structure heuristics (length band, opener type, list vs narrative, paragraph count), not vectors — OpenRouter does not serve embeddings.

```ts
buildBrief(input: BuildBriefInput): Promise<Brief>
generateVariants(input: GenerateVariantsInput): Promise<Variant[]>
polish(input: PolishInput): Promise<string>
```

**As built (Milestone 5).** Four model calls per post: one brief, three variants in parallel on one shared `FallbackSession`. The brief is persisted the moment it returns, before the variants run, so a variant failure costs three calls to retry rather than four.

The three variants carry **named approaches** — `hook-forward`, `story-forward`, `proof-forward` — stored on each variant row. That is what makes `posts.variant_index` a signal Milestone 9 can learn from: index 1 means the same thing on every post ever generated.

Everything stable (voice, business, exemplars, brief) sits in the **system** prompt, byte-identical across the three variant calls, and only a one-line approach instruction varies. That ordering is the prompt-caching mechanism; reversing it disables the discount silently.

`polish` never overwrites. It returns text stored as `posts.polished_text` for the user to accept or discard.

**`approved` is not authority to publish.** It records that the user finished writing and reviewed that exact text; editing returns the post to `draft`. Milestone 6 still requires a tap at publish time — `docs/LINKEDIN-COMPLIANCE.md` §3.

**Depends on:** `onboarding` (voice, samples), `strategy` (the slot), `radar` (optional trend item), and active learning *records*. See the dependency-direction section for why that is not a cycle.

### `publisher` — Milestone 6

**Purpose.** The most important interface in the system, because the adapter behind it changes twice.

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

Three implementations:

- **`ShareOnLinkedInAdapter`** — ships now. Self-serve `w_member_social` + OIDC. `capabilities()` returns `analytics`, `document` and `multiImage` false.
- **`CommunityManagementAdapter`** — drops in on CMA approval. Flips capabilities true, enables `fetchPostAnalytics`, unlocks documents.
- **`AyrshareAdapter`** — escape hatch if approval drags past the point of pain. Carries a cost and a third-party OAuth consent screen; only adopted deliberately.

**Depends on:** nothing above it. It receives a `Connection` and a `Post` and returns a URN.

**The hard rule: no code above this interface may know which adapter is live.** The UI decides what to show by reading `capabilities()`, never by checking an adapter name, an env var, or a feature flag of its own. Switching adapters must be a config change plus one file. Any `if (adapter === 'cma')` in a component is a bug.

Every call to `publishText` carries an idempotency key, and every publish is triggered by a user tap. Both are non-negotiable.

### `jobs` — Milestone 6

**Purpose.** A `jobs` table in Postgres. Vercel Cron hits a worker route every 5 minutes. Workers claim due rows with `SELECT ... FOR UPDATE SKIP LOCKED`, with attempt counts and exponential backoff.

Job types: `approval_nudge` (correct minute, user's timezone), `draft_week`, `refresh_radar`, `poll_analytics` (post-CMA), `synthesise_learnings`, `purge_linkedin_content` (the 48-hour compliance purge), `trial_reminder`.

**Every publish carries an idempotency key. A retry must never double-post to a customer's feed. This is the single highest-consequence invariant in the system** and it is TDD-mandatory.

Long LLM generation runs in a streaming route, not a cron worker, so it is not bound by cron execution limits.

**Depends on:** everything. **Depended on by:** nothing. `jobs` calls into the other modules; no module imports `jobs` to schedule itself — it enqueues a row.

### `attribution` — Milestone 7

**Purpose.** Every post CTA is rewritten to a LinkBud short link on a dedicated short domain (written throughout as `lnkb.to/xxxx`; the real domain is bought in Milestone 0 and set via `SHORT_LINK_DOMAIN`) that redirects to the user's Calendly, landing page or booking URL. Clicks are logged with timestamp, referrer and user agent.

Three days after publication, a single-tap prompt: *"Did this post start a conversation?"* — no / a DM / a call booked / a client signed.

These two signals are the honest version of "leads, not likes". Click data is ours, not LinkedIn's, so it works from day one with no API dependency. Post-CMA, `LINK_CLICKS` from `memberCreatorPostAnalytics` corroborates it.

**Depends on:** posts (for the link-to-post association). Not on `publisher` internals, and not on LinkedIn at all.

### `learnings` — Milestone 9

**Purpose.** Named, visible, user-editable records — *"Your contrarian hooks outperform story hooks 2:1"*, *"You consistently cut em-dashes from drafts"*, *"Tuesday 8am outperforms Thursday 5pm"*. Written nightly from four signals: which variant was chosen, the diff between draft and published text, click-through rate, and self-reported outcomes.

Every learning is visible and deletable. Legible learning beats magic learning: the user can see the system working and correct it when it draws the wrong conclusion.

**Depends on:** post/variant records (from `writer`), click and outcome records (from `attribution`).

---

## Dependency direction

```
        onboarding
            │
            ├──────────────► strategy ──────────┐
            │                   │               │
            │                   ▼               │
            └──────────────► radar ────────┐    │
                                           ▼    ▼
                                         writer ◄──── learning records
                                           │                  ▲
                                           ▼                  │
                                       publisher               │
                                     ┌─────┴─────┐             │
                                     │ LinkedIn  │             │
                                     │  Adapter  │             │
                                     └───────────┘             │
                                           │                   │
                                           ▼                   │
                                      attribution ─────────────┘

   jobs ──────► depends on all of the above; nothing depends on jobs
```

Rules that follow from it, stated so they cannot be rationalised away:

1. **Nothing above the `LinkedInAdapter` interface may know which adapter is live.** Capability questions are answered by `capabilities()`.
2. **`publisher` depends on nothing above it.** It takes a connection, a post and an idempotency key. If it needs to know about a slot, a strategy or a learning, the design is wrong.
3. **`jobs` is a leaf in the wrong direction on purpose** — it depends on everything and is depended on by nothing. Modules schedule work by inserting a row, never by importing the job engine.
4. **`writer` ↔ `learnings` is not a cycle.** `writer` reads active learning *records* out of the database at brief time; `learnings` reads post, variant, click and outcome *records* nightly. Neither imports the other's generation code, and neither may.
5. **`radar` talks to a `SearchProvider` interface, never to a vendor SDK.**
6. **Every module reaches configuration through `src/lib/env.ts`.** Nothing else reads `process.env`.

---

## Data model

Core tables, all with RLS keyed to `auth.uid()`. Migrations `0001`–`0006` have shipped, so everything through `post_variants` exists; the rest arrive with their milestone.

| Table | Purpose |
|---|---|
| `profiles` | Supabase Auth mirror, timezone, onboarding state |
| `business_profiles` | Offer, ICP, transformation, proof, POV, taboos, CTA target |
| `voice_profiles` | Structured voice fields, user-edited |
| `writing_samples` | Pasted posts, with derived format metadata for exemplar matching |
| `strategies` | The 12-week arc, generated-at, version |
| `pillars` | 4–5 content pillars per strategy |
| `slots` | Dated slots for the 12 weeks: pillar, theme, angle, format, brief, status |
| `posts` | draft → approved → scheduled → published → failed. Holds `variant_index`, `final_text`, the preference signals and `linkedin_urn`. `slot_id` is nullable `on delete set null`, with the slot's theme, format and date snapshotted, so regenerating a strategy detaches drafts instead of destroying them |
| `post_variants` | The three generated drafts per post |
| `linkedin_connections` | Encrypted tokens, expiry, granted scopes, adapter id |
| `jobs` | type, payload, run_at, attempts, status, idempotency_key |
| `short_links` | slug → destination, post_id |
| `link_clicks` | short_link_id, ts, referrer, ua_hash |
| `post_metrics` | Numeric metrics only. Post-CMA. |
| `outcome_reports` | Self-reported result per post |
| `learnings` | text, category, confidence, source_signal, active |
| `trend_items` | Radar output, per user, with relevance score and suggested angle |
| `subscriptions` | Razorpay subscription and plan ids, status, current period, cancel-at-cycle-end. **Select-only under RLS** — a self-writable entitlement row is a free subscription for anyone holding the anon key. |

LinkedIn access and refresh tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`. **No LinkedIn-returned social content is persisted beyond 48 hours.**

One migration file per change, in `supabase/migrations/`, numbered. Never edit a migration that has been applied — add another. RLS goes on in the same migration that creates the table, never in a follow-up.

---

## Request flow, as built today

1. A request hits `src/proxy.ts` (the Next.js 16 name for what used to be `middleware.ts`), which refreshes the Supabase session cookie. It does not authorise anything. With no Supabase credentials configured it returns immediately, so the public pages render on a fresh clone.
2. If the path is under `(app)`, `src/app/(app)/layout.tsx` calls `supabase.auth.getUser()` and redirects to `/login` when there is no user. **This is where route protection lives** — adding an authenticated route means putting it inside the `(app)` group, not adding a matcher to the proxy.
3. Server components use `await createServerClient()` for **auth only**. Every query goes through a repository in `src/server/db/repositories`, which uses Prisma. `createAdminClient()` is `server-only` and currently unused.
4. **RLS is not the authorisation boundary on the path the application actually uses.** Prisma connects as a role with `BYPASSRLS`, so a missing `where user_id = ...` is a cross-customer data leak, not a redundancy. Ownership is enforced in application code: every repository function takes `userId` first and scopes on it, and an ESLint rule makes importing the raw client outside `src/server/db` a build failure. RLS remains enabled and forced on every table because it is the real guard on Supabase's Data API, which is reachable by anyone holding the public anon key.

*(This section said the opposite until Milestone 5. It was written before the Prisma adoption and was left behind by it — which mattered, because it told the next implementer that a missing scope would be caught by the database.)*
