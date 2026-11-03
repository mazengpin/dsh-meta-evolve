window.__ModuleLoader__.load({
	id: "dsh-meta-evolve",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/locales.ts
		/**
		* This plugin's Client dictionaries (en + zh).
		*
		* Both languages are registered with the SAME key set, and the render harness
		* asserts that: a key present in one language and absent in the other renders as
		* the raw key, which is how a half-translated panel ships without anyone seeing
		* it in a diff.
		*
		* THE HONESTY TOKENS ARE DELIBERATELY NOT HERE. `NOT MEASURED`, `NOTHING
		* RECORDED` and `NOT MOUNTED` are diagnostics rather than prose, so they live as
		* literals in the renderer: a translated diagnostic is one a reviewer cannot grep
		* for, and the harness asserts those exact strings in the built bundle so none
		* can be deleted silently. A heading is allowed to be translated; a verdict
		* token is not.
		*
		* @module dsh-meta-evolve/client/locales
		*/
		/** The namespace every dictionary here is registered under. */
		const LOCALE_NS = "meta-evolve";
		/** English dictionary. */
		const en = {
			row: "Evolve",
			title: "Meta-evolve state",
			subtitle: "The meta layer's composed live state and its recorded evolution rounds, read from its own routes — no logs required.",
			fetchedAtLabel: "Read at",
			hostLabel: "Host",
			countsReadLabel: "Counts read",
			unreadableLabel: "Unreadable sources",
			notDoneLabel: "What this route does not do",
			decisionsHeading: "Decision log",
			totalLabel: "Decisions total",
			activeLabel: "Active",
			supersededLabel: "Superseded",
			sumsLabel: "Sums to total",
			eventsLabel: "Events",
			malformedLinesLabel: "Malformed lines",
			censusAtLabel: "Census at",
			readAtLabel: "Read at",
			intentHeading: "Intent field",
			rowsLabel: "Rows",
			byValueLabel: "Rows by value",
			rowsWithoutValueLabel: "Rows without a value",
			duplicateRowsLabel: "Duplicate row ids",
			modeLabel: "Mode",
			generatedAtLabel: "Generated at",
			documentsLabel: "Documents",
			declaredRowsLabel: "Declared rows",
			rowsMatchLabel: "Rows match declared",
			pluginsHeading: "Plugins named",
			pluginsCountLabel: "dsh-meta-* directories",
			pluginsNamesLabel: "Names",
			rootLabel: "Root",
			gateHeading: "LVL1 gate",
			hookedLabel: "Hooked",
			hookedAgreesLabel: "Status and sessions agree",
			runsLabel: "Runs",
			sessionsLabel: "Sessions",
			outcomesLabel: "Outcomes",
			lastHeading: "Last decision",
			outcomeLabel: "Outcome",
			reasonLabel: "Reason",
			channelLabel: "Channel",
			atLabel: "At",
			revisionsLabel: "Revisions",
			mapHeading: "Intent map",
			zonesLabel: "Zones",
			modelLabel: "Model",
			dimLabel: "Dimensions",
			freshnessLabel: "Freshness",
			corpusLabel: "Corpus plugins",
			catalogLabel: "Catalog",
			roundsHeading: "Evolution rounds",
			roundsCountLabel: "Rounds stored",
			roundsStateLabel: "Record",
			linesLabel: "File lines",
			bytesLabel: "File bytes",
			existsLabel: "File exists",
			malformedCountLabel: "Malformed lines",
			deltaLabel: "Delta",
			movedLabel: "Counts moved",
			identityLabel: "Identity",
			appearedLabel: "Appeared",
			disappearedLabel: "Disappeared",
			changedLabel: "Changed intent rows",
			unavailableLabel: "Unavailable comparisons",
			roundLabel: "Round",
			evolveHeading: "Run a round",
			evolveHint: "Evolve recomputes the state and records a NEW round as the delta against the last one. It changes the recorded history; it does not re-read it.",
			evolveButton: "Evolve",
			refreshButton: "Refresh",
			noRoundYet: "no round recorded yet",
			firstRound: "first round — no previous round to compare",
			agree: "agree",
			disagree: "MISMATCH",
			verified: "the recorded line was re-read and matched",
			notVerified: "NOT VERIFIED",
			reading: "Reading the meta-evolve routes…",
			idle: "no round run from this panel yet",
			running: "RECORDING",
			failed: "EVOLVE FAILED",
			recorded: "RECORDED",
			valueWord: "value(s)",
			countWord: "count(s)",
			roundWord: "round(s)"
		};
		/** Chinese dictionary; the key set MUST equal {@link en}'s. */
		const zh = {
			row: "演化",
			title: "元演化状态",
			subtitle: "从插件自身的路由读取元层的实时状态与已记录的演化轮次，无需查看日志。",
			fetchedAtLabel: "读取时间",
			hostLabel: "主机",
			countsReadLabel: "已读取计数",
			unreadableLabel: "不可读来源",
			notDoneLabel: "此路由不做什么",
			decisionsHeading: "决策日志",
			totalLabel: "决策总数",
			activeLabel: "生效中",
			supersededLabel: "已被取代",
			sumsLabel: "合计等于总数",
			eventsLabel: "事件数",
			malformedLinesLabel: "畸形行",
			censusAtLabel: "普查时间",
			readAtLabel: "读取时间",
			intentHeading: "意图场",
			rowsLabel: "行数",
			byValueLabel: "按值统计的行",
			rowsWithoutValueLabel: "无值的行",
			duplicateRowsLabel: "重复行 id",
			modeLabel: "模式",
			generatedAtLabel: "生成时间",
			documentsLabel: "文档数",
			declaredRowsLabel: "声明行数",
			rowsMatchLabel: "行数与声明一致",
			pluginsHeading: "已命名插件",
			pluginsCountLabel: "dsh-meta-* 目录",
			pluginsNamesLabel: "名称",
			rootLabel: "根目录",
			gateHeading: "LVL1 门控",
			hookedLabel: "已挂钩",
			hookedAgreesLabel: "状态与会话一致",
			runsLabel: "运行次数",
			sessionsLabel: "会话数",
			outcomesLabel: "结果分布",
			lastHeading: "最近一次决策",
			outcomeLabel: "结果",
			reasonLabel: "原因",
			channelLabel: "通道",
			atLabel: "时间",
			revisionsLabel: "修订",
			mapHeading: "意图地图",
			zonesLabel: "区域",
			modelLabel: "模型",
			dimLabel: "维度",
			freshnessLabel: "新鲜度",
			corpusLabel: "语料插件",
			catalogLabel: "目录",
			roundsHeading: "演化轮次",
			roundsCountLabel: "已存轮次",
			roundsStateLabel: "记录",
			linesLabel: "文件行数",
			bytesLabel: "文件字节",
			existsLabel: "文件存在",
			malformedCountLabel: "畸形行",
			deltaLabel: "增量",
			movedLabel: "变动的计数",
			identityLabel: "身份",
			appearedLabel: "新增",
			disappearedLabel: "消失",
			changedLabel: "值变化的意图行",
			unavailableLabel: "无法比较的项",
			roundLabel: "轮次",
			evolveHeading: "运行一轮",
			evolveHint: "Evolve 会重新计算状态，并把相对上一轮的新轮次记录为增量。它改变已记录的历史，而不是回读。",
			evolveButton: "演化",
			refreshButton: "刷新",
			noRoundYet: "尚无轮次记录",
			firstRound: "首轮——没有可比较的上一轮",
			agree: "一致",
			disagree: "不一致",
			verified: "已重新读取记录行并匹配",
			notVerified: "未验证",
			reading: "正在读取元演化路由…",
			idle: "此面板尚未运行任何一轮",
			running: "记录中",
			failed: "演化失败",
			recorded: "已记录",
			valueWord: "个值",
			countWord: "个计数",
			roundWord: "轮"
		};
		//#endregion
		//#region src/client/view.ts
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
		/**
		* Construct a field that WAS read.
		* @param value - the normalized reading.
		* @returns the field view.
		*/
		function presentField(value) {
			return {
				read: value,
				reason: null
			};
		}
		/**
		* Construct a field that was NOT read.
		* @param reason - why it is absent, as the host reported it.
		* @returns the field view.
		*/
		function absentField(reason) {
			return {
				read: null,
				reason
			};
		}
		/** The idle evolve slice: nothing has been run from this panel yet. */
		const IDLE_EVOLVE = {
			state: "idle",
			note: null,
			round: null,
			before: null,
			change: null,
			verification: null
		};
		/** The token an unread value renders. A literal, so it is greppable in the bundle. */
		function fmt(value) {
			if (value === null || value === void 0) return "NOT MEASURED";
			return String(value);
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
		function ratio(value, of) {
			if (value === null) return "NOT MEASURED";
			if (of === null) return `${value} of NOT MEASURED`;
			return `${value} of ${of}`;
		}
		/**
		* The rounds store's own state, as a diagnostic token.
		*
		* `NOT MEASURED` and `NOTHING RECORDED` are DIFFERENT statements and this
		* function is the one place that chooses between them: unread is not empty.
		* @param rounds - the rounds slice.
		* @returns the token the panel renders.
		*/
		function roundsLabel(rounds) {
			if (rounds.state !== "loaded" || rounds.count === null || rounds.total === null) return "NOT MEASURED";
			if (rounds.total === 0) return "NOTHING RECORDED";
			return "ROUNDS RECORDED";
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
		function evolveTone(evolve) {
			const linesDelta = evolve.change === null ? null : evolve.change.linesDelta;
			const grew = linesDelta !== null && linesDelta > 0;
			if (evolve.state === "done" && evolve.verification?.verified === true && grew) return "ok";
			if (evolve.state === "failed" || evolve.state === "done") return "warn";
			return "unknown";
		}
		/**
		* The evolve badge's text — the ONE place its token is chosen.
		* @param evolve - the evolve slice.
		* @returns the badge text.
		*/
		function evolveLabel(evolve, t) {
			if (evolve.state === "idle") return t("idle");
			if (evolve.state === "running") return t("running");
			if (evolve.state === "failed") return t("failed");
			return t("recorded");
		}
		/** One label/value line in a section. */
		function line(label, value, testId) {
			return (0, react.createElement)("div", {
				key: `${label}:${testId ?? ""}`,
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "baseline",
					padding: "2px 0"
				},
				...testId === void 0 ? {} : { "data-testid": testId }
			}, (0, react.createElement)("span", { style: {
				minWidth: "168px",
				color: "var(--dsh-text-2, #8b949e)",
				fontSize: "12px"
			} }, label), (0, react.createElement)("span", { style: {
				fontFamily: "ui-monospace, monospace",
				fontSize: "12px",
				overflowWrap: "anywhere"
			} }, value));
		}
		/** A titled section with a stable `data-testid`. */
		function section(testId, title, children) {
			return (0, react.createElement)("section", {
				key: testId,
				"data-testid": testId,
				style: {
					border: "1px solid var(--dsh-border, #30363d)",
					borderRadius: "8px",
					padding: "10px 12px",
					marginBottom: "10px"
				}
			}, (0, react.createElement)("h3", { style: {
				margin: "0 0 6px",
				fontSize: "13px"
			} }, title), ...children.filter((child) => child !== null));
		}
		/** A line naming why a field could not be read. */
		function reasonLine(reason, testId) {
			return line("reason", reason === null ? "the host recorded no reason" : reason, testId);
		}
		/** The decision-log section. */
		function decisionsSection(field, t) {
			const value = field.read;
			if (value === null) return section("decisions", t("decisionsHeading"), [
				line(t("totalLabel"), "NOT MEASURED", "decisions-total"),
				line(t("activeLabel"), "NOT MEASURED", "decisions-active"),
				line(t("supersededLabel"), "NOT MEASURED", "decisions-superseded"),
				reasonLine(field.reason, "decisions-reason")
			]);
			return section("decisions", t("decisionsHeading"), [
				line(t("totalLabel"), ratio(value.total, value.of), "decisions-total"),
				line(t("activeLabel"), ratio(value.active, value.of), "decisions-active"),
				line(t("supersededLabel"), ratio(value.superseded, value.of), "decisions-superseded"),
				line(t("sumsLabel"), fmt(value.sumsToTotal), "decisions-sums"),
				line(t("eventsLabel"), fmt(value.events), "decisions-events"),
				line(t("malformedLinesLabel"), fmt(value.malformedLines), "decisions-malformed"),
				line(t("censusAtLabel"), fmt(value.censusAt), "decisions-census-at"),
				line(t("readAtLabel"), fmt(value.readAt), "decisions-read-at")
			]);
		}
		/** The intent-field section, with the by-value buckets rendered as pairs. */
		function intentSection(field, t) {
			const value = field.read;
			if (value === null) return section("intent", t("intentHeading"), [
				line(t("rowsLabel"), "NOT MEASURED", "intent-rows"),
				line(t("byValueLabel"), "NOT MEASURED", "intent-byvalue"),
				reasonLine(field.reason, "intent-reason")
			]);
			const buckets = value.byValue === null ? "NOT MEASURED" : value.byValue.length === 0 ? `0 ${t("valueWord")} of ${fmt(value.byValueOf)}` : value.byValue.map((bucket) => `${bucket.value} ${fmt(bucket.count)}`).join(" · ") + ` (of ${fmt(value.byValueOf)})`;
			return section("intent", t("intentHeading"), [
				line(t("rowsLabel"), ratio(value.rows, value.of), "intent-rows"),
				line(t("byValueLabel"), buckets, "intent-byvalue"),
				line(t("rowsWithoutValueLabel"), fmt(value.rowsWithoutValue), "intent-rows-without-value"),
				line(t("duplicateRowsLabel"), fmt(value.duplicateRowIds), "intent-duplicates"),
				line(t("modeLabel"), fmt(value.mode), "intent-mode"),
				line(t("documentsLabel"), fmt(value.documents), "intent-documents"),
				line(t("declaredRowsLabel"), fmt(value.declaredRows), "intent-declared"),
				line(t("rowsMatchLabel"), fmt(value.rowsMatchDeclared), "intent-rows-match"),
				line(t("generatedAtLabel"), fmt(value.generatedAt), "intent-generated-at"),
				line(t("readAtLabel"), fmt(value.readAt), "intent-read-at")
			]);
		}
		/** The plugins section: the names the census found, with their denominator. */
		function pluginsSection(field, t) {
			const value = field.read;
			if (value === null) return section("plugins", t("pluginsHeading"), [
				line(t("pluginsCountLabel"), "NOT MEASURED", "plugins-count"),
				line(t("pluginsNamesLabel"), "NOT MEASURED", "plugins-names"),
				reasonLine(field.reason, "plugins-reason")
			]);
			const names = value.names === null ? "NOT MEASURED" : value.names.length === 0 ? "0 name(s) of a tree that WAS read" : value.names.join(", ");
			return section("plugins", t("pluginsHeading"), [
				line(t("pluginsCountLabel"), ratio(value.count, value.of), "plugins-count"),
				line(t("pluginsNamesLabel"), names, "plugins-names"),
				line(t("rootLabel"), fmt(value.root), "plugins-root"),
				line(t("readAtLabel"), fmt(value.readAt), "plugins-read-at")
			]);
		}
		/** The LVL1 gate section: hook state, counters, outcome distribution, last decision. */
		function gateSection(field, t) {
			const value = field.read;
			if (value === null) return section("gate", t("gateHeading"), [
				line(t("hookedLabel"), "NOT MEASURED", "gate-hooked"),
				line(t("runsLabel"), "NOT MEASURED", "gate-runs"),
				line(t("sessionsLabel"), "NOT MEASURED", "gate-sessions"),
				line(t("outcomesLabel"), "NOT MEASURED", "gate-outcomes"),
				reasonLine(field.reason, "gate-reason")
			]);
			const agreement = value.hookedAgrees === null ? "NOT MEASURED" : value.hookedAgrees ? t("agree") : t("disagree");
			const outcomes = value.outcomes === null ? "NOT MEASURED" : `decided ${fmt(value.outcomes.decided)} · declined ${fmt(value.outcomes.declined)} · neverRan ${fmt(value.outcomes.neverRan)} (of ${fmt(value.outcomesOf)})`;
			const rows = [
				line(t("hookedLabel"), fmt(value.hooked), "gate-hooked"),
				line(t("hookedAgreesLabel"), agreement, "gate-hooked-agrees"),
				line(t("runsLabel"), fmt(value.runs), "gate-runs"),
				line(t("sessionsLabel"), fmt(value.sessions), "gate-sessions"),
				line(t("outcomesLabel"), outcomes, "gate-outcomes")
			];
			if (value.last === null) rows.push(line(t("lastHeading"), t("noRoundYet"), "gate-last"));
			else {
				rows.push(line(t("outcomeLabel"), fmt(value.last.outcome), "gate-last-outcome"));
				rows.push(line(t("reasonLabel"), fmt(value.last.reason), "gate-last-reason"));
				rows.push(line(t("channelLabel"), fmt(value.last.channel), "gate-last-channel"));
				rows.push(line(t("atLabel"), fmt(value.last.at), "gate-last-at"));
			}
			rows.push(line(t("revisionsLabel"), value.revisions === null ? "NOT MEASURED" : value.revisions.join(", "), "gate-revisions"));
			rows.push(line(t("readAtLabel"), fmt(value.readAt), "gate-read-at"));
			return section("gate", t("gateHeading"), rows);
		}
		/** The intent-map section. */
		function mapSection(field, t) {
			const value = field.read;
			if (value === null) return section("map", t("mapHeading"), [
				line(t("zonesLabel"), "NOT MEASURED", "map-zones"),
				line(t("modelLabel"), "NOT MEASURED", "map-model"),
				line(t("dimLabel"), "NOT MEASURED", "map-dim"),
				reasonLine(field.reason, "map-reason")
			]);
			return section("map", t("mapHeading"), [
				line(t("zonesLabel"), ratio(value.zones, value.of), "map-zones"),
				line(t("modelLabel"), fmt(value.model), "map-model"),
				line(t("dimLabel"), fmt(value.dim), "map-dim"),
				line(t("freshnessLabel"), fmt(value.freshness), "map-freshness"),
				line(t("corpusLabel"), ratio(value.corpusPlugins, value.corpusOf), "map-corpus"),
				line(t("catalogLabel"), fmt(value.catalogCount), "map-catalog"),
				line(t("readAtLabel"), fmt(value.readAt), "map-read-at")
			]);
		}
		/** One id set as text, distinguishing unread (`null`) from empty (`[]`). */
		function setText(set, key) {
			if (set === null) return "NOT MEASURED";
			const values = set[key];
			if (values === null) return "NOT MEASURED";
			if (values.length === 0) return "0";
			return values.join(", ");
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
		function identityText(delta) {
			if (delta.values === null) return "NOT MEASURED";
			if (delta.values.length === 0) return "0";
			return delta.values.map((entry) => {
				if (entry.changed === null) return `${entry.key}: UNKNOWN (${entry.reason ?? "not measured"})`;
				if (entry.from === null || entry.to === null) return `${entry.key}: UNKNOWN (one side was not measured)`;
				return entry.changed ? `${entry.key}: ${entry.from}→${entry.to} (CHANGED)` : `${entry.key}: ${entry.to} (unchanged)`;
			}).join(" · ");
		}
		/** The delta of one round, as lines. */
		function deltaRows(delta, prefix, t) {
			const rows = [];
			const moved = delta.moved === null ? "NOT MEASURED" : delta.moved.length === 0 ? `0 ${t("countWord")} moved of ${fmt(delta.movedOf?.checked)}` : `${delta.moved.length} of ${fmt(delta.movedOf?.checked)} ${t("countWord")} moved — ` + delta.moved.map((entry) => `${entry.key} ${fmt(entry.from)}→${fmt(entry.to)} (${entry.delta === null ? "NOT MEASURED" : entry.delta > 0 ? `+${entry.delta}` : String(entry.delta)})`).join(" · ");
			rows.push(line(t("movedLabel"), moved, `${prefix}-moved`));
			rows.push(line(t("identityLabel"), identityText(delta), `${prefix}-identity`));
			if (delta.against !== null) rows.push(line(t("deltaLabel"), `against round ${delta.against} at ${fmt(delta.againstAt)}`, `${prefix}-against`));
			if (delta.unavailable !== null && delta.unavailable.length > 0) rows.push(line(t("unavailableLabel"), delta.unavailable.map((entry) => `${entry.key}: ${entry.reason}`).join("; "), `${prefix}-unavailable`));
			rows.push(line(t("appearedLabel"), `decisions: ${setText(delta.appeared, "decisions")}; plugins: ${setText(delta.appeared, "plugins")}; intent rows: ${setText(delta.appeared, "intentRows")}`, `${prefix}-appeared`));
			rows.push(line(t("disappearedLabel"), `decisions: ${setText(delta.disappeared, "decisions")}; plugins: ${setText(delta.disappeared, "plugins")}; intent rows: ${setText(delta.disappeared, "intentRows")}`, `${prefix}-disappeared`));
			const changed = delta.changed === null ? "NOT MEASURED" : delta.changed.length === 0 ? "0" : delta.changed.map((entry) => `${entry.id}: ${entry.from}→${entry.to}`).join(" · ");
			rows.push(line(t("changedLabel"), changed, `${prefix}-changed`));
			return rows;
		}
		/**
		* One round as a section.
		* @param round - the round.
		* @param prefix - the `data-testid` prefix, so the list and the control's round do not collide.
		* @param t - translator.
		* @returns the section.
		*/
		function roundSection(round, prefix, t) {
			const id = `${prefix}-${round.n ?? "unknown"}`;
			const rows = [
				line(t("atLabel"), fmt(round.at), `${id}-at`),
				line(t("modelLabel"), fmt(round.model), `${id}-model`),
				line(t("countsReadLabel"), round.countsRead === null ? "NOT MEASURED" : ratio(round.countsRead.read, round.countsRead.of), `${id}-counts-read`)
			];
			if (round.delta === null) rows.push(line(t("deltaLabel"), round.deltaReason === null ? t("firstRound") : round.deltaReason, `${id}-delta`));
			else rows.push(...deltaRows(round.delta, id, t));
			if (round.unreadable !== null && round.unreadable.length > 0) rows.push(line(t("unreadableLabel"), round.unreadable.map((entry) => `${entry.field}: ${entry.reason}`).join("; "), `${id}-unreadable`));
			return section(id, `${t("roundLabel")} ${fmt(round.n)}`, rows);
		}
		/** The rounds section: the file's census, the store state, and the recorded rounds. */
		function roundsSection(rounds, t) {
			const label = roundsLabel(rounds);
			const rows = [
				line(t("roundsStateLabel"), label, "rounds-state"),
				line(t("roundsCountLabel"), ratio(rounds.count, rounds.total), "rounds-count"),
				line(t("linesLabel"), fmt(rounds.lines), "rounds-lines"),
				line(t("bytesLabel"), fmt(rounds.bytes), "rounds-bytes"),
				line(t("existsLabel"), fmt(rounds.exists), "rounds-exists"),
				line(t("malformedCountLabel"), fmt(rounds.malformedLines), "rounds-malformed")
			];
			if (rounds.state !== "loaded") rows.push(reasonLine(rounds.note, "rounds-reason"));
			if (rounds.rounds === null) rows.push(line(t("roundsHeading"), "NOT MEASURED", "rounds-rows"));
			else if (rounds.rounds.length === 0) rows.push(line(t("roundsHeading"), "NOTHING RECORDED", "rounds-empty"));
			else for (const round of rounds.rounds.slice(0, 5)) rows.push(roundSection(round, "round", t));
			return section("rounds", t("roundsHeading"), rows);
		}
		/** The evolve control's section: what the click produced, rendered rather than acknowledged. */
		function evolveSection(evolve, t) {
			const tone = evolveTone(evolve);
			const badge = (0, react.createElement)("span", {
				"data-testid": "evolve-tone",
				"data-tone": tone,
				style: {
					display: "inline-block",
					padding: "2px 8px",
					borderRadius: "999px",
					fontSize: "11px",
					fontWeight: 600,
					letterSpacing: "0.04em",
					border: "1px solid",
					...tone === "ok" ? {
						color: "#1a7f37",
						borderColor: "#1a7f37",
						background: "rgba(26,127,55,0.10)"
					} : tone === "warn" ? {
						color: "#9a6700",
						borderColor: "#9a6700",
						background: "rgba(154,103,0,0.10)"
					} : {
						color: "var(--dsh-text-2, #8b949e)",
						borderColor: "var(--dsh-border, #30363d)",
						background: "transparent"
					}
				}
			}, evolveLabel(evolve, t));
			const rows = [(0, react.createElement)("div", {
				key: "badge",
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					padding: "2px 0"
				}
			}, badge), line(t("evolveHeading"), evolve.state === "done" ? t("recorded") : evolve.state === "failed" ? t("failed") : evolve.state === "running" ? t("running") : t("idle"), "evolve-state")];
			if (evolve.state === "done" && evolve.round !== null) {
				rows.push(line(t("roundLabel"), `n=${fmt(evolve.round.n)} at ${fmt(evolve.round.at)}`, "evolve-round"));
				if (evolve.change !== null) {
					const linesDelta = evolve.change.linesDelta;
					rows.push(line(t("linesLabel"), `${fmt(evolve.before?.lines)} → ${linesDelta === null ? "NOT MEASURED" : `${linesDelta > 0 ? "+" : ""}${linesDelta}`}`, "evolve-change"));
					rows.push(line(t("roundsCountLabel"), `${fmt(evolve.before?.rounds)} → ${evolve.change.roundsDelta === null ? "NOT MEASURED" : `${evolve.change.roundsDelta > 0 ? "+" : ""}${evolve.change.roundsDelta}`}`, "evolve-change-rounds"));
				}
				if (evolve.verification !== null) rows.push(line("verification", evolve.verification.verified === true ? t("verified") : `${t("notVerified")} — ${evolve.verification.reason ?? "the route gave no reason"}`, "evolve-verify"));
				rows.push(roundSection(evolve.round, "evolve-round", t));
			} else if (evolve.state === "failed") rows.push(reasonLine(evolve.note, "evolve-note"));
			return section("evolve", t("evolveHeading"), rows);
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
			display: "flex",
			flexDirection: "column",
			height: "100%",
			minHeight: 0,
			overflow: "hidden",
			boxSizing: "border-box",
			padding: "12px",
			fontSize: "13px",
			lineHeight: 1.5
		};
		/** The fixed header strip: its natural height, never flexed, outside the scroller. */
		const HEADER_STYLE = { flex: "0 0 auto" };
		/** The single scroll box; `minHeight: 0` lets a flex item shrink below its content. */
		const SCROLL_BODY_STYLE = {
			flex: "1 1 auto",
			minHeight: 0,
			overflowY: "auto",
			overflowX: "hidden",
			boxSizing: "border-box",
			paddingRight: "6px"
		};
		/**
		* The panel's fixed header.
		* @param state - the state slice, or `null` for the loading first paint.
		* @param t - translator.
		* @param controls - an already-built control element the page passes in, or null.
		* @returns the header element.
		*/
		function panelHeader(state, t, controls) {
			const rows = [];
			if (state !== null) {
				rows.push(line(t("fetchedAtLabel"), fmt(state.at), "fetched-at"));
				rows.push(line(t("hostLabel"), fmt(state.host), "panel-host"));
				rows.push(line(t("countsReadLabel"), state.countsRead === null ? "NOT MEASURED" : ratio(state.countsRead.read, state.countsRead.of), "counts-read"));
			}
			return (0, react.createElement)("div", {
				"data-testid": "meta-evolve-header",
				style: HEADER_STYLE
			}, (0, react.createElement)("h2", {
				key: "title",
				style: {
					margin: "0 0 2px",
					fontSize: "15px"
				}
			}, t("title")), (0, react.createElement)("p", {
				key: "subtitle",
				style: {
					margin: "0 0 10px",
					color: "var(--dsh-text-2, #8b949e)",
					fontSize: "12px"
				}
			}, t("subtitle")), ...rows, controls);
		}
		/**
		* One panel frame: the fixed header, then the ONE scrolling body.
		* @param t - translator.
		* @param state - the state slice, or `null` for the loading first paint.
		* @param controls - the page's control element, positioned in the header.
		* @param bodyChildren - the body's content.
		* @returns the frame element.
		*/
		function panelFrame(t, state, controls, bodyChildren) {
			return (0, react.createElement)("div", {
				"data-testid": "meta-evolve-panel",
				"data-dsh-panel": "meta-evolve",
				style: FRAME_STYLE
			}, panelHeader(state, t, controls), (0, react.createElement)("div", {
				"data-testid": "meta-evolve-scroll",
				style: SCROLL_BODY_STYLE
			}, ...bodyChildren.filter((child) => child !== null)));
		}
		/**
		* Render the whole panel from a view. PURE: no fetch, no hooks, no state.
		* @param view - one complete read plus the control's slice.
		* @param t - translator.
		* @param controls - an element the page builds (Evolve / Refresh); the renderer
		*   only positions it in the fixed header. Defaults to none, for the harness.
		* @returns the panel element.
		*/
		function renderPanel(view, t, controls = null) {
			const state = view.state;
			const body = [];
			if (state.state !== "loaded") body.push(reasonLine(state.note, "state-reason"));
			if (state.unreadable !== null && state.unreadable.length > 0) body.push(line(t("unreadableLabel"), state.unreadable.map((entry) => `${entry.field}: ${entry.reason}`).join("; "), "unreadable"));
			body.push(decisionsSection(state.decisionLog, t), intentSection(state.intentField, t), pluginsSection(state.plugins, t), gateSection(state.lvl1Gate, t), mapSection(state.intentMap, t), roundsSection(view.rounds, t), evolveSection(view.evolve, t));
			if (state.notDone !== null) body.push((0, react.createElement)("div", {
				key: "notdone",
				"data-testid": "not-done",
				style: {
					marginTop: "8px",
					fontSize: "11px",
					color: "var(--dsh-text-2, #8b949e)"
				}
			}, (0, react.createElement)("h4", { style: {
				margin: "0 0 4px",
				fontSize: "11px"
			} }, t("notDoneLabel")), ...state.notDone.map((entry, index) => (0, react.createElement)("p", {
				key: String(index),
				style: { margin: "0 0 2px" }
			}, entry))));
			return panelFrame(t, state, controls, body);
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
		function renderLoadingPanel(t, controls = null) {
			return panelFrame(t, null, controls, [(0, react.createElement)("p", { key: "loading" }, t("reading"))]);
		}
		//#endregion
		//#region src/client/api.ts
		/**
		* The meta-evolve panel's transport — written against the HOST HALF'S REAL ROUTES.
		*
		* The contract in this file was read from `src/host/routes.ts` and
		* `src/host/sources.ts` in this same package, not guessed: the state payload's
		* five nullable fields (with `unreadable` naming why each is null), the rounds
		* payload's `count`/`total`/`lines`/`rounds` census, and the evolve response's
		* `round` plus `before`/`change`/`verification` are the host's own names. A
		* client that normalized a shape the host does not serve would render
		* `NOT MEASURED` everywhere and look like a broken panel.
		*
		* THE FOUR THINGS THIS FILE MUST NOT COLLAPSE:
		*
		*  1. **A 404 IS NOT AN EMPTY STORE.** `/meta-evolve/api/rounds` answering 404
		*     means the route is absent; it must render as unread (`NOT MEASURED`), never
		*     as `count: 0` (`NOTHING RECORDED`). The host is explicit that the two are
		*     different statements, and the normalization keeps them apart.
		*  2. **503 IS NOT A FAILED READ OF THE STATE.** The rounds route answers 503
		*     when the rounds file has no resolved path — the route IS there and is
		*     telling us it has nowhere to read. That is `refused`, carrying the reason,
		*     not `unreachable`.
		*  3. **`null` IS PRESERVED THROUGH EVERY NORMALIZER.** Numeric fields are read
		*     with `num()` (a non-number is `null`, never `0`), booleans with `bool()`,
		*     and an absent field is `null` WITH the host's reason. Nothing here uses
		*     `|| 0`, `?? 0` or a truthy test in place of presence.
		*  4. **THE CONTROL'S RESPONSE IS NORMALIZED INTO THE VIEW.** `evolve()` returns
		*     an `EvolveView` carrying the created round, the file's before/after line
		*     counts and the host's own re-read verification — the things the panel must
		*     SHOW, because a control that only reads a value back is not a control.
		*
		* TWO CONVENTIONS COPIED DELIBERATELY from the sibling `dsh-lvl1-gate`: the URL is
		* resolved against the PAGE BASE with query and hash dropped (so the panel works
		* under a reverse-proxy prefix and can never carry a launch token into a plugin
		* route), and every read is `cache: 'no-store'` — a cached state is a lie about
		* the present.
		*
		* @module dsh-meta-evolve/client/api
		*/
		/** Placeholder origin for the non-DOM case (specs, SSR): resolution needs an absolute base. */
		const PLACEHOLDER_ORIGIN = "http://dsh.invalid/";
		/**
		* The page base, read STRUCTURALLY.
		*
		* `tsconfig.json` declares `lib: ["ES2023"]` and no DOM types, so the base is
		* reached through `globalThis` with its shape declared at the point of use. A
		* non-DOM caller (the render harness) falls back to the placeholder origin rather
		* than throwing.
		* @returns the absolute base URL to resolve routes against.
		*/
		function pageBase() {
			const href = globalThis.location?.href;
			return typeof href === "string" ? href : PLACEHOLDER_ORIGIN;
		}
		/** The three routes this panel reads, plus the one control it drives. */
		const ROUTES = {
			state: "/meta-evolve/api/state",
			rounds: "/meta-evolve/api/rounds",
			evolve: "/meta-evolve/api/evolve"
		};
		/** A typed failure from this plugin's route. */
		var MetaEvolveError = class extends Error {
			failure;
			constructor(failure, message) {
				super(message);
				this.failure = failure;
				this.name = "MetaEvolveError";
			}
		};
		/**
		* Resolve one route against the page base, without a query and without a hash.
		* @param path - the route path, e.g. `/meta-evolve/api/state`.
		* @returns the absolute URL to fetch.
		*/
		function routeUrl(path) {
			const url = new URL(path, pageBase());
			url.search = "";
			url.hash = "";
			return url.toString();
		}
		/** Fetch one JSON payload, throwing a typed failure. */
		async function requestJson(path, init) {
			let response;
			try {
				response = await fetch(routeUrl(path), {
					cache: "no-store",
					...init,
					headers: {
						accept: "application/json",
						...init?.headers ?? {}
					}
				});
			} catch (error) {
				throw new MetaEvolveError("unreachable", error instanceof Error ? error.message : String(error));
			}
			if (response.status === 404) throw new MetaEvolveError("not-mounted", `${path} is not registered on this host`);
			if (response.status === 403) throw new MetaEvolveError("refused", `${path} refused this request`);
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				throw new MetaEvolveError("rejected", `HTTP ${response.status}${detail === "" ? "" : `: ${detail.slice(0, 300)}`}`);
			}
			try {
				return await response.json();
			} catch (error) {
				throw new MetaEvolveError("malformed", error instanceof Error ? error.message : String(error));
			}
		}
		/** Map a failure onto the read state the view model speaks. */
		function readFailure(error) {
			if (error instanceof MetaEvolveError) {
				if (error.failure === "not-mounted") return {
					state: "not-mounted",
					note: error.message
				};
				if (error.failure === "refused" || error.failure === "rejected") return {
					state: "refused",
					note: error.message
				};
				if (error.failure === "unreachable") return {
					state: "unreachable",
					note: error.message
				};
				return {
					state: "malformed",
					note: error.message
				};
			}
			return {
				state: "malformed",
				note: error instanceof Error ? error.message : String(error)
			};
		}
		/** A plain object, or null. Arrays and null are NOT records. */
		function asRecord(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
			return value;
		}
		/** A string, or null. An empty string is returned as the empty string (it is a value). */
		function str(value) {
			return typeof value === "string" ? value : null;
		}
		/** A finite number, or null. A numeric string is NOT a number here. */
		function num(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : null;
		}
		/** A boolean, or null. */
		function bool(value) {
			return typeof value === "boolean" ? value : null;
		}
		/** A string array, or null. */
		function strList(value) {
			return Array.isArray(value) ? value.map((entry) => String(entry)) : null;
		}
		/** A `{read, of}` census pair, or null. */
		function countsPair(value) {
			const record = asRecord(value);
			if (record === null) return null;
			return {
				read: num(record["read"]),
				of: num(record["of"])
			};
		}
		/** One field read from a record into a `FieldView`, or absent with a reason. */
		function fieldOr(raw, reason, name, normalize) {
			const record = asRecord(raw);
			if (record === null) return absentField(reason ?? `${name}: the field is absent from the state payload and unreadable carries no reason`);
			return presentField(normalize(record));
		}
		/** `unreadable` map to a list, preserving the host's own reasons. */
		function unreadableList(value) {
			const record = asRecord(value);
			if (record === null) return null;
			return Object.entries(record).map(([field, reason]) => ({
				field,
				reason: String(reason)
			}));
		}
		/** Normalize `decisionLog`. */
		function toDecisionLog(record) {
			return {
				total: num(record["total"]),
				active: num(record["active"]),
				superseded: num(record["superseded"]),
				of: num(record["of"]),
				sumsToTotal: bool(record["sumsToTotal"]),
				censusAt: str(record["censusAt"]),
				events: num(record["events"]),
				malformedLines: num(record["malformedLines"]),
				readAt: str(record["readAt"])
			};
		}
		/** Normalize `intentField`, turning the by-value object into ordered pairs. */
		function toIntentField(record) {
			const byValueRaw = asRecord(record["byValue"]);
			let byValue = null;
			if (byValueRaw !== null) byValue = Object.entries(byValueRaw).map(([value, count]) => ({
				value,
				count: num(count)
			}));
			return {
				rows: num(record["rows"]),
				of: num(record["of"]),
				byValue,
				byValueOf: num(record["byValueOf"]),
				rowsWithoutValue: num(record["rowsWithoutValue"]),
				duplicateRowIds: num(record["duplicateRowIds"]),
				mode: str(record["mode"]),
				generatedAt: str(record["generatedAt"]),
				documents: num(record["documents"]),
				declaredRows: num(record["declaredRows"]),
				rowsMatchDeclared: bool(record["rowsMatchDeclared"]),
				file: str(record["file"]),
				bytes: num(record["bytes"]),
				readAt: str(record["readAt"])
			};
		}
		/** Normalize `lvl1Gate`. */
		function toLvl1Gate(record) {
			const outcomesRaw = asRecord(record["outcomes"]);
			const lastRaw = asRecord(record["last"]);
			return {
				hooked: bool(record["hooked"]),
				hookedAgrees: bool(record["hookedAgrees"]),
				runs: num(record["runs"]),
				sessions: num(record["sessions"]),
				outcomes: outcomesRaw === null ? null : {
					decided: num(outcomesRaw["decided"]),
					declined: num(outcomesRaw["declined"]),
					neverRan: num(outcomesRaw["neverRan"])
				},
				outcomesOf: num(record["outcomesOf"]),
				last: lastRaw === null ? null : {
					outcome: str(lastRaw["outcome"]),
					reason: str(lastRaw["reason"]),
					channel: str(lastRaw["channel"]),
					at: str(lastRaw["at"])
				},
				revisions: strList(record["revisions"]),
				readAt: str(record["readAt"])
			};
		}
		/** Normalize `intentMap`. */
		function toIntentMap(record) {
			return {
				zones: num(record["zones"]),
				of: num(record["of"]),
				model: str(record["model"]),
				dim: num(record["dim"]),
				freshness: str(record["freshness"]),
				corpusPlugins: num(record["corpusPlugins"]),
				corpusOf: num(record["corpusOf"]),
				catalogCount: num(record["catalogCount"]),
				readAt: str(record["readAt"])
			};
		}
		/** Normalize `plugins`. */
		function toPlugins(record) {
			return {
				count: num(record["count"]),
				of: num(record["of"]),
				names: strList(record["names"]),
				root: str(record["root"]),
				readAt: str(record["readAt"])
			};
		}
		/**
		* Build a state view where EVERY field is absent, carrying one reason.
		* @param state - the route-level read state.
		* @param note - why the route could not be read.
		* @returns the state view.
		*/
		function stateFailure(state, note) {
			return {
				state,
				note,
				at: null,
				host: null,
				readMs: null,
				countsRead: null,
				unreadable: null,
				notDone: null,
				decisionLog: absentField(note),
				intentField: absentField(note),
				lvl1Gate: absentField(note),
				intentMap: absentField(note),
				plugins: absentField(note)
			};
		}
		/**
		* Normalize `GET /meta-evolve/api/state`.
		*
		* The route always answers a 200 with `ok: true`; a field whose source failed is
		* `null` and `unreadable[field]` names the reason. Each field is normalized
		* independently, so one unreadable source cannot blank the other four.
		* @param raw - the route payload.
		* @returns the state view.
		*/
		function normalizeState(raw) {
			const body = asRecord(raw);
			if (body === null || body["ok"] !== true) return stateFailure("malformed", body === null ? "the state payload was not a JSON object" : str(body["error"]) ?? "the state route answered ok=false");
			const unreadableMap = asRecord(body["unreadable"]);
			const reasonFor = (name) => {
				if (unreadableMap === null) return null;
				return str(unreadableMap[name]);
			};
			const notDoneRaw = body["notDone"];
			return {
				state: "loaded",
				note: str(body["note"]),
				at: str(body["at"]),
				host: str(body["host"]),
				readMs: num(body["readMs"]),
				countsRead: countsPair(body["countsRead"]),
				unreadable: unreadableList(body["unreadable"]),
				notDone: notDoneRaw === void 0 ? null : strList(notDoneRaw),
				decisionLog: fieldOr(body["decisionLog"], reasonFor("decisionLog"), "decisionLog", toDecisionLog),
				intentField: fieldOr(body["intentField"], reasonFor("intentField"), "intentField", toIntentField),
				lvl1Gate: fieldOr(body["lvl1Gate"], reasonFor("lvl1Gate"), "lvl1Gate", toLvl1Gate),
				intentMap: fieldOr(body["intentMap"], reasonFor("intentMap"), "intentMap", toIntentMap),
				plugins: fieldOr(body["plugins"], reasonFor("plugins"), "plugins", toPlugins)
			};
		}
		/** Normalize one `SetView`, keeping `null` (unreadable) distinct from `[]` (empty). */
		function toSetView(raw) {
			const record = asRecord(raw);
			if (record === null) return null;
			const intentRowsRaw = record["intentRows"];
			let intentRows = null;
			if (Array.isArray(intentRowsRaw)) intentRows = intentRowsRaw.map((entry) => {
				const row = asRecord(entry);
				if (row === null) return String(entry);
				return `${str(row["id"]) ?? "unknown"} = ${str(row["value"]) ?? "no value"}`;
			});
			return {
				decisions: strList(record["decisions"]),
				plugins: strList(record["plugins"]),
				intentRows
			};
		}
		/** Normalize one round's delta. */
		function toDelta(record) {
			const movedRaw = record["moved"];
			let moved = null;
			if (Array.isArray(movedRaw)) moved = movedRaw.map((entry) => {
				const item = asRecord(entry);
				return {
					key: str(item?.["key"]) ?? "unknown",
					from: num(item?.["from"]),
					to: num(item?.["to"]),
					delta: num(item?.["delta"])
				};
			});
			const movedOfRaw = asRecord(record["movedOf"]);
			const changedRaw = asRecord(record["changed"])?.["intentRows"];
			let changed = null;
			if (Array.isArray(changedRaw)) changed = changedRaw.map((entry) => {
				const item = asRecord(entry);
				return {
					id: str(item?.["id"]) ?? "unknown",
					from: str(item?.["from"]) ?? "NOT MEASURED",
					to: str(item?.["to"]) ?? "NOT MEASURED"
				};
			});
			const unavailableRaw = record["unavailable"];
			let unavailable = null;
			if (asRecord(unavailableRaw) !== null) unavailable = Object.entries(asRecord(unavailableRaw) ?? {}).map(([key, reason]) => ({
				key,
				reason: String(reason)
			}));
			const valuesRaw = asRecord(record["values"]);
			let values = null;
			if (valuesRaw !== null) values = Object.entries(valuesRaw).map(([key, entry]) => {
				const item = asRecord(entry);
				const changedRaw = item?.["changed"];
				return {
					key,
					from: str(item?.["from"]),
					to: str(item?.["to"]),
					changed: typeof changedRaw === "boolean" ? changedRaw : null,
					reason: str(item?.["reason"])
				};
			}).sort((left, right) => left.key.localeCompare(right.key));
			const valuesOfRaw = asRecord(record["valuesOf"]);
			return {
				against: num(record["against"]),
				againstAt: str(record["againstAt"]),
				moved,
				movedOf: movedOfRaw === null ? null : {
					moved: num(movedOfRaw["moved"]),
					checked: num(movedOfRaw["checked"]),
					uncompared: num(movedOfRaw["uncompared"])
				},
				values,
				valuesOf: valuesOfRaw === null ? null : {
					changed: num(valuesOfRaw["changed"]),
					checked: num(valuesOfRaw["checked"]),
					uncomparable: num(valuesOfRaw["uncomparable"])
				},
				appeared: toSetView(record["appeared"]),
				disappeared: toSetView(record["disappeared"]),
				changed,
				unavailable
			};
		}
		/** Normalize one recorded round. */
		function normalizeRound(raw) {
			const record = asRecord(raw);
			if (record === null) return {
				n: null,
				at: null,
				model: null,
				countsRead: null,
				delta: null,
				deltaReason: null,
				unreadable: null
			};
			const unreadableRaw = asRecord(record["unreadable"]);
			return {
				n: num(record["n"]),
				at: str(record["at"]),
				model: str(record["model"]),
				countsRead: countsPair(record["countsRead"]),
				delta: asRecord(record["delta"]) === null ? null : toDelta(asRecord(record["delta"]) ?? {}),
				deltaReason: str(record["deltaReason"]),
				unreadable: unreadableRaw === null ? null : Object.entries(unreadableRaw).map(([field, reason]) => ({
					field,
					reason: String(reason)
				}))
			};
		}
		/**
		* Build a rounds view whose read failed.
		* @param state - the route-level read state.
		* @param note - why it failed.
		* @returns the rounds view.
		*/
		function roundsFailure(state, note) {
			return {
				state,
				note,
				count: null,
				total: null,
				lines: null,
				bytes: null,
				exists: null,
				trailingNewline: null,
				malformedLines: null,
				rounds: null
			};
		}
		/**
		* Normalize `GET /meta-evolve/api/rounds`.
		*
		* `count: 0, total: 0, rounds: []` is a READ store that is empty — NOTHING
		* RECORDED — and it is deliberately distinct from a failed read, which is
		* `rounds: null` and NOT MEASURED. The renderer chooses between those two tokens
		* and the harness drives both.
		* @param raw - the route payload.
		* @returns the rounds view.
		*/
		function normalizeRounds(raw) {
			const body = asRecord(raw);
			if (body === null || body["ok"] !== true) return roundsFailure("malformed", body === null ? "the rounds payload was not a JSON object" : str(body["error"]) ?? str(body["reason"]) ?? "the rounds route answered ok=false");
			const roundsRaw = body["rounds"];
			return {
				state: "loaded",
				note: null,
				count: num(body["count"]),
				total: num(body["total"]),
				lines: num(body["lines"]),
				bytes: num(body["bytes"]),
				exists: bool(body["exists"]),
				trailingNewline: bool(body["trailingNewline"]),
				malformedLines: num(body["malformedLines"]),
				rounds: Array.isArray(roundsRaw) ? roundsRaw.map(normalizeRound) : null
			};
		}
		/** An evolve view for a failed POST. */
		function evolveFailure(note) {
			return {
				state: "failed",
				note,
				round: null,
				before: null,
				change: null,
				verification: null
			};
		}
		/**
		* Normalize `POST /meta-evolve/api/evolve`.
		*
		* The response is the CONTROL's proof: `round` is the record it created,
		* `before.lines`/`stored` produce `change.linesDelta`, and `verification` says
		* whether the file was re-read and matched. All three are carried into the view
		* so the panel can render the round the click produced.
		* @param raw - the route payload.
		* @returns the evolve view.
		*/
		function normalizeEvolve(raw) {
			const body = asRecord(raw);
			if (body === null || body["ok"] !== true) return evolveFailure(body === null ? "the evolve payload was not a JSON object" : str(body["error"]) ?? "the evolve route answered ok=false");
			const before = asRecord(body["before"]);
			const change = asRecord(body["change"]);
			const verification = asRecord(body["verification"]);
			const roundRaw = asRecord(body["round"]);
			return {
				state: "done",
				note: null,
				round: roundRaw === null ? null : normalizeRound(roundRaw),
				before: before === null ? null : {
					exists: bool(before["exists"]),
					lines: num(before["lines"]),
					rounds: num(before["rounds"])
				},
				change: change === null ? null : {
					linesDelta: num(change["linesDelta"]),
					roundsDelta: num(change["roundsDelta"])
				},
				verification: verification === null ? null : {
					verified: bool(verification["verified"]),
					reason: str(verification["reason"]),
					lines: num(verification["lines"]),
					rounds: num(verification["rounds"])
				}
			};
		}
		/** Read `/meta-evolve/api/state`. Never rejects: a failed read is a state view. */
		async function fetchState() {
			try {
				return normalizeState(await requestJson(ROUTES.state));
			} catch (error) {
				const { state, note } = readFailure(error);
				return stateFailure(state, note);
			}
		}
		/** Read `/meta-evolve/api/rounds`. Never rejects: a failed read is a rounds view. */
		async function fetchRounds() {
			try {
				return normalizeRounds(await requestJson(ROUTES.rounds));
			} catch (error) {
				const { state, note } = readFailure(error);
				return roundsFailure(state, note);
			}
		}
		/**
		* Read the whole surface in one pass.
		*
		* The two reads run together and neither can reject: one absent route must not
		* blank the other. The evolve slice starts idle — it belongs to the control, not
		* to the read.
		* @returns one complete view.
		*/
		async function fetchPanel() {
			const [state, rounds] = await Promise.all([fetchState(), fetchRounds()]);
			return {
				fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
				state,
				rounds,
				evolve: IDLE_EVOLVE
			};
		}
		/**
		* Drive the control — the round-producing POST, not a read.
		*
		* The route recomputes the state and APPENDS a round; the returned view carries
		* the created round and the file change so the panel can SHOW them. This function
		* resolves to a `failed` view rather than throwing, so a click that the host
		* refused renders as a refusal instead of a dead panel.
		* @returns the control's normalized outcome.
		*/
		async function evolve() {
			try {
				return normalizeEvolve(await requestJson(ROUTES.evolve, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({})
				}));
			} catch (error) {
				return evolveFailure(error instanceof Error ? error.message : String(error));
			}
		}
		//#endregion
		//#region src/client/PanelPage.ts
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
		/**
		* The meta-evolve panel.
		* @param props - the shell's page properties (the translator only).
		* @returns the frame, or the loading first paint in the SAME frame.
		*/
		function PanelPage(props) {
			const [view, setView] = (0, react.useState)(null);
			const [evolve$1, setEvolve] = (0, react.useState)(IDLE_EVOLVE);
			const [busy, setBusy] = (0, react.useState)(false);
			const [note, setNote] = (0, react.useState)(null);
			/** Read every route and replace the view. */
			const reload = (0, react.useCallback)(async () => {
				setBusy(true);
				try {
					setView(await fetchPanel());
					setNote(null);
				} catch (error) {
					setNote(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			/** Drive the control, then re-read so the change is OBSERVED as well as reported. */
			const onEvolve = (0, react.useCallback)(async () => {
				setBusy(true);
				setEvolve({
					...IDLE_EVOLVE,
					state: "running"
				});
				try {
					const outcome = await evolve();
					setEvolve(outcome);
					setView(await fetchPanel());
					setNote(outcome.state === "failed" ? outcome.note : null);
				} catch (error) {
					setEvolve({
						...IDLE_EVOLVE,
						state: "failed",
						note: error instanceof Error ? error.message : String(error)
					});
				} finally {
					setBusy(false);
				}
			}, []);
			const bar = (0, react.createElement)("div", {
				key: "control",
				"data-testid": "evolve-control",
				style: {
					display: "flex",
					gap: "8px",
					alignItems: "center",
					flexWrap: "wrap",
					marginBottom: "6px"
				}
			}, (0, react.createElement)("button", {
				type: "button",
				"data-testid": "evolve-button",
				onClick: () => {
					onEvolve();
				},
				disabled: busy,
				style: {
					padding: "3px 12px",
					fontSize: "12px",
					fontWeight: 600
				}
			}, props.t("evolveButton")), (0, react.createElement)("button", {
				type: "button",
				"data-testid": "refresh-button",
				onClick: () => {
					reload();
				},
				disabled: busy,
				style: {
					padding: "3px 10px",
					fontSize: "12px"
				}
			}, props.t("refreshButton")), note === null ? null : (0, react.createElement)("span", {
				key: "note",
				"data-testid": "evolve-note",
				style: { fontSize: "12px" }
			}, note));
			const hint = (0, react.createElement)("p", {
				key: "hint",
				style: {
					fontSize: "11px",
					color: "var(--dsh-text-2, #8b949e)",
					margin: "0 0 6px"
				}
			}, props.t("evolveHint"));
			const controls = (0, react.createElement)("div", {
				key: "controls",
				"data-testid": "evolve-control-bar",
				style: { marginBottom: "4px" }
			}, hint, bar);
			if (view === null) return renderLoadingPanel(props.t, controls);
			return renderPanel({
				...view,
				evolve: evolve$1
			}, props.t, controls);
		}
		//#endregion
		//#region src/client/index.ts
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
		/** Loader row name; the Client bundle registers itself under this same id. */
		const name = "dsh-meta-evolve";
		/** The two Client services this half reads. */
		const inject = ["slots", "locale"];
		/**
		* The panel's identity, declared once per spelling.
		*
		* {@link PANEL_ROW_ID} is the `sidebar.panellist` row's `id` and
		* {@link PANEL_MAIN_KEY} is the `main` panel's `key`. They hold the same string
		* ON PURPOSE — see the module header — and both are namespaced so they cannot
		* collide with a shipped panel id.
		*/
		const PANEL_ROW_ID = "dsh-meta-evolve:evolve";
		/** The `main` key the row selects. MUST equal {@link PANEL_ROW_ID}. */
		const PANEL_MAIN_KEY = "dsh-meta-evolve:evolve";
		/** Position among the global panel rows, ascending. Sits after the LVL1 gate's row. */
		const PANEL_ROW_ORDER = 6.55;
		/**
		* The row's glyph, drawn inline so the bundle needs no asset fetch.
		* @returns the svg element.
		*/
		function EvolveRowIcon() {
			return (0, react.createElement)("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.4,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}, (0, react.createElement)("path", { d: "M13 5.5V2.8l-2.2 1.6" }), (0, react.createElement)("path", { d: "M13.2 6.4a5.4 5.4 0 1 0-1.1 6" }), (0, react.createElement)("circle", {
				cx: 8,
				cy: 8,
				r: 1.4,
				fill: "currentColor",
				stroke: "none"
			}));
		}
		/**
		* Register the dictionaries, the nav row and the keyed main panel.
		* @param ctx - the Client plugin context (`slots`, `locale`, `effect`, `logger`).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, "en", en), "dsh-meta-evolve: en dictionary");
			ctx.effect(() => ctx.locale.register(LOCALE_NS, "zh", zh), "dsh-meta-evolve: zh dictionary");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_MAIN_KEY,
				locale: LOCALE_NS,
				registrant: "dsh-meta-evolve",
				inject: () => ({ t })
			}, PanelPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ROW_ID,
				order: PANEL_ROW_ORDER,
				label: () => t("row"),
				locale: LOCALE_NS,
				registrant: "dsh-meta-evolve",
				inject: () => ({ t })
			}, EvolveRowIcon));
			ctx.logger.info(`dsh-meta-evolve: client active; nav row ${PANEL_ROW_ID}@${PANEL_ROW_ORDER} with keyed main twin ${PANEL_MAIN_KEY}, plus dictionaries`);
		}
		/** The pure renderer the panel uses, exported so it can be DRIVEN. */
		const __renderPanel = renderPanel;
		/** The loading first paint, exported so the harness can prove it uses the SAME frame. */
		const __renderLoadingPanel = renderLoadingPanel;
		/** The rounds-store state rule, exported so `NOTHING RECORDED` / `NOT MEASURED` can be driven apart. */
		const __roundsLabel = roundsLabel;
		/** The control's tone rule, exported for the same reason. */
		const __evolveTone = evolveTone;
		/** The three normalizers, exported so fixtures are normalized the SAME way a live read is. */
		const __normalizeState = normalizeState;
		const __normalizeRounds = normalizeRounds;
		const __normalizeEvolve = normalizeEvolve;
		/** The control itself, exported so the harness can drive the POST against a stub host. */
		const __evolve = evolve;
		/** The read calls, exported so a live host can be driven without this file's page. */
		const __fetchPanel = fetchPanel;
		const __fetchState = fetchState;
		const __fetchRounds = fetchRounds;
		//#endregion
		exports.__ROUTES = ROUTES;
		exports.__evolve = __evolve;
		exports.__evolveTone = __evolveTone;
		exports.__fetchPanel = __fetchPanel;
		exports.__fetchRounds = __fetchRounds;
		exports.__fetchState = __fetchState;
		exports.__normalizeEvolve = __normalizeEvolve;
		exports.__normalizeRounds = __normalizeRounds;
		exports.__normalizeState = __normalizeState;
		exports.__renderLoadingPanel = __renderLoadingPanel;
		exports.__renderPanel = __renderPanel;
		exports.__roundsLabel = __roundsLabel;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
