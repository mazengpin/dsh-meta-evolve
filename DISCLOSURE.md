# DISCLOSURE — dsh-meta-evolve

**Package** `dsh-meta-evolve` · **version** `0.9.0` · **licence** MIT · **state** SOURCE PREVIEW — see section 8.

## 1. What this package is

The **evolution half of the meta layer** for the `dsh-meta-evolve` program: a Cordis plugin with a Host half that registers routes and a web client half that contributes one panel page.
It composes the program's live state from routes the program already serves, and it records **evolution rounds**, each round a delta against the previous one.

## 2. What it does today

`node verify/meta-evolve-verify.mjs` — **30 of 30 checks passed**, exit code **0**, with **3 driven mutations**: `dead-host-port`, `stale-fixture-delta`, `delta-assertion-red`.
The mutations are driven rather than asserted: check `F1 verdict` reads the mutation count back out of the run that performed them.
`npm pack --dry-run` — **21 files / 88.6 kB** package size (308.4 kB unpacked), exit code **0**, measured on this clone on 2026-11-03 with `DISCLOSURE.md` and `CONTEXT.md` in `files` (the same command read **19 files / 85.0 kB** before those two documents were added).
`ROADMAP.md` prints **18 files / 84.1 kB**; that figure did **not** reproduce on re-measurement, and the measured figure in this section is the one to use.
It registers three routes: `GET /meta-evolve/api/state` (the composed live state), `POST /meta-evolve/api/evolve` (the control that appends a round) and `GET /meta-evolve/api/rounds` (the recorded rounds, newest first).
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

**Writes, exactly one file** — `<program-workspace>/research/meta-evolve-rounds.jsonl`, append-only JSONL, one line per round.
It writes **NONE** elsewhere: no second file, no database, no profile manifest, no plan document, no cache.
It touches **NONE** of: the GPU, any model, any network peer off this machine.

## 5. Network

It reads **only loopback prefixes**: `/decision-log/api/`, `/lvl1-gate/api/` and `/intent-map/api/`, on the host URL it is configured with (default `http://127.0.0.1:3083`).
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
