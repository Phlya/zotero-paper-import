/* global Zotero, Services, Ci, IOUtils, PathUtils, TeamsLinkParser, TeamsImport, setInterval, clearInterval, setTimeout, clearTimeout */

/*
 * Watches a folder (synced from OneDrive) where a Power Automate flow saves each new Teams
 * channel message as <message id>.json, and imports the papers they link to.
 *
 * Processed files are moved to processed/; files that can't be read for an hour go to failed/.
 */

var TeamsInbox = {
	_interval: null,
	_startTimer: null,
	_scanning: null,
	_warnedTarget: false,
	_warnedFormat: false,

	STARTUP_DELAY: 30 * 1000,
	UNREADABLE_GRACE: 60 * 60 * 1000,

	start() {
		this.stop();
		if (!TeamsImport.getPref("autoImport")) {
			TeamsImport.log("Automatic import is off");
			return;
		}
		let minutes = Math.max(1, parseInt(TeamsImport.getPref("scanIntervalMinutes")) || 5);
		// Let Zotero finish starting up before the first scan
		this._startTimer = setTimeout(() => this.scan(), this.STARTUP_DELAY);
		this._interval = setInterval(() => this.scan(), minutes * 60 * 1000);
		TeamsImport.log(`Watching Teams inbox every ${minutes} min`);
	},

	stop() {
		if (this._startTimer) clearTimeout(this._startTimer);
		if (this._interval) clearInterval(this._interval);
		this._startTimer = this._interval = null;
	},

	/**
	 * The configured folder, or ZoteroInbox in the first OneDrive folder found
	 */
	getInboxPath() {
		let configured = (TeamsImport.getPref("inboxPath") || "").trim();
		if (configured) return configured;
		// macOS: ~/Library/CloudStorage/OneDrive-<organization>
		let dir = Services.dirsvc.get("Home", Ci.nsIFile);
		dir.append("Library");
		dir.append("CloudStorage");
		if (!dir.exists()) return null;
		for (let entry of dir.directoryEntries) {
			let file = entry.QueryInterface(Ci.nsIFile);
			if (file.isDirectory() && file.leafName.startsWith("OneDrive")) {
				return PathUtils.join(file.path, "ZoteroInbox");
			}
		}
		return null;
	},

	/**
	 * @param {Object} [options]
	 * @param {Boolean} [options.interactive] - Report the outcome even when nothing was found
	 */
	async scan({ interactive = false } = {}) {
		// Don't start a second scan while one is running
		if (this._scanning) return this._scanning;
		this._scanning = this._scan({ interactive }).finally(() => {
			this._scanning = null;
		});
		return this._scanning;
	},

	async _scan({ interactive }) {
		let inbox = this.getInboxPath();
		if (!inbox || !(await IOUtils.exists(inbox))) {
			TeamsImport.log(`Teams inbox not found: ${inbox}`);
			if (interactive) {
				this.notify("Teams inbox not found", [inbox
					? `Folder doesn't exist yet: ${inbox}`
					: "No OneDrive folder found. Set the folder in Settings → Teams Import."]);
			}
			return;
		}

		let children = await IOUtils.getChildren(inbox);
		let files = children.filter(path => path.toLowerCase().endsWith(".json")).sort();
		if (!files.length) {
			if (interactive) this.notify("Teams inbox", ["No new messages"]);
			return;
		}
		TeamsImport.log(`${files.length} message file(s) in ${inbox}`);

		let target = this.getTarget();
		if (target.error) {
			// Leave the messages in the inbox until the settings are fixed; say so once per session
			TeamsImport.log(target.error);
			if (interactive || !this._warnedTarget) {
				this._warnedTarget = true;
				this.notify("Teams inbox not imported", [target.error]);
			}
			return;
		}
		this._warnedTarget = false;
		let totals = { added: [], duplicates: 0, failed: [], messages: 0 };
		for (let path of files) {
			try {
				let results = await this.processFile(path, inbox, target);
				if (!results) continue;
				totals.messages++;
				totals.added.push(...results.filter(r => r.status === "added"));
				totals.duplicates += results.filter(r => r.status === "duplicate").length;
				totals.failed.push(...results.filter(r => r.status === "failed"));
			}
			catch (e) {
				Zotero.logError(e);
			}
		}

		if (totals.added.length || totals.failed.length || interactive) {
			let lines = totals.added.map(r => r.reason ? `${r.item.getDisplayTitle()} (${r.reason})` : r.item.getDisplayTitle());
			if (totals.duplicates) lines.push(`${totals.duplicates} already in library`);
			for (let failure of totals.failed) {
				lines.push(`Couldn't import ${failure.label}: ${failure.reason}`);
			}
			if (!lines.length) lines.push(`${totals.messages} message(s), no new papers`);
			this.notify(`Teams: added ${totals.added.length} paper${totals.added.length === 1 ? "" : "s"} to “${target.label}”`, lines);
		}
	},

	/**
	 * @return {Promise<Object[]|null>} Import results, or null if the file was skipped for now
	 */
	async processFile(path, inbox, target) {
		let json;
		try {
			json = JSON.parse(await IOUtils.readUTF8(path));
		}
		catch (e) {
			// OneDrive may still be writing the file; give it time before giving up
			let { lastModified } = await IOUtils.stat(path);
			if (Date.now() - lastModified > this.UNREADABLE_GRACE) {
				TeamsImport.log(`Can't read ${path}, moving to failed/: ${e}`);
				await this.moveTo(path, inbox, "failed");
			}
			return null;
		}

		let message;
		try {
			message = TeamsLinkParser.parseTeamsMessage(json);
		}
		catch (e) {
			// Readable but not a message: the flow is set up wrong, so waiting won't help
			TeamsImport.log(`${path} is not a Teams message, moving to failed/: ${e}`);
			await this.moveTo(path, inbox, "failed");
			if (!this._warnedFormat) {
				this._warnedFormat = true;
				this.notify("Teams inbox: message text missing", e.notificationOnly
					? ["The Power Automate flow saved only a notification, without the message.",
						"Add a “Get message details” step to the flow (see docs/power-automate-setup.md).",
						"The file was moved to ZoteroInbox/failed/."]
					: [`Unexpected file format: ${PathUtils.filename(path)} (moved to ZoteroInbox/failed/)`]);
			}
			return null;
		}

		let key = message.id || PathUtils.filename(path);
		let results = [];
		if (!message.skip) {
			TeamsImport.log(`Importing message ${key} from ${message.author}`);
			results = await TeamsImport.importText(message.text, {
				libraryID: target.libraryID,
				collectionID: target.collectionID,
				fetchFullText: !!TeamsImport.getPref("fetchFullText"),
			});
			for (let result of results) {
				// A PDF Zotero couldn't recognize stays standalone, and those can't have notes
				if (result.status === "added" && result.item.isRegularItem()) {
					await this.addSourceNote(result.item, message);
				}
			}
		}
		await this.moveTo(path, inbox, "processed");
		return results;
	},

	async addSourceNote(item, message) {
		let note = new Zotero.Item("note");
		note.libraryID = item.libraryID;
		note.parentID = item.id;
		note.setNote(TeamsLinkParser.messageToNoteHTML(message));
		await note.saveTx();
	},

	async moveTo(path, inbox, subdir) {
		let dir = PathUtils.join(inbox, subdir);
		await IOUtils.makeDirectory(dir, { ignoreExisting: true });
		await IOUtils.move(path, PathUtils.join(dir, PathUtils.filename(path)));
	},

	/**
	 * The library and collection chosen in Settings → Teams Import
	 *
	 * @return {{libraryID, collectionID, label} | {error: String}}
	 */
	getTarget() {
		let libraryPref = TeamsImport.getPref("targetLibrary");
		let libraryID = TeamsImport.libraryIDFromPref(libraryPref);
		let library = libraryID && Zotero.Libraries.get(libraryID);
		if (!library) {
			return { error: `The library chosen in Settings → Teams Import (${libraryPref}) no longer exists.` };
		}
		if (!library.editable) {
			return { error: `You can't add items to “${library.name}”. Choose another library in Settings → Teams Import.` };
		}
		let key = TeamsImport.getPref("targetCollection");
		if (!key) {
			return { libraryID, collectionID: null, label: library.name };
		}
		let collection = Zotero.Collections.getByLibraryAndKey(libraryID, key);
		if (!collection || collection.deleted) {
			return { error: `The collection chosen in Settings → Teams Import no longer exists in “${library.name}”.` };
		}
		return { libraryID, collectionID: collection.id, label: `${library.name} › ${collection.name}` };
	},

	notify(headline, lines) {
		let pw = new Zotero.ProgressWindow();
		pw.changeHeadline(headline);
		for (let line of lines.slice(0, 8)) {
			pw.addDescription(line);
		}
		pw.show();
		pw.startCloseTimer(10000);
	},
};
