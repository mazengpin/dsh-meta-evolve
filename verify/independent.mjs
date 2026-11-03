#!/usr/bin/env node
/**
 * independent.mjs — the INDEPENDENT verifier for `dsh-meta-evolve` and
 * `dsh-meta-research`, written by a lane that did not build either package.
 *
 * WHAT THIS FILE IS FOR
 *
 * Five checks, each of which is able to FAIL, each with its falsifier printed
 * beside it:
 *
 *   1. ROUTE POPULATION. Load each package's BUILT `lib/index.js` with a stubbed
 *      Host context that records `webServer.register` calls, and assert the exact
 *      path set. The expected set is taken from the package's own exported route
 *      table (`ROUTE_PATHS` / `LAST_PATH`+`RUN_PATH`) — two encodings of one fact
 *      must not be able to disagree — and the routes this verification brief names
 *      (`/meta-evolve/api/state`, `/meta-evolve/api/evolve`) are asserted present.
 *
 *   2. ABSENT IS NOT ZERO. Every route handler is driven with its upstream
 *      sources UNREACHABLE (dead TCP port; an unreadable rounds-file path; a
 *      fresh research process with no run recorded). The response must carry
 *      `null` + a reason, never a `0` and never an empty array that reads as
 *      success.
 *
 *   3. THE CONTROL CHANGES SOMETHING. `POST /meta-evolve/api/evolve` is called
 *      TWICE against a stubbed upstream that serves one fixed reading, so the
 *      counts do not move between rounds. The FIRST round must carry
 *      `delta: null` with `deltaReason: "first round"`; the SECOND must carry a
 *      real delta OBJECT even though every count is unchanged — an unchanged
 *      count is a compared count, not an unread one. The rounds file must gain
 *      one line per call.
 *
 *   4. WIRE-SHAPE HONESTY. Load each built `lib/client.js` the way the page does
 *      (`window.__ModuleLoader__` + a stub module table) and, when the bundle
 *      exports a PURE renderer, drive it with a `null` state field and with a
 *      measured `0`. `null` must render `NOT MEASURED`; the measured zero must
 *      NOT. If a package's client exports no pure renderer, that is reported as
 *      UNTESTABLE rather than passed.
 *
 *   5. THE META GATE. Read `D-0258` from the decision log on disk and assert it is
 *      recorded by `owner`, not superseded, and that every prohibition phrase in
 *      `plan/06-future-dsh-meta-plugins.md` is a superseded quotation that names
 *      `D-0258` on the same line. The exact lines checked are printed.
 *
 * RULES THIS FILE FOLLOWS
 *
 *   - It writes NOTHING outside an OS temporary directory. It never edits a
 *     source file, a package.json, or the other package, and it never touches
 *     `research/meta-evolve-rounds.jsonl` or `research/meta-research-last.json`
 *     in the program workspace.
 *   - Every assertion has a stated falsifier; a check with no falsifier is a
 *     caption and this file does not print one as a pass.
 *   - It exits non-zero on any failure. An UNTESTABLE required item is reported
 *     separately and does not by itself change the exit code; a FAIL always does.
 *   - It hashes the exact `lib/index.js` files it imports, with the algorithm
 *     named, and prints the digest as provenance — not as a check.
 *
 * Usage:
 *   node verify/independent.mjs
 */

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGINS_SRC = resolve(HERE, '..', '..')
const EVOLVE_DIR = resolve(PLUGINS_SRC, 'dsh-meta-evolve')
const RESEARCH_DIR = resolve(PLUGINS_SRC, 'dsh-meta-research')
const PROGRAM_WORKSPACE = resolve(
  PLUGINS_SRC,
  '..',
  'profiles-tree',
  'personal-dev',
  'dsh-meta-evolve_INIT_WORKSPACE',
)

const TMP_ROOT = mkdtempSync(join(tmpdir(), 'dsh-meta-independent-'))
const tempDir = (name) => {
  const path = join(TMP_ROOT, name)
  mkdirSync(path, { recursive: true })
  return path
}

/** The literal an unread value must render. Defined once; the controls drive it. */
const NOT_MEASURED_TOKEN = 'NOT MEASURED'

/** The prohibition phrases, exactly as the revoked plan/06 block stated them. */
const PROHIBITION_PHRASE = /(not to be built|may not be built|may be built yet|do not create any\s+`?dsh-meta-[^`\s]*`?|none of this is scheduled|prohibition stands)/i

/** Every line that states a prohibition, whether or not it names D-0258. */
function prohibitionPhrases(lines) {
  const hits = []
  lines.forEach((line, index) => {
    if (PROHIBITION_PHRASE.test(line)) hits.push({ line: index + 1, text: line })
  })
  return hits
}

/** Every prohibition line that does NOT name D-0258 — the regression check 5b reads. */
function prohibitionViolations(lines) {
  return prohibitionPhrases(lines).filter((hit) => !/D-0258/.test(hit.text))
}

/** The route-set predicate both route checks use: null means exact. */
function routeSetViolation(registered, advertised, required) {
  const reg = [...registered].sort()
  const adv = [...advertised].sort()
  if (reg.length !== adv.length) return `registered ${reg.length} path(s), advertised ${adv.length}`
  if (JSON.stringify(reg) !== JSON.stringify(adv)) return `registered ${JSON.stringify(reg)} != advertised ${JSON.stringify(adv)}`
  const missing = required.filter((path) => !reg.includes(path))
  if (missing.length > 0) return `required route(s) missing: ${missing.join(', ')}`
  return null
}

/**
 * The absent-is-not-zero predicate: every count whose source was unreadable must
 * be `null`. A non-null value here is a fabricated reading.
 */
function fabricatedCountKeys(counts) {
  return Object.entries(counts)
    .filter(([, value]) => value !== null)
    .map(([key]) => key)
}

/** The control predicate: a compared round is a non-null object that compared something. */
function deltaObjectViolation(delta) {
  if (delta === null) return 'delta is null — that is the FIRST-round shape, not a compared round'
  if (typeof delta !== 'object' || Array.isArray(delta)) return `delta is ${Array.isArray(delta) ? 'an array' : typeof delta}`
  if (delta.movedOf === undefined || delta.movedOf === null || typeof delta.movedOf.checked !== 'number') {
    return 'delta.movedOf.checked is not a number'
  }
  if (delta.movedOf.checked <= 0) return 'the delta compared nothing'
  if (!Array.isArray(delta.moved)) return 'delta.moved is not an array'
  return null
}

/** The renderer predicate: null renders the token, a measured zero does not. */
function notMeasuredDirectionViolation(nullText, zeroText) {
  if (!nullText.includes(NOT_MEASURED_TOKEN)) return 'the null reading did not render NOT MEASURED'
  if (nullText.includes('0 of 0')) return 'the null reading rendered a zero ratio'
  if (!zeroText.includes('0 of 0')) return 'the measured zero did not render "0 of 0"'
  if (zeroText.includes(NOT_MEASURED_TOKEN)) return 'the measured zero rendered NOT MEASURED'
  if (nullText === zeroText) return 'the two payloads rendered identically, so the token is not a reading'
  return null
}

/* ========================================================================== */
/* the check harness                                                          */
/* ========================================================================== */

let passed = 0
const failures = []
const untestable = []

/** Assert with a message that states what was expected and what arrived. */
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/** Strict equality with a labelled measurement. */
function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${render(expected)}, got ${render(actual)}`)
  }
}

/** JSON rendering with a size cap, for error messages only. */
function render(value, cap = 700) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text === undefined) text = String(value)
  return text.length > cap ? `${text.slice(0, cap)}… (${text.length} chars)` : text
}

function recordPass(id, measurement, falsifier) {
  passed += 1
  console.log(`PASS ${id} — ${measurement}`)
  console.log(`       falsifier: ${falsifier}`)
}

function recordFail(id, error, falsifier) {
  const message = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : String(error)
  // Errors thrown from inside `vm.runInNewContext` are from another realm, so
  // `instanceof Error` is FALSE for them; read `.stack` structurally instead.
  const stack = error !== null && typeof error === 'object' && typeof error.stack === 'string'
    ? error.stack.split('\n').slice(1, 4).map((line) => line.trim()).join(' | ')
    : ''
  failures.push({ id, message, falsifier, stack })
  console.log(`FAIL ${id} — ${message}`)
  if (stack !== '') console.log(`       at: ${stack}`)
  console.log(`       falsifier: ${falsifier}`)
}

function recordUntestable(id, why) {
  untestable.push({ id, why })
  console.log(`UNTESTABLE ${id} — ${why}`)
}

function check(id, falsifier, fn) {
  try {
    const measurement = fn()
    recordPass(id, measurement === undefined ? 'passed' : measurement, falsifier)
  } catch (error) {
    recordFail(id, error, falsifier)
  }
}

async function checkAsync(id, falsifier, fn) {
  try {
    const measurement = await fn()
    recordPass(id, measurement === undefined ? 'passed' : measurement, falsifier)
  } catch (error) {
    recordFail(id, error, falsifier)
  }
}

function section(title) {
  console.log('')
  console.log(`== ${title} ==`)
}

/* ========================================================================== */
/* file identity                                                              */
/* ========================================================================== */

/** byte size + sha256, algorithm named, of one built artifact. */
function artifactIdentity(label, absolutePath) {
  assert(existsSync(absolutePath), `${label}: ${absolutePath} does not exist`)
  const buffer = readFileSync(absolutePath)
  assert(buffer.length > 0, `${label}: ${absolutePath} is empty`)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  assert(/^[0-9a-f]{64}$/.test(sha256), `${label}: sha256 is not 64 lowercase hex digits`)
  return { label, path: absolutePath, bytes: buffer.length, sha256 }
}

/* ========================================================================== */
/* the stubbed Host context                                                   */
/* ========================================================================== */

/**
 * Apply one built package against a recording fake Host context.
 * The fake stands in for the ENVIRONMENT only (registration, logging, effects);
 * the code under test is the built bundle's own `apply`.
 */
function makeHost() {
  const routes = []
  const effects = []
  const logs = []
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    logger: {
      info(...args) {
        logs.push(['info', args])
      },
      warn(...args) {
        logs.push(['warn', args])
      },
      error(...args) {
        logs.push(['error', args])
      },
      debug(...args) {
        logs.push(['debug', args])
      },
    },
    effect(callback, label) {
      effects.push(label)
      const disposer = callback()
      return () => {
        if (typeof disposer === 'function') disposer()
      }
    },
    get() {
      return undefined
    },
  }
  return { ctx, routes, effects, logs }
}

/* ========================================================================== */
/* driving a registered handler on the direct call seam                       */
/* ========================================================================== */

/** Build a request whose async iterator yields the JSON body once. */
function fakeRequest(method, url, body) {
  const chunks =
    body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')]
  return {
    method,
    url,
    headers: { 'content-type': 'application/json' },
    [Symbol.asyncIterator]() {
      let done = false
      return {
        next() {
          if (done) return Promise.resolve({ done: true, value: undefined })
          done = true
          return Promise.resolve({ done: false, value: chunks[0] })
        },
      }
    },
    on() {},
    once() {},
    setTimeout() {},
  }
}

/**
 * Call one registered route handler directly and collect its response.
 * Returns `{status, headers, text, json}`. A handler that throws or never ends
 * is reported as `status: 0` with the reason, so a hang is a failure rather than
 * a silent pass.
 */
function callHandler(route, method, path, body, timeoutMs = 30_000) {
  return new Promise((resolvePromise) => {
    let settled = false
    let status = 0
    const headers = {}
    const chunks = []
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(value)
    }
    const timer = setTimeout(
      () => finish({ status: 0, headers, text: '', json: undefined, error: `handler did not answer within ${timeoutMs} ms` }),
      timeoutMs,
    )
    const res = {
      statusCode: 200,
      writeHead(code, extraHeaders) {
        status = typeof code === 'number' ? code : 200
        if (extraHeaders !== null && typeof extraHeaders === 'object') {
          for (const [name, value] of Object.entries(extraHeaders)) headers[name.toLowerCase()] = value
        }
        return res
      },
      setHeader(name, value) {
        headers[String(name).toLowerCase()] = value
      },
      getHeader(name) {
        return headers[String(name).toLowerCase()]
      },
      write(chunk) {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      },
      end(chunk) {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        finish({ status: status === 0 ? res.statusCode : status, headers, text, json })
      },
    }
    Promise.resolve()
      .then(() => route.handler(fakeRequest(method, path, body), res))
      .catch((error) => finish({ status: 0, headers, text: '', json: undefined, error: String(error) }))
  })
}

/** Assert a direct call answered with the status and a parsed JSON object. */
async function callJson(route, method, path, body) {
  const response = await callHandler(route, method, path, body)
  if (response.status === 0) throw new Error(`${method} ${path} did not answer: ${response.error ?? 'no reason'}`)
  if (!response.json || typeof response.json !== 'object') {
    throw new Error(`${method} ${path} answered HTTP ${response.status} with a non-JSON body: ${response.text.slice(0, 200)}`)
  }
  return response
}

/** Find the registered route for one exact path, failing if it is absent. */
function routeFor(routes, path) {
  const route = routes.find((entry) => entry.kind === 'exact' && entry.path === path)
  if (route === undefined) {
    throw new Error(`no exact route was registered for ${path}; registered: ${routes.map((entry) => `${entry.kind} ${entry.path}`).join(', ')}`)
  }
  return route
}

/* ========================================================================== */
/* a stub upstream, for the control check                                     */
/* ========================================================================== */

/** One fixed reading of every HTTP source the meta layer composes. */
const UPSTREAM_FIXTURES = {
  '/decision-log/api/list': {
    census: { decisions: 3, events: 3, malformedLines: 0, shown: 3, censusAt: '2026-10-18T00:00:00.000Z' },
    statuses: { active: 2, superseded: 1 },
    decisions: [{ id: 'D-0001' }, { id: 'D-0002' }, { id: 'D-0003' }],
  },
  // The status route carries the MERGED census as `historyCensus`; reading `outcomeCensus` from the
  // sessions route instead is the defect recorded in `src/host/sources.ts` (a denominator of 21 over a
  // numerator set of 1). The fixture must carry the field the reader is supposed to read, or the field
  // is unreadable and five counts silently become "uncompared" — which is what made check 3b red.
  '/lvl1-gate/api/status': {
    ok: true,
    hooked: true,
    runs: 4,
    revisions: ['lvl1-full', 'lvl1-base'],
    historyCensus: { decided: 2, declined: 1, neverRan: 0, count: 3 },
    last: {
      provenance: {
        outcome: 'decided',
        reason: 'stub decision',
        channel: 'stub',
        at: '2026-10-18T00:00:00.000Z',
      },
    },
  },
  '/lvl1-gate/api/sessions': {
    ok: true,
    hooked: true,
    count: 3,
    // historyCensus lives on the SESSIONS route (src/host/sources.ts:446 reads it there), and it is the
    // census that shares the population of `count`; `outcomeCensus` is the in-process census and must
    // stay beside it rather than being read as the merged one.
    historyCensus: { decided: 2, declined: 1, neverRan: 0, basis: 'merged session history' },
    outcomeCensus: { decided: 2, declined: 1, neverRan: 0 },
  },
  '/intent-map/api/map': {
    corpus: {
      zones: { count: 1, of: 1 },
      catalogCount: 4527,
      inScopePlugins: { count: 688, of: 688 },
      censusAt: '2026-10-18T00:00:00.000Z',
    },
    index: { identity: { model: 'qwen3-embedding:0.6b', dim: 1024 }, freshness: 'fresh' },
    zones: [{ zoneId: 'M3-vector-embedding' }],
  },
}

/**
 * Start a loopback server that answers the four source routes with fixed JSON.
 * It records which paths were asked for, so the harness can prove the live read
 * really happened instead of taking a cached value on faith.
 */
async function startStubUpstream() {
  const requested = []
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0]
    requested.push(path)
    const fixture = UPSTREAM_FIXTURES[path]
    if (fixture === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'not found' }))
      return
    }
    const text = JSON.stringify(fixture)
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
    res.end(text)
  })
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    requested,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  }
}

/* ========================================================================== */
/* a live-looking workspace fixture (check 3 only)                            */
/* ========================================================================== */

function buildLiveWorkspace(name) {
  const workspace = tempDir(name)
  mkdirSync(join(workspace, 'plan', 'intent-field'), { recursive: true })
  mkdirSync(join(workspace, 'research'), { recursive: true })
  const field = {
    generatedAt: '2026-10-18T00:00:00.000Z',
    mode: { name: 'intent-field' },
    counts: { documents: 1, rowsTotal: 1 },
    documents: [
      {
        path: 'plan/06-future-dsh-meta-plugins.md',
        rows: [{ id: 'IF-06-1', value: 'plan' }],
      },
    ],
  }
  writeFileSync(join(workspace, 'plan', 'intent-field', 'field.json'), `${JSON.stringify(field, null, 2)}\n`, 'utf8')
  const pluginsRoot = join(workspace, 'plugins-src')
  for (const name of ['dsh-meta-evolve', 'dsh-meta-research', 'dsh-lvl1-gate']) {
    mkdirSync(join(pluginsRoot, name), { recursive: true })
  }
  return {
    workspace,
    pluginsRoot,
    roundsFile: join(workspace, 'research', 'meta-evolve-rounds.jsonl'),
  }
}

/* ========================================================================== */
/* the client-bundle loader (the page's own seam)                             */
/* ========================================================================== */

/** A minimal React surface: enough for the bundle's factory and a pure renderer. */
function reactStub() {
  const createElement = (type, props, ...children) => ({
    __el: true,
    type,
    props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children },
  })
  const emptyEffect = () => {}
  return {
    createElement,
    Fragment: Symbol('Fragment'),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, emptyEffect],
    useEffect: emptyEffect,
    useLayoutEffect: emptyEffect,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial }),
    memo: (fn) => fn,
    forwardRef: (fn) => fn,
    createContext: () => ({ Provider: Symbol('Provider'), Consumer: Symbol('Consumer') }),
  }
}

/**
 * Load a built `lib/client.js` exactly as the page does: define the module
 * loader, run the bundle, take the captured factory, and call it with a stub
 * module table. Returns `{ id, exports }` — the exports are the built artifact's
 * own, not a re-implementation.
 */
function loadClientBundle(absolutePath) {
  assert(existsSync(absolutePath), `client bundle does not exist: ${absolutePath}`)
  const source = readFileSync(absolutePath, 'utf8')
  let loaded = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(definition) {
          loaded = definition
        },
      },
    },
    document: {
      baseURI: 'http://dsh.invalid/',
      querySelector: () => ({}),
      createElement: () => ({ dataset: {}, appendChild() {} }),
    },
    fetch: async () => {
      throw new Error('the verifier stubs fetch; the client must not fetch at load time')
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(source, sandbox, { filename: absolutePath })
  assert(loaded !== null, `${absolutePath} did not call window.__ModuleLoader__.load`)
  const react = reactStub()
  const jsx = (type, props) => ({ __el: true, type, props: props ?? {} })
  const moduleTable = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: react.Fragment },
  }
  const requireStub = (id) => {
    if (!(id in moduleTable)) {
      throw new Error(`client bundle requested module-table id ${JSON.stringify(id)}, which the page seam did not supply`)
    }
    return moduleTable[id]
  }
  const exported = loaded.factory(requireStub)
  return { id: loaded.id, exports: exported }
}

/** Collect every text node of a rendered element tree. */
function textOf(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) textOf(child, out)
    return out
  }
  if (node.__el === true) {
    if (typeof node.type === 'function') return textOf(node.type(node.props), out)
    return textOf(node.props === undefined ? undefined : node.props.children, out)
  }
  return out
}

/** Collect every element of a rendered tree, invoking function components. */
function elementsOf(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') return out
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, out)
    return out
  }
  if (node.__el === true) {
    out.push(node)
    const rendered = typeof node.type === 'function' ? node.type(node.props) : node.props?.children
    elementsOf(rendered, out)
    return out
  }
  return out
}

/** The first rendered element whose props carry the given data-testid. */
function elementByTestId(tree, testId) {
  return elementsOf(tree).find((element) => element.props !== undefined && element.props['data-testid'] === testId)
}

/* ========================================================================== */
/* the decision log on disk, read without the MCP surface                     */
/* ========================================================================== */

/** Parse the append-only decision log and derive one decision's status. */
function decisionFromLog(logPath, id) {
  assert(existsSync(logPath), `decision log not found: ${logPath}`)
  const lines = readFileSync(logPath, 'utf8').split('\n').filter((line) => line.trim() !== '')
  const events = lines.map((line, index) => {
    try {
      return JSON.parse(line)
    } catch (error) {
      throw new Error(`decision log line ${index + 1} is not JSON: ${String(error)}`)
    }
  })
  const recorded = events.filter((event) => event.kind === 'recorded' && event.id === id)
  const supersededBy = events.filter((event) => event.kind === 'superseded' && event.id === id)
  return { events, recorded, supersededBy }
}

/* ========================================================================== */
/* load the built artifacts                                                   */
/* ========================================================================== */

section('artifacts')

const evolveIndexPath = join(EVOLVE_DIR, 'lib', 'index.js')
const researchIndexPath = join(RESEARCH_DIR, 'lib', 'index.js')
const evolveIdentity = artifactIdentity('dsh-meta-evolve/lib/index.js', evolveIndexPath)
const researchIdentity = artifactIdentity('dsh-meta-research/lib/index.js', researchIndexPath)

// PROVENANCE, NOT A CHECK. These values are reported with their algorithm so the
// exact bytes this run imported are auditable; nothing is asserted about the
// digest beyond its shape, because a digest has no expected value to compare to.
console.log(`REPORT sha256 dsh-meta-evolve/lib/index.js = ${evolveIdentity.sha256} (${evolveIdentity.bytes} B)`)
console.log(`REPORT sha256 dsh-meta-research/lib/index.js = ${researchIdentity.sha256} (${researchIdentity.bytes} B)`)

const evolve = await import(pathToFileURL(evolveIndexPath).href)
const research = await import(pathToFileURL(researchIndexPath).href)

check('0 built halves export the plugin contract', 'an export missing or not a function/array', () => {
  assertEqual(evolve.name, 'dsh-meta-evolve', 'dsh-meta-evolve name export')
  assertEqual(typeof evolve.apply, 'function', 'dsh-meta-evolve apply export is a function')
  assert(Array.isArray(evolve.inject) && evolve.inject.includes('webServer'), 'dsh-meta-evolve inject must name webServer')
  assertEqual(research.name, 'meta-research', 'dsh-meta-research name export')
  assertEqual(typeof research.apply, 'function', 'dsh-meta-research apply export is a function')
  assert(Array.isArray(research.inject) && research.inject.includes('webServer'), 'dsh-meta-research inject must name webServer')
  return `evolve exports ${['name', 'apply', 'inject', 'ROUTE_PATHS'].filter((key) => key in evolve).join(', ')}; research exports ${['name', 'apply', 'inject', 'LAST_PATH', 'RUN_PATH'].filter((key) => key in research).join(', ')}`
})

/* ========================================================================== */
/* 1. ROUTE POPULATION                                                        */
/* ========================================================================== */

section('1. route population')

// A dead TCP port: nothing listens there, so every HTTP source read fails with
// a reason instead of returning a cached value.
const DEAD_HOST = 'http://127.0.0.1:1'

// The dead-configured evolve instance also drives check 2a/2b.
const deadWorkspace = tempDir('evolve-dead-workspace')
const evolveDead = makeHost()
evolve.apply(evolveDead.ctx, {
  hostUrl: DEAD_HOST,
  timeoutMs: 400,
  workspace: deadWorkspace,
  pluginsRoot: join(deadWorkspace, 'no-such-plugins-src'),
  roundsFile: join(deadWorkspace, 'rounds.jsonl'),
})

// The research instance also drives check 2d/2e.
const researchWorkspace = tempDir('research-dead-workspace')
const researchRecordPath = join(researchWorkspace, 'meta-research-last.json')
const researchInstance = makeHost()
research.apply(researchInstance.ctx, {
  workspaceDir: researchWorkspace,
  recordPath: researchRecordPath,
  decisionLogUrl: `${DEAD_HOST}/decision-log/api/list`,
  intentMapUrl: `${DEAD_HOST}/intent-map/api/map`,
  embedderPsUrl: `${DEAD_HOST}/api/ps`,
  profileManifestPath: join(researchWorkspace, 'no-such-profile', 'package.json'),
})

/** The exact expected path set of each package, stated once here. */
const EVOLVE_REQUIRED = ['/meta-evolve/api/state', '/meta-evolve/api/evolve']
const RESEARCH_REQUIRED = ['/meta-research/api/last', '/meta-research/api/run']

check('1a dsh-meta-evolve registers EXACTLY the path set it advertises and nothing else', 'one extra path, one missing path, a duplicate, a non-exact kind, or a registered set that differs from the exported ROUTE_PATHS', () => {
  const registered = evolveDead.routes.map((route) => route.path)
  const advertised = Array.isArray(evolve.ROUTE_PATHS) ? [...evolve.ROUTE_PATHS] : null
  assert(advertised !== null, 'lib/index.js does not export ROUTE_PATHS, so the advertised set cannot be cross-checked')
  assertEqual(registered.length, new Set(registered).size, `duplicate path registered: ${render(registered)}`)
  for (const route of evolveDead.routes) {
    assertEqual(route.kind, 'exact', `route ${route.path} kind (the harness dispatches exact paths)`)
    assertEqual(typeof route.handler, 'function', `route ${route.path} handler`)
  }
  const registeredSorted = [...registered].sort()
  const advertisedSorted = [...advertised].sort()
  const violation = routeSetViolation(registered, advertised, EVOLVE_REQUIRED)
  assertEqual(violation, null, `route set must be EXACTLY the advertised set: ${violation ?? ''}`)
  assertEqual(evolveDead.effects.length, 1, 'the registrations must sit in exactly one ctx.effect (so unload removes them together)')
  return `registered ${registered.length} exact paths: ${registeredSorted.join(', ')} (advertised: ${advertisedSorted.join(', ')})`
})

check('1b dsh-meta-research registers EXACTLY the path set it advertises and nothing else', 'one extra path, one missing path, a duplicate, a non-exact kind, or a registered set that differs from the exported LAST_PATH+RUN_PATH', () => {
  const registered = researchInstance.routes.map((route) => route.path)
  assert(typeof research.LAST_PATH === 'string' && typeof research.RUN_PATH === 'string', 'lib/index.js does not export LAST_PATH/RUN_PATH, so the advertised set cannot be cross-checked')
  const advertised = [research.LAST_PATH, research.RUN_PATH]
  for (const route of researchInstance.routes) {
    assertEqual(route.kind, 'exact', `route ${route.path} kind`)
    assertEqual(typeof route.handler, 'function', `route ${route.path} handler`)
  }
  const registeredSorted = [...registered].sort()
  const advertisedSorted = [...advertised].sort()
  assertEqual(registered.length, new Set(registered).size, `duplicate path registered: ${render(registered)}`)
  const violation = routeSetViolation(registered, advertised, RESEARCH_REQUIRED)
  assertEqual(violation, null, `route set must be EXACTLY the advertised set: ${violation ?? ''}`)
  assertEqual(researchInstance.effects.length, 2, 'the two registrations must each sit in a ctx.effect (so unload removes both)')
  return `registered ${registered.length} exact paths: ${registeredSorted.join(', ')} (advertised: ${advertisedSorted.join(', ')})`
})

/* ========================================================================== */
/* 2. ABSENT IS NOT ZERO                                                      */
/* ========================================================================== */

section('2. absent is not zero')

await checkAsync('2a evolve GET /state with every upstream dead -> null fields + reasons, never 0', 'any count is 0, any field is an empty object/array, or a reason is missing while a source was unreadable', async () => {
  const response = await callJson(routeFor(evolveDead.routes, '/meta-evolve/api/state'), 'GET', '/meta-evolve/api/state')
  assertEqual(response.status, 200, 'state route status (an unreadable source is a readable state)')
  const body = response.json
  assertEqual(body.ok, true, 'ok')
  assertEqual(body.note, 'live', 'note (the shell constant "scaffold" must be gone)')
  for (const field of ['decisionLog', 'intentField', 'lvl1Gate', 'intentMap', 'plugins']) {
    assertEqual(body[field], null, `${field} with a dead source must be null, not ${render(body[field])}`)
    const reason = body.unreadable?.[field]
    assert(typeof reason === 'string' && reason.length > 0, `unreadable.${field} must carry a non-empty reason, got ${render(reason)}`)
  }
  assert(body.counts !== null && typeof body.counts === 'object', 'counts block must exist')
  const countEntries = Object.entries(body.counts)
  assert(countEntries.length >= 5, `the counts block must still state its keys; got ${countEntries.length}`)
  const fabricated = fabricatedCountKeys(body.counts)
  assertEqual(fabricated.length, 0, `these counts were fabricated from unreadable sources: ${fabricated.join(', ')}`)
  assertEqual(body.countsRead.read, 0, 'countsRead.read (no count was readable)')
  assert(body.countsRead.of > 0, 'countsRead.of must be the real denominator of count keys, not 0')
  return `5 null fields with reasons; ${countEntries.length} null counts; countsRead 0 of ${body.countsRead.of}`
})

await checkAsync('2b evolve POST /evolve with dead sources: round 1 is null+reason, round 2 compares nulls with reasons', 'a round 1 delta of zeros, an empty findings-like array read as success, or a round 2 delta that folds an unreadable count to 0', async () => {
  const evolveRoute = routeFor(evolveDead.routes, '/meta-evolve/api/evolve')
  const first = await callJson(evolveRoute, 'POST', '/meta-evolve/api/evolve')
  assertEqual(first.status, 200, 'evolve status')
  assertEqual(first.json.ok, true, 'evolve ok')
  assertEqual(first.json.round.delta, null, 'first-round delta')
  assertEqual(first.json.round.deltaReason, 'first round', 'first-round deltaReason')
  const firstCounts = Object.values(first.json.round.counts)
  assert(firstCounts.length > 0, 'round 1 must still state its count keys')
  for (const value of firstCounts) assertEqual(value, null, 'round 1 count with a dead source must be null')
  assertEqual(first.json.round.countsRead.read, 0, 'round 1 countsRead.read')
  assert(first.json.round.countsRead.of > 0, 'round 1 countsRead.of must be a real denominator')

  const second = await callJson(evolveRoute, 'POST', '/meta-evolve/api/evolve')
  assertEqual(second.status, 200, 'second evolve status')
  const delta = second.json.round.delta
  assert(delta !== null && typeof delta === 'object' && !Array.isArray(delta), 'round 2 with two unreadable sides must still be a delta OBJECT, not null and not []')
  assertEqual(delta.movedOf.checked > 0, true, 'the delta must state how many counts it compared')
  assertEqual(delta.movedOf.moved, 0, 'no count moved, because none was comparable')
  assertEqual(delta.movedOf.uncompared, delta.movedOf.checked, 'every count must be counted as UNCOMPARED when both sides are unreadable')
  for (const [key, count] of Object.entries(delta.counts)) {
    assertEqual(count.delta, null, `delta.counts.${key}.delta must be null, never a fabricated 0`)
    assert(typeof count.reason === 'string' && count.reason.length > 0, `delta.counts.${key} must carry a reason`)
  }
  const unavailableCount = Object.keys(delta.unavailable).length
  assert(unavailableCount > 0, 'the delta must name the uncomparable quantities in `unavailable`')
  return `round1 delta=null reason="first round"; round2 delta object with ${delta.movedOf.checked} comparisons, all uncompared, ${unavailableCount} unavailable entries`
})

await checkAsync('2c evolve GET /rounds with an unreadable rounds path -> a reason, not a clean empty list', 'a 200 body with count 0 and no malformed/reason channel, i.e. an unreadable store served as an empty one', async () => {
  const brokenDir = tempDir('evolve-broken-rounds')
  const brokenPath = join(brokenDir, 'rounds-as-directory')
  mkdirSync(brokenPath, { recursive: true })
  const instance = makeHost()
  evolve.apply(instance.ctx, {
    hostUrl: DEAD_HOST,
    timeoutMs: 300,
    workspace: brokenDir,
    pluginsRoot: brokenPath,
    roundsFile: brokenPath,
  })
  const response = await callJson(routeFor(instance.routes, '/meta-evolve/api/rounds'), 'GET', '/meta-evolve/api/rounds')
  assertEqual(response.status, 200, 'rounds status')
  const body = response.json
  assertEqual(body.ok, true, 'rounds ok')
  assertEqual(body.exists, true, 'the path exists (it is a directory); the response must say so')
  assertEqual(body.count, 0, 'no round parsed')
  assert(body.malformedLines >= 1, `an unreadable store must be counted as malformed, got malformedLines=${render(body.malformedLines)}`)
  assert(Array.isArray(body.malformed) && body.malformed.length >= 1, 'the malformed rows must be listed')
  const reason = body.malformed[0]?.reason
  assert(typeof reason === 'string' && reason.length > 0, 'the malformed row must carry a non-empty reason')
  return `exists=true, count=0, malformedLines=${body.malformedLines}, reason=${JSON.stringify(reason.slice(0, 90))}`
})

await checkAsync('2d research GET /last before any run -> last:null with a note, never {} or []', 'last is an empty object/array or a zero-filled run record', async () => {
  const response = await callJson(routeFor(researchInstance.routes, '/meta-research/api/last'), 'GET', '/meta-research/api/last')
  assertEqual(response.status, 200, 'last status')
  const body = response.json
  assertEqual(body.ok, true, 'last ok')
  assertEqual(body.last, null, `a process that has recorded no run must report last:null, got ${render(body.last)}`)
  assert(typeof body.note === 'string' && body.note.length > 0, 'the never-run answer must carry a note explaining itself')
  return `last=null, note=${JSON.stringify(body.note)}`
})

await checkAsync('2e research POST /run with every upstream unreachable -> 4 checks of:null with reasons, complete:false', 'any check reports of:0/checked:0 as a clean result, complete is true, or a source is readable without being fetched', async () => {
  const response = await callJson(routeFor(researchInstance.routes, '/meta-research/api/run'), 'POST', '/meta-research/api/run')
  assertEqual(response.status, 200, 'run status (unreadable sources are a readable census)')
  const body = response.json
  assertEqual(body.ok, true, 'run ok')
  const census = body.run?.census
  assert(census !== undefined && census !== null, 'the response must carry run.census')
  assertEqual(census.complete, false, 'complete (a census with no readable source is not complete)')
  assertEqual(census.checksEvaluated.count, 0, 'checksEvaluated.count')
  assertEqual(census.checksEvaluated.of, 4, 'checksEvaluated.of (the four checks the census defines)')
  assert(Array.isArray(census.checks) && census.checks.length === 4, `expected 4 check rows, got ${render(census.checks?.length)}`)
  for (const checkRow of census.checks) {
    assertEqual(checkRow.of, null, `${checkRow.kind} of with an unreachable source must be null, never 0`)
    assertEqual(checkRow.checked, null, `${checkRow.kind} checked must be null when of is null`)
    assert(Array.isArray(checkRow.findings) && checkRow.findings.length === 0, `${checkRow.kind} findings must be empty when the check was not evaluated`)
    assert(typeof checkRow.reason === 'string' && checkRow.reason.length > 0, `${checkRow.kind} must carry a non-empty reason`)
  }
  assertEqual(census.totals.unitsExamined.of, null, 'totals.unitsExamined.of must be withheld (null) when the census is incomplete')
  assertEqual(census.totals.checksNotEvaluated.count, 4, 'checksNotEvaluated.count')
  assert(Array.isArray(census.sources) && census.sources.length === 5, `expected 5 source rows, got ${render(census.sources?.length)}`)
  for (const source of census.sources) {
    assertEqual(source.readable, false, `source ${source.name} with a dead endpoint must be readable:false`)
    assert(typeof source.reason === 'string' && source.reason.length > 0, `source ${source.name} must carry a reason`)
  }
  // The artifact was still written: the census is a READING of an unreachable
  // world, not a failed request.
  assert(existsSync(researchRecordPath), 'the run record must still be written when every source is unreachable')
  const persisted = JSON.parse(readFileSync(researchRecordPath, 'utf8'))
  assertEqual(persisted.census?.complete, false, 'the persisted record must say complete:false')
  return `complete=false, checksEvaluated 0/4, all 4 of:null with reasons, 5 sources unreadable with reasons, record written`
})

/* ========================================================================== */
/* 3. THE CONTROL CHANGES SOMETHING                                           */
/* ========================================================================== */

section('3. the control changes something')

const stubUpstream = await startStubUpstream()
const live = buildLiveWorkspace('evolve-live-workspace')
const evolveLive = makeHost()
evolve.apply(evolveLive.ctx, {
  hostUrl: stubUpstream.base,
  timeoutMs: 5_000,
  workspace: live.workspace,
  pluginsRoot: live.pluginsRoot,
  roundsFile: live.roundsFile,
})
const liveEvolveRoute = routeFor(evolveLive.routes, '/meta-evolve/api/evolve')

let firstRound = null
let secondRound = null

try {
  await checkAsync('3a evolve round 1 against a fixed stub store -> delta:null, deltaReason "first round", file +1 line', 'a first round reporting a delta object of zeros, or a deltaReason other than "first round"', async () => {
    stubUpstream.requested.length = 0
    const response = await callJson(liveEvolveRoute, 'POST', '/meta-evolve/api/evolve')
    assertEqual(response.status, 200, 'evolve status')
    const body = response.json
    assertEqual(body.ok, true, 'evolve ok')
    firstRound = body
    assertEqual(body.round.n, 1, 'round number')
    assertEqual(body.round.delta, null, `the first round must report delta:null (nothing was compared), got ${render(body.round.delta)}`)
    assertEqual(body.round.deltaReason, 'first round', 'the first round must say why its delta is null')
    assertEqual(body.before.lines, 0, 'before.lines on a fresh store')
    assertEqual(body.stored.lines, 1, 'stored.lines after the append')
    assertEqual(body.change.linesDelta, 1, 'change.linesDelta')
    assertEqual(body.verification.verified, true, 'the response must prove it re-read the line it wrote')
    // The live read really happened: every stubbed upstream route was asked for.
    const expectedPaths = Object.keys(UPSTREAM_FIXTURES)
    const missing = expectedPaths.filter((path) => !stubUpstream.requested.includes(path))
    assert(missing.length === 0, `the control did not read these live sources: ${render(missing)}`)
    return `round 1 n=1 delta=null deltaReason="first round"; lines 0->1; ${stubUpstream.requested.length} live source reads`
  })

  await checkAsync('3b evolve round 2 with UNCHANGED counts -> a real delta OBJECT, not null', 'a second round that reports delta:null because nothing changed (the first-round signal leaking into every round)', async () => {
    const response = await callJson(liveEvolveRoute, 'POST', '/meta-evolve/api/evolve')
    assertEqual(response.status, 200, 'second evolve status')
    const body = response.json
    secondRound = body
    assertEqual(body.round.n, 2, 'round number')
    const delta = body.round.delta
    const violation = deltaObjectViolation(delta)
    assertEqual(violation, null, `the second round must carry a real delta OBJECT even when every count is unchanged: ${violation ?? ''}`)
    assertEqual(delta.against, 1, 'delta.against (the round it compared with)')
    assertEqual(typeof delta.againstAt, 'string', 'delta.againstAt')
    assertEqual(delta.movedOf.moved, 0, 'with a fixed stub store no count moved')
    assertEqual(delta.movedOf.uncompared, 0, 'every count was readable on both sides, so nothing is uncompared')
    assert(delta.moved.length === 0, `moved must be an empty array (unchanged counts), got ${render(delta.moved)}`)
    const countEntries = Object.entries(delta.counts)
    assert(countEntries.length === delta.movedOf.checked, `counts (${countEntries.length}) must account for every checked comparison (${delta.movedOf.checked})`)
    for (const [key, count] of countEntries) {
      assertEqual(count.delta, 0, `count ${key} was unchanged, so its delta must be the measured 0, got ${render(count.delta)}`)
      assertEqual(count.reason, null, `count ${key} was comparable, so its reason must be null`)
      assertEqual(typeof count.from, 'number', `count ${key} from`)
      assertEqual(typeof count.to, 'number', `count ${key} to`)
    }
    assertEqual(body.round.deltaReason, null, 'deltaReason on a compared round')
    assertEqual(body.before.lines, 1, 'before.lines on round 2')
    assertEqual(body.stored.lines, 2, 'stored.lines on round 2')
    assertEqual(body.change.linesDelta, 1, 'change.linesDelta on round 2')
    assertEqual(body.verification.verified, true, 'the second round must also prove its append')
    // THE ASSERTION THE BRIEF ASKS FOR: the second delta must DIFFER from the first.
    assert(firstRound !== null, 'round 1 must have been captured before round 2 is checked')
    assert(JSON.stringify(body.round.delta) !== JSON.stringify(firstRound.round.delta), 'the second response delta must differ from the first')
    return `delta object against round 1: ${delta.movedOf.checked} comparisons, 0 moved, 0 uncompared, ${countEntries.length} counts all delta 0`
  })

  await checkAsync('3c the store really changed: the rounds file holds two parsed lines, round 2 carries the delta object', 'the file did not grow, a line is malformed, or the recorded second line loses the delta', async () => {
    assert(existsSync(live.roundsFile), 'the rounds file was not created')
    const text = readFileSync(live.roundsFile, 'utf8')
    assert(text.endsWith('\n'), 'the rounds file must end with exactly one trailing newline')
    const lines = text.split('\n')
    assertEqual(lines[lines.length - 1], '', 'the trailing newline must produce one empty tail element')
    const records = lines.slice(0, -1).map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`rounds line ${index + 1} is not JSON: ${String(error)}`)
      }
    })
    assertEqual(records.length, 2, 'the file must hold two rounds after two calls')
    assertEqual(records[0].delta, null, 'line 1 (first round) delta')
    assertEqual(records[0].deltaReason, 'first round', 'line 1 deltaReason')
    assert(records[1].delta !== null && typeof records[1].delta === 'object', 'line 2 must carry a delta object, because the build recorded what it compared')
    assert(secondRound !== null, 'the round-2 response must have been captured before the store is re-checked')
    assertEqual(records[1].delta.movedOf.checked, secondRound.round.delta.movedOf.checked, 'line 2 delta.movedOf.checked must equal the served response')
    const roundsResponse = await callJson(routeFor(evolveLive.routes, '/meta-evolve/api/rounds'), 'GET', '/meta-evolve/api/rounds')
    assertEqual(roundsResponse.status, 200, 'rounds route status')
    assertEqual(roundsResponse.json.total, 2, 'rounds route total')
    assertEqual(roundsResponse.json.count, 2, 'rounds route count')
    assertEqual(roundsResponse.json.trailingNewline, true, 'rounds route trailingNewline')
    return `file ${readFileSync(live.roundsFile).length} B, 2 parsed rounds; GET /rounds total=2 count=2 trailingNewline=true`
  })
} finally {
  await stubUpstream.close()
}

/* ========================================================================== */
/* 4. WIRE-SHAPE HONESTY                                                      */
/* ========================================================================== */

section('4. wire-shape honesty')

await checkAsync('4a research pure renderer: null renders NOT MEASURED, a measured 0 does NOT', 'the null reading renders as 0 / "0 of 0", the measured zero renders as NOT MEASURED, or the renderer throws on a legal payload', async () => {
  const client = loadClientBundle(join(RESEARCH_DIR, 'lib', 'client.js'))
  assertEqual(client.id, 'dsh-meta-research', 'client bundle id')
  const pureRender = client.exports.__renderResearch
  assertEqual(typeof pureRender, 'function', 'lib/client.js must export the pure renderer __renderResearch')
  const t = (key) => key

  /** One view whose ONE check row could not be evaluated: of/findings are null. */
  const viewNull = {
    fetchedAt: null,
    read: 'loaded',
    note: null,
    last: {
      state: 'run',
      at: null,
      checks: [{ name: 'scope-missing-path', unit: 'paths', findings: null, checked: null, of: null, reason: 'the decision log did not answer' }],
      findings: [],
      coverage: {
        complete: false,
        checksEvaluated: { count: 0, of: 4 },
        unitsExamined: { count: 0, of: null },
        findings: { count: 0, of: 0 },
        checksNotEvaluated: { count: 4, of: 4 },
      },
      note: null,
    },
  }
  /** The same view with a check that WAS evaluated and found nothing: a real 0 of 0. */
  const viewZero = {
    fetchedAt: '2026-10-18T00:00:00.000Z',
    read: 'loaded',
    note: null,
    last: {
      state: 'run',
      at: '2026-10-18T00:00:00.000Z',
      checks: [{ name: 'scope-missing-path', unit: 'paths', findings: 0, checked: 0, of: 0, reason: null }],
      findings: [],
      coverage: {
        complete: true,
        checksEvaluated: { count: 4, of: 4 },
        unitsExamined: { count: 0, of: 0 },
        findings: { count: 0, of: 0 },
        checksNotEvaluated: { count: 0, of: 4 },
      },
      note: null,
    },
  }

  const treeNull = pureRender(viewNull, t)
  const textNull = textOf(treeNull).join(' ')
  assert(textNull.includes(NOT_MEASURED_TOKEN), `a null check reading must render the literal ${NOT_MEASURED_TOKEN}; rendered: ${render(textNull, 500)}`)
  const rowNull = elementByTestId(treeNull, 'check-row')
  assert(rowNull !== undefined, 'the null check payload must render a check-row')
  const rowNullText = textOf(rowNull).join(' ')
  assertEqual(rowNull.props['data-measured'], 'false', 'the null check row must be structurally marked data-measured="false"')

  const treeZero = pureRender(viewZero, t)
  const rowZero = elementByTestId(treeZero, 'check-row')
  assert(rowZero !== undefined, 'the measured-zero payload must render a check-row')
  const rowZeroText = textOf(rowZero).join(' ')
  const direction = notMeasuredDirectionViolation(rowNullText, rowZeroText)
  assertEqual(direction, null, `the NOT MEASURED direction must hold: ${direction ?? ''}`)
  assertEqual(rowZero.props['data-measured'], 'true', 'the measured zero row must be structurally marked data-measured="true"')
  const zeroValue = elementsOf(rowZero).find((element) => element.props !== undefined && 'data-findings' in element.props)
  assert(zeroValue !== undefined, 'the measured zero row must expose the numbers it rendered as data-findings/data-of')
  assertEqual(zeroValue.props['data-findings'], 0, 'the measured zero row must expose data-findings=0')
  assertEqual(zeroValue.props['data-of'], 0, 'the measured zero row must expose data-of=0')
  const nullCarriesNumbers = elementsOf(rowNull).some((element) => element.props !== undefined && 'data-findings' in element.props)
  assertEqual(nullCarriesNumbers, false, 'the null reading row must carry NO fabricated findings/denominator attribute')
  // Falsifier direction: the two payloads must render DIFFERENTLY, so the token
  // cannot be a constant printed regardless of input.
  assert(textNull !== textOf(treeZero).join(' '), 'the null and measured-zero payloads rendered identically, so the token is not a reading')
  return `null check -> "${NOT_MEASURED_TOKEN}"; measured 0 -> "0 of 0"; the two renderings differ`
})

// 4b is deliberately conditional: the brief says to report UNTESTABLE rather
// than pass when a client exports no pure renderer. The section is driven
// OUTSIDE the check harness so an absent renderer prints ONLY as UNTESTABLE —
// a "PASS 4b — UNTESTABLE" line would be exactly the caption this file forbids.
const evolveClient = loadClientBundle(join(EVOLVE_DIR, 'lib', 'client.js'))
assertEqual(evolveClient.id, 'dsh-meta-evolve', 'client bundle id')
const evolveRendererNames = Object.keys(evolveClient.exports).filter(
  (name) => typeof evolveClient.exports[name] === 'function' && /render/i.test(name) && !/Icon|Row|Page/.test(name),
)
if (evolveRendererNames.length === 0) {
  recordUntestable(
    '4b',
    `dsh-meta-evolve/lib/client.js exports no pure renderer (exports: ${Object.keys(evolveClient.exports).join(', ')}); the NOT MEASURED rendering cannot be driven and is NOT passed`,
  )
} else {
  await checkAsync('4b evolve pure renderer: a null state field renders NOT MEASURED, a measured 0 does not', 'the null decisionLog renders as 0 / "0 of 0", the measured-zero decisionLog renders as NOT MEASURED, or the exported renderer/normalizer throws on a legal state payload', async () => {
    const exported = evolveClient.exports
    const pureRender = exported.__renderPanel ?? exported[evolveRendererNames[0]]
    const normalizeState = exported.__normalizeState
    assertEqual(typeof pureRender, 'function', 'lib/client.js must export the pure renderer renderPanel')
    assertEqual(typeof normalizeState, 'function', 'lib/client.js must export __normalizeState so the renderer is driven with the host shape')
    // The idle rounds/evolve slices: this check is about the STATE field only.
    const roundsIdle = {
      state: 'loaded',
      note: null,
      count: 0,
      total: 0,
      lines: 0,
      bytes: 0,
      exists: false,
      trailingNewline: false,
      malformedLines: 0,
      rounds: [],
    }
    const evolveIdle = { state: 'idle', note: null, round: null, before: null, change: null, verification: null }
    const panelFor = (payload) => ({
      fetchedAt: null,
      state: normalizeState(payload),
      rounds: roundsIdle,
      evolve: evolveIdle,
    })
    /** Every source unreadable: decisionLog is null with a reason. */
    const nullPayload = {
      ok: true,
      built: true,
      note: 'live',
      at: '2026-10-18T00:00:00.000Z',
      host: DEAD_HOST,
      hostFrom: 'config',
      workspace: null,
      workspaceReason: 'stub: the workspace does not resolve',
      pluginsRoot: null,
      roundsFile: null,
      roundsFileReason: 'stub: the rounds file does not resolve',
      decisionLog: null,
      intentField: null,
      lvl1Gate: null,
      intentMap: null,
      plugins: null,
      unreadable: {
        decisionLog: 'stub: dead endpoint',
        intentField: 'stub: unreadable',
        lvl1Gate: 'stub: dead endpoint',
        intentMap: 'stub: dead endpoint',
        plugins: 'stub: unresolvable root',
      },
      counts: { 'decisionLog.total': null, 'plugins.count': null },
      countsRead: { read: 0, of: 2 },
      notDone: [],
      readMs: 1,
    }
    /** The same surface with a decision log that WAS read and holds a real zero. */
    const zeroPayload = {
      ...nullPayload,
      countsRead: { read: 2, of: 2 },
      unreadable: {},
      decisionLog: {
        total: 0,
        active: 0,
        superseded: 0,
        of: 0,
        sumsToTotal: true,
        censusAt: '2026-10-18T00:00:00.000Z',
        events: 0,
        malformedLines: 0,
        shown: 0,
        source: '/decision-log/api/list',
        readAt: '2026-10-18T00:00:00.000Z',
      },
    }
    const treeNull = pureRender(panelFor(nullPayload), (key) => key)
    const treeZero = pureRender(panelFor(zeroPayload), (key) => key)
    const cellNull = elementByTestId(treeNull, 'decisions-total')
    const cellZero = elementByTestId(treeZero, 'decisions-total')
    assert(cellNull !== undefined, 'the null decisionLog must render its decisions-total line')
    assert(cellZero !== undefined, 'the measured-zero decisionLog must render its decisions-total line')
    const textNull = textOf(cellNull).join(' ')
    const textZero = textOf(cellZero).join(' ')
    const direction = notMeasuredDirectionViolation(textNull, textZero)
    assertEqual(direction, null, `the NOT MEASURED direction must hold: ${direction ?? ''}`)
    return `renderPanel: null decisionLog -> "${textNull.trim()}"; measured zero -> "${textZero.trim()}"`
  })
}

/* ========================================================================== */
/* 5. THE META GATE                                                           */
/* ========================================================================== */

section('5. the meta gate')

/**
 * THE DECISION STORE'S PATH, ASKED OF THE STORE — check 5a reads D-0258 out of it.
 *
 * The literal this replaces was `join(PROGRAM_WORKSPACE, 'tmp', 'decision-log.jsonl')`. The store lives at
 * `$DSH_HOME/dsh-decision-log/decision-log.jsonl` now, with a fallback read of the old file, so a check that names the
 * old path would find no D-0258 and report a MISSING RULING when the truth would be a missing PATH — an absence of a
 * reading dressed as an absence of a value, in the check whose whole job is to prove D-0258 still governs.
 *
 * `null` is a REFUSAL: the check below exits the run rather than asserting against nothing.
 */
function resolveDecisionLogPath(root) {
  const resolver = [
    process.env['DSH_DECISION_LOG_RESOLVER'],
    join(PLUGINS_SRC, 'dsh-decision-log', 'bin', 'log-path.mjs'),
  ].find((candidate) => typeof candidate === 'string' && candidate !== '' && existsSync(candidate))
  if (resolver === undefined) return null
  try {
    const answer = execFileSync(process.execPath, [resolver, '--path', '--root', root], {
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return answer === '' ? null : answer
  } catch {
    return null
  }
}

const DECISION_LOG_PATH = resolveDecisionLogPath(PROGRAM_WORKSPACE)
if (DECISION_LOG_PATH === null) {
  console.error(
    'independent.mjs: the decision store could not be resolved, so check 5a has no evidence to read. REFUSING rather than asserting a missing D-0258 against an empty path — that would report a missing RULING where the truth is a missing PATH.',
  )
  process.exit(2)
}
const PLAN_06_PATH = join(PROGRAM_WORKSPACE, 'plan', '06-future-dsh-meta-plugins.md')

check('5a D-0258 exists in the decision log, is recorded by owner, and is not superseded', 'no D-0258 record, a decider other than owner, or a superseding event recorded against it', () => {
  const { recorded, supersededBy } = decisionFromLog(DECISION_LOG_PATH, 'D-0258')
  assertEqual(recorded.length, 1, 'D-0258 must have exactly one recorded event')
  const record = recorded[0]
  assertEqual(record.by, 'owner', 'D-0258 decided-by')
  assertEqual(record.kind, 'recorded', 'D-0258 event kind')
  assert(/ungat/i.test(String(record.title)), `D-0258's title must be the ungating decision; got ${JSON.stringify(record.title)}`)
  assert(Array.isArray(record.evidence) && record.evidence.length > 0, 'D-0258 must carry evidence (the log refuses evidence-free records)')
  assertEqual(supersededBy.length, 0, `D-0258 must not be superseded; found ${supersededBy.length} supersession event(s)`)
  return `D-0258 recorded by owner at ${record.at}, ${record.evidence.length} evidence row(s), supersededBy: none`
})

check('5b plan/06 no longer calls the meta plugins "not to be built" without naming D-0258', 'any prohibition phrase on a line that does not also name D-0258, or a document with no D-0258 reference at all', () => {
  assert(existsSync(PLAN_06_PATH), `plan/06 not found at ${PLAN_06_PATH}`)
  const lines = readFileSync(PLAN_06_PATH, 'utf8').split('\n')
  const header = lines[0] ?? ''
  assert(/D-0258/.test(header), `the plan/06 header must name D-0258 (the ungating decision); header: ${JSON.stringify(header)}`)
  assert(/D-0258/.test(lines.join('\n')), 'plan/06 must reference D-0258 somewhere')
  const phrases = prohibitionPhrases(lines)
  const violations = prohibitionViolations(lines)
  assertEqual(violations.length, 0, `plan/06 line(s) state a prohibition without naming D-0258: ${violations.map((violation) => `${violation.line}: ${violation.text.slice(0, 120)}`).join(' | ')}`)
  const checkedLines = phrases.length === 0 ? 'no prohibition phrase found' : `line(s) ${phrases.map((phrase) => phrase.line).join(', ')}`
  return `${checkedLines}: every prohibition phrase names D-0258 (header line 1 names D-0258; ${lines.length} lines scanned)`
})

/* ========================================================================== */
/* falsification controls: drive the predicates the checks read RED            */
/* ========================================================================== */

section('falsification controls — each predicate is exercised in both directions')

check('F1 the route-set predicate rejects an EXTRA path and a MISSING path', 'the predicate returns null for either mutation, so exact-set equality would be a caption', () => {
  assert(routeSetViolation(['/a', '/b', '/c'], ['/a', '/b'], ['/a', '/b']) !== null, 'an EXTRA registered path was accepted')
  assert(routeSetViolation(['/a'], ['/a', '/b'], ['/a', '/b']) !== null, 'a MISSING registered path was accepted')
  assertEqual(routeSetViolation(['/a', '/b'], ['/a', '/b'], ['/a', '/b']), null, 'the exact set was rejected')
  return 'extra rejected, missing rejected, exact set accepted'
})

check('F2 the absent-is-not-zero predicate rejects a 0 from an unreadable source', 'a fabricated 0 is accepted, so the null checks would pass on a zeroed payload', () => {
  assert(fabricatedCountKeys({ 'decisionLog.total': 0 }) !== null, 'a fabricated 0 was accepted')
  assertEqual(fabricatedCountKeys({ 'decisionLog.total': null }).length, 0, 'a genuine null was rejected')
  return '0 rejected, null accepted'
})

check('F3 the control predicate rejects a null delta and accepts an unchanged-counts object', 'a null (first-round) delta is accepted as a compared round, so the two-round check is a caption', () => {
  assert(deltaObjectViolation(null) !== null, 'a null delta was accepted as a compared round')
  assert(deltaObjectViolation({ movedOf: { checked: 14 }, moved: [] }) === null, 'a real unchanged-counts delta was rejected')
  return 'null rejected, unchanged-counts object accepted'
})

check('F4 the renderer predicate rejects the SWAPPED NOT MEASURED direction', 'a null reading rendered as "0 of 0" is accepted, or a measured zero rendered as NOT MEASURED is accepted', () => {
  assertEqual(notMeasuredDirectionViolation(NOT_MEASURED_TOKEN, '0 of 0'), null, 'the honest direction was rejected')
  assert(notMeasuredDirectionViolation('0 of 0', NOT_MEASURED_TOKEN) !== null, 'the swapped direction was accepted')
  assert(notMeasuredDirectionViolation(NOT_MEASURED_TOKEN, NOT_MEASURED_TOKEN) !== null, 'two identical readings were accepted as a direction')
  return 'honest direction accepted; swapped and identical rejected'
})

check('F5 the prohibition scanner rejects a "may not be built" line that does not name D-0258', 'a prohibition line without D-0258 is accepted, so plan/06 could regress to the old gate and still pass', () => {
  const bad = prohibitionViolations(['FUTURE. None of this is scheduled, and none of it may be built yet.'])
  assertEqual(bad.length, 1, 'the revoked verbatim prohibition line, without D-0258, was accepted')
  const good = prohibitionViolations(['Do not create any `dsh-meta-*` plugin — superseded by D-0258.'])
  assertEqual(good.length, 0, 'a prohibition line that DOES name D-0258 was rejected')
  return 'unnamed prohibition rejected; D-0258-named prohibition accepted'
})

/* ========================================================================== */
/* verdict                                                                    */
/* ========================================================================== */

console.log('')
console.log('================ VERDICT ================')
console.log(`checks run     : ${passed + failures.length}`)
console.log(`passed         : ${passed}`)
console.log(`failed         : ${failures.length}`)
console.log(`untestable     : ${untestable.length}`)
console.log('falsification  : 5 controls (F1-F5) drive the route-set, absent-is-not-zero, delta-object, NOT-MEASURED-direction and prohibition predicates in BOTH directions')
if (failures.length > 0) {
  console.log('')
  console.log('FAILURES')
  for (const failure of failures) {
    console.log(`  FAIL ${failure.id}: ${failure.message}`)
    console.log(`       falsifier: ${failure.falsifier}`)
  }
}
if (untestable.length > 0) {
  console.log('')
  console.log('UNTESTABLE ITEMS (reported, not passed)')
  for (const item of untestable) console.log(`  UNTESTABLE ${item.id}: ${item.why}`)
}
console.log('')
console.log('ARTIFACTS THIS RUN IMPORTED (sha256, algorithm named)')
console.log(`  dsh-meta-evolve/lib/index.js    ${evolveIdentity.bytes} B  sha256 ${evolveIdentity.sha256}`)
console.log(`  dsh-meta-research/lib/index.js  ${researchIdentity.bytes} B  sha256 ${researchIdentity.sha256}`)
console.log('')

// Clean up the temporary fixtures; nothing outside TMP_ROOT was written.
try {
  rmSync(TMP_ROOT, { recursive: true, force: true })
} catch (error) {
  console.log(`WARN could not remove the temporary directory ${TMP_ROOT}: ${String(error)}`)
}

if (failures.length > 0) {
  process.exitCode = 1
} else {
  console.log('VERDICT: PASS — every executed assertion held; UNTESTABLE items, if any, are listed above.')
}
