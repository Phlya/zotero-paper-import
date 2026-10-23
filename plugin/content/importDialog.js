/* global Zotero */

var TeamsImportDialog = {
	plugin: null,
	target: null,
	running: false,

	init() {
		let { plugin, target } = window.arguments[0];
		this.plugin = plugin;
		this.target = target;

		document.l10n.setAttributes(this.el("target"), "teams-import-target", { target: target.label });
		this.el("fulltext").checked = !!plugin.getPref("fetchFullText");
		this.el("fulltext").addEventListener("command", () => {
			plugin.setPref("fetchFullText", this.el("fulltext").checked);
		});
		this.el("import").addEventListener("command", () => this.run());
		this.el("close").addEventListener("command", () => window.close());
		this.el("input").addEventListener("keydown", (event) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				this.run();
			}
		});
		this.el("input").focus();
	},

	el(id) {
		return document.getElementById(id);
	},

	async run() {
		if (this.running) return;
		let text = this.el("input").value;
		if (!text.trim()) return;

		this.running = true;
		this.el("import").disabled = true;
		this.el("results").replaceChildren();
		let rows = [];
		let total = 0;
		let done = 0;

		try {
			let results = await this.plugin.importText(text, {
				libraryID: this.target.libraryID,
				collectionID: this.target.collectionID,
				fetchFullText: this.el("fulltext").checked,
				onProgress: (event) => {
					switch (event.phase) {
						case "start":
							total = event.total;
							this.setStatus("teams-import-status-working", { done: 0, total });
							break;
						case "item":
							if (!rows[event.index]) {
								rows[event.index] = this.addRow(event.label);
							}
							this.updateRow(rows[event.index], event);
							if (event.status !== "working" && event.hasFile === undefined) {
								done++;
								this.setStatus("teams-import-status-working", { done, total });
							}
							break;
						case "fulltext":
							this.setStatus("teams-import-status-fulltext", { total: event.total });
							break;
					}
				},
			});

			if (!results.length) {
				this.setStatus("teams-import-status-none");
			}
			else {
				let countOf = status => results.filter(r => r.status === status).length;
				this.setStatus("teams-import-status-done", {
					added: countOf("added"),
					duplicates: countOf("duplicate"),
					failed: countOf("failed"),
				});
			}
		}
		catch (e) {
			Zotero.logError(e);
			this.el("status").textContent = String(e);
		}
		finally {
			this.running = false;
			this.el("import").disabled = false;
		}
	},

	setStatus(l10nID, args) {
		document.l10n.setAttributes(this.el("status"), l10nID, args);
	},

	addRow(label) {
		let li = document.createElement("li");
		let title = document.createElement("span");
		title.className = "title";
		let state = document.createElement("span");
		state.className = "state";
		let labelEl = document.createElement("span");
		labelEl.className = "label";
		labelEl.textContent = label;
		li.append(title, labelEl, state);
		this.el("results").append(li);
		li.scrollIntoView({ block: "nearest" });
		return li;
	},

	updateRow(li, result) {
		let [title, , state] = li.children;
		li.className = result.status;
		if (result.item) {
			title.textContent = result.item.getDisplayTitle();
			li.classList.add("selectable");
			title.onclick = () => this.showItem(result.item);
		}
		switch (result.status) {
			case "working":
				document.l10n.setAttributes(state, "teams-import-result-working");
				break;
			case "added":
				if (result.reason) {
					document.l10n.setAttributes(state, "teams-import-result-added-reason", { reason: result.reason });
				}
				else if (result.hasFile === undefined) {
					document.l10n.setAttributes(state, "teams-import-result-added");
				}
				else if (result.hasFile) {
					document.l10n.setAttributes(state, "teams-import-result-added-file");
				}
				else {
					document.l10n.setAttributes(state, "teams-import-result-added-nofile");
				}
				break;
			case "duplicate":
				document.l10n.setAttributes(state, "teams-import-result-duplicate", { reason: result.reason });
				break;
			case "failed":
				document.l10n.setAttributes(state, "teams-import-result-failed", { reason: result.reason });
				break;
		}
	},

	showItem(item) {
		let win = Zotero.getMainWindow();
		if (!win) return;
		win.ZoteroPane.selectItem(item.id);
		win.focus();
	},
};
