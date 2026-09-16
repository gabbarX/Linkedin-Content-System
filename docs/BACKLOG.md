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

## Supabase

**Thread the `Database` type through the three client factories.**
`src/lib/types/database.ts` exists (hand-written placeholder) but none of
`browser.ts` / `server.ts` / `admin.ts` pass it as `createClient<Database>`, so
queries are untyped. Deferred because there is nothing to query yet and the
placeholder will be replaced by `supabase gen types` output.
**Trigger:** the first real query against `profiles`.

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

## Milestone 2, before any feature code

**Work through `docs/ACCOUNTS.md` steps 7–12 and perform the first live sign-in.**
This is the first action of Milestone 2, not something to fit in later. Nothing
in the auth path has ever executed: not the magic link, not Google OAuth, not
the code exchange, not session refresh in `src/proxy.ts`, not the `(app)` layout
guard, not RLS, not the `handle_new_user()` signup trigger. Tasks 4–6 were
reviewed and verified offline — typecheck, lint, build, unit tests — because no
Supabase project existed. That first real sign-in is the only test those three
tasks have not had, and it is the one that matters.
