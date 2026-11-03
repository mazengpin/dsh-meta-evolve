# DISCLOSURE — dsh-meta-evolve

**Package** `dsh-meta-evolve` · **version** `0.9.0` · **licence** MIT · **state** SOURCE PREVIEW — see section 8.

## 1. What this package is

The **evolution half of the meta layer** for the `dsh-meta-evolve` program: a Cordis plugin with a Host half that registers routes and a web client half that contributes one panel page.
It composes the program's live state from routes the program already serves, and it records **evolution rounds**, each round a delta against the previous one.

## 2. What it does today

`node verify/meta-evolve-verify.mjs` — **30 of 30 checks passed**, exit code **0**, with **3 driven mutations**: `dead-host-port`, `stale-fixture-delta`, `delta-assertion-red`.
The mutations are driven rather than asserted: check `F1 verdict` reads the mutation count back out of the run that performed them.
`npm pack --dry-run` — **22 files / 99.3 kB** package size (348.9 kB unpacked), exit code **0**, measured on this clone on 2026-11-03 after `src/host/beam-round.ts` was added. **Corrected in place:** this read **21 files / 88.6 kB** (308.4 kB unpacked) earlier the same day, before that file existed, and **19 files / 85.0 kB** before `DISCLOSURE.md` and `CONTEXT.md` were added to `files` — three measurements of three different trees, not a drift.
`ROADMAP.md` prints **18 files / 84.1 kB**; that figure did **not** reproduce on re-measurement, and the measured figure in this section is the one to use.
`node verify/beam-round.mjs` — **14 of 14 checks passed**, exit code **0**, with **2 driven mutations**: `absent-folded-to-zero` and `delta-blind-to-movement`.
It registers four routes: `GET /meta-evolve/api/state` (the composed live state), `POST /meta-evolve/api/evolve` (the control that appends a round), `GET /meta-evolve/api/rounds` (the recorded rounds, newest first) and `GET /meta-evolve/api/rounds/beam` (the recorded BEAM deltas, newest first, read off the record file on every request).
Its bundle patch `cordis.patch.yml` mounts one loader row, `id: meta-evolve`, with no `config:` block, because there is no config schema yet and an invented one would be an invented install spec.

## 3. What it does NOT do

It does **not** decide when a round is due — a caller does; there is no scheduler and no timer.
It does **not** sign its records, and it holds no key (section 6).
It does **not** publish anything, and it sets **no** `repository` field; the release owner sets that at publish time.
It does **not** call a model, load an embedding, open a device, or reach the GPU.
It does **not** mount itself: a profile must list it in `dsh.profile.bundles`, and the rows come from `cordis.patch.yml`.
It does **not** enforce any gate and does **not** read the decision log to check that a name is authorised; it counts what is there.
It does **not** verify that a recorded round is truthful — that limit is stated in section 6 rather than implied away.

## 4. Data it reads and writes, with paths

**Reads, over loopback HTTP**, from the host it is mounted on — default `http://127.0.0.1:3083`, configurable: `/decision-log/api/list` fills the `decisionLog` field, whose counts are read off the census and never off the rows; `/lvl1-gate/api/status` and `/lvl1-gate/api/sessions` fill the `lvl1Gate` field; `/intent-map/api/map` fills the `intentMap` field.

**Reads, from disk**, under the program workspace: `<program-workspace>/plan/intent-field/field.json` fills the `intentField` field, and a directory census of `<plugins-src>/dsh-meta-*` fills the `plugins` field, counted as directories because a listing is not a count.

**Reads, over loopback HTTP, from the ELIXIR CONTROL APP** — `http://127.0.0.1:4100` by default, `CONTROL_PORT` or `DSH_META_EVOLVE_CONTROL_URL` overriding it: `GET /api/beam/status` and `GET /fleet/status`, the same two routes the `jido` MCP surface's `beam_status` and `fleet_status` actions front. **Both are GETs and this package writes nothing there** — the control plane's only write routes (`POST /api/module_dump`, `/api/module_promote`, `/api/module_revert`, `/fleet/start`, `/fleet/stop`, `/fleet/stop-all`) are never called from here. The endpoint was read from the MCP server config row `jido-mcp`, not guessed, and `src/host/beam-round.ts` cites that file in its header.

**Writes, exactly one file** — `<program-workspace>/research/meta-evolve-rounds.jsonl`, append-only JSONL, one line per round.

**The round's shape**, one JSON object per line: `n`, `at`, `host`, `workspace`, `model`, `counts`, `countsRead`, `fieldReadable`, `ids`, `delta`, `deltaReason`, `beam`, `beamReason`, `beamDeltaReason`, `unreadable`.
`beam` is the control app as that round saw it — `loadedModuleCount`, `processCount`, `uptimeMs`, `httpRequests`, `httpConnections`, `fleetUnits`, plus `identity` (`node`, `systemPid`), `readings: {read, of}` and `unavailable` — and **every field is `{value}` or `{unmeasured: reason}`**: a control app that was down is six reasons, never six zeros.
`delta.beam` compares those fields with the previous round, adds `restarted` from the pid, and is **`null` with `reason: 'first round'`** on the first round rather than a set of zero movements.
A record written before the `beam` field existed reads back as `beam: null` with a reason; the route does not present it as an unchanged BEAM.
It writes **NONE** elsewhere: no second file, no database, no profile manifest, no plan document, no cache.
It touches **NONE** of: the GPU, any model, any network peer off this machine.

## 5. Network

It reads **only loopback prefixes**: `/decision-log/api/`, `/lvl1-gate/api/` and `/intent-map/api/` on the host URL it is configured with (default `http://127.0.0.1:3083`), plus `/api/beam/status` and `/fleet/status` on the control app (default `http://127.0.0.1:4100`).
The control-app reads are **read-only by construction**: two `GET`s, with no write route named anywhere in the package.
It opens **no outbound connection**, calls **no model**, and **never reaches the GPU**: the GPU is reached only through `llama.cpp` and its controlling scripts, and this package opens no device.

## 6. Security posture

Rounds are **local** and **UNSIGNED**.
A reader can see that the file exists and count its lines; a reader **cannot** tell a round this package produced from one edited by hand afterwards.
There is no signature, no hash chain and no key, and `POST /meta-evolve/api/evolve` carries no authentication — plugin routes are public by design in the host webserver, so anything that can reach the host can append a round.
Treat the rounds file as a local log, not as evidence.

## 7. Licence and engines

MIT — see `LICENSE`.
`engines`: node `^22.19.0 || >=24.0.0`, dsh `>=0.2.0-0 <0.3.0`.

## 8. State: SOURCE PREVIEW — information-providing only

The repository exists **to be READ**.
The package is **NOT installable from source today**: there is no published tarball, so there is nothing a consumer can install.
Install arrives **with the published pre-release tarball on the `next` dist-tag**; `publishConfig.tag` is already `next` in `package.json`.
This package carries **no `repository` field**: the release owner sets it at publish time, and it is deliberately not invented here.

## 9. Why a round record belongs in the ecosystem

A plugin ecosystem drifts silently: each clone, each route and each mounted row moves on its own schedule, and no single version number changes when the composition changes.
A round recorded as a delta against the previous round turns that drift into one number a reader can compare, so a movement no suite reports still shows up as movement.
The record also carries what it could not read, so an absent source reads as an absence rather than as a zero.
That is why the record belongs beside the plugins rather than inside one of them: it is the only artifact that has a previous round to be a delta against.
