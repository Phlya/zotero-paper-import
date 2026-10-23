/*
 * Pure helpers for turning Teams message text/HTML into paper references.
 * No Zotero dependencies, so this file can be unit-tested outside Zotero.
 */

var TeamsLinkParser = (function () {
	// Hosts whose links are never papers (Teams chrome, file shares, images, meeting links)
	const IGNORED_HOSTS = [
		/(^|\.)teams\.microsoft\.com$/,
		/(^|\.)teams\.cdn\.office\.net$/,
		/(^|\.)sharepoint\.com$/,
		/(^|\.)office\.com$/,
		/(^|\.)office365\.com$/,
		/(^|\.)live\.com$/,
		/(^|\.)zoom\.us$/,
		/(^|\.)giphy\.com$/,
	];

	const IGNORED_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|mp4|mov|zip|docx?|xlsx?|pptx?)$/i;

	const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|_hs\w+|ref|rss|via|cmp|campaign|sf\d+|featured_on|dgcid|elqTrack\w*)$/i;

	const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/;
	const ARXIV_NEW_RE = /^(\d{4}\.\d{4,5})(v\d+)?$/;
	const ARXIV_OLD_RE = /^([a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/i;
	// bioRxiv/medRxiv DOI prefixes: openRxiv's current one first, then the original Cold Spring Harbor one
	const PREPRINT_DOI_PREFIXES = ["10.64898", "10.1101"];
	// Elsevier PII, compact (S1097276526006593) or formatted (S0092-8674(26)01130-X)
	const PII_RE = /\b(S\d{4}-?\d{3}[\dX]\(?\d{2}\)?\d{5}-?[\dX])(?![\dA-Z])/i;

	function decodeEntities(s) {
		return s
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;|&apos;/g, "'")
			.replace(/&nbsp;/g, " ");
	}

	/**
	 * Drop trailing punctuation that is almost never part of a URL,
	 * keeping closing parens/brackets only when they're balanced inside the URL.
	 */
	function trimTrailing(url) {
		let prev;
		do {
			prev = url;
			url = url.replace(/[.,;:!?'"*>]+$/, "");
			for (let [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
				if (url.endsWith(close) && count(url, open) < count(url, close)) {
					url = url.slice(0, -1);
				}
			}
		} while (url !== prev);
		return url;
	}

	function count(s, ch) {
		return s.split(ch).length - 1;
	}

	function parseURL(url) {
		try {
			return new URL(url);
		}
		catch (e) {
			return null;
		}
	}

	/**
	 * Follow wrappers that hide the real destination in a query parameter
	 * (Outlook/Teams Safe Links, Google redirects, LinkedIn redirects).
	 */
	function unwrapURL(url) {
		for (let i = 0; i < 3; i++) {
			let u = parseURL(url);
			if (!u) return url;
			let host = u.hostname.toLowerCase();
			let inner = null;
			if (host.endsWith("safelinks.protection.outlook.com")) {
				inner = u.searchParams.get("url");
			}
			else if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === "/url") {
				inner = u.searchParams.get("q") || u.searchParams.get("url");
			}
			else if (host === "www.linkedin.com" && u.pathname.startsWith("/redir/redirect")) {
				inner = u.searchParams.get("url");
			}
			if (!inner) return url;
			url = inner;
		}
		return url;
	}

	function isIgnored(url) {
		let u = parseURL(url);
		if (!u || !/^https?:$/.test(u.protocol)) return true;
		let host = u.hostname.toLowerCase();
		if (IGNORED_HOSTS.some(re => re.test(host))) return true;
		// Don't ignore "/foo.pdf" etc. – only obvious non-paper media
		if (IGNORED_EXTENSIONS.test(u.pathname)) return true;
		return false;
	}

	/**
	 * Remove tracking parameters and fragments so the same link posted twice compares equal.
	 */
	function cleanURL(url) {
		let u = parseURL(url);
		if (!u) return url;
		u.hash = "";
		for (let key of [...u.searchParams.keys()]) {
			// split: ScienceDirect's "?via%3Dihub" decodes to a single key "via=ihub"
			if (TRACKING_PARAMS.test(key.split("=")[0])) u.searchParams.delete(key);
		}
		let s = u.toString();
		if (s.endsWith("?")) s = s.slice(0, -1);
		return s;
	}

	/**
	 * Key used to compare URLs: no scheme, no "www.", no trailing slash, lowercase host.
	 */
	function normalizeURL(url) {
		let u = parseURL(cleanURL(url));
		if (!u) return url.toLowerCase();
		let host = u.hostname.toLowerCase().replace(/^www\./, "");
		let path = u.pathname.replace(/\/+$/, "");
		return host + path + u.search;
	}

	function normalizeDOI(doi) {
		if (!doi) return null;
		let s = String(doi).trim();
		try {
			s = decodeURIComponent(s);
		}
		catch (e) {}
		s = s.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "");
		let m = s.match(DOI_RE);
		if (!m) return null;
		return m[1].toLowerCase();
	}

	/**
	 * Clean a DOI pulled out of a URL path: strip view suffixes, file extensions and
	 * bioRxiv/medRxiv version markers.
	 */
	function cleanDOIFromURL(doi) {
		doi = doi.replace(/[?#].*$/, "");
		doi = trimTrailing(doi);
		// Publisher view suffixes after the DOI, e.g. /full, /abstract, /pdf
		doi = doi.replace(/(?:\/(?:full|abstract|pdf|epdf|pdfdirect|html|meta|references|figures|tables|suppl\w*|citedby|metrics|info|share))+\/?$/i, "");
		doi = doi.replace(/\/+$/, "");
		// bioRxiv/medRxiv: 10.1101/2024.01.01.573000v1.full.pdf
		if (PREPRINT_DOI_PREFIXES.some(prefix => doi.startsWith(prefix + "/"))) {
			doi = doi.replace(/v\d+(?:[.+/].*)?$/i, "");
			doi = doi.replace(/\.(?:full|abstract|supplementary-material|article-info|article-metrics)(?:[.+].*)?$/i, "");
		}
		doi = doi.replace(/\.(?:pdf|html?|xml)$/i, "");
		return doi.toLowerCase();
	}

	function normalizeArXiv(id) {
		if (!id) return null;
		id = String(id).trim().replace(/^arxiv:\s*/i, "").replace(/\.pdf$/i, "");
		let m = id.match(ARXIV_NEW_RE) || id.match(ARXIV_OLD_RE);
		return m ? m[1].toLowerCase() : null;
	}

	/**
	 * Compact uppercase form of an Elsevier PII, as Crossref stores it ("S009286742601130X")
	 */
	function normalizePII(pii) {
		if (!pii) return null;
		let m = String(pii).match(PII_RE);
		return m ? m[1].replace(/[-()]/g, "").toUpperCase() : null;
	}

	/**
	 * Formatted form used in cell.com/thelancet.com URLs ("S0092-8674(26)01130-X")
	 */
	function formatPII(pii) {
		pii = normalizePII(pii);
		if (!pii) return null;
		return `${pii.slice(0, 5)}-${pii.slice(5, 9)}(${pii.slice(9, 11)})${pii.slice(11, 16)}-${pii.slice(16)}`;
	}

	/**
	 * Work out a lookup identifier from a URL without fetching it.
	 * @return {{DOI?: string, arXiv?: string, PMID?: string, PMCID?: string, PII?: string, preprintID?: string}}
	 */
	function identifiersFromURL(url) {
		let u = parseURL(url);
		if (!u) return {};
		let host = u.hostname.toLowerCase().replace(/^www\./, "");
		let path = u.pathname;
		let m;

		// arXiv: /abs/2401.12345v2, /pdf/2401.12345v2(.pdf), /html/2401.12345v1, old style /abs/hep-th/9901001
		if (host === "arxiv.org" || host === "export.arxiv.org") {
			m = path.match(/^\/(?:abs|pdf|html|format)\/(.+?)\/?$/);
			let id = m && normalizeArXiv(m[1]);
			if (id) return { arXiv: id };
		}

		// PubMed
		if (host === "pubmed.ncbi.nlm.nih.gov") {
			m = path.match(/^\/(\d{1,9})\/?$/);
			if (m) return { PMID: m[1] };
		}
		if (host === "ncbi.nlm.nih.gov") {
			m = path.match(/^\/pubmed\/(\d{1,9})\/?$/);
			if (m) return { PMID: m[1] };
		}

		// PubMed Central
		if (host === "pmc.ncbi.nlm.nih.gov" || host === "ncbi.nlm.nih.gov" || host === "europepmc.org") {
			m = path.match(/\/(PMC\d+)\b/i);
			if (m) return { PMCID: m[1].toUpperCase() };
		}

		// eLife: /articles/12345 -> 10.7554/eLife.12345
		if (host === "elifesciences.org") {
			m = path.match(/^\/(?:articles|reviewed-preprints)\/(\d+)\b/);
			if (m) return { DOI: "10.7554/elife." + m[1] };
		}

		// Nature portfolio: /articles/s41586-024-07000-1 -> 10.1038/s41586-024-07000-1
		if (host === "nature.com") {
			m = path.match(/^\/articles\/([a-z0-9.\-]+?)(?:\.pdf)?\/?$/i);
			if (m) return { DOI: "10.1038/" + m[1].toLowerCase() };
		}

		// Any DOI in the path (doi.org, bioRxiv, Science, PNAS, Wiley, ACS, T&F, Cell's /doi/ links, ...)
		let decodedPath;
		try {
			decodedPath = decodeURIComponent(path);
		}
		catch (e) {
			decodedPath = path;
		}
		m = decodedPath.match(DOI_RE);
		if (m) {
			let doi = cleanDOIFromURL(m[1]);
			if (normalizeDOI(doi)) return { DOI: doi };
		}

		// DOI in the query string, e.g. journals.plos.org/plosone/article?id=10.1371/journal.pone.0123456
		for (let value of u.searchParams.values()) {
			m = value.match(DOI_RE);
			if (m) {
				let doi = cleanDOIFromURL(m[1]);
				if (normalizeDOI(doi)) return { DOI: doi };
			}
		}

		// bioRxiv/medRxiv links without a DOI, e.g. direct PDF links like
		// /content/biorxiv/early/2026/10/16/2026.10.14.759128.full.pdf. The DOI prefix can't be
		// told from the URL, so the ID is resolved against PREPRINT_DOI_PREFIXES at import time.
		if (/(^|\.)(biorxiv|medrxiv)\.org$/.test(host)) {
			m = path.match(/\/(\d{4}\.\d{2}\.\d{2}\.\d{5,})(?:v\d+)?(?=[./]|$)/)
				|| path.match(/\/early\/\d{4}\/\d{2}\/\d{2}\/(\d{5,})(?:v\d+)?(?=[./]|$)/);
			if (m) return { preprintID: m[1] };
		}

		// Elsevier PII (ScienceDirect, Cell Press, The Lancet, society journals hosted by Elsevier),
		// e.g. /science/article/pii/S1097276526006593, /cell/abstract/S0092-8674(26)01130-X,
		// /journals/lancet/article/PIIS0140-6736(24)00001-1/fulltext
		let pii = normalizePII(decodedPath.replace(/\/PII(?=S\d)/gi, "/"));
		if (pii) return { PII: pii };

		return {};
	}

	/**
	 * Extract candidate paper references from a Teams message (HTML or plain text).
	 *
	 * Returns one entry per distinct paper reference, in order of appearance:
	 *   { url?: string, ids: { DOI?, arXiv?, PMID?, PMCID? }, source: string }
	 * `source` is the original text that produced the entry, for reporting.
	 */
	function extractReferences(input) {
		let text = String(input || "");
		let urls = [];

		// Only real tags: plain text may contain "<https://...>"
		if (/<\/?(a|p|div|span|br|at|img|li|ul|ol|b|i|em|strong|blockquote|attachment)\b[^>]*>/i.test(text)) {
			// Prefer hrefs: Teams often shortens the visible link text
			for (let m of text.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
				urls.push(decodeEntities(m[2] ?? m[3]));
			}
			text = decodeEntities(text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, " "));
		}
		for (let m of text.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) {
			urls.push(m[0]);
		}

		let refs = [];
		let seen = new Set();
		let add = (ref) => {
			let keys = [];
			if (ref.ids.DOI) keys.push("doi:" + ref.ids.DOI);
			if (ref.ids.arXiv) keys.push("arxiv:" + ref.ids.arXiv);
			if (ref.ids.PMID) keys.push("pmid:" + ref.ids.PMID);
			if (ref.ids.PMCID) keys.push("pmcid:" + ref.ids.PMCID);
			if (ref.ids.PII) keys.push("pii:" + ref.ids.PII);
			if (ref.ids.preprintID) keys.push("preprint:" + ref.ids.preprintID);
			if (!keys.length && ref.url) keys.push("url:" + normalizeURL(ref.url));
			if (keys.some(k => seen.has(k))) return;
			keys.forEach(k => seen.add(k));
			refs.push(ref);
		};

		for (let raw of urls) {
			let url = cleanURL(unwrapURL(trimTrailing(raw.trim())));
			if (isIgnored(url)) continue;
			add({ url, ids: identifiersFromURL(url), source: raw });
		}

		// Bare identifiers in the text that weren't part of a URL
		let textWithoutURLs = text.replace(/\bhttps?:\/\/[^\s<>"'`]+/gi, " ");
		for (let m of textWithoutURLs.matchAll(/(?:\bdoi:\s*)?\b10\.\d{4,9}\/[^\s"<>]+/gi)) {
			let doi = normalizeDOI(trimTrailing(m[0]));
			if (doi) add({ ids: { DOI: doi }, source: m[0] });
		}
		for (let m of textWithoutURLs.matchAll(/\barxiv:\s*([a-z\-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/gi)) {
			let id = normalizeArXiv(m[1]);
			if (id) add({ ids: { arXiv: id }, source: m[0] });
		}
		for (let m of textWithoutURLs.matchAll(/\bPMID:?\s*(\d{1,9})\b/gi)) {
			add({ ids: { PMID: m[1] }, source: m[0] });
		}

		return refs;
	}

	/**
	 * Comparison key for titles: case-, accent-, punctuation- and whitespace-insensitive.
	 */
	function normalizeTitle(title) {
		if (!title) return "";
		return String(title)
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/<[^>]+>/g, "")
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();
	}

	/**
	 * Pull identifiers out of translator/Zotero item JSON (fields + Extra lines).
	 */
	function identifiersFromItemJSON(json) {
		let ids = {};
		let extra = json.extra || "";
		let doi = normalizeDOI(json.DOI) || normalizeDOI((extra.match(/^\s*DOI:\s*(\S+)/im) || [])[1]);
		if (doi) ids.DOI = doi;
		let arXiv = normalizeArXiv(json.archiveID)
			|| normalizeArXiv((extra.match(/^\s*arXiv:\s*(\S+)/im) || [])[1])
			|| (json.url && identifiersFromURL(json.url).arXiv);
		if (!arXiv && ids.DOI) {
			let m = ids.DOI.match(/^10\.48550\/arxiv\.(.+)$/);
			if (m) arXiv = normalizeArXiv(m[1]);
		}
		if (arXiv) ids.arXiv = arXiv;
		let pmid = (extra.match(/^\s*PMID:\s*(\d+)/im) || [])[1];
		if (pmid) ids.PMID = pmid;
		let pmcid = (extra.match(/^\s*PMCID:\s*(PMC\d+)/im) || [])[1];
		if (pmcid) ids.PMCID = pmcid.toUpperCase();
		return ids;
	}

	function htmlToText(html) {
		return decodeEntities(String(html || "")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|li|blockquote)>/gi, "\n")
			.replace(/<[^>]+>/g, ""))
			.replace(/[ \t]+/g, " ")
			.replace(/\s*\n\s*/g, "\n")
			.trim();
	}

	function escapeHTML(s) {
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	/**
	 * Read a Teams channel message as written by the Power Automate flow: the Graph
	 * chatMessage from "When a new channel message is added", either as-is or wrapped in
	 * { body: ... } (if the flow saved triggerOutputs() instead of triggerBody()).
	 *
	 * @return {{id, author, created, url, html, text, skip}} `text` is what to scan for links;
	 *     `skip` is true for system/deleted messages
	 */
	function parseTeamsMessage(json) {
		// The trigger itself only delivers a change notification ({ value: [{ resourceData, messageId,
		// linkToMessage, ... }] }) without the message text; the flow needs "Get message details" for that
		let list = json && Array.isArray(json.value) ? json.value : null;
		if (list && list.length && list.every(v => v && v.resourceData && !v.body)) {
			let e = new Error("The file contains only a Teams change notification, not the message");
			e.notificationOnly = true;
			e.linkToMessage = list[0].linkToMessage || null;
			throw e;
		}
		if (list && list.length === 1) json = list[0];
		let msg = json && json.body && json.body.body && typeof json.body.body === "object" ? json.body : json;
		if (!msg || typeof msg !== "object" || !msg.body) throw new Error("Not a Teams message");
		let html = (msg.body && msg.body.content) || "";
		// Link previews and cards can carry URLs outside the body
		let extra = (msg.attachments || [])
			.map(a => [a.contentUrl, typeof a.content === "string" ? a.content : JSON.stringify(a.content || "")].filter(Boolean).join(" "))
			.join("\n");
		return {
			id: msg.id || null,
			author: (msg.from && msg.from.user && msg.from.user.displayName) || null,
			created: msg.createdDateTime || null,
			url: msg.webUrl || msg.linkToMessage || null,
			html,
			text: extra ? html + "\n" + extra : html,
			skip: (msg.messageType && msg.messageType !== "message") || !!msg.deletedDateTime,
		};
	}

	/**
	 * Child note recording where a paper came from
	 */
	function messageToNoteHTML(message, { maxLength = 2000 } = {}) {
		let by = [
			message.author && `by ${escapeHTML(message.author)}`,
			message.created && `on ${escapeHTML(message.created.slice(0, 10))}`,
		].filter(Boolean).join(" ");
		let text = htmlToText(message.html);
		if (text.length > maxLength) text = text.slice(0, maxLength) + "…";
		let link = message.url ? `<br/><a href="${escapeHTML(message.url)}">Open message in Teams</a>` : "";
		return `<p><strong>Posted in Teams</strong>${by ? " " + by : ""}${link}</p>`
			+ (text ? `<blockquote><p>${escapeHTML(text).replace(/\n/g, "<br/>")}</p></blockquote>` : "");
	}

	return {
		extractReferences,
		parseTeamsMessage,
		messageToNoteHTML,
		htmlToText,
		identifiersFromURL,
		identifiersFromItemJSON,
		unwrapURL,
		cleanURL,
		normalizeURL,
		normalizeDOI,
		normalizeArXiv,
		normalizePII,
		PREPRINT_DOI_PREFIXES,
		formatPII,
		normalizeTitle,
		isIgnored,
	};
})();

if (typeof module !== "undefined") {
	module.exports = TeamsLinkParser;
}
