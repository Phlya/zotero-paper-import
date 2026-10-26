/* global Zotero, Services, Importer, TeamsInbox */

var TeamsImport = {
	id: null,
	version: null,
	rootURI: null,
	_menuKeys: [],

	PREF_PREFIX: "extensions.teams-import.",

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		Importer.logPrefix = "Teams Import";
	},

	shutdown() {
		for (let key of this._menuKeys) {
			Zotero.MenuManager.unregisterMenu(key);
		}
		this._menuKeys = [];
		for (let symbol of this._prefObservers || []) {
			Zotero.Prefs.unregisterObserver(symbol);
		}
		this._prefObservers = [];
	},

	getPref(name) {
		return Zotero.Prefs.get(this.PREF_PREFIX + name, true);
	},

	setPref(name, value) {
		Zotero.Prefs.set(this.PREF_PREFIX + name, value, true);
	},

	log(msg) {
		Importer.log(msg);
	},

	registerMenus() {
		let key = Zotero.MenuManager.registerMenu({
			menuID: "teams-import-tools",
			pluginID: this.id,
			target: "main/menubar/tools",
			menus: [{
				menuType: "menuitem",
				l10nID: "teams-import-menu-check-inbox",
				onCommand: () => TeamsInbox.scan({ interactive: true }),
			}],
		});
		if (key) this._menuKeys.push(key);
	},

	/**
	 * Restart the inbox watcher when its settings change
	 */
	observePrefs() {
		this._prefObservers = ["autoImport", "scanIntervalMinutes"].map(name => Zotero.Prefs.registerObserver(
			this.PREF_PREFIX + name,
			() => TeamsInbox.start(),
			true
		));
	},

	/**
	 * Import papers from a message with this plugin's settings
	 *
	 * @param {String} text
	 * @param {Object} target - { libraryID, collectionID }
	 */
	importText(text, { libraryID, collectionID }) {
		return Importer.importText(text, {
			libraryID,
			collectionID,
			fetchFullText: !!this.getPref("fetchFullText"),
			tag: this.getPref("tag"),
			matchTitles: !!this.getPref("matchTitles"),
			paperTypesOnly: !!this.getPref("paperTypesOnly"),
		});
	},

	/**
	 * Libraries are stored in prefs as "user" or "group:<groupID>", because group IDs stay the
	 * same across devices and re-syncs while local library IDs don't
	 */
	libraryIDFromPref(value) {
		let m = /^group:(\d+)$/.exec(value || "");
		if (!m) return Zotero.Libraries.userLibraryID;
		try {
			return Zotero.Groups.getLibraryIDFromGroupID(parseInt(m[1])) || null;
		}
		catch (e) {
			return null;
		}
	},

	libraryPrefValue(libraryID) {
		let library = Zotero.Libraries.get(libraryID);
		return library.libraryType === "group"
			? "group:" + Zotero.Groups.getGroupIDFromLibraryID(libraryID)
			: "user";
	},

	/**
	 * Fill the library and collection pickers in Settings → Teams Import
	 * (called from the pane's onload)
	 */
	initPrefPane(root) {
		let doc = root.ownerDocument;
		let libraryList = doc.getElementById("teams-import-library");
		let collectionList = doc.getElementById("teams-import-collection");
		const NEW_COLLECTION = "__new__";

		let addItem = (popup, value, { label, l10nID } = {}) => {
			let item = doc.createXULElement("menuitem");
			item.value = value;
			if (label) item.setAttribute("label", label);
			if (l10nID) doc.l10n.setAttributes(item, l10nID);
			popup.append(item);
		};
		let select = (list, value) => {
			list.value = value;
			if (list.selectedIndex === -1) list.selectedIndex = 0;
		};

		let libraries = Zotero.Libraries.getAll()
			.filter(l => (l.libraryType === "user" || l.libraryType === "group") && l.editable && !l.archived);
		libraryList.menupopup.replaceChildren();
		for (let library of libraries) {
			addItem(libraryList.menupopup, this.libraryPrefValue(library.libraryID), { label: library.name });
		}
		select(libraryList, this.getPref("targetLibrary") || "user");

		let fillCollections = () => {
			let libraryID = this.libraryIDFromPref(libraryList.value);
			let popup = collectionList.menupopup;
			popup.replaceChildren();
			addItem(popup, "", { l10nID: "teams-import-prefs-collection-none" });
			for (let collection of Zotero.Collections.getByLibrary(libraryID, true)) {
				// Indent subcollections
				addItem(popup, collection.key, { label: " ".repeat(collection.level) + collection.name });
			}
			popup.append(doc.createXULElement("menuseparator"));
			addItem(popup, NEW_COLLECTION, { l10nID: "teams-import-prefs-collection-new" });
			select(collectionList, this.getPref("targetCollection") || "");
		};
		fillCollections();

		libraryList.addEventListener("command", () => {
			this.setPref("targetLibrary", libraryList.value);
			this.setPref("targetCollection", "");
			fillCollections();
		});
		collectionList.addEventListener("command", async () => {
			if (collectionList.value !== NEW_COLLECTION) {
				this.setPref("targetCollection", collectionList.value);
				return;
			}
			let name = { value: "" };
			let ok = Services.prompt.prompt(
				doc.defaultView,
				"Teams Import",
				await doc.l10n.formatValue("teams-import-prefs-collection-new-prompt"),
				name, null, {}
			);
			if (ok && name.value.trim()) {
				let collection = new Zotero.Collection();
				collection.libraryID = this.libraryIDFromPref(libraryList.value);
				collection.name = name.value.trim();
				await collection.saveTx();
				this.setPref("targetCollection", collection.key);
			}
			fillCollections();
		});
	},

	registerPrefPane() {
		Zotero.PreferencePanes.register({
			pluginID: this.id,
			src: this.rootURI + "content/preferences.xhtml",
			label: "Teams Import",
		});
	},
};
