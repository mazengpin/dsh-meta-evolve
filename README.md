# dsh-meta-evolve

> **Status: PRE-RELEASE `0.9.0` — under active development.** This package is published on the `next` dist-tag, not `latest`.
> Its API, wire records and panel contracts may change between `0.9.x` releases, and each package carries its own `ROADMAP.md` naming what `1.0.0` still requires.
> A published tarball is a snapshot of a moving surface: read `ROADMAP.md` before depending on a shape.

**The evolution half of the meta layer.** It composes this program's live state from its own routes — decision log, intent field, LVL1 gate, intent map, meta clones — and records **evolution rounds** as deltas against the previous round. `POST /meta-evolve/api/evolve` is the control that appends a round.
It opens no device and calls no model: the GPU is reached only through `llama.cpp` and its controlling scripts.

## Install

Four steps, once, in a profile that has never seen this package.

1. Clone the repository next to the other clones, so the profile can reach it with a relative link:
   `git clone <repo-url> C:/Users/<you>/Projects/deepseek-root/plugins-src/dsh-meta-evolve`
2. Install and build inside the clone: `cd plugins-src/dsh-meta-evolve` then `pnpm install` then `pnpm run build`. The build writes `lib/index.js` (host half) and `lib/client.js` (web client bundle), and both are what the profile actually loads.
3. Add the dependency to the profile's `package.json` as a **relative** link — never an absolute path: `"dsh-meta-evolve": "link:../../plugins-src/dsh-meta-evolve"`.
4. Add `"dsh-meta-evolve"` to the same file's `dsh.profile.bundles` array, then restart the profile. A bundles change hot-reloads, but a newly added dependency is not seen until the next boot.

The package ships its own bundle patch at `cordis.patch.yml`. A profile that lists this package in `dsh.profile.bundles` merges that layer at boot and mounts one loader row, `id: meta-evolve`, `name: 'dsh-meta-evolve'` — no `config:` block, because there is no config schema yet and an invented one would be an invented install spec.

## What it exposes

The host half registers its routes under the prefix `/meta-evolve`. `GET /meta-evolve/api/state` composes the live program state; the rounds store keeps one record per evolution round with its deltas; `POST /meta-evolve/api/evolve` appends a round and returns what moved.
The client half contributes one panel page through the profile's client slot set, declared in `dsh.client.inject`. It renders state and it does not reach the GPU.

## Checks

Run these in the clone after a change; each prints its own count and exits non-zero on failure.

- `pnpm run typecheck` — `tsc --noEmit`.
- `pnpm run build` — `tsdown`, ESM host half plus the CJS client bundle.
- `pnpm run verify` — `node verify/meta-evolve-verify.mjs`.
- `npm run check` — all three, in order.
- `npm pack --dry-run` — proves the `files` list and every `exports` target resolve, without publishing anything.

`verify/independent.mjs` and `verify/panel-render.mjs` are the heavier harnesses: the first drives the surface independently of the plugin's own code paths, the second renders the panel. Run them when the change touches route composition or the panel.

## Limits, stated rather than implied

The round store records what the routes returned at the moment the round was taken; a route that is down is recorded as an absent reading and never as a zero. A round with no deltas is a round, not a failure.
The package does not sign its records, does not publish anything, and does not decide when a round is due — a caller does.

## Licence

MIT. See `LICENSE`.
