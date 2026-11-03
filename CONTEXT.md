# CONTEXT — dsh-meta-evolve

**Why this file exists:** so that a stranger with no access to the session that built this package can rebuild the reasoning behind it — the problem, the situation, the intent, the roads not taken, and how to get a working copy running.

## 1. The problem, without jargon

A long-running project accumulates state in many places: a decision log, a list of intents, a gate on which plugins have been proven, a map from intent to zone, and a directory of plugin clones.
Answering the question "what changed since last time?" means reading all of them by hand, and a person reading them one after another silently forgets which answer came from where.
This package reads those sources, composes them into one state document, and records a ROUND — a snapshot with a computed delta against the previous snapshot — so that "what moved" is arithmetic rather than memory.
When a source cannot be read, the field is `null` with a reason and is never reported as `0`, because a zero that means "not measured" is indistinguishable from a zero that means "nothing there".

## 2. The context it was built in

It is part of the `dsh-meta-evolve` program, whose workspace is a plan store at `deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE`; this package is the EVOLUTION half of that program's meta layer and lives as a clone at `deepseek-root/plugins-src/dsh-meta-evolve`.
It sits beside sibling packages that serve the sources it reads: the decision-log route, the `lvl1-gate` routes and the `intent-map` route are served by other plugins, and the intent field is a file the program writes.
The constraint that shaped the code is a PATH constraint, and it is stated in the source rather than assumed: the package is built in `plugins-src/` and consumed from a profile whose process working directory is neither the workspace nor `plugins-src/` (`src/host/workspace.ts:11-13`).
That is why no path is hard-coded as the only answer: the host URL, the workspace, the `plugins-src/` tree and the rounds file each resolve through an ordered candidate list, an explicit config key or environment variable wins over discovery, and the winning candidate is REPORTED in the payload instead of being inferred by the reader (`src/host/workspace.ts:11-27`).
It is also why the program workspace's own `plugins-src/` is the LAST candidate rather than the first: it is a smaller, different tree, and counting it would produce a confident zero from an instrument that cannot see its subject (`src/host/workspace.ts:276-279`).

## 3. The intent

The builder was trying to make the program's own state COMPOSABLE and COMPARABLE: one GET that reads the live sources, one POST that appends a round, and one GET that returns the rounds newest-first, with every count carrying its denominator.
Deliberately NOT attempted: a scheduler (a caller decides when a round is due), signing or chaining the rounds (none is claimed), any model or embedding call (the package opens no device), a config schema for its loader row (an invented schema would be an invented install spec), and enforcement of the program's name gate (it counts directories; it does not authorise them).

## 4. Alternatives considered and rejected

**A single hard-coded absolute path** for the workspace and the `plugins-src/` tree — rejected, because the process working directory is neither location: `None of them is hard-coded as the ONLY answer, because the package is built in plugins-src/ and consumed from a profile whose process cwd is neither` (`src/host/workspace.ts:11-13`).
**The program workspace's own `plugins-src/` first in the candidate list** — rejected: `it is a different, smaller tree, and counting it would produce a correct zero for an instrument that cannot see the subject` (`src/host/workspace.ts:276-279`).
**Reporting `0` when a source cannot be read** — rejected: an unreadable source becomes `null` with a reason, which the harness forces with the dead-port mutation, so `null+reason for 3 fields` is a check rather than a hope.
**A `config:` block for the loader row** — rejected: `There is no schema yet; unknown keys are reported` (`src/host/workspace.ts:39`), and an invented config would be an invented install spec.
**Signing or hash-chaining the rounds file** — NOT RECORDED. No rejected design was found in the code or its comments, so no reason is stated here.
**A built-in timer or scheduler for rounds** — NOT RECORDED. No rejected design was found in the code or its comments, so no reason is stated here.

## 5. Recreate a working environment

Only `git`, `node` and `pnpm` are needed; no other shell tool is required and no script in this package needs one.

1. `git clone <repo-url> plugins-src/dsh-meta-evolve` — the release owner sets `<repo-url>` at publish time; this package does not carry a `repository` field.
2. `cd plugins-src/dsh-meta-evolve`
3. `pnpm install`
4. `pnpm run typecheck` — expect exit code `0`.
5. `pnpm run build` — writes `lib/index.js` (Host half) and `lib/client.js` (web client bundle).
6. `pnpm run verify` — starts from the live host at `http://127.0.0.1:3083`; with no host listening the preflight check fails rather than passing on two non-answers, so serve the three source routes on a host first.
7. Mount it in a profile by adding `"dsh-meta-evolve": "link:../../plugins-src/dsh-meta-evolve"` to that profile's dependencies — a RELATIVE link, never an absolute path — then add `"dsh-meta-evolve"` to the same file's `dsh.profile.bundles`.
8. Restart the profile: a `dsh.profile.bundles` change hot-reloads, but a newly added dependency is not seen until the next boot.

## 6. What to read next

`DISCLOSURE.md` for what the package does and does not do, what it reads and writes, and its stated limits; `ROADMAP.md` for what `1.0.0` still requires.
`src/host/workspace.ts` carries the design comment that explains path resolution, and `src/host/sources.ts` carries the rule that an unreadable source is `null` with a reason.
