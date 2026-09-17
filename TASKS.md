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
- [x] **Razorpay — Plan at ₹1,499/mo, monthly, no trial.** `plan_TcyWDCJsx4fnbQ`,
      verified live 2026-09-17 against the test key pair: monthly, interval 1,
      `149900` INR, active. Test keys are in `.env`
- [ ] **YOU: create the Razorpay webhook** at
      `https://yourdomain.com/api/razorpay/webhook`, subscribed to all ten
      `subscription.*` events, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
      `docs/ACCOUNTS.md` §13. Razorpay cannot reach `localhost`, so this is the
      one leg that only works once deployed
- [ ] **YOU: repeat the plan and keys in live mode** before launch — the plan id
      differs between test and live, so `RAZORPAY_PLAN_ID` changes with the keys
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

## Milestone 3 — strategy ✅ complete

Plan: `docs/superpowers/plans/2026-09-16-linkbud-strategy.md` (10 tasks, rulings
R-M3-1..11). Twelve commits on `feat/strategy`, `npm run verify` green on each.

- [x] Migration 0004 — `strategies`, `pillars`, `slots`; RLS enabled and forced,
      twelve `authenticated` policies, check constraints verified live (a
      non-Monday start, eleven weekly themes, an unknown format or status and two
      slots on one day are all rejected; deleting a strategy cascades)
- [x] Strategy repository — `userId`-first throughout; `replaceStrategy` is one
      transaction that bumps the version; `saveSlotBriefs` filters on id AND
      user_id and reports the rows actually updated. Tests written first.
- [x] Generate 4-5 content pillars, positioning and the four-phase arc — one
      planning call (`generateStrategy`), enums and counts validated in code
- [x] 12-week arc: authority → problem-aware → offer-aware → invitation — phase
      derived from the week index (R-M3-3), described per user on the strategy row
- [x] Lay out every dated slot at the chosen cadence (36-60 slots), each with
      theme, angle, format, one-line brief — one model call per phase, run in
      parallel; dates are arithmetic in the user's timezone, anchored on the first
      Monday after today, fixed weekdays per cadence (R-M3-2); nothing is written
      until all five calls validate
- [x] Draft only the next week in full — `draftWeek` writes hook, key points,
      proof and CTA per slot (a full *brief*, not a post: posts sit behind the
      paywall, R-M3-4); later weeks keep the one-line brief
- [x] `/onboarding/strategy` — the `strategy` step now has a page (R-M3-5); the
      onboarding guard sends a strategy-step user there, and one tap builds the
      plan and lands on `/strategy` (R-M3-6)
- [x] `/strategy` and `/calendar` pages (no longer 404) — positioning, pillars,
      arc, this week's briefs, Regenerate behind a confirm (R-M3-7); the
      calendar lists all twelve weeks by phase with the current week marked
- [x] Dashboard shows the next scheduled slot (spec §6, R-M3-8); the radar copy
      no longer claims to wait on the strategy
- [x] Gateway: an error object inside a 200 response is surfaced with its code;
      a bounded, tested provider fallback (`src/server/llm/complete-with-fallback.ts`)
      retries once on a second free model for transient failures only, sticky
      within a generation; voice derivation uses it too
- [x] Browser QA — every route at 1440 and 375, console clean, no horizontal
      overflow, signed-out redirects to `/login`, both guards (strategy-step user
      forced to build; paywall user kept off the onboarding page), Regenerate
      dialog, brief-week retry, briefed and unbriefed layouts
- [x] Fixed on the way: the Milestone 1 nav overflowed a 375px viewport by
      ~250px on every authenticated page (`fix(app): keep the nav inside the
      viewport on phones`)
- [x] **Live check done 2026-09-17 — Regenerate watched landing on a fresh
      version, from the browser button.** On Gemini the whole six-call build
      took **27.7 s** and landed on version 2: four new pillars, new
      positioning and arc, week 1 briefed in full, proof drawn from the
      profile (the 31%→47% margin case, the 23 agencies) and
      "None from the profile fits this post -- do not invent any." where
      none did. `/calendar` shows all twelve weeks and 36 slots on
      Mon/Wed/Fri, 21 Sep to 11 Dec; the dashboard's Next up followed to the
      new week 1. Console clean, no horizontal overflow at 375 or 1440, no
      fallback in the server log — every call succeeded on the default model.
      **First attempted on OpenRouter, which could not do it:** two runs
      failed at 131 s and 156 s, with the pinned default answering `503
      Upstream error from Nvidia: Service temporarily overloaded` on every
      call (confirmed with a direct probe) and the free fallback then running
      past the gateway's 90 s timeout. Quota was not the cause — 45 of the 50
      daily free requests were unused. Those two runs verified the *failure*
      path end to end: the dialog names the version, the pending state holds
      while the build runs, the error is surfaced rather than swallowed, Try
      again works, and the existing strategy was left untouched, exactly as
      the dialog copy promises.
      **Not covered:** voice derivation was not re-exercised in the browser
      (the QA account is past that step); it uses the same gateway and the
      same one-call path, and the schema mechanism was proven against Gemini
      directly, but the button itself was not re-tapped. Nor was the Gemini
      fallback leg — an outage cannot be forced — so `gemini-2.5-pro` is
      covered by unit tests and a direct probe, not live.
- [x] **Gemini added as a second LLM provider** (spec amended 2026-09-17,
      `docs/ACCOUNTS.md` §15b). The gateway is still single — one module, one
      request shape, one validation path — but the provider behind it is chosen
      by which key is set, Gemini first. Both speak the same OpenAI-shaped
      `/chat/completions` with `response_format: json_schema`, so this is a
      table of two endpoints, not two clients. Error messages name the provider
      that actually answered; `isTransientProviderFailure` matches on the shape
      of the message, not the provider's name, so the fallback rules hold for
      both. `GEMINI_API_KEY` or `OPENROUTER_API_KEY` — the gateway names both
      when it has neither.

## Milestone 4 — paywall

**Changed 2026-09-17, before any code:** Stripe became Razorpay, the 14-day
trial was dropped, and the card moved **ahead of** the strategy. Spec §1.2, §3,
§5, §7 and §8 amended first, because the spec is binding and working around it
would have been the wrong move. Plan:
`docs/superpowers/plans/2026-09-17-linkbud-paywall.md`.

- [x] Env split into `env.public.ts` / `env.server.ts`, `z.string().url()` →
      `z.url()`, Stripe keys replaced by `RAZORPAY_*` — both `docs/BACKLOG.md`
      items this milestone owned, cleared
- [x] Migration 0005 — `subscriptions`, applied and verified live: RLS enabled
      AND forced, the status check constraint rejects an undocumented value
      (23514), the Razorpay id is unique (23505), `handle_deleted_user` lists it
      first. **Select-only under RLS**, unlike every other table: an insert
      policy scoped to the caller's own row would still let anyone holding the
      public anon key write `status = 'active'` onto themselves
- [x] Razorpay's eight-state vocabulary and the plan constants, client-safe.
      `isEntitled` tested as a table over the whole status list, so a ninth
      status added without deciding what it means for access fails the test
      rather than defaulting
- [x] Both HMAC-SHA256 signature checks, constant-time — **TDD**
- [x] `subscriptions` repository, `userId`-first **including the webhook path**:
      the subscription carries `notes.user_id`, Razorpay echoes it back, and the
      payload is signature-verified, so the write scopes on user AND
      subscription id rather than on the id alone — **TDD**
- [x] Razorpay HTTP client over plain `fetch`, no SDK, no new dependency — a
      factory so tests inject a fake `fetch` and none touches the network
- [x] Webhook mapping and route — **TDD**. The status comes from the entity,
      never the event name, because a cancellation scheduled for the end of the
      cycle arrives as `subscription.cancelled` while the entity is still
      `active`. `last_event_at` orders deliveries inside the UPDATE's WHERE
      clause, so a retried stale event cannot lock out a paying customer
- [x] Onboarding reordered to interview → samples → voice → **paywall** →
      strategy → done. Every step now has a page, which retires Ruling R3
- [x] Gate enforced at **three** points, not one: the `(onboarded)` layout, the
      `/onboarding/strategy` page that sits outside it, and both strategy server
      actions — a server action is a public HTTP endpoint, and what a crafted
      POST would skip past is six model calls billed to us
- [x] `/billing` — paywall, status, next charge date, cancel-at-cycle-end
- [x] **Browser QA, 2026-09-17 — a real test-mode payment went through end to
      end.** Signed out, `/billing` redirects to `/login`. An unentitled user is
      turned away from `/dashboard`, `/calendar`, `/strategy` **and**
      `/onboarding/strategy` — that last one checked in isolation with the step
      set to `strategy`, because it is the page guarding six model calls and the
      layout guard does not reach it. `/settings` stays reachable throughout,
      which is what makes the lock escapable.
      Checkout opened with the Test Mode ribbon and the correct terms: "a
      payment of ₹1,499 will be charged now… every month until 21 Aug 2036" —
      120 cycles, as configured. The modal took its accent from `--lb-accent`.
      Razorpay refused `4111 1111 1111 1111` with "not eligible for recurring
      payments" (a real product constraint, not our bug); the documented
      recurring card `4718 6091 0820 4366` went through RBI tokenisation and the
      Axis Bank OTP page. The confirm action landed the user on
      `/onboarding/strategy`, `status` became `active` with a real period
      (17 Sep → 16 Oct 2026), and `onboarding_step` advanced `paywall` →
      `strategy`. Building the strategy then succeeded (version 3, four pillars,
      week 1 briefed), proving the gate lets a paying user through.
      Abandoning a checkout and returning was covered by accident and works: the
      `created` row renders "Not started yet… Starting again is safe."
      Webhook, replayed locally with a signed payload: valid → 200 and written,
      tampered → 401, absent → 401, replayed → 200 with no damage, and an
      **older** event → 200 having changed nothing, with the row's `status` and
      `customer_id` untouched and the log saying "changed no rows". The ordering
      guard holds.
      Cancel → the dialog names the real date, status stays `active`, the page
      flips to "Access ends 16 October 2026", and `/dashboard` still loads.
      A `halted` subscription hard-locks a fully onboarded user to `/billing`
      and leads with "Payment stopped" rather than the feature list.
      Console clean, no horizontal overflow at 1440 or 375, Lighthouse
      accessibility and best-practices both 100 (axe covers roughly a third of
      WCAG, so that is necessary and not sufficient).
- [x] **Fixed during QA: `end_at` is not a cancellation.** The client inferred
      `cancelAtCycleEnd` from Razorpay's `end_at`, which is the end of the
      ten-year *term* and present on every healthy subscription — so `/billing`
      told a customer who had paid four minutes earlier that their access ended
      next month, and hid the Cancel button. Fetching the same subscription
      before and after a real cancellation proved the two responses are
      identical (`status` `active`, `end_at` 2036-08-16,
      `has_scheduled_changes` false in both), so there is no field to read: the
      type no longer carries the property at all, and the flag is written only
      where it is genuinely known.
- [x] **Fixed during QA: two tabs could lose a payment.** `startSubscription`
      created a fresh Razorpay subscription on every tap, and the row holds one.
      Two tabs both tapping Subscribe left the row on tab B's subscription; a
      payment in tab A was then rejected by `confirmSubscription` (the stored id
      no longer matched) *and* dropped by the webhook (it scopes on that same
      id). Money taken, no access, nothing in the logs shaped like a failure.
      Two changes, both verified in a real two-tab run: `startSubscription` now
      re-fetches an existing subscription still at `created` and hands the same
      one back, so both tabs drive one subscription and one mandate; and
      `confirmSubscription` proves ownership from Razorpay's own copy of
      `notes.user_id` rather than from our row — written server-side at
      creation, so nothing in the browser can influence it, and it survives the
      row moving on. Re-run end to end afterwards: one row, `active`,
      `cancel_at_cycle_end` false, step advanced.
- [ ] **YOU: the one leg that cannot be tested from localhost** — Razorpay
      cannot deliver a webhook to `127.0.0.1`, so delivery *from Razorpay's own
      servers* is untested until this is deployed. The endpoint itself is
      verified above against locally signed payloads.
      `RAZORPAY_WEBHOOK_SECRET` currently holds a local placeholder; replace it
      with the value from the dashboard webhook form when you create it.

## Milestone 5 — the writer

Plan: `docs/superpowers/plans/2026-09-17-linkbud-writer.md` (12 tasks, rulings
R-M5-1..13). Two items on the original list below were already stale: the
gateway was pulled forward into Milestone 2 and made provider-agnostic in
Milestone 3, and the "OpenRouter serves no embeddings" premise was revisited in
spec §3.2 on 2026-09-17 — Gemini does serve them, and the heuristic decision
stands anyway until measured and found wanting.

- [x] ~~OpenRouter gateway behind one internal `llm` module~~ — done in
      Milestone 2, provider-agnostic since Milestone 3
- [x] **Spec §6.1 and §4.4 amended first**, before any code, following
      Milestone 4's precedent: the pixel-accurate preview breaks the
      one-accent ban, and that ban is in the binding spec rather than only in
      `CLAUDE.md`. The exemption is bounded — LinkedIn's values are `--li-*`
      inside one `.linkedin-preview` block, no component holds a literal
      colour, nothing outside the block may use them, and there is no LinkedIn
      logo or wordmark
- [x] Migration 0006 — `posts`, `post_variants`; RLS enabled AND forced,
      `posts` four policies and `post_variants` three (**no update policy**,
      so the record of what the model produced cannot be rewritten under the
      signals computed from it). Verified live: every check constraint
      rejects its bad value, a second post on one slot is 23505, deleting a
      slot detaches the post with its snapshot intact, deleting a post takes
      its variants
- [x] **The regenerate/slots backlog entry is cleared, and the decision was
      taken before the FK was written as it asked.** `posts.slot_id` is
      nullable `on delete set null` with the slot's theme, format and date
      snapshotted, so rebuilding a strategy detaches drafts instead of
      destroying them; they stay readable under "Not on your current plan" on
      `/posts`, and the Regenerate dialog names how many will detach
- [x] Brief stage — a real model call (R-M5-1) that takes the slot's stored
      brief as input and is forbidden to change the angle or CTA destination,
      so a post cannot drift from the plan the user already approved.
      Persisted before the variants run, so a variant failure costs three
      calls to retry rather than four
- [x] Three voice-matched variants in parallel from one brief, each carrying a
      **named approach** — hook-forward, story-forward, proof-forward
      (R-M5-2). Without stable identities "the chosen index" is noise and
      Milestone 9 could never derive spec §4.8's own example
- [x] Variant selection recorded as a preference signal, with borrowed-span
      detection against the *unchosen* variants and an edit ratio, both
      computed in code at save time and both hand-rolled rather than adding a
      diff dependency — **TDD**
- [x] Optional polish pass against the explicit rubric, rendered side by side
      with the user's own text and changing nothing until they accept
- [x] Editor with a LinkedIn-accurate preview — the "…see more" fold, real
      line-break rendering, a live code-point character counter that warns
      over 3,000 and **never blocks a save**
- [x] Exemplar matching by format heuristics — length band, list vs narrative,
      opener type — taking up to three and fewer when the user has fewer
      (the two-written-samples path is legitimate). Deterministic, so
      regenerating twice uses the same exemplars — **tested**
- [x] `/posts` — every post, with detached drafts in their own group, readable
      in full, and deletable behind a labelled confirm
- [x] Write entry points on `/strategy`, `/calendar` and the dashboard, from
      one optional `writeHref` on the shared `SlotCard` (kept a Server
      Component: a `<Link>`, not a client button)
- [x] **Fixed on the way: the LLM error classifier was wrong on both
      providers.** `describe-strategy-error.ts` and
      `describe-derivation-error.ts` each tested for a missing-key string
      `activeProvider()` can never emit — dead code on every provider — and
      both matched `/OpenRouter returned 429/`, so once Gemini became the
      default a rate-limited user was told the reply was unexpected instead of
      to wait a minute. Classification now happens once, matching the
      structural part of the message rather than a provider's name, with the
      tests asserting every case over the `PROVIDERS` tuple so a third
      provider is covered by construction
- [x] **Fixed on the way: `docs/ARCHITECTURE.md` told implementers that RLS
      was the real authorisation boundary** and that a missing
      `where user_id = ...` was "a redundancy". That was written before the
      Prisma adoption and left behind by it; on the path the application
      actually uses it is false, and it is the most dangerous kind of stale
      doc. Also corrected: a deleted types placeholder described as live, the
      pre-split `src/lib/env.ts`, and "only `profiles` exists today" with six
      migrations shipped
- [x] **Fixed on the way: the dashboard's "drafting and publishing arrive in
      later releases" escaped its own rule.** The no-milestone-copy test only
      ever read `dashboardCopyForStep`, and that string sat inline in the
      page. The copy moved under the test and the test was widened to scan
      every string the module exports, so the next inline sentence cannot
      repeat it
- [x] **Browser QA, 2026-09-17 — two real generations went through end to
      end, and it found three bugs.** Signed out, `/write/[slotId]` and
      `/posts` both redirect to `/login`. With the subscription set to
      `halted`, both redirect to `/billing` — and, with a page already loaded
      *before* the halt, tapping Save wrote nothing: the action's own
      `requireEntitled` refused, which is enforcement point 3 verified against
      a live session rather than read in the source.
      Generation from the dashboard's "Write this post": four calls, three
      drafts at 896 / 1,062 / 1,016 characters with genuinely different
      openings — a blunt claim, "A founder sat across from me last month",
      and the 23-agency figure — so the named approaches produce materially
      different posts rather than three samples. The brief was sharpened but
      kept the same angle and CTA destination, which is the R-M5-1 guard
      doing its job. Proof came from the profile; nothing was invented.
      Selection, live counter, save, polish (side by side, accepted, promoted
      to the draft with the pending copy cleared and the outcome recorded),
      Mark ready → `approved` with `approved_at` stamped, then **editing the
      approved post reverted it to `draft` and cleared `approved_at`** — the
      invariant Milestone 6 depends on. Switching drafts with unsaved edits
      raised the confirm naming the target draft and left the text untouched
      on "Keep editing". Delete removed the post and its three variants.
      **Regenerate with a draft present: version 3 → 4, and the draft
      survived** — detached, all 866 characters intact, snapshot theme,
      format and date intact, three variants intact, listed under "Not on
      your current plan" and readable in full. The dialog counted it before
      confirming.
      Console clean on every page, all requests 200/304, Lighthouse
      accessibility and best-practices 100 on `/posts` and `/write` (axe
      covers roughly a third of WCAG, so that is necessary and not
      sufficient; tab order was walked by hand and follows visual order with
      every control labelled). An unbriefed week-2 slot refuses with a
      pointer to `/strategy` and offers no write button.
- [x] **Fixed during QA: the borrowed-span signal counted a draft's own words
      as borrowed.** A post where one 80-character line was pasted from
      another draft reported **575 of 1,004 characters borrowed, from both**
      unchosen variants. Eleven of the twelve matched runs were coincidental:
      all three variants come from one brief, so they independently produce
      near-identical sentences — one "borrowed" run was the brief's own call
      to action. A run now only counts if it appears in a draft the user did
      **not** choose and does **not** appear in the one they did. Re-measured
      on the same post: variant 1 only, 80 characters, exactly the line that
      was pasted. Every unit test passed before and after the fix — they
      tested the function against its own description rather than against
      what the signal is for, which is why only real generated drafts
      exposed it
- [x] **Fixed during QA: the editor overflowed a 375px viewport by 10px.**
      The layout declared grid columns only at `lg`, so at narrow widths the
      implicit column was `auto` and sized to max-content — the preview's
      author line carries an unbreakable email address and dragged the column
      to 361px inside a 327px container. An explicit
      `grid-cols-[minmax(0,1fr)]` at the base width fixes it; the comment in
      the file says what it is for, because deleting it as tidy-up brings the
      bug back silently
- [x] **Fixed during QA: number agreement in the Regenerate dialog** — with
      exactly one draft it read "The post you have written is kept … but
      **they** will no longer belong"
- [x] **A review of the finished branch found the same half-applied boundary
      CLAUDE.md warns about, in code written while quoting that warning.**
      `saveFinalText` reverted an approved post to `draft`, because `approved`
      means "this exact text was reviewed" or it means nothing.
      `resolvePolish` also writes `final_text`, and did not — so Mark ready →
      Polish it → Use the polished version left a post reading `approved`
      whose text was a rewrite the user had seen once in a compare pane and
      never approved. That is the one state Milestone 6 is told it can trust
      before posting to a real feed, and no crafted request was needed: the
      Polish button is not disabled once a post is marked ready. The same
      function left the preference signals describing the pre-polish text and
      recorded an outcome even with no polish pending. Both text-writing paths
      now go through one helper that owns the revert, the recomputation and
      clearing any pending polish. **Re-verified in a browser afterwards:**
      marked ready → `approved`; polished and accepted → back to `draft`,
      `approved_at` cleared, `edit_ratio` recomputed to 0.266 against the
      promoted text rather than left at 0
- [x] Three more from the same review: `saveFinalText` left a pending polish
      attached to text it had just replaced (two tabs — one polishes, the
      other saves — and accepting afterwards silently overwrote the saved
      edit); `selectVariant` reset seven signal fields and missed
      `polish_outcome`; and `replaceVariants` scoped its delete on both
      columns but its insert on neither, which is latent rather than live
      because both callers check first — "the callers are careful" is not an
      authorization model. `saveDraft` also took an unbounded string on a
      public endpoint, now capped at sixteen times LinkedIn's limit as a fault
      ceiling, not a writing rule. And `buildBrief`'s system prompt told the
      model it was being given a voice profile that the prompt builder never
      rendered — it accepted `voice` and dropped it. Every fix has a test, and
      each was confirmed to **fail** against the reintroduced defect rather
      than merely pass against the fix
- [ ] **YOU: nothing in this milestone is blocked on you.** Nothing here
      talks to LinkedIn or moves money, so unlike Milestones 0 and 4 there is
      no leg that only works once deployed

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
- [ ] `/settings` — the rest of the settings surface (a minimal index and the business profile editor exist since Milestone 2)

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
