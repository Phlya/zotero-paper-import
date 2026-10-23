/* global Zotero, ChromeUtils, TeamsLinkParser, TeamsDedup */

var TeamsImport = {
	id: null,
	version: null,
	rootURI: null,
	_menuKeys: [],

	PREF_PREFIX: "extensions.teams-import.",
	PAGE_LOAD_TIMEOUT: 30000,

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
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
		Zotero.debug("Teams Import: " + msg);
	},

	registerMenus() {
		let key = Zotero.MenuManager.registerMenu({
			menuID: "teams-import-tools",
			pluginID: this.id,
			target: "main/menubar/tools",
			menus: [{
				menuType: "menuitem",
				l10nID: "teams-import-menu-import-text",
				onCommand: () => this.openDialog(Zotero.getMainWindow()),
			}, {
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
			"chrome://teams-import/content/importDialog.xhtml",
			"teams-import-dialog",
			"chrome,centerscreen,resizable,dialog=no",
			{ plugin: this, target: this.getTarget(win) }
		);
	},

	/**
	 * Import every paper referenced in a block of text/HTML.
	 *
	 * @param {String} text
	 * @param {Object} options
	 * @param {Number} options.libraryID
	 * @param {Number} [options.collectionID]
	 * @param {Boolean} [options.fetchFullText]
	 * @param {Function} [options.onProgress] - called with each result as it completes
	 * @return {Promise<Object[]>} One result per reference:
	 *     { label, status: "added" | "duplicate" | "failed", item?, reason? }
	 */
	async importText(text, { libraryID, collectionID = null, fetchFullText = false, onProgress = () => {} }) {
		let refs = TeamsLinkParser.extractReferences(text);
		this.log(`Found ${refs.length} references`);
		onProgress({ phase: "start", total: refs.length });

		let results = [];
		for (let [index, ref] of refs.entries()) {
			let label = ref.url || ref.source;
			onProgress({ phase: "item", index, label, status: "working" });
			let result;
			try {
				result = await this.importReference(ref, { libraryID, collectionID });
			}
			catch (e) {
				Zotero.logError(e);
				result = { status: "failed", reason: e.message || String(e) };
			}
			result.label = label;
			results.push(result);
			onProgress({ phase: "item", index, ...result });
		}

		let added = results.filter(r => r.status === "added" && r.item.isRegularItem() && !r.hasFile).map(r => r.item);
		if (fetchFullText && added.length) {
			onProgress({ phase: "fulltext", total: added.length });
			let outcomes = await this.findFullText(added);
			for (let result of results) {
				if (result.status !== "added") continue;
				Object.assign(result, outcomes.get(result.item.id));
				onProgress({ phase: "item", index: results.indexOf(result), ...result });
			}
		}

		onProgress({ phase: "done", results });
		return results;
	},

	/**
	 * Check for an existing copy, resolve metadata, check again, then save.
	 */
	async importReference(ref, { libraryID, collectionID }) {
		// Elsevier sites (ScienceDirect, Cell, Lancet) block automated page loads,
		// so get the DOI for the PII from Crossref instead of loading the page
		if (ref.ids.PII && !ref.ids.DOI) {
			try {
				let doi = await this.doiFromPII(ref.ids.PII);
				if (doi) ref.ids = Object.assign({}, ref.ids, { DOI: doi });
			}
			catch (e) {
				this.log(`Crossref PII lookup failed for ${ref.ids.PII}: ${e}`);
			}
		}
		// bioRxiv/medRxiv links without a DOI: find which DOI prefix the ID is registered under
		if (ref.ids.preprintID && !ref.ids.DOI) {
			try {
				let doi = await this.doiFromPreprintID(ref.ids.preprintID);
				if (doi) ref.ids = Object.assign({}, ref.ids, { DOI: doi });
			}
			catch (e) {
				this.log(`Crossref preprint lookup failed for ${ref.ids.preprintID}: ${e}`);
			}
		}

		// 1. Cheap check with identifiers visible in the link itself, before any network request
		let existing = await TeamsDedup.findExisting(libraryID, { ids: ref.ids, url: ref.url });
		if (existing) {
			return { status: "duplicate", item: existing.item, reason: existing.reason };
		}

		// 2. Resolve metadata without saving
		// Zotero's translators read article pages, not PDFs, so don't load a PDF link as a page
		let { DOI, arXiv, PMID, PMCID } = ref.ids;
		let pdfLink = !!ref.url && !(DOI || arXiv || PMID || PMCID) && /\.pdf(?:$|[?#])/i.test(ref.url);
		let json = pdfLink ? null : await this.resolve(ref);
		if (!json) {
			if (ref.url && (pdfLink || await isPDFURL(ref.url))) {
				return this.importPDF(ref.url, { libraryID, collectionID });
			}
			return { status: "failed", reason: "no metadata found" };
		}

		// 3. Check again with what the translator found (DOI, title, ...)
		let ids = TeamsLinkParser.identifiersFromItemJSON(json);
		existing = await TeamsDedup.findExisting(libraryID, {
			ids,
			url: json.url,
			title: this.getPref("matchTitles") ? json.title : null,
		});
		if (existing) {
			return { status: "duplicate", item: existing.item, reason: existing.reason };
		}

		// 4. Save
		let item = await this.save(json, { libraryID, collectionID });
		return { status: "added", item };
	},

	/**
	 * @return {Promise<Object|null>} Translator item JSON, unsaved
	 */
	async resolve(ref) {
		let { DOI, arXiv, PMID } = ref.ids;
		if (DOI || arXiv || PMID) {
			try {
				let json = await this.translateIdentifier(DOI ? { DOI } : arXiv ? { arXiv } : { PMID });
				if (json) return json;
			}
			catch (e) {
				this.log(`Identifier lookup failed for ${JSON.stringify(ref.ids)}: ${e}`);
			}
		}
		if (ref.url) {
			try {
				return await this.translateURL(ref.url);
			}
			catch (e) {
				if (e.status === 403) {
					throw new Error(ref.ids.PII
						? "the site blocks automated access and Crossref doesn't list this article yet"
						: "the site blocks automated access (HTTP 403)");
				}
				throw e;
			}
		}
		return null;
	},

	/**
	 * bioRxiv/medRxiv moved from 10.1101 to openRxiv's 10.64898 prefix, and their direct PDF
	 * links don't include either, so ask Crossref which one exists
	 */
	async doiFromPreprintID(id) {
		for (let prefix of TeamsLinkParser.PREPRINT_DOI_PREFIXES) {
			let doi = `${prefix}/${id}`;
			let xhr = await Zotero.HTTP.request("GET", "https://api.crossref.org/works/" + doi + "/agency",
				{ responseType: "json", timeout: 15000, successCodes: [200, 404] });
			if (xhr.status === 200) {
				this.log(`Preprint ${id} → ${doi}`);
				return doi;
			}
		}
		this.log(`Preprint ${id}: no DOI found`);
		return null;
	},

	/**
	 * Look up the DOI for an Elsevier PII in Crossref, which stores PIIs as "alternative-id"
	 */
	async doiFromPII(pii) {
		let url = "https://api.crossref.org/works?rows=1&select=DOI&filter=alternative-id:"
			+ encodeURIComponent(pii);
		let xhr = await Zotero.HTTP.request("GET", url, { responseType: "json", timeout: 15000 });
		let doi = TeamsLinkParser.normalizeDOI(xhr.response?.message?.items?.[0]?.DOI);
		this.log(`PII ${pii} → ${doi || "no DOI"}`);
		return doi;
	},

	async translateIdentifier(identifier) {
		let translate = new Zotero.Translate.Search();
		translate.setIdentifier(identifier);
		let translators = await translate.getTranslators();
		if (!translators.length) return null;
		translate.setTranslator(translators);
		let items = await translate.translate({ libraryID: false, saveAttachments: false });
		return items[0] || null;
	},

	/**
	 * Load the page in a hidden browser and run Zotero's web translators on it.
	 * Falls back to a DOI in the page's meta tags if no translator matches.
	 */
	async translateURL(url) {
		const { HiddenBrowser } = ChromeUtils.importESModule("chrome://zotero/content/HiddenBrowser.mjs");
		const { RemoteTranslate } = ChromeUtils.importESModule("chrome://zotero/content/RemoteTranslate.mjs");

		let browser = new HiddenBrowser();
		let translate = new RemoteTranslate();
		try {
			await withTimeout(browser.load(url, { requireSuccessfulStatus: true }), this.PAGE_LOAD_TIMEOUT, "page load");
			await withTimeout(browser.waitForDocument({ allowInteractiveAfter: 3000 }), this.PAGE_LOAD_TIMEOUT, "page load");
			await translate.setBrowser(browser);
			let translators = await translate.detect();
			if (translators && translators.length) {
				let items = await translate.translate({ libraryID: false });
				if (items && items.length) return items[0];
			}

			let { documentHTML } = await browser.getPageData(["documentHTML"]);
			let doi = doiFromMetaTags(documentHTML || "");
			if (doi) {
				this.log(`No translator for ${url}; using DOI ${doi} from page metadata`);
				return this.translateIdentifier({ DOI: doi });
			}
			return null;
		}
		finally {
			translate.dispose();
			browser.destroy();
		}
	},

	/**
	 * Zotero's own "Find Full Text" (translators, Unpaywall, custom resolvers, and its built-in
	 * handling of Elsevier's bot check), throttled per domain
	 *
	 * @param {Zotero.Item[]} items - Regular items
	 * @return {Promise<Map<Number, {hasFile: Boolean}>>} By item ID
	 */
	async findFullText(items) {
		await Zotero.Attachments.addAvailableFiles(items);
		let outcomes = new Map();
		for (let item of items) {
			outcomes.set(item.id, { hasFile: !!(await item.getBestAttachment()) });
		}
		return outcomes;
	},

	async save(json, { libraryID, collectionID }) {
		// Snapshots and PDF links from the translator are skipped; full text is fetched separately
		json = Object.assign({}, json, { attachments: [] });
		let saver = new Zotero.Translate.ItemSaver({
			libraryID,
			collections: collectionID ? [collectionID] : false,
			attachmentMode: Zotero.Translate.ItemSaver.ATTACHMENT_MODE_IGNORE,
			forceTagType: 1,
		});
		let items = await saver.saveItems([json], () => {});
		let item = items.find(i => i.isRegularItem());
		if (!item) throw new Error("Item could not be saved");

		await this.tagItem(item);
		this.log(`Saved item ${item.libraryKey}`);
		return item;
	},

	async tagItem(item) {
		let tag = this.getPref("tag");
		if (tag) {
			item.addTag(tag);
			await item.saveTx();
		}
	},

	/**
	 * Fallback for PDF links nothing else could identify: save the PDF and let Zotero's
	 * "Retrieve Metadata for PDF" create the item from the file (usually from the DOI printed on it)
	 */
	async importPDF(url, { libraryID, collectionID }) {
		this.log(`Importing ${url} as a PDF and recognizing it`);
		let attachment = await Zotero.Attachments.importFromURL({
			libraryID,
			url,
			collections: collectionID ? [collectionID] : undefined,
			contentType: "application/pdf",
		});
		if (!attachment.isPDFAttachment()) {
			// Created a moment ago by this import, so remove it entirely
			await attachment.eraseTx();
			return { status: "failed", reason: "the link didn't return a PDF" };
		}

		// Creates a parent item in the attachment's collections and moves the PDF under it;
		// failures only show in Zotero's recognition progress list
		await Zotero.RecognizeDocument.recognizeItems([attachment]);
		let parent = attachment.parentItem;
		if (!parent) {
			// Keep the PDF rather than lose the paper
			return { status: "added", item: attachment, reason: "Zotero couldn't recognize the PDF; saved it without metadata" };
		}

		let existing = await TeamsDedup.findExisting(libraryID, {
			ids: TeamsDedup.itemIdentifiers(parent),
			title: this.getPref("matchTitles") ? parent.getField("title") : null,
		}, { excludeItemIDs: [parent.id] });
		if (existing) {
			// Undo this import (both items were created a moment ago), but give the existing
			// item the PDF if it doesn't have one yet
			if (await existing.item.getBestAttachment()) {
				await attachment.eraseTx();
			}
			else {
				attachment.parentID = existing.item.id;
				await attachment.saveTx();
			}
			await parent.eraseTx();
			return { status: "duplicate", item: existing.item, reason: existing.reason };
		}

		await this.tagItem(parent);
		this.log(`Recognized PDF as ${parent.libraryKey}`);
		return { status: "added", item: parent, hasFile: true };
	},
};

async function isPDFURL(url) {
	try {
		let [mimeType] = await Zotero.MIME.getMIMETypeFromURL(url);
		return mimeType === "application/pdf";
	}
	catch (e) {
		return false;
	}
}

// The bootstrap scope has no window timers, so use Zotero.Promise.delay
function withTimeout(promise, ms, what) {
	return Promise.race([
		promise,
		Zotero.Promise.delay(ms).then(() => {
			throw new Error(`Timed out waiting for ${what}`);
		}),
	]);
}

function doiFromMetaTags(html) {
	let re = /<meta\s[^>]*name\s*=\s*["'](?:citation_doi|dc\.identifier|prism\.doi|bepress_citation_doi)["'][^>]*>/gi;
	for (let tag of html.match(re) || []) {
		let content = (tag.match(/content\s*=\s*["']([^"']+)["']/i) || [])[1];
		let doi = content && TeamsLinkParser.normalizeDOI(content);
		if (doi) return doi;
	}
	return null;
}
