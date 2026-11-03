/**
 * The stateful meta-evolve page: fetch, drive the control, delegate every pixel to
 * the pure renderer in `view.ts`.
 *
 * The split exists so the panel can be CHECKED. A component that both fetches and
 * renders can only run under a hook dispatcher, so a build-level check could not
 * drive it without a browser; the pure renderer is driven instead, and this file
 * holds nothing but the two things a pure renderer cannot express — WHEN to read
 * and WHAT the operator did.
 *
 * THE ONE CONTROL IS THE `Evolve` BUTTON, and it is a control rather than a read:
 * it POSTs `/meta-evolve/api/evolve` (which recomputes the state and records a
 * new round), then re-reads the panel, and the response's created round is kept
 * in the view so the rendering NAMES the round the click produced. A button that
 * merely re-read the state would leave the operator inferring whether anything
 * happened; this one renders `n=…`, the file's line delta and the host's own
 * re-read verification.
 *
 * @module dsh-meta-evolve/client/PanelPage
 */

import { createElement as h, useCallback, useEffect, useState, type ReactElement } from 'react'
import { evolve as runEvolve, fetchPanel } from './api.ts'
import { IDLE_EVOLVE, renderLoadingPanel, renderPanel, type EvolveView, type PanelView } from './view.ts'
import type { PageProps } from './types.ts'

/**
 * The meta-evolve panel.
 * @param props - the shell's page properties (the translator only).
 * @returns the frame, or the loading first paint in the SAME frame.
 */
export function PanelPage(props: PageProps): ReactElement {
  const [view, setView] = useState<PanelView | null>(null)
  const [evolve, setEvolve] = useState<EvolveView>(IDLE_EVOLVE)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  /** Read every route and replace the view. */
  const reload = useCallback(async () => {
    setBusy(true)
    try {
      setView(await fetchPanel())
      setNote(null)
    } catch (error) {
      // `fetchPanel` never rejects by construction; this branch exists so a
      // future refactor cannot turn a failed read into a blank panel.
      setNote(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Drive the control, then re-read so the change is OBSERVED as well as reported. */
  const onEvolve = useCallback(async () => {
    setBusy(true)
    setEvolve({ ...IDLE_EVOLVE, state: 'running' })
    try {
      const outcome = await runEvolve()
      setEvolve(outcome)
      setView(await fetchPanel())
      setNote(outcome.state === 'failed' ? outcome.note : null)
    } catch (error) {
      setEvolve({ ...IDLE_EVOLVE, state: 'failed', note: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }, [])

  const bar = h('div', {
    key: 'control',
    'data-testid': 'evolve-control',
    style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' },
  },
  h('button', {
    type: 'button',
    'data-testid': 'evolve-button',
    onClick: () => { void onEvolve() },
    disabled: busy,
    style: { padding: '3px 12px', fontSize: '12px', fontWeight: 600 },
  }, props.t('evolveButton')),
  h('button', {
    type: 'button',
    'data-testid': 'refresh-button',
    onClick: () => { void reload() },
    disabled: busy,
    style: { padding: '3px 10px', fontSize: '12px' },
  }, props.t('refreshButton')),
  note === null ? null : h('span', { key: 'note', 'data-testid': 'evolve-note', style: { fontSize: '12px' } }, note))

  const hint = h('p', {
    key: 'hint',
    style: { fontSize: '11px', color: 'var(--dsh-text-2, #8b949e)', margin: '0 0 6px' },
  }, props.t('evolveHint'))

  // The controls are handed to the RENDERER, which places them in the FIXED
  // header. They are built here because this file owns the click handlers; the
  // renderer stays pure and only positions the element it is given.
  const controls = h('div', {
    key: 'controls',
    'data-testid': 'evolve-control-bar',
    style: { marginBottom: '4px' },
  }, hint, bar)

  // NO WRAPPER DIV. The frame root must itself be the shell centre column's flex
  // item, or `height: 100%` resolves against a content-height wrapper and the
  // panel grows to its content instead of scrolling — measured at 2,961 px in
  // exactly that configuration. The loading branch uses the SAME frame.
  if (view === null) {
    return renderLoadingPanel(props.t, controls)
  }

  return renderPanel({ ...view, evolve }, props.t, controls)
}
