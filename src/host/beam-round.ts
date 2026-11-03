/**
 * The round record's ELIXIR-APP source: one round captures what the BEAM looks
 * like at that instant, so a round can cite the app's own state rather than only
 * the meta layer's five HTTP/disk fields.
 *
 * WHERE THE ENDPOINT CAME FROM — READ, NOT GUESSED
 *
 * The `jido` MCP surface (`beam_status`, `fleet_status`) is a stdio client row,
 * so it has no HTTP endpoint of its own. The row that serves it was read in the
 * MCP server config on this machine, `dsh-mcp-client` row `jido-mcp`, whose
 * `cwd` is the control project and whose command is
 * `mix run --no-start mcp_serve.exs`:
 *
 *     $HOME/.dsh/profiles/personal-dev/cordis.patch.yml   (row `jido-mcp`)
 *
 * The control app those tools front is `backend/control`, and its own route
 * table names the two paths used here (`backend/control/lib/control/routes.ex`):
 *
 *     GET /api/beam/status   -> the `beam_status` action (loaded module count,
 *                               uptime, process count, and the control app's own
 *                               HTTP counters under `http`)
 *     GET /fleet/status      -> the `fleet_status` action (the fleet census)
 *
 * The listener is `Control.HTTP`, `@default_port 4100` with `CONTROL_PORT`
 * overriding it (`backend/control/lib/control/http.ex`). This module therefore
 * defaults to `http://127.0.0.1:4100` and resolves the port the same way the
 * app does, so the two cannot disagree about where the app listens.
 *
 * ABSENT IS NOT ZERO, AND HERE IT IS NOT EVEN A NUMBER
 *
 * Every field is `{value}` or `{unmeasured: reason}`. When the app is down the
 * answer is NOT `loadedModuleCount: 0` — a zero would claim a BEAM that loaded
 * no modules, which is a different and false reading. `readings.read` carries
 * the numerator and `readings.of` the denominator, so a round says how much of
 * the BEAM it could actually see.
 *
 * @module dsh-meta-evolve/host/beam-round
 */

import type { ReadResult } from './sources.ts'
import { readJson } from './sources.ts'

/** The port `Control.HTTP` listens on unless `CONTROL_PORT` says otherwise. */
export const DEFAULT_CONTROL_PORT = 4100

/** The env key that repoints the control app, mirroring `CONTROL_PORT`. */
export const CONTROL_URL_ENV = 'DSH_META_EVOLVE_CONTROL_URL'

/** The two routes this module reads, named once so a listing cannot drift from the table. */
export const BEAM_STATUS_PATH = '/api/beam/status'
export const FLEET_STATUS_PATH = '/fleet/status'

/**
 * One captured reading: a value, or WHY there is no value.
 *
 * Both arms are closed and non-optional, so a caller cannot read `.value` off an
 * absence and get `undefined` folded to `0` further down.
 */
export type BeamReading =
  | { readonly value: number }
  | { readonly unmeasured: string }

/** Every numeric field a round captures from the control app, in one place. */
export const BEAM_FIELD_NAMES = [
  'loadedModuleCount',
  'processCount',
  'uptimeMs',
  'httpRequests',
  'httpConnections',
  'fleetUnits',
] as const

/** The name of one captured numeric field. */
export type BeamFieldName = (typeof BEAM_FIELD_NAMES)[number]

/** The identity values a round captures. Identity is a string, never a count. */
export const BEAM_IDENTITY_NAMES = ['node', 'systemPid'] as const

/** The name of one captured identity value. */
export type BeamIdentityName = (typeof BEAM_IDENTITY_NAMES)[number]

/** One round's view of the control app. Never `null`: an unreadable app is a list of reasons. */
export interface BeamField {
  readonly controlUrl: string
  readonly controlFrom: string
  readonly readAt: string
  readonly fields: Record<BeamFieldName, BeamReading>
  readonly identity: Record<BeamIdentityName, string | null>
  readonly readings: { readonly read: number; readonly of: number }
  readonly identityRead: { readonly read: number; readonly of: number }
  readonly unavailable: Record<string, string>
}

/** One numeric field compared between two rounds. `delta: null` means the comparison was impossible. */
export interface BeamDeltaCount {
  readonly from: number | null
  readonly to: number | null
  readonly delta: number | null
  readonly reason: string | null
}

/** One identity value compared between two rounds. */
export interface BeamDeltaValue {
  readonly from: string | null
  readonly to: string | null
  readonly changed: boolean | null
  readonly reason: string | null
}

/** The BEAM part of one round's delta. */
export interface BeamDelta {
  readonly fields: Record<BeamFieldName, BeamDeltaCount>
  readonly moved: Array<{ readonly key: string; readonly from: number; readonly to: number; readonly delta: number }>
  readonly movedOf: { readonly moved: number; readonly checked: number; readonly uncompared: number }
  readonly identity: Record<BeamIdentityName, BeamDeltaValue>
  readonly changedIdentity: readonly string[]
  /**
   * Whether the OS process is a DIFFERENT one than the previous round's.
   *
   * `null` when either side did not name its pid, because "the pid did not
   * change" and "the pid was not measured" are different claims and a restart
   * inferred from an unread identity would be a fabrication.
   */
  readonly restarted: { readonly occurred: boolean | null; readonly reason: string | null }
  /** Comparison-level absences, kept OUT of the round's `unavailable` map: they are the beam's own. */
  readonly unavailable: Record<string, string>
}

/** Where the control app is, and how that was decided. */
export interface ControlResolution {
  readonly url: string
  readonly from: string
  readonly problems: readonly string[]
}

/** Render an unknown thrown value. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Resolve the control app's origin the way the app resolves its own port.
 *
 * An explicit URL wins; then a numeric `CONTROL_PORT` (the app's own override);
 * then the app's default. A `CONTROL_PORT` that is not a port is REPORTED rather
 * than silently used, and the default still applies.
 *
 * @param env - the process environment, injected so a verifier can drive it.
 * @returns the origin, where it came from, and any value that was ignored.
 */
export function resolveControlUrl(env: Record<string, string | undefined>): ControlResolution {
  const problems: string[] = []
  const explicit = env[CONTROL_URL_ENV]
  if (explicit !== undefined && explicit.trim() !== '') {
    const url = explicit.trim().replace(/\/+$/, '')
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:') problems.push(`${CONTROL_URL_ENV} is not an http origin: ${url}`)
    } catch (error) {
      problems.push(`${CONTROL_URL_ENV} is not a URL (${describeError(error)}); the default is used instead`)
      return { url: `http://127.0.0.1:${DEFAULT_CONTROL_PORT}`, from: 'default (ignored an unusable override)', problems }
    }
    return { url, from: `env.${CONTROL_URL_ENV}`, problems }
  }
  const port = env['CONTROL_PORT']
  if (port !== undefined && port.trim() !== '') {
    const value = Number.parseInt(port.trim(), 10)
    if (!Number.isFinite(value) || value <= 0 || value > 65_535) {
      problems.push(`CONTROL_PORT is not a port: ${JSON.stringify(port)}; the default ${DEFAULT_CONTROL_PORT} is used instead`)
    } else {
      return { url: `http://127.0.0.1:${value}`, from: 'env.CONTROL_PORT', problems }
    }
  }
  return { url: `http://127.0.0.1:${DEFAULT_CONTROL_PORT}`, from: 'default (Control.HTTP @default_port)', problems }
}

/** A plain object, or null. Arrays and null are NOT records. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** A finite number, or null. A numeric string is NOT a number here. */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A string, or null. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Walk a dotted path through plain objects, returning the leaf or null. */
function dig(body: Record<string, unknown> | null, path: readonly string[]): unknown {
  let cursor: unknown = body
  for (const step of path) {
    const record = asRecord(cursor)
    if (record === null) return null
    cursor = record[step]
  }
  return cursor
}

/**
 * One numeric reading from one response body.
 *
 * @param body - the parsed response, or null when the read failed.
 * @param path - the dotted path inside the body.
 * @param failure - why the body is null, when it is.
 * @returns the value, or the reason it is absent.
 */
function readingAt(
  body: Record<string, unknown> | null,
  path: readonly string[],
  failure: string | null,
): BeamReading {
  const dotted = path.join('.')
  if (body === null) return { unmeasured: failure ?? `the response carried no ${dotted}` }
  const value = asNumber(dig(body, path))
  if (value === null) return { unmeasured: `the control app answered but carried no numeric ${dotted}` }
  return { value }
}

/** The reason one failed read contributes, naming how it failed. */
function readFailure(read: ReadResult): string | null {
  return read.ok ? null : `${read.reason} (status ${read.status ?? 'no answer'}, ${read.elapsedMs} ms)`
}

/**
 * Capture the control app's state as one round's BEAM source.
 *
 * The two reads are independent: a fleet endpoint that fails does NOT hide the
 * BEAM readings, and each field carries its own reason. Nothing is cached.
 *
 * @param controlUrl - the control app's origin, with or without a trailing slash.
 * @param controlFrom - how that origin was decided, carried into the record.
 * @param timeoutMs - the per-read bound.
 * @returns the captured field, with `readings` as a numerator/denominator pair.
 */
export async function captureBeam(
  controlUrl: string,
  controlFrom: string,
  timeoutMs: number,
): Promise<BeamField> {
  const base = controlUrl.replace(/\/+$/, '')
  const [beamRead, fleetRead] = await Promise.all([
    readJson(`${base}${BEAM_STATUS_PATH}`, timeoutMs),
    readJson(`${base}${FLEET_STATUS_PATH}`, timeoutMs),
  ])
  const beamBody = beamRead.ok ? asRecord(beamRead.value) : null
  const fleetBody = fleetRead.ok ? asRecord(fleetRead.value) : null
  const beamFailure = readFailure(beamRead)
  const fleetFailure = readFailure(fleetRead)

  const fields: Record<string, BeamReading> = {
    loadedModuleCount: readingAt(beamBody, ['loaded_module_count'], beamFailure),
    processCount: readingAt(beamBody, ['process_count'], beamFailure),
    uptimeMs: readingAt(beamBody, ['uptime_ms'], beamFailure),
    httpRequests: readingAt(beamBody, ['http', 'requests'], beamFailure),
    httpConnections: readingAt(beamBody, ['http', 'connections'], beamFailure),
    fleetUnits: readingAt(fleetBody, ['census', 'total'], fleetFailure),
  }

  const identity: Record<string, string | null> = {
    node: beamBody === null ? null : asString(dig(beamBody, ['node'])),
    systemPid: beamBody === null ? null : asString(dig(beamBody, ['system_pid'])),
  }

  const unavailable: Record<string, string> = {}
  let read = 0
  for (const name of BEAM_FIELD_NAMES) {
    const reading = fields[name] as BeamReading
    if ('value' in reading) read += 1
    else unavailable[`fields.${name}`] = reading.unmeasured
  }
  let identityRead = 0
  for (const name of BEAM_IDENTITY_NAMES) {
    const value = identity[name] ?? null
    if (value !== null) identityRead += 1
    else unavailable[`identity.${name}`] = beamFailure ?? `the control app answered but carried no string ${name}`
  }

  return {
    controlUrl: base,
    controlFrom,
    readAt: new Date().toISOString(),
    fields: fields as Record<BeamFieldName, BeamReading>,
    identity: identity as Record<BeamIdentityName, string | null>,
    readings: { read, of: BEAM_FIELD_NAMES.length },
    identityRead: { read: identityRead, of: BEAM_IDENTITY_NAMES.length },
    unavailable,
  }
}

/** Read one side of a numeric comparison, keeping WHICH absence it is. */
function sideOf(
  reading: BeamReading | undefined,
  label: string,
): { value: number | null; absent: string | null } {
  if (reading === undefined) return { value: null, absent: `${label} did not carry this field` }
  if ('value' in reading) return { value: reading.value, absent: null }
  return { value: null, absent: `${label}: ${reading.unmeasured}` }
}

/**
 * Compare one round's BEAM against the previous round's.
 *
 * The absences are collected in the DELTA's own `unavailable` map rather than the
 * round's, so a control app that was down for one round cannot change what the
 * five HTTP/disk counts claim about themselves.
 *
 * @param previous - the previous round's captured field.
 * @param current - this round's captured field.
 * @param previousRound - the previous round's number, for the reasons.
 * @returns the delta, with every uncomparable field carrying its reason.
 */
export function computeBeamDelta(previous: BeamField, current: BeamField, previousRound: number): BeamDelta {
  const fields: Record<string, BeamDeltaCount> = {}
  const moved: Array<{ key: string; from: number; to: number; delta: number }> = []
  const unavailable: Record<string, string> = {}
  let uncompared = 0

  for (const name of BEAM_FIELD_NAMES) {
    const from = sideOf(previous.fields?.[name], `round ${previousRound}`)
    const to = sideOf(current.fields?.[name], 'this round')
    if (from.value === null || to.value === null) {
      const parts: string[] = []
      if (from.absent !== null) parts.push(from.absent)
      if (to.absent !== null) parts.push(to.absent)
      const reason = parts.join('; ')
      fields[name] = { from: from.value, to: to.value, delta: null, reason }
      unavailable[`fields.${name}`] = reason
      uncompared += 1
      continue
    }
    const delta = to.value - from.value
    fields[name] = { from: from.value, to: to.value, delta, reason: null }
    if (delta !== 0) moved.push({ key: name, from: from.value, to: to.value, delta })
  }

  const identity: Record<string, BeamDeltaValue> = {}
  const changedIdentity: string[] = []
  for (const name of BEAM_IDENTITY_NAMES) {
    const from = previous.identity?.[name] ?? null
    const to = current.identity?.[name] ?? null
    if (from === null || to === null) {
      const reason = from === null && to === null
        ? 'the identity was not measured in either round'
        : from === null
          ? `the identity was not measured in round ${previousRound}`
          : 'the identity was not measured in this round'
      identity[name] = { from, to, changed: null, reason }
      unavailable[`identity.${name}`] = reason
      continue
    }
    const changed = from !== to
    identity[name] = { from, to, changed, reason: null }
    if (changed) changedIdentity.push(name)
  }

  const pid = identity['systemPid']
  const restarted = pid === undefined || pid.changed === null
    ? { occurred: null, reason: pid?.reason ?? 'the pid was not compared, so a restart cannot be claimed' }
    : { occurred: pid.changed, reason: null }

  return {
    fields: fields as Record<BeamFieldName, BeamDeltaCount>,
    moved: moved.sort((a, b) => a.key.localeCompare(b.key)),
    movedOf: { moved: moved.length, checked: BEAM_FIELD_NAMES.length, uncompared },
    identity: identity as Record<BeamIdentityName, BeamDeltaValue>,
    changedIdentity: changedIdentity.sort(),
    restarted,
    unavailable,
  }
}
