---
description: Check the working tree against the spec and the LinkedIn constraints
---

Read `docs/superpowers/specs/2026-09-16-linkbud-design.md` and
`docs/LINKEDIN-COMPLIANCE.md`, then review `git diff` against them.

Report, as a short list:
1. Anything that violates a hard constraint — especially auto-publishing
   without a user tap, reading a member's LinkedIn posts, scraping, or
   storing LinkedIn-returned content beyond 48 hours.
2. Anything that contradicts a decision recorded in the spec.
3. Scope that has crept in from the "out of scope for v1" list.

Say "no violations" if there are none. Do not pad the list.
