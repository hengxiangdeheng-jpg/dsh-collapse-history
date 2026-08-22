window.__ModuleLoader__.load({
	id: "dsh-collapse-history",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		//#region settings
		const STORAGE_KEY = "dsh-collapse-history:settings:v1";
		const DEFAULTS = Object.freeze({
			auto: true,
			thinkKeep: 2,
			userKeep: 3
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
						thinkKeep: Number.isFinite(parsed.thinkKeep) ? clamp(parsed.thinkKeep, 0, 10) : DEFAULTS.thinkKeep,
						userKeep: Number.isFinite(parsed.userKeep) ? clamp(parsed.userKeep, 0, 10) : DEFAULTS.userKeep
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
			barTitle: isZh ? "历史折叠工具" : "History fold",
			autoOn: isZh ? "自动折叠已开启（较早内容自动折叠，最近 N 条保持展开）" : "Auto fold ON (older items fold automatically; the most recent N stay expanded)",
			autoOff: isZh ? "自动折叠已关闭" : "Auto fold OFF",
			foldAllThink: isZh ? "折叠全部思考" : "Collapse all thinking",
			expandAllThink: isZh ? "展开全部思考" : "Expand all thinking",
			foldAllUser: isZh ? "折叠全部问题" : "Collapse all questions",
			expandAllUser: isZh ? "展开全部问题" : "Expand all questions",
			settings: isZh ? "设置" : "Settings",
			fold: isZh ? "折叠" : "Fold",
			expand: isZh ? "展开" : "Expand",
			chip: (chars) => isZh
				? "👤 用户问题（" + chars + " 字）· 点击展开"
				: "👤 Question (" + chars + " chars) · click to expand",
			keepThink: isZh ? "保留最近思考条数" : "Keep recent thinking rows",
			keepUser: isZh ? "保留最近问题条数" : "Keep recent questions",
			clearPins: isZh ? "清除手动固定（恢复自动折叠）" : "Clear manual pins (resume auto fold)",
			reset: isZh ? "恢复默认设置" : "Reset defaults",
			hint: isZh
				? "自动模式下，较早的思考与问题会被折叠，最近 N 条保持展开；手动操作过的条目会被固定，直到清除固定。"
				: "In auto mode, older thinking & questions fold automatically; the most recent N stay expanded. Manually toggled items are pinned until you clear pins."
		};
		//#endregion

		//#region selectors & DOM helpers
		const THINK_SELECTOR = '[data-variant="think"]';
		const THINK_TOGGLE_SELECTOR = '[data-disclosure-row="true"]';
		const USER_ROW_SELECTOR = '[class$="_userRow"]';
		const USER_STACK_SELECTOR = ':scope > [class$="_userStack"]';
		const USER_ACTIONS_SELECTOR = ':scope > [class$="_actions"]';
		const CSS_TAG = "dsh-collapse-history";
		const ATTR_COLLAPSED = "data-dshc-collapsed";
		const ATTR_PINNED = "data-dshc-pinned";

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

		function thinkRoots() {
			const pane = conversationPane();
			const root = pane !== null ? pane : document;
			return [...root.querySelectorAll(THINK_SELECTOR)]
				.filter((el) => el.getAttribute("data-state") !== "running");
		}

		function userRows() {
			const pane = conversationPane();
			const root = pane !== null ? pane : document;
			return [...root.querySelectorAll(USER_ROW_SELECTOR)];
		}
		//#endregion

		//#region folding primitives
		/** True while we are driving a programmatic disclosure click (never a user gesture). */
		let programmaticClick = false;

		function clickDisclosure(row) {
			programmaticClick = true;
			try {
				row.click();
			} finally {
				programmaticClick = false;
			}
		}

		function setThinkExpanded(root, expanded) {
			if (root.hasAttribute(ATTR_PINNED)) return;
			const row = root.querySelector(THINK_TOGGLE_SELECTOR);
			if (row === null) return;
			const isExpanded = row.getAttribute("aria-expanded") === "true";
			if (isExpanded !== expanded) clickDisclosure(row);
		}

		function setUserCollapsed(row, collapsed) {
			if (row.hasAttribute(ATTR_PINNED)) return;
			const now = row.getAttribute(ATTR_COLLAPSED) === "1";
			if (now === collapsed) return;
			if (collapsed) row.setAttribute(ATTR_COLLAPSED, "1");
			else row.removeAttribute(ATTR_COLLAPSED);
		}

		function bubbleCharCount(row) {
			const stack = row.querySelector(USER_STACK_SELECTOR);
			if (stack === null) return 0;
			const text = (stack.innerText || "").trim();
			return isZh ? [...text].length : text.length;
		}

		/** One auto-fold pass: keep the most recent N of each kind expanded, fold the rest. */
		function autoFold() {
			if (!settings.auto) return;
			const thinks = thinkRoots();
			const keepThink = clamp(settings.thinkKeep, 0, 10);
			thinks.forEach((el, index) => {
				setThinkExpanded(el, index >= thinks.length - keepThink);
			});
			const users = userRows();
			const keepUser = clamp(settings.userKeep, 0, 10);
			users.forEach((el, index) => {
				ensureUserControls(el);
				setUserCollapsed(el, index < users.length - keepUser);
			});
		}
		//#endregion

		//#region per-row controls (user questions)
		function ensureUserControls(row) {
			if (row.hasAttribute("data-dshc-ready")) return;
			row.setAttribute("data-dshc-ready", "1");

			// Fold / expand button, placed next to the native action buttons when available.
			const button = document.createElement("button");
			button.type = "button";
			button.className = "dshc-fold-btn";
			button.setAttribute("data-dshc-foldbtn", "");
			button.title = T.fold;
			button.textContent = "▾";
			button.addEventListener("click", (event) => {
				event.stopPropagation();
				toggleUserRow(row);
			});
			const actions = row.querySelector(USER_ACTIONS_SELECTOR);
			if (actions !== null) actions.appendChild(button);
			else row.appendChild(button);

			// Chip shown while collapsed; clicking it expands.
			const chip = document.createElement("div");
			chip.className = "dshc-chip";
			chip.setAttribute("data-dshc-chip", "");
			chip.setAttribute("role", "button");
			chip.tabIndex = 0;
			chip.textContent = T.chip(bubbleCharCount(row));
			chip.addEventListener("click", (event) => {
				event.stopPropagation();
				toggleUserRow(row);
			});
			chip.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					toggleUserRow(row);
				}
			});
			row.appendChild(chip);
		}

		function toggleUserRow(row) {
			const collapsed = row.getAttribute(ATTR_COLLAPSED) === "1";
			row.setAttribute(ATTR_PINNED, "");
			if (collapsed) row.removeAttribute(ATTR_COLLAPSED);
			else row.setAttribute(ATTR_COLLAPSED, "1");
		}
		//#endregion

		//#region bulk actions
		function setAllThink(expanded) {
			thinkRoots().forEach((el) => {
				el.setAttribute(ATTR_PINNED, "");
				const row = el.querySelector(THINK_TOGGLE_SELECTOR);
				if (row === null) return;
				const isExpanded = row.getAttribute("aria-expanded") === "true";
				if (isExpanded !== expanded) clickDisclosure(row);
			});
		}

		function setAllUser(collapsed) {
			userRows().forEach((row) => {
				ensureUserControls(row);
				row.setAttribute(ATTR_PINNED, "");
				if (collapsed) row.setAttribute(ATTR_COLLAPSED, "1");
				else row.removeAttribute(ATTR_COLLAPSED);
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
			'[class$="_userRow"]{position:relative}',
			'[class$="_userRow"][data-dshc-collapsed="1"]>[class$="_userStack"]{display:none!important}',
			"[data-dshc-chip]{display:none;align-items:center;gap:6px;max-width:min(525px,82%);margin:2px 0;padding:6px 14px;border-radius:18px;background:var(--dsw-specific-bubble,var(--dsw-alias-bg-base,rgba(128,128,128,.15)));border:1px dashed var(--dsw-alias-border-l,rgba(128,128,128,.4));color:var(--dsw-alias-label-secondary,#555);font-size:13px;line-height:1.5;cursor:pointer;user-select:none}",
			'[class$="_userRow"][data-dshc-collapsed="1"]>[data-dshc-chip]{display:inline-flex}',
			"[data-dshc-chip]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15))}",
			"[data-dshc-foldbtn]{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#777);font-size:12px;cursor:pointer;line-height:1}",
			"[data-dshc-foldbtn]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18));color:var(--dsw-alias-label-primary,#222)}"
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
					// Open to the LEFT of the toolbar when the column has room.
					pop.style.right = (right + barWidth + 10) + "px";
					pop.style.bottom = bottom + "px";
				} else {
					// Otherwise open upward, clamped inside the viewport.
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
				case "think-collapse":
					setAllThink(false);
					break;
				case "think-expand":
					setAllThink(true);
					break;
				case "user-collapse":
					setAllUser(true);
					break;
				case "user-expand":
					setAllUser(false);
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
			bar.appendChild(makeButton("🧠▾", T.foldAllThink, "think-collapse"));
			bar.appendChild(makeButton("🧠▴", T.expandAllThink, "think-expand"));
			bar.appendChild(makeButton("👤▾", T.foldAllUser, "user-collapse"));
			bar.appendChild(makeButton("👤▴", T.expandAllUser, "user-expand"));
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

			const thinkLabel = document.createElement("label");
			thinkLabel.appendChild(document.createTextNode(T.keepThink + " "));
			const thinkInput = document.createElement("input");
			thinkInput.type = "number";
			thinkInput.min = "0";
			thinkInput.max = "10";
			thinkInput.value = String(settings.thinkKeep);
			thinkInput.addEventListener("change", () => {
				settings.thinkKeep = clamp(Number(thinkInput.value) || 0, 0, 10);
				saveSettings();
				autoFold();
			});
			thinkLabel.appendChild(thinkInput);
			pop.appendChild(thinkLabel);

			const userLabel = document.createElement("label");
			userLabel.appendChild(document.createTextNode(T.keepUser + " "));
			const userInput = document.createElement("input");
			userInput.type = "number";
			userInput.min = "0";
			userInput.max = "10";
			userInput.value = String(settings.userKeep);
			userInput.addEventListener("change", () => {
				settings.userKeep = clamp(Number(userInput.value) || 0, 0, 10);
				saveSettings();
				autoFold();
			});
			userLabel.appendChild(userInput);
			pop.appendChild(userLabel);

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
				thinkInput.value = String(settings.thinkKeep);
				userInput.value = String(settings.userKeep);
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

				// Manual toggles on built-in Think rows become pinned so auto mode never undoes them.
				const pinCapture = (event) => {
					if (programmaticClick) return;
					const target = event.target;
					if (!(target instanceof Element)) return;
					const root = target.closest(THINK_SELECTOR);
					if (root !== null && !root.hasAttribute(ATTR_PINNED)) root.setAttribute(ATTR_PINNED, "");
				};
				document.addEventListener("click", pinCapture, true);

				const bootTimer = setTimeout(() => {
					wirePane();
					schedulePass();
				}, 350);

				return () => {
					observer.disconnect();
					if (paneResize !== null) paneResize.disconnect();
					window.removeEventListener("resize", schedulePass);
					document.removeEventListener("click", pinCapture, true);
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