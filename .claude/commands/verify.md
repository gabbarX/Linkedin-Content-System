---
description: Run the full quality gate and fix anything red
---

Run `npm run verify`. If any stage fails, fix the cause — never the symptom,
and never by loosening a type, disabling a lint rule, or skipping a test.
Re-run until all four stages pass, then report what you changed.

Build warnings are not exempt. There is no standing whitelist of warnings to
ignore; if the build prints something new, read it and decide, do not assume a
previous session already blessed it.

`npm run verify` is the compile-time gate only. If the change affects
behaviour a user can see, follow it with `/ecc:browser-qa` — see the
"Verify in a browser before shipping" section of `CLAUDE.md`.
