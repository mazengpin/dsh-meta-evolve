/**
 * panel-render.mjs — the meta-evolve panel, checked at the ARTIFACT level.
 *
 * This reads the BUILT browser bundle (`lib/client.js`), not the source. The
 * reason is this program's own rule: a check that reads `src/` passes over an
 * artifact nobody built, and the failure it misses is the one that reaches the
 * user. So the bundle is loaded exactly as the page loads it — `window.__ModuleLoader__.load`
 * is defined, the factory is called with a stub `require` in place of the frozen
 * module table — and the panel is then DRIVEN.
 *
 * WHAT THIS FILE IS BUILT AROUND, and it is the program's most-repeated defect:
 *
 *   **an assertion whose two sides can never differ is a caption.** The panel
 *   must render a populated state DIFFERENTLY from an all-null one — but that
 *   claim is only worth anything if the comparison could fail. So the same
 *   `differs()` predicate used for the main assertion is ALSO applied to two
 *   identical renderings and required to return false, and then one input is
 *   MUTATED and the output is required to move. If the renderer is hard-wired to
 *   print one thing, the mutation checks go red rather than green.
 *
 * THE CONTROLS, in order:
 *
 *   1. the loader contract: id, `name`, `inject`, `apply`, and every module id
 *      the factory asks for is one the shell actually shares;
 *   2. the panel IDENTITY: exactly one `sidebar.panellist` row and exactly one
 *      keyed `main` panel, with the row's `id` EQUAL to the panel's `key` — a row
 *      without its twin renders and then throws on the user's first click;
 *   3. every route path is a COMPLETE quoted literal, and the two honesty tokens
 *      (`NOT MEASURED`, `NOTHING RECORDED`) are RETURNED by code, not merely
 *      mentioned in a comment;
 *   4. THE TWO RENDERINGS DIFFER, through a predicate that is separately shown to
 *      reject identical inputs: an all-null state renders `NOT MEASURED` for
 *      every field (never `0`), and a populated state plus one round renders the
 *      values;
 *   5. ABSENT IS NOT ZERO, and EMPTY IS NOT UNREAD: `rounds` unread renders
 *      `NOT MEASURED`; `rounds` read and empty renders `NOTHING RECORDED`; a
 *      null `decisionLog.total` renders `NOT MEASURED` and never `0`;
 *   6. THE CONTROL IS DRIVEN: `POST /meta-evolve/api/evolve` is called against a
 *      stub host and must come back with the created round, and a re-render must
 *      SHOW that round — a control that only reads a value back is not a control;
 *   7. THE SEAM IS CHECKED against the real files: every `dsh.client.inject`
 *      entry in package.json is in `tsdown.config.ts`'s `CLIENT_EXTERNALS`, so
 *      the two declarations of the module table cannot drift;
 *   8. the client calls no model and opens no device — asserted on the bundle.
 *
 * Every assertion is counted and the total is printed with its denominator.
 * Usage: node verify/panel-render.mjs [lib/client.js]
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUNDLE = process.argv[2] ?? resolvePath(PKG_ROOT, 'lib/client.js')
const resolved = resolvePath(BUNDLE)

let assertCount = 0
let failed = 0
/**
 * One assertion, counted.
 * @param {string} label - what is being asserted, printed on success.
 * @param {() => void} body - throws to fail.
 */
function check(label, body) {
  assertCount += 1
  try {
    body()
  } catch (error) {
    failed += 1
    console.error(`FAIL  ${label}\n      ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  console.log(`PASS  ${label}`)
}

// ---- 0: the artifact exists at all ---------------------------------------
// Deliberately assertion #1 rather than a thrown usage error: an absent build must
// be a RED RUN with a counted failure, not a stack trace a reader could mistake
// for a broken harness.
check(`bundle exists and is non-empty: ${BUNDLE}`, () => {
  if (!existsSync(resolved)) throw new Error(`no built browser bundle at ${resolved} — the client half is not built`)
  if (statSync(resolved).size === 0) throw new Error('the bundle is 0 bytes, which is a failed build rather than an empty panel')
})
if (failed > 0) {
  console.error('')
  console.error(`PANEL RENDER: FAIL — ${failed} of ${assertCount} assertion(s) failed`)
  process.exit(1)
}

const bundleText = readFileSync(resolved, 'utf8')
const bundleBytes = statSync(resolved).size
const sha256 = createHash('sha256').update(readFileSync(resolved)).digest('hex')

// ---- the frozen module table --------------------------------------------
/** @param {unknown} type @param {Record<string, unknown>|null} props @param {...unknown} children */
function h(type, props, ...children) {
  return { type, props: props ?? {}, children: children.flat(Infinity) }
}
const reactStub = {
  createElement: h,
  Fragment: Symbol('Fragment'),
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: () => ({ current: null }),
}
/** Module ids the shell shares into the frozen table (harness `PLATFORM_MODULES`). */
const PLATFORM_WHITELIST = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-client-locale',
])
const TABLE = {
  react: reactStub,
  'react/jsx-runtime': { jsx: h, jsxs: h, Fragment: reactStub.Fragment },
}
const asked = new Set()
/** @param {string} id */
function requireStub(id) {
  asked.add(id)
  if (Object.prototype.hasOwnProperty.call(TABLE, id)) return TABLE[id]
  if (PLATFORM_WHITELIST.has(id)) return { __platform: id }
  throw new Error(`UNRESOLVABLE module id in the client bundle: ${id}`)
}

// ---- load exactly as the page does --------------------------------------
let loaded = null
globalThis.window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
const require = createRequire(import.meta.url)
require(resolved)

let mod = null
check('the bundle registers itself through window.__ModuleLoader__.load', () => {
  if (loaded === null) throw new Error('the bundle never called window.__ModuleLoader__.load')
})
check('bundle id is the package name dsh-meta-evolve', () => {
  if (loaded.id !== 'dsh-meta-evolve') throw new Error(`wrong bundle id: ${JSON.stringify(loaded.id)}`)
})
check('the factory is a function and returns the module', () => {
  if (typeof loaded.factory !== 'function') throw new Error('the factory is not a function')
  mod = loaded.factory(requireStub)
  if (mod === null || typeof mod !== 'object') throw new Error('the factory returned no module object')
})
check('exports name=dsh-meta-evolve and a callable apply', () => {
  if (mod.name !== 'dsh-meta-evolve') throw new Error(`wrong plugin name export: ${JSON.stringify(mod.name)}`)
  if (typeof mod.apply !== 'function') throw new Error('no apply export')
})
check('inject names the two Client services this half reads', () => {
  const want = ['slots', 'locale']
  if (!Array.isArray(mod.inject)) throw new Error(`inject is not an array: ${JSON.stringify(mod.inject)}`)
  const missing = want.filter((service) => !mod.inject.includes(service))
  if (missing.length > 0) throw new Error(`inject is missing ${JSON.stringify(missing)}; got ${JSON.stringify(mod.inject)}`)
})

// ---- the recording fake Client context ----------------------------------
const registrations = []
const dictionaries = []
const injectedSlots = new Set()
const fakeCtx = {
  slots: {
    inject: (key, cb) => { injectedSlots.add(key); cb(); return () => {} },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  locale: {
    register: (ns, lang, dict) => { dictionaries.push({ ns, lang, dict }); return () => {} },
    bind: (ns) => (key) => {
      const dict = dictionaries.find((d) => d.ns === ns && d.lang === 'en')
      return dict?.dict?.[key] ?? key
    },
  },
  effect: (fn) => { const off = fn(); return () => { if (off) off() } },
  logger: { info: () => {}, warn: () => {} },
}
check('apply() runs against a recording Client context and registers the surface', () => {
  mod.apply(fakeCtx)
  if (registrations.length === 0) throw new Error('apply registered no slots')
})

// ---- control 1: no unresolvable ids -------------------------------------
check('every module id the bundle asked for is one the shell shares', () => {
  const bad = [...asked].filter((id) => !Object.prototype.hasOwnProperty.call(TABLE, id) && !PLATFORM_WHITELIST.has(id))
  if (bad.length > 0) throw new Error(`asked for ids the shell does not share: ${JSON.stringify(bad)}`)
})

// ---- control 2: THE PANEL IDENTITY --------------------------------------
const navRows = registrations.filter((r) => r.options.name === 'sidebar.panellist')
const mainPanels = registrations.filter((r) => r.options.name === 'main')
const mainKeys = mainPanels.map((r) => r.options.key)

check('exactly one panel nav row', () => {
  if (navRows.length !== 1) throw new Error(`expected 1 sidebar.panellist row, found ${navRows.length}: ${JSON.stringify(navRows.map((r) => r.options.id))}`)
})
check('exactly one keyed main panel behind it', () => {
  if (mainPanels.length !== 1) throw new Error(`expected 1 main panel, found ${mainPanels.length}: ${JSON.stringify(mainKeys)}`)
})
check('the panel row id is the stable selector dsh-meta-evolve:evolve', () => {
  const ids = navRows.map((r) => r.options.id)
  if (!ids.includes('dsh-meta-evolve:evolve')) throw new Error(`the row id is not the documented selector: ${JSON.stringify(ids)}`)
})
check('the row id EQUALS the main key (a row without its twin throws on first click)', () => {
  const orphans = navRows.filter((r) => !mainKeys.includes(r.options.id))
  if (orphans.length > 0) throw new Error(`orphan row(s), clicking one throws: ${JSON.stringify(orphans.map((r) => r.options.id))}`)
})
check('both slots were declared via slots.inject, not a bare register', () => {
  for (const slot of ['main', 'sidebar.panellist']) {
    if (!injectedSlots.has(slot)) throw new Error(`${slot} was not registered through slots.inject`)
  }
})

// ---- control 3: EVERY ROUTE PATH + THE HONESTY TOKENS -------------------
const ROUTE_PATHS = ['/meta-evolve/api/state', '/meta-evolve/api/rounds', '/meta-evolve/api/evolve']

/** Does the bundle contain this exact string as a complete quoted literal? */
function quotedLiteral(text) {
  return bundleText.includes(`"${text}"`) || bundleText.includes(`'${text}'`)
}

check(`all ${ROUTE_PATHS.length} route path(s) appear as COMPLETE quoted literals in the bundle`, () => {
  const missing = ROUTE_PATHS.filter((path) => !quotedLiteral(path))
  if (missing.length > 0) throw new Error(`the bundle has no complete literal for ${JSON.stringify(missing)} — the panel cannot fetch it (a prefix match is not a path)`)
})
check('the token "NOT MEASURED" is RETURNED by code, not merely mentioned in a comment', () => {
  if (!/return\s+["']NOT MEASURED["']/.test(bundleText)) {
    throw new Error('NOT MEASURED appears only in prose: a null reading would never render the token')
  }
})
check('the token "NOTHING RECORDED" is RETURNED by code (an empty store is its own state)', () => {
  if (!/return\s+["']NOTHING RECORDED["']/.test(bundleText)) {
    throw new Error('NOTHING RECORDED is only prose: an empty rounds store would be indistinguishable from an unread one')
  }
})
check('the bundle distinguishes a 404 from a refusal (it tests response.status)', () => {
  if (!/status\s*===?\s*404/.test(bundleText)) {
    throw new Error('no 404 test in the bundle, so "not mounted" cannot be told apart from "empty" or "refused"')
  }
})
check('the control issues a POST (the method is a literal, not implied)', () => {
  if (!/"POST"|'POST'/.test(bundleText)) throw new Error('no POST literal in the bundle: an evolve control cannot create a round with a read')
})

// ---- the seam: package.json inject vs tsdown CLIENT_EXTERNALS -----------
check('every dsh.client.inject entry is a tsdown CLIENT_EXTERNALS entry', () => {
  const pkg = JSON.parse(readFileSync(resolvePath(PKG_ROOT, 'package.json'), 'utf8'))
  const inject = pkg?.dsh?.client?.inject ?? []
  if (!Array.isArray(inject) || inject.length === 0) throw new Error('package.json declares no dsh.client.inject entries')
  const tsdown = readFileSync(resolvePath(PKG_ROOT, 'tsdown.config.ts'), 'utf8')
  const block = /const CLIENT_EXTERNALS = \[([\s\S]*?)\]/.exec(tsdown)
  if (block === null) throw new Error('tsdown.config.ts has no const CLIENT_EXTERNALS = [...] block')
  const externals = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  if (externals.length === 0) throw new Error('CLIENT_EXTERNALS parsed to zero entries — the extraction, not the seam, is broken')
  const missing = inject.filter((id) => !externals.includes(id))
  if (missing.length > 0) throw new Error(`dsh.client.inject names ${JSON.stringify(missing)}, which CLIENT_EXTERNALS does not contain: the browser composition and the build disagree`)
})

// ---- the renderer, normalizers and control exports ----------------------
const render = mod.__renderPanel
const renderLoadingPanel = mod.__renderLoadingPanel
const roundsLabel = mod.__roundsLabel
const evolveTone = mod.__evolveTone
const normalizeState = mod.__normalizeState
const normalizeRounds = mod.__normalizeRounds
const normalizeEvolve = mod.__normalizeEvolve
const driveEvolve = mod.__evolve
const fetchPanel = mod.__fetchPanel
check('the panel exports its pure renderer, normalizers and control for driving', () => {
  for (const [name, value] of Object.entries({
    __renderPanel: render,
    __renderLoadingPanel: renderLoadingPanel,
    __roundsLabel: roundsLabel,
    __evolveTone: evolveTone,
    __normalizeState: normalizeState,
    __normalizeRounds: normalizeRounds,
    __normalizeEvolve: normalizeEvolve,
    __evolve: driveEvolve,
    __fetchPanel: fetchPanel,
    __fetchState: mod.__fetchState,
    __fetchRounds: mod.__fetchRounds,
  })) {
    if (typeof value !== 'function') throw new Error(`${name} is not exported as a function`)
  }
})

/** The translator the panel receives; identity, so assertions read the real text. */
const t = (key) => {
  const dict = dictionaries.find((d) => d.lang === 'en')
  return dict?.dict?.[key] ?? key
}
/** Every text node in a recorded element tree, flattened. */
function textOf(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object' && 'type' in node) return textOf(node.children)
  return ''
}
/** Find the first element whose props carry a given data-testid. */
function findTestId(node, id) {
  if (node === null || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findTestId(child, id)
      if (hit !== null) return hit
    }
    return null
  }
  if (node.props?.['data-testid'] === id) return node
  return findTestId(node.children, id)
}
/** Every element in a recorded tree, in document order. */
function elementsOf(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, out)
    return out
  }
  out.push(node)
  elementsOf(node.children, out)
  return out
}
/**
 * The VALUE text of a label/value line: the SECOND span of the node.
 *
 * Reading the whole node would include the label, and `textAt(...) === 'NOT
 * MEASURED'` would then be a comparison that can never pass — so the value is
 * addressed explicitly.
 */
function valueAt(tree, id) {
  const node = findTestId(tree, id)
  if (node === null) throw new Error(`no element carries data-testid="${id}"`)
  const children = node.children
  if (!Array.isArray(children) || children.length < 2) throw new Error(`data-testid="${id}" is not a label/value line`)
  return textOf(children[children.length - 1]).trim()
}
/** The difference predicate the main assertion and its falsification both use. */
function differs(a, b) {
  return a !== b
}
function requireDiffers(label, a, b) {
  if (!differs(a, b)) throw new Error(`${label}: the two renderings are identical`)
}
/** A deep clone so a mutation cannot leak into another case. */
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---- fixtures: the HOST HALF'S REAL SHAPES ------------------------------
// Written from src/host/routes.ts and src/host/sources.ts, so the normalization
// is exercised with the names the host actually serves.
const STATE_ALL_NULL = {
  ok: true, built: true, note: 'live', at: '2026-10-18T09:30:00.000Z',
  host: 'http://127.0.0.1:3083', hostFrom: 'default',
  workspace: null, workspaceReason: 'no directory owning plan/ and research/ was found',
  pluginsRoot: null, roundsFile: null, roundsFileReason: 'the workspace did not resolve',
  decisionLog: null, intentField: null, lvl1Gate: null, intentMap: null, plugins: null,
  unreadable: {
    decisionLog: 'fetch failed for /decision-log/api/list: connect ECONNREFUSED',
    intentField: 'field.json could not be read: ENOENT',
    lvl1Gate: '/lvl1-gate/api/status: HTTP 404 Not Found',
    intentMap: '/intent-map/api/map: timed out after 5000ms',
    plugins: 'plugins-src did not resolve among 10 candidates',
  },
  counts: {
    'decisionLog.total': null, 'decisionLog.active': null, 'decisionLog.superseded': null,
    'intentField.rows': null, 'lvl1Gate.runs': null, 'lvl1Gate.sessions': null,
    'intentMap.zones': null, 'intentMap.dim': null, 'plugins.count': null,
  },
  countsRead: { read: 0, of: 9 },
  notDone: ['This route opens no device and calls no model.'],
  readMs: 5012,
}

const STATE_FULL = {
  ok: true, built: true, note: 'live', at: '2026-10-18T09:30:00.000Z',
  host: 'http://127.0.0.1:3083', hostFrom: 'default',
  workspace: { path: '<workspace>', from: 'package-root/../..' },
  workspaceReason: null,
  pluginsRoot: { path: '<program>/plugins-src', from: 'package-root/..' },
  roundsFile: { path: '<workspace>/research/meta-evolve-rounds.jsonl', from: 'workspace/research/meta-evolve-rounds.jsonl' },
  roundsFileReason: null,
  decisionLog: { total: 12, active: 9, superseded: 3, of: 12, sumsToTotal: true, censusAt: '2026-10-18T09:00:00.000Z', events: 141, malformedLines: 0, shown: 12, source: '/decision-log/api/list', readAt: '2026-10-18T09:30:00.000Z' },
  intentField: { rows: 7, of: 7, byValue: { plan: 5, verify: 2 }, byValueOf: 7, rowsWithoutValue: 0, duplicateRowIds: 0, generatedAt: '2026-10-18T08:00:00.000Z', mode: 'field', documents: 3, declaredRows: 7, rowsMatchDeclared: true, file: '<workspace>/plan/intent-field/field.json', bytes: 12345, readAt: '2026-10-18T09:30:00.000Z' },
  lvl1Gate: { hooked: true, hookedAgrees: true, runs: 5, sessions: 4, statusSessionCount: 4, outcomes: { decided: 3, declined: 1, neverRan: 1 }, outcomesOf: 4, last: { outcome: 'declined', reason: 'abstained below armThreshold', channel: 'laya-serve', at: '2026-10-18T09:00:00.000Z' }, revisions: ['lvl1-full', 'lvl1-base'], sources: ['/lvl1-gate/api/status', '/lvl1-gate/api/sessions'], readAt: '2026-10-18T09:30:00.000Z' },
  intentMap: { zones: 6, zoneRows: 6, zonesMatch: true, of: 6, model: 'Xenova/bge-small-en-v1.5', dim: 384, freshness: 'fresh', corpusPlugins: 52, corpusOf: 56, catalogCount: 4527, censusAt: '2026-10-18T09:00:00.000Z', source: '/intent-map/api/map', readAt: '2026-10-18T09:30:00.000Z' },
  plugins: { count: 3, of: 56, names: ['dsh-meta-community', 'dsh-meta-evolve', 'dsh-meta-market'], root: '<program>/plugins-src', readAt: '2026-10-18T09:30:00.000Z' },
  unreadable: {},
  counts: { 'decisionLog.total': 12, 'decisionLog.active': 9, 'decisionLog.superseded': 3, 'intentField.rows': 7, 'lvl1Gate.runs': 5, 'lvl1Gate.sessions': 4, 'intentMap.zones': 6, 'intentMap.dim': 384, 'plugins.count': 3 },
  countsRead: { read: 9, of: 9 },
  notDone: ['This route opens no device and calls no model.'],
  readMs: 84,
}

const ROUND_BASE = {
  n: 7,
  at: '2026-10-18T09:20:00.000Z',
  host: 'http://127.0.0.1:3083',
  workspace: '<workspace>',
  model: 'Xenova/bge-small-en-v1.5',
  counts: { 'decisionLog.total': 12, 'decisionLog.active': 9, 'intentField.rows': 7, 'plugins.count': 3 },
  countsRead: { read: 4, of: 4 },
  fieldReadable: { decisionLog: true, intentField: true, lvl1Gate: true, intentMap: true, plugins: true },
  ids: {
    decisions: ['D-0258'],
    plugins: ['dsh-meta-community', 'dsh-meta-evolve', 'dsh-meta-market'],
    intentRows: [{ id: 'IF-06-3', value: 'verify' }],
  },
  delta: {
    against: 6,
    againstAt: '2026-10-18T09:10:00.000Z',
    counts: { 'decisionLog.active': { from: 8, to: 9, delta: 1, reason: null } },
    moved: [{ key: 'decisionLog.active', from: 8, to: 9, delta: 1 }],
    movedOf: { moved: 1, checked: 4, uncompared: 0 },
    appeared: { decisions: ['D-0258'], plugins: [], intentRows: [{ id: 'IF-06-3', value: 'verify' }] },
    disappeared: { decisions: [], plugins: [], intentRows: [] },
    changed: { intentRows: [{ id: 'IF-06-3', from: 'plan', to: 'verify' }] },
    denominators: {
      decisions: { previous: 11, now: 12 },
      plugins: { previous: 2, now: 3 },
      intentRows: { previous: 6, now: 7 },
    },
    unavailable: {},
  },
  deltaReason: null,
  unreadable: {},
}

const ROUNDS_EMPTY = {
  ok: true, count: 0, total: 0, lines: 0, bytes: 0,
  path: '<workspace>/research/meta-evolve-rounds.jsonl',
  exists: false, trailingNewline: false, malformedLines: 0, malformed: [], rounds: [],
}

const ROUNDS_ONE = {
  ok: true, count: 1, total: 1, lines: 1, bytes: 912,
  path: '<workspace>/research/meta-evolve-rounds.jsonl',
  exists: true, trailingNewline: true, malformedLines: 0, malformed: [], rounds: [ROUND_BASE],
}

const EVOLVE_RESPONSE = {
  ok: true,
  round: ROUND_BASE,
  stored: { path: ROUNDS_ONE.path, bytes: 1824, lines: 2, trailingNewline: true, repairedTrailingNewline: false, appended: true },
  before: { exists: true, lines: 1, rounds: 1 },
  change: { linesDelta: 1, roundsDelta: 1 },
  verification: { verified: true, reason: null, lines: 2, rounds: 2, lastN: 7 },
}

const IDLE = { state: 'idle', note: null, round: null, before: null, change: null, verification: null }

/** Render one view from RAW route payloads, exactly as a live read normalizes them. */
function renderFor(stateRaw, roundsRaw, evolveView = IDLE) {
  const view = {
    fetchedAt: '2026-10-18T09:30:01.000Z',
    state: normalizeState(stateRaw),
    rounds: normalizeRounds(roundsRaw),
    evolve: evolveView,
  }
  const tree = render(view, t)
  return { tree, text: textOf(tree) }
}

const nullCase = renderFor(STATE_ALL_NULL, null)
const emptyCase = renderFor(STATE_FULL, ROUNDS_EMPTY)
const fullCase = renderFor(STATE_FULL, ROUNDS_ONE, normalizeEvolve(EVOLVE_RESPONSE))

// ---- control 4: THE TWO RENDERINGS DIFFER, AND THE PREDICATE CAN FAIL ---
check('the panel root carries its stable selector attributes', () => {
  const root = findTestId(fullCase.tree, 'meta-evolve-panel')
  if (root === null) throw new Error('no element carries data-testid="meta-evolve-panel"')
  if (root.props['data-dsh-panel'] !== 'meta-evolve') throw new Error(`the root selector attribute is ${JSON.stringify(root.props['data-dsh-panel'])}`)
})

// ---- the BOUNDED FRAME / FIXED HEADER / ONE SCROLL BODY -------------------
// Why this is asserted at all: the shell mounts a `main` panel in a flex cell of
// viewport height with `overflow: hidden` (measured `.centerCol` 808 px). The
// BEFORE state, read from the rendered GUI on 2026-10-18: renderer root 2,872 px,
// plugin wrapper 2,937 px, centre column 808 / 2,937 / hidden, body and html
// 808/808 — NO element in the chain was user-scrollable, so the rounds and the
// Evolve control at the bottom were unreachable. `height: 100%` alone measured
// 2,961 px because the page's former wrapper owned the height; removing that
// wrapper makes the frame itself the centre column's flex item and `100%`
// resolves to 808. The contract: a bounded flex-column frame, a header that is
// NOT in the scroller, and ONE `min-height: 0; overflow-y: auto` body.
/**
 * Why a style would fail the bounded-frame contract, or null when it holds.
 * @param {Record<string, unknown> | undefined} style - the frame's style.
 * @returns {string | null} the violation, or null.
 */
function frameViolation(style) {
  const s = style ?? {}
  if (s.display !== 'flex' || s.flexDirection !== 'column') return `display/flexDirection are ${JSON.stringify(s.display)}/${JSON.stringify(s.flexDirection)}, not flex/column — the header and the scroller cannot be siblings`
  if (s.height !== '100%') return `height is ${JSON.stringify(s.height)}, not "100%" — the frame must fill the centre column instead of growing to content (measured 2,872 px)`
  if (s.minHeight !== 0) return `minHeight is ${JSON.stringify(s.minHeight)}, not 0 — an automatic minimum size refuses to shrink and the overflow escapes to the clipped column`
  if (s.overflow !== 'hidden') return `overflow is ${JSON.stringify(s.overflow)}, not "hidden" — content must not escape the frame into the clipped column`
  if (s.boxSizing !== 'border-box') return `boxSizing is ${JSON.stringify(s.boxSizing)}, not "border-box"`
  return null
}
/** The header must be a fixed strip: no flex growth, no shrink. */
function headerViolation(style) {
  const s = style ?? {}
  if (s.flex !== '0 0 auto') return `flex is ${JSON.stringify(s.flex)}, not "0 0 auto" — a growing header would let the body's scroller shrink or the header scroll`
  return null
}
/** The body must be the ONE scroll box: it must flex-grow, be allowed to shrink, and clip. */
function bodyViolation(style) {
  const s = style ?? {}
  if (s.flex !== '1 1 auto') return `flex is ${JSON.stringify(s.flex)}, not "1 1 auto" — the body must take the remaining frame height`
  if (s.minHeight !== 0) return `minHeight is ${JSON.stringify(s.minHeight)}, not 0 — the load-bearing property that stops the body growing to its content`
  if (s.overflowY !== 'auto') return `overflowY is ${JSON.stringify(s.overflowY)}, not "auto" — the tall content stays unreachable`
  return null
}
check('the panel root is a BOUNDED FLEX FRAME (100% height, minHeight 0, overflow hidden)', () => {
  const root = findTestId(fullCase.tree, 'meta-evolve-panel')
  const violation = frameViolation(root.props.style)
  if (violation !== null) throw new Error(`the frame cannot bound itself inside the clipped centre column: ${violation}`)
})
check('the header is a FIXED strip OUTSIDE the scroller', () => {
  const header = findTestId(fullCase.tree, 'meta-evolve-header')
  if (header === null) throw new Error('no element carries data-testid="meta-evolve-header"')
  const violation = headerViolation(header.props.style)
  if (violation !== null) throw new Error(violation)
  if (findTestId(header, 'decisions') !== null) throw new Error('the decisions section is INSIDE the header — content belongs in the scrolling body')
  if (!textOf(header).includes('Meta-evolve state')) throw new Error('the header does not carry the panel title')
})
check('the body is the ONE SCROLLER (flex 1 1 auto, minHeight 0, overflowY auto)', () => {
  const body = findTestId(fullCase.tree, 'meta-evolve-scroll')
  if (body === null) throw new Error('no element carries data-testid="meta-evolve-scroll"')
  const violation = bodyViolation(body.props.style)
  if (violation !== null) throw new Error(violation)
  for (const section of ['decisions', 'intent', 'plugins', 'gate', 'map', 'rounds', 'evolve']) {
    if (findTestId(body, section) === null) throw new Error(`section "${section}" is not inside the scrolling body`)
  }
})
check('the whole panel contains exactly ONE scroller, and it is the body', () => {
  const scrollers = elementsOf(fullCase.tree).filter((el) => {
    const oy = el.props?.style?.overflowY
    return oy === 'auto' || oy === 'scroll'
  })
  if (scrollers.length !== 1) throw new Error(`expected 1 scroll box, found ${scrollers.length}; a second scroller splits the reachable region`)
  if (scrollers[0].props['data-testid'] !== 'meta-evolve-scroll') throw new Error(`the scroller is ${JSON.stringify(scrollers[0].props['data-testid'])}, not the body`)
})
check('the PASSED-IN CONTROLS land in the FIXED header (the Evolve button cannot scroll away)', () => {
  const controls = h('div', { key: 'ctl', 'data-testid': 'fake-controls' }, h('button', { 'data-testid': 'fake-evolve' }, 'Evolve'))
  const view = { fetchedAt: '2026-10-18T09:30:01.000Z', state: normalizeState(STATE_FULL), rounds: normalizeRounds(ROUNDS_ONE), evolve: normalizeEvolve(EVOLVE_RESPONSE) }
  const tree = render(view, t, controls)
  const header = findTestId(tree, 'meta-evolve-header')
  if (header === null) throw new Error('no header in the control-driven rendering')
  if (findTestId(header, 'fake-controls') === null) throw new Error('the controls were NOT placed in the header')
  const body = findTestId(tree, 'meta-evolve-scroll')
  if (body !== null && findTestId(body, 'fake-controls') !== null) throw new Error('the controls are inside the scroller — the Evolve button would scroll out of reach')
})
check('the LOADING first paint uses the SAME frame / header / body contract', () => {
  const controls = h('div', { key: 'ctl', 'data-testid': 'fake-controls' })
  const loading = renderLoadingPanel(t, controls)
  const root = findTestId(loading, 'meta-evolve-panel')
  const header = findTestId(loading, 'meta-evolve-header')
  const body = findTestId(loading, 'meta-evolve-scroll')
  if (root === null || header === null || body === null) throw new Error('the loading paint is missing the frame, header or scroller')
  if (frameViolation(root.props.style) !== null) throw new Error(`loading frame: ${frameViolation(root.props.style)}`)
  if (headerViolation(header.props.style) !== null) throw new Error(`loading header: ${headerViolation(header.props.style)}`)
  if (bodyViolation(body.props.style) !== null) throw new Error(`loading body: ${bodyViolation(body.props.style)}`)
  if (findTestId(header, 'fake-controls') === null) throw new Error('loading controls are not in the fixed header')
})
check('the FRAME / HEADER / BODY rules can FAIL (each rejects its own defect, and accepts the real styles)', () => {
  const goodFrame = findTestId(fullCase.tree, 'meta-evolve-panel').props.style
  const goodHeader = findTestId(fullCase.tree, 'meta-evolve-header').props.style
  const goodBody = findTestId(fullCase.tree, 'meta-evolve-scroll').props.style
  if (frameViolation(goodFrame) !== null) throw new Error('the frame rule rejects the style that WAS measured to work')
  if (headerViolation(goodHeader) !== null) throw new Error('the header rule rejects the style that WAS measured to work')
  if (bodyViolation(goodBody) !== null) throw new Error('the body rule rejects the style that WAS measured to work')
  const badFrames = [
    { ...goodFrame, height: 'auto' },
    { ...goodFrame, minHeight: 'auto' },
    { ...goodFrame, overflow: 'visible' },
    { ...goodFrame, display: 'block' },
  ]
  for (const style of badFrames) {
    if (frameViolation(style) === null) throw new Error(`the frame rule accepted a non-bounding style: ${JSON.stringify(style)}`)
  }
  const badHeaders = [{ flex: '1 1 auto' }, { flex: '0 1 auto' }]
  for (const style of badHeaders) {
    if (headerViolation(style) === null) throw new Error(`the header rule accepted ${JSON.stringify(style)}`)
  }
  const badBodies = [
    { ...goodBody, overflowY: 'hidden' },
    { ...goodBody, overflowY: 'visible' },
    { ...goodBody, minHeight: 'auto' },
    { ...goodBody, flex: '0 1 auto' },
  ]
  for (const style of badBodies) {
    if (bodyViolation(style) === null) throw new Error(`the body rule accepted a non-scrolling style: ${JSON.stringify(style)}`)
  }
})
check('the bundle is a REAL surface, not the inert stub (measured: the stub was 2,416 B)', () => {
  if (bundleBytes < 10_000) throw new Error(`the bundle is ${bundleBytes} B — too small to contain the panel surface`)
})
check('the difference predicate itself can fail: identical renderings do NOT differ', () => {
  if (differs(fullCase.text, fullCase.text)) {
    throw new Error('differs() returned true for two identical renderings — the main difference assertion would be a caption')
  }
})
check('THE DIFFERENCE ASSERTION: the all-null rendering DIFFERS from the populated one', () => {
  requireDiffers('all-null vs populated', nullCase.text, fullCase.text)
  if (fullCase.text.length === 0) throw new Error('the populated rendering is empty')
  if (nullCase.text.length === 0) throw new Error('the all-null rendering is empty — an absent panel is not an empty one')
})

// ---- control 5: ABSENT IS NOT ZERO, AND EMPTY IS NOT UNREAD -------------
const NULL_FIELDS = [
  'decisions-total', 'decisions-active', 'intent-rows', 'intent-byvalue',
  'plugins-count', 'plugins-names', 'gate-hooked', 'gate-runs', 'gate-sessions',
  'gate-outcomes', 'map-zones', 'map-model', 'map-dim',
]
check(`all ${NULL_FIELDS.length} unread field(s) render NOT MEASURED`, () => {
  for (const testId of NULL_FIELDS) {
    const text = valueAt(nullCase.tree, testId)
    if (!text.includes('NOT MEASURED')) throw new Error(`data-testid="${testId}" reads ${JSON.stringify(text)}, not NOT MEASURED`)
  }
})
check('NO unread field renders as the digit 0', () => {
  for (const testId of NULL_FIELDS) {
    const text = valueAt(nullCase.tree, testId)
    if (text === '0' || /^0\b/.test(text)) throw new Error(`data-testid="${testId}" reads ${JSON.stringify(text)} — an absent reading rendered as a value`)
  }
})
check('an unread rounds route renders NOT MEASURED and NOT "NOTHING RECORDED"', () => {
  if (valueAt(nullCase.tree, 'rounds-state') !== 'NOT MEASURED') throw new Error(`rounds-state reads ${JSON.stringify(valueAt(nullCase.tree, 'rounds-state'))}`)
  if (valueAt(nullCase.tree, 'rounds-count') !== 'NOT MEASURED') throw new Error(`rounds-count reads ${JSON.stringify(valueAt(nullCase.tree, 'rounds-count'))}`)
  if (nullCase.text.includes('NOTHING RECORDED')) throw new Error('an UNREAD store rendered as NOTHING RECORDED: unread and empty are the same sentence to a reader')
})
check('a READ-but-empty store renders NOTHING RECORDED as its own state', () => {
  if (valueAt(emptyCase.tree, 'rounds-state') !== 'NOTHING RECORDED') throw new Error(`rounds-state reads ${JSON.stringify(valueAt(emptyCase.tree, 'rounds-state'))}`)
  if (!emptyCase.text.includes('NOTHING RECORDED')) throw new Error('the empty store has no NOTHING RECORDED token')
  if (emptyCase.text.includes('NOT MEASURED')) throw new Error('the empty store also rendered NOT MEASURED — the two states are not distinguished')
})
check('THE EMPTY-STORE rendering DIFFERS from BOTH the unread one and the populated one', () => {
  requireDiffers('empty vs unread', emptyCase.text, nullCase.text)
  requireDiffers('empty vs populated', emptyCase.text, fullCase.text)
})
check('the rounds-state rule names all three states distinctly', () => {
  const unread = roundsLabel(normalizeRounds(null))
  const empty = roundsLabel(normalizeRounds(ROUNDS_EMPTY))
  const recorded = roundsLabel(normalizeRounds(ROUNDS_ONE))
  if (unread !== 'NOT MEASURED') throw new Error(`unread roundsLabel = ${JSON.stringify(unread)}`)
  if (empty !== 'NOTHING RECORDED') throw new Error(`empty roundsLabel = ${JSON.stringify(empty)}`)
  if (recorded !== 'ROUNDS RECORDED') throw new Error(`recorded roundsLabel = ${JSON.stringify(recorded)}`)
  if (new Set([unread, empty, recorded]).size !== 3) throw new Error('the three store states are not distinct tokens')
})

// ---- the populated rendering SHOWS the composed state -------------------
const FULL_TOKEN_CASES = [
  ['decisions-total', ['12 of 12']],
  ['decisions-active', ['9 of 12']],
  ['decisions-superseded', ['3 of 12']],
  ['intent-rows', ['7 of 7']],
  ['intent-byvalue', ['plan 5', 'verify 2']],
  ['plugins-count', ['3 of 56']],
  ['plugins-names', ['dsh-meta-community', 'dsh-meta-evolve', 'dsh-meta-market']],
  ['gate-hooked', ['true']],
  ['gate-runs', ['5']],
  ['gate-sessions', ['4']],
  ['gate-outcomes', ['decided 3', 'declined 1', 'neverRan 1', 'of 4']],
  ['gate-last-outcome', ['declined']],
  ['map-zones', ['6 of 6']],
  ['map-model', ['bge-small-en-v1.5']],
  ['map-dim', ['384']],
  ['rounds-count', ['1 of 1']],
  ['rounds-lines', ['1']],
]
check(`all ${FULL_TOKEN_CASES.length} populated reading(s) render their values`, () => {
  for (const [testId, tokens] of FULL_TOKEN_CASES) {
    const text = valueAt(fullCase.tree, testId)
    for (const token of tokens) {
      if (!text.includes(token)) throw new Error(`data-testid="${testId}" reads ${JSON.stringify(text)}, missing ${JSON.stringify(token)}`)
    }
  }
})
check('the recorded round renders its delta, denominator and id movement', () => {
  const round = findTestId(fullCase.tree, 'round-7')
  if (round === null) throw new Error('no element carries data-testid="round-7"')
  const text = textOf(round)
  for (const token of ['against round 6', 'decisionLog.active 8→9 (+1)', '1 of 4', 'D-0258', 'IF-06-3: plan→verify']) {
    if (!text.includes(token)) throw new Error(`round-7 reads ${JSON.stringify(text.slice(0, 600))}, missing ${JSON.stringify(token)}`)
  }
})
check('the evolve badge is green ONLY because the round was verified AND the file grew', () => {
  const badge = findTestId(fullCase.tree, 'evolve-tone')
  if (badge === null) throw new Error('no evolve-tone element')
  if (badge.props['data-tone'] !== 'ok') throw new Error(`a verified, line-growing round rendered tone=${JSON.stringify(badge.props['data-tone'])}`)
})
check('the tone rule refuses ok when the file did NOT grow, and when the round was not verified', () => {
  const grown = { state: 'done', note: null, round: null, before: { exists: true, lines: 1, rounds: 1 }, change: { linesDelta: 1, roundsDelta: 1 }, verification: { verified: true, reason: null, lines: 2, rounds: 2 } }
  const flat = { ...grown, change: { linesDelta: 0, roundsDelta: 0 } }
  const unverified = { ...grown, verification: { verified: false, reason: 'the file was re-read and did not return the round', lines: 2, rounds: 2 } }
  const failed = { state: 'failed', note: 'HTTP 503', round: null, before: null, change: null, verification: null }
  if (evolveTone(grown) !== 'ok') throw new Error(`verified+grown tone = ${evolveTone(grown)}`)
  if (evolveTone(flat) === 'ok') throw new Error('a round that did not grow the file rendered ok — the control only acknowledged itself')
  if (evolveTone(unverified) === 'ok') throw new Error('an unverified write rendered ok')
  if (evolveTone(failed) === 'ok') throw new Error('a failed POST rendered ok')
  if (evolveTone(IDLE) !== 'unknown') throw new Error(`idle tone = ${evolveTone(IDLE)}`)
})

// ---- MUTATION: one input moved, the output must move --------------------
check('MUTATION 1: decisionLog.total 12→13 changes the rendering', () => {
  const mutated = clone(STATE_FULL)
  mutated.decisionLog.total = 13
  mutated.decisionLog.of = 13
  mutated.decisionLog.active = 10
  const mutatedCase = renderFor(mutated, ROUNDS_ONE, normalizeEvolve(EVOLVE_RESPONSE))
  if (!differs(mutatedCase.text, fullCase.text)) throw new Error('the renderer ignored decisionLog.total: two different inputs produced the same output')
  if (!valueAt(mutatedCase.tree, 'decisions-total').includes('13 of 13')) throw new Error(`mutated decisions-total reads ${JSON.stringify(valueAt(mutatedCase.tree, 'decisions-total'))}`)
})
check('MUTATION 2: replacing the plugin names changes the rendering', () => {
  const mutated = clone(STATE_FULL)
  mutated.plugins.names = ['dsh-meta-market']
  const mutatedCase = renderFor(mutated, ROUNDS_ONE, normalizeEvolve(EVOLVE_RESPONSE))
  if (!differs(mutatedCase.text, fullCase.text)) throw new Error('the renderer ignored plugins.names')
  if (valueAt(mutatedCase.tree, 'plugins-names') !== 'dsh-meta-market') throw new Error(`mutated plugins-names reads ${JSON.stringify(valueAt(mutatedCase.tree, 'plugins-names'))}`)
})
check('MUTATION 3: round n 7→8 changes the rendering', () => {
  const mutatedRounds = clone(ROUNDS_ONE)
  mutatedRounds.rounds[0].n = 8
  const mutatedCase = renderFor(STATE_FULL, mutatedRounds, normalizeEvolve(EVOLVE_RESPONSE))
  if (!differs(mutatedCase.text, fullCase.text)) throw new Error('the renderer ignored the round number')
  if (findTestId(mutatedCase.tree, 'round-8') === null) throw new Error('the mutated round did not render under data-testid="round-8"')
  if (findTestId(mutatedCase.tree, 'round-7') !== null) throw new Error('round-7 still renders after it was renamed to 8')
})
check('MUTATION 4: one field set to null renders NOT MEASURED, never 0 (the per-field absent rule)', () => {
  const mutated = clone(STATE_FULL)
  mutated.decisionLog.total = null
  const mutatedCase = renderFor(mutated, ROUNDS_ONE, normalizeEvolve(EVOLVE_RESPONSE))
  const text = valueAt(mutatedCase.tree, 'decisions-total')
  if (!text.includes('NOT MEASURED')) throw new Error(`a null total rendered ${JSON.stringify(text)}`)
  if (text === '0' || /^0\b/.test(text)) throw new Error('a null total rendered as 0')
  if (!differs(mutatedCase.text, fullCase.text)) throw new Error('setting a field to null did not change the rendering')
})

// ---- control 6: DRIVE THE CONTROL (POST, then SHOW the created round) ---
const originalFetch = globalThis.fetch
const originalLocation = globalThis.location
/** Serve one payload as a fetch Response-shaped stub. */
function responseStub(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async text() { return JSON.stringify(body) },
    async json() { return body },
  }
}
const evolveCalls = []
globalThis.location = { href: 'http://127.0.0.1:3083/session/abc?token=launch-token#frag' }
globalThis.fetch = async (url, init) => {
  evolveCalls.push({ url, init })
  return responseStub(EVOLVE_RESPONSE)
}
let evolveOutcome = null
try {
  evolveOutcome = await driveEvolve()
} finally {
  globalThis.fetch = originalFetch
  globalThis.location = originalLocation
}
check('the Evolve control POSTs the evolve route against the page origin', () => {
  if (evolveCalls.length !== 1) throw new Error(`expected 1 request, got ${evolveCalls.length}`)
  if (evolveCalls[0].url !== 'http://127.0.0.1:3083/meta-evolve/api/evolve') {
    throw new Error(`POSTed ${JSON.stringify(evolveCalls[0].url)} — the launch token must be dropped and the page prefix kept`)
  }
  if (evolveCalls[0].init?.method !== 'POST') throw new Error(`the control used method ${JSON.stringify(evolveCalls[0].init?.method)}`)
})
check('the POST response normalizes into the CREATED round with its file change and verification', () => {
  if (evolveOutcome === null || evolveOutcome.state !== 'done') throw new Error(`evolve outcome state = ${JSON.stringify(evolveOutcome?.state)}`)
  if (evolveOutcome.round?.n !== 7) throw new Error(`the created round n = ${JSON.stringify(evolveOutcome.round?.n)}`)
  if (evolveOutcome.change?.linesDelta !== 1) throw new Error(`the reported line delta = ${JSON.stringify(evolveOutcome.change?.linesDelta)}`)
  if (evolveOutcome.verification?.verified !== true) throw new Error('the host reported the written line was not re-read and matched')
})
check('THE PANEL SHOWS THE ROUND THE CLICK PRODUCED (not merely the refreshed list)', () => {
  const evolvedCase = renderFor(STATE_FULL, ROUNDS_ONE, evolveOutcome)
  if (!valueAt(evolvedCase.tree, 'evolve-round').includes('n=7')) throw new Error(`evolve-round reads ${JSON.stringify(valueAt(evolvedCase.tree, 'evolve-round'))}`)
  if (!valueAt(evolvedCase.tree, 'evolve-change').includes('1 → +1')) throw new Error(`evolve-change reads ${JSON.stringify(valueAt(evolvedCase.tree, 'evolve-change'))}`)
  if (valueAt(evolvedCase.tree, 'evolve-verify') !== 'the recorded line was re-read and matched') {
    throw new Error(`evolve-verify reads ${JSON.stringify(valueAt(evolvedCase.tree, 'evolve-verify'))}`)
  }
  if (!differs(evolvedCase.text, renderFor(STATE_FULL, ROUNDS_ONE, IDLE).text)) {
    throw new Error('the rendering after the click is identical to the idle rendering: the control acknowledged itself without showing the new round')
  }
})
check('a REFUSED evolve renders as a refusal, not as a dead panel', () => {
  const refused = normalizeEvolve({ ok: false, error: 'the rounds file has no resolved path; a round will not be recorded nowhere', reason: 'the workspace did not resolve' })
  if (refused.state !== 'failed') throw new Error(`a refused POST normalized to ${JSON.stringify(refused.state)}`)
  if (evolveTone(refused) === 'ok') throw new Error('a refused POST rendered ok')
  const refusedCase = renderFor(STATE_FULL, ROUNDS_ONE, refused)
  if (!refusedCase.text.includes('EVOLVE FAILED')) throw new Error('a refused POST did not render the EVOLVE FAILED token')
})

// ---- read path: the two GETs compose, and a 404 is not an empty store ---
const readCalls = []
globalThis.fetch = async (url) => {
  readCalls.push(url)
  if (url.endsWith('/meta-evolve/api/state')) return responseStub(STATE_FULL)
  if (url.endsWith('/meta-evolve/api/rounds')) return responseStub(ROUNDS_ONE)
  return responseStub({ ok: false, error: 'no such route' }, 404)
}
let panelRead = null
try {
  panelRead = await fetchPanel()
} finally {
  globalThis.fetch = originalFetch
}
check('fetchPanel reads BOTH routes and composes one view', () => {
  if (panelRead === null) throw new Error('fetchPanel resolved to null')
  if (readCalls.length !== 2) throw new Error(`expected 2 reads, got ${readCalls.length}: ${JSON.stringify(readCalls)}`)
  if (panelRead.state.state !== 'loaded') throw new Error(`the state read normalized to ${JSON.stringify(panelRead.state.state)}`)
  if (panelRead.state.decisionLog.read?.total !== 12) throw new Error(`the state read did not normalize: total = ${JSON.stringify(panelRead.state.decisionLog.read?.total)}`)
  if (panelRead.rounds.rounds?.length !== 1) throw new Error(`the rounds read did not normalize: ${JSON.stringify(panelRead.rounds.rounds?.length)} round(s)`)
  if (panelRead.evolve.state !== 'idle') throw new Error(`a fresh read started the control in ${JSON.stringify(panelRead.evolve.state)}`)
})

let missingPanel = null
globalThis.fetch = async () => responseStub({ ok: false, error: 'no such route' }, 404)
try {
  missingPanel = await fetchPanel()
} finally {
  globalThis.fetch = originalFetch
}
check('a 404 on BOTH routes is UNREAD, not an empty store (the two are different sentences)', () => {
  if (missingPanel === null) throw new Error('the 404 read produced no view')
  if (missingPanel.state.state !== 'not-mounted') throw new Error(`a 404 state read normalized to ${JSON.stringify(missingPanel.state.state)}`)
  if (missingPanel.state.decisionLog.read !== null) throw new Error('a 404 state read invented a field')
  if (missingPanel.rounds.state !== 'not-mounted') throw new Error(`a 404 rounds read normalized to ${JSON.stringify(missingPanel.rounds.state)}`)
  if (roundsLabel(missingPanel.rounds) !== 'NOT MEASURED') throw new Error(`a 404 rounds read renders ${JSON.stringify(roundsLabel(missingPanel.rounds))}`)
  if (textOf(render(missingPanel, t)).includes('NOTHING RECORDED')) throw new Error('a 404 rounds read rendered as NOTHING RECORDED')
})

// ---- control 7: the client calls no model and opens no device ------------
check('the bundle opens no device and calls no model (no llama/nvidia/socket/fs)', () => {
  for (const token of ['llama', 'nvidia', 'WebSocket', 'child_process', 'node:http', 'node:fs', 'cuda', 'gpu']) {
    if (bundleText.includes(token)) throw new Error(`the client bundle mentions ${JSON.stringify(token)} — the client half must call no model and open no device`)
  }
})
check('the panel reads no session seat it never receives (no useProjection, no props.sessionId)', () => {
  const text = String(loaded.factory)
  if (/useProjection/.test(text)) throw new Error('the bundle references useProjection, which a root-scope main panel never receives')
  if (/props\.sessionId/.test(text)) throw new Error('the bundle reads props.sessionId, which a root-scope main panel never receives')
})
check('the two dictionaries have identical key sets', () => {
  const ns = dictionaries[0]?.ns
  if (ns === undefined) throw new Error('no dictionary was registered at all')
  const en = dictionaries.find((d) => d.ns === ns && d.lang === 'en')
  const zh = dictionaries.find((d) => d.ns === ns && d.lang === 'zh')
  if (en === undefined) throw new Error('no en dictionary')
  if (zh === undefined) throw new Error('no zh dictionary')
  const enKeys = Object.keys(en.dict).sort()
  const zhKeys = Object.keys(zh.dict).sort()
  if (JSON.stringify(enKeys) !== JSON.stringify(zhKeys)) throw new Error(`key sets differ: en=${JSON.stringify(enKeys)} zh=${JSON.stringify(zhKeys)}`)
})

// ---- control 9: THE IDENTITY CHANNEL — THREE STATES, AND IT CAN STAY QUIET ----
// Why this control exists: for four recorded rounds the delta could not see an
// identity swap at held dimension, so the panel said nothing had changed. The fix
// added a comparison channel; THIS control is the one that has to prove the row can
// also be SILENT, because a render test that only shows "the drift row can appear"
// has not shown it can stay quiet — and a row that always says CHANGED is exactly
// the caption this program keeps paying for. So every drift assertion below is
// paired with the AGREEING case, and the last check drives the render red by
// flipping ONLY `changed`.
/**
 * One rounds payload whose delta carries the given identity values.
 * @param {Record<string, unknown> | undefined} values - `undefined` omits the channel entirely.
 * @returns {object} the rounds payload.
 */
function roundsWithIdentity(values) {
  const delta = { ...ROUND_BASE.delta }
  if (values === undefined) delete delta.values
  else delta.values = values
  return { ...ROUNDS_ONE, rounds: [{ ...ROUND_BASE, delta }] }
}
/** The rendered identity line for one identity fixture. */
function identityValue(values) {
  return valueAt(renderFor(STATE_FULL, roundsWithIdentity(values)).tree, 'round-7-identity')
}

check('identity: a CHANGED model renders from -> to and names the change', () => {
  const text = identityValue({ model: { from: 'laya-encoder-1024', to: ROUND_BASE.model, changed: true, reason: null } })
  if (!text.includes('laya-encoder-1024')) throw new Error(`the previous identity did not render: ${JSON.stringify(text)}`)
  if (!text.includes(ROUND_BASE.model)) throw new Error(`the current identity did not render: ${JSON.stringify(text)}`)
  if (!text.includes('CHANGED')) throw new Error(`a changed identity did not render the change token: ${JSON.stringify(text)}`)
})

check('identity: an UNCHANGED model renders as unchanged and NOT as CHANGED (the agreeing case)', () => {
  const text = identityValue({ model: { from: ROUND_BASE.model, to: ROUND_BASE.model, changed: false, reason: null } })
  if (!text.includes('unchanged')) throw new Error(`an agreeing identity did not render as unchanged: ${JSON.stringify(text)}`)
  if (text.includes('CHANGED')) throw new Error(`an agreeing identity rendered the DRIFT token — the row cannot stay quiet: ${JSON.stringify(text)}`)
})

check('identity: an UNREADABLE identity renders UNKNOWN, never unchanged and never CHANGED', () => {
  const reason = 'the identity was not measured in round 3'
  const text = identityValue({ model: { from: null, to: null, changed: null, reason } })
  if (!text.includes('UNKNOWN')) throw new Error(`an unmeasured identity did not render UNKNOWN: ${JSON.stringify(text)}`)
  if (!text.includes(reason)) throw new Error(`the reason was dropped: ${JSON.stringify(text)}`)
  if (text.includes('unchanged')) throw new Error(`an unmeasured identity rendered as UNCHANGED — absent read as agreement: ${JSON.stringify(text)}`)
  if (text.includes('CHANGED')) throw new Error(`an unmeasured identity rendered as CHANGED: ${JSON.stringify(text)}`)
})

check('identity: a round that predates the channel renders NOT MEASURED, not unchanged', () => {
  const text = identityValue(undefined)
  if (text !== 'NOT MEASURED') throw new Error(`a pre-channel round rendered ${JSON.stringify(text)}, expected "NOT MEASURED" — a round that never carried the channel is not a round with no drift`)
})

check('identity falsifier: flipping ONLY `changed` moves the render, so the row is an assertion', () => {
  const on = identityValue({ model: { from: 'laya-encoder-1024', to: ROUND_BASE.model, changed: true, reason: null } })
  const off = identityValue({ model: { from: 'laya-encoder-1024', to: ROUND_BASE.model, changed: false, reason: null } })
  requireDiffers('identity drift vs agreement', on, off)
  if (off.includes('CHANGED')) throw new Error(`the flipped render still carries the drift token: ${JSON.stringify(off)}`)
})

check('identity: the row carries its localized label, so the locale key resolved', () => {
  const node = findTestId(renderFor(STATE_FULL, roundsWithIdentity(undefined)).tree, 'round-7-identity')
  if (node === null) throw new Error('no element carries data-testid="round-7-identity"')
  const label = textOf(node.children[0]).trim()
  if (label !== 'Identity') throw new Error(`the identity row's label is ${JSON.stringify(label)}, expected "Identity" — an unresolved locale key would render empty`)
})

// ---- RENDERED EVIDENCE, printed for a reader; no assertion depends on it ----
// A PASS line says an assertion held. It does not show WHAT a user would see, and
// this program's own rule is that a value printed without the assertion that reads it
// is a caption. These are the opposite: they are CAPTIONS attached to assertions that
// already ran above, printed so a reader can see the rendered row rather than trust
// the check's name.
console.log('')
console.log('===== THE IDENTITY ROW, AS RENDERED BY THE BUILT PANEL =====')
const IDENTITY_STATES = [
  ['drift (changed:true)', { model: { from: 'laya-encoder-1024', to: ROUND_BASE.model, changed: true, reason: null } }],
  ['agreeing (changed:false)', { model: { from: ROUND_BASE.model, to: ROUND_BASE.model, changed: false, reason: null } }],
  ['unmeasured (changed:null)', { model: { from: null, to: null, changed: null, reason: 'the identity was not measured in round 3' } }],
  ['pre-channel (channel absent)', undefined],
]
for (const [label, values] of IDENTITY_STATES) {
  try {
    console.log(`  ${String(label).padEnd(30)} ${identityValue(values)}`)
  } catch (error) {
    console.log(`  ${String(label).padEnd(30)} (NOT RENDERED: ${error instanceof Error ? error.message : String(error)})`)
  }
}

// THE REAL RECORDED ROUND, rendered by the same panel. Round 5 was recorded
// 2026-10-22T05:12:41.801Z, BEFORE the identity channel existed, so it carries no
// `values` and must render NOT MEASURED — which is the correct reading and not a bug:
// a round that never carried the channel is not a round with no drift.
const REAL_RECORD = resolvePath(PKG_ROOT, '..', '..', 'profiles-tree', 'personal-dev', 'dsh-meta-evolve_INIT_WORKSPACE', 'research', 'meta-evolve-rounds.jsonl')
if (existsSync(REAL_RECORD)) {
  try {
    const text = readFileSync(REAL_RECORD, 'utf8')
    const rounds = text.split(String.fromCharCode(10)).filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
    const payload = {
      ok: true, count: rounds.length, total: rounds.length, lines: rounds.length,
      bytes: Buffer.byteLength(text), path: REAL_RECORD, exists: true,
      trailingNewline: text.endsWith(String.fromCharCode(10)), malformedLines: 0, malformed: [], rounds,
    }
    const { tree: realTree } = renderFor(STATE_FULL, payload)
    const last = rounds[rounds.length - 1]
    console.log('')
    console.log(`===== THE REAL RECORDED ROUND n=${last.n} OF ${rounds.length}, RENDERED =====`)
    console.log(`  record: ${REAL_RECORD}`)
    console.log(`  ${'round n'.padEnd(30)} ${rounds.map((r) => r.n).join(', ')}`)
    for (const round of rounds) {
      // A round with NO delta is a first round and renders its deltaReason instead of a
      // delta section, so it has no identity row AT ALL. That is a fourth case again,
      // and it is handled rather than allowed to abort the whole listing.
      let cell
      try {
        cell = valueAt(realTree, `round-${round.n}-identity`)
      } catch {
        cell = round.delta === null ? '(no delta section: first round)' : '(identity row not rendered)'
      }
      const model = round.model === null ? 'model NOT MEASURED' : `model ${round.model}`
      console.log(`  round ${String(round.n).padEnd(2)} identity row           ${cell}   [${model}]`)
    }
    // THE FIRST ROUND THAT CAN CARRY THE CHANNEL, as it would render. The current
    // identity is the REAL one recorded in the last round (`qwen3-embedding:0.6b`); the
    // previous one is the stand-in the task-10 mutation used, because no recorded round
    // ever carried a different identity — which is the whole point of the defect.
    if (last.model !== null && last.model !== undefined) {
      const projected = {
        ...payload,
        rounds: [{ ...last, n: last.n + 1, delta: { ...last.delta, values: { model: { from: 'laya-encoder-1024', to: last.model, changed: true, reason: null } } } }],
      }
      const { tree: projectedTree } = renderFor(STATE_FULL, projected)
      console.log('')
      console.log('===== THE FIRST ROUND THAT CAN CARRY THE CHANNEL, AS IT WOULD RENDER =====')
      console.log(`  round ${last.n + 1}  identity row           ${valueAt(projectedTree, `round-${last.n + 1}-identity`)}   [current identity from the real round-${last.n} record]`)
    }
  } catch (error) {
    console.log(`  (the real record could not be rendered: ${error instanceof Error ? error.message : String(error)})`)
  }
} else {
  console.log(`  (no real record at ${REAL_RECORD})`)
}

// ---- the verdict ---------------------------------------------------------
console.log('')
console.log(`bundle:  ${resolved}`)
console.log(`bytes:   ${bundleBytes}`)
console.log(`sha256:  ${sha256}`)
console.log(`asserts: ${assertCount - failed}/${assertCount} passed`)
if (failed > 0) {
  console.error(`PANEL RENDER: FAIL — ${failed} of ${assertCount} assertion(s) failed`)
  process.exit(1)
}
console.log('ALL META-EVOLVE PANEL RENDER CHECKS PASSED')
