# ROADMAP — dsh-meta-evolve

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The evolution half: composes the program state from its own routes and records evolution rounds as deltas against the previous round.

## What is measured today

`node verify/meta-evolve-verify.mjs` 30 of 30 with 3 driven mutations (dead-host-port, stale-fixture-delta, delta-assertion-red); `npm pack --dry-run` 18 files / 84.1 kB; mounted on 3084 with `/meta-evolve/api/state` 200.

## What 1.0.0 still requires

1. Rounds must be attributable to a cause: record the route census that produced a delta, not only the delta.
2. A round that cannot reach one of its sources must record an ABSENT reading with the failing URL, never a zero.
3. Sign a round (Ed25519) so a later reader can tell a produced round from an edited one.
4. Retention: an explicit bound on how many rounds are kept, with the drop recorded as an event.

## Limits, stated rather than implied

The round store is local and unsigned. `GET` composition depends on sibling routes being up; a sibling that is down is indistinguishable from a sibling that returned nothing unless the absent marker is set.

## Compatibility seam

Reads sibling route prefixes (`/meta-context`, `/meta-market`, `/meta-intent`, decision log, intent map). Any prefix rename is a break this package cannot detect at build time.

## How this roadmap is graded

An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.
