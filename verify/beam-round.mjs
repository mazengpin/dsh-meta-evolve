#!/usr/bin/env node
/**
 * verify/beam-round.mjs — the BEAM round record, graded rather than described.
 *
 * WHAT THIS HARNESS IS FOR
 *
 * A round may cite the Elixir app's own state, so two claims have to be checkable
 * without trusting a comment:
 *
 *   1. THE ABSENT PATH. A control app that is DOWN must produce
 *      `{unmeasured: reason}` for every field — never `0`. A zero would claim a
 *      BEAM that loaded no modules and served no requests, which is a different
 *      and false reading. The positive control beside it (a fake control app that
 *      ANSWERS) is what makes the absent reading an absence rather than
 *      instrument failure: without it, a capture that could never read anything
 *      would also produce reasons and pass.
 *
 *   2. THE DELTA. Two synthetic rounds with deliberately different BEAM state
 *      must produce the exact differences, including the restart flag. The rounds
 *      are synthetic on purpose: the subject is the comparison, not one app's
 *      uptime, so the fixture states the two readings and the harness holds the
 *      comparison to their arithmetic.
 *
 * PLUS the read route: `GET /meta-evolve/api/rounds/beam` is read from a real
 * rounds file on disk, and a record written BEFORE the beam field existed must
 * report `beam: null` with a reason rather than an unchanged BEAM.
 *
 * TWO MUTATIONS MUST GO RED. A check nothing can fail is a caption, so the two
 * assertions above are re-run against deliberately wrong input and must throw.
 *
 * @module dsh-meta-evolve/verify/beam-round
 */

import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = resolve(HERE, '..')
const LIB = join(PKG, 'lib', 'index.js')

const results = []
const mutations = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? null })
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

/** A stand-in control app: the two routes `Control.HTTP` serves, over a mutable state. */
async function controlHarness(state) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (path === '/api/beam/status') return sendJson(res, 200, state.beam)
    if (path === '/fleet/status') return sendJson(res, 200, state.fleet)
    return sendJson(res, 404, { ok: false, error: 'no such route' })
  })
  await new Promise((listening, rejected) => {
    server.once('error', rejected)
    server.listen(0, '127.0.0.1', listening)
  })
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((closed) => server.close(closed))
    },
  }
}

/** A port that was open a moment ago and is now closed, with a positive control that it refuses. */
async function closedPort() {
  const probe = createServer()
  await new Promise((listening) => probe.listen(0, '127.0.0.1', listening))
  const { port } = probe.address()
  await new Promise((closed) => probe.close(closed))
  let refused = false
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_500) })
  } catch {
    refused = true
  }
  assert(refused, `control failed: port ${port} still answers after close, so "the app is down" would be measuring a live socket`)
  return port
}

/**
 * The absent-path predicate: EVERY field carries a reason and NO field a value.
 *
 * The mutation check below is held to THIS function rather than to a second copy
 * of the rule, so a weakened assertion weakens the mutation with it and the
 * mutation cannot stay green on its own.
 */
function absentViolations(beam, fieldNames) {
  const problems = []
  if (beam === null || typeof beam !== 'object') {
    problems.push('capture returned no beam record at all')
    return problems
  }
  for (const name of fieldNames) {
    const cell = beam.fields?.[name]
    if (cell === undefined) {
      problems.push(`${name} is missing from the capture, which reads as absent rather than as measured`)
    } else if ('value' in cell) {
      problems.push(`${name} carries a VALUE (${String(cell.value)}) while the control app is down`)
    } else if (typeof cell.unmeasured !== 'string' || cell.unmeasured.trim() === '') {
      problems.push(`${name} carries no reason for its absence: ${JSON.stringify(cell)}`)
    }
  }
  if (beam.readings?.read !== 0) {
    problems.push(`readings.read is ${String(beam.readings?.read)}, expected 0 of ${String(beam.readings?.of)}`)
  }
  if (beam.readings?.of !== fieldNames.length) {
    problems.push(`readings.of is ${String(beam.readings?.of)}, expected ${fieldNames.length}`)
  }
  return problems
}

/** The delta predicate: exactly the movements the fixture states, and nothing else. */
function deltaViolations(delta, expected) {
  const problems = []
  if (delta === null || typeof delta !== 'object') {
    problems.push('the delta is null, so nothing was compared')
    return problems
  }
  for (const [key, want] of Object.entries(expected)) {
    const got = delta.fields?.[key]
    if (got === undefined) {
      problems.push(`${key} is missing from the beam delta`)
      continue
    }
    if (got.from !== want.from || got.to !== want.to || got.delta !== want.delta) {
      problems.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify({ from: got.from, to: got.to, delta: got.delta })}`)
    }
  }
  const movedKeys = (delta.moved ?? []).map((entry) => entry.key).sort()
  const wantedKeys = Object.entries(expected)
    .filter(([, want]) => want.delta !== 0 && want.delta !== null)
    .map(([key]) => key)
    .sort()
  if (JSON.stringify(movedKeys) !== JSON.stringify(wantedKeys)) {
    problems.push(`moved keys: expected ${JSON.stringify(wantedKeys)}, got ${JSON.stringify(movedKeys)}`)
  }
  if (delta.movedOf?.checked !== Object.keys(expected).length) {
    problems.push(`movedOf.checked is ${String(delta.movedOf?.checked)}, expected ${Object.keys(expected).length}`)
  }
  return problems
}

/** The BEAM body the fake control app serves. Named fields are the ones `Control.Beam.status` emits. */
function beamBody(overrides = {}) {
  return {
    system_pid: '4242',
    node: 'nonode@nohost',
    loaded_module_count: 120,
    process_count: 55,
    uptime_ms: 90_000,
    http: { requests: 7, connections: 8 },
    ...overrides,
  }
}

/** The fleet census the fake control app serves. */
function fleetBody(total) {
  return { ok: true, action: 'fleet_status', census_at: new Date().toISOString(), census: { total } }
}

/** The expected delta between the two fixture readings below. */
const EXPECTED_BEAM_DELTA = {
  loadedModuleCount: { from: 120, to: 121, delta: 1 },
  processCount: { from: 55, to: 56, delta: 1 },
  uptimeMs: { from: 90_000, to: 100_000, delta: 10_000 },
  httpRequests: { from: 7, to: 9, delta: 2 },
  httpConnections: { from: 8, to: 10, delta: 2 },
  fleetUnits: { from: 3, to: 4, delta: 1 },
}

async function main() {
  let pkg
  try {
    pkg = await import(pathToFileURL(LIB).href)
  } catch (error) {
    console.error(`FATAL: ${LIB} could not be imported: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  const { captureBeam, computeBeamDelta, resolveControlUrl, BEAM_FIELD_NAMES, BEAM_ROUNDS_PATH, ROUTE_PATHS, ROUNDS_PATH } = pkg
  for (const [name, value] of Object.entries({ captureBeam, computeBeamDelta, resolveControlUrl, BEAM_FIELD_NAMES, BEAM_ROUNDS_PATH, ROUTE_PATHS, ROUNDS_PATH })) {
    if (value === undefined) {
      console.error(`FATAL: the built artifact does not export ${name}`)
      process.exitCode = 1
      return
    }
  }

  /* --- A. The absent path, and the positive control beside it ------------ */
  await check('A1 control origin: the app default is port 4100 and CONTROL_PORT overrides it', () => {
    const fallback = resolveControlUrl({})
    assert(fallback.url === 'http://127.0.0.1:4100', `default origin is ${fallback.url}, expected the Control.HTTP default port`)
    const overridden = resolveControlUrl({ CONTROL_PORT: '4999' })
    assert(overridden.url === 'http://127.0.0.1:4999', `CONTROL_PORT=4999 resolved to ${overridden.url}`)
    const bad = resolveControlUrl({ CONTROL_PORT: 'not-a-port' })
    assert(bad.url === 'http://127.0.0.1:4100', `an unusable CONTROL_PORT resolved to ${bad.url} instead of the default`)
    assert(bad.problems.length === 1, `an unusable CONTROL_PORT produced ${bad.problems.length} problem(s), expected 1`)
    return `default ${fallback.url} (${fallback.from}); override ${overridden.url}; bad port reported: ${bad.problems[0]}`
  })

  const deadPort = await closedPort()
  const absent = await captureBeam(`http://127.0.0.1:${deadPort}`, 'verify:closed-port', 2_000)

  await check('A2 app down: EVERY beam field is {unmeasured: reason} and none is 0', () => {
    const problems = absentViolations(absent, BEAM_FIELD_NAMES)
    assert(problems.length === 0, problems.join(' | '))
    const zeros = BEAM_FIELD_NAMES.filter((name) => absent.fields[name]?.value === 0)
    assert(zeros.length === 0, `${zeros.length} field(s) fabricated a zero while the app was down: ${zeros.join(', ')}`)
    return `${BEAM_FIELD_NAMES.length}/${BEAM_FIELD_NAMES.length} fields unmeasured with reasons; readings ${absent.readings.read}/${absent.readings.of}; first reason: ${absent.fields.loadedModuleCount.unmeasured}`
  })

  await check('A3 the reason names a failure, not a silence', () => {
    for (const name of BEAM_FIELD_NAMES) {
      const reason = absent.fields[name].unmeasured
      assert(/fetch failed|timed out|status/.test(reason), `${name} unmeasured reason does not name a failure: ${reason}`)
    }
    return `reasons carry the failure kind; ${Object.keys(absent.unavailable).length} unavailable entries`
  })

  // Declared here because the route fixture below reuses the SAME computed delta:
  // the route is graded against the comparison the harness already verified, not
  // against a second hand-written copy that could disagree with it.
  let delta = null
  const state = { beam: beamBody(), fleet: fleetBody(3) }
  const live = await controlHarness(state)
  try {
    await check('A4 positive control: the SAME capture against a live app returns values (so A2 is an absence, not instrument failure)', async () => {
      const present = await captureBeam(live.url, 'verify:fake-control-app', 2_000)
      const unmeasured = BEAM_FIELD_NAMES.filter((name) => 'unmeasured' in present.fields[name])
      assert(unmeasured.length === 0, `a live control app still produced reasons for: ${unmeasured.join(', ')}`)
      assert(present.readings.read === BEAM_FIELD_NAMES.length, `readings.read is ${present.readings.read}, expected ${BEAM_FIELD_NAMES.length}`)
      assert(present.fields.fleetUnits.value === 3, `fleetUnits is ${JSON.stringify(present.fields.fleetUnits)}, expected 3 from /fleet/status census.total`)
      assert(present.fields.uptimeMs.value === 90_000, `uptimeMs is ${JSON.stringify(present.fields.uptimeMs)}, expected the served 90000`)
      return `${present.readings.read}/${present.readings.of} fields read; identity node ${String(present.identity.node)}, pid ${String(present.identity.systemPid)}`
    })

    /* --- B. The delta between two synthetic rounds ---------------------- */
    const firstBeam = await captureBeam(live.url, 'verify:fake-control-app', 2_000)
    state.beam = beamBody({ loaded_module_count: 121, process_count: 56, uptime_ms: 100_000, http: { requests: 9, connections: 10 } })
    state.fleet = fleetBody(4)
    const secondBeam = await captureBeam(live.url, 'verify:fake-control-app', 2_000)
    delta = computeBeamDelta(firstBeam, secondBeam, 1)

    await check('B1 delta between two synthetic rounds: every movement is the exact difference', () => {
      const problems = deltaViolations(delta, EXPECTED_BEAM_DELTA)
      assert(problems.length === 0, problems.join(' | '))
      assert(delta.movedOf.moved === 6, `movedOf.moved is ${delta.movedOf.moved}, expected 6`)
      assert(delta.movedOf.uncompared === 0, `movedOf.uncompared is ${delta.movedOf.uncompared}, expected 0`)
      return `6/6 fields moved: ${delta.moved.map((entry) => `${entry.key}${entry.delta >= 0 ? '+' : ''}${entry.delta}`).join(', ')}`
    })

    await check('B2 same pid across rounds: restarted is false, not null (a measured non-restart)', () => {
      assert(delta.restarted.occurred === false, `restarted.occurred is ${JSON.stringify(delta.restarted.occurred)}, expected false for an unchanged pid`)
      assert(delta.changedIdentity.length === 0, `changedIdentity is ${JSON.stringify(delta.changedIdentity)}, expected empty`)
      return `restarted=false; identity keys ${JSON.stringify(Object.keys(delta.identity))}`
    })

    await check('B3 different pid: the restart IS reported, so the flag is not always false', () => {
      const restartedBeam = { ...secondBeam, identity: { ...secondBeam.identity, systemPid: '9999' } }
      const restartedDelta = computeBeamDelta(secondBeam, restartedBeam, 2)
      assert(restartedDelta.restarted.occurred === true, `restarted.occurred is ${JSON.stringify(restartedDelta.restarted.occurred)}, expected true`)
      assert(restartedDelta.changedIdentity.includes('systemPid'), `changedIdentity is ${JSON.stringify(restartedDelta.changedIdentity)}, expected to include systemPid`)
      return `restarted=true on pid ${String(secondBeam.identity.systemPid)} -> 9999`
    })
  } finally {
    await live.close()
  }

  /* --- C. The read route, over a real file on disk ---------------------- */
  const dir = mkdtempSync(join(tmpdir(), 'beam-round-verify-'))
  const roundsFile = join(dir, 'rounds.jsonl')
  const legacy = {
    n: 1,
    at: new Date(Date.now() - 60_000).toISOString(),
    host: 'http://127.0.0.1:3083',
    workspace: null,
    model: null,
    counts: {},
    countsRead: { read: 0, of: 0 },
    fieldReadable: {},
    ids: { decisions: null, plugins: null, intentRows: null },
    delta: null,
    deltaReason: 'first round',
    unreadable: {},
  }
  const withBeam = {
    ...legacy,
    n: 2,
    at: new Date().toISOString(),
    beam: absent,
    beamReason: null,
    beamDeltaReason: 'first round',
    delta: { ...delta, beam: delta, beamReason: null },
  }
  writeFileSync(roundsFile, `${JSON.stringify(legacy)}\n${JSON.stringify(withBeam)}\n`, 'utf8')

  const routes = new Map()
  pkg.apply(
    {
      webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
      logger: { info() {}, warn() {} },
      effect(callback) { callback() },
    },
    { roundsFile, timeoutMs: 2_000 },
  )
  const server = createServer((req, res) => {
    const route = routes.get(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    if (route === undefined) return sendJson(res, 404, { ok: false, error: 'no such route' })
    Promise.resolve(route.handler(req, res)).catch(() => sendJson(res, 500, { ok: false, error: 'handler threw' }))
  })
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening))
  const base = `http://127.0.0.1:${server.address().port}`

  try {
    await check('C1 the beam route is advertised and registered exactly once', () => {
      assert(ROUTE_PATHS.includes(BEAM_ROUNDS_PATH), `${BEAM_ROUNDS_PATH} is not in ROUTE_PATHS: ${ROUTE_PATHS.join(', ')}`)
      assert(routes.size === ROUTE_PATHS.length, `registered ${routes.size} route(s), advertised ${ROUTE_PATHS.length}`)
      assert(routes.has(BEAM_ROUNDS_PATH), `${BEAM_ROUNDS_PATH} is not registered`)
      return `${routes.size} routes = ${ROUTE_PATHS.length} advertised, incl. ${BEAM_ROUNDS_PATH}`
    })

    await check('C2 beam deltas: newest first, read from the FILE, with the census beside the rows', async () => {
      const response = await fetch(base + BEAM_ROUNDS_PATH)
      const body = await response.json()
      assert(response.status === 200 && body.ok === true, `GET ${BEAM_ROUNDS_PATH} returned ${response.status}`)
      assert(body.count === 2 && body.total === 2 && body.lines === 2, `count ${body.count}, total ${body.total}, lines ${body.lines}`)
      assert(body.rounds[0].n === 2 && body.rounds[1].n === 1, `order is ${body.rounds.map((row) => row.n).join(',')}, expected 2,1`)
      assert(body.readFrom.includes('re-read'), `readFrom does not state that the file was re-read: ${body.readFrom}`)
      assert(body.rounds[0].delta?.moved?.length === 6, `the newest row carries ${String(body.rounds[0].delta?.moved?.length)} movements, expected 6`)
      return `${body.count}/${body.total} rows newest-first from ${body.bytes} B; delta movements ${body.rounds[0].delta.moved.length}`
    })

    await check('C3 a round written BEFORE the beam field reports beam:null WITH a reason, never an unchanged BEAM', async () => {
      const body = await (await fetch(base + BEAM_ROUNDS_PATH)).json()
      const old = body.rounds.find((row) => row.n === 1)
      assert(old !== undefined, 'round 1 is missing from the beam route')
      assert(old.beam === null, `round 1 beam is ${JSON.stringify(old.beam)}, expected null`)
      assert(typeof old.beamReason === 'string' && old.beamReason.length > 0, `round 1 beamReason is ${JSON.stringify(old.beamReason)}, expected a reason`)
      assert(old.delta === null, `round 1 delta is ${JSON.stringify(old.delta)}, expected null`)
      assert(typeof old.deltaReason === 'string' && old.deltaReason.length > 0, `round 1 deltaReason is ${JSON.stringify(old.deltaReason)}`)
      return `legacy round: beam null, reason "${old.beamReason}"; delta null, reason "${old.deltaReason}"`
    })

    await check('C4 ?limit= cuts the rows without shrinking the total, and a wrong method is 405', async () => {
      const one = await (await fetch(`${base}${BEAM_ROUNDS_PATH}?limit=1`)).json()
      assert(one.count === 1 && one.total === 2, `limit=1 gave count ${one.count}, total ${one.total}`)
      const posted = await fetch(base + BEAM_ROUNDS_PATH, { method: 'POST' })
      assert(posted.status === 405, `POST ${BEAM_ROUNDS_PATH} returned ${posted.status}, expected 405`)
      assert((posted.headers.get('allow') ?? '').includes('GET'), `405 does not allow GET: ${posted.headers.get('allow')}`)
      const rounds = await (await fetch(base + ROUNDS_PATH)).json()
      assert(rounds.total === 2, `the sibling rounds route reads ${rounds.total} rows, expected 2`)
      return `limit=1 -> ${one.count}/${one.total}; POST 405 Allow=${posted.headers.get('allow')}; ${ROUNDS_PATH} agrees on ${rounds.total}`
    })

    /* --- D. Mutations that must go RED ---------------------------------- */
    await check('D1 mutation (absent folded to zero): the absent-path check goes RED', () => {
      const folded = {
        ...absent,
        readings: { read: BEAM_FIELD_NAMES.length, of: BEAM_FIELD_NAMES.length },
        fields: Object.fromEntries(BEAM_FIELD_NAMES.map((name) => [name, { value: 0 }])),
      }
      const problems = absentViolations(folded, BEAM_FIELD_NAMES)
      assert(problems.length > 0, 'the absent-path check PASSED a capture that fabricated zeros for every field — it is a caption, not a check')
      mutations.push({ name: 'absent-folded-to-zero', detail: `${problems.length} problem(s): ${problems[0]}` })
      return `zero-folding refused: ${problems[0]}`
    })

    await check('D2 mutation (delta blind to movement): the delta check goes RED', () => {
      const blind = {
        ...delta,
        moved: [],
        fields: Object.fromEntries(BEAM_FIELD_NAMES.map((name) => [name, { from: 1, to: 1, delta: 0, reason: null }])),
      }
      const problems = deltaViolations(blind, EXPECTED_BEAM_DELTA)
      assert(problems.length > 0, 'the delta check PASSED a delta whose fields all claim zero movement — it is a caption, not a check')
      mutations.push({ name: 'delta-blind-to-movement', detail: `${problems.length} problem(s): ${problems[0]}` })
      return `a zero-movement delta refused: ${problems[0]}`
    })
  } finally {
    await new Promise((closed) => server.close(closed))
    rmSync(dir, { recursive: true, force: true })
  }

  /* --- E. The verdict --------------------------------------------------- */
  await check('E1 verdict: both mutations were DRIVEN and both went RED', () => {
    assert(mutations.length === 2, `${mutations.length} mutation(s) ran, expected 2`)
    return `${mutations.length} mutations: ${mutations.map((mutation) => mutation.name).join(', ')}`
  })

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
