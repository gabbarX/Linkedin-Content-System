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

## Auth — open defect

**The magic link does not complete a sign-in.** Deferred deliberately on
2026-09-16: noted, not fixed, to be resolved before production.

*What was observed*, first live attempt at 15:50 on 2026-09-16:

- The email that arrived was Supabase's **"Confirm your email address"**
  template — the *signup* template, not the magic-link one. Expected: the
  address had never signed in, and `signInWithOtp` defaults to
  `shouldCreateUser: true`.
- Clicking it landed on `/login?error=exchange_failed`.

*What that narrows it to.* `exchange_failed`, not `missing_code`, means the
callback **did** receive a `?code=` and `exchangeCodeForSession` rejected it.
That rules out the whole family of "the link never reached our callback"
causes — Site URL misconfiguration, a redirect-allowlist rejection, and the
implicit-flow case where the token arrives in the URL fragment where no server
can see it. The redirect chain works; the exchange does not.

*Why the cause was not in the logs.* The callback discarded the `AuthError`
entirely, so the only record of the failure was a redirect. That is now fixed
— `src/app/auth/callback/route.ts` logs name, message, code and status before
redirecting, and it interpolates them into the string rather than passing the
error as an object, because `Error.name` and `Error.message` are
non-enumerable and serialise to `{}` in the dev server log.

*Leading candidate — unverified, do not treat as diagnosed.* Driving the
callback with a junk code during QA produced
`AuthPKCECodeVerifierMissingError` (`pkce_code_verifier_not_found`, 400). That
is the expected result for a request that never started a flow, so it is not
evidence about the real failure — but it is the error the same code path
raises, and the PKCE verifier is the one piece of state an emailed link can
plausibly lose. Supabase's own SSR guidance for exactly this is to stop routing
email links through `/auth/v1/verify` and instead template them as
`{{ .TokenHash }}` against an `/auth/confirm` route that calls
`verifyOtp({ type, token_hash })`, which removes the verifier dependency. If
that is the fix it is one new route handler plus an email-template change in
the Supabase dashboard.

*How to reproduce without waiting on email.* Request a link, then read
`.next/dev/logs/next-development.log` — the running dev server writes there,
so the real `AuthError` is now recoverable without watching a terminal.

*What has since been ruled in.* The `handle_new_user()` trigger **works** —
the profiles row for the 15:50 attempt exists, created by the signup itself.
So the account was created correctly and only link verification failed. A
retry will now send the *magic link* template rather than the signup one,
because the user already exists.

*And `verifyOtp({ type, token_hash })` works.* `/auth/dev-login` uses exactly
that call server-side and issues a valid session against this same project.
That is the mechanism the recommended fix depends on, now demonstrated rather
than assumed.

**Trigger:** before the first real user. No longer blocks development — see
`src/app/auth/dev-login/route.ts`.

## Milestone 2, before any feature code

**Work through `docs/ACCOUNTS.md` steps 7–12 and perform the first live sign-in.**
This is the first action of Milestone 2, not something to fit in later. Nothing
in the auth path has ever executed end to end: not the magic link, not Google
OAuth, not the code exchange, not session refresh in `src/proxy.ts`, not RLS,
not the `handle_new_user()` signup trigger. (The `(app)` layout guard *has* now
executed — its signed-out branch redirects correctly — but only that branch.)

**Unblocked by `/auth/dev-login`.** That route mints a real session for a
seeded local account, so everything behind `(app)` is reachable and
browser-verifiable again. It is scaffolding, not a feature: delete
`src/app/auth/dev-login/` and the link on the login page the day the magic
link works. Its guard is an allowlist on `NODE_ENV === 'development'`, covered
by tests that assert every other value 404s.

## Scaffolding to remove

**`/auth/dev-login` and the dev link on the login page.** Both exist only
because the magic link does not work.
**Trigger:** the first successful real sign-in. Delete both, and the
`dev@linkbud.example` user with them.
