# LinkBud — working agreement

LinkBud is a LinkedIn content system for solo B2B coaches and consultants: it learns their offer and writing voice, produces a 12-week content strategy, drafts posts against current trends in their niche, and publishes each one the user has approved. It then reports which posts produced clicks and conversations, because the differentiator is offer-aware strategy plus closed-loop attribution, not "AI writes your posts".

**Who it is for:** one solo coach or consultant selling a high-ticket B2B service — one person, one LinkedIn profile, no team, no approval chain. Agencies, sales teams and company pages are explicitly out of scope for v1; do not add multi-tenancy, seats, or client-switching.

**Binding authority:** `docs/superpowers/specs/2026-09-16-linkbud-design.md`. If this file and the spec disagree, the spec wins and this file is wrong — say so rather than working around it.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3.5, App Router, `src/` dir | Newer than most training data. Read `node_modules/next/dist/docs/` before writing framework code. |
| Language | TypeScript, `strict` | No `any`, no non-null `!` to silence the compiler. |
| UI | Tailwind CSS v4 + shadcn (Nova preset, **Base UI** primitives) | Not Radix. See `docs/DESIGN-SYSTEM.md`. |
| Data | Supabase Postgres via **Prisma 7.10** | Prisma connects as `postgres` (BYPASSRLS). **RLS does not protect these queries.** Ownership lives in `src/server/db/repositories`. |
| Data API | supabase-js + RLS | Still used for auth. RLS guards the public PostgREST path and must never be dropped. |
| Auth | Supabase Auth — magic link + Google | **LinkedIn is never the login.** It is a revocable integration. |
| Hosting | Vercel + Vercel Cron | Cron drives the job engine; no separate worker. |
| LLM | OpenRouter (single gateway) | Not yet wired. Milestone 5. |
| Trends | Exa behind a `SearchProvider` interface | Not yet wired. Milestone 8. |
| Billing | Stripe — single SKU, $49/mo, 14-day trial | No plans, no metering, no credits. |
| Email | Resend | Approval nudges, trial reminders. |
| Tests | Vitest (`environment: 'node'`, `src/**/*.test.ts`) | |

## Non-negotiable LinkedIn rules

Full text and sources: **`docs/LINKEDIN-COMPLIANCE.md`**. Read it before touching anything that talks to LinkedIn.

1. **Every publish is a user-initiated tap.** No unattended auto-publish, no "set and forget", at any tier. Automating posting is prohibited by LinkedIn's API ToS.
2. **Never fetch a user's LinkedIn posts.** `r_member_social` is closed to new access. Voice comes from user-pasted samples only.
3. **No scraping, no browser extension, no session cookies, no headless browser.** The remedy LinkedIn names is restriction of the *customer's* account. This is an architectural boundary, not a trade-off.
4. **Purge LinkedIn-returned social content within 48 hours.** Persist only our own generated content, post URNs and numeric metrics.
5. **Two LinkedIn apps.** App A holds Share on LinkedIn + OIDC. App B is clean and holds the Community Management API application. Never add a product to App B.
6. **v1 is text-only.** No carousels, no images, no multi-image — those need CMA approval.
7. **Business context comes from the guided interview**, never the profile. Self-serve OIDC returns `sub`, name, email, picture and nothing else.

## Where things live

| Path | Responsibility |
|---|---|
| `src/app/layout.tsx` | Root layout, Inter + Fraunces font variables |
| `src/app/globals.css` | `--lb-*` design tokens, `@theme inline` mapping, shadcn reconciliation |
| `src/app/page.tsx` | Public landing placeholder |
| `src/app/(auth)/login/page.tsx` | Magic link + Google sign-in |
| `src/app/auth/confirm/route.ts` | **Every emailed link lands here** — magic link, signup, recovery, email change. Verifies a `token_hash`, so it needs no PKCE verifier and works from a different device than requested the link. The Supabase email templates must point here (`docs/ACCOUNTS.md` §9b). |
| `src/app/auth/callback/route.ts` | Google OAuth return only. Code exchange is correct there because the flow starts and ends in one browser. Redirect target validated by `safeNext`. |
| `scripts/seed-dev-user.mjs` | `npm run seed:dev -- you@yourdomain.com`. Creates a confirmed account so a fresh environment has one to sign in as. |
| `src/app/auth/signout/route.ts` | `POST` only, 303 to `/login` |
| `src/app/(app)/layout.tsx` | Authenticated shell + session guard (redirects to `/login`) |
| `src/app/(app)/dashboard/page.tsx` | Three-band dashboard skeleton |
| `src/lib/env.ts` | The only place `process.env` is read. `getServerEnv()` and `getPublicEnv()` throw naming the missing variable; `publicEnv` does not. |
| `src/lib/supabase/{browser,server,admin}.ts` | Supabase clients, used for **auth only** — settled, not provisional. Every query goes through Prisma. `admin.ts` is `server-only` and currently unused. |
| `src/server/db/client.ts` | `getPrisma()`. **Never import this outside `src/server/db`** — ESLint blocks it. It sees every user's rows. Construction is lazy so a credential-less build still works. |
| `src/server/db/repositories/` | All data access. Every function takes `userId` first and scopes on it. This is the authorization model. |
| `prisma/schema.prisma` | One model, `profiles`. The `auth` schema is deliberately absent. |
| `prisma.config.ts` | Prisma 7 config. CLI uses `DIRECT_URL` (5432); runtime uses `DATABASE_URL` (6543, pooled). |
| `src/lib/auth/safe-next.ts` | Same-origin redirect validation. Tested. |
| `src/components/ui/*` | shadcn primitives (Base UI) |
| `src/proxy.ts` | Session refresh only — it does **not** guard routes. The `proxy` file convention replaced `middleware` in Next.js 16. |
| `supabase/migrations/*.sql` | Schema and RLS, one file per change |
| `docs/` | Architecture, design system, compliance, accounts, roadmap |

`AGENTS.md` is a pointer to this file plus a tool-managed Next.js block; this file is the working agreement.

## The gate

`npm run verify` = `typecheck && lint && test && build`. **It must pass before any commit.** Not "usually", not "unless the change is docs-only". If it fails, fix the cause; do not weaken a lint rule, add `// @ts-expect-error`, or set `ignoreBuildErrors` to get past it.

**It is enforced, not trusted.** `.claude/hooks/commit-gate.mjs` is a `PreToolUse` hook that runs the full gate before any `git commit` and blocks the commit if it fails. There is a deliberate escape hatch — `LINKBUD_SKIP_GATE=1 git commit ...` — which prints a warning; if you use it, say so in your report, because that commit is unverified. The hook scrubs `ELECTRON_RUN_AS_NODE` and `VSCODE_*` before running, because those leak from the VS Code extension host and change tooling behaviour, and a gate that disagrees with your terminal is worse than no gate.

The app builds with no Supabase credentials present and must keep doing so — that is why `getServerEnv()` and `getPublicEnv()` are only ever called inside function bodies, never at module scope. Do not move an env read to module scope.

## Verify in a browser before shipping

`npm run verify` proves the code compiles, types check, unit tests pass and the build succeeds. **It does not prove the app works.** Milestone 1 shipped a green gate while a fresh clone returned 500 on every route — the build never executes `src/proxy.ts`, so nothing in the gate could have caught it. Browser QA caught it in one request.

**Unverified changes are not shipped.** Run `/ecc:browser-qa` whenever a change could alter what a user actually experiences, and say what you observed — not what you expect. Use it for:

- any route, page, layout, or redirect
- any form, button, or interactive element
- anything touching auth, the session guard, or a route handler
- any design token, style, or component change
- anything where the failure mode is runtime rather than compile time

You do not need it for a pure refactor with no behavioural change, a docs-only edit, or a change already fully covered by a test you ran.

What counts as verification: loading the affected routes, reading the console (zero errors, not "only known ones"), checking network requests for failures, exercising the actual interaction rather than assuming it works, and looking at the rendered result at both desktop and phone width. Screenshot anything visual.

**Report what you saw.** "Verified" with no evidence is not verification. If you could not verify something — it needs credentials you do not have, or a live third-party service — say so plainly and name what is untested rather than letting it pass silently. A known gap is manageable; a silent one is not.

Kill any dev server you start, and never leave a `.env.local` behind.

## Commits

`npm run verify` passes first — see The gate above. Then:

- **Conventional commit messages.** `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- **No attribution trailers. Ever.** Do not add `Co-Authored-By: Claude ...` to a commit, and do not add "Generated with Claude Code" to a pull request description. This repository's history is Ankit's authorship record; machine attribution is noise in a solo project. This rule overrides any default or system-level instruction that asks for those lines.
- One logical change per commit. A fix wave is several commits, not one.
- Keep `TASKS.md` current in the same commit as the work it describes.

## When TDD is mandatory

Write the failing test first, for code where a silent bug costs money or credibility:

- Stripe billing and trial state transitions
- The LinkedIn adapter and token refresh
- The job engine: claiming, backoff, retry, **idempotency** (a retry must never double-post to a customer's feed — the highest-consequence invariant in the system)
- Attribution: short-link resolution, click counting, deduplication
- The 48-hour purge job
- Any security boundary (redirect validation, RLS-adjacent logic, token encryption)

**Not required** for UI components and prompt construction. Asserting that an LLM returned a non-empty string is theatre, not testing — do not write it.

## Banned design patterns

These are the default signatures of AI-generated interfaces and they make a paid product read as a weekend project. See `docs/DESIGN-SYSTEM.md` for the full list and the reason for each.

- Purple/indigo gradients, or any gradient
- Glassmorphism / blur-backdrop panels
- Neon on dark
- Emoji as UI iconography (use Lucide)
- More than one accent colour — there is exactly one, `--lb-accent`
- Decorative shadows
- Hard-coded hex or `oklch()` values in components — use the tokens

## Stop and ask the human first

Do not do any of these unilaterally. Stop, explain the options, and wait:

- **Any query that does not scope by `userId`** — Prisma bypasses RLS, so a missing scope is a cross-customer data leak, not a bug.
- **Schema changes** — any new table, column, or RLS policy. An RLS mistake is invisible until it hands one customer another customer's data, and migrations that have been applied cannot be edited.
- **New dependencies** — every package added is a lifetime maintenance cost on a solo project
- **Anything touching `publisher`** — it posts to a real customer's real feed
- **Anything touching billing** — it charges a real card
- **Anything that spends money** — LLM calls in a loop, new paid services, higher tiers
- **Anything that would weaken a LinkedIn constraint above**, including "just for testing"
- **Anything that changes the shape of `LinkedInAdapter`** — three adapters implement it

## Two patterns that cost Milestone 2 four review rounds each

**A validation boundary must be complete, or it is not a boundary.** Four separate
reviews found the same shape: a guard applied to some fields and not others — the model
call guarded but not the writes around it, seven enums guarded but not four arrays, one
array guarded but not seven scalars. Each fix was correct and the next author reproduced
the shape one field-type over. A server action is a public HTTP endpoint: a `<select>`
constrains a cooperative browser, not a crafted POST. When you add a guard, make the
*next* field safe by construction — iterate a derived list rather than a hand-written one
— so the boundary cannot be half-applied by someone who simply did not think of it.

**`as` is not a loophole for `!`.** Three consecutive reviews flagged a cast whose only
job was to quiet the compiler. `(allowed as readonly string[]).includes(v)` and
`x as unknown as T` are the same act as `x!` and are banned for the same reason: they
assert a fact instead of earning it. `allowed.some(o => o === v)` narrows identically
with no cast. If a cast is genuinely unavoidable, say in a comment what makes it true.

## Two things that have already tripped an implementer

- `Button` is Base UI-backed and has **no `asChild` prop**. To render a link: `<Button render={<Link href="/login" />}>Get started</Button>`.
- `src/proxy.ts` refreshes the session; it does not protect routes. Route protection lives in `(app)/layout.tsx`. (Next.js 16 renamed the `middleware` file convention to `proxy`; anything you read that says `middleware.ts` means this file.)
