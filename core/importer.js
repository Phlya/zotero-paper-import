/* global Zotero, ChromeUtils, LinkParser, Dedup */

/*
 * Import the papers referenced in a block of text: resolve each link or identifier to metadata,
 * skip papers already in the library, save the rest and optionally find their full text.
 * Shared by both plugins; each passes its own settings in the options.
 */

var Importer = {
	// Set by the plugin, e.g. "Teams Import"
	logPrefix: "Paper import",
	PAGE_LOAD_TIMEOUT: 30000,

	log(msg) {
		Zotero.debug(`${this.logPrefix}: ${msg}`);
	},

	/**
	 * Import every paper referenced in a block of text/HTML.
	 *
	 * @param {String} text
	 * @param {Object} options
	 * @param {Number} options.libraryID
	 * @param {Number} [options.collectionID]
	 * @param {Boolean} [options.fetchFullText] - Find full text for new items
	 * @param {String} [options.tag] - Tag for new items
	 * @param {Boolean} [options.matchTitles] - Treat an identical title as a duplicate
	 * @param {Boolean} [options.paperTypesOnly] - Skip items that aren't papers
	 * @param {Function} [options.onProgress] - called with each result as it completes
	 * @return {Promise<Object[]>} One result per reference:
	 *     { label, status: "added" | "duplicate" | "skipped" | "failed", item?, reason? }
	 */
	async importText(text, options) {
		options = Object.assign({ collectionID: null, fetchFullText: false, onProgress: () => {} }, options);
		let { fetchFullText, onProgress } = options;
		let refs = LinkParser.extractReferences(text);
		this.log(`Found ${refs.length} references`);
		onProgress({ phase: "start", total: refs.length });

		let results = [];
		for (let [index, ref] of refs.entries()) {
			let label = ref.url || ref.source;
			onProgress({ phase: "item", index, label, status: "working" });
			let result;
			try {
				result = await this.importReference(ref, options);
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
	async importReference(ref, options) {
		let { libraryID } = options;
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
		let existing = await Dedup.findExisting(libraryID, { ids: ref.ids, url: ref.url });
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
				return this.importPDF(ref.url, options);
			}
			return { status: "failed", reason: "no metadata found" };
		}

		// Links to code, videos, news etc. resolve to items too; keep only papers unless disabled
		if (options.paperTypesOnly && !PAPER_ITEM_TYPES.includes(json.itemType)) {
			let type = json.itemType;
			try {
				type = Zotero.ItemTypes.getLocalizedString(json.itemType);
			}
			catch (e) {}
			return { status: "skipped", reason: `not a paper (${type})` };
		}

		// 3. Check again with what the translator found (DOI, title, ...)
		let ids = LinkParser.identifiersFromItemJSON(json);
		existing = await Dedup.findExisting(libraryID, {
			ids,
			url: json.url,
			title: options.matchTitles ? json.title : null,
		});
		if (existing) {
			return { status: "duplicate", item: existing.item, reason: existing.reason };
		}

		// 4. Save
		let item = await this.save(json, options);
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
		for (let prefix of LinkParser.PREPRINT_DOI_PREFIXES) {
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
		let doi = LinkParser.normalizeDOI(xhr.response?.message?.items?.[0]?.DOI);
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

	async save(json, { libraryID, collectionID, tag }) {
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

		await this.tagItem(item, tag);
		this.log(`Saved item ${item.libraryKey}`);
		return item;
	},

	async tagItem(item, tag) {
		if (tag) {
			item.addTag(tag);
			await item.saveTx();
		}
	},

	/**
	 * Fallback for PDF links nothing else could identify: save the PDF and let Zotero's
	 * "Retrieve Metadata for PDF" create the item from the file (usually from the DOI printed on it)
	 */
	async importPDF(url, { libraryID, collectionID, tag, matchTitles }) {
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

		let existing = await Dedup.findExisting(libraryID, {
			ids: Dedup.itemIdentifiers(parent),
			title: matchTitles ? parent.getField("title") : null,
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

		await this.tagItem(parent, tag);
		this.log(`Recognized PDF as ${parent.libraryKey}`);
		return { status: "added", item: parent, hasFile: true };
	},
};

// Item types kept when "Only import papers" is on
const PAPER_ITEM_TYPES = ["journalArticle", "preprint", "book", "bookSection", "conferencePaper", "thesis", "report", "manuscript"];

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
		let doi = content && LinkParser.normalizeDOI(content);
		if (doi) return doi;
	}
	return null;
}
