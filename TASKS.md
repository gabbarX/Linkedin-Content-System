# LinkBud — task list

The single answer to "what's done and what's left". Update it in the same commit
as the work it describes.

**Related files, so this one stays a checklist rather than an essay:**
`docs/ROADMAP.md` (what each milestone contains and why) · `docs/BACKLOG.md`
(known debts with triggers) · `docs/ACCOUNTS.md` (the account setup you do by
hand) · `docs/superpowers/specs/2026-09-16-linkbud-design.md` (the binding spec).

**Status legend:** `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

## Milestone 0 — accounts and access (you, not Claude)

Runs in parallel with everything. The CMA application has a reported 3-4 month
turnaround with no SLA, so **file it the week you incorporate** — it is the long
pole on carousels and the whole analytics loop. Full instructions in
`docs/ACCOUNTS.md`.

- [ ] Incorporate
- [ ] Buy the domain
- [ ] Business email on that domain (CMA vetting rejects personal addresses)
- [ ] Buy the short-link domain (for attribution in Milestone 7)
- [ ] LinkedIn Company Page, with you as super-admin
- [ ] LinkedIn **App A** — add Share on LinkedIn + Sign In with LinkedIn (self-serve)
- [ ] LinkedIn **App B** — clean app, Community Management API application filed
- [ ] Stripe — product at $49/mo with a 14-day trial
- [ ] Resend — domain verified
- [x] Supabase project created — reachable, keys distinct
- [x] `DATABASE_URL` + `DIRECT_URL` set and connecting (password percent-encoded)
- [ ] Google OAuth client created, added to Supabase
- [ ] Vercel project + environment variables
- [x] **Applied `0001_profiles.sql` and `0002`** — verified live: RLS enabled AND forced, three policies scoped to `authenticated`, both triggers present, both functions pinned to `search_path=''`
- [x] ~~Regenerate `src/lib/types/database.ts`~~ — superseded by Prisma; the placeholder file was deleted

---

## Milestone 1 — foundation ✅ complete

22 commits, `npm run verify` green, browser QA passed. Merged to `master`.

- [x] Next.js 16 scaffold, TypeScript strict, `npm run verify` gate
- [x] Validated env config that throws naming the missing variable
- [x] Calm editorial design system — `--lb-*` tokens, Fraunces + Inter, Tailwind v4
- [x] Supabase clients (browser / server / admin) with `server-only` containment
- [x] `profiles` table, RLS, signup trigger, cadence constrained to 3-5 in the database
- [x] Magic-link and Google auth, session refresh, same-origin redirect validation
- [x] Authenticated shell + three-band dashboard skeleton
- [x] Seven documentation files + `CLAUDE.md`
- [x] Claude Code tooling — `/verify`, `/spec-check`, `/feature`, reviewer agent, quality hook
- [x] Browser QA — routes, auth guard, CSRF, open-redirect defence, contrast, a11y, mobile

---

## Prisma adoption ✅ complete

Decided 2026-09-16: Prisma owns the schema and all queries; authorization moved
from RLS into application code. RLS is retained as the guard on Supabase's
public Data API. See the amendments in spec §3 and §5.

- [x] Prisma 7.10.0 pinned (npm's `latest` is a release candidate — see `docs/BACKLOG.md`)
- [x] `prisma.config.ts` — CLI on `DIRECT_URL`, runtime on pooled `DATABASE_URL`
- [x] Schema introspected; the `auth` schema deliberately excluded
- [x] `0002` drops the cross-schema FK, replaces cascade with a trigger
- [x] `src/server/db/client.ts` — pooled adapter, `server-only`, hot-reload safe
- [x] `src/server/db/repositories/profiles.ts` — every function takes `userId` first
- [x] ESLint guard blocking raw-client imports — **verified to fire**
- [x] Prisma smoke-tested against the live database
- [x] Port `(app)/layout.tsx` to read the profile via the repository — the nav
      shows `full_name` when set, and a missing profiles row is logged rather
      than swallowed, because it means the signup trigger did not fire
- [x] `getPrisma()` is lazy — constructing the client at module scope would have
      read the environment during `next build` the moment a route imported a
      repository, breaking the documented credential-less build
- [x] Delete the now-unused `src/lib/types/database.ts` placeholder
- [x] **supabase-js stays for auth and nothing else.** Settled: all four call
      sites are auth (`signInWithOtp`, `signInWithOAuth`, `exchangeCodeForSession`,
      `getUser`, `signOut`). Every query goes through Prisma. `admin.ts` is
      retained unused for service-role work that has no auth equivalent.
- [x] Verify the layout's **signed-in** branch in a browser — done via
      `/auth/dev-login`; the shell renders and the nav falls back to the account
      email because `full_name` is null

## Milestone 2 — onboarding

**Do these two first, before any feature code:**

- [x] **Auth rebuilt on `/auth/confirm`.** The emailed link now carries a
      `token_hash` verified server-side, which needs no PKCE verifier and works
      from a different device than requested it — the code exchange never could.
      `/auth/callback` is kept for Google OAuth, where it is correct.
      `/auth/dev-login` and its seeded fixture user are deleted.
- [x] **Email + password sign-in.** Verified end to end in a browser: seed an
      account, sign in at `/login`, land on onboarding; wrong password shows
      Supabase's generic "Invalid login credentials" and leaves you signed out.
      This is the first sign-in through the front door the project has had.
      Spec §3 amended — both original methods depend on configuration outside
      the repository, so neither could be the only way in.
- [ ] **YOU: `npm run seed:dev -- you@yourdomain.com`** to give yourself a
      password. `docs/ACCOUNTS.md` §9a.
- [ ] **YOU: point the Supabase email templates at `/auth/confirm`** to make the
      magic link work. `docs/ACCOUNTS.md` §9b. No longer blocking — password
      sign-in works without it.
- [ ] **Perform the first live sign-in.** Still the test that matters, and still
      not done: no one has yet arrived at `/login`, received an email, clicked it
      and landed signed in. Everything else in the auth path has now run.
- [ ] Seed your account in a fresh environment with `npm run seed:dev -- you@…`
- [x] **Close the spec §7 gap** — `.claude/hooks/commit-gate.mjs` is a `PreToolUse`
      hook that runs the full gate before any `git commit` and exits 2 to block on
      failure. Verified end to end: allows on green, blocks on red, escape hatch
      warns. Fixed a latent defect found on the way — `vitest.config.ts` used ESM
      syntax in a file Node loads as CommonJS, which broke under Vite's native
      config loader; it is now `vitest.config.mts`.

Verified along the way (first time any of it has executed):

- [x] `handle_new_user()` creates the profiles row on signup — two rows present
- [x] The database defaults land as specified: `UTC`, cadence 3, 08:00, `interview`
- [x] The profile repository reads a real row through Prisma in a request path
- [x] Fixed: blank `.env` values read as invalid rather than unset, so
      `getServerEnv()` threw on every server-side read. `.env.example` ships ten
      keys as `KEY=`, so following the setup instructions produced it. This was
      invisible until the first `getServerEnv()` call in a request path — it
      would have blocked all of Milestone 2.

Then — plan written: `docs/superpowers/plans/2026-09-16-linkbud-onboarding.md`
(11 tasks). Decisions taken 2026-09-16: structured columns over JSONB, the LLM
gateway pulled forward into this milestone (spec §8 amended), one interview
question per screen.

- [x] **`OPENROUTER_API_KEY`** set and verified with a real call
- [x] Migration 0003 — `business_profiles`, `voice_profiles`, `writing_samples`,
      plus `profiles.interview_draft` for a resumable interview
- [x] Onboarding repositories, `userId`-first; union types checked against the
      live check constraints
- [x] The OpenRouter gateway (`src/server/llm`) — moved here from Milestone 5.
      Sends the Zod schema as strict `json_schema`; verified live. Free models
      are slow and rate-limited — see `docs/BACKLOG.md`.
- [x] Guided interview — offer, ICP, transformation, proof, POV, taboos, CTA target, cadence, timezone.
      One question per screen (`/onboarding/interview?q=N`), progress shown as dots.
      Every advance persists to `profiles.interview_draft`; closing the tab and
      reopening the bare URL resumes at the furthest question reached. The final
      advance validates the whole draft, writes `business_profiles` and the
      cadence/time/timezone onto `profiles`, clears the draft, and sets
      `onboarding_step = 'samples'`. Browser-verified end to end, both widths.
- [x] Writing-sample paste (5-10 posts, or 2 written fresh) — the 5-10/2-written
      rule lives in one shared Zod schema (`src/lib/onboarding/samples.ts`) so the
      client's live status line and the server action's final check can never
      disagree. Samples are saved (`addWritingSamples`, with per-sample counts
      from `measureSample`) *before* derivation is ever attempted, so a failed
      model call cannot cost the user the text they just pasted. A failed
      derivation switches the same screen into a retry state — "Try again" /
      "Start over" — with a message that distinguishes a missing key, a rate
      limit, and everything else. Browser-verified end to end, including a
      forced failure (an invalid model id, temporarily, then reverted) and an
      unforced one that occurred naturally on a 2-written-sample submission and
      recovered correctly on retry.
- [x] Derive the **Voice Profile** (sentence rhythm, openers, line breaks, vocabulary, emoji/hashtag policy, banned phrases) —
      wired end to end for the first time via `/onboarding/samples`:
      `deriveVoiceProfile` → `saveDerivedVoiceProfile` → `onboarding_step = 'voice'`.
- [x] **Business Profile** populated — unlike Voice Profile, this is not LLM-derived:
      offer, ICP, transformation, proof, POV, taboos and CTA target are the interview's
      own literal answers, written straight to `business_profiles` on the interview's
      final advance (see the guided-interview bullet above).
- [x] **Voice Profile** editable — `/onboarding/voice`. Seven judged fields as selects (options
      built from the repository's own const tuples, never retyped, with a human label and a
      one-line explanation per option — the raw enum value is never shown); four array fields
      (openers, closers, vocabulary, banned phrases) as add/remove lists; the three measured
      fields shown read-only with a note that they came from the samples. "Save changes" persists
      immediately (`updateVoiceProfile`, which always sets `user_edited = true` — reaching this
      screen and confirming is itself the human review); "Continue" saves and then advances via
      `nextStep('voice')` → `'strategy'` (Ruling R11: not the plan's original `'done'` — the
      spec's own state machine has `strategy` and `paywall` as real steps still to come).
- [x] **Business Profile** editable — `/settings/business` (Task 10). One page, every
      field at once rather than a wizard, since reviewing an existing profile is a
      different act from being interviewed for the first time. Fields, labels, helper
      text and validation all come from `INTERVIEW_QUESTIONS` via a new
      `BUSINESS_PROFILE_QUESTIONS` subset (Ruling R5) — nothing is redeclared, so the
      wizard and this form cannot drift apart. Deliberately does not edit
      `cadencePerWeek`/`preferredPostTime`/`timezone` (those persist to `profiles`, a
      different settings concern). A user with no `business_profiles` row yet (interview
      unfinished) gets a blank form rather than a redirect — saving upserts, creating the
      row on first save. Also adds a minimal `/settings` index (Ruling R12): `app-nav.tsx`
      has linked there since Milestone 1 and it 404'd (`docs/BACKLOG.md`); the index now
      lists the one section that exists, and Milestone 8 still owns the rest.
- [x] Onboarding state machine across the `profiles.onboarding_step` values — the
      dashboard (`/dashboard`, Task 11) reads the signed-in user's real
      `onboarding_step` and shows copy that is true for that step
      (`src/lib/onboarding/dashboard-copy.ts`), replacing a hard-coded "Finish
      onboarding" message that used to show even to a user who had finished. The
      `strategy` step — where the voice step actually lands a user, per Ruling
      R11 — is the common case this milestone produces, and its copy says
      Milestone 3 hasn't shipped yet without implying the user left anything undone.

## Milestone 3 — strategy

- [ ] Generate 4-5 content pillars
- [ ] 12-week arc: authority → problem-aware → offer-aware → invitation
- [ ] Lay out every dated slot at the chosen cadence (36-60 slots), each with theme, angle, format, one-line brief
- [ ] Draft only the next week in full — later weeks stay steerable
- [ ] `/calendar` and `/strategy` pages (currently 404)

## Milestone 4 — paywall

- [ ] Stripe checkout, single SKU, 14-day trial, card required
- [ ] Gate: free through the strategy, card before the first generated post and before connecting LinkedIn
- [ ] Webhook handling, trial state transitions — **TDD mandatory**
- [ ] Migrate `z.string().url()` → `z.url()` while editing the env schema (see `docs/BACKLOG.md`)
- [ ] Split `src/lib/env.ts` into public/server — Stripe key names shouldn't ship to the browser

## Milestone 5 — the writer

- [ ] OpenRouter gateway behind one internal `llm` module
- [ ] Brief stage — slot + strategy + business profile + active learnings
- [ ] Three voice-matched variants generated in parallel from one brief
- [ ] Variant selection recorded as a preference signal
- [ ] Optional polish pass against an explicit rubric
- [ ] Editor with a LinkedIn-accurate preview
- [ ] Exemplar matching by format heuristics (OpenRouter serves no embeddings)

## Milestone 6 — jobs and publishing

- [ ] `jobs` table, Vercel Cron worker, `FOR UPDATE SKIP LOCKED` claiming, backoff — **TDD mandatory**
- [ ] **Idempotency keys on every publish.** A retry must never double-post to a customer's feed — the highest-consequence invariant in the system
- [ ] `LinkedInAdapter` interface + `ShareOnLinkedInAdapter` — **TDD mandatory**
- [ ] OAuth connect flow, encrypted token storage, refresh — **TDD mandatory**
- [ ] Approve-then-publish: notification at the slot time, user taps, then it posts
- [ ] Timezone-correct approval nudges via Resend
- [ ] The 48-hour purge job — **TDD mandatory**

## Milestone 7 — attribution

- [ ] Short-link service on the short domain — **TDD mandatory**
- [ ] Click logging and deduplication — **TDD mandatory**
- [ ] CTA rewriting at publish time
- [ ] The "did this post start a conversation?" prompt, 3 days after publishing
- [ ] "What's working" dashboard band

## Milestone 8 — radar

- [ ] Exa behind a `SearchProvider` interface
- [ ] Daily per-user query built from niche + pillars
- [ ] LLM relevance filter that drafts an angle tying each item to the offer
- [ ] "What's happening in your world" dashboard band, one tap to a draft
- [ ] `/settings` page (currently 404)

## Milestone 9 — learnings

- [ ] Nightly synthesis from variant picks, edit diffs, click rates, self-reports
- [ ] Named, visible, user-editable learning records
- [ ] Inject active learnings into the brief stage

## Milestone 10 — blocked on CMA approval

- [ ] `CommunityManagementAdapter` — drops in behind the same interface
- [ ] Ingest `memberCreatorPostAnalytics` (impressions, reach, link clicks, followers gained, profile views)
- [ ] Performance-weighted exemplars
- [ ] Carousel studio — PDF document posts
- [ ] Image support

---

## Housekeeping

Small, non-blocking. Full context and triggers in `docs/BACKLOG.md`.

- [ ] Delete the unused `@vitejs/plugin-react` dev dependency
- [ ] Mount `<Toaster />` with a `ThemeProvider`, or strip `useTheme()` from `sonner.tsx`
- [ ] Capture baseline screenshots so visual regression can actually pass rather than being inconclusive (see the browser-verification rule in `CLAUDE.md`)
- [ ] Decide on mobile tap-target height — currently 32px, which passes WCAG AA (24px) but sits below the 44px platform guidance
- [ ] Correct the two unverified LinkedIn-portal claims in `docs/ACCOUNTS.md` once you have seen the real forms

---

## Explicitly not building in v1

Agencies and multi-tenancy · carousels and image generation (until CMA) · native
iOS/Android apps · a CRM · a free tier · credit metering · unattended
auto-publish · comment and DM automation · engagement pods.

Each is a deliberate exclusion recorded in the spec, not an oversight. If one
starts looking necessary, change the spec first.
