/**
 * Config parsing and path resolution for the meta layer's Host half.
 *
 * WHAT THIS FILE DECIDES, AND WHY IT IS SEPARATE
 *
 * Three paths and one origin decide what every route reads: the live host
 * (`http://127.0.0.1:3083` by default), the program workspace (which owns
 * `plan/intent-field/field.json` and `research/meta-evolve-rounds.jsonl`), and
 * the `plugins-src/` tree whose `dsh-meta-*` directories are counted.
 *
 * None of them is hard-coded as the ONLY answer, because the package is built in
 * `plugins-src/` and consumed from a profile whose process cwd is neither. Each
 * is resolved through an ordered candidate list and the resolution that won is
 * REPORTED in the state payload (`workspace.from`, `pluginsRoot.from`,
 * `roundsFile.from`), so a reader can see WHERE a value came from instead of
 * inferring it. An explicit config key or environment variable wins over
 * discovery, and discovery reports every candidate it tried when nothing matched
 * — an unresolved path is `null` with a reason, never a silent fallback to cwd.
 *
 * THE DEFAULTS ARE THE PROGRAM'S OWN, MEASURED FROM THIS CLONE'S LOCATION
 *
 * This clone lives at `deepseek-root/plugins-src/dsh-meta-evolve`, so
 * `packageRoot/../..` is `deepseek-root` and the program workspace is
 * `deepseek-root/profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE`. A
 * clone under the program workspace's own `plugins-src/` resolves through the
 * same candidate (`packageRoot/../..`), which is why one rule covers both
 * placements instead of two literals.
 *
 * @module dsh-meta-evolve/host/workspace
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The live host whose routes the meta layer composes. The brief fixes this default. */
export const DEFAULT_HOST_URL = 'http://127.0.0.1:3083'

/** Every key this package's row MAY carry. There is no schema yet; unknown keys are reported. */
export interface MetaEvolveConfig {
  readonly hostUrl?: string
  readonly workspace?: string
  readonly roundsFile?: string
  readonly pluginsRoot?: string
  readonly timeoutMs?: number
}

/** One config key that was present but unusable. Reported in the boot log, never silently dropped. */
export interface ConfigProblem {
  readonly key: string
  readonly value: unknown
  readonly reason: string
}

/** A candidate that did or did not resolve, with the label a reader can audit. */
export interface Candidate {
  readonly path: string
  readonly from: string
}

/** How one path was resolved. `path: null` is always accompanied by a reason. */
export interface PathResolution {
  readonly path: string | null
  readonly from: string | null
  readonly tried: readonly Candidate[]
  readonly reason: string | null
}

/** The three source paths plus the origin and timeout, resolved once per apply. */
export interface ResolvedHost {
  readonly hostUrl: string
  readonly hostFrom: string
  readonly timeoutMs: number
  readonly workspace: PathResolution
  readonly pluginsRoot: PathResolution
  readonly roundsFile: PathResolution
  readonly problems: readonly ConfigProblem[]
}

/** The package root, found by walking up to the manifest that names this package. */
let cachedPackageRoot: string | null = null

/** Directory of the module that is RUNNING — `lib/` in the build, `src/host/` in a source run. */
function moduleDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return process.cwd()
  }
}

/** Walk up from the running module until a package.json names this package. */
export function packageRoot(): string {
  if (cachedPackageRoot !== null) return cachedPackageRoot
  let dir = moduleDir()
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = join(dir, 'package.json')
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }
      if (parsed.name === 'dsh-meta-evolve') {
        cachedPackageRoot = dir
        return dir
      }
    } catch {
      // No readable manifest at this level; keep walking.
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  cachedPackageRoot = moduleDir()
  return cachedPackageRoot
}

/** True when `path` is an existing directory. */
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** True when `path` looks like the program workspace: it owns `plan/` and `research/`. */
function looksLikeWorkspace(path: string): boolean {
  return isDir(join(path, 'plan')) && isDir(join(path, 'research'))
}

/** An environment variable, trimmed, or null when absent/empty. */
function envString(name: string): string | null {
  const value = process.env[name]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Resolve a config/env path against `base` only when it is relative. */
function absoluteAgainst(path: string, base: string): string {
  return isAbsolute(path) ? path : resolve(base, path)
}

/**
 * Read the row's config defensively.
 *
 * The row carries no config block today, so `{}` is the normal input. A key that
 * is present but the wrong shape is returned as a PROBLEM rather than coerced or
 * dropped: a config key that silently does nothing is an install spec nobody can
 * check.
 *
 * @param raw - the row's config as the host passed it.
 * @returns the interpreted config plus every problem found.
 */
export function readConfig(raw: Record<string, unknown>): {
  readonly config: MetaEvolveConfig
  readonly problems: readonly ConfigProblem[]
} {
  const problems: ConfigProblem[] = []
  const strings: Record<string, string | undefined> = {}
  for (const key of ['hostUrl', 'workspace', 'roundsFile', 'pluginsRoot'] as const) {
    const value = raw[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push({ key, value, reason: 'expected a non-empty string' })
      continue
    }
    strings[key] = value.trim()
  }
  let timeoutMs: number | undefined
  const rawTimeout = raw.timeoutMs
  if (rawTimeout !== undefined) {
    if (typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout >= 100 && rawTimeout <= 60_000) {
      timeoutMs = Math.round(rawTimeout)
    } else {
      problems.push({ key: 'timeoutMs', value: rawTimeout, reason: 'expected a number in [100, 60000]' })
    }
  }
  return {
    config: {
      ...(strings.hostUrl === undefined ? {} : { hostUrl: strings.hostUrl }),
      ...(strings.workspace === undefined ? {} : { workspace: strings.workspace }),
      ...(strings.roundsFile === undefined ? {} : { roundsFile: strings.roundsFile }),
      ...(strings.pluginsRoot === undefined ? {} : { pluginsRoot: strings.pluginsRoot }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    },
    problems,
  }
}

/** The origin every live read uses, with its provenance. */
export function resolveHostUrl(config: MetaEvolveConfig): PathResolution {
  const explicit = config.hostUrl ?? null
  const fromEnv = envString('DSH_META_EVOLVE_HOST')
  const tried: Candidate[] = []
  if (explicit !== null) {
    tried.push({ path: explicit, from: 'config.hostUrl' })
    return { path: normalizeOrigin(explicit), from: 'config.hostUrl', tried, reason: null }
  }
  if (fromEnv !== null) {
    tried.push({ path: fromEnv, from: 'env.DSH_META_EVOLVE_HOST' })
    return { path: normalizeOrigin(fromEnv), from: 'env.DSH_META_EVOLVE_HOST', tried, reason: null }
  }
  tried.push({ path: DEFAULT_HOST_URL, from: 'default' })
  return { path: DEFAULT_HOST_URL, from: 'default', tried, reason: null }
}

/** Trim trailing slashes so `origin + path` never doubles a separator. */
function normalizeOrigin(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Resolve the program workspace.
 *
 * Explicit config and environment win. Discovery then tries, in order: the
 * program-workspace path relative to this clone, `packageRoot/../..` (which is
 * the program workspace when this clone sits inside it), and every ancestor of
 * the process cwd. A discovery candidate must own BOTH `plan/` and `research/`,
 * because a directory that merely exists is not the workspace.
 *
 * @param config - the interpreted row config.
 * @returns the winning path, its label, everything tried, and a reason when nothing won.
 */
export function resolveWorkspace(config: MetaEvolveConfig): PathResolution {
  const tried: Candidate[] = []
  const explicit = config.workspace ?? envString('DSH_META_EVOLVE_WORKSPACE')
  const explicitFrom = config.workspace !== undefined ? 'config.workspace' : 'env.DSH_META_EVOLVE_WORKSPACE'
  if (explicit !== null) {
    const path = absoluteAgainst(explicit, process.cwd())
    tried.push({ path, from: explicitFrom })
    if (isDir(path)) return { path, from: explicitFrom, tried, reason: null }
    return {
      path: null,
      from: null,
      tried,
      reason: `${explicitFrom} names ${path}, which is not an existing directory`,
    }
  }

  const root = packageRoot()
  const candidates: Candidate[] = [
    {
      path: resolve(root, '..', '..', 'profiles-tree', 'personal-dev', 'dsh-meta-evolve_INIT_WORKSPACE'),
      from: 'package-root/../../profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE',
    },
    { path: resolve(root, '..', '..'), from: 'package-root/../..' },
  ]

  let dir = process.cwd()
  for (let depth = 0; depth < 8; depth += 1) {
    candidates.push({ path: dir, from: depth === 0 ? 'process.cwd()' : `process.cwd()/.. x${depth}` })
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const candidate of candidates) {
    tried.push(candidate)
    if (looksLikeWorkspace(candidate.path)) {
      return { path: candidate.path, from: candidate.from, tried, reason: null }
    }
  }
  return {
    path: null,
    from: null,
    tried,
    reason: `no directory owning plan/ and research/ was found among ${tried.length} candidates`,
  }
}

/**
 * Resolve the `plugins-src/` tree whose `dsh-meta-*` DIRECTORIES are counted.
 *
 * The program's tree is `deepseek-root/plugins-src`, which is three levels above
 * the workspace (`personal-dev` -> `profiles-tree` -> `deepseek-root`). The
 * clone's own parent is the same directory in the normal placement, so it is
 * second. The program workspace's own `plugins-src/` is LAST rather than first:
 * it is a different, smaller tree, and counting it would produce a correct zero
 * for an instrument that cannot see the subject — the failure this program has a
 * recorded trap for.
 *
 * @param config - the interpreted row config.
 * @param workspace - the resolved workspace, or null.
 * @returns the winning path with provenance, or null with a reason.
 */
export function resolvePluginsRoot(config: MetaEvolveConfig, workspace: PathResolution): PathResolution {
  const tried: Candidate[] = []
  const explicit = config.pluginsRoot ?? envString('DSH_META_EVOLVE_PLUGINS_ROOT')
  const explicitFrom = config.pluginsRoot !== undefined ? 'config.pluginsRoot' : 'env.DSH_META_EVOLVE_PLUGINS_ROOT'
  if (explicit !== null) {
    const path = absoluteAgainst(explicit, process.cwd())
    tried.push({ path, from: explicitFrom })
    if (isDir(path)) return { path, from: explicitFrom, tried, reason: null }
    return { path: null, from: null, tried, reason: `${explicitFrom} names ${path}, which is not an existing directory` }
  }

  const candidates: Candidate[] = []
  if (workspace.path !== null) {
    candidates.push({ path: resolve(workspace.path, '..', '..', '..', 'plugins-src'), from: 'workspace/../../../plugins-src' })
  }
  candidates.push({ path: dirname(packageRoot()), from: 'package-root/..' })
  if (workspace.path !== null) {
    candidates.push({ path: join(workspace.path, 'plugins-src'), from: 'workspace/plugins-src' })
  }
  let dir = process.cwd()
  for (let depth = 0; depth < 8; depth += 1) {
    candidates.push({ path: join(dir, 'plugins-src'), from: depth === 0 ? 'process.cwd()/plugins-src' : `process.cwd()/../../plugins-src` })
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const candidate of candidates) {
    tried.push(candidate)
    if (isDir(candidate.path)) return { path: candidate.path, from: candidate.from, tried, reason: null }
  }
  return { path: null, from: null, tried, reason: `no existing plugins-src directory among ${tried.length} candidates` }
}

/**
 * Resolve the rounds file: `research/meta-evolve-rounds.jsonl` under the workspace.
 *
 * An explicit `roundsFile` is taken even when the workspace did not resolve,
 * which is what lets the verify harness drive the control against a temporary
 * file without touching the program's real record.
 *
 * @param config - the interpreted row config.
 * @param workspace - the resolved workspace, or null.
 * @returns the path with provenance, or null with a reason.
 */
export function resolveRoundsFile(config: MetaEvolveConfig, workspace: PathResolution): PathResolution {
  const tried: Candidate[] = []
  const explicit = config.roundsFile ?? envString('DSH_META_EVOLVE_ROUNDS')
  const explicitFrom = config.roundsFile !== undefined ? 'config.roundsFile' : 'env.DSH_META_EVOLVE_ROUNDS'
  if (explicit !== null) {
    const base = workspace.path ?? process.cwd()
    const path = absoluteAgainst(explicit, base)
    tried.push({ path, from: explicitFrom })
    return { path, from: explicitFrom, tried, reason: null }
  }
  if (workspace.path === null) {
    return {
      path: null,
      from: null,
      tried,
      reason: `the workspace did not resolve (${workspace.reason ?? 'no reason recorded'}), so research/meta-evolve-rounds.jsonl has no home`,
    }
  }
  const path = join(workspace.path, 'research', 'meta-evolve-rounds.jsonl')
  tried.push({ path, from: 'workspace/research/meta-evolve-rounds.jsonl' })
  return { path, from: 'workspace/research/meta-evolve-rounds.jsonl', tried, reason: null }
}

/**
 * Resolve everything a route needs, once per apply.
 *
 * @param rawConfig - the row's config before interpretation.
 * @returns the resolved host, including every path's provenance and config problems.
 */
export function resolveHost(rawConfig: Record<string, unknown>): ResolvedHost {
  const { config, problems } = readConfig(rawConfig)
  const hostUrl = resolveHostUrl(config)
  const workspace = resolveWorkspace(config)
  const pluginsRoot = resolvePluginsRoot(config, workspace)
  const roundsFile = resolveRoundsFile(config, workspace)
  const timeoutMs = config.timeoutMs ?? 5_000
  return {
    hostUrl: hostUrl.path ?? DEFAULT_HOST_URL,
    hostFrom: hostUrl.from ?? 'default',
    timeoutMs,
    workspace,
    pluginsRoot,
    roundsFile,
    problems,
  }
}

/** True when the path exists (used by the rounds reader; kept here so path policy lives in one file). */
export function fileExists(path: string): boolean {
  return existsSync(path)
}
