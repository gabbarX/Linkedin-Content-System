# LinkedIn compliance

These constraints derive from LinkedIn's API Terms of Use, User Agreement and platform documentation, verified 2026-09-16 during spec research. **They are not preferences.** Any change to this document requires re-verifying the underlying source first — do not amend it from memory, and do not add a constraint that spec §2 does not support.

Source of truth: `docs/superpowers/specs/2026-09-16-linkbud-design.md` §2.

## The constraint table

| Constraint | Source | Consequence for the build |
|---|---|---|
| "Use the APIs to automate posting" is prohibited | API ToS §3.1(26) | **Every publish is a user-initiated tap.** No unattended auto-publish, no "set and forget" mode, at any tier. |
| `r_member_social` (read a member's own posts) is closed to new access requests | LinkedIn dev docs | Voice is learned from **user-pasted samples**. LinkBud never fetches a user's posts. |
| Self-serve OIDC returns `sub`, name, email, picture only | Sign In with LinkedIn v2 | Business context comes from the **guided interview**. No headline, About or experience is available. |
| Documents (carousels), multiImage and `memberCreatorPostAnalytics` require Community Management API approval | CMA docs | **v1 is text-only.** Visual studio and the analytics ingest unlock together, on CMA approval. |
| Scraping and browser automation are prohibited; remedy is account restriction | User Agreement §8.2(2), §8.2(13) | **No Chrome extension, no session cookies, no headless browser.** A hard architectural boundary, not a trade-off to revisit. |
| Member social activity may be stored for 48 hours | Marketing API Data Storage Requirements | Persist **our own generated content, post URNs and numeric metrics**. Purge LinkedIn-returned social content within 48h via a scheduled job. |
| Apps may not store social-network tokens off-device | Apple App Store 5.1.1(v) | **Web / installable PWA only.** Server-side scheduling is incompatible with a native iOS build under this rule. Native is a separate, later decision. |
| Share on LinkedIn rate limit: 150 req/member/day, 100k/app/day | LinkedIn rate limit docs | Soft per-user publish cap well below 150. Surface remaining quota in the UI. |
| CMA cannot be requested on an app that already holds Share on LinkedIn / OIDC | CMA app review docs | **Two LinkedIn apps.** App A (self-serve, live now), App B (clean, CMA application filed day one). |

## The accepted risk, stated once so it is never rediscovered

LinkedIn's terms restrict the scheduler category. Sanctioned schedulers (Buffer, Hootsuite, Publer) operate under a Marketing Partner agreement. Until CMA approval lands, LinkBud does not have one.

Approve-then-publish is the most defensible posture available — every API call is a human action — but the category risk is real and permanent. It is an accepted business risk, not an open question to relitigate in a pull request.

Competitive note, because it will come up: Taplio, Supergrow, AuthoredUp and Kleo are **not** LinkedIn partners and rely on extensions or session authentication. Kleo's in-LinkedIn extension was reportedly withdrawn after a LinkedIn cease-and-desist. "Competitor X does it" is therefore never an argument for doing it here. The enforcement risk lands on the *customer's* account, not ours.

## Things that look reasonable but are forbidden

Each of these is a plausible, well-intentioned idea that a capable engineer will propose. Each is banned. The cost is the part that matters, and it is usually paid by the customer's LinkedIn account rather than by us.

### 1. Scraping the user's public LinkedIn profile to speed up onboarding

- **Why it is tempting:** the guided interview is ten minutes of typing. Their headline, About section and experience sit on a public page, and pre-filling from it would halve onboarding and lift activation.
- **What it costs:** scraping is prohibited by User Agreement §8.2(2) and §8.2(13), and LinkedIn's stated remedy is account restriction. That trades a percentage point of activation for the chance that a paying customer loses the LinkedIn profile the entire product depends on. The interview stays; business context comes from the interview, never the profile.

### 2. Shipping a browser extension to read analytics the API will not give us

- **Why it is tempting:** impression and engagement data is visible to the member in their own browser. An extension reads the page the user is already looking at, and unblocks the "what's working" band years before CMA approval might arrive.
- **What it costs:** an extension operating on LinkedIn pages is browser automation under the same User Agreement clauses, executed while signed in as the customer. Kleo's in-LinkedIn extension was reportedly pulled after a cease-and-desist. Our attribution loop is built from *our own* click data precisely so it works with no API dependency and no extension. The analytics gap is filled by CMA approval or not at all.

### 3. Publishing on a schedule without a human tap

- **Why it is tempting:** the user already approved the post, so firing it at the optimal minute from a cron worker is better content strategy — and it is exactly what every competitor sells as "scheduling".
- **What it costs:** API ToS §3.1(26) prohibits using the APIs to automate posting. Approve-then-publish is the one posture that keeps every API call attributable to a human action, which is the whole basis of our defensibility. The correct implementation is an `approval_nudge` job that pings the user at the right minute in their timezone; the publish waits for the tap. "The user pre-approved it" is not a human tap.

### 4. Storing LinkedIn-returned post text beyond 48 hours

- **Why it is tempting:** caching the published text makes draft-vs-published diffing trivial, survives edits made inside LinkedIn, and would give the `learnings` module a cleaner signal.
- **What it costs:** the Marketing API Data Storage Requirements permit member social activity to be stored for 48 hours. A permanent cache is a terms violation sitting in our database, discoverable in exactly the partner review that decides whether CMA is granted. Persist our own generated text, post URNs and numeric metrics indefinitely; everything LinkedIn hands back is purged by the `purge_linkedin_content` job inside 48 hours.

### 5. Requesting Community Management API access on the app that already holds Share on LinkedIn

- **Why it is tempting:** one app means one client ID, one set of credentials, one consent screen. Two apps looks like duplicated configuration and an accident waiting to happen.
- **What it costs:** CMA cannot be requested on an app that already holds Share on LinkedIn / OIDC — the request fails on that ground alone, and **a rejection cannot be appealed on the same app; it requires creating a brand-new one.** With a reported 3–4 month turnaround and no SLA, a rejection on a technicality costs a quarter. App A is self-serve and live; App B is clean and holds only the CMA application. Never add a product to App B.

### 6. Using an unofficial API or the member's session cookies

- **Why it is tempting:** undocumented endpoints return everything the official API withholds — analytics, profile data, a member's own posts. The session cookie is already in the user's browser, and a "paste your session cookie" flow is an afternoon of work.
- **What it costs:** this is the same prohibited automation as scraping, performed with the customer's own credentials. It defeats the rate limits, bypasses the consent model, and makes the customer's account the thing LinkedIn restricts when it is detected. It would also end any prospect of CMA approval. No amount of feature value makes that trade worth it.

## The rule to apply when something new comes up

If a proposed feature needs data or an action that the self-serve Share on LinkedIn + OIDC scopes do not provide, there are exactly three legitimate answers: get it from the user directly, derive it from our own data, or wait for CMA approval. There is no fourth. If you believe there is, stop and ask the human rather than implementing it.
