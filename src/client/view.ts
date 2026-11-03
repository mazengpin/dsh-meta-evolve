/**
 * The meta-evolve panel's VIEW MODEL and its PURE RENDERER.
 *
 * WHY THE RENDERER IS SEPARATE FROM THE COMPONENT. A React function component can
 * only run under a hook dispatcher, so a check that wants to drive what a human
 * sees would either need a browser or would have to re-implement the component —
 * and a re-implementation is not a check. `renderPanel` is a plain function of
 * (view, translator), so the built bundle can be loaded and the panel DRIVEN with
 * a stubbed `createElement` that records the element tree. `verify/panel-render.mjs`
 * does exactly that and asserts a populated rendering DIFFERS from an all-null
 * one, then mutates an input and requires the output to move, so the difference
 * assertion cannot be a caption.
 *
 * FOUR RULES THIS FILE ENFORCES, all of them this program's own:
 *
 *  1. **A MISSING READING IS NOT A ZERO.** Every value is `null` when its source
 *     did not answer, and `null` renders `NOT MEASURED`. `0` is reserved for a
 *     count that was actually taken and came back empty. The host half is
 *     explicit about the same rule (`src/host/sources.ts`), and this renderer
 *     never coerces a null on the way to a human.
 *  2. **AN EMPTY STORE IS ITS OWN STATE.** `rounds` answering with `total: 0`
 *     and no rows means NOTHING RECORDED — a different statement from
 *     `NOT MEASURED`, which means the rounds route did not answer at all. A
 *     panel that showed them the same way would turn "we never evolved" into
 *     "we could not read".
 *  3. **EVERY COUNT CARRIES ITS DENOMINATOR.** Counts render as `n of m`
 *     (`decisions 12 of 12`, `plugins 3 of 56`, `outcomes decided 3 of 4`),
 *     because a bare `12` is a caption and this program has paid for that
 *     distinction repeatedly. When the denominator itself is unread the line
 *     says so rather than printing the numerator alone.
 *  4. **THE CONTROL'S RESULT IS RENDERED.** `EvolveView` is a first-class slice
 *     of the view: the round the `POST /meta-evolve/api/evolve` produced, the
 *     file change it reported, and whether the written line was re-read and
 *     matched. A control that only re-read a value is not a control, so the view
 *     carries what the click *created*, not only what the store now holds.
 *
 * @module dsh-meta-evolve/client/view
 */

import { createElement as h, type ReactElement } from 'react'
import type { Translator } from './types.ts'

/** How a route read ended, as far as the panel needs to distinguish. */
export type ReadState = 'loaded' | 'not-mounted' | 'refused' | 'unreachable' | 'malformed'

/** The states a FAILED read can be in — everything except a successful read. */
export type FailureState = Exclude<ReadState, 'loaded'>

/**
 * One field of the composed state, as this panel sees it.
 *
 * `read === null` means the source was NOT read and `reason` says why; it is
 * never an empty value. The renderer turns that pair into `NOT MEASURED` plus the
 * reason, and the harness asserts that path for every field.
 */
export interface FieldView<T> {
  readonly read: T | null
  readonly reason: string | null
}

/**
 * Construct a field that WAS read.
 * @param value - the normalized reading.
 * @returns the field view.
 */
export function presentField<T>(value: T): FieldView<T> {
  return { read: value, reason: null }
}

/**
 * Construct a field that was NOT read.
 * @param reason - why it is absent, as the host reported it.
 * @returns the field view.
 */
export function absentField<T>(reason: string | null): FieldView<T> {
  return { read: null, reason }
}

/** One count that was compared between two rounds. `delta: null` means uncomparable. */
export interface DeltaCountView {
  readonly from: number | null
  readonly to: number | null
  readonly delta: number | null
  readonly reason: string | null
}

/** One count that moved between two rounds. */
export interface MovedCountView {
  readonly key: string
  readonly from: number | null
  readonly to: number | null
  readonly delta: number | null
}

/** One id set compared between two rounds. `null` means unreadable, never empty. */
export interface SetView {
  readonly decisions: readonly string[] | null
  readonly plugins: readonly string[] | null
  readonly intentRows: readonly string[] | null
}

/** One intent row whose value changed. */
export interface ChangedRowView {
  readonly id: string
  readonly from: string
  readonly to: string
}

/**
 * One IDENTITY value compared between two rounds — a model name, a dimension, a
 * revision. THREE STATES, NOT TWO: `changed: true` (drift), `changed: false`
 * (agreeing), `changed: null` (the identity was not measured, and must NEVER be
 * rendered as unchanged). The fourth absence — the whole channel missing from an
 * older recorded round — is `DeltaView.values === null`.
 */
export interface IdentityView {
  readonly key: string
  readonly from: string | null
  readonly to: string | null
  readonly changed: boolean | null
  readonly reason: string | null
}

/** The delta one round records against the previous round. */
export interface DeltaView {
  readonly against: number | null
  readonly againstAt: string | null
  readonly moved: readonly MovedCountView[] | null
  readonly movedOf: { readonly moved: number | null; readonly checked: number | null; readonly uncompared: number | null } | null
  /** `null` means the round predates the identity channel; `[]` means it carried none. */
  readonly values: readonly IdentityView[] | null
  readonly valuesOf: { readonly changed: number | null; readonly checked: number | null; readonly uncomparable: number | null } | null
  readonly appeared: SetView | null
  readonly disappeared: SetView | null
  readonly changed: readonly ChangedRowView[] | null
  readonly unavailable: readonly { readonly key: string; readonly reason: string }[] | null
}

/** One recorded evolution round, as the rounds route serves it (newest first). */
export interface RoundView {
  readonly n: number | null
  readonly at: string | null
  readonly model: string | null
  readonly countsRead: { readonly read: number | null; readonly of: number | null } | null
  readonly delta: DeltaView | null
  readonly deltaReason: string | null
  readonly unreadable: readonly { readonly field: string; readonly reason: string }[] | null
}

/** `decisionLog`, normalized. */
export interface DecisionLogRead {
  readonly total: number | null
  readonly active: number | null
  readonly superseded: number | null
  readonly of: number | null
  readonly sumsToTotal: boolean | null
  readonly censusAt: string | null
  readonly events: number | null
  readonly malformedLines: number | null
  readonly readAt: string | null
}

/** One intent-field value bucket. */
export interface ValueBucketView {
  readonly value: string
  readonly count: number | null
}

/** `intentField`, normalized. */
export interface IntentFieldRead {
  readonly rows: number | null
  readonly of: number | null
  readonly byValue: readonly ValueBucketView[] | null
  readonly byValueOf: number | null
  readonly rowsWithoutValue: number | null
  readonly duplicateRowIds: number | null
  readonly mode: string | null
  readonly generatedAt: string | null
  readonly documents: number | null
  readonly declaredRows: number | null
  readonly rowsMatchDeclared: boolean | null
  readonly file: string | null
  readonly bytes: number | null
  readonly readAt: string | null
}

/** `lvl1Gate`, normalized. */
export interface Lvl1GateRead {
  readonly hooked: boolean | null
  readonly hookedAgrees: boolean | null
  readonly runs: number | null
  readonly sessions: number | null
  readonly outcomes: {
    readonly decided: number | null
    readonly declined: number | null
    readonly neverRan: number | null
  } | null
  readonly outcomesOf: number | null
  readonly last: {
    readonly outcome: string | null
    readonly reason: string | null
    readonly channel: string | null
    readonly at: string | null
  } | null
  readonly revisions: readonly string[] | null
  readonly readAt: string | null
}

/** `intentMap`, normalized. */
export interface IntentMapRead {
  readonly zones: number | null
  readonly of: number | null
  readonly model: string | null
  readonly dim: number | null
  readonly freshness: string | null
  readonly corpusPlugins: number | null
  readonly corpusOf: number | null
  readonly catalogCount: number | null
  readonly readAt: string | null
}

/** `plugins`, normalized. */
export interface PluginsRead {
  readonly count: number | null
  readonly of: number | null
  readonly names: readonly string[] | null
  readonly root: string | null
  readonly readAt: string | null
}

/** One source the host named as unreadable. */
export interface UnreadableEntry {
  readonly field: string
  readonly reason: string
}

/** `GET /meta-evolve/api/state`, as far as this panel may interpret it. */
export interface StateView {
  readonly state: ReadState
  readonly note: string | null
  readonly at: string | null
  readonly host: string | null
  readonly readMs: number | null
  readonly countsRead: { readonly read: number | null; readonly of: number | null } | null
  readonly unreadable: readonly UnreadableEntry[] | null
  readonly notDone: readonly string[] | null
  readonly decisionLog: FieldView<DecisionLogRead>
  readonly intentField: FieldView<IntentFieldRead>
  readonly lvl1Gate: FieldView<Lvl1GateRead>
  readonly intentMap: FieldView<IntentMapRead>
  readonly plugins: FieldView<PluginsRead>
}

/** `GET /meta-evolve/api/rounds`, as far as this panel may interpret it. */
export interface RoundsView {
  readonly state: ReadState
  readonly note: string | null
  readonly count: number | null
  readonly total: number | null
  readonly lines: number | null
  readonly bytes: number | null
  readonly exists: boolean | null
  readonly trailingNewline: boolean | null
  readonly malformedLines: number | null
  readonly rounds: readonly RoundView[] | null
}

/** The `POST /meta-evolve/api/evolve` control's slice of the view. */
export interface EvolveView {
  readonly state: 'idle' | 'running' | 'done' | 'failed'
  readonly note: string | null
  readonly round: RoundView | null
  readonly before: { readonly exists: boolean | null; readonly lines: number | null; readonly rounds: number | null } | null
  readonly change: { readonly linesDelta: number | null; readonly roundsDelta: number | null } | null
  readonly verification: {
    readonly verified: boolean | null
    readonly reason: string | null
    readonly lines: number | null
    readonly rounds: number | null
  } | null
}

/** The idle evolve slice: nothing has been run from this panel yet. */
export const IDLE_EVOLVE: EvolveView = {
  state: 'idle',
  note: null,
  round: null,
  before: null,
  change: null,
  verification: null,
}

/** One read of the whole surface. */
export interface PanelView {
  readonly fetchedAt: string | null
  readonly state: StateView
  readonly rounds: RoundsView
  readonly evolve: EvolveView
}

/** The tones a badge may carry. `ok` is earned; it is never a default. */
export type Tone = 'ok' | 'warn' | 'unknown'

/** The token an unread value renders. A literal, so it is greppable in the bundle. */
function fmt(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'NOT MEASURED'
  return String(value)
}

/**
 * Format a count WITH its denominator.
 *
 * The denominator is printed even when it is unread — `12 of NOT MEASURED` is the
 * honest line, where a bare `12` would hide that the population is unknown.
 * @param value - the numerator, or `null` when unread.
 * @param of - the denominator, or `null` when unread.
 * @returns the text to render.
 */
function ratio(value: number | null, of: number | null): string {
  if (value === null) return 'NOT MEASURED'
  if (of === null) return `${value} of NOT MEASURED`
  return `${value} of ${of}`
}

/**
 * The rounds store's own state, as a diagnostic token.
 *
 * `NOT MEASURED` and `NOTHING RECORDED` are DIFFERENT statements and this
 * function is the one place that chooses between them: unread is not empty.
 * @param rounds - the rounds slice.
 * @returns the token the panel renders.
 */
export function roundsLabel(rounds: RoundsView): string {
  if (rounds.state !== 'loaded' || rounds.count === null || rounds.total === null) return 'NOT MEASURED'
  if (rounds.total === 0) return 'NOTHING RECORDED'
  return 'ROUNDS RECORDED'
}

/**
 * The tone of the evolve control's badge — a CLOSED map with one path to `ok`.
 *
 * `ok` requires THREE facts: the route reported the round, the file was re-read
 * and the written line matched, and the file's line count actually moved. Any
 * control that acknowledged itself without growing the store fails this rule, and
 * the harness drives all three directions (verified+grown, verified+unchanged,
 * failed) so the rule cannot rot into a constant.
 * @param evolve - the evolve slice.
 * @returns the tone the badge must carry.
 */
export function evolveTone(evolve: EvolveView): Tone {
  // The growth is read as `number | null` and never as `?? 0`: an unread delta
  // must not be coerced into "did not grow", because both refuse `ok` for
  // different reasons and only one of them is a measurement.
  const linesDelta: number | null = evolve.change === null ? null : evolve.change.linesDelta
  const grew = linesDelta !== null && linesDelta > 0
  if (evolve.state === 'done' && evolve.verification?.verified === true && grew) return 'ok'
  if (evolve.state === 'failed' || evolve.state === 'done') return 'warn'
  return 'unknown'
}

/**
 * The evolve badge's text — the ONE place its token is chosen.
 * @param evolve - the evolve slice.
 * @returns the badge text.
 */
export function evolveLabel(evolve: EvolveView, t: Translator): string {
  if (evolve.state === 'idle') return t('idle')
  if (evolve.state === 'running') return t('running')
  if (evolve.state === 'failed') return t('failed')
  return t('recorded')
}

/** One label/value line in a section. */
function line(label: string, value: string, testId?: string): ReactElement {
  return h('div', {
    key: `${label}:${testId ?? ''}`,
    style: { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '2px 0' },
    ...(testId === undefined ? {} : { 'data-testid': testId }),
  },
  h('span', { style: { minWidth: '168px', color: 'var(--dsh-text-2, #8b949e)', fontSize: '12px' } }, label),
  h('span', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '12px', overflowWrap: 'anywhere' } }, value))
}

/** A titled section with a stable `data-testid`. */
function section(testId: string, title: string, children: (ReactElement | null)[]): ReactElement {
  return h('section', {
    key: testId,
    'data-testid': testId,
    style: { border: '1px solid var(--dsh-border, #30363d)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' },
  },
  h('h3', { style: { margin: '0 0 6px', fontSize: '13px' } }, title),
  ...children.filter((child): child is ReactElement => child !== null))
}

/** A line naming why a field could not be read. */
function reasonLine(reason: string | null, testId: string): ReactElement {
  return line('reason', reason === null ? 'the host recorded no reason' : reason, testId)
}

/** The decision-log section. */
function decisionsSection(field: FieldView<DecisionLogRead>, t: Translator): ReactElement {
  const value = field.read
  if (value === null) {
    return section('decisions', t('decisionsHeading'), [
      line(t('totalLabel'), 'NOT MEASURED', 'decisions-total'),
      line(t('activeLabel'), 'NOT MEASURED', 'decisions-active'),
      line(t('supersededLabel'), 'NOT MEASURED', 'decisions-superseded'),
      reasonLine(field.reason, 'decisions-reason'),
    ])
  }
  return section('decisions', t('decisionsHeading'), [
    line(t('totalLabel'), ratio(value.total, value.of), 'decisions-total'),
    line(t('activeLabel'), ratio(value.active, value.of), 'decisions-active'),
    line(t('supersededLabel'), ratio(value.superseded, value.of), 'decisions-superseded'),
    line(t('sumsLabel'), fmt(value.sumsToTotal), 'decisions-sums'),
    line(t('eventsLabel'), fmt(value.events), 'decisions-events'),
    line(t('malformedLinesLabel'), fmt(value.malformedLines), 'decisions-malformed'),
    line(t('censusAtLabel'), fmt(value.censusAt), 'decisions-census-at'),
    line(t('readAtLabel'), fmt(value.readAt), 'decisions-read-at'),
  ])
}

/** The intent-field section, with the by-value buckets rendered as pairs. */
function intentSection(field: FieldView<IntentFieldRead>, t: Translator): ReactElement {
  const value = field.read
  if (value === null) {
    return section('intent', t('intentHeading'), [
      line(t('rowsLabel'), 'NOT MEASURED', 'intent-rows'),
      line(t('byValueLabel'), 'NOT MEASURED', 'intent-byvalue'),
      reasonLine(field.reason, 'intent-reason'),
    ])
  }
  const buckets = value.byValue === null
    ? 'NOT MEASURED'
    : value.byValue.length === 0
      ? `0 ${t('valueWord')} of ${fmt(value.byValueOf)}`
      : value.byValue.map((bucket) => `${bucket.value} ${fmt(bucket.count)}`).join(' · ') + ` (of ${fmt(value.byValueOf)})`
  return section('intent', t('intentHeading'), [
    line(t('rowsLabel'), ratio(value.rows, value.of), 'intent-rows'),
    line(t('byValueLabel'), buckets, 'intent-byvalue'),
    line(t('rowsWithoutValueLabel'), fmt(value.rowsWithoutValue), 'intent-rows-without-value'),
    line(t('duplicateRowsLabel'), fmt(value.duplicateRowIds), 'intent-duplicates'),
    line(t('modeLabel'), fmt(value.mode), 'intent-mode'),
    line(t('documentsLabel'), fmt(value.documents), 'intent-documents'),
    line(t('declaredRowsLabel'), fmt(value.declaredRows), 'intent-declared'),
    line(t('rowsMatchLabel'), fmt(value.rowsMatchDeclared), 'intent-rows-match'),
    line(t('generatedAtLabel'), fmt(value.generatedAt), 'intent-generated-at'),
    line(t('readAtLabel'), fmt(value.readAt), 'intent-read-at'),
  ])
}

/** The plugins section: the names the census found, with their denominator. */
function pluginsSection(field: FieldView<PluginsRead>, t: Translator): ReactElement {
  const value = field.read
  if (value === null) {
    return section('plugins', t('pluginsHeading'), [
      line(t('pluginsCountLabel'), 'NOT MEASURED', 'plugins-count'),
      line(t('pluginsNamesLabel'), 'NOT MEASURED', 'plugins-names'),
      reasonLine(field.reason, 'plugins-reason'),
    ])
  }
  const names = value.names === null
    ? 'NOT MEASURED'
    : value.names.length === 0
      ? '0 name(s) of a tree that WAS read'
      : value.names.join(', ')
  return section('plugins', t('pluginsHeading'), [
    line(t('pluginsCountLabel'), ratio(value.count, value.of), 'plugins-count'),
    line(t('pluginsNamesLabel'), names, 'plugins-names'),
    line(t('rootLabel'), fmt(value.root), 'plugins-root'),
    line(t('readAtLabel'), fmt(value.readAt), 'plugins-read-at'),
  ])
}

/** The LVL1 gate section: hook state, counters, outcome distribution, last decision. */
function gateSection(field: FieldView<Lvl1GateRead>, t: Translator): ReactElement {
  const value = field.read
  if (value === null) {
    return section('gate', t('gateHeading'), [
      line(t('hookedLabel'), 'NOT MEASURED', 'gate-hooked'),
      line(t('runsLabel'), 'NOT MEASURED', 'gate-runs'),
      line(t('sessionsLabel'), 'NOT MEASURED', 'gate-sessions'),
      line(t('outcomesLabel'), 'NOT MEASURED', 'gate-outcomes'),
      reasonLine(field.reason, 'gate-reason'),
    ])
  }
  const agreement = value.hookedAgrees === null
    ? 'NOT MEASURED'
    : value.hookedAgrees ? t('agree') : t('disagree')
  const outcomes = value.outcomes === null
    ? 'NOT MEASURED'
    : `decided ${fmt(value.outcomes.decided)} · declined ${fmt(value.outcomes.declined)} · neverRan ${fmt(value.outcomes.neverRan)} (of ${fmt(value.outcomesOf)})`
  const rows: (ReactElement | null)[] = [
    line(t('hookedLabel'), fmt(value.hooked), 'gate-hooked'),
    line(t('hookedAgreesLabel'), agreement, 'gate-hooked-agrees'),
    line(t('runsLabel'), fmt(value.runs), 'gate-runs'),
    line(t('sessionsLabel'), fmt(value.sessions), 'gate-sessions'),
    line(t('outcomesLabel'), outcomes, 'gate-outcomes'),
  ]
  if (value.last === null) {
    rows.push(line(t('lastHeading'), t('noRoundYet'), 'gate-last'))
  } else {
    rows.push(line(t('outcomeLabel'), fmt(value.last.outcome), 'gate-last-outcome'))
    rows.push(line(t('reasonLabel'), fmt(value.last.reason), 'gate-last-reason'))
    rows.push(line(t('channelLabel'), fmt(value.last.channel), 'gate-last-channel'))
    rows.push(line(t('atLabel'), fmt(value.last.at), 'gate-last-at'))
  }
  rows.push(line(t('revisionsLabel'), value.revisions === null ? 'NOT MEASURED' : value.revisions.join(', '), 'gate-revisions'))
  rows.push(line(t('readAtLabel'), fmt(value.readAt), 'gate-read-at'))
  return section('gate', t('gateHeading'), rows)
}

/** The intent-map section. */
function mapSection(field: FieldView<IntentMapRead>, t: Translator): ReactElement {
  const value = field.read
  if (value === null) {
    return section('map', t('mapHeading'), [
      line(t('zonesLabel'), 'NOT MEASURED', 'map-zones'),
      line(t('modelLabel'), 'NOT MEASURED', 'map-model'),
      line(t('dimLabel'), 'NOT MEASURED', 'map-dim'),
      reasonLine(field.reason, 'map-reason'),
    ])
  }
  return section('map', t('mapHeading'), [
    line(t('zonesLabel'), ratio(value.zones, value.of), 'map-zones'),
    line(t('modelLabel'), fmt(value.model), 'map-model'),
    line(t('dimLabel'), fmt(value.dim), 'map-dim'),
    line(t('freshnessLabel'), fmt(value.freshness), 'map-freshness'),
    line(t('corpusLabel'), ratio(value.corpusPlugins, value.corpusOf), 'map-corpus'),
    line(t('catalogLabel'), fmt(value.catalogCount), 'map-catalog'),
    line(t('readAtLabel'), fmt(value.readAt), 'map-read-at'),
  ])
}

/** One id set as text, distinguishing unread (`null`) from empty (`[]`). */
function setText(set: SetView | null, key: 'decisions' | 'plugins' | 'intentRows'): string {
  if (set === null) return 'NOT MEASURED'
  const values = set[key]
  if (values === null) return 'NOT MEASURED'
  if (values.length === 0) return '0'
  return values.join(', ')
}

/**
 * The identity channel, as one line. FOUR ABSENCES, and none of them is "unchanged".
 *
 * This is the panel's answer to the defect the delta carried for four rounds: an
 * identity swap at held dimension produced `moved: []`, so the panel said nothing
 * had changed. Now the three states are rendered distinctly —
 *   changed === true   -> `from -> to (CHANGED)`
 *   changed === false  -> `to (unchanged)`            the AGREEING case
 *   changed === null   -> `UNKNOWN (<reason>)`        measured-and-absent, never "unchanged"
 * and a pre-channel round (`values === null`) renders `NOT MEASURED`, which is a
 * different statement from `UNKNOWN`: one says this round never carried the
 * channel, the other says the channel was there and the identity was not.
 *
 * @param delta - the normalized delta.
 * @returns the line's value text.
 */
function identityText(delta: DeltaView): string {
  if (delta.values === null) return 'NOT MEASURED'
  if (delta.values.length === 0) return '0'
  return delta.values.map((entry) => {
    if (entry.changed === null) return `${entry.key}: UNKNOWN (${entry.reason ?? 'not measured'})`
    if (entry.from === null || entry.to === null) return `${entry.key}: UNKNOWN (one side was not measured)`
    return entry.changed
      ? `${entry.key}: ${entry.from}→${entry.to} (CHANGED)`
      : `${entry.key}: ${entry.to} (unchanged)`
  }).join(' · ')
}

/** The delta of one round, as lines. */
function deltaRows(delta: DeltaView, prefix: string, t: Translator): (ReactElement | null)[] {
  const rows: (ReactElement | null)[] = []
  const moved = delta.moved === null
    ? 'NOT MEASURED'
    : delta.moved.length === 0
      ? `0 ${t('countWord')} moved of ${fmt(delta.movedOf?.checked)}`
      : `${delta.moved.length} of ${fmt(delta.movedOf?.checked)} ${t('countWord')} moved — ` +
        delta.moved.map((entry) => `${entry.key} ${fmt(entry.from)}→${fmt(entry.to)} (${entry.delta === null ? 'NOT MEASURED' : entry.delta > 0 ? `+${entry.delta}` : String(entry.delta)})`).join(' · ')
  rows.push(line(t('movedLabel'), moved, `${prefix}-moved`))
  rows.push(line(t('identityLabel'), identityText(delta), `${prefix}-identity`))
  if (delta.against !== null) {
    rows.push(line(t('deltaLabel'), `against round ${delta.against} at ${fmt(delta.againstAt)}`, `${prefix}-against`))
  }
  if (delta.unavailable !== null && delta.unavailable.length > 0) {
    rows.push(line(t('unavailableLabel'), delta.unavailable.map((entry) => `${entry.key}: ${entry.reason}`).join('; '), `${prefix}-unavailable`))
  }
  rows.push(line(t('appearedLabel'), `decisions: ${setText(delta.appeared, 'decisions')}; plugins: ${setText(delta.appeared, 'plugins')}; intent rows: ${setText(delta.appeared, 'intentRows')}`, `${prefix}-appeared`))
  rows.push(line(t('disappearedLabel'), `decisions: ${setText(delta.disappeared, 'decisions')}; plugins: ${setText(delta.disappeared, 'plugins')}; intent rows: ${setText(delta.disappeared, 'intentRows')}`, `${prefix}-disappeared`))
  const changed = delta.changed === null
    ? 'NOT MEASURED'
    : delta.changed.length === 0
      ? '0'
      : delta.changed.map((entry) => `${entry.id}: ${entry.from}→${entry.to}`).join(' · ')
  rows.push(line(t('changedLabel'), changed, `${prefix}-changed`))
  return rows
}

/**
 * One round as a section.
 * @param round - the round.
 * @param prefix - the `data-testid` prefix, so the list and the control's round do not collide.
 * @param t - translator.
 * @returns the section.
 */
function roundSection(round: RoundView, prefix: string, t: Translator): ReactElement {
  const id = `${prefix}-${round.n ?? 'unknown'}`
  const rows: (ReactElement | null)[] = [
    line(t('atLabel'), fmt(round.at), `${id}-at`),
    line(t('modelLabel'), fmt(round.model), `${id}-model`),
    line(t('countsReadLabel'), round.countsRead === null ? 'NOT MEASURED' : ratio(round.countsRead.read, round.countsRead.of), `${id}-counts-read`),
  ]
  if (round.delta === null) {
    rows.push(line(t('deltaLabel'), round.deltaReason === null ? t('firstRound') : round.deltaReason, `${id}-delta`))
  } else {
    rows.push(...deltaRows(round.delta, id, t))
  }
  if (round.unreadable !== null && round.unreadable.length > 0) {
    rows.push(line(t('unreadableLabel'), round.unreadable.map((entry) => `${entry.field}: ${entry.reason}`).join('; '), `${id}-unreadable`))
  }
  return section(id, `${t('roundLabel')} ${fmt(round.n)}`, rows)
}

/** The rounds section: the file's census, the store state, and the recorded rounds. */
function roundsSection(rounds: RoundsView, t: Translator): ReactElement {
  const label = roundsLabel(rounds)
  const rows: (ReactElement | null)[] = [
    line(t('roundsStateLabel'), label, 'rounds-state'),
    line(t('roundsCountLabel'), ratio(rounds.count, rounds.total), 'rounds-count'),
    line(t('linesLabel'), fmt(rounds.lines), 'rounds-lines'),
    line(t('bytesLabel'), fmt(rounds.bytes), 'rounds-bytes'),
    line(t('existsLabel'), fmt(rounds.exists), 'rounds-exists'),
    line(t('malformedCountLabel'), fmt(rounds.malformedLines), 'rounds-malformed'),
  ]
  if (rounds.state !== 'loaded') {
    rows.push(reasonLine(rounds.note, 'rounds-reason'))
  }
  if (rounds.rounds === null) {
    rows.push(line(t('roundsHeading'), 'NOT MEASURED', 'rounds-rows'))
  } else if (rounds.rounds.length === 0) {
    // THE EMPTY STORE IS ITS OWN STATE. It is rendered as text, not as an empty
    // list, because an empty list and an unread store look identical.
    rows.push(line(t('roundsHeading'), 'NOTHING RECORDED', 'rounds-empty'))
  } else {
    // Newest first, as the route serves them. The list is capped so a long
    // history cannot push the control off the page; the count above is the
    // denominator that says how many exist.
    for (const round of rounds.rounds.slice(0, 5)) {
      rows.push(roundSection(round, 'round', t))
    }
  }
  return section('rounds', t('roundsHeading'), rows)
}

/** The evolve control's section: what the click produced, rendered rather than acknowledged. */
function evolveSection(evolve: EvolveView, t: Translator): ReactElement {
  const tone = evolveTone(evolve)
  const badge = h('span', {
    'data-testid': 'evolve-tone',
    'data-tone': tone,
    style: {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      border: '1px solid',
      ...(tone === 'ok'
        ? { color: '#1a7f37', borderColor: '#1a7f37', background: 'rgba(26,127,55,0.10)' }
        : tone === 'warn'
          ? { color: '#9a6700', borderColor: '#9a6700', background: 'rgba(154,103,0,0.10)' }
          : { color: 'var(--dsh-text-2, #8b949e)', borderColor: 'var(--dsh-border, #30363d)', background: 'transparent' }),
    },
  }, evolveLabel(evolve, t))
  const rows: (ReactElement | null)[] = [
    h('div', { key: 'badge', style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '2px 0' } }, badge),
    line(t('evolveHeading'), evolve.state === 'done' ? t('recorded') : evolve.state === 'failed' ? t('failed') : evolve.state === 'running' ? t('running') : t('idle'), 'evolve-state'),
  ]
  if (evolve.state === 'done' && evolve.round !== null) {
    // THE ROUND THE CLICK PRODUCED, named on its own line: n, when, and the file
    // change the route reported. A panel that showed only the refreshed list
    // would make the reader infer which row the click made.
    rows.push(line(t('roundLabel'), `n=${fmt(evolve.round.n)} at ${fmt(evolve.round.at)}`, 'evolve-round'))
    if (evolve.change !== null) {
      const linesDelta = evolve.change.linesDelta
      rows.push(line(t('linesLabel'), `${fmt(evolve.before?.lines)} → ${linesDelta === null ? 'NOT MEASURED' : `${linesDelta > 0 ? '+' : ''}${linesDelta}`}`, 'evolve-change'))
      rows.push(line(t('roundsCountLabel'), `${fmt(evolve.before?.rounds)} → ${evolve.change.roundsDelta === null ? 'NOT MEASURED' : `${evolve.change.roundsDelta > 0 ? '+' : ''}${evolve.change.roundsDelta}`}`, 'evolve-change-rounds'))
    }
    if (evolve.verification !== null) {
      rows.push(line(
        'verification',
        evolve.verification.verified === true
          ? t('verified')
          : `${t('notVerified')} — ${evolve.verification.reason ?? 'the route gave no reason'}`,
        'evolve-verify',
      ))
    }
    rows.push(roundSection(evolve.round, 'evolve-round', t))
  } else if (evolve.state === 'failed') {
    rows.push(reasonLine(evolve.note, 'evolve-note'))
  }
  return section('evolve', t('evolveHeading'), rows)
}

/**
 * THE BOUNDED FRAME, THE FIXED HEADER, AND THE ONE SCROLLING BODY.
 *
 * THIS SHAPE IS MEASURED, NOT STYLED. The shell mounts a `main` panel inside
 * `.MWG54q_centerCol`, a `display:flex; flex-direction:column; overflow:hidden`
 * cell of exactly viewport height (808 px at 1256 x 808). The panel's content is
 * several times that. Measured in the rendered GUI on 2026-10-18, BEFORE this
 * shape existed: the renderer root was 2,872 px tall, its plugin wrapper 2,937 px,
 * the centre column 808 px with `scrollHeight 2,937` and `overflowY: hidden`,
 * and `body`/`html` both 808/808 — so NO element in the chain was scrollable by
 * a user and the bottom of the panel (the rounds and the Evolve control) was
 * unreachable. A plugin cannot widen the shell's cell.
 *
 * THREE PARTS, each load-bearing, the same contract the LVL1-gate, meta-research
 * and skill-studio lanes reached independently:
 *
 *   - FRAME (the root, `[data-testid=meta-evolve-panel]`): a flex COLUMN with
 *     `height: 100%` and `overflow: hidden`. Because the shell's slot anchor is
 *     `display: contents`, this root is itself the centre column's flex item, so
 *     `100%` resolves against the 808 px cell. (`height: 100%` here is only
 *     correct WITH the page's former wrapper removed — measured at 2,961 px when
 *     a wrapping div owned the height.)
 *   - HEADER (`[data-testid=meta-evolve-header]`, `flex: 0 0 auto`): title,
 *     subtitle and the controls the page passes in. It is a SIBLING of the
 *     scroller, so the Evolve button cannot scroll out of reach.
 *   - BODY (`[data-testid=meta-evolve-scroll]`): the ONLY scroller —
 *     `flex: 1 1 auto; minHeight: 0; overflowY: auto`. `minHeight: 0` is the
 *     load-bearing property: a flex item's automatic minimum size otherwise
 *     refuses to shrink below its content, the delta collapses to 0, and the
 *     overflow escapes back to the clipped centre column.
 *
 * `verify/panel-render.mjs` asserts this three-part contract and its falsifiers.
 */
const FRAME_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  boxSizing: 'border-box',
  padding: '12px',
  fontSize: '13px',
  lineHeight: 1.5,
} as const

/** The fixed header strip: its natural height, never flexed, outside the scroller. */
const HEADER_STYLE = { flex: '0 0 auto' } as const

/** The single scroll box; `minHeight: 0` lets a flex item shrink below its content. */
const SCROLL_BODY_STYLE = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  boxSizing: 'border-box',
  paddingRight: '6px',
} as const

/**
 * The panel's fixed header.
 * @param state - the state slice, or `null` for the loading first paint.
 * @param t - translator.
 * @param controls - an already-built control element the page passes in, or null.
 * @returns the header element.
 */
function panelHeader(state: StateView | null, t: Translator, controls: ReactElement | null): ReactElement {
  const rows: (ReactElement | null)[] = []
  if (state !== null) {
    rows.push(line(t('fetchedAtLabel'), fmt(state.at), 'fetched-at'))
    rows.push(line(t('hostLabel'), fmt(state.host), 'panel-host'))
    rows.push(line(t('countsReadLabel'), state.countsRead === null ? 'NOT MEASURED' : ratio(state.countsRead.read, state.countsRead.of), 'counts-read'))
  }
  return h('div', { 'data-testid': 'meta-evolve-header', style: HEADER_STYLE },
    h('h2', { key: 'title', style: { margin: '0 0 2px', fontSize: '15px' } }, t('title')),
    h('p', { key: 'subtitle', style: { margin: '0 0 10px', color: 'var(--dsh-text-2, #8b949e)', fontSize: '12px' } }, t('subtitle')),
    ...rows,
    controls)
}

/**
 * One panel frame: the fixed header, then the ONE scrolling body.
 * @param t - translator.
 * @param state - the state slice, or `null` for the loading first paint.
 * @param controls - the page's control element, positioned in the header.
 * @param bodyChildren - the body's content.
 * @returns the frame element.
 */
function panelFrame(
  t: Translator,
  state: StateView | null,
  controls: ReactElement | null,
  bodyChildren: (ReactElement | null)[],
): ReactElement {
  return h('div', {
    'data-testid': 'meta-evolve-panel',
    'data-dsh-panel': 'meta-evolve',
    style: FRAME_STYLE,
  },
  panelHeader(state, t, controls),
  h('div', { 'data-testid': 'meta-evolve-scroll', style: SCROLL_BODY_STYLE },
    ...bodyChildren.filter((child): child is ReactElement => child !== null)))
}

/**
 * Render the whole panel from a view. PURE: no fetch, no hooks, no state.
 * @param view - one complete read plus the control's slice.
 * @param t - translator.
 * @param controls - an element the page builds (Evolve / Refresh); the renderer
 *   only positions it in the fixed header. Defaults to none, for the harness.
 * @returns the panel element.
 */
export function renderPanel(view: PanelView, t: Translator, controls: ReactElement | null = null): ReactElement {
  const state = view.state
  const body: (ReactElement | null)[] = []
  if (state.state !== 'loaded') {
    body.push(reasonLine(state.note, 'state-reason'))
  }
  if (state.unreadable !== null && state.unreadable.length > 0) {
    body.push(line(t('unreadableLabel'), state.unreadable.map((entry) => `${entry.field}: ${entry.reason}`).join('; '), 'unreadable'))
  }
  body.push(
    decisionsSection(state.decisionLog, t),
    intentSection(state.intentField, t),
    pluginsSection(state.plugins, t),
    gateSection(state.lvl1Gate, t),
    mapSection(state.intentMap, t),
    roundsSection(view.rounds, t),
    evolveSection(view.evolve, t),
  )
  if (state.notDone !== null) {
    body.push(h('div', { key: 'notdone', 'data-testid': 'not-done', style: { marginTop: '8px', fontSize: '11px', color: 'var(--dsh-text-2, #8b949e)' } },
      h('h4', { style: { margin: '0 0 4px', fontSize: '11px' } }, t('notDoneLabel')),
      ...state.notDone.map((entry, index) => h('p', { key: String(index), style: { margin: '0 0 2px' } }, entry))))
  }
  return panelFrame(t, state, controls, body)
}

/**
 * The loading first paint, through the SAME frame/header/body contract.
 *
 * A separate renderer is deliberate: the loading branch must not be able to
 * diverge from the loaded one, or a read in flight renders as an unbounded clip.
 * @param t - translator.
 * @param controls - the page's control element (present but disabled while busy).
 * @returns the loading panel element.
 */
export function renderLoadingPanel(t: Translator, controls: ReactElement | null = null): ReactElement {
  return panelFrame(t, null, controls, [h('p', { key: 'loading' }, t('reading'))])
}
