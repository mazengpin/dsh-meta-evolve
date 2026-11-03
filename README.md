# dsh-meta-evolve

> **Status: PRE-RELEASE `0.9.0` — under active development.** This package targets the `next` dist-tag, not `latest`, and it is **not published yet**: there is no tarball to install today (`DISCLOSURE.md` section 8).
> Its API, wire records and panel contracts may change between `0.9.x` releases, and each package carries its own `ROADMAP.md` naming what `1.0.0` still requires.
> A published tarball is a snapshot of a moving surface: read `ROADMAP.md` before depending on a shape.

**The evolution half of the meta layer.** It composes this program's live state from its own routes — decision log, intent field, LVL1 gate, intent map, meta clones — and records **evolution rounds** as deltas against the previous round. `POST /meta-evolve/api/evolve` is the control that appends a round.
It opens no device and calls no model: the GPU is reached only through `llama.cpp` and its controlling scripts.

## Develop from source — NOT the consumer install path

**These four steps are for DEVELOPING the package, not for a consumer.** They clone, build and `link:` the working tree, so a profile runs this source. A consumer does none of this: a consumer adopts the published pre-release only, and until that release is published there is nothing a consumer can install — the package is a SOURCE PREVIEW, and `DISCLOSURE.md` section 8 states the same.

Four steps, once, in a profile that has never seen this package.

1. Clone the repository next to the other clones, so the profile can reach it with a relative link:
   `git clone <repo-url> <home>/Projects/deepseek-root/plugins-src/dsh-meta-evolve`
2. Install and build inside the clone: `cd plugins-src/dsh-meta-evolve` then `pnpm install` then `pnpm run build`. The build writes `lib/index.js` (host half) and `lib/client.js` (web client bundle), and both are what the profile actually loads.
3. Add the dependency to the profile's `package.json` as a **relative** link — never an absolute path: `"dsh-meta-evolve": "link:../../plugins-src/dsh-meta-evolve"`.
4. Add `"dsh-meta-evolve"` to the same file's `dsh.profile.bundles` array, then restart the profile. A bundles change hot-reloads, but a newly added dependency is not seen until the next boot.

The package ships its own bundle patch at `cordis.patch.yml`. A profile that lists this package in `dsh.profile.bundles` merges that layer at boot and mounts one loader row, `id: meta-evolve`, `name: 'dsh-meta-evolve'` — no `config:` block, because there is no config schema yet and an invented one would be an invented install spec.

## What it exposes

The host half registers its routes under the prefix `/meta-evolve`. `GET /meta-evolve/api/state` composes the live program state; the rounds store keeps one record per evolution round with its deltas; `POST /meta-evolve/api/evolve` appends a round and returns what moved.
The client half contributes one panel page through the profile's client slot set, declared in `dsh.client.inject`. It renders state and it does not reach the GPU.

## Adopting it inside DSH

**What it provides.** One host half under the `/meta-evolve` route prefix — `GET /meta-evolve/api/state` composing the live program state and `POST /meta-evolve/api/evolve` appending a round — plus one client panel page contributed through the profile's client slot set. It opens no device and calls no model.
**What a deployment needs.** A running harness that serves this plugin, the other programs' routes on the same origin (decision log, intent field, LVL1 gate, intent map, meta clones), and a profile carrying its own `package.json`. It reads other programs' control-plane routes on the same origin; it names no vendor, no model and no device.
**How a profile enables a package.** Through the profile's bundle list: add the package name to `dsh.profile.bundles` in the profile `package.json`, and give that same file a **relative** `link:` dependency resolving to the built clone — absolute paths are forbidden. The package ships its own bundle patch at `cordis.patch.yml`; the profile merges that layer at boot and mounts the one loader row stated above, with no `config:` block. A `dsh.profile.bundles` change hot-reloads; a newly added dependency is not seen until the next boot.
**A source preview is readable, not installable.** The tree in `plugins-src/` can be read, cloned and built, and the four develop steps above make a live profile run it — but reading it is not adopting it, and a source tree is never the thing a consumer consumes.
**Adoption is by the published release.** Adoption means the published pre-release, on the `next` dist-tag, resolved as an ordinary dependency of the profile; until that release is published there is no adopting command to run.

## Roadmap at a glance

A glance, not a second record: the authoritative list — with the evidence for every done row, the reason for every deferred one and the rows marked `NOT MEASURED` — is [`ROADMAP.md`](ROADMAP.md). Where this list and that file differ, that file is right and this list is the defect.

- **What this package is**
- **What is measured today**
- **What 1.0.0 still requires**
- **Limits, stated rather than implied**
- **Compatibility seam**
- **How this roadmap is graded**

The roadmap currently carries **0** row(s) marked `NOT MEASURED`; a row moves to done only when its own command prints a green result.

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
