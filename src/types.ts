/**
 * Structural declarations of the Host surfaces this package uses.
 *
 * **No `@deepseek-ai/*` import, not a value import and not a peer.** A plugin
 * built out of the workspace cannot depend on the Harness's type packages, and a
 * structural declaration is what lets `tsc --noEmit` check this half anyway. The
 * sibling `dsh-lvl1-gate` states the same rule in its own `src/types.ts`, and
 * this file follows it rather than importing the same names from the checkout.
 *
 * The route-handler signature is the REAL one, read from the Harness rather than
 * assumed: `packages/host/webserver/src/index.ts:37-42` declares
 * `handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>`
 * under the module header *"Route handlers retain direct response ownership."*
 * It is the node:http `(req, res)` pair — NOT the Web Fetch `Request`/`Response`
 * API. Writing the Fetch shape here would typecheck against a local shim and
 * fail at runtime, which is the one failure class a structural shim can hide, so
 * it is stated explicitly instead of being left implicit.
 *
 * `kind: 'exact' | 'prefix'` is copied from the same file (`WebRouteKind`,
 * `packages/host/webserver/src/index.ts:36`): `'exact'` matches the pathname
 * verbatim, `'prefix'` matches `p` and `p/<anything>`. This package registers one
 * EXACT path, so the union is declared whole and the value used is the one the
 * harness documents.
 *
 * @module dsh-meta-evolve/types
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * The unregister function a successful registration returns.
 *
 * Named rather than inlined because `ctx.effect` returning it is the whole
 * mechanism by which a disposed plugin stops serving — a bare `() => void` at
 * the call site does not say what disposing means. `register` returns exactly
 * this (`packages/host/webserver/src/index.ts:366`).
 */
export type RouteRegistrar = () => void

/** The route-registration surface, structurally. */
export interface WebServer {
  register(route: {
    readonly kind: 'exact' | 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): RouteRegistrar
}

/** The logger subset used here: enough to report activation, no more. */
export interface Logger {
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
}

/** The Cordis plugin context this half needs, and nothing else. */
export interface HostContext {
  readonly webServer: WebServer
  readonly logger: Logger
  /**
   * Scoped cleanup, so a disposed plugin leaves no route behind.
   *
   * The callback returns the disposer rather than being the disposer: the host
   * runs it during apply and holds what it returns. Registering outside an
   * effect would leak a route that keeps answering after its owner is gone.
   */
  effect(callback: () => RouteRegistrar | void, label?: string): void
}
