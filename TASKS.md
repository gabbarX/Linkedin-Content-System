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
- [ ] Supabase project created
- [ ] Google OAuth client created, added to Supabase
- [ ] Vercel project + environment variables
- [ ] **Apply `supabase/migrations/0001_profiles.sql`**, then confirm `relrowsecurity` is `true`
- [ ] Regenerate `src/lib/types/database.ts` with `supabase gen types`

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

## Milestone 2 — onboarding

**Do these two first, before any feature code:**

- [ ] **Complete `docs/ACCOUNTS.md` steps 7-12 and perform the first live sign-in.**
      Nothing in the auth path has ever executed — not the magic link, not Google
      OAuth, not the code exchange, not session refresh, not the `(app)` guard, not
      RLS, not the signup trigger. Milestone 1 verified them offline only. This is
      the test that matters.
- [x] **Close the spec §7 gap** — `.claude/hooks/commit-gate.mjs` is a `PreToolUse`
      hook that runs the full gate before any `git commit` and exits 2 to block on
      failure. Verified end to end: allows on green, blocks on red, escape hatch
      warns. Fixed a latent defect found on the way — `vitest.config.ts` used ESM
      syntax in a file Node loads as CommonJS, which broke under Vite's native
      config loader; it is now `vitest.config.mts`.

Then:

- [ ] Guided interview — offer, ICP, transformation, proof, POV, taboos, CTA target, cadence, timezone
- [ ] Writing-sample paste (5-10 posts, or 2 written fresh)
- [ ] Derive the **Voice Profile** (sentence rhythm, openers, line breaks, vocabulary, emoji/hashtag policy, banned phrases)
- [ ] Derive the **Business Profile**
- [ ] Both editable — when output feels wrong, there must be a dial to turn
- [ ] Onboarding state machine across the `profiles.onboarding_step` values

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
- [ ] Thread the `Database` type through the three Supabase client factories
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
