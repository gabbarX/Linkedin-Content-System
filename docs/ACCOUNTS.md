# Accounts — Milestone 0

This is the checklist of everything that has to be bought, registered or configured by hand before LinkBud can charge a customer. It is written to be worked through top to bottom. Each step says what to do, exactly what to paste where, and how to check it worked before moving on.

You do not need to finish this in one sitting. But **steps 4, 5 and 6 are the long pole** — the Community Management API application has a reported 3–4 month turnaround with no SLA, and Milestone 10 of the roadmap is blocked behind it entirely while three earlier milestones ship a reduced version until it lands. Get to step 6 in the first week even if nothing else is done.

Keep a private note (password manager, not the repo) with every ID, key and secret as you generate it. Nothing in this list goes into git. `.gitignore` already blocks `.env*` except `.env.example`.

---

## 1. Incorporate

**Why first:** the domain registrar, the bank and Stripe all want a legal entity name, and the Community Management API application in step 6 describes the company by name. Changing it later means re-verifying everything downstream.

- Register the company through whichever route your jurisdiction uses.
- Record: legal entity name, company number, registered address, incorporation date.
- Open the business bank account. Stripe pays out to it in step 12.

**Check it worked:** you have a certificate of incorporation and a bank account in the company's name.

## 2. Buy the domain

- Buy the main domain (e.g. `linkbud.com`) at any registrar. Cloudflare or Namecheap are both fine; you will be editing DNS records by hand in steps 3, 13 and 14, so pick one whose DNS panel you can stand.
- Turn on WHOIS privacy.
- Turn on auto-renew. An expired domain takes out the app, the email, and every published short link at once.

**Check it worked:** the domain resolves to the registrar's parking page.

## 3. Business email on that domain

**Why:** Stripe and your customers both treat a `@gmail.com` address as a hobby project, and every account below wants a contact address that outlives a personal inbox. You also need a Google account for step 10.

- Google Workspace → sign up at `workspace.google.com`, choose the Business Starter plan, and enter the domain from step 2.
- Follow the setup wizard's DNS step: it gives you MX records to add at your registrar. Add them exactly as shown.
- Create at least: `you@yourdomain`, plus `hello@yourdomain` for support and `billing@yourdomain` for Stripe receipts.

**Check it worked:** send an email from `you@yourdomain` to a personal address and reply to it. Both directions must arrive. Google's admin console shows the domain as verified.

## 4. LinkedIn Company Page

**Why:** you cannot create a LinkedIn developer app without an associated Company Page, so this blocks steps 5 and 6.

- Go to `linkedin.com/company/setup/new` and create a page for the company from step 1.
- Fill in: name, the domain from step 2 as the website, industry, company size, tagline, logo, and an About section that describes the product in plain language. Do not leave it skeletal — it is the public face of the company attached to both developer apps, and the application text in step 6 points at it.
- Verify yourself as an admin of the page.

**Check it worked:** the page is public, has a logo, and you can see the admin view.

## 5. LinkedIn App A — the live app

This is the app that real customers connect to. It holds **Share on LinkedIn** (publishing) and **Sign In with LinkedIn using OpenID Connect**.

- Go to `linkedin.com/developers/apps` → **Create app**.
- Name it something customer-facing (e.g. "LinkBud"), attach the Company Page from step 4, upload the logo, and accept the API Terms of Use.
- **Products tab** → add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**. Both are self-serve products, added from the developer portal without an application or review — unlike the Community Management API in step 6. How quickly they show as available is LinkedIn's business; if one is still pending after a day, check the portal again before assuming something is wrong.
- **Auth tab** → under redirect URLs, add both:
  - `http://localhost:3000/api/linkedin/callback`
  - `https://yourdomain.com/api/linkedin/callback`
- **Auth tab** → copy the **Client ID** and **Client Secret** into your private note. These become `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

**Check it worked:** the Products tab lists Share on LinkedIn and Sign In with LinkedIn as added (not "requested"), and the app's granted scopes include `w_member_social` — that is the scope publishing needs.

> Note: nothing in the code uses these yet. The LinkedIn connection is built in Milestone 6. Getting the app created now means that milestone starts with credentials in hand.

## 6. LinkedIn App B — the clean app, and the CMA application

**Read this whole step before doing any of it.**

The Community Management API cannot be requested on an app that already holds Share on LinkedIn or Sign In with LinkedIn. That is why there are two apps. **App B must stay clean: never add a product to it.**

> ### The warning that matters
>
> **A CMA rejection cannot be appealed on the same app.** If the application is turned down, the route forward is creating a brand-new app and applying again — with the reported 3–4 month turnaround starting over. Assume you get one attempt per app and no opportunity to argue the decision. The description below is worth twenty minutes of your attention before you paste it.

- Go to `linkedin.com/developers/apps` → **Create app**.
- Name it distinctly so you can never confuse the two — e.g. "LinkBud Community Management". Attach the same Company Page.
- **Do not add any products to this app.** No Share on LinkedIn, no Sign In with LinkedIn, nothing.
- Find the Community Management API in the products list and start its **access request / application** form.
- Fill it in using the draft below. Read it first and change the specifics — your actual company name, your actual customer count, your actual launch date. A description that is obviously a template reads as one.

**Check it worked:** you have an application reference or confirmation email, and App B's product list is still empty apart from the pending CMA request. Diarise a check-in every four weeks; there is no SLA, so treat a long silence as the normal state rather than as a signal either way.

### Pre-drafted CMA application description

LinkedIn names a set of approved use cases for the Community Management API. Per the research behind this project, the two LinkBud legitimately sits under are **Executive Management** and **Employee Advocacy**. Before submitting, check the current list as the application presents it and select the closest match rather than assuming these labels are still the ones shown.

Paste and edit:

> **Company and product**
>
> [Company legal name] operates LinkBud (linkbud.com), a content management product for individual professionals who publish on LinkedIn under their own name. Our customers are solo consultants and executive coaches: one person, one profile, no agency relationship, no managed accounts.
>
> **Use case**
>
> LinkBud supports Executive Management and Employee Advocacy use cases. Each customer connects their own LinkedIn member account and uses LinkBud to plan, draft and review their own content, then publish it to their own profile. There is no third-party posting: the person who owns the profile is the person using the tool, and every publish action is initiated by that person in our interface.
>
> **What we would use the Community Management API for**
>
> 1. **Member post analytics for the customer's own posts.** Today our customers can see that a post went out but cannot see how it performed without leaving the product. We would use member creator post analytics to show each customer the performance of posts they published through LinkBud — impressions, engagement and link clicks — on their own content only.
> 2. **Document (carousel) and multi-image posts.** Our customers currently publish text-only because that is what self-serve access supports. Document posts are a standard format for the educational content this audience publishes, and we would use the API to let them publish that format through the same reviewed, human-approved flow.
>
> **How we comply with LinkedIn's terms**
>
> - **No automated posting.** Every publish is a user-initiated action in our interface. We do not offer unattended scheduling, queue-based auto-posting, or any "set and forget" mode at any price tier. Our job scheduler sends the customer a reminder to review a draft; it never publishes on their behalf.
> - **No scraping or browser automation.** We ship no browser extension, we never ask for or store LinkedIn session cookies, and we do not operate headless browsers against LinkedIn. All LinkedIn data flows through official APIs with member consent.
> - **Data storage.** We store our own generated content, post URNs and numeric metrics. Member social content returned by the API is purged within 48 hours by a scheduled job, in line with the Marketing API data storage requirements.
> - **Member control.** Customers authorise LinkedIn as a revocable connection, not as their login identity. They can disconnect at any time from within the product, and revoking access in LinkedIn does not lock them out of their own account or data.
> - **Scope.** We request access for individual members publishing to their own profiles. We do not manage company pages on behalf of customers, and we do not operate as an agency managing multiple client profiles.
>
> **Volume**
>
> [N] customers today, each publishing 3–5 posts per week to their own profile. We expect [N] within twelve months. We operate a soft per-member publishing cap well below the documented rate limit.

## 7. Supabase project

Everything from here needs a live database.

- Go to `supabase.com/dashboard` → **New project**. Pick the region closest to your customers.
- Choose a strong database password and save it in your private note; it cannot be recovered, only reset.
- Once the project finishes provisioning, go to **Settings → API** and copy three things:
  - the **Project URL** (`https://<project-ref>.supabase.co`)
  - the **anon / public** key
  - the **service_role / secret** key — this one bypasses row-level security. It never goes in a browser, never in a `NEXT_PUBLIC_` variable, and never in a screenshot.
- Also note the **project ref** (the subdomain in the URL, also shown under Settings → General). You need it in step 11.

**Check it worked:** the dashboard shows the project as active and Settings → API lists both keys.

## 8. Apply the database migration and confirm RLS is on

- Supabase dashboard → **SQL Editor** → **New query**.
- Paste the entire contents of `supabase/migrations/0001_profiles.sql` from this repo and click **Run**.
  - Alternative, if you have the CLI: `npx supabase link --project-ref <project-ref>` then `npx supabase db push`.
- Then confirm row-level security actually enabled. In a new SQL Editor query, run:

  ```sql
  select relname, relrowsecurity
  from pg_class
  where relname = 'profiles';
  ```

  **Expected:** one row, `relrowsecurity = true`. If it says `false`, RLS did not enable — run `alter table public.profiles enable row level security;` and check again **before putting any real data in this table**.
- Also open **Authentication → Policies → profiles** and confirm three policies are listed: `profiles_select_own`, `profiles_update_own`, `profiles_insert_own`.

**Check it worked:** the query above returns `true` and all three policies are visible.

## 9. Supabase Auth URL configuration

- Supabase dashboard → **Authentication → URL Configuration**.
- Set **Site URL** to `http://localhost:3000` for now. Change it to `https://yourdomain.com` once step 16 is done, and keep the localhost entry in the redirect list so local development keeps working.
- Under **Redirect URLs**, add — exactly, including the path:
  - `http://localhost:3000/auth/callback`
  - `https://yourdomain.com/auth/callback` (add this now even though the domain is not live yet)
  - `http://localhost:3000/auth/confirm`
  - `https://yourdomain.com/auth/confirm`

That path is what `src/app/auth/callback/route.ts` serves and what the login page sends users to. A typo here produces a sign-in link that lands on an error page with no useful message.

**Check it worked:** all four URLs appear in the redirect list after saving.

### 9a. Give yourself a password — the quickest way in

Sign-in offers three methods: email + password, magic link, and Google. Only the
password one works with no further configuration, so do this first and you are
never locked out while you set the other two up.

```
npm run seed:dev -- you@yourdomain.com
```

It creates a confirmed account and prints a generated password once. To choose
your own, prefer the environment variable over an argument — a password on the
command line lands in your shell history:

```
SEED_DEV_PASSWORD='something-long' npm run seed:dev -- you@yourdomain.com
```

Re-running it on an existing account resets only the password. The account, its
profile and all its onboarding data are left alone.

**Check it worked:** sign in at `/login` with that address and password. A brand
new account lands on `/onboarding/interview`; one that has finished onboarding
lands on `/dashboard`.

Supabase enforces a minimum password length of 6 by default. Raise it under
**Authentication → Providers → Email** before there are real users.

### 9b. Point the email templates at `/auth/confirm` — required

**Without this step the magic link does not work** (password sign-in, §9a, is
unaffected). Supabase's stock templates use
`{{ .ConfirmationURL }}`, which routes the link through Supabase's own
`/auth/v1/verify` and hands our app a PKCE `code`. Exchanging that code needs a
verifier stored in the browser that *requested* the link — so the link only ever
works in that one browser, and fails when someone requests it on a laptop and
opens the email on a phone. That is what broke the first live sign-in attempt.

`/auth/confirm` verifies a `token_hash` instead, which needs no verifier and
works from any device.

Supabase dashboard → **Authentication → Emails** (templates). Edit **Magic Link**
and **Confirm signup**. In each, replace the `href` on the link with:

**Magic Link**

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
```

**Confirm signup**

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
```

Leave the rest of each template alone — only the link target changes. If you
later enable password recovery or email change, those templates take
`type=recovery` and `type=email_change` respectively; the route already accepts
both.

`{{ .TokenHash }}` is the important part. `{{ .ConfirmationURL }}` is the value
to remove.

**Check it worked:** request a link from `/login`, open it, and you land signed
in on `/dashboard`. If you land on `/login` with "That sign-in link wasn't
readable", the template is still wrong — the route logs the exact reason, so
check the dev server output. If you get "That link has expired", the template is
right and the token was simply stale or already used; request another.

## 10. Google sign-in

- Supabase dashboard → **Authentication → Providers → Google** → toggle it on. **Leave this tab open** — it displays the exact callback URL you need in a moment, of the form `https://<project-ref>.supabase.co/auth/v1/callback`.
- In a second tab, go to `console.cloud.google.com` (sign in with the Workspace account from step 3) → **APIs & Services → Credentials** → **Create credentials → OAuth client ID** → application type **Web application**.
  - You will be asked to configure the OAuth consent screen first if you have not before: choose External, fill in the app name, support email and the domain from step 2.
  - Under **Authorised JavaScript origins**, add `http://localhost:3000` and `https://yourdomain.com`.
  - Under **Authorised redirect URIs**, paste the `https://<project-ref>.supabase.co/auth/v1/callback` URL from the Supabase tab. Paste it; do not retype it.
- Google gives you a **Client ID** and **Client Secret**. Paste both into the Supabase Google provider fields and save.

**Check it worked:** the Supabase Google provider shows as enabled with a client ID filled in. You will actually test it in step 12.

## 11. Local environment file

- In the repo, copy the template: `cp .env.example .env.local`
- Fill in, at minimum:

  ```
  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 7>
  SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 7>
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```

  Leave the rest blank for now — they are validated as optional until the milestone that needs them.
- Regenerate the database types now that a real project exists (this replaces a hand-written placeholder file):

  ```
  npx supabase login
  npx supabase gen types typescript --project-id <project-ref> > src/lib/types/database.ts
  ```

  Then run `npm run verify`. It must still pass. If it does not, stop and hand it to Claude — the placeholder was shaped to match the generated output, so a failure means something real changed.

**Check it worked:** `npm run verify` passes, and `git diff src/lib/types/database.ts` shows the placeholder replaced by generated types.

## 12. Test sign-in end to end

- `npm run dev`, then open `http://localhost:3000/login`.
- Enter your email, submit, and open the magic-link email Supabase sends. Click it. **Expected:** you land on `/dashboard` and see the three empty bands.
- Sign out using the link in the top-right nav. **Expected:** back at `/login`, and visiting `/dashboard` directly sends you back to `/login`.
- Repeat with **Continue with Google**.
- Then open Supabase → **Table Editor → profiles**. **Expected:** a row exists for your account, with the right email, created automatically by the signup trigger. If there is no row, the migration in step 8 did not apply properly — go back and re-run it.

**Check it worked:** all four of the above. This is the first moment the product is real.

## 13. Stripe

- Create a Stripe account at `dashboard.stripe.com` using the company from step 1 and the `billing@yourdomain` address. Complete business verification and connect the bank account — payouts are blocked until this is done, and it can take a couple of days.
- **Product catalogue → Add product**:
  - Name: `LinkBud`
  - Pricing model: **Recurring**, **$49.00 USD**, billing period **Monthly**
  - Save, then open the price you just created and copy its **price ID** (`price_...`). That is `STRIPE_PRICE_ID`.
- **Developers → API keys** → copy the **Secret key** (`sk_...`). That is `STRIPE_SECRET_KEY`. Use the test-mode key while building; swap to the live key at launch.

**About the 14-day trial:** it is applied when the subscription is created, not configured on the price, so there is nothing more to set in the dashboard today. Milestone 4 wires it with the card required up front. Do not add a trial on the price itself as well, or customers get two.

**Deferred to Milestone 4:** the webhook endpoint. Stripe needs a live URL to send events to, and the route (`/api/stripe/webhook`) does not exist yet. When it does: **Developers → Webhooks → Add endpoint**, point it at `https://yourdomain.com/api/stripe/webhook`, and copy the **signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

**Check it worked:** the product shows a $49.00/month recurring price, and you have a `price_...` ID and an `sk_...` key in your private note.

## 14. Resend, and verify the sending domain

Approval nudges and trial reminders are the only thing standing between a customer and forgetting LinkBud exists. If they land in spam, the product does not work.

- Sign up at `resend.com` with the Workspace address from step 3.
- **Domains → Add domain** → enter `yourdomain.com`.
- Resend shows a set of DNS records (DKIM, SPF, and a return-path/MX record). Add every one of them at the registrar from step 2, exactly as displayed — copy-paste, do not retype, and watch for a trailing dot the registrar may add or require.
- Wait for propagation (usually minutes, sometimes an hour) and hit **Verify**.
- **API Keys → Create API key** → full access → copy it. That is `RESEND_API_KEY`. It is shown once.
- Decide the from-address now and use it everywhere: `LinkBud <hello@yourdomain.com>`.

**Check it worked:** the domain shows **Verified** in Resend with a green status on every record. Not "pending" — actually verified.

## 15. The short-link domain

Every post's call to action is rewritten to a short link on a domain you own. It carries click attribution, which is the half of the product LinkedIn's API cannot take away.

- Buy a short domain — two syllables or fewer, ideally 4–6 characters. The spec writes it throughout as `lnkb.to`; buy whatever is actually available. `.to`, `.link` and `.co` registrars are all fine.
- Do **not** put it behind the same DNS proxy rules as the main site if that would add a redirect hop; a short link should resolve in one jump.
- Point it at the Vercel project in step 16 (Vercel will give you the DNS records to add).
- Set `SHORT_LINK_DOMAIN` to the full URL **including the scheme** — `https://lnkb.to`, not `lnkb.to`. The configuration validator rejects it otherwise, at boot, loudly.

**Check it worked:** the short domain resolves to the app (a 404 from the app is fine at this stage — a registrar parking page is not).

## 16. Vercel project and environment variables

- Go to `vercel.com` → **Add New → Project** → import this Git repository. Accept the detected Next.js settings.
- Before the first deploy, go to **Settings → Environment Variables** and add the following. Set each for **Production**, **Preview** and **Development** unless noted.

  | Variable | Value | Notes |
  |---|---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | From step 7 |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | From step 7. Public by design. |
  | `SUPABASE_SERVICE_ROLE_KEY` | service_role key | From step 7. **Never** prefix with `NEXT_PUBLIC_`. |
  | `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com` | Production value; previews can keep the Vercel URL |
  | `SHORT_LINK_DOMAIN` | `https://lnkb.to` | From step 15, with scheme |
  | `STRIPE_SECRET_KEY` | `sk_...` | Test key on Preview, live key on Production |
  | `STRIPE_PRICE_ID` | `price_...` | From step 13 |
  | `RESEND_API_KEY` | `re_...` | From step 14 |
  | `TOKEN_ENCRYPTION_KEY` | generate it | Run `openssl rand -base64 32`. Encrypts stored LinkedIn tokens. Changing it later makes every stored token undecryptable. |
  | `CRON_SECRET` | generate it | Run `openssl rand -base64 32`. Stops anyone hitting the cron worker route. |
  | `LINKEDIN_CLIENT_ID` | from step 5 | Milestone 6 |
  | `LINKEDIN_CLIENT_SECRET` | from step 5 | Milestone 6 |
  | `LINKEDIN_REDIRECT_URI` | `https://yourdomain.com/api/linkedin/callback` | Must match step 5 exactly |
  | `OPENROUTER_API_KEY` | from openrouter.ai | Milestone 5 |
  | `EXA_API_KEY` | from exa.ai | Milestone 8 |

  `STRIPE_WEBHOOK_SECRET` is added in Milestone 4 when the endpoint exists.

- **Settings → Domains** → add `yourdomain.com` and follow the DNS instructions at your registrar. Add the short domain from step 15 here too.
- Deploy.
- Go back to **step 9** and update the Supabase Site URL to `https://yourdomain.com`.

**Check it worked:** `https://yourdomain.com` shows the LinkBud landing page over HTTPS, `/login` sends a magic link that returns you to the production dashboard, and the Vercel deployment log shows no environment errors. If a variable is missing, the app says so explicitly rather than failing mysteriously later — that is deliberate.

---

## Where each secret ends up

| Secret | Lives in | Never lives in |
|---|---|---|
| Supabase anon key | `.env.local`, Vercel, the browser bundle | — (it is public by design; RLS is what protects the data) |
| Supabase service_role key | `.env.local`, Vercel (server only) | Any `NEXT_PUBLIC_` variable, any component, any screenshot |
| Stripe secret key | `.env.local`, Vercel | The client, logs, error messages |
| LinkedIn client secret | `.env.local`, Vercel | The client |
| `TOKEN_ENCRYPTION_KEY` | Vercel, your password manager | Anywhere you might lose it — stored tokens cannot be recovered without it |
| Customer LinkedIn tokens | Encrypted at rest in Postgres | Logs, error reports, anywhere in plaintext |

If a secret is ever pasted into a chat, a commit, or an issue, rotate it. Rotating is ten minutes; a leaked service_role key is your whole customer database.
