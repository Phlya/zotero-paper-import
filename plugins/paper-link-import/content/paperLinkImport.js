/* global Zotero, Importer, LinkParser */

var PaperLinkImport = {
	id: null,
	version: null,
	rootURI: null,
	_menuKeys: [],

	PREF_PREFIX: "extensions.paper-link-import.",

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		Importer.logPrefix = "Paper Link Import";
	},

	shutdown() {
		for (let key of this._menuKeys) {
			Zotero.MenuManager.unregisterMenu(key);
		}
		this._menuKeys = [];
	},

	getPref(name) {
		return Zotero.Prefs.get(this.PREF_PREFIX + name, true);
	},

	setPref(name, value) {
		Zotero.Prefs.set(this.PREF_PREFIX + name, value, true);
	},

	registerMenus() {
		let key = Zotero.MenuManager.registerMenu({
			menuID: "paper-link-import-tools",
			pluginID: this.id,
			target: "main/menubar/tools",
			menus: [{
				menuType: "menuitem",
				l10nID: "paper-link-import-menu-import-text",
				onCommand: () => this.openDialog(Zotero.getMainWindow()),
			}],
		});
		if (key) this._menuKeys.push(key);
	},

	registerPrefPane() {
		Zotero.PreferencePanes.register({
			pluginID: this.id,
			src: this.rootURI + "content/preferences.xhtml",
			label: "Paper Link Import",
		});
	},

	/**
	 * Library and collection to save into: the current selection, like Zotero's "Add Item by Identifier"
	 */
	getTarget(win) {
		let pane = win.ZoteroPane;
		let libraryID = pane.getSelectedLibraryID();
		let library = libraryID && Zotero.Libraries.get(libraryID);
		if (!library || !library.editable || library.libraryType === "feed") {
			libraryID = Zotero.Libraries.userLibraryID;
			library = Zotero.Libraries.get(libraryID);
			return { libraryID, collectionID: null, label: library.name };
		}
		let collection = pane.getSelectedCollection();
		return {
			libraryID,
			collectionID: collection ? collection.id : null,
			label: collection ? `${library.name} › ${collection.name}` : library.name,
		};
	},

	openDialog(win) {
		win.openDialog(
			"chrome://paper-link-import/content/importDialog.xhtml",
			"paper-link-import-dialog",
			"chrome,centerscreen,resizable,dialog=no",
			{ plugin: this, target: this.getTarget(win) }
		);
	},

	/**
	 * For the import dialog's paste handler, which runs outside this scope
	 */
	htmlToTextWithLinks(html) {
		return LinkParser.htmlToTextWithLinks(html);
	},

	/**
	 * Import papers from text with this plugin's settings
	 *
	 * @param {String} text
	 * @param {Object} options - { libraryID, collectionID, fetchFullText, onProgress }
	 */
	importText(text, options) {
		return Importer.importText(text, Object.assign({
			tag: this.getPref("tag"),
			matchTitles: !!this.getPref("matchTitles"),
			paperTypesOnly: !!this.getPref("paperTypesOnly"),
		}, options));
	},
};
