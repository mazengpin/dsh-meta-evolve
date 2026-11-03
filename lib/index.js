import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/host/sources.ts
/**
* The five readers that compose the meta layer's state, and the snapshot the
* evolution control compares rounds with.
*
* TWO DISCIPLINES DECIDE WHETHER THIS FILE IS HONEST, AND BOTH ARE THE
* PROGRAM'S OWN RECORDED TRAPS.
*
* 1. A SOURCE IS READ LIVE ON EVERY REQUEST, NEVER FROM A CACHE. The three HTTP
*    fields (`decisionLog`, `lvl1Gate`, `intentMap`) are fetched from
*    `http://127.0.0.1:3083` each time; the two disk fields (`intentField`,
*    `plugins`) are re-read each time. Nothing here holds a previous value, so a
*    source that stops answering can never be served as its last good state.
*
* 2. A FAILED SOURCE IS `null` WITH A `reason`, NEVER A ZERO. `active: 0` and
*    `active: null` say opposite things — "the log says no decision is active"
*    versus "the log did not answer" — and this program has published the first
*    when it meant the second more than once. Every count carries its
*    denominator (`of`, `byValueOf`, `outcomesOf`) so a zero can be read against
*    the population it was taken over.
*
* The snapshot is a flattened view of the same reads — counts keyed by a stable
* name, plus the id sets the round delta needs — so the evolution control and
* the state route can never disagree about what was measured: they are built
* from ONE set of reads, not two.
*
* @module dsh-meta-evolve/host/sources
*/
/** Render an unknown thrown value, following `cause` so a refused socket keeps its code. */
function describeError$2(error) {
	if (error instanceof Error) {
		const cause = error.cause;
		if (cause instanceof Error) {
			const code = cause.code;
			return `${error.message}: ${cause.message}${typeof code === "string" ? ` (${code})` : ""}`;
		}
		return error.message;
	}
	return String(error);
}
/**
* Read one JSON route on the live host.
*
* A timeout is enforced with an `AbortController`; the elapsed time and served
* byte count are returned so the state can show HOW a reading was taken, not
* only what it said.
*
* @param url - absolute URL to fetch.
* @param timeoutMs - how long the request may take.
* @returns the parsed body, or a failure carrying the reason.
*/
async function readJson(url, timeoutMs) {
	const started = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { accept: "application/json" }
		});
		const text = await response.text();
		const elapsedMs = Date.now() - started;
		const bytes = Buffer.byteLength(text);
		if (!response.ok) return {
			ok: false,
			url,
			status: response.status,
			elapsedMs,
			bytes,
			reason: `HTTP ${response.status} ${response.statusText} from ${url} (${bytes} B served)`
		};
		try {
			return {
				ok: true,
				value: JSON.parse(text),
				url,
				status: response.status,
				elapsedMs,
				bytes
			};
		} catch (error) {
			return {
				ok: false,
				url,
				status: response.status,
				elapsedMs,
				bytes,
				reason: `invalid JSON from ${url} (${bytes} B): ${describeError$2(error)}`
			};
		}
	} catch (error) {
		return {
			ok: false,
			url,
			status: null,
			elapsedMs: Date.now() - started,
			bytes: null,
			reason: controller.signal.aborted ? `timed out after ${timeoutMs}ms reading ${url}` : `fetch failed for ${url}: ${describeError$2(error)}`
		};
	} finally {
		clearTimeout(timer);
	}
}
/** A plain object, or null. Arrays and null are NOT records. */
function asRecord$1(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value;
}
/** A finite number, or null. A numeric string is NOT a number here. */
function asNumber$1(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/** A string, or null. An empty string is returned as the empty string (it is a value). */
function asString$1(value) {
	return typeof value === "string" ? value : null;
}
/** An array, or null. */
function asArray(value) {
	return Array.isArray(value) ? value : null;
}
/** The five field names, used as keys everywhere a field can be unreadable. */
const FIELD_NAMES = [
	"decisionLog",
	"intentField",
	"lvl1Gate",
	"intentMap",
	"plugins"
];
/** Read `decisionLog` live from the host. */
async function readDecisionLog(host) {
	const route = "/decision-log/api/list";
	const read = await readJson(host.hostUrl + route, host.timeoutMs);
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	if (!read.ok) return {
		field: null,
		reason: read.reason,
		ids: null
	};
	const root = asRecord$1(read.value);
	const census = asRecord$1(root?.["census"]);
	const statuses = asRecord$1(root?.["statuses"]);
	const total = asNumber$1(census?.["decisions"]);
	const active = asNumber$1(statuses?.["active"]);
	const superseded = asNumber$1(statuses?.["superseded"]);
	if (total === null || active === null || superseded === null) return {
		field: null,
		reason: `${route} answered ${read.status} but the payload does not carry census.decisions/statuses.active/statuses.superseded`,
		ids: null
	};
	const decisions = asArray(root?.["decisions"]);
	if (decisions === null) return {
		field: null,
		reason: `${route} answered ${read.status} but decisions[] is absent, so ids cannot be compared`,
		ids: null
	};
	const ids = [];
	for (const entry of decisions) {
		const id = asString$1(asRecord$1(entry)?.["id"]);
		if (id === null || id === "") return {
			field: null,
			reason: `${route} carries a decision row without a string id`,
			ids: null
		};
		ids.push(id);
	}
	const complete = ids.length === total;
	return {
		field: {
			total,
			active,
			superseded,
			of: total,
			sumsToTotal: active + superseded === total,
			censusAt: asString$1(census?.["censusAt"]),
			events: asNumber$1(census?.["events"]),
			malformedLines: asNumber$1(census?.["malformedLines"]),
			shown: asNumber$1(census?.["shown"]),
			source: route,
			readAt
		},
		reason: null,
		ids: complete ? ids.sort() : null
	};
}
/** Read `intentField` from `plan/intent-field/field.json` in the program workspace. */
function readIntentField(workspace) {
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	if (workspace.path === null) return {
		field: null,
		reason: workspace.reason ?? "the workspace did not resolve",
		ids: null
	};
	const file = join(workspace.path, "plan", "intent-field", "field.json");
	let raw;
	let bytes;
	try {
		bytes = statSync(file).size;
		raw = readFileSync(file, "utf8");
	} catch (error) {
		return {
			field: null,
			reason: `${file} could not be read: ${error instanceof Error ? error.message : String(error)}`,
			ids: null
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			field: null,
			reason: `${file} is present (${bytes} B) but is not valid JSON: ${message}`,
			ids: null
		};
	}
	const root = asRecord$1(parsed);
	const documents = asArray(root?.["documents"]);
	if (documents === null) return {
		field: null,
		reason: `${file} is valid JSON but documents[] is absent`,
		ids: null
	};
	const ids = [];
	const rowRefs = [];
	const values = /* @__PURE__ */ new Map();
	let rows = 0;
	let rowsWithoutValue = 0;
	for (const document of documents) {
		const rowsRaw = asArray(asRecord$1(document)?.["rows"]);
		if (rowsRaw === null) continue;
		for (const row of rowsRaw) {
			rows += 1;
			const record = asRecord$1(row);
			const id = asString$1(record?.["id"]);
			if (id === null || id === "") return {
				field: null,
				reason: `${file} carries a row without a string id (row ${rows})`,
				ids: null
			};
			ids.push(id);
			if (record === null || !("value" in record)) {
				rowsWithoutValue += 1;
				continue;
			}
			const value = String(record["value"]);
			values.set(value, (values.get(value) ?? 0) + 1);
			rowRefs.push({
				id,
				value
			});
		}
	}
	const unique = new Set(ids);
	const duplicateRowIds = ids.length - unique.size;
	const byValue = {};
	for (const key of [...values.keys()].sort()) byValue[key] = values.get(key) ?? 0;
	const declaredRows = asNumber$1(asRecord$1(root?.["counts"])?.["rowsTotal"]);
	const comparable = duplicateRowIds === 0 && rowsWithoutValue === 0;
	return {
		field: {
			rows,
			of: rows,
			byValue,
			byValueOf: rows - rowsWithoutValue,
			rowsWithoutValue,
			duplicateRowIds,
			generatedAt: asString$1(root?.["generatedAt"]),
			mode: asString$1(asRecord$1(root?.["mode"])?.["name"]),
			documents: asNumber$1(asRecord$1(root?.["counts"])?.["documents"]) ?? documents.length,
			declaredRows,
			rowsMatchDeclared: declaredRows === null ? null : declaredRows === rows,
			file,
			bytes,
			readAt
		},
		reason: null,
		ids: comparable ? rowRefs.sort((a, b) => a.id.localeCompare(b.id)) : null
	};
}
/** Read `lvl1Gate` from status AND sessions; both are required for the field to be readable. */
async function readLvl1Gate(host) {
	const statusRoute = "/lvl1-gate/api/status";
	const sessionsRoute = "/lvl1-gate/api/sessions";
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	const [statusRead, sessionsRead] = await Promise.all([readJson(host.hostUrl + statusRoute, host.timeoutMs), readJson(host.hostUrl + sessionsRoute, host.timeoutMs)]);
	const problems = [];
	if (!statusRead.ok) problems.push(`${statusRoute}: ${statusRead.reason}`);
	if (!sessionsRead.ok) problems.push(`${sessionsRoute}: ${sessionsRead.reason}`);
	if (problems.length > 0) return {
		field: null,
		reason: problems.join("; "),
		ids: null
	};
	const status = asRecord$1(statusRead.value);
	const sessions = asRecord$1(sessionsRead.value);
	const hooked = status?.["hooked"];
	const runs = asNumber$1(status?.["runs"]);
	const handed = sessions?.["hooked"];
	const count = asNumber$1(sessions?.["count"]);
	const census = asRecord$1(sessions?.["historyCensus"]);
	const decided = asNumber$1(census?.["decided"]);
	const declined = asNumber$1(census?.["declined"]);
	const neverRan = asNumber$1(census?.["neverRan"]);
	if (typeof hooked !== "boolean" || typeof handed !== "boolean" || runs === null || count === null || decided === null || declined === null || neverRan === null) return {
		field: null,
		reason: `${statusRoute} and/or ${sessionsRoute} answered but the payloads lack hooked/runs/count/historyCensus`,
		ids: null
	};
	const inProcessCensus = asRecord$1(sessions?.["outcomeCensus"]);
	const inProcessDecided = asNumber$1(inProcessCensus?.["decided"]);
	const inProcessDeclined = asNumber$1(inProcessCensus?.["declined"]);
	const inProcessNeverRan = asNumber$1(inProcessCensus?.["neverRan"]);
	const inProcessOf = asNumber$1(sessions?.["inProcess"]);
	const inProcessComplete = inProcessDecided !== null && inProcessDeclined !== null && inProcessNeverRan !== null;
	const lastProvenance = asRecord$1(asRecord$1(status?.["last"])?.["provenance"]);
	const revisions = asArray(status?.["revisions"]);
	const statusSessionCount = asNumber$1(status?.["sessionCount"]);
	return {
		field: {
			hooked,
			hookedAgrees: handed === hooked,
			runs,
			sessions: count,
			statusSessionCount,
			sessionsAgree: statusSessionCount === null ? null : statusSessionCount === count,
			outcomes: {
				decided,
				declined,
				neverRan
			},
			outcomesOf: count,
			outcomesBasis: asString$1(census?.["basis"]),
			sumsToOutcomes: decided + declined + neverRan === count,
			inProcessOutcomes: inProcessComplete && inProcessDecided !== null && inProcessDeclined !== null && inProcessNeverRan !== null ? {
				decided: inProcessDecided,
				declined: inProcessDeclined,
				neverRan: inProcessNeverRan
			} : null,
			inProcessOutcomesOf: inProcessOf ?? null,
			inProcessBasis: asString$1(inProcessCensus?.["basis"]),
			last: lastProvenance === null ? null : {
				outcome: asString$1(lastProvenance["outcome"]),
				reason: asString$1(lastProvenance["reason"]),
				channel: asString$1(lastProvenance["channel"]),
				at: asString$1(lastProvenance["at"])
			},
			revisions: revisions === null ? null : revisions.map((entry) => String(entry)),
			sources: [statusRoute, sessionsRoute],
			readAt
		},
		reason: null,
		ids: null
	};
}
/** Read `intentMap` live from the host. */
async function readIntentMap(host) {
	const route = "/intent-map/api/map";
	const read = await readJson(host.hostUrl + route, host.timeoutMs);
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	if (!read.ok) return {
		field: null,
		reason: read.reason,
		ids: null
	};
	const root = asRecord$1(read.value);
	const corpus = asRecord$1(root?.["corpus"]);
	const zonesCensus = asRecord$1(corpus?.["zones"]);
	const index = asRecord$1(root?.["index"]);
	const identity = asRecord$1(index?.["identity"]);
	const zones = asNumber$1(zonesCensus?.["count"]);
	const of = asNumber$1(zonesCensus?.["of"]);
	const model = asString$1(identity?.["model"]);
	const dim = asNumber$1(identity?.["dim"]);
	if (zones === null || of === null || model === null || dim === null) return {
		field: null,
		reason: `${route} answered ${read.status} but corpus.zones.count/of or index.identity.model/dim is absent`,
		ids: null
	};
	const zoneRows = asArray(root?.["zones"]);
	const inScope = asRecord$1(corpus?.["inScopePlugins"]);
	return {
		field: {
			zones,
			zoneRows: zoneRows === null ? null : zoneRows.length,
			zonesMatch: zoneRows === null ? null : zoneRows.length === zones,
			of,
			model,
			dim,
			freshness: asString$1(index?.["freshness"]),
			corpusPlugins: asNumber$1(inScope?.["count"]),
			corpusOf: asNumber$1(inScope?.["of"]),
			catalogCount: asNumber$1(corpus?.["catalogCount"]),
			censusAt: asString$1(corpus?.["censusAt"]),
			source: route,
			readAt
		},
		reason: null,
		ids: null
	};
}
/**
* Count the `dsh-meta-*` DIRECTORIES under `plugins-src/`.
*
* `readdirSync(..., { withFileTypes: true })` filtered by `isDirectory()` rather
* than the length of a listing: a listing includes files, and this program has
* already published a directory count that was really an entry count.
*/
function readPlugins(pluginsRoot) {
	const readAt = (/* @__PURE__ */ new Date()).toISOString();
	if (pluginsRoot.path === null) return {
		field: null,
		reason: pluginsRoot.reason ?? "plugins-src did not resolve",
		ids: null
	};
	let directories;
	try {
		directories = readdirSync(pluginsRoot.path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			field: null,
			reason: `${pluginsRoot.path} could not be listed: ${message}`,
			ids: null
		};
	}
	const names = directories.filter((name) => name.startsWith("dsh-meta-")).sort();
	return {
		field: {
			count: names.length,
			of: directories.length,
			names,
			root: pluginsRoot.path,
			readAt
		},
		reason: null,
		ids: names
	};
}
/**
* Flatten every count in a state into `{key: number|null}`.
*
* The keys are stable across rounds (`decisionLog.total`, `intentField.byValue.plan`, ...),
* which is what lets the delta name the counts that moved. A `null` value means
* the field was unreadable — it is never folded to zero here.
*
* @param state - the composed state.
* @returns the flat count map.
*/
function flatCounts(state) {
	const counts = {};
	counts["decisionLog.total"] = state.decisionLog?.total ?? null;
	counts["decisionLog.active"] = state.decisionLog?.active ?? null;
	counts["decisionLog.superseded"] = state.decisionLog?.superseded ?? null;
	if (state.intentField === null) counts["intentField.rows"] = null;
	else {
		counts["intentField.rows"] = state.intentField.rows;
		for (const [value, count] of Object.entries(state.intentField.byValue)) counts[`intentField.byValue.${value}`] = count;
	}
	counts["lvl1Gate.runs"] = state.lvl1Gate?.runs ?? null;
	counts["lvl1Gate.sessions"] = state.lvl1Gate?.sessions ?? null;
	counts["lvl1Gate.outcomes.decided"] = state.lvl1Gate?.outcomes.decided ?? null;
	counts["lvl1Gate.outcomes.declined"] = state.lvl1Gate?.outcomes.declined ?? null;
	counts["lvl1Gate.outcomes.neverRan"] = state.lvl1Gate?.outcomes.neverRan ?? null;
	counts["intentMap.zones"] = state.intentMap?.zones ?? null;
	counts["intentMap.corpusPlugins"] = state.intentMap?.corpusPlugins ?? null;
	counts["intentMap.dim"] = state.intentMap?.dim ?? null;
	counts["plugins.count"] = state.plugins?.count ?? null;
	return counts;
}
/**
* Read every field LIVE and compose the state, once.
*
* The same five reads produce both the served state and the snapshot, so the
* evolution control's delta and the state route's counts are two views of ONE
* measurement rather than two measurements that can disagree.
*
* @param host - the resolved host and paths.
* @returns the served state and its snapshot.
*/
async function readState(host) {
	const started = Date.now();
	const [decisionLog, intentField, lvl1Gate, intentMap, plugins] = await Promise.all([
		readDecisionLog(host),
		Promise.resolve(readIntentField(host.workspace)),
		readLvl1Gate(host),
		readIntentMap(host),
		Promise.resolve(readPlugins(host.pluginsRoot))
	]);
	const unreadable = {};
	for (const [name, read] of [
		["decisionLog", decisionLog],
		["intentField", intentField],
		["lvl1Gate", lvl1Gate],
		["intentMap", intentMap],
		["plugins", plugins]
	]) if (read.field === null) unreadable[name] = read.reason ?? "unreadable, no reason recorded";
	const state = {
		ok: true,
		built: true,
		note: "live",
		at: (/* @__PURE__ */ new Date()).toISOString(),
		host: host.hostUrl,
		hostFrom: host.hostFrom,
		workspace: host.workspace.path === null ? null : {
			path: host.workspace.path,
			from: host.workspace.from
		},
		workspaceReason: host.workspace.reason,
		pluginsRoot: host.pluginsRoot.path === null ? null : {
			path: host.pluginsRoot.path,
			from: host.pluginsRoot.from
		},
		roundsFile: host.roundsFile.path === null ? null : {
			path: host.roundsFile.path,
			from: host.roundsFile.from
		},
		roundsFileReason: host.roundsFile.reason,
		decisionLog: decisionLog.field,
		intentField: intentField.field,
		lvl1Gate: lvl1Gate.field,
		intentMap: intentMap.field,
		plugins: plugins.field,
		unreadable,
		counts: {},
		countsRead: {
			read: 0,
			of: 0
		},
		notDone: ["This route opens no device and calls no model; every field is a disk read or an HTTP route read on this request.", "This route caches nothing; a source that fails is reported null with a reason and never as a previous value."],
		readMs: Date.now() - started
	};
	const counts = flatCounts(state);
	const values = Object.values(counts);
	const composed = {
		...state,
		counts,
		countsRead: {
			read: values.filter((value) => value !== null).length,
			of: values.length
		},
		readMs: Date.now() - started
	};
	return {
		state: composed,
		snapshot: {
			counts,
			fieldReadable: {
				decisionLog: composed.decisionLog !== null,
				intentField: composed.intentField !== null,
				lvl1Gate: composed.lvl1Gate !== null,
				intentMap: composed.intentMap !== null,
				plugins: composed.plugins !== null
			},
			ids: {
				decisions: decisionLog.ids,
				plugins: plugins.ids,
				intentRows: intentField.ids
			},
			model: composed.intentMap?.model ?? null
		}
	};
}
//#endregion
//#region src/host/beam-round.ts
/** The port `Control.HTTP` listens on unless `CONTROL_PORT` says otherwise. */
const DEFAULT_CONTROL_PORT = 4100;
/** The env key that repoints the control app, mirroring `CONTROL_PORT`. */
const CONTROL_URL_ENV = "DSH_META_EVOLVE_CONTROL_URL";
/** The two routes this module reads, named once so a listing cannot drift from the table. */
const BEAM_STATUS_PATH = "/api/beam/status";
const FLEET_STATUS_PATH = "/fleet/status";
/** Every numeric field a round captures from the control app, in one place. */
const BEAM_FIELD_NAMES = [
	"loadedModuleCount",
	"processCount",
	"uptimeMs",
	"httpRequests",
	"httpConnections",
	"fleetUnits"
];
/** The identity values a round captures. Identity is a string, never a count. */
const BEAM_IDENTITY_NAMES = ["node", "systemPid"];
/** Render an unknown thrown value. */
function describeError$1(error) {
	if (error instanceof Error) return error.message;
	return String(error);
}
/**
* Resolve the control app's origin the way the app resolves its own port.
*
* An explicit URL wins; then a numeric `CONTROL_PORT` (the app's own override);
* then the app's default. A `CONTROL_PORT` that is not a port is REPORTED rather
* than silently used, and the default still applies.
*
* @param env - the process environment, injected so a verifier can drive it.
* @returns the origin, where it came from, and any value that was ignored.
*/
function resolveControlUrl(env) {
	const problems = [];
	const explicit = env[CONTROL_URL_ENV];
	if (explicit !== void 0 && explicit.trim() !== "") {
		const url = explicit.trim().replace(/\/+$/, "");
		try {
			if (new URL(url).protocol !== "http:") problems.push(`${CONTROL_URL_ENV} is not an http origin: ${url}`);
		} catch (error) {
			problems.push(`${CONTROL_URL_ENV} is not a URL (${describeError$1(error)}); the default is used instead`);
			return {
				url: `http://127.0.0.1:${DEFAULT_CONTROL_PORT}`,
				from: "default (ignored an unusable override)",
				problems
			};
		}
		return {
			url,
			from: `env.${CONTROL_URL_ENV}`,
			problems
		};
	}
	const port = env["CONTROL_PORT"];
	if (port !== void 0 && port.trim() !== "") {
		const value = Number.parseInt(port.trim(), 10);
		if (!Number.isFinite(value) || value <= 0 || value > 65535) problems.push(`CONTROL_PORT is not a port: ${JSON.stringify(port)}; the default ${DEFAULT_CONTROL_PORT} is used instead`);
		else return {
			url: `http://127.0.0.1:${value}`,
			from: "env.CONTROL_PORT",
			problems
		};
	}
	return {
		url: `http://127.0.0.1:${DEFAULT_CONTROL_PORT}`,
		from: "default (Control.HTTP @default_port)",
		problems
	};
}
/** A plain object, or null. Arrays and null are NOT records. */
function asRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value;
}
/** A finite number, or null. A numeric string is NOT a number here. */
function asNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/** A string, or null. */
function asString(value) {
	return typeof value === "string" ? value : null;
}
/** Walk a dotted path through plain objects, returning the leaf or null. */
function dig(body, path) {
	let cursor = body;
	for (const step of path) {
		const record = asRecord(cursor);
		if (record === null) return null;
		cursor = record[step];
	}
	return cursor;
}
/**
* One numeric reading from one response body.
*
* @param body - the parsed response, or null when the read failed.
* @param path - the dotted path inside the body.
* @param failure - why the body is null, when it is.
* @returns the value, or the reason it is absent.
*/
function readingAt(body, path, failure) {
	const dotted = path.join(".");
	if (body === null) return { unmeasured: failure ?? `the response carried no ${dotted}` };
	const value = asNumber(dig(body, path));
	if (value === null) return { unmeasured: `the control app answered but carried no numeric ${dotted}` };
	return { value };
}
/** The reason one failed read contributes, naming how it failed. */
function readFailure(read) {
	return read.ok ? null : `${read.reason} (status ${read.status ?? "no answer"}, ${read.elapsedMs} ms)`;
}
/**
* Capture the control app's state as one round's BEAM source.
*
* The two reads are independent: a fleet endpoint that fails does NOT hide the
* BEAM readings, and each field carries its own reason. Nothing is cached.
*
* @param controlUrl - the control app's origin, with or without a trailing slash.
* @param controlFrom - how that origin was decided, carried into the record.
* @param timeoutMs - the per-read bound.
* @returns the captured field, with `readings` as a numerator/denominator pair.
*/
async function captureBeam(controlUrl, controlFrom, timeoutMs) {
	const base = controlUrl.replace(/\/+$/, "");
	const [beamRead, fleetRead] = await Promise.all([readJson(`${base}${BEAM_STATUS_PATH}`, timeoutMs), readJson(`${base}${FLEET_STATUS_PATH}`, timeoutMs)]);
	const beamBody = beamRead.ok ? asRecord(beamRead.value) : null;
	const fleetBody = fleetRead.ok ? asRecord(fleetRead.value) : null;
	const beamFailure = readFailure(beamRead);
	const fleetFailure = readFailure(fleetRead);
	const fields = {
		loadedModuleCount: readingAt(beamBody, ["loaded_module_count"], beamFailure),
		processCount: readingAt(beamBody, ["process_count"], beamFailure),
		uptimeMs: readingAt(beamBody, ["uptime_ms"], beamFailure),
		httpRequests: readingAt(beamBody, ["http", "requests"], beamFailure),
		httpConnections: readingAt(beamBody, ["http", "connections"], beamFailure),
		fleetUnits: readingAt(fleetBody, ["census", "total"], fleetFailure)
	};
	const identity = {
		node: beamBody === null ? null : asString(dig(beamBody, ["node"])),
		systemPid: beamBody === null ? null : asString(dig(beamBody, ["system_pid"]))
	};
	const unavailable = {};
	let read = 0;
	for (const name of BEAM_FIELD_NAMES) {
		const reading = fields[name];
		if ("value" in reading) read += 1;
		else unavailable[`fields.${name}`] = reading.unmeasured;
	}
	let identityRead = 0;
	for (const name of BEAM_IDENTITY_NAMES) if ((identity[name] ?? null) !== null) identityRead += 1;
	else unavailable[`identity.${name}`] = beamFailure ?? `the control app answered but carried no string ${name}`;
	return {
		controlUrl: base,
		controlFrom,
		readAt: (/* @__PURE__ */ new Date()).toISOString(),
		fields,
		identity,
		readings: {
			read,
			of: BEAM_FIELD_NAMES.length
		},
		identityRead: {
			read: identityRead,
			of: BEAM_IDENTITY_NAMES.length
		},
		unavailable
	};
}
/** Read one side of a numeric comparison, keeping WHICH absence it is. */
function sideOf(reading, label) {
	if (reading === void 0) return {
		value: null,
		absent: `${label} did not carry this field`
	};
	if ("value" in reading) return {
		value: reading.value,
		absent: null
	};
	return {
		value: null,
		absent: `${label}: ${reading.unmeasured}`
	};
}
/**
* Compare one round's BEAM against the previous round's.
*
* The absences are collected in the DELTA's own `unavailable` map rather than the
* round's, so a control app that was down for one round cannot change what the
* five HTTP/disk counts claim about themselves.
*
* @param previous - the previous round's captured field.
* @param current - this round's captured field.
* @param previousRound - the previous round's number, for the reasons.
* @returns the delta, with every uncomparable field carrying its reason.
*/
function computeBeamDelta(previous, current, previousRound) {
	const fields = {};
	const moved = [];
	const unavailable = {};
	let uncompared = 0;
	for (const name of BEAM_FIELD_NAMES) {
		const from = sideOf(previous.fields?.[name], `round ${previousRound}`);
		const to = sideOf(current.fields?.[name], "this round");
		if (from.value === null || to.value === null) {
			const parts = [];
			if (from.absent !== null) parts.push(from.absent);
			if (to.absent !== null) parts.push(to.absent);
			const reason = parts.join("; ");
			fields[name] = {
				from: from.value,
				to: to.value,
				delta: null,
				reason
			};
			unavailable[`fields.${name}`] = reason;
			uncompared += 1;
			continue;
		}
		const delta = to.value - from.value;
		fields[name] = {
			from: from.value,
			to: to.value,
			delta,
			reason: null
		};
		if (delta !== 0) moved.push({
			key: name,
			from: from.value,
			to: to.value,
			delta
		});
	}
	const identity = {};
	const changedIdentity = [];
	for (const name of BEAM_IDENTITY_NAMES) {
		const from = previous.identity?.[name] ?? null;
		const to = current.identity?.[name] ?? null;
		if (from === null || to === null) {
			const reason = from === null && to === null ? "the identity was not measured in either round" : from === null ? `the identity was not measured in round ${previousRound}` : "the identity was not measured in this round";
			identity[name] = {
				from,
				to,
				changed: null,
				reason
			};
			unavailable[`identity.${name}`] = reason;
			continue;
		}
		const changed = from !== to;
		identity[name] = {
			from,
			to,
			changed,
			reason: null
		};
		if (changed) changedIdentity.push(name);
	}
	const pid = identity["systemPid"];
	const restarted = pid === void 0 || pid.changed === null ? {
		occurred: null,
		reason: pid?.reason ?? "the pid was not compared, so a restart cannot be claimed"
	} : {
		occurred: pid.changed,
		reason: null
	};
	return {
		fields,
		moved: moved.sort((a, b) => a.key.localeCompare(b.key)),
		movedOf: {
			moved: moved.length,
			checked: BEAM_FIELD_NAMES.length,
			uncompared
		},
		identity,
		changedIdentity: changedIdentity.sort(),
		restarted,
		unavailable
	};
}
//#endregion
//#region src/host/rounds.ts
/**
* The evolution control's record: rounds as DELTAS, appended to
* `research/meta-evolve-rounds.jsonl`.
*
* A CONTROL THAT ONLY READS A VALUE BACK IS NOT A CONTROL. The `evolve` route
* recomputes the same live state the `state` route serves, compares it with the
* last recorded round, and APPENDS a new line. If the round count does not grow
* and the response does not show the change, the route is a read, not a control —
* the verify harness asserts the file's line count before and after.
*
* AND THE ROUND NOW CARRIES THE ELIXIR APP. A round's `beam` object is the
* control app as that round saw it (`host/beam-round.ts`), and `delta.beam` is
* the comparison against the previous round's. On the first round there is
* nothing to compare, so `delta.beam` is `null` and BOTH the delta and the record
* say `'first round'` — a delta of zeros would claim a BEAM that did not move.
* Its absences live in the delta's own `unavailable` map, not the round's: a
* control app that was down must not change what the five HTTP/disk counts say
* about themselves.
*
* WHAT A DELTA IS, AND WHAT "FIRST ROUND" MEANS
*
* `delta` names every count that moved, by how much, plus the ids that appeared,
* disappeared, and — for intent rows — changed value between the two rounds.
* When there is no previous round the delta is `null` with `deltaReason:
* "first round"`, NOT a set of zeros: a zero delta would claim the state did not
* change when nothing was compared.
*
* ABSENT IS NOT ZERO, AGAIN, ACROSS THE FILE BOUNDARY. If a source was
* unreadable in either round, the comparison for that count is
* `{from, to, delta: null, reason}` and the id sets are `null` with a reason in
* `unavailable`. A set that could not be read must never compare as "everything
* disappeared", which is what a `null` folded to `[]` would produce.
*
* ONE PROCESS, ONE WRITER. Appends are serialised inside this process so two
* concurrent `evolve` requests cannot interleave a line. Cross-process appends
* of a single small line are atomic at the OS level, but the ROUND NUMBER is
* derived from a read-then-write and could repeat if two processes evolved at
* once; the number is a record label, not a lock, and the file is a JSONL log
* whose lines each carry their own `at`.
*
* @module dsh-meta-evolve/host/rounds
*/
/** Serialise work that appends to the rounds file, so two requests cannot interleave a line. */
let appendChain = Promise.resolve();
/**
* Run `work` after every previously queued append has settled.
*
* @param work - the read-compare-append sequence.
* @returns the work's result.
*/
function serialize(work) {
	const result = appendChain.then(work, work);
	appendChain = result.then(() => void 0, () => void 0);
	return result;
}
/** Count physical lines without the trailing-newline off-by-one (`split` adds a phantom last element). */
function countLines(text) {
	if (text === "") return 0;
	return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}
/** The field a flat count key belongs to (`lvl1Gate.outcomes.decided` -> `lvl1Gate`). */
function fieldOf(key) {
	const head = key.includes(".") ? key.slice(0, key.indexOf(".")) : key;
	return FIELD_NAMES.includes(head) ? head : null;
}
/**
* The value one side contributes for a key, and — when there is none — WHICH KIND
* of absence it is.
*
* ABSENT IS NOT ZERO, AND THIS IS WHERE THAT RULE WAS BEING BROKEN. This function
* used to return `0` for any key the record did not carry whenever the key's FIELD
* was readable. The intent was legitimate — an `intentField.byValue.<value>` bucket
* that no longer occurs really has zero rows — but the rule could not tell that case
* from the case that matters more: **a count the earlier round never recorded at all,
* because the key was added to `flatCounts` after that round was written.** Under the
* old rule such a key compared as `0 -> n` and was recorded as MOVEMENT, so adding a
* key manufactured a change that never happened.
*
* So the two absences are now separated and neither is folded to zero:
*   `unreadable`  — the source did not answer; the field's own readability says so.
*   `not-emitted` — the field WAS readable and simply carried no such key.
* A caller receives `value: null` plus the kind and must report it, never total it.
*
* @param counts - that side's flat count map.
* @param readable - that side's per-field readability.
* @param key - the count key being compared.
* @returns the value, or null with the kind of absence.
*/
function sideValue(counts, readable, key) {
	if (Object.prototype.hasOwnProperty.call(counts, key)) {
		const value = counts[key];
		if (value === null || value === void 0) return {
			value: null,
			absent: "unreadable"
		};
		return {
			value,
			absent: null
		};
	}
	const field = fieldOf(key);
	if (field === null) return {
		value: null,
		absent: "not-emitted"
	};
	return {
		value: null,
		absent: readable[field] ? "not-emitted" : "unreadable"
	};
}
/** Render one side's absence as the sentence a reader needs to tell the two apart. */
function absenceReason(side, roundLabel) {
	if (side.absent === "not-emitted") return `the count was not recorded in ${roundLabel} (its field was readable, so the key was absent rather than the source unreadable)`;
	return `the source was unreadable in ${roundLabel}`;
}
/** Compare two id sets; `null` on either side is an uncompared set, never an empty one. */
function compareSets(previous, now, keyOf) {
	const previousCount = previous === null ? null : previous.length;
	const nowCount = now === null ? null : now.length;
	if (previous === null || now === null) return {
		appeared: null,
		disappeared: null,
		previous: previousCount,
		now: nowCount,
		reason: previous === null && now === null ? "unreadable in both rounds" : previous === null ? "unreadable in the previous round" : "unreadable in this round"
	};
	const previousKeys = new Map(previous.map((entry) => [keyOf(entry), entry]));
	const nowKeys = new Map(now.map((entry) => [keyOf(entry), entry]));
	return {
		appeared: now.filter((entry) => !previousKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
		disappeared: previous.filter((entry) => !nowKeys.has(keyOf(entry))).sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
		previous: previousCount,
		now: nowCount,
		reason: null
	};
}
/**
* Compute the delta of `current` against `previous`.
*
* @param previous - the last recorded round.
* @param current - the fresh snapshot.
* @returns the delta, with every uncomparable count or set carrying its reason.
*/
function computeDelta(previous, current, beam = null) {
	const keys = [.../* @__PURE__ */ new Set([...Object.keys(previous.counts), ...Object.keys(current.counts)])].sort();
	const counts = {};
	const moved = [];
	const unavailable = {};
	let uncompared = 0;
	for (const key of keys) {
		const fromReading = sideValue(previous.counts, previous.fieldReadable, key);
		const toReading = sideValue(current.counts, current.fieldReadable, key);
		const from = fromReading.value;
		const to = toReading.value;
		if (from === null || to === null) {
			const field = fieldOf(key);
			const parts = [];
			if (from === null) parts.push(absenceReason(fromReading, `round ${previous.n}`));
			if (to === null) parts.push(absenceReason(toReading, "this round"));
			const reason = parts.join("; ");
			counts[key] = {
				from,
				to,
				delta: null,
				reason
			};
			unavailable[`counts.${key}`] = field === null ? reason : `${reason} (${field})`;
			uncompared += 1;
			continue;
		}
		const delta = to - from;
		counts[key] = {
			from,
			to,
			delta,
			reason: null
		};
		if (delta !== 0) moved.push({
			key,
			from,
			to,
			delta
		});
	}
	const decisions = compareSets(previous.ids.decisions, current.ids.decisions, (id) => id);
	const plugins = compareSets(previous.ids.plugins, current.ids.plugins, (name) => name);
	const intentRows = compareSets(previous.ids.intentRows, current.ids.intentRows, (row) => row.id);
	if (decisions.reason !== null) unavailable["ids.decisions"] = decisions.reason;
	if (plugins.reason !== null) unavailable["ids.plugins"] = plugins.reason;
	if (intentRows.reason !== null) unavailable["ids.intentRows"] = intentRows.reason;
	let changedRows = null;
	if (intentRows.reason === null && previous.ids.intentRows !== null && current.ids.intentRows !== null) {
		const before = new Map(previous.ids.intentRows.map((row) => [row.id, row.value]));
		const now = new Map(current.ids.intentRows.map((row) => [row.id, row.value]));
		changedRows = [];
		for (const [id, value] of now) {
			const previousValue = before.get(id);
			if (previousValue !== void 0 && previousValue !== value) changedRows.push({
				id,
				from: previousValue,
				to: value
			});
		}
		changedRows.sort((a, b) => a.id.localeCompare(b.id));
	}
	const identityNow = { model: current.model };
	const identityBefore = { model: previous.model ?? null };
	const values = {};
	const changedValues = [];
	let valuesChanged = 0;
	let valuesUncomparable = 0;
	for (const key of Object.keys(identityNow).sort()) {
		const before = identityBefore[key] ?? null;
		const now = identityNow[key] ?? null;
		if (before === null || now === null) {
			const reason = before === null && now === null ? "the identity was not measured in either round" : before === null ? `the identity was not measured in round ${previous.n}` : "the identity was not measured in this round";
			values[key] = {
				from: before,
				to: now,
				changed: null,
				reason
			};
			unavailable[`values.${key}`] = reason;
			valuesUncomparable += 1;
			continue;
		}
		const changed = before !== now;
		values[key] = {
			from: before,
			to: now,
			changed,
			reason: null
		};
		if (changed) {
			changedValues.push({
				key,
				from: before,
				to: now
			});
			valuesChanged += 1;
		}
	}
	const previousBeam = previous.beam ?? null;
	const beamDelta = previousBeam === null || beam === null ? null : computeBeamDelta(previousBeam, beam, previous.n);
	const beamReason = previousBeam === null ? `round ${previous.n} carries no beam record, so the BEAM cannot be compared` : beam === null ? "this round captured no beam record, so the BEAM cannot be compared" : null;
	return {
		against: previous.n,
		againstAt: previous.at,
		counts,
		moved,
		movedOf: {
			moved: moved.length,
			checked: keys.length,
			uncompared
		},
		values,
		changedValues,
		beam: beamDelta,
		beamReason,
		valuesOf: {
			changed: valuesChanged,
			checked: Object.keys(identityNow).length,
			uncomparable: valuesUncomparable
		},
		appeared: {
			decisions: decisions.appeared,
			plugins: plugins.appeared,
			intentRows: intentRows.appeared
		},
		disappeared: {
			decisions: decisions.disappeared,
			plugins: plugins.disappeared,
			intentRows: intentRows.disappeared
		},
		changed: { intentRows: changedRows },
		denominators: {
			decisions: {
				previous: decisions.previous,
				now: decisions.now
			},
			plugins: {
				previous: plugins.previous,
				now: plugins.now
			},
			intentRows: {
				previous: intentRows.previous,
				now: intentRows.now
			}
		},
		unavailable
	};
}
/** Build the round record for one evolve call. */
function buildRound(input) {
	const at = (input.now ?? /* @__PURE__ */ new Date()).toISOString();
	const values = Object.values(input.snapshot.counts);
	const delta = input.previous === null ? null : computeDelta(input.previous, input.snapshot, input.beam);
	return {
		n: input.previous === null ? 1 : input.previous.n + 1,
		at,
		host: input.host,
		workspace: input.workspace,
		model: input.snapshot.model,
		counts: input.snapshot.counts,
		countsRead: {
			read: values.filter((value) => value !== null).length,
			of: values.length
		},
		fieldReadable: input.snapshot.fieldReadable,
		ids: input.snapshot.ids,
		beam: input.beam,
		beamReason: input.beam === null ? "the control app was not captured for this round" : null,
		delta,
		deltaReason: input.previous === null ? "first round" : null,
		beamDeltaReason: delta === null ? "first round" : delta.beamReason,
		unreadable: input.unreadable
	};
}
/** Validate one parsed JSON line as a round record, conservatively. */
function asRound(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {
		round: null,
		reason: "line is not a JSON object"
	};
	const record = value;
	if (typeof record["n"] !== "number" || !Number.isFinite(record["n"])) return {
		round: null,
		reason: "n is not a number"
	};
	if (typeof record["at"] !== "string") return {
		round: null,
		reason: "at is not a string"
	};
	if (typeof record["counts"] !== "object" || record["counts"] === null || Array.isArray(record["counts"])) return {
		round: null,
		reason: "counts is not an object"
	};
	if (typeof record["fieldReadable"] !== "object" || record["fieldReadable"] === null) return {
		round: null,
		reason: "fieldReadable is not an object"
	};
	if (typeof record["ids"] !== "object" || record["ids"] === null || Array.isArray(record["ids"])) return {
		round: null,
		reason: "ids is not an object"
	};
	return {
		round: record,
		reason: null
	};
}
/**
* Read and parse the rounds file.
*
* A missing file is `exists: false` with `rounds: []` — an absent record, not a
* failed read. A malformed line is REPORTED with its 1-based line number rather
* than dropped silently, so `count` can always be read against `lines`.
*
* @param path - the rounds file path.
* @returns the parsed rounds plus every malformed line.
*/
function readRoundsFile(path) {
	if (!existsSync(path)) return {
		path,
		exists: false,
		bytes: 0,
		lines: 0,
		trailingNewline: false,
		rounds: [],
		malformed: []
	};
	let text;
	let bytes;
	try {
		bytes = statSync(path).size;
		text = readFileSync(path, "utf8");
	} catch (error) {
		return {
			path,
			exists: true,
			bytes: 0,
			lines: 0,
			trailingNewline: false,
			rounds: [],
			malformed: [{
				line: 0,
				reason: `the file exists but could not be read: ${error instanceof Error ? error.message : String(error)}`
			}]
		};
	}
	const lines = countLines(text);
	const rounds = [];
	const malformed = [];
	const physical = text.split("\n");
	if (text.endsWith("\n")) physical.pop();
	physical.forEach((line, index) => {
		if (line.trim() === "") {
			malformed.push({
				line: index + 1,
				reason: "blank line; JSONL expects one JSON object per line"
			});
			return;
		}
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			malformed.push({
				line: index + 1,
				reason: `invalid JSON: ${message}`
			});
			return;
		}
		const { round, reason } = asRound(parsed);
		if (round === null) {
			malformed.push({
				line: index + 1,
				reason: reason ?? "not a round record"
			});
			return;
		}
		rounds.push(round);
	});
	return {
		path,
		exists: true,
		bytes,
		lines,
		trailingNewline: text.endsWith("\n"),
		rounds,
		malformed
	};
}
/** Append one round as one LF-terminated JSON line, repairing a missing trailing newline first. */
function appendRound(path, round) {
	mkdirSync(dirname(path), { recursive: true });
	let prefix = "";
	if (existsSync(path)) {
		const existing = readFileSync(path, "utf8");
		if (existing.length > 0 && !existing.endsWith("\n")) prefix = "\n";
	}
	const line = `${JSON.stringify(round)}\n`;
	appendFileSync(path, prefix + line, "utf8");
	const text = readFileSync(path, "utf8");
	return {
		path,
		bytes: Buffer.byteLength(text),
		lines: countLines(text),
		trailingNewline: text.endsWith("\n"),
		repairedTrailingNewline: prefix !== "",
		appended: true
	};
}
//#endregion
//#region src/host/routes.ts
/** The composed-state route. This path existed in the package shell and is preserved. */
const STATE_PATH = "/meta-evolve/api/state";
/** The evolution control route. */
const EVOLVE_PATH = "/meta-evolve/api/evolve";
/** The recorded-rounds route. */
const ROUNDS_PATH = "/meta-evolve/api/rounds";
/**
* The BEAM deltas recorded so far, newest first.
*
* It is a SEPARATE route rather than a field on `/rounds` because it answers a
* different question: `/rounds` is "what did the program record", and this is
* "what did the Elixir app do between rounds" — read straight off the record
* file on every request, so a delta cannot be served from a previous read.
*/
const BEAM_ROUNDS_PATH = "/meta-evolve/api/rounds/beam";
/** Every path this package advertises, derived in ONE place so a listing cannot drift from the table. */
const ROUTE_PATHS = [
	STATE_PATH,
	EVOLVE_PATH,
	ROUNDS_PATH,
	BEAM_ROUNDS_PATH
];
/** An error that carries its own HTTP status and machine-readable detail. */
var HttpError = class extends Error {
	status;
	detail;
	constructor(status, message, detail = {}) {
		super(message);
		this.status = status;
		this.detail = detail;
		this.name = "HttpError";
	}
};
/** Write one JSON body with direct response ownership and no caching. */
function sendJson(res, status, body, headers = {}) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(text),
		"Cache-Control": "no-store",
		...headers
	});
	res.end(text);
}
/** Render an unknown thrown value. */
function describeError(error) {
	if (error instanceof Error) {
		const cause = error.cause;
		if (cause instanceof Error) return `${error.message}: ${cause.message}`;
		return error.message;
	}
	return String(error);
}
/**
* Enforce the method a route advertises.
*
* A registration matches the PATH, not the method, so without this the `GET` or
* `POST` in every description would be decorative. 405 is the honest answer for
* another method: the path exists and this is not how it is read.
*
* @returns true when the handler may continue.
*/
function requireMethod(req, res, allowed) {
	const method = req.method ?? "";
	if (allowed.includes(method)) return true;
	sendJson(res, 405, {
		ok: false,
		error: `${allowed.join(" or ")} required`
	}, { Allow: allowed.join(", ") });
	return false;
}
/** Parse `?limit=` for the rounds route. Null means "no limit". */
function parseLimit(raw) {
	if (raw === null || raw === "") return null;
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value <= 0) throw new HttpError(400, `limit must be a positive integer, got ${JSON.stringify(raw)}`);
	return Math.min(value, 500);
}
/** Handle the composed-state read. */
async function handleState(res, host) {
	const { state } = await readState(host);
	sendJson(res, 200, state);
}
/** Handle the rounds read: newest first, with the count and the file's line census. */
function handleRounds(res, host, limit) {
	const path = host.roundsFile.path;
	if (path === null) {
		sendJson(res, 503, {
			ok: false,
			error: "the rounds file has no resolved path, so there is nothing to read",
			reason: host.roundsFile.reason,
			tried: host.roundsFile.tried
		});
		return;
	}
	const file = readRoundsFile(path);
	const newestFirst = [...file.rounds].reverse();
	const selected = limit === null ? newestFirst : newestFirst.slice(0, limit);
	sendJson(res, 200, {
		ok: true,
		count: selected.length,
		total: file.rounds.length,
		lines: file.lines,
		bytes: file.bytes,
		path: file.path,
		exists: file.exists,
		trailingNewline: file.trailingNewline,
		malformedLines: file.malformed.length,
		malformed: file.malformed,
		rounds: selected
	});
}
/**
* Handle the BEAM deltas read.
*
* THE FILE IS RE-READ ON EVERY REQUEST. There is no cache in this package, and a
* cached delta would be a previous round's BEAM served as the current one.
*
* A record written before the field existed is NOT reported as a round whose
* BEAM did not change: it carries `beam: null` with the reason, so an absent
* reading is visible as an absence rather than as stability.
*
* @param res - the response this handler owns.
* @param host - the resolved paths.
* @param limit - how many newest rows to return; null means every one.
*/
function handleBeamRounds(res, host, limit) {
	const path = host.roundsFile.path;
	if (path === null) {
		sendJson(res, 503, {
			ok: false,
			error: "the rounds file has no resolved path, so there are no beam deltas to read",
			reason: host.roundsFile.reason,
			tried: host.roundsFile.tried
		});
		return;
	}
	const file = readRoundsFile(path);
	const rows = file.rounds.map((round) => {
		const beam = round.beam ?? null;
		return {
			n: round.n,
			at: round.at,
			beam,
			beamReason: beam === null ? round.beamReason ?? "this round carries no beam record" : null,
			delta: round.delta?.beam ?? null,
			deltaReason: round.delta === null ? round.beamDeltaReason ?? round.deltaReason ?? "no delta was recorded" : round.beamDeltaReason ?? round.delta.beamReason ?? "the delta carries no beam comparison"
		};
	});
	const newestFirst = rows.reverse();
	const selected = limit === null ? newestFirst : newestFirst.slice(0, limit);
	sendJson(res, 200, {
		ok: true,
		count: selected.length,
		total: rows.length,
		lines: file.lines,
		bytes: file.bytes,
		path: file.path,
		exists: file.exists,
		trailingNewline: file.trailingNewline,
		malformedLines: file.malformed.length,
		malformed: file.malformed,
		readFrom: "the rounds file, re-read on this request",
		rounds: selected
	});
}
/** Handle the evolution control: recompute, compare, append, and report the file change. */
async function handleEvolve(res, host) {
	sendJson(res, 200, {
		ok: true,
		...await serialize(async () => {
			const path = host.roundsFile.path;
			if (path === null) throw new HttpError(503, "the rounds file has no resolved path; a round will not be recorded nowhere", {
				reason: host.roundsFile.reason,
				tried: host.roundsFile.tried
			});
			const control = resolveControlUrl(process.env);
			const [{ state, snapshot }, beam] = await Promise.all([readState(host), captureBeam(control.url, control.from, host.timeoutMs)]);
			const before = readRoundsFile(path);
			const round = buildRound({
				previous: before.rounds.length === 0 ? null : before.rounds[before.rounds.length - 1] ?? null,
				snapshot,
				host: host.hostUrl,
				workspace: host.workspace.path,
				unreadable: state.unreadable,
				beam
			});
			const stored = appendRound(path, round);
			const after = readRoundsFile(path);
			const last = after.rounds.length === 0 ? null : after.rounds[after.rounds.length - 1] ?? null;
			const verified = last !== null && last.n === round.n && stored.lines === after.lines;
			return {
				round,
				stored,
				beamControl: {
					url: control.url,
					from: control.from,
					problems: control.problems
				},
				before: {
					exists: before.exists,
					lines: before.lines,
					rounds: before.rounds.length
				},
				change: {
					linesDelta: stored.lines - before.lines,
					roundsDelta: after.rounds.length - before.rounds.length
				},
				verification: {
					verified,
					reason: verified ? null : `the file was re-read after the append and did not return round n=${round.n} as its last record`,
					lines: after.lines,
					rounds: after.rounds.length,
					lastN: last?.n ?? null
				}
			};
		})
	});
}
/**
* Dispatch one request.
*
* Every failure path answers JSON with `ok: false` and a reason; a source that
* fails does NOT make the state route fail, because an unreadable source is a
* readable state. A route that cannot answer at all (no rounds path) answers 503
* rather than 200-with-zero, because `count: 0` would read as "no rounds".
*
* @param req - the incoming request.
* @param res - the response this handler owns directly.
* @param host - the resolved paths and origin, resolved once at apply.
*/
async function handle(req, res, host) {
	try {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		switch (url.pathname) {
			case STATE_PATH:
				if (!requireMethod(req, res, ["GET", "HEAD"])) return;
				await handleState(res, host);
				return;
			case EVOLVE_PATH:
				if (!requireMethod(req, res, ["POST"])) return;
				await handleEvolve(res, host);
				return;
			case ROUNDS_PATH:
				if (!requireMethod(req, res, ["GET", "HEAD"])) return;
				handleRounds(res, host, parseLimit(url.searchParams.get("limit")));
				return;
			case BEAM_ROUNDS_PATH:
				if (!requireMethod(req, res, ["GET", "HEAD"])) return;
				handleBeamRounds(res, host, parseLimit(url.searchParams.get("limit")));
				return;
			default:
				sendJson(res, 404, {
					ok: false,
					error: "no such route",
					advertised: [...ROUTE_PATHS]
				});
				return;
		}
	} catch (error) {
		if (error instanceof HttpError) {
			sendJson(res, error.status, {
				ok: false,
				error: error.message,
				...error.detail
			});
			return;
		}
		sendJson(res, 500, {
			ok: false,
			error: "internal error",
			reason: describeError(error)
		});
	}
}
//#endregion
//#region src/host/workspace.ts
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
/** The live host whose routes the meta layer composes. The brief fixes this default. */
const DEFAULT_HOST_URL = "http://127.0.0.1:3083";
/** The package root, found by walking up to the manifest that names this package. */
let cachedPackageRoot = null;
/** Directory of the module that is RUNNING — `lib/` in the build, `src/host/` in a source run. */
function moduleDir() {
	try {
		return dirname(fileURLToPath(import.meta.url));
	} catch {
		return process.cwd();
	}
}
/** Walk up from the running module until a package.json names this package. */
function packageRoot() {
	if (cachedPackageRoot !== null) return cachedPackageRoot;
	let dir = moduleDir();
	for (let depth = 0; depth < 8; depth += 1) {
		const manifest = join(dir, "package.json");
		try {
			if (JSON.parse(readFileSync(manifest, "utf8")).name === "dsh-meta-evolve") {
				cachedPackageRoot = dir;
				return dir;
			}
		} catch {}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	cachedPackageRoot = moduleDir();
	return cachedPackageRoot;
}
/** True when `path` is an existing directory. */
function isDir(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
/** True when `path` looks like the program workspace: it owns `plan/` and `research/`. */
function looksLikeWorkspace(path) {
	return isDir(join(path, "plan")) && isDir(join(path, "research"));
}
/** An environment variable, trimmed, or null when absent/empty. */
function envString(name) {
	const value = process.env[name];
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}
/** Resolve a config/env path against `base` only when it is relative. */
function absoluteAgainst(path, base) {
	return isAbsolute(path) ? path : resolve(base, path);
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
function readConfig(raw) {
	const problems = [];
	const strings = {};
	for (const key of [
		"hostUrl",
		"workspace",
		"roundsFile",
		"pluginsRoot"
	]) {
		const value = raw[key];
		if (value === void 0) continue;
		if (typeof value !== "string" || value.trim() === "") {
			problems.push({
				key,
				value,
				reason: "expected a non-empty string"
			});
			continue;
		}
		strings[key] = value.trim();
	}
	let timeoutMs;
	const rawTimeout = raw.timeoutMs;
	if (rawTimeout !== void 0) {
		if (typeof rawTimeout === "number" && Number.isFinite(rawTimeout) && rawTimeout >= 100 && rawTimeout <= 6e4) timeoutMs = Math.round(rawTimeout);
		else problems.push({
			key: "timeoutMs",
			value: rawTimeout,
			reason: "expected a number in [100, 60000]"
		});
	}
	return {
		config: {
			...strings.hostUrl === void 0 ? {} : { hostUrl: strings.hostUrl },
			...strings.workspace === void 0 ? {} : { workspace: strings.workspace },
			...strings.roundsFile === void 0 ? {} : { roundsFile: strings.roundsFile },
			...strings.pluginsRoot === void 0 ? {} : { pluginsRoot: strings.pluginsRoot },
			...timeoutMs === void 0 ? {} : { timeoutMs }
		},
		problems
	};
}
/** The origin every live read uses, with its provenance. */
function resolveHostUrl(config) {
	const explicit = config.hostUrl ?? null;
	const fromEnv = envString("DSH_META_EVOLVE_HOST");
	const tried = [];
	if (explicit !== null) {
		tried.push({
			path: explicit,
			from: "config.hostUrl"
		});
		return {
			path: normalizeOrigin(explicit),
			from: "config.hostUrl",
			tried,
			reason: null
		};
	}
	if (fromEnv !== null) {
		tried.push({
			path: fromEnv,
			from: "env.DSH_META_EVOLVE_HOST"
		});
		return {
			path: normalizeOrigin(fromEnv),
			from: "env.DSH_META_EVOLVE_HOST",
			tried,
			reason: null
		};
	}
	tried.push({
		path: DEFAULT_HOST_URL,
		from: "default"
	});
	return {
		path: DEFAULT_HOST_URL,
		from: "default",
		tried,
		reason: null
	};
}
/** Trim trailing slashes so `origin + path` never doubles a separator. */
function normalizeOrigin(value) {
	return value.replace(/\/+$/, "");
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
function resolveWorkspace(config) {
	const tried = [];
	const explicit = config.workspace ?? envString("DSH_META_EVOLVE_WORKSPACE");
	const explicitFrom = config.workspace !== void 0 ? "config.workspace" : "env.DSH_META_EVOLVE_WORKSPACE";
	if (explicit !== null) {
		const path = absoluteAgainst(explicit, process.cwd());
		tried.push({
			path,
			from: explicitFrom
		});
		if (isDir(path)) return {
			path,
			from: explicitFrom,
			tried,
			reason: null
		};
		return {
			path: null,
			from: null,
			tried,
			reason: `${explicitFrom} names ${path}, which is not an existing directory`
		};
	}
	const root = packageRoot();
	const candidates = [{
		path: resolve(root, "..", "..", "profiles-tree", "personal-dev", "dsh-meta-evolve_INIT_WORKSPACE"),
		from: "package-root/../../profiles-tree/personal-dev/dsh-meta-evolve_INIT_WORKSPACE"
	}, {
		path: resolve(root, "..", ".."),
		from: "package-root/../.."
	}];
	let dir = process.cwd();
	for (let depth = 0; depth < 8; depth += 1) {
		candidates.push({
			path: dir,
			from: depth === 0 ? "process.cwd()" : `process.cwd()/.. x${depth}`
		});
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	for (const candidate of candidates) {
		tried.push(candidate);
		if (looksLikeWorkspace(candidate.path)) return {
			path: candidate.path,
			from: candidate.from,
			tried,
			reason: null
		};
	}
	return {
		path: null,
		from: null,
		tried,
		reason: `no directory owning plan/ and research/ was found among ${tried.length} candidates`
	};
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
function resolvePluginsRoot(config, workspace) {
	const tried = [];
	const explicit = config.pluginsRoot ?? envString("DSH_META_EVOLVE_PLUGINS_ROOT");
	const explicitFrom = config.pluginsRoot !== void 0 ? "config.pluginsRoot" : "env.DSH_META_EVOLVE_PLUGINS_ROOT";
	if (explicit !== null) {
		const path = absoluteAgainst(explicit, process.cwd());
		tried.push({
			path,
			from: explicitFrom
		});
		if (isDir(path)) return {
			path,
			from: explicitFrom,
			tried,
			reason: null
		};
		return {
			path: null,
			from: null,
			tried,
			reason: `${explicitFrom} names ${path}, which is not an existing directory`
		};
	}
	const candidates = [];
	if (workspace.path !== null) candidates.push({
		path: resolve(workspace.path, "..", "..", "..", "plugins-src"),
		from: "workspace/../../../plugins-src"
	});
	candidates.push({
		path: dirname(packageRoot()),
		from: "package-root/.."
	});
	if (workspace.path !== null) candidates.push({
		path: join(workspace.path, "plugins-src"),
		from: "workspace/plugins-src"
	});
	let dir = process.cwd();
	for (let depth = 0; depth < 8; depth += 1) {
		candidates.push({
			path: join(dir, "plugins-src"),
			from: depth === 0 ? "process.cwd()/plugins-src" : `process.cwd()/../../plugins-src`
		});
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	for (const candidate of candidates) {
		tried.push(candidate);
		if (isDir(candidate.path)) return {
			path: candidate.path,
			from: candidate.from,
			tried,
			reason: null
		};
	}
	return {
		path: null,
		from: null,
		tried,
		reason: `no existing plugins-src directory among ${tried.length} candidates`
	};
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
function resolveRoundsFile(config, workspace) {
	const tried = [];
	const explicit = config.roundsFile ?? envString("DSH_META_EVOLVE_ROUNDS");
	const explicitFrom = config.roundsFile !== void 0 ? "config.roundsFile" : "env.DSH_META_EVOLVE_ROUNDS";
	if (explicit !== null) {
		const path = absoluteAgainst(explicit, workspace.path ?? process.cwd());
		tried.push({
			path,
			from: explicitFrom
		});
		return {
			path,
			from: explicitFrom,
			tried,
			reason: null
		};
	}
	if (workspace.path === null) return {
		path: null,
		from: null,
		tried,
		reason: `the workspace did not resolve (${workspace.reason ?? "no reason recorded"}), so research/meta-evolve-rounds.jsonl has no home`
	};
	const path = join(workspace.path, "research", "meta-evolve-rounds.jsonl");
	tried.push({
		path,
		from: "workspace/research/meta-evolve-rounds.jsonl"
	});
	return {
		path,
		from: "workspace/research/meta-evolve-rounds.jsonl",
		tried,
		reason: null
	};
}
/**
* Resolve everything a route needs, once per apply.
*
* @param rawConfig - the row's config before interpretation.
* @returns the resolved host, including every path's provenance and config problems.
*/
function resolveHost(rawConfig) {
	const { config, problems } = readConfig(rawConfig);
	const hostUrl = resolveHostUrl(config);
	const workspace = resolveWorkspace(config);
	const pluginsRoot = resolvePluginsRoot(config, workspace);
	const roundsFile = resolveRoundsFile(config, workspace);
	const timeoutMs = config.timeoutMs ?? 5e3;
	return {
		hostUrl: hostUrl.path ?? "http://127.0.0.1:3083",
		hostFrom: hostUrl.from ?? "default",
		timeoutMs,
		workspace,
		pluginsRoot,
		roundsFile,
		problems
	};
}
//#endregion
//#region src/index.ts
/**
* Loader row name.
*
* The bundle patch's row is `id: meta-evolve` / `name: 'dsh-meta-evolve'`, and
* this export is the PACKAGE name, following `dsh-plan-rag` and the sibling meta
* packages rather than the row id — Cordis reads a namespace plugin's `name` for
* runtime diagnostics only (`vendor/cordis/src/registry.ts:324`); the row `id` is
* the composition's identity and the two are not required to match.
*/
const name = "dsh-meta-evolve";
/** The one service this plugin cannot work without. */
const inject = ["webServer"];
/**
* Wire the meta layer's three routes.
*
* @param ctx - plugin context carrying the web server and logger.
* @param rawConfig - the row's config, before any interpretation.
*/
function apply(ctx, rawConfig = {}) {
	const host = resolveHost(rawConfig);
	for (const problem of host.problems) ctx.logger.warn("dsh-meta-evolve: ignoring unusable config %s=%o: %s", problem.key, problem.value, problem.reason);
	ctx.logger.info("dsh-meta-evolve: applying; routes=%j; host=%s; workspace=%s; pluginsRoot=%s; roundsFile=%s", [...ROUTE_PATHS], host.hostUrl, host.workspace.path ?? `UNRESOLVED (${host.workspace.reason ?? "no reason recorded"})`, host.pluginsRoot.path ?? `UNRESOLVED (${host.pluginsRoot.reason ?? "no reason recorded"})`, host.roundsFile.path ?? `UNRESOLVED (${host.roundsFile.reason ?? "no reason recorded"})`);
	ctx.effect(() => {
		const disposers = ROUTE_PATHS.map((path) => ctx.webServer.register({
			kind: "exact",
			path,
			handler: (req, res) => {
				handle(req, res, host).catch((error) => {
					try {
						const text = JSON.stringify({
							ok: false,
							error: "internal error",
							reason: String(error)
						});
						res.writeHead(500, {
							"Content-Type": "application/json; charset=utf-8",
							"Cache-Control": "no-store"
						});
						res.end(text);
					} catch {}
				});
			}
		}));
		return () => {
			for (const dispose of disposers.reverse()) dispose();
		};
	}, "dsh-meta-evolve: state, evolve and rounds routes");
}
//#endregion
export { BEAM_FIELD_NAMES, BEAM_IDENTITY_NAMES, BEAM_ROUNDS_PATH, BEAM_STATUS_PATH, CONTROL_URL_ENV, DEFAULT_CONTROL_PORT, EVOLVE_PATH, FLEET_STATUS_PATH, ROUNDS_PATH, ROUTE_PATHS, STATE_PATH, apply, captureBeam, computeBeamDelta, inject, name, resolveControlUrl };
