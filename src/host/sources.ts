/**
 * The five readers that compose the meta layer's state, and the snapshot the
 * evolution control compares rounds with.
 *
 * TWO DISCIPLINES DECIDE WHETHER THIS FILE IS HONEST, AND BOTH ARE THE
 * PROGRAM'S OWN RECORDED TRAPS.
 *
 * 1. A SOURCE IS READ LIVE ON EVERY REQUEST, NEVER FROM A CACHE. The three HTTP
 *    fields (`decisionLog`, `lvl1Gate`, `intentMap`) are fetched from
 *    `http://127.0.0.1:3083` each time; the two disk fields (`intentField`,
 *    `plugins`) are re-read each time. Nothing here holds a previous value, so a
 *    source that stops answering can never be served as its last good state.
 *
 * 2. A FAILED SOURCE IS `null` WITH A `reason`, NEVER A ZERO. `active: 0` and
 *    `active: null` say opposite things — "the log says no decision is active"
 *    versus "the log did not answer" — and this program has published the first
 *    when it meant the second more than once. Every count carries its
 *    denominator (`of`, `byValueOf`, `outcomesOf`) so a zero can be read against
 *    the population it was taken over.
 *
 * The snapshot is a flattened view of the same reads — counts keyed by a stable
 * name, plus the id sets the round delta needs — so the evolution control and
 * the state route can never disagree about what was measured: they are built
 * from ONE set of reads, not two.
 *
 * @module dsh-meta-evolve/host/sources
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PathResolution, ResolvedHost } from './workspace.ts'

/* ------------------------------------------------------------------------- */
/* Live HTTP reads                                                           */
/* ------------------------------------------------------------------------- */

/** A live read that failed. `status: null` means the request never got an answer. */
export interface ReadFailure {
  readonly ok: false
  readonly reason: string
  readonly url: string
  readonly status: number | null
  readonly elapsedMs: number
  readonly bytes: number | null
}

/** A live read that answered with JSON. `bytes` is the served body size. */
export interface ReadSuccess {
  readonly ok: true
  readonly value: unknown
  readonly url: string
  readonly status: number
  readonly elapsedMs: number
  readonly bytes: number
}

/** The result of one live read. */
export type ReadResult = ReadSuccess | ReadFailure

/** Render an unknown thrown value, following `cause` so a refused socket keeps its code. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof Error) {
      const code = (cause as { code?: unknown }).code
      return `${error.message}: ${cause.message}${typeof code === 'string' ? ` (${code})` : ''}`
    }
    return error.message
  }
  return String(error)
}

/**
 * Read one JSON route on the live host.
 *
 * A timeout is enforced with an `AbortController`; the elapsed time and served
 * byte count are returned so the state can show HOW a reading was taken, not
 * only what it said.
 *
 * @param url - absolute URL to fetch.
 * @param timeoutMs - how long the request may take.
 * @returns the parsed body, or a failure carrying the reason.
 */
export async function readJson(url: string, timeoutMs: number): Promise<ReadResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    const text = await response.text()
    const elapsedMs = Date.now() - started
    const bytes = Buffer.byteLength(text)
    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        elapsedMs,
        bytes,
        reason: `HTTP ${response.status} ${response.statusText} from ${url} (${bytes} B served)`,
      }
    }
    try {
      return { ok: true, value: JSON.parse(text) as unknown, url, status: response.status, elapsedMs, bytes }
    } catch (error) {
      return {
        ok: false,
        url,
        status: response.status,
        elapsedMs,
        bytes,
        reason: `invalid JSON from ${url} (${bytes} B): ${describeError(error)}`,
      }
    }
  } catch (error) {
    const elapsedMs = Date.now() - started
    const timedOut = controller.signal.aborted
    return {
      ok: false,
      url,
      status: null,
      elapsedMs,
      bytes: null,
      reason: timedOut
        ? `timed out after ${timeoutMs}ms reading ${url}`
        : `fetch failed for ${url}: ${describeError(error)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------------- */
/* Shape guards — narrow `unknown` without coercing it                       */
/* ------------------------------------------------------------------------- */

/** A plain object, or null. Arrays and null are NOT records. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** A finite number, or null. A numeric string is NOT a number here. */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A string, or null. An empty string is returned as the empty string (it is a value). */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** An array, or null. */
function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

/* ------------------------------------------------------------------------- */
/* Field shapes                                                              */
/* ------------------------------------------------------------------------- */

/** One field read: the served shape, why it is absent, and its internal ids. */
export interface FieldRead<T, I> {
  readonly field: T | null
  readonly reason: string | null
  readonly ids: I
}

/** `decisionLog`, from `/decision-log/api/list`. Counts are read off the census, never the rows. */
export interface DecisionLogField {
  readonly total: number
  readonly active: number
  readonly superseded: number
  readonly of: number
  readonly sumsToTotal: boolean
  readonly censusAt: string | null
  readonly events: number | null
  readonly malformedLines: number | null
  readonly shown: number | null
  readonly source: string
  readonly readAt: string
}

/** One intent-field row, flattened. `value` is the row's value rendered as a string. */
export interface IntentRowRef {
  readonly id: string
  readonly value: string
}

/** `intentField`, read from `plan/intent-field/field.json` on disk. */
export interface IntentFieldField {
  readonly rows: number
  readonly of: number
  readonly byValue: Record<string, number>
  readonly byValueOf: number
  readonly rowsWithoutValue: number
  readonly duplicateRowIds: number
  readonly generatedAt: string | null
  readonly mode: string | null
  readonly documents: number
  readonly declaredRows: number | null
  readonly rowsMatchDeclared: boolean | null
  readonly file: string
  readonly bytes: number
  readonly readAt: string
}

/** `lvl1Gate`, from `/lvl1-gate/api/status` and `/lvl1-gate/api/sessions`. */
export interface Lvl1GateField {
  readonly hooked: boolean
  readonly hookedAgrees: boolean
  readonly runs: number
  readonly sessions: number
  readonly statusSessionCount: number | null
  /**
   * `statusSessionCount` against `sessions`. It used to be carried with NO comparison,
   * so 1 beside 21 sat in the payload unremarked.
   */
  readonly sessionsAgree: boolean | null
  /**
   * THE OUTCOME CENSUS WHOSE DENOMINATOR IS `sessions`.
   *
   * This field used to be read from the sessions route's `outcomeCensus`, which is
   * **in-process only for this boot**, while `outcomesOf` was the MERGED session
   * count. The two could never agree — on 2026-10-22 the payload published
   * `{decided:0, declined:0, neverRan:1}` with `outcomesOf: 21`, a denominator of 21
   * over a numerator set of 1 — and the matching census, `historyCensus`, was in the
   * SAME response with `decided 7 + declined 10 + neverRan 4 = 21 = count` exactly.
   * The defect was reading the wrong one of two fields. Note that a fix to the field
   * alone does not make the CURRENT session's decided outcome visible: the in-process
   * session's provenance is written on its first gate run and later decided runs move
   * `status.last` and `runs`, not the session row. Both mechanisms are reported.
   */
  readonly outcomes: { readonly decided: number; readonly declined: number; readonly neverRan: number }
  readonly outcomesOf: number
  readonly outcomesBasis: string | null
  /** `decided + declined + neverRan === outcomesOf`, the sibling of `sumsToTotal`. */
  readonly sumsToOutcomes: boolean
  /** The in-process census, kept so the two populations are never confused. */
  readonly inProcessOutcomes: { readonly decided: number; readonly declined: number; readonly neverRan: number } | null
  readonly inProcessOutcomesOf: number | null
  readonly inProcessBasis: string | null
  readonly last: {
    readonly outcome: string | null
    readonly reason: string | null
    readonly channel: string | null
    readonly at: string | null
  } | null
  readonly revisions: string[] | null
  readonly sources: readonly string[]
  readonly readAt: string
}

/** `intentMap`, from `/intent-map/api/map`. */
export interface IntentMapField {
  readonly zones: number
  readonly zoneRows: number | null
  readonly zonesMatch: boolean | null
  readonly of: number
  readonly model: string
  readonly dim: number
  readonly freshness: string | null
  readonly corpusPlugins: number | null
  readonly corpusOf: number | null
  readonly catalogCount: number | null
  readonly censusAt: string | null
  readonly source: string
  readonly readAt: string
}

/** `plugins`, counted as DIRECTORIES under `plugins-src/` (a listing is not a count). */
export interface PluginsField {
  readonly count: number
  readonly of: number
  readonly names: string[]
  readonly root: string
  readonly readAt: string
}

/** The five field names, used as keys everywhere a field can be unreadable. */
export const FIELD_NAMES = ['decisionLog', 'intentField', 'lvl1Gate', 'intentMap', 'plugins'] as const

/** One of the five field names. */
export type FieldName = (typeof FIELD_NAMES)[number]

/* ------------------------------------------------------------------------- */
/* Readers                                                                   */
/* ------------------------------------------------------------------------- */

/** Read `decisionLog` live from the host. */
export async function readDecisionLog(host: ResolvedHost): Promise<FieldRead<DecisionLogField, string[] | null>> {
  const route = '/decision-log/api/list'
  const read = await readJson(host.hostUrl + route, host.timeoutMs)
  const readAt = new Date().toISOString()
  if (!read.ok) return { field: null, reason: read.reason, ids: null }
  const root = asRecord(read.value)
  const census = asRecord(root?.['census'])
  const statuses = asRecord(root?.['statuses'])
  const total = asNumber(census?.['decisions'])
  const active = asNumber(statuses?.['active'])
  const superseded = asNumber(statuses?.['superseded'])
  if (total === null || active === null || superseded === null) {
    return {
      field: null,
      reason: `${route} answered ${read.status} but the payload does not carry census.decisions/statuses.active/statuses.superseded`,
      ids: null,
    }
  }
  const decisions = asArray(root?.['decisions'])
  if (decisions === null) {
    return { field: null, reason: `${route} answered ${read.status} but decisions[] is absent, so ids cannot be compared`, ids: null }
  }
  const ids: string[] = []
  for (const entry of decisions) {
    const id = asString(asRecord(entry)?.['id'])
    if (id === null || id === '') {
      return { field: null, reason: `${route} carries a decision row without a string id`, ids: null }
    }
    ids.push(id)
  }
  const complete = ids.length === total
  return {
    field: {
      total,
      active,
      superseded,
      of: total,
      sumsToTotal: active + superseded === total,
      censusAt: asString(census?.['censusAt']),
      events: asNumber(census?.['events']),
      malformedLines: asNumber(census?.['malformedLines']),
      shown: asNumber(census?.['shown']),
      source: route,
      readAt,
    },
    reason: null,
    ids: complete ? ids.sort() : null,
  }
}

/** Read `intentField` from `plan/intent-field/field.json` in the program workspace. */
export function readIntentField(workspace: PathResolution): FieldRead<IntentFieldField, IntentRowRef[] | null> {
  const readAt = new Date().toISOString()
  if (workspace.path === null) return { field: null, reason: workspace.reason ?? 'the workspace did not resolve', ids: null }
  const file = join(workspace.path, 'plan', 'intent-field', 'field.json')
  let raw: string
  let bytes: number
  try {
    const stat = statSync(file)
    bytes = stat.size
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { field: null, reason: `${file} could not be read: ${message}`, ids: null }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { field: null, reason: `${file} is present (${bytes} B) but is not valid JSON: ${message}`, ids: null }
  }
  const root = asRecord(parsed)
  const documents = asArray(root?.['documents'])
  if (documents === null) {
    return { field: null, reason: `${file} is valid JSON but documents[] is absent`, ids: null }
  }
  const ids: string[] = []
  const rowRefs: IntentRowRef[] = []
  const values = new Map<string, number>()
  let rows = 0
  let rowsWithoutValue = 0
  for (const document of documents) {
    const rowsRaw = asArray(asRecord(document)?.['rows'])
    if (rowsRaw === null) continue
    for (const row of rowsRaw) {
      rows += 1
      const record = asRecord(row)
      const id = asString(record?.['id'])
      if (id === null || id === '') {
        return { field: null, reason: `${file} carries a row without a string id (row ${rows})`, ids: null }
      }
      ids.push(id)
      if (record === null || !('value' in record)) {
        rowsWithoutValue += 1
        continue
      }
      const value = String(record['value'])
      values.set(value, (values.get(value) ?? 0) + 1)
      rowRefs.push({ id, value })
    }
  }
  const unique = new Set(ids)
  const duplicateRowIds = ids.length - unique.size
  const byValue: Record<string, number> = {}
  for (const key of [...values.keys()].sort()) byValue[key] = values.get(key) ?? 0
  const declaredRows = asNumber(asRecord(root?.['counts'])?.['rowsTotal'])
  const comparable = duplicateRowIds === 0 && rowsWithoutValue === 0
  return {
    field: {
      rows,
      of: rows,
      byValue,
      byValueOf: rows - rowsWithoutValue,
      rowsWithoutValue,
      duplicateRowIds,
      generatedAt: asString(root?.['generatedAt']),
      mode: asString(asRecord(root?.['mode'])?.['name']),
      documents: asNumber(asRecord(root?.['counts'])?.['documents']) ?? documents.length,
      declaredRows,
      rowsMatchDeclared: declaredRows === null ? null : declaredRows === rows,
      file,
      bytes,
      readAt,
    },
    reason: null,
    ids: comparable ? rowRefs.sort((a, b) => a.id.localeCompare(b.id)) : null,
  }
}

/** Read `lvl1Gate` from status AND sessions; both are required for the field to be readable. */
export async function readLvl1Gate(host: ResolvedHost): Promise<FieldRead<Lvl1GateField, null>> {
  const statusRoute = '/lvl1-gate/api/status'
  const sessionsRoute = '/lvl1-gate/api/sessions'
  const readAt = new Date().toISOString()
  const [statusRead, sessionsRead] = await Promise.all([
    readJson(host.hostUrl + statusRoute, host.timeoutMs),
    readJson(host.hostUrl + sessionsRoute, host.timeoutMs),
  ])
  const problems: string[] = []
  if (!statusRead.ok) problems.push(`${statusRoute}: ${statusRead.reason}`)
  if (!sessionsRead.ok) problems.push(`${sessionsRoute}: ${sessionsRead.reason}`)
  if (problems.length > 0) return { field: null, reason: problems.join('; '), ids: null }

  const status = asRecord((statusRead as ReadSuccess).value)
  const sessions = asRecord((sessionsRead as ReadSuccess).value)
  const hooked = status?.['hooked']
  const runs = asNumber(status?.['runs'])
  const handed = sessions?.['hooked']
  const count = asNumber(sessions?.['count'])
  // THE MERGED census first, because `count` is the MERGED count: a numerator and its
  // denominator must come from the same population, and these do (7+10+4 = 21 = count).
  const census = asRecord(sessions?.['historyCensus'])
  const decided = asNumber(census?.['decided'])
  const declined = asNumber(census?.['declined'])
  const neverRan = asNumber(census?.['neverRan'])
  if (typeof hooked !== 'boolean' || typeof handed !== 'boolean' || runs === null || count === null ||
      decided === null || declined === null || neverRan === null) {
    return { field: null, reason: `${statusRoute} and/or ${sessionsRoute} answered but the payloads lack hooked/runs/count/historyCensus`, ids: null }
  }
  const inProcessCensus = asRecord(sessions?.['outcomeCensus'])
  const inProcessDecided = asNumber(inProcessCensus?.['decided'])
  const inProcessDeclined = asNumber(inProcessCensus?.['declined'])
  const inProcessNeverRan = asNumber(inProcessCensus?.['neverRan'])
  const inProcessOf = asNumber(sessions?.['inProcess'])
  const inProcessComplete = inProcessDecided !== null && inProcessDeclined !== null && inProcessNeverRan !== null
  const lastProvenance = asRecord(asRecord(status?.['last'])?.['provenance'])
  const revisions = asArray(status?.['revisions'])
  const statusSessionCount = asNumber(status?.['sessionCount'])
  return {
    field: {
      hooked,
      hookedAgrees: handed === hooked,
      runs,
      sessions: count,
      statusSessionCount,
      sessionsAgree: statusSessionCount === null ? null : statusSessionCount === count,
      outcomes: { decided, declined, neverRan },
      outcomesOf: count,
      outcomesBasis: asString(census?.['basis']),
      sumsToOutcomes: decided + declined + neverRan === count,
      inProcessOutcomes: inProcessComplete && inProcessDecided !== null && inProcessDeclined !== null && inProcessNeverRan !== null
        ? { decided: inProcessDecided, declined: inProcessDeclined, neverRan: inProcessNeverRan }
        : null,
      inProcessOutcomesOf: inProcessOf ?? null,
      inProcessBasis: asString(inProcessCensus?.['basis']),
      last: lastProvenance === null
        ? null
        : {
            outcome: asString(lastProvenance['outcome']),
            reason: asString(lastProvenance['reason']),
            channel: asString(lastProvenance['channel']),
            at: asString(lastProvenance['at']),
          },
      revisions: revisions === null ? null : revisions.map((entry) => String(entry)),
      sources: [statusRoute, sessionsRoute],
      readAt,
    },
    reason: null,
    ids: null,
  }
}

/** Read `intentMap` live from the host. */
export async function readIntentMap(host: ResolvedHost): Promise<FieldRead<IntentMapField, null>> {
  const route = '/intent-map/api/map'
  const read = await readJson(host.hostUrl + route, host.timeoutMs)
  const readAt = new Date().toISOString()
  if (!read.ok) return { field: null, reason: read.reason, ids: null }
  const root = asRecord(read.value)
  const corpus = asRecord(root?.['corpus'])
  const zonesCensus = asRecord(corpus?.['zones'])
  const index = asRecord(root?.['index'])
  const identity = asRecord(index?.['identity'])
  const zones = asNumber(zonesCensus?.['count'])
  const of = asNumber(zonesCensus?.['of'])
  const model = asString(identity?.['model'])
  const dim = asNumber(identity?.['dim'])
  if (zones === null || of === null || model === null || dim === null) {
    return {
      field: null,
      reason: `${route} answered ${read.status} but corpus.zones.count/of or index.identity.model/dim is absent`,
      ids: null,
    }
  }
  const zoneRows = asArray(root?.['zones'])
  const inScope = asRecord(corpus?.['inScopePlugins'])
  return {
    field: {
      zones,
      zoneRows: zoneRows === null ? null : zoneRows.length,
      zonesMatch: zoneRows === null ? null : zoneRows.length === zones,
      of,
      model,
      dim,
      freshness: asString(index?.['freshness']),
      corpusPlugins: asNumber(inScope?.['count']),
      corpusOf: asNumber(inScope?.['of']),
      catalogCount: asNumber(corpus?.['catalogCount']),
      censusAt: asString(corpus?.['censusAt']),
      source: route,
      readAt,
    },
    reason: null,
    ids: null,
  }
}

/**
 * Count the `dsh-meta-*` DIRECTORIES under `plugins-src/`.
 *
 * `readdirSync(..., { withFileTypes: true })` filtered by `isDirectory()` rather
 * than the length of a listing: a listing includes files, and this program has
 * already published a directory count that was really an entry count.
 */
export function readPlugins(pluginsRoot: PathResolution): FieldRead<PluginsField, string[] | null> {
  const readAt = new Date().toISOString()
  if (pluginsRoot.path === null) return { field: null, reason: pluginsRoot.reason ?? 'plugins-src did not resolve', ids: null }
  let directories: string[]
  try {
    directories = readdirSync(pluginsRoot.path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { field: null, reason: `${pluginsRoot.path} could not be listed: ${message}`, ids: null }
  }
  const names = directories.filter((name) => name.startsWith('dsh-meta-')).sort()
  return {
    field: { count: names.length, of: directories.length, names, root: pluginsRoot.path, readAt },
    reason: null,
    ids: names,
  }
}

/* ------------------------------------------------------------------------- */
/* The composed state and its snapshot                                       */
/* ------------------------------------------------------------------------- */

/** The composed state the `state` route serves. Every field is `null` + a reason when unreadable. */
export interface StateReport {
  readonly ok: true
  readonly built: true
  readonly note: 'live'
  readonly at: string
  readonly host: string
  readonly hostFrom: string | null
  readonly workspace: { readonly path: string; readonly from: string | null } | null
  readonly workspaceReason: string | null
  readonly pluginsRoot: { readonly path: string; readonly from: string | null } | null
  readonly roundsFile: { readonly path: string; readonly from: string | null } | null
  readonly roundsFileReason: string | null
  readonly decisionLog: DecisionLogField | null
  readonly intentField: IntentFieldField | null
  readonly lvl1Gate: Lvl1GateField | null
  readonly intentMap: IntentMapField | null
  readonly plugins: PluginsField | null
  readonly unreadable: Partial<Record<FieldName, string>>
  readonly counts: Record<string, number | null>
  readonly countsRead: { readonly read: number; readonly of: number }
  readonly notDone: readonly string[]
  readonly readMs: number
}

/** The id sets the round delta compares. `null` means the source was unreadable, not empty. */
export interface SnapshotIds {
  readonly decisions: string[] | null
  readonly plugins: string[] | null
  readonly intentRows: readonly IntentRowRef[] | null
}

/** The comparanda one round stores: flat counts, readability per field, and id sets. */
export interface Snapshot {
  readonly counts: Record<string, number | null>
  readonly fieldReadable: Record<FieldName, boolean>
  readonly ids: SnapshotIds
  readonly model: string | null
}

/** A state-shaped object's fields, for `flatCounts`. */
type CountSource = Pick<StateReport, 'decisionLog' | 'intentField' | 'lvl1Gate' | 'intentMap' | 'plugins'>

/**
 * Flatten every count in a state into `{key: number|null}`.
 *
 * The keys are stable across rounds (`decisionLog.total`, `intentField.byValue.plan`, ...),
 * which is what lets the delta name the counts that moved. A `null` value means
 * the field was unreadable — it is never folded to zero here.
 *
 * @param state - the composed state.
 * @returns the flat count map.
 */
export function flatCounts(state: CountSource): Record<string, number | null> {
  const counts: Record<string, number | null> = {}
  counts['decisionLog.total'] = state.decisionLog?.total ?? null
  counts['decisionLog.active'] = state.decisionLog?.active ?? null
  counts['decisionLog.superseded'] = state.decisionLog?.superseded ?? null
  if (state.intentField === null) {
    counts['intentField.rows'] = null
  } else {
    counts['intentField.rows'] = state.intentField.rows
    for (const [value, count] of Object.entries(state.intentField.byValue)) {
      counts[`intentField.byValue.${value}`] = count
    }
  }
  counts['lvl1Gate.runs'] = state.lvl1Gate?.runs ?? null
  counts['lvl1Gate.sessions'] = state.lvl1Gate?.sessions ?? null
  counts['lvl1Gate.outcomes.decided'] = state.lvl1Gate?.outcomes.decided ?? null
  counts['lvl1Gate.outcomes.declined'] = state.lvl1Gate?.outcomes.declined ?? null
  counts['lvl1Gate.outcomes.neverRan'] = state.lvl1Gate?.outcomes.neverRan ?? null
  counts['intentMap.zones'] = state.intentMap?.zones ?? null
  counts['intentMap.corpusPlugins'] = state.intentMap?.corpusPlugins ?? null
  counts['intentMap.dim'] = state.intentMap?.dim ?? null
  counts['plugins.count'] = state.plugins?.count ?? null
  return counts
}

/**
 * Read every field LIVE and compose the state, once.
 *
 * The same five reads produce both the served state and the snapshot, so the
 * evolution control's delta and the state route's counts are two views of ONE
 * measurement rather than two measurements that can disagree.
 *
 * @param host - the resolved host and paths.
 * @returns the served state and its snapshot.
 */
export async function readState(host: ResolvedHost): Promise<{ state: StateReport; snapshot: Snapshot }> {
  const started = Date.now()
  const [decisionLog, intentField, lvl1Gate, intentMap, plugins] = await Promise.all([
    readDecisionLog(host),
    Promise.resolve(readIntentField(host.workspace)),
    readLvl1Gate(host),
    readIntentMap(host),
    Promise.resolve(readPlugins(host.pluginsRoot)),
  ])

  const unreadable: Partial<Record<FieldName, string>> = {}
  for (const [name, read] of [
    ['decisionLog', decisionLog],
    ['intentField', intentField],
    ['lvl1Gate', lvl1Gate],
    ['intentMap', intentMap],
    ['plugins', plugins],
  ] as const) {
    if (read.field === null) unreadable[name] = read.reason ?? 'unreadable, no reason recorded'
  }

  const state: StateReport = {
    ok: true,
    built: true,
    note: 'live',
    at: new Date().toISOString(),
    host: host.hostUrl,
    hostFrom: host.hostFrom,
    workspace: host.workspace.path === null ? null : { path: host.workspace.path, from: host.workspace.from },
    workspaceReason: host.workspace.reason,
    pluginsRoot: host.pluginsRoot.path === null ? null : { path: host.pluginsRoot.path, from: host.pluginsRoot.from },
    roundsFile: host.roundsFile.path === null ? null : { path: host.roundsFile.path, from: host.roundsFile.from },
    roundsFileReason: host.roundsFile.reason,
    decisionLog: decisionLog.field,
    intentField: intentField.field,
    lvl1Gate: lvl1Gate.field,
    intentMap: intentMap.field,
    plugins: plugins.field,
    unreadable,
    counts: {},
    countsRead: { read: 0, of: 0 },
    notDone: [
      'This route opens no device and calls no model; every field is a disk read or an HTTP route read on this request.',
      'This route caches nothing; a source that fails is reported null with a reason and never as a previous value.',
    ],
    readMs: Date.now() - started,
  }
  const counts = flatCounts(state)
  const values = Object.values(counts)
  const composed: StateReport = {
    ...state,
    counts,
    countsRead: { read: values.filter((value) => value !== null).length, of: values.length },
    readMs: Date.now() - started,
  }
  const fieldReadable: Record<FieldName, boolean> = {
    decisionLog: composed.decisionLog !== null,
    intentField: composed.intentField !== null,
    lvl1Gate: composed.lvl1Gate !== null,
    intentMap: composed.intentMap !== null,
    plugins: composed.plugins !== null,
  }
  const snapshot: Snapshot = {
    counts,
    fieldReadable,
    ids: {
      decisions: decisionLog.ids,
      plugins: plugins.ids,
      intentRows: intentField.ids,
    },
    model: composed.intentMap?.model ?? null,
  }
  return { state: composed, snapshot }
}
