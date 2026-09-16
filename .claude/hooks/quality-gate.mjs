#!/usr/bin/env node
/**
 * LinkBud Stop hook - quality gate. ADVISORY ONLY (never blocks).
 *
 * This is deliberately advisory rather than blocking. Reasoning, so nobody
 * "fixes" this into a blocking hook without re-checking first:
 *
 * Claude Code's Stop hook CAN block a stop attempt: a command hook that
 * exits with code 2 makes Claude Code "prevent Claude from stopping,
 * continue the conversation" (per the installed Claude Code's own hooks
 * reference, https://code.claude.com/docs/en/hooks, "Exit code 2 behavior
 * per event" table, Stop row). Older Claude Code versions additionally
 * sent a `stop_hook_active` boolean on the hook's stdin JSON so a hook
 * could tell "this very stop attempt was already forced to continue by a
 * hook" and deliberately not block a second consecutive time - the
 * standard safeguard against a hook looping forever.
 *
 * As of the version installed here (2.1.224, checked 2026-09-16), the
 * published Stop hook input schema is:
 *   session_id, prompt_id, transcript_path, cwd, scratchpad_dir,
 *   permission_mode, effort, hook_event_name, last_assistant_message
 * `stop_hook_active` is NOT in that list, and the docs confirm there is no
 * documented field, counter, or built-in safeguard that lets a Stop hook
 * detect "I already blocked this turn." A typecheck failure is not always
 * fixable in one turn (for example a pre-existing, deliberately deferred
 * issue), so an unconditionally blocking hook has no guaranteed exit and
 * could loop forever.
 *
 * A hook that might loop is worse than a hook that only informs. So: this
 * hook NEVER exits non-zero. It always runs `npm run typecheck`, reports
 * the result as plain text on stdout (which Claude Code adds as context
 * Claude can act on), and exits 0. It is a nudge, not a gate - `npm run
 * verify` (see CLAUDE.md, "The gate") remains the actual quality gate, and
 * is what `/verify` and `/feature` run and require to pass before a commit.
 *
 * If a future Claude Code version documents a reliable "already forced to
 * continue this turn" signal again, this hook should be revisited and,
 * only then, changed to block unconditionally on failure.
 *
 * Portability: pure Node ESM (no bash/PowerShell-specific syntax), so this
 * runs the same way on Windows, macOS and Linux. Default hook shell on
 * this Windows install is Git Bash, which invokes `node <path>` directly.
 * `.mjs` so Node treats it as a module regardless of the project's own
 * package.json "type" field.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  // Defense in depth only: not documented for the installed version (see
  // header comment), but free to honor if some build still sends it - it
  // never changes this hook's blocking behavior either way, since this
  // hook does not block at all.
  if (payload && payload.stop_hook_active === true) {
    process.exit(0);
  }

  const projectDir =
    process.env.CLAUDE_PROJECT_DIR || process.cwd() || payload.cwd;

  const result = spawnSync("npm run typecheck", {
    cwd: projectDir,
    shell: true,
    encoding: "utf8",
    timeout: 90_000,
  });

  if (result.error) {
    console.log(
      `Quality gate (advisory): could not run "npm run typecheck" (${result.error.message}). Skipping - this does not block stopping.`
    );
    process.exit(0);
  }

  if (result.status === 0) {
    // Silent on success - nothing useful to add to context.
    process.exit(0);
  }

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  console.log(
    [
      "Quality gate (advisory, non-blocking): `npm run typecheck` failed.",
      'CLAUDE.md, "The gate": `npm run verify` must pass before any commit - please fix this before committing.',
      "",
      output || `(no output; exit code ${result.status})`,
    ].join("\n")
  );
  process.exit(0);
}

main();
