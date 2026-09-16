# Backlog

Deferred items from Milestone 1 (the foundation branch) and its reviews.

This file exists because the execution ledger that recorded these lives in
`.superpowers/`, which is gitignored — so every one of them would have been lost
to the next session. Nothing here is a bug in shipped behaviour; each is a real
thing that was consciously not done, with the reason, and the moment it stops
being deferrable.

Delete an entry when it is done. Do not add "someday" ideas here — this is a
list of known debts with a trigger, not a wish list.

---

## Dependencies

**Delete the unused `@vitejs/plugin-react` dev dependency.**
`create-next-app`/vitest scaffolding installed it, but `vitest.config.ts` runs
`environment: 'node'` and there is not a single component test, so the plugin is
never loaded. It was left in place rather than removed and re-added a week later.
**Trigger:** remove it now; re-add it in the same commit as the first component
test that actually needs JSX transform in vitest.

**Migrate `z.string().url()` to `z.url()`.**
Deprecated in zod 4; 4 call sites in `src/lib/env.ts`. Deferred because touching
the env schema for a cosmetic deprecation while the schema is the thing every
other task depends on is a bad trade.
**Trigger:** Milestone 4, when Stripe keys are added to the schema — change the
existing call sites in the same edit.

## Design system

**`sonner.tsx` calls `useTheme()` with no `ThemeProvider` mounted.**
`next-themes` is installed only because the generated `sonner.tsx` imports it.
With no provider it resolves to `"system"`, which happens to be harmless today
because nothing sets `[data-theme="dark"]` either. `<Toaster />` is not mounted
anywhere.
**Trigger:** whoever first mounts `<Toaster />` in a layout — mount a provider
with it, or strip the `useTheme()` call and the dependency.

## Configuration

**Split `src/lib/env.ts` into `env.public.ts` and `env.server.ts`.**
One module holds both schemas, and `src/app/(auth)/login/page.tsx` is a client
component that imports it — so the server schema's *variable names* (Stripe,
LinkedIn, OpenRouter, the token encryption key) ship in the browser bundle. No
values leak: `process.env` is empty client-side and Next only inlines
`NEXT_PUBLIC_*`. But the names are a map of what this app holds, and
`import 'server-only'` can never be added to the module while a client component
imports it.
**Trigger:** before the first server secret that is genuinely sensitive to name —
realistically Milestone 4 (Stripe) or Milestone 6 (LinkedIn tokens).

## Prisma

**Revisit Prisma's native RLS support when v8 reaches GA.**
Prisma 8 adds `@@rls` policy authoring in the schema and an official
`@prisma/orm-extension-supabase` that manages Supabase RLS end to end. That
would let the database enforce ownership again instead of the repository
convention. As of 2026-09-16 v8 is release-candidate only — note that npm's
`latest` dist-tag points at `8.0.0-rc.15` while stable `7.10.0` is tagged
`prev`, so a naive `npm install prisma` installs a pre-release. We are pinned
to `^7.10.0` deliberately.
**Trigger:** a stable 8.x release appears on npm.

**`profiles` has no foreign key to `auth.users`.**
Removed in `0002` because a cross-schema FK drags all 27 Supabase Auth tables
into `schema.prisma`. Cascade delete is preserved by the `on_auth_user_deleted`
trigger, which is therefore load-bearing — if it is ever dropped, deleting a
user silently orphans their profile.
**Trigger:** if Prisma gains per-table introspection scoping, reinstate the FK.

## Routes

**`/calendar`, `/strategy` and `/settings` are live nav links with no pages.**
`src/components/app-nav.tsx` links all three; none exist, so all three 404 for a
signed-in user. They were kept because they are the real information
architecture from spec §6, not placeholders to invent later.
**Trigger:** Milestone 3 fills `/calendar` and `/strategy`; Milestone 8 fills
`/settings`. Until then, they 404 — do not hide the links to make it look tidy.

## Accounts

**`docs/ACCOUNTS.md` step 5 carries an unsourced timing claim about self-serve
LinkedIn products.** "if one is still pending after a day, check the portal
again before assuming something is wrong" — nothing in the product spec
establishes any timing for LinkedIn's self-serve product approval. It was
judged adequately hedged (it tells the reader not to assume, rather than
asserting a guarantee) and accepted as-is rather than reworded.
**Trigger:** if a founder reports the one-day figure was wrong or misleading in
practice, replace it with whatever is actually observed.

**`docs/ACCOUNTS.md` step 6 presumes the Community Management API application
form presents a selectable list of use cases.** That is unverified portal UI —
nobody on this project has seen the actual form. Low stakes, since the founder
completing the step sees the real thing and the surrounding text already tells
them to check the current list rather than trust the labels, but it remains an
unverified claim in a document written to be followed literally.
**Trigger:** the first time anyone actually opens the CMA application form —
correct the description to match what it really shows.

## Auth

**Fixed 2026-09-16: emailed links go through `/auth/confirm`, not the code
exchange.** The first live attempt failed with `exchange_failed` — a `code` was
present and the exchange rejected it — which ruled out Site URL, the redirect
allowlist, and the implicit-flow case.

Investigation established that the browser writes the PKCE verifier correctly:
polling `document.cookie` through a live `signInWithOtp` showed all three keys
(`…-flow-<id>-code-verifier`, `…-flows-code-verifier`, `…-code-verifier`)
written at t+16ms and cleaned up when the request failed. The cookie machinery
was never the problem.

The problem is structural, and it is worse than the one failure: **a PKCE code
exchange can only complete in the browser that requested the link.** Request on
a laptop, open the email on a phone, and it fails by design. `/auth/confirm`
verifies a `token_hash` directly, needs no verifier, and works from any device —
Supabase's documented pattern for server-side rendering.

What was NOT pinned down: whether that specific click failed because it was
opened in a different browser, or because the cookie was not sent on that
redirect. Reproducing it needed a deliverable email address and was not worth
sending mail to the owner's inbox, since the fix is the same either way.

**Also learned:** Supabase rejects non-deliverable domains outright.
`dev@linkbud.example` was refused with "Email address is invalid", which is why
the seeded dev user now takes a real address (`npm run seed:dev`).

**Remaining, and it is the owner's step:** the Supabase email templates must
point at `/auth/confirm` (`docs/ACCOUNTS.md` §9b). Until they do, the emailed
link still carries the old URL and sign-in still fails.

## The first real sign-in still has not happened

Much of the auth path has now executed, but not through the front door. The
`handle_new_user()` trigger fires correctly (two accounts have been created by
it), `verifyOtp` works against this project, the `(app)` guard redirects in both
directions, and the whole onboarding flow has been walked end to end — all using
a development-only route that has since been deleted.

What has still never run: a user arriving at `/login`, typing their address,
receiving an email, clicking the link, and landing signed in. That is one step
away — the email templates in `docs/ACCOUNTS.md` §9b — and it is the only test
that proves the real thing.

**Trigger:** before the first real user. Also before trusting any claim in this
file about auth working.

## LLM

**The default model is a free one, with the constraints that implies.**
`nvidia/nemotron-3-super-120b-a12b:free`, pinned in `src/server/llm/client.ts`.
Three things follow, none of which is a problem today:

1. **Free model IDs are withdrawn without notice.** If the gateway starts
   returning 404, re-run the selection against
   `https://openrouter.ai/api/v1/models` rather than reaching for a paid model
   by reflex — the selection method is recorded in the module comment.
2. **Free endpoints are rate-limited by request count and queue.** Measured
   8–12s per call. Onboarding makes one call per user and can show a pending
   state; Milestone 5's writer makes three per post and will feel this first.
3. **Free endpoints generally carry a training-data policy.** Prompts sent to
   them may be used by providers for training, and what LinkBud sends is the
   customer's offer, ICP, proof points and writing samples. That is acceptable
   for a founder testing their own account and is a decision to revisit before
   the first paying customer.

**Trigger:** the first paying customer, or the first 429 from the writer.

