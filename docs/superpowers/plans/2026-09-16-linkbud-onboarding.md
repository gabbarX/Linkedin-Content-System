# LinkBud Milestone 2 — Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user signs in, answers a nine-topic guided interview one question at a time, pastes writing samples, and ends with an editable Business Profile and Voice Profile stored in the database — the inputs Milestone 3's strategy generator requires.

**Architecture:** Three new tables plus a resumable interview draft on `profiles`. A thin OpenRouter gateway behind an internal interface, pulled forward from Milestone 5 (see the spec's amended §8). Voice derivation splits in two: arithmetic over the samples is computed in code, judgement fields come from the model. All data access goes through `userId`-first repositories, because Prisma bypasses RLS.

**Tech Stack:** Next.js 16 App Router, Prisma 7.10, Supabase Postgres, Zod, OpenRouter over `fetch`, Tailwind v4 + Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-linkbud-design.md` — §4.1 `onboarding`, §5 data model, §8 build order (amended 2026-09-16 to move the LLM gateway here).

## Global Constraints

- **Every repository function takes `userId` as its first parameter and scopes on it.** Prisma connects as a BYPASSRLS role; a missing scope is a cross-customer data leak, not a bug.
- **Never import `@/server/db/client` outside `src/server/db`.** ESLint fails the build.
- **Every new table: `enable row level security` AND `force row level security`**, policies `to authenticated` using `(select auth.uid()) = user_id`, both `USING` and `WITH CHECK` on updates. `security definer` functions pin `set search_path = ''`.
- **No new npm dependencies.** OpenRouter is an HTTP API; use `fetch`.
- `Button` is Base UI-backed and has **no `asChild`**. Render a link as `<Button render={<Link href="/x" />}>`.
- **No hard-coded hex or `oklch()`.** Use `--lb-*` tokens. No gradients, no glassmorphism, no emoji as iconography, one accent colour.
- `getServerEnv()` / `getPublicEnv()` are called **inside function bodies only**, never at module scope.
- `npm run verify` passes before every commit. Conventional messages. **No attribution trailers.**
- Browser-verify anything with runtime behaviour. `/auth/dev-login` provides a session while the magic link is broken.
- Cadence is 3, 4 or 5. The database already rejects anything else on `profiles`.

---

### Task 1: Migration 0003 — onboarding schema

**Files:**
- Create: `supabase/migrations/0003_onboarding.sql`
- Modify: `prisma/schema.prisma` (via `npx prisma db pull`)

**Interfaces:**
- Produces: tables `business_profiles`, `voice_profiles`, `writing_samples`; column `profiles.interview_draft jsonb`.

> **Note for the human:** `profiles.interview_draft` is a column addition that was not in the approved table list. It exists because the interview is one question per screen and must survive a closed tab. The alternative — making every `business_profiles` column nullable until the interview completes — trades a clean schema for a dirty one. Flag it before applying if you disagree.

- [ ] **Step 1: Write the migration**

```sql
-- Milestone 2. One business profile and one voice profile per user: v1 is a
-- single solo coach with a single LinkedIn profile (spec §1.1), so `unique` on
-- user_id is the correct constraint and not a limitation to design around.
--
-- No foreign key to auth.users, for the reason given in 0002: a cross-schema FK
-- drags all 27 Supabase Auth tables into schema.prisma. user_id holds
-- auth.users.id and ownership is enforced by the repositories and by RLS.

create table public.business_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique,
  offer          text not null,
  price_band     text,
  icp            text not null,
  transformation text not null,
  proof          text,
  point_of_view  text,
  taboos         text[] not null default '{}',
  cta_target     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Numeric fields are measured from the samples, not asked of the model.
-- Enumerated fields carry check constraints so a bad model response is a
-- database error rather than a value the writer silently misreads later.
create table public.voice_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique,
  avg_sentence_length numeric(5,2),
  max_sentence_length integer,
  avg_paragraph_lines numeric(5,2),
  sentence_rhythm     text not null default 'varied'
                      check (sentence_rhythm in ('short-punchy','varied','long-flowing')),
  line_break_style    text not null default 'grouped'
                      check (line_break_style in ('single-line','grouped','dense')),
  opener_patterns     text[] not null default '{}',
  closer_patterns     text[] not null default '{}',
  vocabulary_markers  text[] not null default '{}',
  banned_phrases      text[] not null default '{}',
  emoji_policy        text not null default 'none'
                      check (emoji_policy in ('none','sparing','frequent')),
  hashtag_policy      text not null default 'none'
                      check (hashtag_policy in ('none','sparing','frequent')),
  pov_strength        text not null default 'balanced'
                      check (pov_strength in ('measured','balanced','contrarian')),
  humour_level        text not null default 'none'
                      check (humour_level in ('none','dry','playful')),
  formality           text not null default 'conversational'
                      check (formality in ('formal','conversational','casual')),
  derived_at          timestamptz,
  user_edited         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Counts are stored rather than recomputed: they are the exemplar-matching
-- features Milestone 5 selects on, and recomputing them on every read would
-- make that a table scan with a parser attached.
create table public.writing_samples (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  content       text not null check (length(trim(content)) > 0),
  source        text not null default 'pasted' check (source in ('pasted','written')),
  word_count    integer not null default 0,
  char_count    integer not null default 0,
  line_count    integer not null default 0,
  emoji_count   integer not null default 0,
  hashtag_count integer not null default 0,
  created_at    timestamptz not null default now()
);

create index writing_samples_user_id_idx on public.writing_samples (user_id);

-- Partial answers, so a closed tab does not cost the user nine questions.
-- Cleared when the interview completes and business_profiles is written.
alter table public.profiles add column interview_draft jsonb;

alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;
alter table public.voice_profiles    enable row level security;
alter table public.voice_profiles    force row level security;
alter table public.writing_samples   enable row level security;
alter table public.writing_samples   force row level security;
```

- [ ] **Step 2: Add the policies**

Four policies per table, in the same shape as `0001`. `(select auth.uid())` is wrapped in a subquery deliberately — it is evaluated once per statement instead of once per row.

```sql
create policy "business_profiles_select_own" on public.business_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "business_profiles_insert_own" on public.business_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "business_profiles_update_own" on public.business_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "business_profiles_delete_own" on public.business_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);
```

Repeat verbatim for `voice_profiles` and `writing_samples`, changing only the table and policy names.

- [ ] **Step 3: Reuse the existing updated_at trigger**

`public.touch_updated_at()` already exists from `0001`. Attach it; do not redefine it.

```sql
create trigger business_profiles_touch_updated_at before update on public.business_profiles
  for each row execute function public.touch_updated_at();
create trigger voice_profiles_touch_updated_at before update on public.voice_profiles
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 4: Apply and introspect**

```bash
npx prisma db execute --file supabase/migrations/0003_onboarding.sql
npx prisma db pull
npx prisma generate
```

- [ ] **Step 5: Verify against the live catalog, do not assume**

Query `pg_class.relrowsecurity` and `relforcerowsecurity` for all three tables, and `pg_policies` for twelve policies scoped to `{authenticated}`. Confirm a check constraint rejects `emoji_policy = 'sometimes'`. Report what the database returned.

- [ ] **Step 6: Commit** — `feat(db): add the onboarding schema`

---

### Task 2: Repositories

**Files:**
- Create: `src/server/db/repositories/business-profiles.ts`, `voice-profiles.ts`, `writing-samples.ts`
- Modify: `src/server/db/repositories/profiles.ts` (interview draft accessors)

**Interfaces:**
- Consumes: `getPrisma()` from `../client`.
- Produces:
  - `getBusinessProfile(userId): Promise<BusinessProfile | null>`
  - `upsertBusinessProfile(userId, input: BusinessProfileInput): Promise<BusinessProfile>`
  - `getVoiceProfile(userId): Promise<VoiceProfile | null>`
  - `upsertVoiceProfile(userId, input: VoiceProfileInput): Promise<VoiceProfile>`
  - `listWritingSamples(userId): Promise<WritingSample[]>`
  - `addWritingSamples(userId, samples: NewWritingSample[]): Promise<WritingSample[]>`
  - `deleteWritingSample(userId, sampleId): Promise<void>`
  - `getInterviewDraft(userId): Promise<InterviewDraft | null>`
  - `saveInterviewDraft(userId, draft: InterviewDraft): Promise<void>`
  - `clearInterviewDraft(userId): Promise<void>`

- [ ] **Step 1: Follow the existing shape**

Read `profiles.ts` first. Match it: `import 'server-only'`, a snake_case `Row` type, a `toX(row)` mapper, `userId` first on every function. Union types for the enumerated columns so a bad value is a type error rather than a runtime database error.

- [ ] **Step 2: Scope every write**

`deleteWritingSample` takes both `userId` and `sampleId` and must filter on both:

```ts
export async function deleteWritingSample(userId: string, sampleId: string): Promise<void> {
  // Both, always. Filtering on id alone would let any user delete any row by
  // guessing a uuid -- RLS is not there to catch it on this path.
  await getPrisma().writing_samples.deleteMany({
    where: { id: sampleId, user_id: userId },
  })
}
```

- [ ] **Step 3: Commit** — `feat(db): add onboarding repositories`

---

### Task 3: The LLM gateway

**Files:**
- Create: `src/server/llm/client.ts`, `src/server/llm/types.ts`
- Test: `src/server/llm/client.test.ts`

**Interfaces:**
- Produces: `completeJson<T>(opts: { system: string; user: string; schema: ZodType<T>; model?: string }): Promise<T>`

- [ ] **Step 1: Write the failing test**

Mock `fetch`. The gateway's job is to return typed, validated data or throw — never to hand back something shaped wrong.

```ts
it('parses and validates a JSON response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"tone":"dry"}' } }] }),
  }))
  const result = await completeJson({
    system: 's', user: 'u', schema: z.object({ tone: z.string() }),
  })
  expect(result).toEqual({ tone: 'dry' })
})

it('throws when the model returns text that does not match the schema', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"tone":42}' } }] }),
  }))
  await expect(completeJson({ system: 's', user: 'u', schema: z.object({ tone: z.string() }) }))
    .rejects.toThrow(/schema/i)
})

it('throws a named error when OPENROUTER_API_KEY is absent', async () => { /* ... */ })
it('throws on a non-ok HTTP response, including the status', async () => { /* ... */ })
it('strips a ```json fence before parsing', async () => { /* ... */ })
```

The fence test is not hypothetical — models wrap JSON in code fences regardless of instructions.

- [ ] **Step 2: Run it, confirm it fails**

- [ ] **Step 3: Implement**

`import 'server-only'`. Read `getServerEnv().OPENROUTER_API_KEY` inside the function; throw a message naming the variable and pointing at `docs/ACCOUNTS.md` if it is absent. POST to `https://openrouter.ai/api/v1/chat/completions` with `response_format: { type: 'json_object' }`. Default model in one exported constant, not scattered. No retry loop and no streaming — this is the minimal gateway Milestone 5 will build on, and a retry that re-bills on every failure is the wrong default to bake in.

- [ ] **Step 4: Tests pass. Commit** — `feat(llm): add the OpenRouter gateway`

---

### Task 4: Voice derivation

**Files:**
- Create: `src/server/onboarding/measure-samples.ts`, `src/server/onboarding/derive-voice.ts`
- Test: `src/server/onboarding/measure-samples.test.ts`

**Interfaces:**
- Consumes: `completeJson` (Task 3), `WritingSample` (Task 2).
- Produces: `measureSamples(samples: string[]): VoiceMeasurements`, `deriveVoiceProfile(samples: string[]): Promise<VoiceProfileInput>`

- [ ] **Step 1: Write the failing tests for the measurements**

These are pure functions over text, so they are properly testable — unlike the model call, where asserting a non-empty string is theatre.

```ts
it('measures average and maximum sentence length in words', () => {
  const m = measureSamples(['Short one. This sentence is noticeably longer than that one.'])
  expect(m.avgSentenceLength).toBeCloseTo(5.5, 1)
  expect(m.maxSentenceLength).toBe(9)
})

it('counts emoji by code point, not by UTF-16 unit', () => {
  // '🚀'.length === 2. A naive character loop double-counts every emoji and
  // reports 'frequent' for a user who used two.
  expect(measureSamples(['Ship it 🚀🎉']).emojiCount).toBe(2)
})

it('classifies line-break style from paragraph length', () => {
  expect(measureSamples(['a\n\nb\n\nc']).lineBreakStyle).toBe('single-line')
})

it('derives hashtag policy from frequency per post, not total count', () => {
  expect(measureSamples(['#a #b #c #d #e']).hashtagPolicy).toBe('frequent')
  expect(measureSamples(['no tags here', 'still none']).hashtagPolicy).toBe('none')
})

it('ignores empty and whitespace-only samples rather than dividing by zero', () => {
  expect(() => measureSamples(['   ', ''])).not.toThrow()
})
```

- [ ] **Step 2: Run them, confirm they fail**

- [ ] **Step 3: Implement `measureSamples`**

Use `Intl.Segmenter` for sentence and grapheme segmentation — it is in the Node runtime, needs no dependency, and handles the emoji case correctly.

- [ ] **Step 4: Implement `deriveVoiceProfile`**

Call `completeJson` for the judgement fields only — `sentence_rhythm`, `pov_strength`, `humour_level`, `formality`, `vocabulary_markers`, `opener_patterns`, `closer_patterns`, `banned_phrases` — with a Zod schema whose enums exactly match the database check constraints. Merge with `measureSamples` output, which always wins for the numeric fields. Set `derived_at`.

No test asserts the model's judgement. Per spec §7, that is theatre.

- [ ] **Step 5: Commit** — `feat(onboarding): derive the voice profile from samples`

---

### Task 5: The interview definition

**Files:**
- Create: `src/lib/onboarding/questions.ts`
- Test: `src/lib/onboarding/questions.test.ts`

**Interfaces:**
- Produces: `INTERVIEW_QUESTIONS` (ordered), `InterviewAnswers`, `interviewAnswersSchema` (Zod), `questionAt(index)`

- [ ] **Step 1: Define the nine questions as data, not as nine components**

One ordered array drives the wizard, the progress indicator, validation, and the mapping to `business_profiles`. Each entry: `id`, `prompt`, `helper`, `field`, `input` (`'text' | 'textarea' | 'list' | 'choice' | 'time' | 'timezone'`), `required`, and `options` where it is a choice.

The nine, from spec §4.1: offer and price band, ICP, transformation, proof and results, point of view, taboos, CTA target, cadence, preferred posting time and timezone.

- [ ] **Step 2: Test the contract the wizard depends on**

```ts
it('covers every spec §4.1 topic exactly once', () => { /* ... */ })
it('maps every answer field to a business_profiles column or a profiles column', () => { /* ... */ })
it('offers only cadences the database accepts', () => {
  // profiles.cadence_per_week has a 3-5 check constraint. An option outside it
  // reaches the user as a choice and fails on save.
  expect(cadenceQuestion.options.map(o => o.value)).toEqual([3, 4, 5])
})
```

- [ ] **Step 3: Commit** — `feat(onboarding): define the guided interview`

---

### Task 6: The onboarding state machine

**Files:**
- Create: `src/lib/onboarding/steps.ts`, `src/app/(app)/onboarding/layout.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Test: `src/lib/onboarding/steps.test.ts`

**Interfaces:**
- Consumes: `OnboardingStep` from `repositories/profiles.ts`.
- Produces: `nextStep(current)`, `routeForStep(step)`, `isComplete(step)`

- [ ] **Step 1: Write the failing tests**

```ts
it('routes each step to its page', () => {
  expect(routeForStep('interview')).toBe('/onboarding/interview')
  expect(routeForStep('done')).toBe('/dashboard')
})

it('never routes an unfinished user to the dashboard', () => {
  for (const step of ONBOARDING_STEPS.filter(s => s !== 'done')) {
    expect(routeForStep(step)).not.toBe('/dashboard')
  }
})

it('advances strictly forward', () => {
  expect(nextStep('interview')).toBe('samples')
  expect(nextStep('done')).toBe('done')
})
```

- [ ] **Step 2: Implement, then guard the routes**

`(app)/layout.tsx` already fetches the profile. Add: if the profile is incomplete and the current path is not already an onboarding route, redirect to `routeForStep(profile.onboardingStep)`. Guard against a redirect loop — the onboarding routes must be exempt.

`paywall` routes to `/dashboard` for now; Milestone 4 owns that step. Leave a comment saying so.

- [ ] **Step 3: Browser-verify with `/auth/dev-login`**

The dev user sits at `interview`. Confirm `/dashboard` redirects to `/onboarding/interview`, and that the onboarding route itself does not loop. Report what you saw.

- [ ] **Step 4: Commit** — `feat(onboarding): add the step state machine and route guard`

---

### Task 7: The interview wizard

**Files:**
- Create: `src/app/(app)/onboarding/interview/page.tsx`, `src/components/onboarding/question-card.tsx`, `src/components/onboarding/progress-dots.tsx`
- Create: `src/app/(app)/onboarding/interview/actions.ts` (server actions)

- [ ] **Step 1: One question per screen, answers saved on every advance**

Server action `saveAnswer(questionId, value)` writes into `profiles.interview_draft`. The index lives in the URL (`?q=3`) so Back works and a refresh does not restart the interview.

- [ ] **Step 2: Completing the interview**

The final advance validates the whole draft with `interviewAnswersSchema`, writes `business_profiles` via `upsertBusinessProfile`, writes cadence, posting time and timezone onto `profiles`, clears `interview_draft`, sets `onboarding_step = 'samples'`, and redirects.

- [ ] **Step 3: Design**

Tokens only. One accent. Progress as dots, not a percentage bar. Lucide icons if any — no emoji. Match the calm-editorial direction in `docs/DESIGN-SYSTEM.md`.

- [ ] **Step 4: Browser-verify**

Walk all nine questions at desktop and phone width. Close the tab mid-interview, reopen, confirm the answers survived. Check the console is clean. Screenshot both widths.

- [ ] **Step 5: Commit** — `feat(onboarding): add the guided interview wizard`

---

### Task 8: Writing samples

**Files:**
- Create: `src/app/(app)/onboarding/samples/page.tsx`, `actions.ts`, `src/components/onboarding/sample-list.tsx`

- [ ] **Step 1: The rule from spec §4.1**

Five to ten pasted posts, **or** two written fresh. Enforce in a Zod schema shared by the server action and the client, so the message is identical in both places. The counts are computed by `measureSamples` and stored per sample.

- [ ] **Step 2: On completion**

Call `deriveVoiceProfile`, `upsertVoiceProfile`, set `onboarding_step = 'voice'`, redirect. Derivation is a model call and takes seconds: show a pending state, and make a failed derivation recoverable rather than a dead end — the user must not lose the samples they just pasted.

- [ ] **Step 3: Browser-verify, including the failure path**

With `OPENROUTER_API_KEY` absent, confirm the samples are saved and the user sees a real message rather than a spinner that never resolves.

- [ ] **Step 4: Commit** — `feat(onboarding): add writing-sample capture`

---

### Task 9: The Voice Profile editor

**Files:**
- Create: `src/app/(app)/onboarding/voice/page.tsx`, `actions.ts`, `src/components/onboarding/voice-editor.tsx`

- [ ] **Step 1: Every field editable, because that is the point**

Spec §4.1: "when output feels wrong, the user has a dial to turn". Enumerated fields are selects whose options match the check constraints exactly. Array fields are add/remove lists. Numeric measurements are shown read-only with a note that they were measured from the samples.

Any edit sets `user_edited = true`, so a later re-derivation knows not to silently overwrite a human decision.

- [ ] **Step 2: Advance to `done`**

Set `onboarding_step = 'done'` and redirect to `/dashboard`. Milestone 3 will insert `strategy` between these.

- [ ] **Step 3: Browser-verify** — edit a field, save, reload, confirm it persisted. Both widths, console clean.

- [ ] **Step 4: Commit** — `feat(onboarding): add the voice profile editor`

---

### Task 10: The Business Profile editor

**Files:**
- Create: `src/app/(app)/settings/business/page.tsx`, `actions.ts`

- [ ] **Step 1: Reachable after onboarding**

Same fields as the interview, presented as one editable form rather than a wizard — the user is reviewing, not being interviewed. This is the first real page under `/settings`, which currently 404s (`docs/BACKLOG.md`).

- [ ] **Step 2: Browser-verify. Commit** — `feat(onboarding): add the business profile editor`

---

### Task 11: Dashboard completion state

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace the hard-coded empty states**

"Nothing to approve yet. Finish onboarding to get your first week." is currently shown to everyone including users who have finished. Read the profile and the business profile and show the state that is actually true.

- [ ] **Step 2: Browser-verify both states. Commit** — `feat(app): reflect onboarding state on the dashboard`

---

## Done when

- A new user signs in, completes nine questions, pastes samples, reviews a derived voice profile, and lands on the dashboard with `onboarding_step = 'done'`.
- `business_profiles`, `voice_profiles` and `writing_samples` each hold exactly one user's rows, verified live.
- `npm run verify` green. Every route browser-verified at desktop and phone width.
- `TASKS.md` reflects reality.

## Deliberately not in this milestone

Strategy generation (Milestone 3), the paywall step (Milestone 4), the writer (Milestone 5), re-deriving a voice profile from published posts (needs analytics, Milestone 10).
