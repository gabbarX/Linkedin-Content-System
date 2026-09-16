---
description: Build a feature the LinkBud way
argument-hint: [what to build]
---

Build: $ARGUMENTS

Follow this order, and do not skip ahead:
1. Read `CLAUDE.md` and `docs/ARCHITECTURE.md`.
2. Say which module this belongs to. If it belongs to none, stop and say so.
3. Check it against `docs/LINKEDIN-COMPLIANCE.md`. If it violates a constraint,
   stop and say which one.
4. Check `CLAUDE.md`'s "When TDD is mandatory" list. If this touches Stripe
   billing or trial state transitions; the LinkedIn adapter and token
   refresh; the job engine (claiming, backoff, retry, idempotency —
   a retry must never double-post to a customer's feed); attribution
   (short-link resolution, click counting, deduplication); the 48-hour
   purge job; or any security boundary (redirect validation, RLS-adjacent
   logic, token encryption) — write the failing test first. It is not
   required for UI components or prompt construction.
5. Implement.
6. Run `npm run verify`.
7. Commit with a conventional-commit message.
