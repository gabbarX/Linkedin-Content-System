---
description: Run the full quality gate and fix anything red
---

Run `npm run verify`. If any stage fails, fix the cause — never the symptom,
and never by loosening a type, disabling a lint rule, or skipping a test.
Re-run until all four stages pass, then report what you changed.

The Next.js build-time notice that the `middleware` file convention is
deprecated in favour of `proxy` (Next.js 16) is a known, deferred item —
it is not a failure and does not need fixing here.
