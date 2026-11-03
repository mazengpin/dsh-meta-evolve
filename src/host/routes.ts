/**
 * The meta layer's three routes, and the only place their payloads are shaped.
 *
 * WHY THIS FILE IS SEPARATE FROM `index.ts`
 *
 * `index.ts` declares `name`, `inject` and the registrations. This file decides
 * what a request MEANS. The split is what makes "does this plugin decide anything
 * at registration time?" answerable by reading one short file, and the answer is
 * no: a boot-time decision is a decision nobody can audit afterwards.
 *
 * THE THREE ROUTES AND WHAT EACH ONE IS ALLOWED TO CLAIM
 *
 *   GET  /meta-evolve/api/state   — the composed live state. A field whose source
 *                                  failed is `null` with a reason; a source that
 *                                  answered is never reported as zero by default.
 *   POST /meta-evolve/api/evolve  — THE CONTROL. Recomputes the state, records a
 *                                  round as the delta against the previous round,
 *                                  APPENDS it, and reports the file change back.
 *                                  If it returned the same line count it was a
 *                                  read, so `before.lines` and `stored.lines`
 *                                  are both in the response and the verify
 *                                  harness asserts they differ by one.
 *   GET  /meta-evolve/api/rounds  — the recorded rounds, newest first, with the
 *                                  count and the file's own line count beside it.
 *
 * `Cache-Control: no-store` is set on every answer, including errors. The whole
 * subject of this surface is LIVE state; a cached answer would be a previous
 * round served as the current one.
 *
 * @module dsh-meta-evolve/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ResolvedHost } from './workspace.ts'
import type { RoundRecord } from './rounds.ts'
import { appendRound, buildRound, readRoundsFile } from './rounds.ts'
import { serialize } from './rounds.ts'
import { readState } from './sources.ts'

/** The composed-state route. This path existed in the package shell and is preserved. */
export const STATE_PATH = '/meta-evolve/api/state'

/** The evolution control route. */
export const EVOLVE_PATH = '/meta-evolve/api/evolve'

/** The recorded-rounds route. */
export const ROUNDS_PATH = '/meta-evolve/api/rounds'

/** Every path this package advertises, derived in ONE place so a listing cannot drift from the table. */
export const ROUTE_PATHS = [STATE_PATH, EVOLVE_PATH, ROUNDS_PATH] as const

/** An error that carries its own HTTP status and machine-readable detail. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Write one JSON body with direct response ownership and no caching. */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(text)
}

/** Render an unknown thrown value. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause
    if (cause instanceof Error) return `${error.message}: ${cause.message}`
    return error.message
  }
  return String(error)
}

/**
 * Enforce the method a route advertises.
 *
 * A registration matches the PATH, not the method, so without this the `GET` or
 * `POST` in every description would be decorative. 405 is the honest answer for
 * another method: the path exists and this is not how it is read.
 *
 * @returns true when the handler may continue.
 */
function requireMethod(req: IncomingMessage, res: ServerResponse, allowed: readonly string[]): boolean {
  const method = req.method ?? ''
  if (allowed.includes(method)) return true
  sendJson(res, 405, { ok: false, error: `${allowed.join(' or ')} required` }, { Allow: allowed.join(', ') })
  return false
}

/** Parse `?limit=` for the rounds route. Null means "no limit". */
function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, `limit must be a positive integer, got ${JSON.stringify(raw)}`)
  return Math.min(value, 500)
}

/** Handle the composed-state read. */
async function handleState(res: ServerResponse, host: ResolvedHost): Promise<void> {
  const { state } = await readState(host)
  sendJson(res, 200, state)
}

/** Handle the rounds read: newest first, with the count and the file's line census. */
function handleRounds(res: ServerResponse, host: ResolvedHost, limit: number | null): void {
  const path = host.roundsFile.path
  if (path === null) {
    sendJson(res, 503, {
      ok: false,
      error: 'the rounds file has no resolved path, so there is nothing to read',
      reason: host.roundsFile.reason,
      tried: host.roundsFile.tried,
    })
    return
  }
  const file = readRoundsFile(path)
  const newestFirst = [...file.rounds].reverse()
  const selected = limit === null ? newestFirst : newestFirst.slice(0, limit)
  sendJson(res, 200, {
    ok: true,
    count: selected.length,
    total: file.rounds.length,
    lines: file.lines,
    bytes: file.bytes,
    path: file.path,
    exists: file.exists,
    trailingNewline: file.trailingNewline,
    malformedLines: file.malformed.length,
    malformed: file.malformed,
    rounds: selected,
  })
}

/** Handle the evolution control: recompute, compare, append, and report the file change. */
async function handleEvolve(res: ServerResponse, host: ResolvedHost): Promise<void> {
  const result = await serialize(async () => {
    const path = host.roundsFile.path
    if (path === null) {
      throw new HttpError(503, 'the rounds file has no resolved path; a round will not be recorded nowhere', {
        reason: host.roundsFile.reason,
        tried: host.roundsFile.tried,
      })
    }
    // ONE set of live reads feeds both the state and the round: the delta and the
    // state route cannot disagree about what was measured, because they are two
    // views of the same measurement.
    const { state, snapshot } = await readState(host)
    const before = readRoundsFile(path)
    const previous: RoundRecord | null = before.rounds.length === 0 ? null : before.rounds[before.rounds.length - 1] ?? null
    const round = buildRound({
      previous,
      snapshot,
      host: host.hostUrl,
      workspace: host.workspace.path,
      unreadable: state.unreadable,
    })
    const stored = appendRound(path, round)
    // Re-read after the write. A control that cannot show the line it wrote has
    // only claimed one.
    const after = readRoundsFile(path)
    const last = after.rounds.length === 0 ? null : after.rounds[after.rounds.length - 1] ?? null
    const verified = last !== null && last.n === round.n && stored.lines === after.lines
    return {
      round,
      stored,
      before: { exists: before.exists, lines: before.lines, rounds: before.rounds.length },
      change: { linesDelta: stored.lines - before.lines, roundsDelta: after.rounds.length - before.rounds.length },
      verification: {
        verified,
        reason: verified
          ? null
          : `the file was re-read after the append and did not return round n=${round.n} as its last record`,
        lines: after.lines,
        rounds: after.rounds.length,
        lastN: last?.n ?? null,
      },
    }
  })
  sendJson(res, 200, { ok: true, ...result })
}

/**
 * Dispatch one request.
 *
 * Every failure path answers JSON with `ok: false` and a reason; a source that
 * fails does NOT make the state route fail, because an unreadable source is a
 * readable state. A route that cannot answer at all (no rounds path) answers 503
 * rather than 200-with-zero, because `count: 0` would read as "no rounds".
 *
 * @param req - the incoming request.
 * @param res - the response this handler owns directly.
 * @param host - the resolved paths and origin, resolved once at apply.
 */
export async function handle(req: IncomingMessage, res: ServerResponse, host: ResolvedHost): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    switch (url.pathname) {
      case STATE_PATH: {
        if (!requireMethod(req, res, ['GET', 'HEAD'])) return
        await handleState(res, host)
        return
      }
      case EVOLVE_PATH: {
        if (!requireMethod(req, res, ['POST'])) return
        await handleEvolve(res, host)
        return
      }
      case ROUNDS_PATH: {
        if (!requireMethod(req, res, ['GET', 'HEAD'])) return
        handleRounds(res, host, parseLimit(url.searchParams.get('limit')))
        return
      }
      default: {
        sendJson(res, 404, { ok: false, error: 'no such route', advertised: [...ROUTE_PATHS] })
        return
      }
    }
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { ok: false, error: error.message, ...error.detail })
      return
    }
    sendJson(res, 500, { ok: false, error: 'internal error', reason: describeError(error) })
  }
}
