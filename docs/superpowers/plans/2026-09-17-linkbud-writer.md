# LinkBud Milestone 5 — The writer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paying user opens a briefed slot from their dashboard, strategy or calendar, taps once, and receives three voice-matched drafts written three different ways; they pick one, edit it against a preview of how it will actually read in the feed, optionally polish it, and mark it ready — and rebuilding their strategy afterwards never destroys a word of it.

**Architecture:** Two tables (`posts`, `post_variants`) in migration `0006`; one repository (`src/server/db/repositories/posts.ts`) that is the authorization boundary for both, `userId`-first like every other. One generation module (`src/server/writer/`) mirroring `src/server/strategy/`: pure prompt builders, model calls that validate and return plain objects and write nothing, and a `'use server'` actions file owning ordering, entitlement and durability. Three pure client-safe modules under `src/lib/post/` carry everything the editor and the server must agree on, so a character count on screen and a character count in a check can never differ. Two routes inside `(onboarded)`, inheriting the auth, onboarding-step and entitlement guards rather than restating them.

**Tech Stack:** Next.js 16.3.5 App Router · TypeScript strict · Prisma 7.10 on Supabase Postgres · Zod 4 · Vitest (node) · Tailwind v4 + shadcn on Base UI · Gemini or OpenRouter behind one gateway

**Spec:** `docs/superpowers/specs/2026-09-16-linkbud-design.md` — §4.4 (the four stages and the interface), §3.2 (exemplar matching by heuristics, not vectors), §4.8 (what the preference signals feed), §5 (`posts`, `post_variants`), §6.1 (the design direction, amended here), §7 (TDD scope).

---

## Global Constraints

- **Every repository function takes `userId` first and scopes on it.** Prisma connects as a `BYPASSRLS` role, so a missing scope is a cross-customer data leak, not a bug. RLS stays enabled *and forced* because it is the real guard on Supabase's Data API.
- **A server action is a public HTTP endpoint.** Every writer action re-derives the user from the session and calls `requireEntitled`; a disabled button constrains a cooperative browser, not a crafted POST. What it would skip past here is four model calls billed to us.
- **A validation boundary must be complete or it is not a boundary.** Guards iterate derived lists — the variant index is checked against the approach tuple itself, so the three approaches and the three valid indexes cannot drift apart.
- **No `any`. No non-null `!`. No `as` used to silence the compiler.** Narrow by comparison and earn it.
- **No new npm dependencies.** The diff and borrowed-span functions are hand-rolled for this reason.
- `Button` has no `asChild`; compose with `render`.
- **Nothing in this milestone talks to LinkedIn.** The 48-hour purge rule does not apply to any table here: every row is our own generated content. The draft-to-final diff is taken between our own texts, never against anything fetched back — `docs/LINKEDIN-COMPLIANCE.md` §4 names that trap specifically.
- `npm run verify` passes before every commit, conventional messages, **no attribution trailers**.

---

## Rulings taken while planning (2026-09-17)

- **R-M5-1 — The brief is a real model call.** Not pure assembly over the slot's stored brief, though that was the cheaper design and was considered. The week's brief is written for three to five slots in one call; this pass gives one post its own attention. Two mitigations are mandatory: the stored slot brief goes *in*, and the prompt forbids changing the angle or CTA destination, so the post cannot drift from the plan the user approved on `/strategy`; and the result is persisted before the variants run.
- **R-M5-2 — Three named approaches, not three samples.** `hook-forward`, `story-forward`, `proof-forward`, stored per variant. Spec §4.8's own example ("contrarian hooks outperform story hooks 2:1") is only derivable if the chosen index means the same thing on every post. Rejected: sampling variance, which makes the index noise and the three panes arbitrary.
- **R-M5-3 — One post per slot.** Partial unique index on `slot_id`. Regenerating replaces the three variants behind a confirm and never touches edited text. Rejected: many posts per slot, which leaves "which post is Monday's" ambiguous for Milestone 6.
- **R-M5-4 — Regenerate detaches, never destroys.** `slot_id` nullable, `on delete set null`, with the slot's theme, format and date snapshotted onto the post. Rejected: cascade (destroys a customer's writing) and refusing while posts exist (turns a one-tap action into a chore). `/posts` exists because a kept draft nobody can find is a deleted draft.
- **R-M5-5 — Milestone 5 writes `draft` and `approved` only.** The constraint carries all five spec statuses so Milestone 6 needs no migration. **`approved` is not authority to publish** — compliance §3: "the user pre-approved it" is not a human tap. Said in the migration comment and the vocabulary module, where Milestone 6's implementer will read it.
- **R-M5-6 — Approval is reversible, and editing auto-reverts it.** Otherwise a post can be edited after review while still reading as `approved`, and Milestone 6 would publish text nobody approved.
- **R-M5-7 — `post_variants` are immutable.** Select, insert, delete; no update policy, following `writing_samples`. If they could be rewritten, the borrowed-span signal computed against them becomes fiction.
- **R-M5-8 — Preference signals are computed in code at save**, from the stored variants, never accepted from the caller. Borrowed spans by a 40-character sliding window against the *unchosen* variants; an edit ratio by Levenshtein over code points.
- **R-M5-9 — One action; the brief is durable before the variants run.** `buildStrategy`'s ordering discipline: make the expensive thing durable the moment it exists and treat what follows as retryable.
- **R-M5-10 — Prompt caching is prompt ordering.** Stable context in the system prompt, byte-identical across the three calls; only a one-line approach instruction varies. No cache API, no TTL, no provider-specific path.
- **R-M5-11 — Spec §6.1 is amended before any code.** The pixel-accurate preview breaks the one-accent ban, which lives in the binding spec and not only in `CLAUDE.md`. Milestone 4's precedent: amend, then build. LinkedIn's values are `--li-*` under one `.linkedin-preview` block; no component holds a literal colour; no logo or wordmark.
- **R-M5-12 — Unbriefed slots refuse**, pointing at the existing week-level brief button. A per-slot briefing path would be a second way to do the same thing and the two would drift.
- **R-M5-13 — One character counter, shared.** Extracted from the `server-only` `measure-samples.ts` into a client-safe module both import. Two implementations would disagree on every emoji, and the one the user sees would be the wrong one.

---

## Tasks

- [x] **Task 1: Amend the governing documents.** Spec §6.1 (the preview exemption) and §4.4 (named approaches, `approved` is not authority to publish); mirrored into `docs/DESIGN-SYSTEM.md` and `CLAUDE.md`. First commit, before any code.
- [x] **Task 2: Migration 0006 — `posts` and `post_variants`.** RLS enabled and forced; four policies on `posts`, three on `post_variants`. Verified against the live catalog.
- [x] **Task 3: `src/lib/post/{vocabulary,measure,signals}.ts` — TDD.** Client-safe; `measure-samples.ts` now imports the shared counter.
- [x] **Task 4: The posts repository — TDD.** Scoping, the approval revert, and signal recomputation.
- [x] **Task 5: One provider-aware LLM failure classifier — TDD.** Replaces two hand-written copies that both carried the same two dead branches.
- [x] **Task 6: The generation core.** Exemplars (tested), brief, variants, polish, writer prompt context.
- [x] **Task 7: Server actions.** Entitlement on every one; brief durable before variants.
- [x] **Task 8: `/write/[slotId]` — the editor and the preview.**
- [x] **Task 9: `/posts` and deletion.**
- [x] **Task 10: Entry points and the Regenerate guard.**
- [x] **Task 11: Documentation.**
- [ ] **Task 12: Browser QA** — `/ecc:browser-qa`. Nothing ships unverified.

---

## Self-review

**Spec coverage.** §4.4 stage 1 (brief) → Tasks 6, 7. Stage 2 (three parallel variants) → Task 6. Stage 3 (selection, other two visible, signals recorded) → Tasks 3, 4, 8. Stage 4 (optional polish against the rubric) → Tasks 6, 8. §4.4 "3 most format-similar samples" → Task 6. §3.2 heuristics not vectors → Task 6. §5 `posts`/`post_variants` → Task 2. §4.8 signals → Tasks 3, 4. §6.1 design direction → Task 1. §7 TDD scope: nothing here is on the mandatory list, but the repository, the signals, the measurement, the exemplar ranking and the failure classifier are all test-first anyway, because each is a place where a silent bug is invisible until it has cost something. All covered.

**Known gaps, stated rather than hidden.** Prompt caching cannot be observed on Gemini's OpenAI-compatible endpoint — there is no cache-hit field in the response — so what is claimed is the prompt *structure* that makes caching possible, not a measured saving. The Gemini fallback leg still cannot be forced. Nothing about publishing is exercised, because nothing here publishes.

**Type consistency.** `VariantApproach` (Task 3) is the approach type in Tasks 4, 6, 7 and 8, and the same tuple backs the database check constraint in Task 2 and the index guard in Task 7. `PostStatus` (Task 3) is the status type in Task 4 and the editor's prop in Task 8. `Brief` (Task 6) is produced by `buildBrief`, stored by `createPostWithBrief` (Task 4), and reconstructed from the row by `briefFromPost` (Task 7) for both regeneration and polish.

---

## Deliberately not in this milestone

Publishing and the LinkedIn adapter · the jobs table and cron · approval nudges · the 48-hour purge (Milestone 6) · short links and click tracking (Milestone 7) · trend items injected into the brief (Milestone 8) · nightly learning synthesis and injecting active learnings (Milestone 9) · carousels, images and performance-weighted exemplars (Milestone 10, CMA-blocked).

The brief stage takes its inputs as an options object, so Milestones 8 and 9 add a field rather than rewrite a call site.
