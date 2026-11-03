/**
 * The evolution control's record: rounds as DELTAS, appended to
 * `research/meta-evolve-rounds.jsonl`.
 *
 * A CONTROL THAT ONLY READS A VALUE BACK IS NOT A CONTROL. The `evolve` route
 * recomputes the same live state the `state` route serves, compares it with the
 * last recorded round, and APPENDS a new line. If the round count does not grow
 * and the response does not show the change, the route is a read, not a control —
 * the verify harness asserts the file's line count before and after.
 *
 * AND THE ROUND NOW CARRIES THE ELIXIR APP. A round's `beam` object is the
 * control app as that round saw it (`host/beam-round.ts`), and `delta.beam` is
 * the comparison against the previous round's. On the first round there is
 * nothing to compare, so `delta.beam` is `null` and BOTH the delta and the record
 * say `'first round'` — a delta of zeros would claim a BEAM that did not move.
 * Its absences live in the delta's own `unavailable` map, not the round's: a
 * control app that was down must not change what the five HTTP/disk counts say
 * about themselves.
 *
 * WHAT A DELTA IS, AND WHAT "FIRST ROUND" MEANS
 *
 * `delta` names every count that moved, by how much, plus the ids that appeared,
 * disappeared, and — for intent rows — changed value between the two rounds.
 * When there is no previous round the delta is `null` with `deltaReason:
 * "first round"`, NOT a set of zeros: a zero delta would claim the state did not
 * change when nothing was compared.
 *
 * ABSENT IS NOT ZERO, AGAIN, ACROSS THE FILE BOUNDARY. If a source was
 * unreadable in either round, the comparison for that count is
 * `{from, to, delta: null, reason}` and the id sets are `null` with a reason in
 * `unavailable`. A set that could not be read must never compare as "everything
 * disappeared", which is what a `null` folded to `[]` would produce.
 *
 * ONE PROCESS, ONE WRITER. Appends are serialised inside this process so two
 * concurrent `evolve` requests cannot interleave a line. Cross-process appends
 * of a single small line are atomic at the OS level, but the ROUND NUMBER is
 * derived from a read-then-write and could repeat if two processes evolved at
 * once; the number is a record label, not a lock, and the file is a JSONL log
 * whose lines each carry their own `at`.
 *
 * @module dsh-meta-evolve/host/rounds
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BeamDelta, BeamField } from './beam-round.ts'
import { computeBeamDelta } from './beam-round.ts'
import type { FieldName, IntentRowRef, Snapshot } from './sources.ts'
import { FIELD_NAMES } from './sources.ts'

/** One count compared between two rounds. `delta: null` means the comparison was impossible. */
export interface DeltaCount {
  readonly from: number | null
  readonly to: number | null
  readonly delta: number | null
  readonly reason: string | null
}

/** One id set compared between two rounds. `null` sets carry a reason in the parent. */
export interface DeltaSet<T> {
  readonly appeared: T[] | null
  readonly disappeared: T[] | null
  readonly previous: number | null
  readonly now: number | null
  readonly reason: string | null
}

/** One identity value compared between two rounds. Identity is a string, NOT a count. */
export interface DeltaValue {
  readonly from: string | null
  readonly to: string | null
  readonly changed: boolean | null
  readonly reason: string | null
}

/** The delta one round records against the previous round. */
export interface RoundsDelta {
  readonly against: number
  readonly againstAt: string
  readonly counts: Record<string, DeltaCount>
  readonly moved: Array<{ readonly key: string; readonly from: number; readonly to: number; readonly delta: number }>
  readonly movedOf: { readonly moved: number; readonly checked: number; readonly uncompared: number }
  /**
   * IDENTITY VALUES, COMPARED AS IDENTITY AND NOT AS COUNTS.
   *
   * A count map cannot carry these: `intentMap.model` is a string, and the only
   * identity slot a round used to have was `RoundRecord.model`, which was WRITTEN
   * and NEVER COMPARED. A model swap that preserved the vector dimension therefore
   * produced `moved: []` — the delta reported "nothing changed" while the identity
   * had changed. Change detection without a conformance channel is what this class
   * adds: `changed` is `null` when the identity could not be read in either round,
   * so an unreadable identity is never reported as "unchanged".
   */
  readonly values: Record<string, DeltaValue>
  readonly changedValues: Array<{ readonly key: string; readonly from: string; readonly to: string }>
  readonly valuesOf: { readonly changed: number; readonly checked: number; readonly uncomparable: number }
  readonly appeared: { readonly decisions: string[] | null; readonly plugins: string[] | null; readonly intentRows: readonly IntentRowRef[] | null }
  readonly disappeared: { readonly decisions: string[] | null; readonly plugins: string[] | null; readonly intentRows: readonly IntentRowRef[] | null }
  readonly changed: { readonly intentRows: Array<{ readonly id: string; readonly from: string; readonly to: string }> | null }
  readonly denominators: {
    readonly decisions: { readonly previous: number | null; readonly now: number | null }
    readonly plugins: { readonly previous: number | null; readonly now: number | null }
    readonly intentRows: { readonly previous: number | null; readonly now: number | null }
  }
  /**
   * THE ELIXIR APP, COMPARED.
   *
   * `null` means there was nothing to compare, and `beamReason` says which of the
   * two reasons it was: `'first round'`, or a previous record that predates the
   * field. It is never a set of zero movements — a zero would claim the BEAM did
   * not change when nothing was compared.
   */
  readonly beam: BeamDelta | null
  readonly beamReason: string | null
  readonly unavailable: Record<string, string>
}

/** One recorded round, exactly as one line of the JSONL file. */
export interface RoundRecord {
  readonly n: number
  readonly at: string
  readonly host: string
  readonly workspace: string | null
  readonly model: string | null
  readonly counts: Record<string, number | null>
  readonly countsRead: { readonly read: number; readonly of: number }
  readonly fieldReadable: Record<FieldName, boolean>
  readonly ids: {
    readonly decisions: string[] | null
    readonly plugins: string[] | null
    readonly intentRows: readonly IntentRowRef[] | null
  }
  readonly delta: RoundsDelta | null
  readonly deltaReason: string | null
  /**
   * The control app as this round saw it. `null` only for a record written
   * before the field existed; a round written by this build always carries the
   * object, whose unread fields each hold `{unmeasured: reason}`.
   */
  readonly beam: BeamField | null
  /** Why `beam` is `null`. Absent reading, named — never an empty object. */
  readonly beamReason: string | null
  /** Why `delta.beam` is `null`. This is the record's own copy of the delta's reason. */
  readonly beamDeltaReason: string | null
  readonly unreadable: Partial<Record<FieldName, string>>
}

/** The parsed rounds file. `malformed` is reported, never silently skipped into a smaller count. */
export interface RoundsFile {
  readonly path: string
  readonly exists: boolean
  readonly bytes: number
  readonly lines: number
  readonly trailingNewline: boolean
  readonly rounds: RoundRecord[]
  readonly malformed: Array<{ readonly line: number; readonly reason: string }>
}

/** Serialise work that appends to the rounds file, so two requests cannot interleave a line. */
let appendChain: Promise<void> = Promise.resolve()

/**
 * Run `work` after every previously queued append has settled.
 *
 * @param work - the read-compare-append sequence.
 * @returns the work's result.
 */
export function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = appendChain.then(work, work)
  appendChain = result.then(() => undefined, () => undefined)
  return result
}

/** Count physical lines without the trailing-newline off-by-one (`split` adds a phantom last element). */
export function countLines(text: string): number {
  if (text === '') return 0
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length
}

/** The field a flat count key belongs to (`lvl1Gate.outcomes.decided` -> `lvl1Gate`). */
function fieldOf(key: string): FieldName | null {
  const head = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
  return (FIELD_NAMES as readonly string[]).includes(head) ? (head as FieldName) : null
}

/** Why one side of a count comparison has no value. Absent and unreadable are NOT the same absence. */
type AbsenceKind = 'unreadable' | 'not-emitted'

/** One side's contribution to a count comparison: a value, or the KIND of absence. */
interface SideReading {
  readonly value: number | null
  readonly absent: AbsenceKind | null
}

/**
 * The value one side contributes for a key, and — when there is none — WHICH KIND
 * of absence it is.
 *
 * ABSENT IS NOT ZERO, AND THIS IS WHERE THAT RULE WAS BEING BROKEN. This function
 * used to return `0` for any key the record did not carry whenever the key's FIELD
 * was readable. The intent was legitimate — an `intentField.byValue.<value>` bucket
 * that no longer occurs really has zero rows — but the rule could not tell that case
 * from the case that matters more: **a count the earlier round never recorded at all,
 * because the key was added to `flatCounts` after that round was written.** Under the
 * old rule such a key compared as `0 -> n` and was recorded as MOVEMENT, so adding a
 * key manufactured a change that never happened.
 *
 * So the two absences are now separated and neither is folded to zero:
 *   `unreadable`  — the source did not answer; the field's own readability says so.
 *   `not-emitted` — the field WAS readable and simply carried no such key.
 * A caller receives `value: null` plus the kind and must report it, never total it.
 *
 * @param counts - that side's flat count map.
 * @param readable - that side's per-field readability.
 * @param key - the count key being compared.
 * @returns the value, or null with the kind of absence.
 */
function sideValue(
  counts: Record<string, number | null>,
  readable: Record<FieldName, boolean>,
  key: string,
): SideReading {
  if (Object.prototype.hasOwnProperty.call(counts, key)) {
    const value = counts[key]
    if (value === null || value === undefined) return { value: null, absent: 'unreadable' }
    return { value, absent: null }
  }
  const field = fieldOf(key)
  // A key whose prefix is no longer a known field cannot have been measured by this
  // round at all; that is an emission difference, not a read failure.
  if (field === null) return { value: null, absent: 'not-emitted' }
  return { value: null, absent: readable[field] ? 'not-emitted' : 'unreadable' }
}

/** Render one side's absence as the sentence a reader needs to tell the two apart. */
function absenceReason(side: SideReading, roundLabel: string): string {
  if (side.absent === 'not-emitted') {
    return `the count was not recorded in ${roundLabel} (its field was readable, so the key was absent rather than the source unreadable)`
  }
  return `the source was unreadable in ${roundLabel}`
}

/** Compare two id sets; `null` on either side is an uncompared set, never an empty one. */
function compareSets<T>(
  previous: readonly T[] | null,
  now: readonly T[] | null,
  keyOf: (entry: T) => string,
): DeltaSet<T> {
  const previousCount = previous === null ? null : previous.length
  const nowCount = now === null ? null : now.length
  if (previous === null || now === null) {
    const reason = previous === null && now === null
      ? 'unreadable in both rounds'
      : previous === null
        ? 'unreadable in the previous round'
        : 'unreadable in this round'
    return { appeared: null, disappeared: null, previous: previousCount, now: nowCount, reason }
  }
  const previousKeys = new Map(previous.map((entry) => [keyOf(entry), entry]))
  const nowKeys = new Map(now.map((entry) => [keyOf(entry), entry]))
  const appeared = now.filter((entry) => !previousKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
  const disappeared = previous.filter((entry) => !nowKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
  return { appeared, disappeared, previous: previousCount, now: nowCount, reason: null }
}

/**
 * Compute the delta of `current` against `previous`.
 *
 * @param previous - the last recorded round.
 * @param current - the fresh snapshot.
 * @returns the delta, with every uncomparable count or set carrying its reason.
 */
export function computeDelta(
  previous: RoundRecord,
  current: Snapshot,
  beam: BeamField | null = null,
): RoundsDelta {
  const keys = [...new Set([...Object.keys(previous.counts), ...Object.keys(current.counts)])].sort()
  const counts: Record<string, DeltaCount> = {}
  const moved: Array<{ key: string; from: number; to: number; delta: number }> = []
  const unavailable: Record<string, string> = {}
  let uncompared = 0
  for (const key of keys) {
    const fromReading = sideValue(previous.counts, previous.fieldReadable, key)
    const toReading = sideValue(current.counts, current.fieldReadable, key)
    const from = fromReading.value
    const to = toReading.value
    if (from === null || to === null) {
      const field = fieldOf(key)
      const parts: string[] = []
      if (from === null) parts.push(absenceReason(fromReading, `round ${previous.n}`))
      if (to === null) parts.push(absenceReason(toReading, 'this round'))
      const reason = parts.join('; ')
      counts[key] = { from, to, delta: null, reason }
      unavailable[`counts.${key}`] = field === null ? reason : `${reason} (${field})`
      uncompared += 1
      continue
    }
    const delta = to - from
    counts[key] = { from, to, delta, reason: null }
    if (delta !== 0) moved.push({ key, from, to, delta })
  }

  const decisions = compareSets(previous.ids.decisions, current.ids.decisions, (id) => id)
  const plugins = compareSets(previous.ids.plugins, current.ids.plugins, (name) => name)
  const intentRows = compareSets(previous.ids.intentRows, current.ids.intentRows, (row) => row.id)
  if (decisions.reason !== null) unavailable['ids.decisions'] = decisions.reason
  if (plugins.reason !== null) unavailable['ids.plugins'] = plugins.reason
  if (intentRows.reason !== null) unavailable['ids.intentRows'] = intentRows.reason

  let changedRows: Array<{ id: string; from: string; to: string }> | null = null
  if (intentRows.reason === null && previous.ids.intentRows !== null && current.ids.intentRows !== null) {
    const before = new Map(previous.ids.intentRows.map((row) => [row.id, row.value]))
    const now = new Map(current.ids.intentRows.map((row) => [row.id, row.value]))
    changedRows = []
    for (const [id, value] of now) {
      const previousValue = before.get(id)
      if (previousValue !== undefined && previousValue !== value) {
        changedRows.push({ id, from: previousValue, to: value })
      }
    }
    changedRows.sort((a, b) => a.id.localeCompare(b.id))
  }

  // IDENTITY, COMPARED. One slot today (`model`); the loop is over a record so a
  // future identity (embedding vendor, revision) is added in ONE place, not three.
  const identityNow: Record<string, string | null> = {
    model: current.model,
  }
  const identityBefore: Record<string, string | null> = {
    model: previous.model ?? null,
  }
  const values: Record<string, DeltaValue> = {}
  const changedValues: Array<{ key: string; from: string; to: string }> = []
  let valuesChanged = 0
  let valuesUncomparable = 0
  for (const key of Object.keys(identityNow).sort()) {
    const before = identityBefore[key] ?? null
    const now = identityNow[key] ?? null
    if (before === null || now === null) {
      // An identity that could not be read is NOT an unchanged identity.
      const reason = before === null && now === null
        ? 'the identity was not measured in either round'
        : before === null
          ? `the identity was not measured in round ${previous.n}`
          : 'the identity was not measured in this round'
      values[key] = { from: before, to: now, changed: null, reason }
      unavailable[`values.${key}`] = reason
      valuesUncomparable += 1
      continue
    }
    const changed = before !== now
    values[key] = { from: before, to: now, changed, reason: null }
    if (changed) {
      changedValues.push({ key, from: before, to: now })
      valuesChanged += 1
    }
  }

  // THE ELIXIR APP. A previous record written before the beam field existed has
  // no baseline, so the comparison is `null` WITH a reason rather than a delta
  // against an empty object that would report every field as "appeared".
  const previousBeam = previous.beam ?? null
  const beamDelta = previousBeam === null || beam === null
    ? null
    : computeBeamDelta(previousBeam, beam, previous.n)
  const beamReason = previousBeam === null
    ? `round ${previous.n} carries no beam record, so the BEAM cannot be compared`
    : beam === null
      ? 'this round captured no beam record, so the BEAM cannot be compared'
      : null

  return {
    against: previous.n,
    againstAt: previous.at,
    counts,
    moved,
    movedOf: { moved: moved.length, checked: keys.length, uncompared },
    values,
    changedValues,
    beam: beamDelta,
    beamReason,
    valuesOf: { changed: valuesChanged, checked: Object.keys(identityNow).length, uncomparable: valuesUncomparable },
    appeared: { decisions: decisions.appeared, plugins: plugins.appeared, intentRows: intentRows.appeared },
    disappeared: { decisions: decisions.disappeared, plugins: plugins.disappeared, intentRows: intentRows.disappeared },
    changed: { intentRows: changedRows },
    denominators: {
      decisions: { previous: decisions.previous, now: decisions.now },
      plugins: { previous: plugins.previous, now: plugins.now },
      intentRows: { previous: intentRows.previous, now: intentRows.now },
    },
    unavailable,
  }
}

/** Build the round record for one evolve call. */
export function buildRound(input: {
  readonly previous: RoundRecord | null
  readonly snapshot: Snapshot
  readonly host: string
  readonly workspace: string | null
  readonly unreadable: Partial<Record<FieldName, string>>
  readonly beam: BeamField | null
  readonly now?: Date
}): RoundRecord {
  const at = (input.now ?? new Date()).toISOString()
  const values = Object.values(input.snapshot.counts)
  // ONE comparison, read twice: the delta and its beam reason cannot disagree
  // about what was compared if there is only one computation.
  const delta = input.previous === null
    ? null
    : computeDelta(input.previous, input.snapshot, input.beam)
  return {
    n: input.previous === null ? 1 : input.previous.n + 1,
    at,
    host: input.host,
    workspace: input.workspace,
    model: input.snapshot.model,
    counts: input.snapshot.counts,
    countsRead: { read: values.filter((value) => value !== null).length, of: values.length },
    fieldReadable: input.snapshot.fieldReadable,
    ids: input.snapshot.ids,
    beam: input.beam,
    beamReason: input.beam === null ? 'the control app was not captured for this round' : null,
    delta,
    deltaReason: input.previous === null ? 'first round' : null,
    // The record's own copy of `delta.beam`'s reason. On the FIRST round there is
    // no previous record to diff against, so the reason names that case exactly
    // rather than leaving a bare `null` behind.
    beamDeltaReason: delta === null ? 'first round' : delta.beamReason,
    unreadable: input.unreadable,
  }
}

/** Validate one parsed JSON line as a round record, conservatively. */
function asRound(value: unknown): { round: RoundRecord | null; reason: string | null } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { round: null, reason: 'line is not a JSON object' }
  }
  const record = value as Record<string, unknown>
  if (typeof record['n'] !== 'number' || !Number.isFinite(record['n'])) return { round: null, reason: 'n is not a number' }
  if (typeof record['at'] !== 'string') return { round: null, reason: 'at is not a string' }
  if (typeof record['counts'] !== 'object' || record['counts'] === null || Array.isArray(record['counts'])) {
    return { round: null, reason: 'counts is not an object' }
  }
  if (typeof record['fieldReadable'] !== 'object' || record['fieldReadable'] === null) {
    return { round: null, reason: 'fieldReadable is not an object' }
  }
  if (typeof record['ids'] !== 'object' || record['ids'] === null || Array.isArray(record['ids'])) {
    return { round: null, reason: 'ids is not an object' }
  }
  return { round: record as unknown as RoundRecord, reason: null }
}

/**
 * Read and parse the rounds file.
 *
 * A missing file is `exists: false` with `rounds: []` — an absent record, not a
 * failed read. A malformed line is REPORTED with its 1-based line number rather
 * than dropped silently, so `count` can always be read against `lines`.
 *
 * @param path - the rounds file path.
 * @returns the parsed rounds plus every malformed line.
 */
export function readRoundsFile(path: string): RoundsFile {
  if (!existsSync(path)) {
    return { path, exists: false, bytes: 0, lines: 0, trailingNewline: false, rounds: [], malformed: [] }
  }
  let text: string
  let bytes: number
  try {
    bytes = statSync(path).size
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      path,
      exists: true,
      bytes: 0,
      lines: 0,
      trailingNewline: false,
      rounds: [],
      malformed: [{ line: 0, reason: `the file exists but could not be read: ${message}` }],
    }
  }
  const lines = countLines(text)
  const rounds: RoundRecord[] = []
  const malformed: Array<{ line: number; reason: string }> = []
  const physical = text.split('\n')
  if (text.endsWith('\n')) physical.pop()
  physical.forEach((line, index) => {
    if (line.trim() === '') {
      malformed.push({ line: index + 1, reason: 'blank line; JSONL expects one JSON object per line' })
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      malformed.push({ line: index + 1, reason: `invalid JSON: ${message}` })
      return
    }
    const { round, reason } = asRound(parsed)
    if (round === null) {
      malformed.push({ line: index + 1, reason: reason ?? 'not a round record' })
      return
    }
    rounds.push(round)
  })
  return { path, exists: true, bytes, lines, trailingNewline: text.endsWith('\n'), rounds, malformed }
}

/** Append one round as one LF-terminated JSON line, repairing a missing trailing newline first. */
export function appendRound(path: string, round: RoundRecord): {
  readonly path: string
  readonly bytes: number
  readonly lines: number
  readonly trailingNewline: boolean
  readonly repairedTrailingNewline: boolean
  readonly appended: true
} {
  mkdirSync(dirname(path), { recursive: true })
  let prefix = ''
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (existing.length > 0 && !existing.endsWith('\n')) prefix = '\n'
  }
  const line = `${JSON.stringify(round)}\n`
  appendFileSync(path, prefix + line, 'utf8')
  const text = readFileSync(path, 'utf8')
  return {
    path,
    bytes: Buffer.byteLength(text),
    lines: countLines(text),
    trailingNewline: text.endsWith('\n'),
    repairedTrailingNewline: prefix !== '',
    appended: true,
  }
}
