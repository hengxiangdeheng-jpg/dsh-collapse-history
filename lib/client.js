window.__ModuleLoader__.load({
	id: "dsh-collapse-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region settings
		const STORAGE_KEY = "dsh-collapse-history:settings:v3";
		const DEFAULTS = Object.freeze({
			auto: true,
			assistantKeep: 1
		});

		function clamp(value, lo, hi) {
			return Math.max(lo, Math.min(hi, value));
		}

		function loadSettings() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					return {
						auto: typeof parsed.auto === "boolean" ? parsed.auto : DEFAULTS.auto,
						assistantKeep: Number.isFinite(parsed.assistantKeep) ? clamp(parsed.assistantKeep, 0, 10) : DEFAULTS.assistantKeep
					};
				}
			} catch (_) { /* storage unavailable or corrupt — fall through */ }
			return { ...DEFAULTS };
		}

		function saveSettings() {
			try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
		}

		let settings = loadSettings();
		//#endregion

		//#region i18n
		const isZh = typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language || "");
		const T = {
			barTitle: isZh ? "对话折叠工具" : "Conversation fold",
			autoOn: isZh ? "自动折叠已开启（较旧的对话轮次自动收起，最近 N 轮保持展开）" : "Auto fold ON (older turns fold automatically; the most recent N stay expanded)",
			autoOff: isZh ? "自动折叠已关闭" : "Auto fold OFF",
			hideAllAssistant: isZh ? "隐藏全部助手回复（只留你的问题）" : "Hide all assistant messages (keep only your messages)",
			showAllAssistant: isZh ? "显示全部助手回复" : "Show all assistant messages",
			hideAllUser: isZh ? "隐藏全部你的消息（只留助手回复）" : "Hide all your messages (keep only assistant replies)",
			showAllUser: isZh ? "显示全部你的消息" : "Show all your messages",
			settings: isZh ? "设置" : "Settings",
			chipAssistant: (n) => isZh
				? "🤖 助手回复已隐藏 · 点击展开"
				: "🤖 Assistant reply hidden · click to expand",
			chipUser: (n) => isZh
				? "👤 你的消息已隐藏 · 点击展开"
				: "👤 Your message hidden · click to expand",
			keepAssistant: isZh ? "保留最近助手回复条数" : "Keep recent assistant messages",
			clearPins: isZh ? "清除手动固定（恢复自动折叠）" : "Clear manual pins (resume auto fold)",
			reset: isZh ? "恢复默认设置" : "Reset defaults",
			hint: isZh
				? "自动模式下只会折叠较旧的助手回复（你的消息始终可见），最近 N 条助手回复保持展开；设为 0 则全部助手回复都折叠。手动操作过的轮次会被固定，直到清除固定。"
				: "Auto mode only folds older assistant replies — your messages always stay visible. The most recent N assistant replies stay expanded (set 0 to fold every assistant reply). Manually toggled turns are pinned until you clear pins."
		};
		//#endregion

		//#region selectors & DOM helpers
		const FLOW_SELECTOR = '[class$="_flowItem"]';
		const USER_ROW_SELECTOR = '[class$="_userRow"]';
		const THINK_RUNNING_SELECTOR = '[data-variant="think"][data-state="running"]';
		const ATTR_ASSISTANT_HIDDEN = "data-dshc-ahidden";
		const ATTR_USER_HIDDEN = "data-dshc-uhidden";
		const ATTR_PINNED = "data-dshc-pinned";
		const CSS_TAG = "dsh-collapse-history";

		/** The conversation column (compat shim stamps data-pane="conversation"; stamp it ourselves too). */
		function conversationPane() {
			let pane = document.querySelector('[data-pane="conversation"]');
			if (pane !== null) return pane;
			const center = document.querySelector('[class*="centerCol"]');
			if (center !== null) {
				center.setAttribute("data-pane", "conversation");
				return center;
			}
			return null;
		}

		function flowItems() {
			const pane = conversationPane();
			const root = pane !== null ? pane : document;
			return [...root.querySelectorAll(FLOW_SELECTOR)];
		}

		/**
		 * Group the flow items into turns:
		 * - user turn: one flow item containing a user message row
		 * - assistant turn: the consecutive run of non-user flow items (thinking,
		 *   markdown, tool calls, context markers) between two user turns
		 */
		function buildTurns() {
			const turns = [];
			let current = null;
			for (const item of flowItems()) {
				const userRow = item.querySelector(USER_ROW_SELECTOR);
				if (userRow !== null) {
					current = null;
					turns.push({ kind: "user", items: [item], userRow });
				} else {
					if (current === null || current.kind !== "assistant") {
						current = { kind: "assistant", items: [] };
						turns.push(current);
					}
					current.items.push(item);
				}
			}
			return turns;
		}

		function isRunning(turn) {
			return turn.items.some((item) => item.querySelector(THINK_RUNNING_SELECTOR) !== null);
		}
		//#endregion

		//#region chips
		function makeChip(attr, label) {
			const chip = document.createElement("div");
			chip.className = "dshc-chip";
			chip.setAttribute(attr, "");
			chip.setAttribute("role", "button");
			chip.tabIndex = 0;
			chip.textContent = label;
			return chip;
		}

		function ensureChip(flow, attr, label) {
			if (flow.querySelector("[" + attr + "]") !== null) return;
			const chip = makeChip(attr, label);
			chip.addEventListener("click", (event) => {
				event.stopPropagation();
				toggleTurnOf(flow);
			});
			chip.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleTurnOf(flow);
				}
			});
			flow.appendChild(chip);
		}

		function toggleTurnOf(flow) {
			const turn = findTurn(flow);
			if (turn === null) return;
			turn.items[0].setAttribute(ATTR_PINNED, "");
			setTurnHidden(turn, !isTurnHidden(turn), true);
		}

		function findTurn(flow) {
			return buildTurns().find((turn) => turn.items.includes(flow)) || null;
		}

		function isTurnHidden(turn) {
			if (turn.kind === "user") return turn.items[0].hasAttribute(ATTR_USER_HIDDEN);
			return turn.items[0].hasAttribute(ATTR_ASSISTANT_HIDDEN);
		}
		//#endregion

		//#region folding primitives
		function setTurnHidden(turn, hidden, ignorePin) {
			const first = turn.items[0];
			if (ignorePin !== true && first.hasAttribute(ATTR_PINNED)) return;
			if (turn.kind === "user") {
				ensureChip(first, "data-dshc-uchip", T.chipUser());
				if (hidden) first.setAttribute(ATTR_USER_HIDDEN, "1");
				else first.removeAttribute(ATTR_USER_HIDDEN);
			} else {
				ensureChip(first, "data-dshc-achip", T.chipAssistant(turn.items.length));
				for (const item of turn.items) {
					if (hidden) item.setAttribute(ATTR_ASSISTANT_HIDDEN, "1");
					else item.removeAttribute(ATTR_ASSISTANT_HIDDEN);
				}
			}
		}

		/** One auto-fold pass: fold older assistant turns; user messages are never auto-folded. */
		function autoFold() {
			if (!settings.auto) return;
			const turns = buildTurns();
			const assistants = turns.filter((turn) => turn.kind === "assistant");
			const keepAssistant = clamp(settings.assistantKeep, 0, 10);
			assistants.forEach((turn, index) => {
				if (index >= assistants.length - keepAssistant) setTurnHidden(turn, false);
				else if (!isRunning(turn)) setTurnHidden(turn, true);
			});
		}
		//#endregion

		//#region bulk actions
		function setAll(kind, hidden) {
			buildTurns()
				.filter((turn) => turn.kind === kind)
				.forEach((turn) => {
					turn.items[0].setAttribute(ATTR_PINNED, "");
					setTurnHidden(turn, hidden, true);
				});
		}

		function clearPins() {
			document.querySelectorAll("[" + ATTR_PINNED + "]").forEach((el) => el.removeAttribute(ATTR_PINNED));
			autoFold();
		}
		//#endregion

		//#region styles
		const CSS = [
			"[data-dshc-bar]{position:fixed;z-index:2147483000;display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:14px;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l,rgba(128,128,128,.35));box-shadow:0 4px 18px rgba(0,0,0,.18)}",
			"[data-dshc-bar]>button{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary,#555);font-size:14px;cursor:pointer;line-height:1}",
			"[data-dshc-bar]>button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15))}",
			"[data-dshc-bar]>button[data-on]{background:var(--dsw-alias-brand-primary,#4f6ef7);color:var(--dsw-alias-label-primary-foreground,#fff)}",
			"[data-dshc-pop]{position:fixed;z-index:2147483001;width:280px;padding:14px 16px;border-radius:14px;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l,rgba(128,128,128,.35));box-shadow:0 8px 28px rgba(0,0,0,.22);font-size:13px;color:var(--dsw-alias-label-primary,#222);display:none}",
			"[data-dshc-pop][data-open]{display:block}",
			"[data-dshc-pop] h3{margin:0 0 10px;font-size:14px;color:var(--dsw-alias-label-primary,#222)}",
			"[data-dshc-pop] label{display:flex;align-items:center;gap:8px;margin:8px 0;color:var(--dsw-alias-label-secondary,#444)}",
			"[data-dshc-pop] input[type=number]{width:64px;padding:4px 6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l,rgba(128,128,128,.4));background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,#222)}",
			"[data-dshc-pop] button.dshc-pop-btn{display:block;width:100%;margin-top:8px;padding:7px 10px;border:none;border-radius:9px;background:var(--dsw-alias-button-tool-bar-fill,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,#222);cursor:pointer;font-size:13px}",
			"[data-dshc-pop] button.dshc-pop-btn:hover{background:var(--dsw-alias-button-tool-bar-hover,rgba(128,128,128,.2))}",
			"[data-dshc-pop] .dshc-hint{margin-top:10px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.6}",
			'[class$="_flowItem"]{position:relative}',
			'[data-dshc-uhidden]>div{display:none!important}',
			"[data-dshc-ahidden]>*:not([data-dshc-achip]){display:none!important}",
			"[data-dshc-uchip],[data-dshc-achip]{display:none;align-items:center;gap:6px;max-width:min(525px,86%);margin:4px 0;padding:6px 14px;border-radius:18px;background:var(--dsw-specific-bubble,var(--dsw-alias-bg-base,rgba(128,128,128,.15)));border:1px dashed var(--dsw-alias-border-l,rgba(128,128,128,.4));color:var(--dsw-alias-label-secondary,#555);font-size:13px;line-height:1.5;cursor:pointer;user-select:none}",
			"[data-dshc-uhidden]>[data-dshc-uchip],[data-dshc-ahidden]>[data-dshc-achip]{display:inline-flex!important}",
			"[data-dshc-uchip]:hover,[data-dshc-achip]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15))}"
		].join("\n");

		function injectCss() {
			if (document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]') !== null) return;
			const style = document.createElement("style");
			style.setAttribute("data-plugin-css", CSS_TAG);
			style.textContent = CSS;
			document.head.appendChild(style);
		}
		//#endregion

		//#region toolbar
		function makeButton(icon, title, action) {
			const button = document.createElement("button");
			button.type = "button";
			button.title = title;
			button.textContent = icon;
			button.setAttribute("data-dshc-act", action);
			button.addEventListener("click", () => handleAction(action));
			return button;
		}

		function positionBar() {
			const pane = conversationPane();
			const bar = document.querySelector("[data-dshc-bar]");
			const pop = document.querySelector("[data-dshc-pop]");
			if (bar === null || pane === null) return;
			const rect = pane.getBoundingClientRect();
			const right = Math.max(12, window.innerWidth - rect.right + 10);
			const bottom = Math.max(12, window.innerHeight - rect.bottom + 104);
			bar.style.right = right + "px";
			bar.style.bottom = bottom + "px";
			if (pop !== null) {
				const barWidth = bar.offsetWidth || 48;
				const popWidth = 280;
				const popHeight = pop.offsetHeight || 300;
				const spaceLeft = window.innerWidth - right - barWidth - popWidth - 14;
				if (spaceLeft >= 0) {
					pop.style.right = (right + barWidth + 10) + "px";
					pop.style.bottom = bottom + "px";
				} else {
					const maxBottom = Math.max(12, window.innerHeight - popHeight - 12);
					pop.style.right = right + "px";
					pop.style.bottom = Math.max(12, Math.min(bottom + barWidth + 10, maxBottom)) + "px";
				}
			}
		}

		function handleAction(action) {
			switch (action) {
				case "auto":
					settings.auto = !settings.auto;
					saveSettings();
					refreshAutoButton();
					if (settings.auto) autoFold();
					break;
				case "assistant-hide":
					setAll("assistant", true);
					break;
				case "assistant-show":
					setAll("assistant", false);
					break;
				case "user-hide":
					setAll("user", true);
					break;
				case "user-show":
					setAll("user", false);
					break;
				case "settings":
					togglePop();
					break;
			}
		}

		function refreshAutoButton() {
			const bar = document.querySelector("[data-dshc-bar]");
			if (bar === null) return;
			const autoBtn = bar.querySelector('[data-dshc-act="auto"]');
			if (autoBtn !== null) {
				if (settings.auto) autoBtn.removeAttribute("data-on");
				else autoBtn.setAttribute("data-on", "off");
			}
		}

		function togglePop() {
			const pop = document.querySelector("[data-dshc-pop]");
			if (pop === null) return;
			const open = pop.getAttribute("data-open") === "true";
			if (open) pop.removeAttribute("data-open");
			else pop.setAttribute("data-open", "true");
		}

		function buildToolbar() {
			if (document.querySelector("[data-dshc-bar]") !== null) return;

			const bar = document.createElement("div");
			bar.setAttribute("data-dshc-bar", "");
			bar.title = T.barTitle;
			bar.appendChild(makeButton("⚡", T.autoOn + " / " + T.autoOff, "auto"));
			bar.appendChild(makeButton("🧑‍💻▾", T.hideAllAssistant, "assistant-hide"));
			bar.appendChild(makeButton("🧑‍💻▴", T.showAllAssistant, "assistant-show"));
			bar.appendChild(makeButton("👤▾", T.hideAllUser, "user-hide"));
			bar.appendChild(makeButton("👤▴", T.showAllUser, "user-show"));
			bar.appendChild(makeButton("⚙", T.settings, "settings"));
			document.body.appendChild(bar);

			const pop = document.createElement("div");
			pop.setAttribute("data-dshc-pop", "");

			const title = document.createElement("h3");
			title.textContent = T.settings;
			pop.appendChild(title);

			const autoLabel = document.createElement("label");
			const autoCheck = document.createElement("input");
			autoCheck.type = "checkbox";
			autoCheck.checked = settings.auto;
			autoCheck.addEventListener("change", () => {
				settings.auto = autoCheck.checked;
				saveSettings();
				refreshAutoButton();
				if (settings.auto) autoFold();
			});
			autoLabel.appendChild(autoCheck);
			autoLabel.appendChild(document.createTextNode(isZh ? "自动折叠" : "Auto fold"));
			pop.appendChild(autoLabel);

			const assistantLabel = document.createElement("label");
			assistantLabel.appendChild(document.createTextNode(T.keepAssistant + " "));
			const assistantInput = document.createElement("input");
			assistantInput.type = "number";
			assistantInput.min = "0";
			assistantInput.max = "10";
			assistantInput.value = String(settings.assistantKeep);
			assistantInput.addEventListener("change", () => {
				settings.assistantKeep = clamp(Number(assistantInput.value) || 0, 0, 10);
				saveSettings();
				autoFold();
			});
			assistantLabel.appendChild(assistantInput);
			pop.appendChild(assistantLabel);

			const clearBtn = document.createElement("button");
			clearBtn.type = "button";
			clearBtn.className = "dshc-pop-btn";
			clearBtn.textContent = T.clearPins;
			clearBtn.addEventListener("click", clearPins);
			pop.appendChild(clearBtn);

			const resetBtn = document.createElement("button");
			resetBtn.type = "button";
			resetBtn.className = "dshc-pop-btn";
			resetBtn.textContent = T.reset;
			resetBtn.addEventListener("click", () => {
				settings = { ...DEFAULTS };
				saveSettings();
				clearPins();
				autoCheck.checked = settings.auto;
				assistantInput.value = String(settings.assistantKeep);
			});
			pop.appendChild(resetBtn);

			const hint = document.createElement("div");
			hint.className = "dshc-hint";
			hint.textContent = T.hint;
			pop.appendChild(hint);

			document.body.appendChild(pop);
			refreshAutoButton();
			positionBar();
		}

		function removeToolbar() {
			document.querySelectorAll("[data-dshc-bar],[data-dshc-pop]").forEach((el) => el.remove());
		}
		//#endregion

		//#region wiring
		let scheduled = false;
		function schedulePass() {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(() => {
				scheduled = false;
				positionBar();
				autoFold();
			});
		}

		function apply(ctx) {
			if (globalThis.__dshCollapseHistoryApplied === true) return;
			globalThis.__dshCollapseHistoryApplied = true;

			ctx.effect(() => {
				injectCss();
				buildToolbar();

				const observer = new MutationObserver(schedulePass);
				observer.observe(document.body, { childList: true, subtree: true, characterData: false });

				let paneResize = null;
				const wirePane = () => {
					const pane = conversationPane();
					if (pane !== null && paneResize === null) {
						paneResize = new ResizeObserver(schedulePass);
						paneResize.observe(pane);
					}
				};
				wirePane();
				window.addEventListener("resize", schedulePass);

				const bootTimer = setTimeout(() => {
					wirePane();
					schedulePass();
				}, 350);

				return () => {
					observer.disconnect();
					if (paneResize !== null) paneResize.disconnect();
					window.removeEventListener("resize", schedulePass);
					clearTimeout(bootTimer);
					removeToolbar();
					globalThis.__dshCollapseHistoryApplied = void 0;
				};
			}, "dsh-collapse-history: conversation folding");
		}
		//#endregion

		/** Required services: none — the plugin works purely on the DOM. */
		const inject = [];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});