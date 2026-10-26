/* global Zotero, LinkParser */

/*
 * Find items already in a library that match a paper reference.
 *
 * Each lookup uses a broad Zotero.Search ("contains") to get candidates and then
 * verifies them exactly with the normalizers in LinkParser, so e.g. DOI
 * 10.1/abc doesn't match 10.1/abcd. Trashed items are ignored (Zotero.Search's default).
 */

var Dedup = (function () {
	const P = LinkParser;

	// Titles this short are too generic to treat a match as a duplicate ("Editorial", "Correction")
	const MIN_TITLE_WORDS = 4;

	async function searchCandidates(libraryID, conditions) {
		if (!conditions.length) return [];
		let s = new Zotero.Search();
		s.libraryID = libraryID;
		s.addCondition("joinMode", "any");
		for (let [field, value] of conditions) {
			s.addCondition(field, "contains", value);
		}
		let ids = await s.search();
		let items = await Zotero.Items.getAsync(ids);
		// A matching attachment URL (e.g. the PDF link) counts for its parent item
		let topLevel = new Map();
		for (let item of items) {
			if (item.isAnnotation?.()) continue;
			let top = item.parentItem || item;
			topLevel.set(top.id, top);
		}
		return [...topLevel.values()];
	}

	function field(item, name) {
		try {
			return item.getField(name) || "";
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * Identifiers for an existing item, including its child attachments' URLs.
	 */
	function itemIdentifiers(item) {
		let ids = P.identifiersFromItemJSON({
			DOI: field(item, "DOI"),
			extra: field(item, "extra"),
			archiveID: field(item, "archiveID"),
			url: field(item, "url"),
		});
		let urls = [field(item, "url")];
		if (item.isRegularItem()) {
			for (let att of Zotero.Items.get(item.getAttachments())) {
				urls.push(field(att, "url"));
			}
		}
		urls = urls.filter(Boolean);
		for (let url of urls) {
			let fromURL = P.identifiersFromURL(url);
			for (let key of Object.keys(fromURL)) {
				if (!ids[key]) ids[key] = fromURL[key];
			}
		}
		ids.urls = new Set(urls.map(P.normalizeURL));
		return ids;
	}

	function titleKeyword(normalizedTitle) {
		// The longest word is the most selective "contains" filter
		return normalizedTitle.split(" ").reduce((a, b) => (b.length > a.length ? b : a), "");
	}

	/**
	 * @param {Number} libraryID
	 * @param {Object} ref
	 * @param {Object} [ref.ids] - { DOI, arXiv, PMID, PMCID, PII }
	 * @param {String} [ref.url]
	 * @param {String} [ref.title]
	 * @param {Object} [options]
	 * @param {Number[]} [options.excludeItemIDs] - Items not to count, e.g. one just created
	 * @return {Promise<{item: Zotero.Item, reason: String} | null>}
	 */
	async function findExisting(libraryID, { ids = {}, url, title } = {}, { excludeItemIDs = [] } = {}) {
		let conditions = [];
		if (ids.DOI) {
			conditions.push(["DOI", ids.DOI], ["extra", ids.DOI], ["url", ids.DOI]);
		}
		if (ids.arXiv) {
			conditions.push(["archiveID", ids.arXiv], ["extra", ids.arXiv], ["url", ids.arXiv],
				["DOI", "10.48550/arxiv." + ids.arXiv]);
		}
		if (ids.PMID) {
			conditions.push(["extra", ids.PMID], ["url", ids.PMID]);
		}
		if (ids.PMCID) {
			conditions.push(["extra", ids.PMCID], ["url", ids.PMCID]);
		}
		if (ids.PII) {
			// ScienceDirect URLs use the compact form, cell.com/thelancet.com the formatted one
			conditions.push(["url", ids.PII], ["url", P.formatPII(ids.PII)]);
		}
		let normURL = url && P.normalizeURL(url);
		if (normURL) {
			// Search on the path; the host may differ in scheme/www
			let path = normURL.slice(normURL.indexOf("/"));
			conditions.push(["url", path.length > 5 ? path : normURL]);
		}
		let normTitle = P.normalizeTitle(title);
		let useTitle = normTitle.split(" ").length >= MIN_TITLE_WORDS;
		if (useTitle) {
			conditions.push(["title", titleKeyword(normTitle)]);
		}

		let candidates = (await searchCandidates(libraryID, conditions))
			.filter(item => !excludeItemIDs.includes(item.id));

		// Strongest evidence first, so the reported reason is the most meaningful one
		let checks = [
			["DOI", c => ids.DOI && c.DOI === ids.DOI],
			["arXiv ID", c => ids.arXiv && c.arXiv === ids.arXiv],
			["PMID", c => ids.PMID && c.PMID === ids.PMID],
			["PMCID", c => ids.PMCID && c.PMCID === ids.PMCID],
			["PII", c => ids.PII && c.PII === ids.PII],
			["URL", c => normURL && c.urls.has(normURL)],
		];
		let candidateIDs = candidates.map(item => [item, itemIdentifiers(item)]);
		for (let [reason, matches] of checks) {
			for (let [item, c] of candidateIDs) {
				if (matches(c)) return { item, reason };
			}
		}
		if (useTitle) {
			for (let item of candidates) {
				if (P.normalizeTitle(field(item, "title")) === normTitle) {
					return { item, reason: "title" };
				}
			}
		}
		return null;
	}

	return { findExisting, itemIdentifiers };
})();
