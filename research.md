# RESEARCH — dsh-meta-evolve: does a delta record earn its place?

## 1. The research question

Does a delta record catch a regression that a green suite misses?

This is two claims, and they are not the same claim: that such a regression exists in a plugin ecosystem at all, and that a round recorded as a delta against the previous round reports it as movement.
The falsifier for the second claim is a `delta` that is empty or all zeros while the composition did move: an empty delta on a moving composition is the record being blind, not the composition being still.
Section 4 of `DISCLOSURE.md` already states one case where a delta reports nothing: `delta.beam` is `null` with a reason on the first round, so round one cannot falsify anything and every comparison needs at least two rounds.

## 2. Measured evidence already in the docs

All figures below are VERIFIED (read) from `DISCLOSURE.md` and `ROADMAP.md` on disk today; none was re-run for this file.

| Evidence | Figure as published | Where |
|---|---|---|
| `node verify/meta-evolve-verify.mjs` | 30 of 30 checks, exit 0, 3 driven mutations: `dead-host-port`, `stale-fixture-delta`, `delta-assertion-red` | DISCLOSURE.md, section 2 |
| `node verify/beam-round.mjs` | 14 of 14 checks, exit 0, 2 driven mutations: `absent-folded-to-zero`, `delta-blind-to-movement` | DISCLOSURE.md, section 2 |
| Round-on-round comparison | `delta.beam` compares the fields with the previous round, adds `restarted` from the pid, and is `null` with a reason on the first round | DISCLOSURE.md, section 4 |
| Absent versus zero | every `beam` field is `{value}` or `{unmeasured: reason}`, so a source that was down is a reason and not a zero | DISCLOSURE.md, section 4 |
| Package | `npm pack --dry-run` 22 files / 99.3 kB, 348.9 kB unpacked; the 18 files / 84.1 kB figure in `ROADMAP.md` did not reproduce | DISCLOSURE.md, section 2 |

What that evidence establishes is narrower than the question: the delta assertion can go RED, and the two mutations prove it is not decorative.
What it does not establish is the question itself: a driven mutation changes the harness input rather than the ecosystem, so it shows the check is load-bearing and says nothing about whether a green suite would have missed the same movement.

## 3. What is NOT MEASURED

- The question in section 1. 000: no paired run exists, and no round has been compared against a real composition change with the suite green.
- The size of the round record. 000: no census of rounds appears in either document, so a round count quoted from here would be invented.
- The route census per round. Row 1 of `ROADMAP.md` is open, so the field is absent; absent is not zero, and it is not a measurement of an empty census.
- Signature and retention. Rows 3 and 4 of `ROADMAP.md` are open, so a round edited after the fact is indistinguishable from a produced one, and no drop event can exist yet.
- Whether a record of one round can ever answer the question. It cannot: the delta is `null` by construction, so one round is a reading with no counterpart.

## 4. Next measurement

One paired run: two rounds, suite green in both, one composition change between them. The measurement is a comparison, not a reading.

1. Read the newest round: `curl -s http://127.0.0.1:3084/meta-evolve/api/rounds` — record `n`, `delta` and `deltaReason`.
2. Change one composition input that no check asserts: mount or unmount one sibling route prefix.
3. Append a round again and read the same three fields.
4. Run `node verify/meta-evolve-verify.mjs` in both rounds and record its check count.

The falsifier is a `delta` that is empty or all zeros in round two while the composition moved, with the suite still at 30 of 30: that is the record being blind, and the answer to section 1 would be no.
The counter-falsifier is a `delta` that reports the movement while the suite stayed green: then the record caught what the suite missed, and the answer is yes for that class of change and only that class.
A green suite that goes red on the same change is the third outcome and the informative one: the delta record is redundant for that class, and section 1 should say so rather than claim coverage.

## 5. Status

VERIFIED (read): every figure in section 2.
NOT MEASURED: the question itself — 000, one paired run owed.
No claim in this file rests on a rendered surface, and none was observed on one.
