/**
 * Client half of `dsh-meta-evolve` — the panel a person sees and controls.
 *
 * THREE registrations, and the pairing is the point:
 *
 *  1. this plugin's dictionaries in the shared locale service (en + zh);
 *  2. **one nav row** in `sidebar.panellist`;
 *  3. **one keyed `main` panel** behind that row, because a row whose panel does
 *     not exist renders and then throws on the user's first click.
 *
 * THE TRAP THIS FILE IS WRITTEN AROUND — a property of the SEAM, not of any one
 * plugin, and the sibling `dsh-lvl1-gate/src/client/index.ts` records it at
 * length:
 *
 *   **the row's `id` in `sidebar.panellist` must equal the panel's `key` in `main`.**
 *
 * The two slots spell identity differently: `sidebar.panellist` is a LIST and
 * builds rows from `options.id`, while `main` is `kind: 'keyed'` and `ui-layout`
 * matches `entry.options.key`. The shell hands the row's `id` to `selectPanel`,
 * and `layout.selectPanel: main panel "<id>" is not registered` throws when no
 * `main` entry carries that key. Registering `{ id: X }` in BOTH slots looks
 * correct and still throws, so the two constants below are two declarations of one
 * value and `verify/panel-render.mjs` asserts the equality — a row without its
 * twin is a click that throws, and the harness drives that agreement rather than
 * trusting this comment.
 *
 * THE TEST SEAM IS DELIBERATE. `renderPanel`, `roundsLabel`, `evolveTone`, the
 * three normalizers and `evolve` are exported so the built bundle can be DRIVEN
 * without a browser. In particular the honesty rules — a null field renders
 * NOT MEASURED and never `0`, an empty rounds store renders NOTHING RECORDED and
 * never NOT MEASURED — are claims about the pure renderer's OUTPUT, so a check
 * that only grepped the bundle for the tokens would pass on a renderer that had
 * the strings and still printed `0`. `verify/panel-render.mjs` drives the
 * function, then mutates an input and requires the output to move, so the
 * difference assertion cannot be a caption.
 *
 * @module dsh-meta-evolve/client
 */

import { createElement as h, type ReactElement } from 'react'
import { LOCALE_NS, en, zh } from './locales.ts'
import { PanelPage } from './PanelPage.ts'
import {
  ROUTES,
  evolve,
  fetchPanel,
  fetchRounds,
  fetchState,
  normalizeEvolve,
  normalizeRounds,
  normalizeState,
} from './api.ts'
import { evolveTone, renderLoadingPanel, renderPanel, roundsLabel } from './view.ts'
import type { ClientContext, Translator } from './types.ts'

/** Loader row name; the Client bundle registers itself under this same id. */
export const name = 'dsh-meta-evolve'

/** The two Client services this half reads. */
export const inject = ['slots', 'locale']

/**
 * The panel's identity, declared once per spelling.
 *
 * {@link PANEL_ROW_ID} is the `sidebar.panellist` row's `id` and
 * {@link PANEL_MAIN_KEY} is the `main` panel's `key`. They hold the same string
 * ON PURPOSE — see the module header — and both are namespaced so they cannot
 * collide with a shipped panel id.
 */
const PANEL_ROW_ID = 'dsh-meta-evolve:evolve'
/** The `main` key the row selects. MUST equal {@link PANEL_ROW_ID}. */
const PANEL_MAIN_KEY = 'dsh-meta-evolve:evolve'

/** Position among the global panel rows, ascending. Sits after the LVL1 gate's row. */
const PANEL_ROW_ORDER = 6.55

/**
 * The row's glyph, drawn inline so the bundle needs no asset fetch.
 * @returns the svg element.
 */
function EvolveRowIcon(): ReactElement {
  return h('svg', {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
  h('path', { d: 'M13 5.5V2.8l-2.2 1.6' }),
  h('path', { d: 'M13.2 6.4a5.4 5.4 0 1 0-1.1 6' }),
  h('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor', stroke: 'none' }))
}

/**
 * Register the dictionaries, the nav row and the keyed main panel.
 * @param ctx - the Client plugin context (`slots`, `locale`, `effect`, `logger`).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, 'en', en as unknown as Record<string, string>),
    'dsh-meta-evolve: en dictionary',
  )
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, 'zh', zh as unknown as Record<string, string>),
    'dsh-meta-evolve: zh dictionary',
  )

  const t: Translator = ctx.locale.bind(LOCALE_NS)

  // The `main` panel. A ROOT-scope KEYED panel: identity is `key`, and the page
  // receives no session seat. Registered FIRST so the row below can never select a
  // key that does not exist yet.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_MAIN_KEY,
    locale: LOCALE_NS,
    registrant: 'dsh-meta-evolve',
    inject: () => ({ t }),
  }, PanelPage as unknown as (props: Record<string, unknown>) => ReactElement | null))

  // The `sidebar.panellist` row. A LIST row, so the identity is `id` — and it must
  // equal the `main` key above or the click throws.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ROW_ID,
    order: PANEL_ROW_ORDER,
    label: () => t('row'),
    locale: LOCALE_NS,
    registrant: 'dsh-meta-evolve',
    inject: () => ({ t }),
  }, EvolveRowIcon))

  ctx.logger.info(
    `dsh-meta-evolve: client active; nav row ${PANEL_ROW_ID}@${PANEL_ROW_ORDER} with keyed main twin ${PANEL_MAIN_KEY}, plus dictionaries`,
  )
}

/* ------------------------------------------------------------------------- */
/* The driven seam, exported for verify/panel-render.mjs                     */
/* ------------------------------------------------------------------------- */

/** The pure renderer the panel uses, exported so it can be DRIVEN. */
export const __renderPanel = renderPanel

/** The loading first paint, exported so the harness can prove it uses the SAME frame. */
export const __renderLoadingPanel = renderLoadingPanel

/** The rounds-store state rule, exported so `NOTHING RECORDED` / `NOT MEASURED` can be driven apart. */
export const __roundsLabel = roundsLabel

/** The control's tone rule, exported for the same reason. */
export const __evolveTone = evolveTone

/** The three normalizers, exported so fixtures are normalized the SAME way a live read is. */
export const __normalizeState = normalizeState
export const __normalizeRounds = normalizeRounds
export const __normalizeEvolve = normalizeEvolve

/** The control itself, exported so the harness can drive the POST against a stub host. */
export const __evolve = evolve

/** The read calls, exported so a live host can be driven without this file's page. */
export const __fetchPanel = fetchPanel
export const __fetchState = fetchState
export const __fetchRounds = fetchRounds

/** The three route paths and the control's path, from the one place they are declared. */
export const __ROUTES = ROUTES
