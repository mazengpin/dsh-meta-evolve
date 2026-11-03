#!/usr/bin/env node
/**
 * verify/meta-evolve-verify.mjs — the falsifiable harness for the meta layer's Host half.
 *
 * WHAT IT IS FOR
 *
 * It drives the BUILT artifact (`../lib/index.js`) through a real HTTP server,
 * against the REAL live host (`http://127.0.0.1:3083`) for the three composed
 * fields, and it is allowed to fail: every check below can go RED, and the
 * mutation section drives four of them RED on purpose so the green count is a
 * reading rather than a caption.
 *
 * THE FOUR MUTATIONS, AND WHAT EACH PROVES
 *
 *   1. DEAD HOST PORT (`C2`). The state reader is pointed at a port that was
 *      open and then closed. The route must answer `null` + a reason for the
 *      three HTTP fields — NOT zero. Absent is not zero, and this is the mutation
 *      the brief asks for.
 *   2. UNREADABLE WORKSPACE (`D1`). The intent field is pointed at a directory
 *      that exists and has no `plan/intent-field/field.json`. That field must be
 *      `null` + reason while the other four stay readable: a failure is scoped to
 *      its source.
 *   3. STALE FIXTURE ROUND (`E3`). A deliberately wrong previous round is written
 *      to a temp rounds file — a fake decision id, a fake plugin, a removed row,
 *      a changed row value, and a wrong `decisionLog.total`. The evolve control
 *      must record exactly the difference between that fixture and the live
 *      snapshot. A delta that ignored the previous round cannot pass this.
 *   4. DELTA ASSERTION DRIVEN RED (`E4`). The same comparison is run against a
 *      mutated delta and must report a mismatch. If the assertion could not
 *      disagree, this check fails.
 *
 * WHY THE LIVE HOST IS REQUIRED RATHER THAN OPTIONAL
 *
 * Two sides of every equality compare the route's reading against an independent
 * one (`/decision-log/api/list` fetched by this harness, the field.json parsed
 * here, `readdirSync` here). If the live host were down, both sides would be
 * non-answers and the agreement would be meaningless — the program's recorded
 * "agreement on an unanswered request is not agreement" trap. So a dead live
 * host is a FATAL preflight failure, not a run with skipped checks.
 *
 * RUN IT AFTER `pnpm run build` (the harness refuses a stale `lib/`):
 *
 *   node verify/meta-evolve-verify.mjs
 */

import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(HERE, '..')
const LIB = join(PKG, 'lib', 'index.js')
const LIVE = (process.env.DSH_META_EVOLVE_HOST ?? 'http://127.0.0.1:3083').replace(/\/+$/, '')
const PLUGINS_ROOT = join(PKG, '..')
const EXPECTED_WORKSPACE = resolve(PKG, '..', '..', 'profiles-tree', 'personal-dev', 'dsh-meta-evolve_INIT_WORKSPACE')

/**
 * THE READ BOUND THE DEPLOYMENT ACTUALLY USES, AND WHY THIS HARNESS MUST USE IT TOO.
 *
 * `workspace.ts:365` defaults `timeoutMs` to 5,000 ms, and THIS HARNESS USED TO INHERIT
 * THAT DEFAULT by calling `makeHarness({})`. The deployment does not: the profile row
 * raises the bound to 60,000 ms (`personal-dev/cordis.patch.yml:701-703`, chosen because
 * the 5,000 ms default timed out on a live append-only log that only grows).
 *
 * The consequence was two FALSE REDS. `/intent-map/api/map` answers in 6.1-10.2 s
 * (measured 2026-10-22, 8 sequential live reads, HTTP 200 every time), so under a
 * 5,000 ms bound checks `B4` and `B6` failed with `timed out after 5000ms` while the
 * plugin and the route were both healthy. A harness that verifies a configuration
 * nobody deploys publishes reds about its own framing. So this harness now imposes the
 * DEPLOYED bound, and `B0b` below measures the live latency and requires the bound to
 * exceed it — a check that goes red if the dependency ever outgrows the deployment's
 * own bound, rather than silently reporting the plugin as broken.
 */
const DEPLOYED_TIMEOUT_MS = 60_000

/* ------------------------------------------------------------------------- */
/* Harness plumbing                                                          */
/* ------------------------------------------------------------------------- */

const results = []
const mutations = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/**
 * Run one check. A thrown Error is the ONLY way a check fails; a check that is
 * never registered cannot pass, and the verdict prints the population so a
 * missing check is visible as a short denominator rather than a green total.
 */
async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? null })
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
  }
}

/** One HTTP request against a harness, with a timeout so a hang is a failure, not a stall. */
async function request(base, path, options = {}) {
  const { method = 'GET', timeout = 20_000 } = options
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(timeout) })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { status: response.status, headers: response.headers, text, body }
}

/**
 * Start the BUILT plugin behind a real node:http server.
 *
 * The context is the one the package declares in `src/types.ts`: `webServer`,
 * `logger` and `effect`. `effect` runs the registration callback immediately, as
 * the host does during apply.
 */
async function makeHarness(config) {
  const pkg = await import(pathToFileURL(LIB).href)
  const routes = new Map()
  const logs = []
  const disposers = []
  const ctx = {
    webServer: {
      register(route) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
    logger: {
      info: (...args) => logs.push(['info', args.map(String).join(' ')]),
      warn: (...args) => logs.push(['warn', args.map(String).join(' ')]),
    },
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
  }
  pkg.apply(ctx, config.timeoutMs === undefined ? { timeoutMs: DEPLOYED_TIMEOUT_MS, ...config } : config)
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const route = routes.get(pathname)
    if (route === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'no such route' }))
      return
    }
    Promise.resolve(route.handler(req, res)).catch(() => {
      try {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'handler threw' }))
      } catch {
        /* response already gone */
      }
    })
  })
  await new Promise((listening, rejected) => {
    server.once('error', rejected)
    server.listen(0, '127.0.0.1', listening)
  })
  const address = server.address()
  const base = `http://127.0.0.1:${address.port}`
  return {
    base,
    pkg,
    routes,
    logs,
    async close() {
      for (const dispose of disposers) dispose()
      await new Promise((closed) => server.close(closed))
    },
  }
}

/** A port that was open a moment ago and is now closed, with a positive control that it refuses. */
async function closedPort() {
  const probe = createServer()
  await new Promise((listening) => probe.listen(0, '127.0.0.1', listening))
  const port = probe.address().port
  await new Promise((closed) => probe.close(closed))
  let refused = false
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) })
  } catch {
    refused = true
  }
  if (!refused) throw new Error(`control failed: port ${port} still answers after close, so the dead-host mutation would be measuring a live socket`)
  return port
}

/** Recursively list files under `dir`. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.isFile()) out.push(path)
  }
  return out
}

/** The independent intent-field parse this harness compares the route against. */
function parseIntentField(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const rows = []
  for (const document of parsed.documents ?? []) {
    for (const row of document.rows ?? []) rows.push(row)
  }
  const byValue = {}
  for (const row of rows) byValue[String(row.value)] = (byValue[String(row.value)] ?? 0) + 1
  return { rows: rows.length, byValue, declaredRows: parsed.counts?.rowsTotal ?? null }
}

/** Independent directory census of `plugins-src/`: directories only, never a listing length. */
function parsePlugins(root) {
  const directories = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const names = directories.filter((name) => name.startsWith('dsh-meta-')).sort()
  return { names, directories: directories.length }
}

/** The raw byte count of CR (0x0d) — not a pattern count, which this program has measured to lie. */
function crBytes(file) {
  const buffer = readFileSync(file)
  let count = 0
  for (const byte of buffer) if (byte === 0x0d) count += 1
  return count
}

/* ------------------------------------------------------------------------- */
/* Delta comparison — an independent implementation, used to check the delta  */
/* ------------------------------------------------------------------------- */

function prefixOf(key) {
  return key.split('.')[0]
}

function sideValue(counts, readable, key) {
  if (Object.prototype.hasOwnProperty.call(counts, key)) return counts[key] ?? null
  return readable[prefixOf(key)] === true ? 0 : null
}

function compareSets(previous, now, keyOf) {
  if (previous === null || now === null) return { appeared: null, disappeared: null }
  const previousKeys = new Set(previous.map(keyOf))
  const nowKeys = new Set(now.map(keyOf))
  return {
    appeared: now.filter((entry) => !previousKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
    disappeared: previous.filter((entry) => !nowKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
  }
}

function canonicalRows(rows) {
  if (rows === null) return null
  return [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => ({ id: row.id, value: row.value }))
}

/**
 * Recompute, from the fixture and the round the control recorded, everything the
 * delta SHOULD say, and compare it key by key.
 *
 * @returns `{ ok, problems }`; `problems` names the first mismatches so a RED
 *          result says what disagreed instead of only that something did.
 */
function deltaMatches(actual, fixture, round) {
  if (actual === null) return { ok: false, problems: ['delta is null'] }
  const problems = []

  const keys = [...new Set([...Object.keys(fixture.counts), ...Object.keys(round.counts)])].sort()
  const expectedUnavailable = new Set()
  const expectedMoved = []
  for (const key of keys) {
    const from = sideValue(fixture.counts, fixture.fieldReadable, key)
    const to = sideValue(round.counts, round.fieldReadable, key)
    const got = actual.counts?.[key]
    if (got === undefined) {
      problems.push(`count ${key} is missing from the delta`)
      expectedUnavailable.add(`counts.${key}`)
      continue
    }
    const wantedDelta = from === null || to === null ? null : to - from
    if (got.from !== from || got.to !== to || got.delta !== wantedDelta) {
      problems.push(`count ${key}: expected ${JSON.stringify({ from, to, delta: wantedDelta })}, got ${JSON.stringify({ from: got.from, to: got.to, delta: got.delta })}`)
    }
    if ((wantedDelta === null) !== (got.reason !== null)) {
      problems.push(`count ${key}: reason presence does not match comparability (delta=${String(got.delta)})`)
    }
    if (wantedDelta === null) {
      expectedUnavailable.add(`counts.${key}`)
    } else if (wantedDelta !== 0) {
      expectedMoved.push({ key, from, to, delta: wantedDelta })
    }
  }

  const gotMoved = (actual.moved ?? []).map((entry) => ({ key: entry.key, from: entry.from, to: entry.to, delta: entry.delta }))
  gotMoved.sort((a, b) => a.key.localeCompare(b.key))
  if (JSON.stringify(gotMoved) !== JSON.stringify(expectedMoved)) {
    problems.push(`moved: expected ${JSON.stringify(expectedMoved)}, got ${JSON.stringify(gotMoved)}`)
  }
  if (actual.movedOf?.checked !== keys.length) {
    problems.push(`movedOf.checked: expected ${keys.length}, got ${String(actual.movedOf?.checked)}`)
  }
  if (actual.movedOf?.moved !== expectedMoved.length) {
    problems.push(`movedOf.moved: expected ${expectedMoved.length}, got ${String(actual.movedOf?.moved)}`)
  }
  if (actual.movedOf?.uncompared !== expectedUnavailable.size) {
    problems.push(`movedOf.uncompared: expected ${expectedUnavailable.size}, got ${String(actual.movedOf?.uncompared)}`)
  }

  for (const [field, keyOf] of [
    ['decisions', (entry) => entry],
    ['plugins', (entry) => entry],
    ['intentRows', (entry) => entry.id],
  ]) {
    const previous = fixture.ids?.[field] ?? null
    const now = round.ids?.[field] ?? null
    const wanted = compareSets(previous, now, keyOf)
    const gotAppeared = field === 'intentRows' ? canonicalRows(actual.appeared?.[field] ?? null) : actual.appeared?.[field] ?? null
    const gotDisappeared = field === 'intentRows' ? canonicalRows(actual.disappeared?.[field] ?? null) : actual.disappeared?.[field] ?? null
    const wantedAppeared = field === 'intentRows' ? canonicalRows(wanted.appeared) : wanted.appeared
    const wantedDisappeared = field === 'intentRows' ? canonicalRows(wanted.disappeared) : wanted.disappeared
    if (JSON.stringify(gotAppeared) !== JSON.stringify(wantedAppeared)) {
      problems.push(`appeared.${field}: expected ${JSON.stringify(wantedAppeared)}, got ${JSON.stringify(gotAppeared)}`)
    }
    if (JSON.stringify(gotDisappeared) !== JSON.stringify(wantedDisappeared)) {
      problems.push(`disappeared.${field}: expected ${JSON.stringify(wantedDisappeared)}, got ${JSON.stringify(gotDisappeared)}`)
    }
    const wantedPrevious = previous === null ? null : previous.length
    const wantedNow = now === null ? null : now.length
    if (actual.denominators?.[field]?.previous !== wantedPrevious || actual.denominators?.[field]?.now !== wantedNow) {
      problems.push(`denominators.${field}: expected ${JSON.stringify({ previous: wantedPrevious, now: wantedNow })}, got ${JSON.stringify(actual.denominators?.[field])}`)
    }
    if (previous === null || now === null) expectedUnavailable.add(`ids.${field}`)
  }

  let wantedChanged = null
  if (fixture.ids?.intentRows !== null && round.ids?.intentRows !== null) {
    const before = new Map((fixture.ids?.intentRows ?? []).map((row) => [row.id, row.value]))
    wantedChanged = (round.ids?.intentRows ?? [])
      .filter((row) => before.has(row.id) && before.get(row.id) !== row.value)
      .map((row) => ({ id: row.id, from: before.get(row.id), to: row.value }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  if (JSON.stringify(actual.changed?.intentRows ?? null) !== JSON.stringify(wantedChanged)) {
    problems.push(`changed.intentRows: expected ${JSON.stringify(wantedChanged)}, got ${JSON.stringify(actual.changed?.intentRows ?? null)}`)
  }

  const gotUnavailable = Object.keys(actual.unavailable ?? {}).sort()
  const wantedUnavailable = [...expectedUnavailable].sort()
  if (JSON.stringify(gotUnavailable) !== JSON.stringify(wantedUnavailable)) {
    problems.push(`unavailable keys: expected ${JSON.stringify(wantedUnavailable)}, got ${JSON.stringify(gotUnavailable)}`)
  }

  return { ok: problems.length === 0, problems }
}

/* ------------------------------------------------------------------------- */
/* Main                                                                      */
/* ------------------------------------------------------------------------- */

async function main() {
  /* --- Fatal preflight: no artifact, or a stale one, and no live host ------ */
  if (!existsSync(LIB)) {
    console.error(`FATAL: ${LIB} does not exist. Run "pnpm run build" first; this harness verifies the BUILT artifact.`)
    process.exitCode = 1
    return
  }
  let pkg
  try {
    pkg = await import(pathToFileURL(LIB).href)
  } catch (error) {
    console.error(`FATAL: ${LIB} could not be imported: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  const { STATE_PATH, EVOLVE_PATH, ROUNDS_PATH, BEAM_ROUNDS_PATH, ROUTE_PATHS } = pkg
  for (const [name, value] of Object.entries({ STATE_PATH, EVOLVE_PATH, ROUNDS_PATH, BEAM_ROUNDS_PATH, ROUTE_PATHS })) {
    if (value === undefined) {
      console.error(`FATAL: the built artifact does not export ${name}`)
      process.exitCode = 1
      return
    }
  }

  // The client half is another lane's live work and is not what this harness verifies, so the
  // staleness subject is the HOST sources: a newer client file cannot make lib/index.js stale.
  const hostSources = walk(join(PKG, 'src')).filter((file) => !file.startsWith(join(PKG, 'src', 'client')))
  await check('preflight: lib/index.js is newer than every Host source file (a stale build is not verified)', () => {
    const libTime = statSync(LIB).mtimeMs
    const stale = hostSources.filter((file) => statSync(file).mtimeMs > libTime + 1)
    assert(stale.length === 0, `stale build: ${stale.length} Host source file(s) newer than lib/index.js, first=${stale[0]}. Run "pnpm run build".`)
    return `${hostSources.length} Host source files older than lib/index.js`
  })

  const liveProbe = await request(LIVE, '/lvl1-gate/api/status', { timeout: 8_000 }).catch((error) => ({ status: 0, body: null, error }))
  await check(`preflight: the live host ${LIVE} answers (a dead host would make the equalities compare two non-answers)`, () => {
    assert(liveProbe.status === 200, `GET ${LIVE}/lvl1-gate/api/status returned ${liveProbe.status}; this harness requires the running host`)
    return `status ${liveProbe.status}`
  })

  /* --- A. Registration and envelope -------------------------------------- */
  const host = await makeHarness({})
  const tempDirs = []
  const tempDir = (label) => {
    const dir = mkdtempSync(join(tmpdir(), `meta-evolve-verify-${label}-`))
    tempDirs.push(dir)
    return dir
  }

  await check('A1 registration: exactly the advertised paths are registered', async () => {
    assert(host.routes.size === ROUTE_PATHS.length, `registered ${host.routes.size} route(s), advertised ${ROUTE_PATHS.length}: ${[...host.routes.keys()].join(', ')}`)
    for (const path of ROUTE_PATHS) assert(host.routes.has(path), `advertised path ${path} is not registered`)
    return `${host.routes.size} routes = ${ROUTE_PATHS.length} advertised`
  })

  await check('A2 advertised paths: every one answers and none returns 404', async () => {
    const evoDir = tempDir('a2')
    const evo = await makeHarness({ roundsFile: join(evoDir, 'rounds.jsonl') })
    try {
      const driven = [
        await request(evo.base, STATE_PATH),
        await request(evo.base, EVOLVE_PATH, { method: 'POST' }),
        await request(evo.base, ROUNDS_PATH),
        // The BEAM read is the fourth advertised path. It is driven here with the
        // rest so a route added to ROUTE_PATHS cannot be advertised and unserved:
        // the count `driven.length === ROUTE_PATHS.length` is what makes this list
        // keep up with the table rather than the table with the list.
        await request(evo.base, BEAM_ROUNDS_PATH),
      ]
      const notServed = driven.filter((row) => row.status === 404)
      assert(driven.length === ROUTE_PATHS.length && driven.length > 0, `drove ${driven.length} advertised paths of ${ROUTE_PATHS.length}`)
      assert(notServed.length === 0, `${notServed.length} advertised path(s) returned 404`)
      return `${driven.length}/${ROUTE_PATHS.length} advertised paths answered; statuses ${driven.map((row) => row.status).join(', ')}`
    } finally {
      await evo.close()
    }
  })

  await check('A3 state envelope: ok:true and all five field slots present', async () => {
    const { status, body } = await request(host.base, STATE_PATH)
    assert(status === 200, `GET ${STATE_PATH} returned ${status}`)
    assert(body?.ok === true, 'state body does not carry ok:true')
    assert(body?.built === true, 'state body does not carry built:true')
    assert(body?.note === 'live', `state note is ${JSON.stringify(body?.note)}, expected "live"`)
    for (const field of ['decisionLog', 'intentField', 'lvl1Gate', 'intentMap', 'plugins', 'unreadable', 'counts', 'countsRead']) {
      assert(field in (body ?? {}), `state body has no ${field} key`)
    }
    assert(Array.isArray(body?.notDone) && body.notDone.length > 0, 'notDone is absent or empty')
    for (const claim of body.notDone) {
      assert(!/\bno plugin in this program\b|\bthe program (does|never)\b/i.test(claim), `notDone claim uses a program-wide quantifier: ${claim}`)
    }
    return `keys ${Object.keys(body).length}; notDone ${body.notDone.length}`
  })

  await check('A4 method honesty: a wrong method is 405 with Allow, not the wrong body', async () => {
    const postState = await request(host.base, STATE_PATH, { method: 'POST' })
    assert(postState.status === 405, `POST ${STATE_PATH} returned ${postState.status}, expected 405`)
    assert((postState.headers.get('allow') ?? '').includes('GET'), `405 from ${STATE_PATH} does not allow GET: ${postState.headers.get('allow')}`)
    const getEvolve = await request(host.base, EVOLVE_PATH)
    assert(getEvolve.status === 405, `GET ${EVOLVE_PATH} returned ${getEvolve.status}, expected 405`)
    assert((getEvolve.headers.get('allow') ?? '').includes('POST'), `405 from ${EVOLVE_PATH} does not allow POST: ${getEvolve.headers.get('allow')}`)
    const deleteRounds = await request(host.base, ROUNDS_PATH, { method: 'DELETE' })
    assert(deleteRounds.status === 405, `DELETE ${ROUNDS_PATH} returned ${deleteRounds.status}, expected 405`)
    return `state 405/GET, evolve 405/POST, rounds 405/GET`
  })

  await check('A5 an unknown path is 404 and no prefix registration can swallow it', async () => {
    const { status } = await request(host.base, '/meta-evolve/api/nope')
    assert(status === 404, `unknown path returned ${status}, expected 404`)
    // The package registers exact paths only. A prefix registration would make every unknown
    // subpath reach the plugin, which is how an advertised map drifts away from what is served.
    const kinds = [...host.routes.values()].map((route) => route.kind)
    assert(kinds.every((kind) => kind === 'exact'), `non-exact registration(s): ${kinds.join(', ')}`)
    return `unknown path 404; ${kinds.length} exact registrations, 0 prefix`
  })

  /* --- B. Live values, each against an independent reading --------------- */
  const stateRead = await request(host.base, STATE_PATH)
  const state = stateRead.body

  await check('B0 provenance: host, workspace, plugins root and rounds file resolve to the measured locations', () => {
    assert(state?.host === LIVE, `state.host is ${JSON.stringify(state?.host)}, expected ${LIVE}`)
    assert(state?.workspace?.path === EXPECTED_WORKSPACE, `state.workspace is ${JSON.stringify(state?.workspace)}, expected ${EXPECTED_WORKSPACE}`)
    assert(state?.pluginsRoot?.path === PLUGINS_ROOT, `state.pluginsRoot is ${JSON.stringify(state?.pluginsRoot)}, expected ${PLUGINS_ROOT}`)
    assert(typeof state?.roundsFile?.path === 'string' && state.roundsFile.path.endsWith(join('research', 'meta-evolve-rounds.jsonl')), `state.roundsFile is ${JSON.stringify(state?.roundsFile)}`)
    return `workspace from ${state.workspace.from}; plugins from ${state.pluginsRoot.from}; rounds from ${state.roundsFile.from}`
  })

  await check('B0b the harness reads with the DEPLOYED bound, and the bound exceeds the measured latency', async () => {
    const started = Date.now()
    const map = await request(LIVE, '/intent-map/api/map', { timeout: DEPLOYED_TIMEOUT_MS })
    const elapsed = Date.now() - started
    assert(map.status === 200, `independent intent-map read returned ${map.status}`)
    assert(DEPLOYED_TIMEOUT_MS > elapsed, `the harness bound ${DEPLOYED_TIMEOUT_MS} ms does not exceed the measured intent-map latency ${elapsed} ms; the deployment is misconfigured for its own dependency`)
    assert(elapsed > 0, 'the latency measurement is not a measurement')
    return `intent-map answered in ${elapsed} ms; harness bound ${DEPLOYED_TIMEOUT_MS} ms (deployed row: personal-dev/cordis.patch.yml:701-703)`
  })

  await check('B1 decisionLog: identity holds, counts sandwich two independent live reads', async () => {
    const before = await request(LIVE, '/decision-log/api/list')
    assert(before.status === 200, `independent before-read returned ${before.status}`)
    const after = await request(host.base, STATE_PATH) // re-read state between the two independent reads
    const field = after.body?.decisionLog ?? state?.decisionLog
    assert(field !== null && field !== undefined, `decisionLog is ${JSON.stringify(field)} with reason ${state?.unreadable?.decisionLog}`)
    assert(field.of === field.total, `decisionLog.of is ${field.of}, total is ${field.total}`)
    assert(field.active + field.superseded === field.total, `active ${field.active} + superseded ${field.superseded} != total ${field.total}`)
    assert(field.sumsToTotal === true, 'decisionLog.sumsToTotal is not true')
    const directAfter = await request(LIVE, '/decision-log/api/list')
    const beforeTotal = before.body.census.decisions
    const afterTotal = directAfter.body.census.decisions
    assert(field.total >= beforeTotal && field.total <= afterTotal, `decisionLog.total ${field.total} is outside the live range [${beforeTotal}, ${afterTotal}]`)
    assert(typeof field.censusAt === 'string', 'decisionLog.censusAt is not a string')
    return `total ${field.total} (active ${field.active} + superseded ${field.superseded}) of ${field.of}; live range [${beforeTotal}, ${afterTotal}]`
  })

  await check('B2 intentField: rows and byValue match an independent parse of field.json', () => {
    const field = state?.intentField
    assert(field !== null && field !== undefined, `intentField is ${JSON.stringify(field)} with reason ${state?.unreadable?.intentField}`)
    const file = join(EXPECTED_WORKSPACE, 'plan', 'intent-field', 'field.json')
    assert(existsSync(file), `${file} does not exist`)
    const independent = parseIntentField(file)
    assert(field.rows === independent.rows, `rows ${field.rows} != independently parsed ${independent.rows}`)
    assert(field.of === field.rows, `of ${field.of} != rows ${field.rows}`)
    assert(field.rowsMatchDeclared === (independent.declaredRows === independent.rows), `rowsMatchDeclared ${String(field.rowsMatchDeclared)} disagrees with independent comparison ${independent.declaredRows} vs ${independent.rows}`)
    const sortedEntries = (value) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
    assert(sortedEntries(field.byValue) === sortedEntries(independent.byValue), `byValue ${sortedEntries(field.byValue)} != independent ${sortedEntries(independent.byValue)}`)
    const sum = Object.values(field.byValue).reduce((total, value) => total + value, 0)
    assert(sum === field.byValueOf, `byValue sums to ${sum}, byValueOf is ${field.byValueOf}`)
    assert(field.byValueOf === field.rows - field.rowsWithoutValue, `byValueOf ${field.byValueOf} != rows ${field.rows} - rowsWithoutValue ${field.rowsWithoutValue}`)
    return `rows ${field.rows}/${field.of}; byValue ${Object.keys(field.byValue).length} buckets, ${sum}/${field.byValueOf}; ${field.bytes} B; generated ${field.generatedAt}`
  })

  await check('B3 lvl1Gate: outcomes sum to sessions and the live status/sessions agree', async () => {
    const field = state?.lvl1Gate
    assert(field !== null && field !== undefined, `lvl1Gate is ${JSON.stringify(field)} with reason ${state?.unreadable?.lvl1Gate}`)
    const status = await request(LIVE, '/lvl1-gate/api/status')
    const sessions = await request(LIVE, '/lvl1-gate/api/sessions')
    assert(status.status === 200 && sessions.status === 200, `independent reads returned ${status.status}/${sessions.status}`)
    // THE CENSUS WHOSE DENOMINATOR IS `count` IS `historyCensus`, NOT `outcomeCensus`.
    // `outcomeCensus` is in-process-only for this boot, and pairing it with the MERGED
    // `count` is the defect this check now exists to catch: the check FAILS if the field
    // ever goes back to summing a population of 1 over a denominator of 21.
    const merged = sessions.body.historyCensus
    const inProcess = sessions.body.outcomeCensus
    const mergedSum = merged.decided + merged.declined + merged.neverRan
    assert(mergedSum === sessions.body.count, `live historyCensus sums to ${mergedSum} but count is ${sessions.body.count}`)
    assert(field.sessions === sessions.body.count, `sessions ${field.sessions} != live count ${sessions.body.count}`)
    assert(field.outcomesOf === field.sessions, `outcomesOf ${field.outcomesOf} != sessions ${field.sessions}`)
    assert(field.sumsToOutcomes === true, `sumsToOutcomes is ${JSON.stringify(field.sumsToOutcomes)}: outcomes ${JSON.stringify(field.outcomes)} do not sum to outcomesOf ${field.outcomesOf}`)
    assert(field.outcomes.decided === merged.decided && field.outcomes.declined === merged.declined && field.outcomes.neverRan === merged.neverRan, `outcomes ${JSON.stringify(field.outcomes)} != live historyCensus ${JSON.stringify(merged)} — the field is reading the WRONG census`)
    assert(field.inProcessOutcomes !== null && field.inProcessOutcomes.decided === inProcess.decided && field.inProcessOutcomes.neverRan === inProcess.neverRan, `inProcessOutcomes ${JSON.stringify(field.inProcessOutcomes)} != live outcomeCensus ${JSON.stringify(inProcess)}`)
    assert(typeof field.outcomesBasis === 'string' && /merged/i.test(field.outcomesBasis), `outcomesBasis ${JSON.stringify(field.outcomesBasis)} does not name the merged population`)
    assert(field.sessionsAgree === (status.body.sessionCount === sessions.body.count), `sessionsAgree ${String(field.sessionsAgree)} disagrees with ${String(status.body.sessionCount)} vs ${String(sessions.body.count)}`)
    assert(field.hooked === status.body.hooked, `hooked ${field.hooked} != live ${status.body.hooked}`)
    assert(field.runs === status.body.runs, `runs ${field.runs} != live ${status.body.runs}`)
    return `hooked ${field.hooked}, runs ${field.runs}, sessions ${field.sessions}; merged outcomes ${field.outcomes.decided}/${field.outcomes.declined}/${field.outcomes.neverRan} of ${field.outcomesOf} (sums ${field.sumsToOutcomes}); in-process ${JSON.stringify(field.inProcessOutcomes)} of ${field.inProcessOutcomesOf}; last ${field.last?.outcome}`
  })

  await check('B4 intentMap: zones, model and dim match an independent live read', async () => {
    const field = state?.intentMap
    assert(field !== null && field !== undefined, `intentMap is ${JSON.stringify(field)} with reason ${state?.unreadable?.intentMap}`)
    const map = await request(LIVE, '/intent-map/api/map')
    assert(map.status === 200, `independent intent-map read returned ${map.status}`)
    assert(field.zones === map.body.corpus.zones.count, `zones ${field.zones} != live ${map.body.corpus.zones.count}`)
    assert(field.of === map.body.corpus.zones.of, `of ${field.of} != live ${map.body.corpus.zones.of}`)
    assert(field.model === map.body.index.identity.model, `model ${field.model} != live ${map.body.index.identity.model}`)
    assert(field.dim === map.body.index.identity.dim, `dim ${field.dim} != live ${map.body.index.identity.dim}`)
    assert(field.zonesMatch === (map.body.zones.length === map.body.corpus.zones.count), `zonesMatch ${String(field.zonesMatch)} disagrees with the live list length ${map.body.zones.length}`)
    return `zones ${field.zones}/${field.of}; model ${field.model}; dim ${field.dim}; corpus ${field.corpusPlugins}/${field.corpusOf}`
  })

  await check('B5 plugins: count and names match an independent directory census', () => {
    const field = state?.plugins
    assert(field !== null && field !== undefined, `plugins is ${JSON.stringify(field)} with reason ${state?.unreadable?.plugins}`)
    const independent = parsePlugins(PLUGINS_ROOT)
    assert(field.root === PLUGINS_ROOT, `plugins.root ${field.root} != ${PLUGINS_ROOT}`)
    assert(field.of === independent.directories, `of ${field.of} != ${independent.directories} directories under ${PLUGINS_ROOT}`)
    assert(JSON.stringify(field.names) === JSON.stringify(independent.names), `names ${JSON.stringify(field.names)} != independent ${JSON.stringify(independent.names)}`)
    assert(field.count === field.names.length, `count ${field.count} != names ${field.names.length}`)
    return `${field.count}/${field.of} directories: ${field.names.join(', ')}`
  })

  await check('B6 counts: every count carries its denominator and none is silently dropped', () => {
    assert(state?.unreadable !== null && typeof state.unreadable === 'object', 'unreadable is not an object')
    assert(Object.keys(state.unreadable).length === 0, `healthy state reports unreadable: ${JSON.stringify(state.unreadable)}`)
    const keys = Object.keys(state?.counts ?? {})
    assert(keys.length === state?.countsRead?.of, `counts has ${keys.length} keys but countsRead.of is ${String(state?.countsRead?.of)}`)
    assert(state?.countsRead?.read === state?.countsRead?.of, `countsRead ${JSON.stringify(state?.countsRead)} is not full in a healthy state`)
    for (const key of keys) assert(typeof state.counts[key] === 'number', `count ${key} is ${JSON.stringify(state.counts[key])}, not a number`)
    return `${state.countsRead.read}/${state.countsRead.of} counts read`
  })

  await check('B7 serialisation: collections survived JSON.stringify as collections, not {}', () => {
    assert(Array.isArray(state?.plugins?.names) && state.plugins.names.length > 0, 'plugins.names is not a non-empty array after serialisation')
    assert(Array.isArray(state?.lvl1Gate?.revisions), 'lvl1Gate.revisions is not an array after serialisation')
    assert(Object.keys(state?.lvl1Gate?.outcomes ?? {}).length === 3, 'lvl1Gate.outcomes lost its three members in serialisation')
    assert(Object.keys(state?.intentField?.byValue ?? {}).length > 0, 'intentField.byValue is empty after serialisation')
    assert(Array.isArray(state?.notDone), 'notDone is not an array after serialisation')
    return 'arrays and records round-tripped'
  })

  /* --- C. Mutation 1: dead host port ------------------------------------- */
  await check('C0 mutation control: the closed port actually refuses connections', async () => {
    const port = await closedPort()
    mutations.push({ name: 'dead-host-port', detail: `127.0.0.1:${port} refused after close` })
    return `127.0.0.1:${port} refused`
  })

  const port = await closedPort().catch(() => null)
  const deadHost = await makeHarness({ hostUrl: `http://127.0.0.1:${port ?? 9}`, timeoutMs: 1_000 })
  try {
    await check('C1 mutation (dead port): state still answers ok:true — an unreadable source is a readable state', async () => {
      const { status, body } = await request(deadHost.base, STATE_PATH)
      assert(status === 200, `state returned ${status} with a dead host, expected 200`)
      assert(body?.ok === true, 'state body does not carry ok:true with a dead host')
      return `status ${status}`
    })

    await check('C2 mutation (dead port): the three HTTP fields are null WITH A REASON, never zero', async () => {
      const { body } = await request(deadHost.base, STATE_PATH)
      for (const field of ['decisionLog', 'lvl1Gate', 'intentMap']) {
        assert(body?.[field] === null, `${field} is ${JSON.stringify(body?.[field])}, expected null when the source is dead`)
        assert(typeof body?.unreadable?.[field] === 'string' && body.unreadable[field].length > 0, `${field} has no reason in unreadable: ${JSON.stringify(body?.unreadable?.[field])}`)
        assert(/refused|fetch failed|ECONNREFUSED|timed out|HTTP \d/.test(body.unreadable[field]), `${field} reason does not name a connection failure: ${body.unreadable[field]}`)
      }
      for (const key of ['decisionLog.total', 'decisionLog.active', 'decisionLog.superseded', 'lvl1Gate.runs', 'intentMap.zones']) {
        assert(body?.counts?.[key] === null, `count ${key} is ${JSON.stringify(body?.counts?.[key])}, expected null — a dead source must not become 0`)
      }
      assert(body?.decisionLog !== 0 && body?.lvl1Gate !== 0 && body?.intentMap !== 0, 'a dead source was reported as the number 0')
      assert(body?.countsRead?.read < body?.countsRead?.of, `countsRead ${JSON.stringify(body?.countsRead)} claims a full read with three dead sources`)
      return `null+reason for 3 fields; countsRead ${body.countsRead.read}/${body.countsRead.of}; e.g. ${body.unreadable.decisionLog.slice(0, 80)}`
    })

    await check('C3 mutation (dead port): the failure is scoped — the two disk fields stay readable', async () => {
      const { body } = await request(deadHost.base, STATE_PATH)
      assert(body?.intentField !== null, `intentField is null with a dead HTTP host: ${JSON.stringify(body?.unreadable?.intentField)}`)
      assert(body?.plugins !== null, `plugins is null with a dead HTTP host: ${JSON.stringify(body?.unreadable?.plugins)}`)
      return `intentField rows ${body.intentField.rows}; plugins ${body.plugins.count}/${body.plugins.of}`
    })

    await check('C4 mutation (dead port): two evolve rounds record null comparisons, not all-disappeared', async () => {
      const dir = tempDir('dead')
      const evo = await makeHarness({ hostUrl: `http://127.0.0.1:${port ?? 9}`, timeoutMs: 1_000, roundsFile: join(dir, 'rounds.jsonl') })
      try {
        const first = await request(evo.base, EVOLVE_PATH, { method: 'POST' })
        assert(first.status === 200 && first.body?.round?.n === 1, `first evolve returned ${first.status} n=${first.body?.round?.n}`)
        assert(first.body.round.delta === null && first.body.round.deltaReason === 'first round', 'first round delta is not null/"first round"')
        const second = await request(evo.base, EVOLVE_PATH, { method: 'POST' })
        assert(second.status === 200 && second.body?.round?.n === 2, `second evolve returned ${second.status} n=${second.body?.round?.n}`)
        const delta = second.body.round.delta
        const comparison = delta.counts['decisionLog.total']
        assert(comparison.from === null && comparison.to === null && comparison.delta === null && typeof comparison.reason === 'string', `dead-source count comparison is ${JSON.stringify(comparison)}`)
        assert(delta.appeared.decisions === null && delta.disappeared.decisions === null, 'dead-source id sets are not null')
        assert(typeof delta.unavailable['ids.decisions'] === 'string', `unavailable has no ids.decisions reason: ${JSON.stringify(delta.unavailable)}`)
        assert(second.body.verification?.verified === true, 'the appended round was not verified by re-reading the file')
        return `round 2 delta: count null with reason; ids null; unavailable ${Object.keys(delta.unavailable).length} keys`
      } finally {
        await evo.close()
      }
    })
  } finally {
    await deadHost.close()
  }

  /* --- D. Mutation 2: unreadable intent field ---------------------------- */
  const emptyWorkspace = tempDir('empty-workspace')
  const emptyHost = await makeHarness({ workspace: emptyWorkspace, roundsFile: join(emptyWorkspace, 'rounds.jsonl') })
  try {
    await check('D1 mutation (unreadable workspace): intentField is null with a reason naming the file', async () => {
      const { body } = await request(emptyHost.base, STATE_PATH)
      assert(body?.intentField === null, `intentField is ${JSON.stringify(body?.intentField)} for a workspace with no field.json`)
      const reason = body?.unreadable?.intentField
      assert(typeof reason === 'string' && reason.includes('field.json'), `reason does not name field.json: ${JSON.stringify(reason)}`)
      assert(body?.counts?.['intentField.rows'] === null, 'intentField.rows is not null for an unreadable field')
      return reason.slice(0, 140)
    })

    await check('D2 mutation (unreadable workspace): the HTTP and plugin fields stay readable', async () => {
      const { body } = await request(emptyHost.base, STATE_PATH)
      assert(body?.decisionLog !== null, `decisionLog is null: ${JSON.stringify(body?.unreadable?.decisionLog)}`)
      assert(body?.plugins !== null, `plugins is null: ${JSON.stringify(body?.unreadable?.plugins)}`)
      return `decisionLog total ${body.decisionLog.total}; plugins ${body.plugins.count}/${body.plugins.of}`
    })

    await check('D3 mutation (unreadable workspace): the round records the unreadable field', async () => {
      const { body } = await request(emptyHost.base, EVOLVE_PATH, { method: 'POST' })
      assert(body?.round?.delta === null && body.round.deltaReason === 'first round', 'first round delta is not null/"first round"')
      assert(body.round.unreadable?.intentField !== undefined, `round.unreadable has no intentField: ${JSON.stringify(body.round.unreadable)}`)
      assert(body.round.counts['intentField.rows'] === null, `round counts intentField.rows is ${JSON.stringify(body.round.counts['intentField.rows'])}`)
      return `round ${body.round.n}: unreadable ${Object.keys(body.round.unreadable).join(',')}`
    })
  } finally {
    await emptyHost.close()
  }

  /* --- E. The control: rounds change, and the delta is the difference ----- */
  const evolveDir = tempDir('evolve')
  const roundsFile = join(evolveDir, 'rounds.jsonl')
  const evolveHost = await makeHarness({ roundsFile })
  try {
    await check('E1 first round: delta null with reason "first round", and the file gained exactly one line', async () => {
      assert(!existsSync(roundsFile), `the temp rounds file already exists before the first round: ${roundsFile}`)
      const { status, body } = await request(evolveHost.base, EVOLVE_PATH, { method: 'POST' })
      assert(status === 200 && body?.ok === true, `first evolve returned ${status} ${body?.error ?? ''}`)
      assert(body.round.n === 1, `first round n is ${body.round.n}`)
      assert(body.round.delta === null, `first round delta is ${JSON.stringify(body.round.delta)}, expected null`)
      assert(body.round.deltaReason === 'first round', `first round deltaReason is ${JSON.stringify(body.round.deltaReason)}`)
      assert(body.before.lines === 0 && body.change.linesDelta === 1 && body.stored.lines === 1, `file change ${JSON.stringify({ before: body.before.lines, stored: body.stored.lines, change: body.change })}`)
      assert(body.verification?.verified === true, 'the write was not verified by re-reading the file')
      assert(existsSync(roundsFile), 'the rounds file was not created')
      const text = readFileSync(roundsFile, 'utf8')
      assert(text.split('\n').length - 1 === 1, `file holds ${text.split('\n').length - 1} lines, expected 1`)
      assert(text.endsWith('\n'), 'the file does not end with a newline')
      assert(crBytes(roundsFile) === 0, 'the file contains CR bytes; JSONL here is LF only')
      const storedLine = JSON.parse(text.trimEnd())
      assert(JSON.stringify(storedLine) === JSON.stringify(body.round), 'the stored line and the returned round are not the same record')
      return `n=1 delta=null reason=first round; file 1 line, ${Buffer.byteLength(text)} B, 0 CR`
    })

    await check('E2 second round: delta is computed against round 1 and every count moves by to-from', async () => {
      const { status, body } = await request(evolveHost.base, EVOLVE_PATH, { method: 'POST' })
      assert(status === 200 && body?.ok === true, `second evolve returned ${status}`)
      assert(body.round.n === 2, `second round n is ${body.round.n}`)
      assert(body.round.delta !== null && body.round.delta.against === 1, `second delta is ${JSON.stringify(body.round.delta?.against)} against`)
      const comparisons = Object.values(body.round.delta.counts)
      for (const key of Object.keys(body.round.counts)) {
        assert(comparisons.length > 0 && body.round.delta.counts[key] !== undefined, `count ${key} has no comparison in the delta`)
      }
      for (const [key, comparison] of Object.entries(body.round.delta.counts)) {
        if (comparison.from !== null && comparison.to !== null) {
          assert(comparison.delta === comparison.to - comparison.from, `count ${key}: ${comparison.to} - ${comparison.from} != ${comparison.delta}`)
        } else {
          assert(comparison.delta === null && typeof comparison.reason === 'string', `count ${key} is uncomparable but carries no reason`)
        }
      }
      assert(body.before.lines === 1 && body.stored.lines === 2 && body.change.linesDelta === 1, `file change ${JSON.stringify({ before: body.before.lines, stored: body.stored.lines, change: body.change })}`)
      assert(body.verification?.verified === true, 'the second append was not verified by re-reading the file')
      return `n=2 against 1; ${body.round.delta.movedOf.moved} of ${body.round.delta.movedOf.checked} counts moved; file 2 lines`
    })

    await check('E3 mutation (stale fixture): the delta is exactly the difference from a deliberately wrong previous round', async () => {
      const secondRound = JSON.parse(readFileSync(roundsFile, 'utf8').trimEnd().split('\n').pop())
      assert(secondRound.n === 2, `the last stored round is n=${secondRound.n}`)
      assert(secondRound.ids.decisions !== null && secondRound.ids.intentRows !== null && secondRound.ids.plugins !== null, 'round 2 has no comparable id sets to build the fixture from')
      const fixture = structuredClone(secondRound)
      fixture.n = 100
      fixture.at = new Date(Date.now() - 60_000).toISOString()
      const removedDecision = fixture.ids.decisions[0]
      fixture.ids.decisions = fixture.ids.decisions.filter((id) => id !== removedDecision).concat(['D-VERIFY-FAKE'])
      const removedRow = fixture.ids.intentRows[0]
      fixture.ids.intentRows = fixture.ids.intentRows.filter((row) => row.id !== removedRow.id)
      const changedRow = fixture.ids.intentRows[0]
      const changedTo = `verify-changed:${changedRow.value}`
      fixture.ids.intentRows = fixture.ids.intentRows.map((row) => (row.id === changedRow.id ? { id: row.id, value: changedTo } : row))
      fixture.ids.plugins = [...fixture.ids.plugins, 'dsh-meta-verify-fake']
      fixture.counts['decisionLog.total'] = 1
      writeFileSync(roundsFile, `${JSON.stringify(fixture)}\n`, 'utf8')
      const { status, body } = await request(evolveHost.base, EVOLVE_PATH, { method: 'POST' })
      assert(status === 200 && body?.ok === true, `fixture evolve returned ${status}`)
      assert(body.round.n === 101, `round number is ${body.round.n}, expected 101 — the number must follow the previous record, not the line count`)
      assert(body.round.delta.against === 100, `delta.against is ${body.round.delta.against}, expected 100`)
      const verdict = deltaMatches(body.round.delta, fixture, body.round)
      assert(verdict.ok, `delta is not the difference from the fixture: ${verdict.problems.slice(0, 4).join(' | ')}`)
      assert(body.round.delta.appeared.decisions.includes(removedDecision), `appeared.decisions does not include the fixture-removed id ${removedDecision}`)
      assert(body.round.delta.disappeared.decisions.includes('D-VERIFY-FAKE'), 'disappeared.decisions does not include the fixture-only id')
      assert(body.round.delta.disappeared.plugins.includes('dsh-meta-verify-fake'), 'disappeared.plugins does not include the fixture-only plugin')
      assert(body.round.delta.counts['decisionLog.total'].from === 1, `decisionLog.total.from is ${body.round.delta.counts['decisionLog.total'].from}, expected the fixture's 1`)
      assert(body.stored.lines === 2 && body.before.lines === 1, `file change ${JSON.stringify({ before: body.before.lines, stored: body.stored.lines })}`)
      const verdict2 = deltaMatches(body.round.delta, fixture, body.round)
      mutations.push({ name: 'stale-fixture-delta', detail: `${verdict2.problems.length} mismatches against the fixture; appeared ${body.round.delta.appeared.decisions.length}, disappeared ${body.round.delta.disappeared.decisions.length}` })
      return `n=101 against 100; appeared ${body.round.delta.appeared.decisions.length} decision(s), disappeared ${body.round.delta.disappeared.decisions.length}; moved ${body.round.delta.movedOf.moved}/${body.round.delta.movedOf.checked}; file 2 lines`
    })

    await check('E4 falsifiability: the delta assertion reports a mismatch when the delta is mutated', async () => {
      const secondRound = JSON.parse(readFileSync(roundsFile, 'utf8').trimEnd().split('\n').pop())
      const fixture = structuredClone(secondRound)
      fixture.n = 100
      // A wrong fixture: pretend the previous round had no decisions at all.
      fixture.ids.decisions = []
      const verdict = deltaMatches(secondRound.delta ?? {}, fixture, secondRound)
      assert(!verdict.ok, 'the delta assertion could not disagree with a mutated fixture — it is a caption, not a check')
      mutations.push({ name: 'delta-assertion-red', detail: `mutated fixture produced ${verdict.problems.length} mismatch(es)` })
      return `mutated fixture refused: ${verdict.problems[0]}`
    })

    await check('E5 rounds endpoint: newest first, with count, total and line census', async () => {
      const { status, body } = await request(evolveHost.base, ROUNDS_PATH)
      assert(status === 200 && body?.ok === true, `rounds returned ${status}`)
      assert(body.count === 2 && body.total === 2 && body.lines === 2, `count ${body.count}, total ${body.total}, lines ${body.lines}`)
      assert(body.rounds[0].n === 101 && body.rounds[1].n === 100, `order is ${body.rounds.map((round) => round.n).join(',')}, expected 101,100`)
      assert(body.malformedLines === 0, `malformedLines is ${body.malformedLines}`)
      return `${body.count}/${body.total} rounds newest-first: ${body.rounds.map((round) => round.n).join(', ')}`
    })
  } finally {
    await evolveHost.close()
  }

  /* --- F. The verdict ---------------------------------------------------- */
  await check('F1 verdict: the suite exercised real mutations, not only green paths', () => {
    assert(mutations.length >= 3, `only ${mutations.length} mutation control(s) ran; the suite needs at least 3`)
    return `${mutations.length} mutations: ${mutations.map((mutation) => mutation.name).join(', ')}`
  })

  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  await host.close()

  const failed = results.filter((row) => !row.ok)
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.detail === null ? '' : `\n      ${row.detail}`}`)
  }
  console.log('')
  console.log(`MUTATIONS (driven, not asserted): ${mutations.map((mutation) => mutation.name).join(', ')}`)
  console.log(`VERIFY: ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.log(`RESULT: FAIL — ${failed.length} check(s) disagreed`)
    process.exitCode = 1
  } else {
    console.log('RESULT: PASS — every check ran and none disagreed')
    process.exitCode = 0
  }
}

main().catch((error) => {
  console.error(`FATAL: the harness itself threw: ${error instanceof Error ? error.stack : String(error)}`)
  process.exitCode = 1
})
