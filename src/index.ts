/**
 * dsh-meta-evolve — the meta layer's Host half: it COMPOSES the program's own
 * surfaces into one readable state and EVOLVES by recording deltas between rounds.
 *
 * WHAT THIS REVISION IS, STATED SO IT CANNOT BE MISTAKEN FOR MORE.
 *
 * The package shell served one constant. This revision serves the meta layer:
 *
 *   GET  /meta-evolve/api/state   — the composed state, read LIVE: the decision
 *                                  log, the intent field, the LVL1 gate, the
 *                                  intent map, and the `dsh-meta-*` plugin
 *                                  census. Every field is read on the request
 *                                  and each carries its own source, read time and
 *                                  denominator; a source that fails is `null`
 *                                  with a `reason`, never a zero.
 *   POST /meta-evolve/api/evolve  — THE CONTROL. Recomputes the state and records
 *                                  a ROUND as the DELTA against the previous
 *                                  round: which counts moved and by how much,
 *                                  which decision / plugin / intent-row ids
 *                                  appeared, disappeared or changed value. It
 *                                  APPENDS the round to
 *                                  `research/meta-evolve-rounds.jsonl` and
 *                                  reports the file's before/after line counts,
 *                                  so a caller can see the change rather than
 *                                  take it on faith.
 *   GET  /meta-evolve/api/rounds  — the recorded rounds, newest first, with the
 *                                  count and the file's line census beside it.
 *   GET  /meta-evolve/api/rounds/beam — the recorded BEAM deltas, newest first,
 *                                  RE-READ from the record file on every request,
 *                                  so a delta cannot be served from a cache.
 *
 * THE ELIXIR APP IS A DELTA SOURCE, NOT A DECORATION
 *
 * A round also captures what the control app's BEAM looked like at that instant
 * (`host/beam-round.ts`), so a round can cite the app's own loaded-module count,
 * uptime, fleet census and HTTP counters. Every one of those is `{value}` or
 * `{unmeasured: reason}`; an app that is down is a list of reasons, never a row
 * of zeros, because "no modules loaded" and "nothing was measured" are different
 * facts and only one of them is cheap to fabricate.
 *
 * THE ONE RULE THAT DECIDES WHETHER THIS IS HONEST
 *
 * An unreachable source is NOT an empty source. The three HTTP fields are read
 * live from the running host (`http://127.0.0.1:3083` by default, configurable)
 * on every request, and the two disk fields are re-read on every request. There
 * is no cache anywhere in this package: a source that stops answering produces
 * `null` plus a reason in `unreadable`, never the previous value and never zero.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO.
 *
 *   1. It opens NO device and calls NO model. Every field is a file read or an
 *      HTTP `GET` against the program's own already-running routes. The GPU is
 *      reached only through `llama.cpp` and its controlling scripts
 *      (`AGENTS.md` §"The GPU directive"); no field here is model-derived, and a
 *      count read from a log cannot be mistaken for one that is.
 *
 *   2. It publishes NO Cordis service. It registers three exact routes, so it
 *      needs no `isolate` realm and cannot leak a root-realm service into an
 *      agent-preset mount.
 *
 *   3. It does not decide what a round MEANS. A delta reports movement; it does
 *      not judge it. That is deliberate: the meta layer's job here is to make
 *      the program's own state readable across rounds, and a judgment added at
 *      this layer would be an unaudited gate.
 *
 * `apply` is explicitly NOT async: Cordis treats a prototype-bearing ordinary
 * function as a constructor, whose returned Promise is not startup work
 * (`dsh-lvl1-gate/src/index.ts:986-989` records the same trap). Route
 * registration is synchronous, so nothing here needs to await.
 *
 * @module dsh-meta-evolve
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HostContext, RouteRegistrar } from './types.ts'
import { ROUTE_PATHS, handle } from './host/routes.ts'
import { resolveHost } from './host/workspace.ts'

/**
 * Loader row name.
 *
 * The bundle patch's row is `id: meta-evolve` / `name: 'dsh-meta-evolve'`, and
 * this export is the PACKAGE name, following `dsh-plan-rag` and the sibling meta
 * packages rather than the row id — Cordis reads a namespace plugin's `name` for
 * runtime diagnostics only (`vendor/cordis/src/registry.ts:324`); the row `id` is
 * the composition's identity and the two are not required to match.
 */
export const name = 'dsh-meta-evolve'

/** The one service this plugin cannot work without. */
export const inject = ['webServer']

/** Every advertised path, re-exported so a verifier derives them from one place. */
export { STATE_PATH, EVOLVE_PATH, ROUNDS_PATH, BEAM_ROUNDS_PATH, ROUTE_PATHS } from './host/routes.ts'

/**
 * The BEAM capture and its comparison, re-exported so a verifier can DRIVE them.
 *
 * A verifier that could only read this over `POST /evolve` would need a live
 * Elixir app to test the ABSENT path, and the absent path is the one that
 * matters: `captureBeam` against a closed port must report reasons, never zeros.
 * Exporting the function is what makes that check possible without the app up.
 */
export {
  BEAM_FIELD_NAMES,
  BEAM_IDENTITY_NAMES,
  BEAM_STATUS_PATH,
  CONTROL_URL_ENV,
  DEFAULT_CONTROL_PORT,
  FLEET_STATUS_PATH,
  captureBeam,
  computeBeamDelta,
  resolveControlUrl,
} from './host/beam-round.ts'

/**
 * The row's config, uninterpreted.
 *
 * There is no config schema yet. `hostUrl`, `workspace`, `roundsFile`,
 * `pluginsRoot` and `timeoutMs` are optional overrides; the key list is LOGGED
 * and each unusable value is reported, so a config that a later lane adds is
 * visible in the boot log from the first day it is passed instead of being
 * silently dropped.
 */
export type Config = Record<string, unknown>

/**
 * Wire the meta layer's three routes.
 *
 * @param ctx - plugin context carrying the web server and logger.
 * @param rawConfig - the row's config, before any interpretation.
 */
export function apply(ctx: HostContext, rawConfig: Config = {}): void {
  const host = resolveHost(rawConfig)
  for (const problem of host.problems) {
    ctx.logger.warn(
      'dsh-meta-evolve: ignoring unusable config %s=%o: %s',
      problem.key,
      problem.value,
      problem.reason,
    )
  }
  ctx.logger.info(
    'dsh-meta-evolve: applying; routes=%j; host=%s; workspace=%s; pluginsRoot=%s; roundsFile=%s',
    [...ROUTE_PATHS],
    host.hostUrl,
    host.workspace.path ?? `UNRESOLVED (${host.workspace.reason ?? 'no reason recorded'})`,
    host.pluginsRoot.path ?? `UNRESOLVED (${host.pluginsRoot.reason ?? 'no reason recorded'})`,
    host.roundsFile.path ?? `UNRESOLVED (${host.roundsFile.reason ?? 'no reason recorded'})`,
  )

  ctx.effect(
    (): RouteRegistrar => {
      const disposers = ROUTE_PATHS.map((path) => ctx.webServer.register({
        kind: 'exact',
        path,
        handler: (req: IncomingMessage, res: ServerResponse): void => {
          // `handle` catches its own failures and answers JSON. The final `catch`
          // is a last resort for a response that cannot be written at all, so a
          // rejected promise cannot surface as an unhandled rejection.
          void handle(req, res, host).catch((error: unknown) => {
            try {
              const text = JSON.stringify({ ok: false, error: 'internal error', reason: String(error) })
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
              res.end(text)
            } catch {
              // The response is already gone; nothing left to report to.
            }
          })
        },
      }))
      return () => {
        for (const dispose of disposers.reverse()) dispose()
      }
    },
    'dsh-meta-evolve: state, evolve and rounds routes',
  )
}
