# LinkBud Milestone 3 — Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user who has finished the interview and voice review taps one button and receives their 12-week content strategy — 4–5 pillars, a four-phase narrative arc, every dated slot at their chosen cadence with theme, angle, format and one-line brief, and the coming week's slots briefed in full — then sees it on `/strategy` and `/calendar`.

**Architecture:** Three new tables (`strategies`, `pillars`, `slots`) behind one `userId`-first repository. Generation is one planning call (pillars, arc, weekly themes) plus one call per arc phase for that phase's slots, run in parallel, validated in code and written in a single transaction — nothing is persisted until the whole plan validates. Dates are arithmetic in the user's timezone, never asked of the model. Briefing the coming week is a separate, retryable model call so a failure there never costs the strategy.

**Tech Stack:** Next.js 16 App Router, Prisma 7.10, Supabase Postgres, Zod 4, the existing OpenRouter gateway (`completeJson`), Tailwind v4 + Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-linkbud-design.md` — §4.2 `strategy`, §5 data model, §6 planning surfaces, §1.2 paywall position (which is why this milestone drafts *briefs*, not posts).

## Global Constraints

- **Every repository function takes `userId` as its first parameter and scopes on it.** Prisma connects as a BYPASSRLS role; a missing scope is a cross-customer data leak, not a bug.
- **Never import `@/server/db/client` outside `src/server/db`.** ESLint fails the build.
- **Every new table: `enable row level security` AND `force row level security`**, policies `to authenticated` using `(select auth.uid()) = user_id`, both `USING` and `WITH CHECK` on updates. `security definer` functions pin `set search_path = ''`.
- **No new npm dependencies.**
- `Button` is Base UI-backed and has **no `asChild`**. Render a link as `<Button nativeButton={false} render={<Link href="/x" />}>`.
- **No hard-coded hex or `oklch()`.** Use `--lb-*` tokens. No gradients, no glassmorphism, no emoji as iconography, one accent colour, Lucide for icons.
- `getServerEnv()` / `getPublicEnv()` are called **inside function bodies only**, never at module scope.
- Client Components may only `import type` from anything that transitively imports `server-only` (`src/server/**`, `src/lib/onboarding/voice-edit.ts`). Client-safe vocabulary lives in `src/lib/**`.
- `npm run verify` passes before every commit. Conventional messages. **No attribution trailers.**
- Browser-verify anything with runtime behaviour, at desktop and phone width, console clean.
- Nothing in this milestone talks to LinkedIn. The 48-hour purge rule does not apply to any table here: every row is our own generated content.

---

## Rulings taken while planning (2026-09-16)

The spec fixes *what* the strategy contains; these are the decisions it leaves open. Each is numbered so a later review can point at one.

- **R-M3-1 — Generation shape.** One planning call returns positioning, 4–5 pillars, the four phase descriptions and 12 weekly themes. Four phase calls (weeks 1–3, 4–6, 7–9, 10–12) each return that phase's slots — 3 weeks × cadence, so 9–15 slots — given the plan as context. They run in parallel. A single call for 36–60 slots was rejected: measured free-model throughput puts it near the gateway's 90 s timeout, and one long call has no partial-progress story. Nothing is written until every call has validated; the whole result is then written in one transaction. A retry re-runs everything, which costs a few free-tier calls and no user data.
- **R-M3-2 — Dates are computed, not generated.** Weeks are anchored on Mondays. Week 1 begins on the first Monday strictly after "today" in the user's timezone, so the plan always starts with a full week ahead. Slots fall on fixed weekdays per cadence — 3: Mon/Wed/Fri, 4: Mon/Tue/Thu/Fri, 5: Mon–Fri — because the interview does not ask for posting days and asking now would delay the deliverable. `slots.scheduled_on` is a `date`; the time of day comes from `profiles.preferred_post_time` at scheduling time (Milestone 6).
- **R-M3-3 — The arc phase is derived from the week index** (1–3 authority, 4–6 problem-aware, 7–9 offer-aware, 10–12 invitation), not stored per slot. The phase descriptions themselves are stored on the strategy row as four text columns.
- **R-M3-4 — "Drafted in full" means a full brief, not a post.** Spec §1.2 puts the card before "any post is generated"; the strategy is delivered free, before the paywall. So `draftWeek` produces, per slot, a hook direction, key points, the proof to lean on and a CTA — everything the Milestone 5 writer needs — and stores them on the slot (`status = 'briefed'`). Post text is Milestone 5.
- **R-M3-5 — The `strategy` step gets its page.** `PAGE_ROUTE_BY_STEP.strategy = '/onboarding/strategy'`, so `routeForStep('strategy')` and `onboardingRouteFor('strategy')` both resolve there and the dashboard guard sends a strategy-step user to build one. This is the extension point `steps.ts` documented for exactly this milestone. `paywall` keeps its `/dashboard` fallback (Ruling R3) until Milestone 4.
- **R-M3-6 — After generation the user advances to `paywall` and lands on `/strategy`**, not the dashboard: the strategy is the day-one deliverable and should be the first thing seen. `routeForStep('paywall')` is unchanged; the action redirects explicitly.
- **R-M3-7 — One strategy per user, versioned.** `strategies.user_id` is unique and `version` increments on regeneration, which replaces pillars and slots in the same transaction. Regenerate exists (a labelled button behind a confirm dialog on `/strategy`) because a plan the user dislikes with no recourse is a dead end — spec §4.1's "a dial to turn". Recorded in `docs/BACKLOG.md`: once posts hang off slots (Milestone 5), regenerate must not orphan them.
- **R-M3-8 — The dashboard shows the next slot.** Spec §6 lists "next scheduled slot" in band one. When a strategy exists, "Needs you now" shows the next dated slot with a link to the calendar. The radar band's copy no longer claims to wait for the strategy — that would be false the moment one exists.
- **R-M3-9 — The strategy snapshots `cadence_per_week`.** Slots were laid out at a cadence; if the profile's cadence changes later the existing plan is still internally consistent, and a regenerate picks up the new value.
- **R-M3-10 — The three `/strategy` and `/calendar` surfaces live under `(app)/(onboarded)/`**, so they inherit the onboarding guard, and `/onboarding/strategy` lives beside the other onboarding steps outside it (Ruling R8's loop-proof structure).
- **R-M3-11 — `maxDuration = 120`** is exported from the two pages whose server actions call the model, because Next applies a page's `maxDuration` to the actions invoked from it. Locally irrelevant; on Vercel it is the difference between a plan and a 504.

---

### Task 1: Vocabulary and schedule arithmetic (pure, client-safe)

**Files:**
- Create: `src/lib/strategy/vocabulary.ts`, `src/lib/strategy/schedule.ts`
- Test: `src/lib/strategy/vocabulary.test.ts`, `src/lib/strategy/schedule.test.ts`

**Interfaces — produces:**
```ts
export const WEEKS_IN_STRATEGY = 12
export const ARC_PHASES = ['authority','problem-aware','offer-aware','invitation'] as const
export type ArcPhase = (typeof ARC_PHASES)[number]
export const SLOT_FORMATS = ['story','how-to','list','contrarian','case-study','question'] as const
export type SlotFormat = (typeof SLOT_FORMATS)[number]
export const SLOT_STATUSES = ['planned','briefed'] as const
export type SlotStatus = (typeof SLOT_STATUSES)[number]
export const PHASE_META: Record<ArcPhase, { label: string; weeks: [number, number]; purpose: string }>
export const FORMAT_META: Record<SlotFormat, { label: string; description: string }>
export function phaseForWeek(weekIndex: number): ArcPhase       // throws outside 1..12
export function weeksForPhase(phase: ArcPhase): number[]         // e.g. [4,5,6]
export const MIN_PILLARS = 4, MAX_PILLARS = 5

export type IsoDate = string                                     // 'YYYY-MM-DD'
export function todayInTimeZone(timeZone: string, now?: Date): IsoDate
export function firstMondayAfter(date: IsoDate): IsoDate         // strictly after
export function weekdayOffsetsFor(cadence: 3 | 4 | 5): number[]  // 3 → [0,2,4], 4 → [0,1,3,4], 5 → [0,1,2,3,4]
export function scheduleSlots(startsOn: IsoDate, cadence: 3|4|5): { weekIndex: number; position: number; scheduledOn: IsoDate }[]
export function addDays(date: IsoDate, days: number): IsoDate
export function upcomingWeekIndex(startsOn: IsoDate, today: IsoDate): number | null // first week whose Monday+6 >= today; null if the plan is over
export function formatIsoDate(date: IsoDate, opts?: { weekday?: boolean }): string  // 'Mon 21 Sep', deterministic en-GB, UTC
```

- [ ] **Step 1: Write the failing tests** — `phaseForWeek(1..3) === 'authority'`, `phaseForWeek(12) === 'invitation'`, throws on 0 and 13; `weeksForPhase` round-trips `phaseForWeek`; `weekdayOffsetsFor` lengths equal cadence and are strictly increasing weekdays; `scheduleSlots` yields `12 * cadence` rows, all dates distinct, every date's UTC weekday is Mon–Fri, week 1 starts on `startsOn`; `firstMondayAfter('2026-09-14')` (a Monday) is `'2026-09-21'`, `firstMondayAfter('2026-09-20')` (a Sunday) is `'2026-09-21'`; `todayInTimeZone('Pacific/Kiritimati', new Date('2026-09-16T12:00:00Z'))` is `'2026-09-17'` while `'Pacific/Honolulu'` gives `'2026-09-16'` — the timezone test that matters; `upcomingWeekIndex` is 1 before the plan starts, 1 during week 1, 2 on the Monday of week 2, null after week 12's Sunday.
- [ ] **Step 2: Run, confirm failure.** `npx vitest run src/lib/strategy`
- [ ] **Step 3: Implement.** Dates are manipulated as `'YYYY-MM-DD'` strings via `Date.UTC` so the server's own timezone never enters; `todayInTimeZone` uses `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`.
- [ ] **Step 4: Tests pass. Commit** — `feat(strategy): add the arc vocabulary and schedule arithmetic`

---

### Task 2: Migration 0004 — strategy schema

**Files:**
- Create: `supabase/migrations/0004_strategy.sql`
- Modify: `prisma/schema.prisma` (via `npx prisma db pull`)

- [ ] **Step 1: Write the migration.** Three tables, in the exact conventions of `0003`:
  - `strategies` — `id`, `user_id uuid not null unique`, `version int not null default 1 check (version >= 1)`, `cadence_per_week smallint not null check between 3 and 5`, `starts_on date not null`, `positioning text not null`, `phase_authority`, `phase_problem_aware`, `phase_offer_aware`, `phase_invitation` (all `text not null`), `week_themes text[] not null check (cardinality(week_themes) = 12)`, `generated_at timestamptz not null default now()`, `created_at`, `updated_at`.
  - `pillars` — `id`, `strategy_id uuid not null references strategies on delete cascade`, `user_id uuid not null`, `position smallint not null check between 1 and 5`, `name text not null check (length(trim(name)) > 0)`, `description text not null`, `created_at`, `updated_at`, `unique (strategy_id, position)`.
  - `slots` — `id`, `strategy_id` (cascade), `user_id`, `pillar_id uuid not null references pillars on delete cascade`, `week_index smallint not null check between 1 and 12`, `position smallint not null check between 1 and 5`, `scheduled_on date not null`, `theme text not null`, `angle text not null`, `format text not null check in (the six formats)`, `brief text not null`, `hook text`, `key_points text[] not null default '{}'`, `proof_point text`, `cta text`, `status text not null default 'planned' check in ('planned','briefed')`, `created_at`, `updated_at`, `unique (strategy_id, week_index, position)`, `unique (strategy_id, scheduled_on)`.
  - Indexes on every FK and on `(user_id, scheduled_on)` for slots; `user_id` on pillars.
  - RLS enabled and forced on all three; four own-row policies each, `to authenticated`, `(select auth.uid()) = user_id`.
  - `touch_updated_at` triggers on all three.
  - `handle_deleted_user()` redefined to also delete `slots`, `pillars`, `strategies` for `old.id`, before the existing deletes.
- [ ] **Step 2: Apply and introspect.** `npx prisma db execute --file supabase/migrations/0004_strategy.sql && npx prisma db pull && npx prisma generate`
- [ ] **Step 3: Verify against the live catalog.** Query `pg_class.relrowsecurity`/`relforcerowsecurity` for the three tables (all true), `pg_policies` (12 rows, all `{authenticated}`), and confirm a `format = 'poem'` insert is rejected by the check constraint. Report what the database returned.
- [ ] **Step 4: Commit** — `feat(db): add the strategy schema`

---

### Task 3: Strategy repository

**Files:**
- Create: `src/server/db/repositories/strategies.ts`
- Test: `src/server/db/repositories/strategies.test.ts`

**Interfaces — produces:**
```ts
export type Pillar = { id: string; position: number; name: string; description: string }
export type Slot = {
  id: string; pillarId: string; weekIndex: number; position: number; scheduledOn: IsoDate
  theme: string; angle: string; format: SlotFormat; brief: string
  hook: string | null; keyPoints: string[]; proofPoint: string | null; cta: string | null
  status: SlotStatus
}
export type Strategy = {
  id: string; userId: string; version: number; cadencePerWeek: 3|4|5; startsOn: IsoDate
  positioning: string; phases: Record<ArcPhase, string>; weekThemes: string[]
  generatedAt: Date; pillars: Pillar[]; slots: Slot[]           // slots ordered by weekIndex, position
}
export type NewPillar = { position: number; name: string; description: string }
export type NewSlot = { pillarPosition: number; weekIndex: number; position: number; scheduledOn: IsoDate; theme: string; angle: string; format: SlotFormat; brief: string }
export type StrategyDraft = { cadencePerWeek: 3|4|5; startsOn: IsoDate; positioning: string; phases: Record<ArcPhase,string>; weekThemes: string[]; pillars: NewPillar[]; slots: NewSlot[] }
export type SlotBrief = { slotId: string; hook: string; keyPoints: string[]; proofPoint: string | null; cta: string }

export async function getStrategy(userId: string): Promise<Strategy | null>
export async function replaceStrategy(userId: string, draft: StrategyDraft): Promise<Strategy>   // one $transaction; version = old + 1
export async function saveSlotBriefs(userId: string, briefs: SlotBrief[]): Promise<number>         // every update where { id, user_id }
export async function getNextSlot(userId: string, onOrAfter: IsoDate): Promise<(Slot & { pillarName: string }) | null>
```

- [ ] **Step 1: Write the failing tests first (TDD — this is the authorization boundary).** Mock `../client` the way `voice-profiles.test.ts` does. Assert: `getStrategy` queries with `where: { user_id }`; `replaceStrategy` deletes old pillars and slots with `where: { user_id }` inside the transaction and writes `user_id` on every created row; `saveSlotBriefs` never updates by `id` alone — every `where` carries `user_id`, and a brief for a slot the user does not own updates zero rows; `getNextSlot` filters on `user_id` and `scheduled_on >= onOrAfter`.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.** `scheduled_on` is `@db.Date`; convert to `IsoDate` in the mapper with `toISOString().slice(0, 10)` and write with `new Date(iso + 'T00:00:00Z')`, so the UI never sees a `Date` it could format in the wrong zone. Pillar positions in `NewSlot` are resolved to ids inside the transaction after the pillars are created.
- [ ] **Step 4: Tests pass. Commit** — `feat(db): add the strategy repository`

---

### Task 4: Generation — `generateStrategy` and `draftWeek`

**Files:**
- Create: `src/server/strategy/generate-strategy.ts`, `src/server/strategy/draft-week.ts`, `src/server/strategy/describe-strategy-error.ts`, `src/server/strategy/assemble.ts`
- Test: `src/server/strategy/assemble.test.ts`, `src/server/strategy/describe-strategy-error.test.ts`

**Interfaces — produces:**
```ts
export async function generateStrategy(input: { business: BusinessProfile; voice: VoiceProfile; cadencePerWeek: 3|4|5; timeZone: string; now?: Date }): Promise<StrategyDraft>
export async function draftWeek(strategy: Strategy, business: BusinessProfile, voice: VoiceProfile, weekIndex: number): Promise<SlotBrief[]>
export function describeStrategyError(error: unknown): string
// assemble.ts — pure, tested:
export function assembleSlots(phaseOutputs: PhaseOutput[], pillarCount: number, cadence: 3|4|5, startsOn: IsoDate): NewSlot[]  // throws LlmError on a short week or a bad pillar index; truncates surplus slots
```

- [ ] **Step 1: Write the failing tests for `assembleSlots` and `describeStrategyError`.** A week with fewer than `cadence` slots throws; a week with more is truncated to `cadence`; a pillar index of 0 or `pillarCount + 1` throws; the dates come from `scheduleSlots`, never from the model; the error describer distinguishes a missing key, a 429, any other `LlmError`, and a non-`LlmError` — with wording that says nothing was lost.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement the plan call.** Zod schema: `positioning: string`, `pillars: array of { name, description }` refined to 4–5, `phases: { authority, problem_aware, offer_aware, invitation }`, `week_themes: string[]` refined to length 12. Prompt carries the business profile verbatim, the voice profile's judged fields, the taboos as hard exclusions, and the cadence.
- [ ] **Step 4: Implement the phase calls.** Schema: `weeks: array of { week_index: int, slots: array of { pillar: int, theme, angle, format: enum(SLOT_FORMATS), brief } }`. One call per phase via `Promise.all`; each gets the plan (positioning, pillars numbered from 1, the phase's purpose, that phase's three weekly themes) and asks for exactly `cadence` slots per week. `assembleSlots` validates and dates them.
- [ ] **Step 5: Implement `draftWeek`.** Schema: `briefs: array of { position: int, hook, key_points: string[], proof_point: string | null, cta }`, refined to cover every slot position in the week exactly once. Prompt carries the slots' theme/angle/format/brief, the pillar, the phase purpose, the business profile and the CTA target.
- [ ] **Step 6: Tests pass. Commit** — `feat(strategy): generate the 12-week strategy and brief the coming week`

---

### Task 5: Step machine — the `strategy` page exists now

**Files:**
- Modify: `src/lib/onboarding/steps.ts`, `src/lib/onboarding/steps.test.ts`, `src/lib/onboarding/dashboard-copy.ts`, `src/lib/onboarding/dashboard-copy.test.ts`

- [ ] **Step 1: Update the tests first.** `routeForStep('strategy')` and `onboardingRouteFor('strategy')` are `/onboarding/strategy`; `paywall` still falls back to `/dashboard` and `null`; the "never routes an unfinished user to the dashboard" test now covers `strategy` too. Dashboard copy: the `strategy` case tells the user to build their strategy (reachable only if the guard is weakened); `paywall`/`done` copy no longer mentions a strategy "in progress on our end"; the radar band copy is true whether or not a strategy exists.
- [ ] **Step 2: Implement.** Add `strategy: '/onboarding/strategy'` to `PAGE_ROUTE_BY_STEP`; rewrite the R3 comments to say `paywall` is now the only exception.
- [ ] **Step 3: Tests pass. Commit** — `feat(onboarding): route the strategy step to its page`

---

### Task 6: `/onboarding/strategy` — build the strategy

**Files:**
- Create: `src/app/(app)/onboarding/strategy/page.tsx`, `src/app/(app)/onboarding/strategy/actions.ts`, `src/components/strategy/strategy-builder.tsx`

- [ ] **Step 1: The action.** `buildStrategy(): Promise<StrategyActionResult>` — `requireUserId`; load profile, business profile, voice profile (missing business → redirect to `routeForStep('interview')`, missing voice → `routeForStep('samples')`); `generateStrategy`; `replaceStrategy`; then `draftWeek(…, 1)` + `saveSlotBriefs` inside its own try — a failure here is logged and *not* fatal, `/strategy` offers a retry; if the profile's step is `strategy`, `updateProfile({ onboardingStep: nextStep('strategy') })`; `redirect('/strategy')` outside the try. Also `briefUpcomingWeek(): Promise<StrategyActionResult>` for the retry on `/strategy`.
- [ ] **Step 2: The page.** Guard with `isPastStep(current, 'strategy')` → `redirect(routeForStep(current))` (a `paywall`/`done` user belongs on `/strategy`, so redirect there explicitly instead of the dashboard fallback). Compute and pass the start date label and cadence so the intro copy is specific: "3 posts a week for 12 weeks, starting Monday 21 September". `export const maxDuration = 120`.
- [ ] **Step 3: The component.** One screen: title, the specific intro, what will be generated, a single primary button, a pending line with an honest duration ("about a minute"), a `role="alert"` failure message with "Try again". Same `useTransition` + `unstable_rethrow` pattern as `sample-list.tsx`.
- [ ] **Step 4: Browser-verify.** Both widths. Tap the button, watch the pending state, land on `/strategy`. Force a failure (temporarily invalid model id) and confirm the message and retry. Console clean.
- [ ] **Step 5: Commit** — `feat(strategy): add the strategy-building onboarding step`

---

### Task 7: `/strategy` — the plan

**Files:**
- Create: `src/app/(app)/(onboarded)/strategy/page.tsx`, `src/app/(app)/(onboarded)/strategy/actions.ts`, `src/components/strategy/slot-card.tsx`, `src/components/strategy/regenerate-strategy.tsx`, `src/components/strategy/brief-week-button.tsx`

- [ ] **Step 1: The page.** Positioning as the lede; pillars as cards; the arc as four columns (stacked on phone) with the phase label, its weeks and its description; "This week" — the upcoming week's theme and its slots via `SlotCard` showing the full brief when `status === 'briefed'`, else the one-line brief plus a "Write this week's briefs" button; a link to the calendar; "Regenerate" behind a `Dialog` confirm. A user with no strategy row sees a short empty state with the `StrategyBuilder` from Task 6. `export const maxDuration = 120`.
- [ ] **Step 2: Browser-verify** — both widths, regenerate round-trip (version increments, slots replaced), brief-week retry, console clean.
- [ ] **Step 3: Commit** — `feat(strategy): add the strategy page`

---

### Task 8: `/calendar` — the 12-week board

**Files:**
- Create: `src/app/(app)/(onboarded)/calendar/page.tsx`

- [ ] **Step 1: The page.** Twelve week sections, each headed "Week n · Phase label · date range" with the weekly theme, the upcoming week marked with a brand-coloured left rule; each slot as a `SlotCard` (date with weekday, pillar and format as outline badges, theme, angle, brief; briefed slots expand a native `<details>` with hook, key points, proof, CTA). No strategy → empty state linking to `/strategy`.
- [ ] **Step 2: Browser-verify** — both widths, 36 slots present, dates Mon/Wed/Fri for cadence 3, console clean.
- [ ] **Step 3: Commit** — `feat(strategy): add the 12-week calendar`

---

### Task 9: Dashboard — next slot and honest copy

**Files:**
- Modify: `src/app/(app)/(onboarded)/dashboard/page.tsx`

- [ ] **Step 1:** Load `getNextSlot(userId, todayInTimeZone(profile.timezone))`. When present, band one renders the slot (date, pillar, theme, angle) with a link to `/calendar` in place of the empty state.
- [ ] **Step 2: Browser-verify. Commit** — `feat(app): show the next scheduled slot on the dashboard`

---

### Task 10: Docs and the task list

**Files:**
- Modify: `TASKS.md`, `docs/BACKLOG.md`, `docs/ARCHITECTURE.md` ("what exists today" table gains the strategy module; the `/calendar` and `/strategy` backlog entry shrinks to `/settings`), `README.md` if it lists routes.

- [ ] **Step 1:** Mark Milestone 3 done in `TASKS.md` with what was actually verified. Add the BACKLOG entries from R-M3-7 (regenerate vs. future posts) and R-M3-2 (posting days are fixed per cadence until the interview asks). Commit — `docs: record milestone 3`

---

## Done when

- A user at the `strategy` step taps once and, within about a minute, is on `/strategy` reading 4–5 pillars, a four-phase arc and this week's full briefs; `/calendar` shows all `12 × cadence` dated slots on the right weekdays; the dashboard shows the next slot.
- `strategies`, `pillars` and `slots` each hold exactly one user's rows, RLS enabled and forced, verified live.
- `npm run verify` green. Every route browser-verified at desktop and phone width with a clean console.
- `TASKS.md` reflects reality.

## Deliberately not in this milestone

Post text (Milestone 5, behind the paywall) · the paywall itself (Milestone 4) · re-briefing later weeks on a schedule (`draft_week` job, Milestone 6) · steering later weeks from trends or learnings (Milestones 8–9) · editing individual slots or pillars by hand (a real need, but a separate design question about what an edit means for the slots derived from a pillar).
