# ROADMAP — dsh-meta-evolve

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The evolution half: composes the program state from its own routes and records evolution rounds as deltas against the previous round.

## What is measured today

`node verify/meta-evolve-verify.mjs` 30 of 30 with 3 driven mutations (dead-host-port, stale-fixture-delta, delta-assertion-red); `npm pack --dry-run` 18 files / 84.1 kB; mounted on 3084 with `/meta-evolve/api/state` 200.

## What 1.0.0 still requires

| # | What 1.0.0 still requires | Command that proves it | Status today |
|---|---|---|---|
| 1 | A round records the route census that produced its delta, not only the delta | `curl -s http://127.0.0.1:3084/meta-evolve/api/rounds` — every round object carries a non-empty `routeCensus`, and a round without one fails the row | NOT MEASURED — the field does not exist yet |
| 2 | A round that cannot reach one of its sources records an ABSENT reading with the failing URL, never a zero | `node verify/beam-round.mjs` — the driven mutation `absent-folded-to-zero` passes, and the round body carries `{unmeasured: reason}` for that source | PARTLY MEASURED — the mutation exists, the failing-URL field does not |
| 3 | A round is signed (Ed25519) so a later reader can tell a produced round from an edited one | `node verify/meta-evolve-verify.mjs` — a signature check must exist, and a round edited after the fact must fail it | NOT MEASURED — no signature check and no key |
| 4 | Retention is bounded, and a dropped round is recorded as an event | `curl -s http://127.0.0.1:3084/meta-evolve/api/rounds` — the returned count never exceeds the bound, and a `dropped` event appears once the bound is reached | NOT MEASURED — no bound is coded |

## Limits, stated rather than implied

The round store is local and unsigned. `GET` composition depends on sibling routes being up; a sibling that is down is indistinguishable from a sibling that returned nothing unless the absent marker is set.

## Compatibility seam

Reads sibling route prefixes (`/meta-context`, `/meta-market`, `/meta-intent`, decision log, intent map). Any prefix rename is a break this package cannot detect at build time.

## How this roadmap is graded

Every row in the table above names the command that grades it, so a row is checkable or it is NOT MEASURED — never merely pending.
`research.md` is what tests these rows: it asks whether the delta a round records catches a regression that a green suite misses, and it names which rows the answer depends on.
An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.
