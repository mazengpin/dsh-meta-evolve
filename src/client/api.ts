/**
 * The meta-evolve panel's transport — written against the HOST HALF'S REAL ROUTES.
 *
 * The contract in this file was read from `src/host/routes.ts` and
 * `src/host/sources.ts` in this same package, not guessed: the state payload's
 * five nullable fields (with `unreadable` naming why each is null), the rounds
 * payload's `count`/`total`/`lines`/`rounds` census, and the evolve response's
 * `round` plus `before`/`change`/`verification` are the host's own names. A
 * client that normalized a shape the host does not serve would render
 * `NOT MEASURED` everywhere and look like a broken panel.
 *
 * THE FOUR THINGS THIS FILE MUST NOT COLLAPSE:
 *
 *  1. **A 404 IS NOT AN EMPTY STORE.** `/meta-evolve/api/rounds` answering 404
 *     means the route is absent; it must render as unread (`NOT MEASURED`), never
 *     as `count: 0` (`NOTHING RECORDED`). The host is explicit that the two are
 *     different statements, and the normalization keeps them apart.
 *  2. **503 IS NOT A FAILED READ OF THE STATE.** The rounds route answers 503
 *     when the rounds file has no resolved path — the route IS there and is
 *     telling us it has nowhere to read. That is `refused`, carrying the reason,
 *     not `unreachable`.
 *  3. **`null` IS PRESERVED THROUGH EVERY NORMALIZER.** Numeric fields are read
 *     with `num()` (a non-number is `null`, never `0`), booleans with `bool()`,
 *     and an absent field is `null` WITH the host's reason. Nothing here uses
 *     `|| 0`, `?? 0` or a truthy test in place of presence.
 *  4. **THE CONTROL'S RESPONSE IS NORMALIZED INTO THE VIEW.** `evolve()` returns
 *     an `EvolveView` carrying the created round, the file's before/after line
 *     counts and the host's own re-read verification — the things the panel must
 *     SHOW, because a control that only reads a value back is not a control.
 *
 * TWO CONVENTIONS COPIED DELIBERATELY from the sibling `dsh-lvl1-gate`: the URL is
 * resolved against the PAGE BASE with query and hash dropped (so the panel works
 * under a reverse-proxy prefix and can never carry a launch token into a plugin
 * route), and every read is `cache: 'no-store'` — a cached state is a lie about
 * the present.
 *
 * @module dsh-meta-evolve/client/api
 */

import {
  absentField,
  IDLE_EVOLVE,
  presentField,
  type ChangedRowView,
  type DecisionLogRead,
  type DeltaView,
  type EvolveView,
  type FailureState,
  type FieldView,
  type IdentityView,
  type IntentFieldRead,
  type IntentMapRead,
  type Lvl1GateRead,
  type MovedCountView,
  type PanelView,
  type PluginsRead,
  type RoundView,
  type RoundsView,
  type SetView,
  type StateView,
  type UnreadableEntry,
  type ValueBucketView,
} from './view.ts'

/** Placeholder origin for the non-DOM case (specs, SSR): resolution needs an absolute base. */
const PLACEHOLDER_ORIGIN = 'http://dsh.invalid/'

/**
 * The page base, read STRUCTURALLY.
 *
 * `tsconfig.json` declares `lib: ["ES2023"]` and no DOM types, so the base is
 * reached through `globalThis` with its shape declared at the point of use. A
 * non-DOM caller (the render harness) falls back to the placeholder origin rather
 * than throwing.
 * @returns the absolute base URL to resolve routes against.
 */
function pageBase(): string {
  const scope = globalThis as { location?: { href?: unknown } }
  const href = scope.location?.href
  return typeof href === 'string' ? href : PLACEHOLDER_ORIGIN
}

/** The three routes this panel reads, plus the one control it drives. */
export const ROUTES = {
  state: '/meta-evolve/api/state',
  rounds: '/meta-evolve/api/rounds',
  evolve: '/meta-evolve/api/evolve',
} as const

/** Why one call failed, as far as the panel needs to distinguish it. */
export type Failure = 'not-mounted' | 'refused' | 'rejected' | 'unreachable' | 'malformed'

/** A typed failure from this plugin's route. */
export class MetaEvolveError extends Error {
  constructor(readonly failure: Failure, message: string) {
    super(message)
    this.name = 'MetaEvolveError'
  }
}

/**
 * Resolve one route against the page base, without a query and without a hash.
 * @param path - the route path, e.g. `/meta-evolve/api/state`.
 * @returns the absolute URL to fetch.
 */
export function routeUrl(path: string): string {
  const url = new URL(path, pageBase())
  url.search = ''
  url.hash = ''
  return url.toString()
}

/** Fetch one JSON payload, throwing a typed failure. */
async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(routeUrl(path), {
      cache: 'no-store',
      ...init,
      headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (error) {
    throw new MetaEvolveError('unreachable', error instanceof Error ? error.message : String(error))
  }
  // 404 FIRST, and on its own: this is the one status whose meaning the panel must
  // never round up into agreement.
  if (response.status === 404) throw new MetaEvolveError('not-mounted', `${path} is not registered on this host`)
  if (response.status === 403) throw new MetaEvolveError('refused', `${path} refused this request`)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new MetaEvolveError('rejected', `HTTP ${response.status}${detail === '' ? '' : `: ${detail.slice(0, 300)}`}`)
  }
  try {
    return await response.json()
  } catch (error) {
    throw new MetaEvolveError('malformed', error instanceof Error ? error.message : String(error))
  }
}

/** Map a failure onto the read state the view model speaks. */
function readFailure(error: unknown): { state: FailureState; note: string } {
  if (error instanceof MetaEvolveError) {
    if (error.failure === 'not-mounted') return { state: 'not-mounted', note: error.message }
    if (error.failure === 'refused' || error.failure === 'rejected') return { state: 'refused', note: error.message }
    if (error.failure === 'unreachable') return { state: 'unreachable', note: error.message }
    return { state: 'malformed', note: error.message }
  }
  return { state: 'malformed', note: error instanceof Error ? error.message : String(error) }
}

/* ------------------------------------------------------------------------- */
/* Shape guards — narrow `unknown` without coercing it                       */
/* ------------------------------------------------------------------------- */

/** A plain object, or null. Arrays and null are NOT records. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** A string, or null. An empty string is returned as the empty string (it is a value). */
function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** A finite number, or null. A numeric string is NOT a number here. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A boolean, or null. */
function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** A string array, or null. */
function strList(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : null
}

/** A `{read, of}` census pair, or null. */
function countsPair(value: unknown): { read: number | null; of: number | null } | null {
  const record = asRecord(value)
  if (record === null) return null
  return { read: num(record['read']), of: num(record['of']) }
}

/** One field read from a record into a `FieldView`, or absent with a reason. */
function fieldOr<T>(
  raw: unknown,
  reason: string | null,
  name: string,
  normalize: (record: Record<string, unknown>) => T,
): FieldView<T> {
  const record = asRecord(raw)
  if (record === null) {
    return absentField<T>(reason ?? `${name}: the field is absent from the state payload and unreadable carries no reason`)
  }
  return presentField(normalize(record))
}

/** `unreadable` map to a list, preserving the host's own reasons. */
function unreadableList(value: unknown): UnreadableEntry[] | null {
  const record = asRecord(value)
  if (record === null) return null
  return Object.entries(record).map(([field, reason]) => ({ field, reason: String(reason) }))
}

/* ------------------------------------------------------------------------- */
/* Field normalizers                                                         */
/* ------------------------------------------------------------------------- */

/** Normalize `decisionLog`. */
function toDecisionLog(record: Record<string, unknown>): DecisionLogRead {
  return {
    total: num(record['total']),
    active: num(record['active']),
    superseded: num(record['superseded']),
    of: num(record['of']),
    sumsToTotal: bool(record['sumsToTotal']),
    censusAt: str(record['censusAt']),
    events: num(record['events']),
    malformedLines: num(record['malformedLines']),
    readAt: str(record['readAt']),
  }
}

/** Normalize `intentField`, turning the by-value object into ordered pairs. */
function toIntentField(record: Record<string, unknown>): IntentFieldRead {
  const byValueRaw = asRecord(record['byValue'])
  let byValue: ValueBucketView[] | null = null
  if (byValueRaw !== null) {
    byValue = Object.entries(byValueRaw).map(([value, count]) => ({ value, count: num(count) }))
  }
  return {
    rows: num(record['rows']),
    of: num(record['of']),
    byValue,
    byValueOf: num(record['byValueOf']),
    rowsWithoutValue: num(record['rowsWithoutValue']),
    duplicateRowIds: num(record['duplicateRowIds']),
    mode: str(record['mode']),
    generatedAt: str(record['generatedAt']),
    documents: num(record['documents']),
    declaredRows: num(record['declaredRows']),
    rowsMatchDeclared: bool(record['rowsMatchDeclared']),
    file: str(record['file']),
    bytes: num(record['bytes']),
    readAt: str(record['readAt']),
  }
}

/** Normalize `lvl1Gate`. */
function toLvl1Gate(record: Record<string, unknown>): Lvl1GateRead {
  const outcomesRaw = asRecord(record['outcomes'])
  const lastRaw = asRecord(record['last'])
  return {
    hooked: bool(record['hooked']),
    hookedAgrees: bool(record['hookedAgrees']),
    runs: num(record['runs']),
    sessions: num(record['sessions']),
    outcomes: outcomesRaw === null
      ? null
      : {
          decided: num(outcomesRaw['decided']),
          declined: num(outcomesRaw['declined']),
          neverRan: num(outcomesRaw['neverRan']),
        },
    outcomesOf: num(record['outcomesOf']),
    last: lastRaw === null
      ? null
      : {
          outcome: str(lastRaw['outcome']),
          reason: str(lastRaw['reason']),
          channel: str(lastRaw['channel']),
          at: str(lastRaw['at']),
        },
    revisions: strList(record['revisions']),
    readAt: str(record['readAt']),
  }
}

/** Normalize `intentMap`. */
function toIntentMap(record: Record<string, unknown>): IntentMapRead {
  return {
    zones: num(record['zones']),
    of: num(record['of']),
    model: str(record['model']),
    dim: num(record['dim']),
    freshness: str(record['freshness']),
    corpusPlugins: num(record['corpusPlugins']),
    corpusOf: num(record['corpusOf']),
    catalogCount: num(record['catalogCount']),
    readAt: str(record['readAt']),
  }
}

/** Normalize `plugins`. */
function toPlugins(record: Record<string, unknown>): PluginsRead {
  return {
    count: num(record['count']),
    of: num(record['of']),
    names: strList(record['names']),
    root: str(record['root']),
    readAt: str(record['readAt']),
  }
}

/* ------------------------------------------------------------------------- */
/* State                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Build a state view where EVERY field is absent, carrying one reason.
 * @param state - the route-level read state.
 * @param note - why the route could not be read.
 * @returns the state view.
 */
export function stateFailure(state: FailureState, note: string): StateView {
  return {
    state,
    note,
    at: null,
    host: null,
    readMs: null,
    countsRead: null,
    unreadable: null,
    notDone: null,
    decisionLog: absentField<DecisionLogRead>(note),
    intentField: absentField<IntentFieldRead>(note),
    lvl1Gate: absentField<Lvl1GateRead>(note),
    intentMap: absentField<IntentMapRead>(note),
    plugins: absentField<PluginsRead>(note),
  }
}

/**
 * Normalize `GET /meta-evolve/api/state`.
 *
 * The route always answers a 200 with `ok: true`; a field whose source failed is
 * `null` and `unreadable[field]` names the reason. Each field is normalized
 * independently, so one unreadable source cannot blank the other four.
 * @param raw - the route payload.
 * @returns the state view.
 */
export function normalizeState(raw: unknown): StateView {
  const body = asRecord(raw)
  if (body === null || body['ok'] !== true) {
    const reason = body === null
      ? 'the state payload was not a JSON object'
      : str(body['error']) ?? 'the state route answered ok=false'
    return stateFailure('malformed', reason)
  }
  const unreadableMap = asRecord(body['unreadable'])
  const reasonFor = (name: string): string | null => {
    if (unreadableMap === null) return null
    return str(unreadableMap[name])
  }
  const notDoneRaw = body['notDone']
  return {
    state: 'loaded',
    note: str(body['note']),
    at: str(body['at']),
    host: str(body['host']),
    readMs: num(body['readMs']),
    countsRead: countsPair(body['countsRead']),
    unreadable: unreadableList(body['unreadable']),
    notDone: notDoneRaw === undefined ? null : strList(notDoneRaw),
    decisionLog: fieldOr(body['decisionLog'], reasonFor('decisionLog'), 'decisionLog', toDecisionLog),
    intentField: fieldOr(body['intentField'], reasonFor('intentField'), 'intentField', toIntentField),
    lvl1Gate: fieldOr(body['lvl1Gate'], reasonFor('lvl1Gate'), 'lvl1Gate', toLvl1Gate),
    intentMap: fieldOr(body['intentMap'], reasonFor('intentMap'), 'intentMap', toIntentMap),
    plugins: fieldOr(body['plugins'], reasonFor('plugins'), 'plugins', toPlugins),
  }
}

/* ------------------------------------------------------------------------- */
/* Rounds and rounds' delta                                                  */
/* ------------------------------------------------------------------------- */

/** Normalize one `SetView`, keeping `null` (unreadable) distinct from `[]` (empty). */
function toSetView(raw: unknown): SetView | null {
  const record = asRecord(raw)
  if (record === null) return null
  const intentRowsRaw = record['intentRows']
  let intentRows: string[] | null = null
  if (Array.isArray(intentRowsRaw)) {
    intentRows = intentRowsRaw.map((entry) => {
      const row = asRecord(entry)
      if (row === null) return String(entry)
      return `${str(row['id']) ?? 'unknown'} = ${str(row['value']) ?? 'no value'}`
    })
  }
  return { decisions: strList(record['decisions']), plugins: strList(record['plugins']), intentRows }
}

/** Normalize one round's delta. */
function toDelta(record: Record<string, unknown>): DeltaView {
  const movedRaw = record['moved']
  let moved: MovedCountView[] | null = null
  if (Array.isArray(movedRaw)) {
    moved = movedRaw.map((entry) => {
      const item = asRecord(entry)
      return {
        key: str(item?.['key']) ?? 'unknown',
        from: num(item?.['from']),
        to: num(item?.['to']),
        delta: num(item?.['delta']),
      }
    })
  }
  const movedOfRaw = asRecord(record['movedOf'])
  const changedRaw = asRecord(record['changed'])?.['intentRows']
  let changed: ChangedRowView[] | null = null
  if (Array.isArray(changedRaw)) {
    changed = changedRaw.map((entry) => {
      const item = asRecord(entry)
      return {
        id: str(item?.['id']) ?? 'unknown',
        from: str(item?.['from']) ?? 'NOT MEASURED',
        to: str(item?.['to']) ?? 'NOT MEASURED',
      }
    })
  }
  const unavailableRaw = record['unavailable']
  let unavailable: { key: string; reason: string }[] | null = null
  if (asRecord(unavailableRaw) !== null) {
    unavailable = Object.entries(asRecord(unavailableRaw) ?? {}).map(([key, reason]) => ({ key, reason: String(reason) }))
  }
  // THE IDENTITY CHANNEL. `null` when the round predates it, which is NOT the same as
  // an empty list: a pre-channel round never carried the values, and rendering it as
  // "nothing changed" is the defect this row exists to prevent.
  const valuesRaw = asRecord(record['values'])
  let values: IdentityView[] | null = null
  if (valuesRaw !== null) {
    values = Object.entries(valuesRaw)
      .map(([key, entry]) => {
        const item = asRecord(entry)
        const changedRaw = item?.['changed']
        return {
          key,
          from: str(item?.['from']),
          to: str(item?.['to']),
          // Three states: a boolean is a measurement, anything else is NOT MEASURED.
          changed: typeof changedRaw === 'boolean' ? changedRaw : null,
          reason: str(item?.['reason']),
        }
      })
      .sort((left, right) => left.key.localeCompare(right.key))
  }
  const valuesOfRaw = asRecord(record['valuesOf'])
  return {
    against: num(record['against']),
    againstAt: str(record['againstAt']),
    moved,
    movedOf: movedOfRaw === null
      ? null
      : { moved: num(movedOfRaw['moved']), checked: num(movedOfRaw['checked']), uncompared: num(movedOfRaw['uncompared']) },
    values,
    valuesOf: valuesOfRaw === null
      ? null
      : { changed: num(valuesOfRaw['changed']), checked: num(valuesOfRaw['checked']), uncomparable: num(valuesOfRaw['uncomparable']) },
    appeared: toSetView(record['appeared']),
    disappeared: toSetView(record['disappeared']),
    changed,
    unavailable,
  }
}

/** Normalize one recorded round. */
export function normalizeRound(raw: unknown): RoundView {
  const record = asRecord(raw)
  if (record === null) return { n: null, at: null, model: null, countsRead: null, delta: null, deltaReason: null, unreadable: null }
  const unreadableRaw = asRecord(record['unreadable'])
  return {
    n: num(record['n']),
    at: str(record['at']),
    model: str(record['model']),
    countsRead: countsPair(record['countsRead']),
    delta: asRecord(record['delta']) === null ? null : toDelta(asRecord(record['delta']) ?? {}),
    deltaReason: str(record['deltaReason']),
    unreadable: unreadableRaw === null
      ? null
      : Object.entries(unreadableRaw).map(([field, reason]) => ({ field, reason: String(reason) })),
  }
}

/**
 * Build a rounds view whose read failed.
 * @param state - the route-level read state.
 * @param note - why it failed.
 * @returns the rounds view.
 */
export function roundsFailure(state: FailureState, note: string): RoundsView {
  return {
    state,
    note,
    count: null,
    total: null,
    lines: null,
    bytes: null,
    exists: null,
    trailingNewline: null,
    malformedLines: null,
    rounds: null,
  }
}

/**
 * Normalize `GET /meta-evolve/api/rounds`.
 *
 * `count: 0, total: 0, rounds: []` is a READ store that is empty — NOTHING
 * RECORDED — and it is deliberately distinct from a failed read, which is
 * `rounds: null` and NOT MEASURED. The renderer chooses between those two tokens
 * and the harness drives both.
 * @param raw - the route payload.
 * @returns the rounds view.
 */
export function normalizeRounds(raw: unknown): RoundsView {
  const body = asRecord(raw)
  if (body === null || body['ok'] !== true) {
    const reason = body === null
      ? 'the rounds payload was not a JSON object'
      : str(body['error']) ?? str(body['reason']) ?? 'the rounds route answered ok=false'
    return roundsFailure('malformed', reason)
  }
  const roundsRaw = body['rounds']
  return {
    state: 'loaded',
    note: null,
    count: num(body['count']),
    total: num(body['total']),
    lines: num(body['lines']),
    bytes: num(body['bytes']),
    exists: bool(body['exists']),
    trailingNewline: bool(body['trailingNewline']),
    malformedLines: num(body['malformedLines']),
    rounds: Array.isArray(roundsRaw) ? roundsRaw.map(normalizeRound) : null,
  }
}

/* ------------------------------------------------------------------------- */
/* The evolve control's response                                             */
/* ------------------------------------------------------------------------- */

/** An evolve view for a failed POST. */
export function evolveFailure(note: string): EvolveView {
  return { state: 'failed', note, round: null, before: null, change: null, verification: null }
}

/**
 * Normalize `POST /meta-evolve/api/evolve`.
 *
 * The response is the CONTROL's proof: `round` is the record it created,
 * `before.lines`/`stored` produce `change.linesDelta`, and `verification` says
 * whether the file was re-read and matched. All three are carried into the view
 * so the panel can render the round the click produced.
 * @param raw - the route payload.
 * @returns the evolve view.
 */
export function normalizeEvolve(raw: unknown): EvolveView {
  const body = asRecord(raw)
  if (body === null || body['ok'] !== true) {
    return evolveFailure(body === null ? 'the evolve payload was not a JSON object' : str(body['error']) ?? 'the evolve route answered ok=false')
  }
  const before = asRecord(body['before'])
  const change = asRecord(body['change'])
  const verification = asRecord(body['verification'])
  const roundRaw = asRecord(body['round'])
  return {
    state: 'done',
    note: null,
    round: roundRaw === null ? null : normalizeRound(roundRaw),
    before: before === null
      ? null
      : { exists: bool(before['exists']), lines: num(before['lines']), rounds: num(before['rounds']) },
    change: change === null
      ? null
      : { linesDelta: num(change['linesDelta']), roundsDelta: num(change['roundsDelta']) },
    verification: verification === null
      ? null
      : {
          verified: bool(verification['verified']),
          reason: str(verification['reason']),
          lines: num(verification['lines']),
          rounds: num(verification['rounds']),
        },
  }
}

/* ------------------------------------------------------------------------- */
/* The read calls                                                            */
/* ------------------------------------------------------------------------- */

/** Read `/meta-evolve/api/state`. Never rejects: a failed read is a state view. */
export async function fetchState(): Promise<StateView> {
  try {
    return normalizeState(await requestJson(ROUTES.state))
  } catch (error) {
    const { state, note } = readFailure(error)
    return stateFailure(state, note)
  }
}

/** Read `/meta-evolve/api/rounds`. Never rejects: a failed read is a rounds view. */
export async function fetchRounds(): Promise<RoundsView> {
  try {
    return normalizeRounds(await requestJson(ROUTES.rounds))
  } catch (error) {
    const { state, note } = readFailure(error)
    return roundsFailure(state, note)
  }
}

/**
 * Read the whole surface in one pass.
 *
 * The two reads run together and neither can reject: one absent route must not
 * blank the other. The evolve slice starts idle — it belongs to the control, not
 * to the read.
 * @returns one complete view.
 */
export async function fetchPanel(): Promise<PanelView> {
  const [state, rounds] = await Promise.all([fetchState(), fetchRounds()])
  return { fetchedAt: new Date().toISOString(), state, rounds, evolve: IDLE_EVOLVE }
}

/**
 * Drive the control — the round-producing POST, not a read.
 *
 * The route recomputes the state and APPENDS a round; the returned view carries
 * the created round and the file change so the panel can SHOW them. This function
 * resolves to a `failed` view rather than throwing, so a click that the host
 * refused renders as a refusal instead of a dead panel.
 * @returns the control's normalized outcome.
 */
export async function evolve(): Promise<EvolveView> {
  try {
    const raw = await requestJson(ROUTES.evolve, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    return normalizeEvolve(raw)
  } catch (error) {
    return evolveFailure(error instanceof Error ? error.message : String(error))
  }
}
