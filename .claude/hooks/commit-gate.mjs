#!/usr/bin/env node
/**
 * LinkBud PreToolUse hook — the commit gate. THIS ONE BLOCKS.
 *
 * Spec §7 requires the quality gate be "enforced by a hook, not by
 * discipline". The Stop hook next door (quality-gate.mjs) deliberately does
 * not block, because Claude Code 2.1.224 documents no way for a Stop hook to
 * tell that it already forced this turn to continue — so a blocking Stop hook
 * could loop forever.
 *
 * PreToolUse has no such problem. It fires on a tool call, not on a turn
 * ending. Exit code 2 blocks that one tool call and feeds stderr back to
 * Claude; the turn continues normally, so there is nothing to loop. That is
 * why the gate lives here and not there.
 *
 * What it does: when Claude tries to run `git commit`, run `npm run verify`
 * first. Green, the commit proceeds. Red, the commit is blocked and Claude is
 * told what failed.
 *
 * Deliberate choices, so nobody "fixes" them without knowing why:
 *
 * - It runs the FULL gate (typecheck, lint, test, build), not a fast subset.
 *   Measured at 18s on this project, which is cheap enough that there is no
 *   reason to weaken what "the gate" means.
 *
 * - It FAILS OPEN if the gate cannot be run at all (npm missing, spawn error,
 *   timeout). A broken toolchain should not make the repository
 *   uncommittable. The warning is loud so the hole is visible rather than
 *   silent. A failing gate still blocks — only an unrunnable one does not.
 *
 * - There is an escape hatch: put LINKBUD_SKIP_GATE=1 in the command, e.g.
 *   `LINKBUD_SKIP_GATE=1 git commit -m "wip"`. It exists because a gate with
 *   no override gets disabled entirely the first time someone genuinely needs
 *   to commit past it. Using it prints a warning, so it cannot be quiet.
 *
 * - It only sees Claude's tool calls. Commits you make yourself in a terminal
 *   are not gated by this; that would need a git pre-commit hook.
 *
 * - It SCRUBS Electron/VS Code environment variables before running the gate.
 *   When Claude Code runs inside the VS Code extension host, the hook process
 *   inherits ELECTRON_RUN_AS_NODE=1 and VSCODE_* vars. Those leak into child
 *   processes and change tooling behaviour — observed here flipping Vite's
 *   config loader to the native path, which made vitest fail inside the hook
 *   while passing in a terminal. A gate that disagrees with the terminal is
 *   worse than no gate: it trains you to bypass it. So the gate runs in an
 *   environment that matches a plain shell.
 *
 * Portability: pure Node ESM, no shell-specific syntax. Runs the same on
 * Windows, macOS and Linux.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const GATE = "npm run verify";
const GATE_TIMEOUT_MS = 280_000;

/** Exit codes Claude Code acts on for PreToolUse. */
const ALLOW = 0;
const BLOCK = 2;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * True when the command actually invokes `git commit`, rather than merely
 * mentioning it. Matches at the start of the string or after a shell
 * separator, and tolerates flags between `git` and `commit`
 * (`git -c user.name=x commit`). Deliberately conservative: a miss means a
 * commit slips through ungated, which is recoverable, while a false positive
 * blocks unrelated work, which is infuriating.
 */
function invokesGitCommit(command) {
  return /(?:^|[;&|(]|&&|\|\|)\s*(?:[A-Z_][A-Z0-9_]*=\S*\s+)*git\s+(?:-\S+(?:\s+\S+)?\s+)*commit(?:\s|$)/i.test(
    command
  );
}

/**
 * The environment the gate should run in: ours, minus the VS Code extension
 * host's fingerprints. See the header note on ELECTRON_RUN_AS_NODE.
 */
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) {
    if (key.startsWith("VSCODE_")) delete env[key];
  }
  return env;
}

function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // Unparseable input is not a reason to block a commit.
    process.exit(ALLOW);
  }

  if (payload.tool_name !== "Bash") process.exit(ALLOW);

  const command = payload.tool_input?.command ?? "";
  if (!command || !invokesGitCommit(command)) process.exit(ALLOW);

  if (/LINKBUD_SKIP_GATE=1/.test(command)) {
    console.error(
      "Commit gate SKIPPED via LINKBUD_SKIP_GATE=1. `npm run verify` was not run — " +
        "this commit is unverified. Say so in your report to the user."
    );
    process.exit(ALLOW);
  }

  const projectDir =
    process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

  const result = spawnSync(GATE, {
    cwd: projectDir,
    shell: true,
    encoding: "utf8",
    timeout: GATE_TIMEOUT_MS,
    env: cleanEnv(),
  });

  // Fails open — see header. Loud, so the gap is never silent.
  if (result.error || result.status === null) {
    const why = result.error?.message ?? `timed out after ${GATE_TIMEOUT_MS}ms`;
    console.error(
      `Commit gate could NOT RUN (${why}). Allowing the commit so a broken ` +
        `toolchain does not block the repository — but this commit is ` +
        `UNVERIFIED. Run \`${GATE}\` manually and tell the user it did not run.`
    );
    process.exit(ALLOW);
  }

  if (result.status === 0) process.exit(ALLOW);

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  console.error(
    [
      `COMMIT BLOCKED: \`${GATE}\` failed (exit ${result.status}).`,
      "",
      'CLAUDE.md, "The gate": it must pass before any commit. Fix the cause —',
      "do not weaken a lint rule, add // @ts-expect-error, or set",
      "ignoreBuildErrors to get past it. Then commit again.",
      "",
      output || "(no output)",
    ].join("\n")
  );
  process.exit(BLOCK);
}

main();
