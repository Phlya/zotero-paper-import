const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../core/linkParser.js");

test("identifiersFromURL: DOIs from publisher URLs", () => {
	let cases = {
		"https://doi.org/10.1038/s41586-024-07000-1": { DOI: "10.1038/s41586-024-07000-1" },
		"https://dx.doi.org/10.1016/S0092-8674(00)80001-1": { DOI: "10.1016/s0092-8674(00)80001-1" },
		"https://www.nature.com/articles/s41586-024-07000-1": { DOI: "10.1038/s41586-024-07000-1" },
		"https://www.nature.com/articles/s41467-023-12345-6.pdf": { DOI: "10.1038/s41467-023-12345-6" },
		"https://www.biorxiv.org/content/10.1101/2024.01.15.575000v2": { DOI: "10.1101/2024.01.15.575000" },
		"https://www.biorxiv.org/content/10.1101/2024.01.15.575000v1.full.pdf": { DOI: "10.1101/2024.01.15.575000" },
		"https://www.biorxiv.org/content/10.1101/2024.01.15.575000v1.full": { DOI: "10.1101/2024.01.15.575000" },
		"https://www.medrxiv.org/content/10.1101/2023.11.02.23297000v1.abstract": { DOI: "10.1101/2023.11.02.23297000" },
		"https://www.science.org/doi/10.1126/science.adk1234": { DOI: "10.1126/science.adk1234" },
		"https://www.science.org/doi/full/10.1126/science.adk1234": { DOI: "10.1126/science.adk1234" },
		"https://www.pnas.org/doi/10.1073/pnas.2300000120": { DOI: "10.1073/pnas.2300000120" },
		"https://onlinelibrary.wiley.com/doi/epdf/10.1002/anie.202312345": { DOI: "10.1002/anie.202312345" },
		"https://onlinelibrary.wiley.com/doi/10.1002/anie.202312345/full": { DOI: "10.1002/anie.202312345" },
		"https://www.embopress.org/doi/full/10.15252/embj.2023114000": { DOI: "10.15252/embj.2023114000" },
		"https://www.cell.com/action/showPdf?pii=S0092-8674(24)00001-0&doi=10.1016/j.cell.2024.01.001": { DOI: "10.1016/j.cell.2024.01.001" },
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0291234": { DOI: "10.1371/journal.pone.0291234" },
		"https://elifesciences.org/articles/87654": { DOI: "10.7554/elife.87654" },
		"https://elifesciences.org/reviewed-preprints/91234": { DOI: "10.7554/elife.91234" },
		"https://academic.oup.com/nar/article/52/1/1/7000000?doi=10.1093%2Fnar%2Fgkad1000": { DOI: "10.1093/nar/gkad1000" },
	};
	for (let [url, expected] of Object.entries(cases)) {
		assert.deepEqual(P.identifiersFromURL(url), expected, url);
	}
});

test("identifiersFromURL: arXiv, PubMed, PMC", () => {
	assert.deepEqual(P.identifiersFromURL("https://arxiv.org/abs/2401.12345v3"), { arXiv: "2401.12345" });
	assert.deepEqual(P.identifiersFromURL("https://arxiv.org/pdf/2401.12345v1.pdf"), { arXiv: "2401.12345" });
	assert.deepEqual(P.identifiersFromURL("https://arxiv.org/pdf/2401.12345"), { arXiv: "2401.12345" });
	assert.deepEqual(P.identifiersFromURL("https://arxiv.org/html/2401.12345v1"), { arXiv: "2401.12345" });
	assert.deepEqual(P.identifiersFromURL("https://arxiv.org/abs/hep-th/9901001"), { arXiv: "hep-th/9901001" });
	assert.deepEqual(P.identifiersFromURL("https://pubmed.ncbi.nlm.nih.gov/38012345/"), { PMID: "38012345" });
	assert.deepEqual(P.identifiersFromURL("https://www.ncbi.nlm.nih.gov/pubmed/38012345"), { PMID: "38012345" });
	assert.deepEqual(P.identifiersFromURL("https://pmc.ncbi.nlm.nih.gov/articles/PMC10765432/"), { PMCID: "PMC10765432" });
	assert.deepEqual(P.identifiersFromURL("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10765432/"), { PMCID: "PMC10765432" });
	assert.deepEqual(P.identifiersFromURL("https://europepmc.org/article/PMC/PMC10765432"), { PMCID: "PMC10765432" });
});

test("identifiersFromURL: bioRxiv/medRxiv under both DOI prefixes, and links without a DOI", () => {
	let cases = {
		"https://www.biorxiv.org/content/10.64898/2026.10.14.759128v1": { DOI: "10.64898/2026.10.14.759128" },
		"https://www.biorxiv.org/content/10.64898/2026.10.14.759128v2.full.pdf": { DOI: "10.64898/2026.10.14.759128" },
		"https://www.medrxiv.org/content/10.64898/2026.09.01.12345678v1.abstract": { DOI: "10.64898/2026.09.01.12345678" },
		// Direct PDF links carry only the ID; the prefix is resolved via Crossref at import time
		"https://www.biorxiv.org/content/biorxiv/early/2026/10/16/2026.10.14.759128.full.pdf": { preprintID: "2026.10.14.759128" },
		"https://www.biorxiv.org/content/biorxiv/early/2026/10/16/2026.10.14.759128v2.full.pdf": { preprintID: "2026.10.14.759128" },
		"https://www.biorxiv.org/content/early/2018/05/01/312345.full.pdf": { preprintID: "312345" },
		"https://www.biorxiv.org/collection/genomics": {},
	};
	for (let [url, expected] of Object.entries(cases)) {
		assert.deepEqual(P.identifiersFromURL(url), expected, url);
	}
});

test("identifiersFromURL: Elsevier PIIs", () => {
	let cases = {
		"https://www.cell.com/cell/abstract/S0092-8674(26)01130-X": "S009286742601130X",
		"https://www.cell.com/cell/fulltext/S0092-8674(24)00001-0": "S0092867424000010",
		"https://www.cell.com/molecular-cell/fulltext/S1097-2765(26)00659-3?rss=yes": "S1097276526006593",
		"https://www.sciencedirect.com/science/article/pii/S1097276526006593": "S1097276526006593",
		"https://www.sciencedirect.com/science/article/abs/pii/S1097276526006593?via%3Dihub": "S1097276526006593",
		"https://linkinghub.elsevier.com/retrieve/pii/S1097276526006593": "S1097276526006593",
		"https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(24)00001-1/fulltext": "S0140673624000011",
	};
	for (let [url, pii] of Object.entries(cases)) {
		assert.deepEqual(P.identifiersFromURL(url), { PII: pii }, url);
	}
});

test("normalizePII / formatPII", () => {
	assert.equal(P.normalizePII("S0092-8674(26)01130-X"), "S009286742601130X");
	assert.equal(P.normalizePII("s009286742601130x"), "S009286742601130X");
	assert.equal(P.formatPII("S009286742601130X"), "S0092-8674(26)01130-X");
	assert.equal(P.formatPII("S1097276526006593"), "S1097-2765(26)00659-3");
	assert.equal(P.normalizePII("S12345"), null);
});

test("extractReferences: Elsevier links", () => {
	let refs = P.extractReferences(`New: https://www.cell.com/cell/abstract/S0092-8674(26)01130-X
and https://www.sciencedirect.com/science/article/pii/S1097276526006593
again https://www.cell.com/molecular-cell/fulltext/S1097-2765(26)00659-3`);
	assert.deepEqual(refs.map(r => r.ids), [{ PII: "S009286742601130X" }, { PII: "S1097276526006593" }]);
});

test("identifiersFromURL: no identifier", () => {
	assert.deepEqual(P.identifiersFromURL("https://github.com/zotero/zotero"), {});
	assert.deepEqual(P.identifiersFromURL("not a url"), {});
});

test("unwrapURL: Safe Links and redirects", () => {
	let target = "https://www.nature.com/articles/s41586-024-07000-1";
	let safe = "https://eur02.safelinks.protection.outlook.com/?url=" + encodeURIComponent(target)
		+ "&data=05%7C02%7C&sdata=abc&reserved=0";
	assert.equal(P.unwrapURL(safe), target);
	assert.equal(P.unwrapURL("https://www.google.com/url?q=" + encodeURIComponent(target) + "&sa=D"), target);
	assert.equal(P.unwrapURL(target), target);
});

test("cleanURL / normalizeURL", () => {
	assert.equal(
		P.cleanURL("https://www.sciencedirect.com/science/article/pii/S0092867424000010?via%3Dihub&utm_source=x#sec1"),
		"https://www.sciencedirect.com/science/article/pii/S0092867424000010"
	);
	assert.equal(
		P.normalizeURL("http://www.Example.org/a/b/?utm_medium=x"),
		P.normalizeURL("https://example.org/a/b")
	);
	// Meaningful query parameters are kept
	assert.equal(
		P.cleanURL("https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0291234"),
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0291234"
	);
});

test("normalizeDOI", () => {
	assert.equal(P.normalizeDOI("https://doi.org/10.1038/S41586-024-07000-1"), "10.1038/s41586-024-07000-1");
	assert.equal(P.normalizeDOI("doi: 10.1101/2024.01.15.575000"), "10.1101/2024.01.15.575000");
	assert.equal(P.normalizeDOI("10.1093%2Fnar%2Fgkad1000"), "10.1093/nar/gkad1000");
	assert.equal(P.normalizeDOI("nonsense"), null);
	assert.equal(P.normalizeDOI(""), null);
});

test("normalizeTitle ignores case, accents, punctuation and markup", () => {
	assert.equal(
		P.normalizeTitle("Single-cell <i>RNA</i>-seq of the Müller glia: A Résumé!"),
		P.normalizeTitle("single cell RNA seq of the muller glia a resume")
	);
	assert.notEqual(P.normalizeTitle("Cell atlas of the mouse"), P.normalizeTitle("Cell atlas of the human"));
});

test("identifiersFromItemJSON", () => {
	assert.deepEqual(
		P.identifiersFromItemJSON({ DOI: "10.1038/S41586-024-07000-1", extra: "PMID: 38012345\nPMCID: PMC10765432" }),
		{ DOI: "10.1038/s41586-024-07000-1", PMID: "38012345", PMCID: "PMC10765432" }
	);
	assert.deepEqual(
		P.identifiersFromItemJSON({ DOI: "10.48550/arXiv.2401.12345", archiveID: "arXiv:2401.12345", url: "http://arxiv.org/abs/2401.12345v2" }),
		{ DOI: "10.48550/arxiv.2401.12345", arXiv: "2401.12345" }
	);
	assert.deepEqual(P.identifiersFromItemJSON({ extra: "DOI: 10.1101/2024.01.15.575000" }), { DOI: "10.1101/2024.01.15.575000" });
	assert.deepEqual(P.identifiersFromItemJSON({ title: "x" }), {});
});

test("extractReferences: Teams HTML message", () => {
	let html = `<div><p>Nice paper from the Smith lab:
		<a href="https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.biorxiv.org%2Fcontent%2F10.1101%2F2024.01.15.575000v1&amp;data=05">https://www.biorxiv.org/content/10.1101/2024.01.15.575000v1</a></p>
		<p>and the published version https://doi.org/10.1038/s41586-024-07000-1.</p>
		<p><at id="0">Jane</at> see <a href="https://teams.microsoft.com/l/message/19:abc">this thread</a></p>
		<img src="https://us-api.asm.skype.com/v1/objects/0-weu-d1/views/imgo"></div>`;
	let refs = P.extractReferences(html);
	assert.deepEqual(refs.map(r => r.ids), [
		{ DOI: "10.1101/2024.01.15.575000" },
		{ DOI: "10.1038/s41586-024-07000-1" },
	]);
	assert.equal(refs[0].url, "https://www.biorxiv.org/content/10.1101/2024.01.15.575000v1");
});

test("extractReferences: plain text with URLs, bare DOIs, arXiv and PMIDs", () => {
	let text = `Two papers today:
(1) https://www.cell.com/cell/fulltext/S0092-8674(24)00001-0, very cool
(2) doi:10.1126/science.adk1234.
Also arXiv:2401.12345v2 and PMID: 38012345
Same as before: https://doi.org/10.1126/science.adk1234
Slides: https://fmich.sharepoint.com/sites/lab/slides.pptx
Figure: https://example.org/figure.png`;
	let refs = P.extractReferences(text);
	assert.deepEqual(refs.map(r => r.url || r.ids), [
		"https://www.cell.com/cell/fulltext/S0092-8674(24)00001-0",
		// (a PII; resolved to a DOI via Crossref at import time)
		"https://doi.org/10.1126/science.adk1234",
		{ arXiv: "2401.12345" },
		{ PMID: "38012345" },
	]);
});

test("extractReferences: trailing punctuation and wrapping parens", () => {
	let refs = P.extractReferences("see (https://en.wikipedia.org/wiki/Foo_(bar)) and <https://example.org/paper>.");
	assert.deepEqual(refs.map(r => r.url), [
		"https://en.wikipedia.org/wiki/Foo_(bar)",
		"https://example.org/paper",
	]);
});

test("extractReferences: empty input", () => {
	assert.deepEqual(P.extractReferences(""), []);
	assert.deepEqual(P.extractReferences("no links here"), []);
});

test("extractReferences: links without https://, as Teams displays them", () => {
	let refs = P.extractReferences(`Two papers:
www.biorxiv.org/content/10.64898/2026.10.14.759128v1
nature.com/articles/s41586-024-07000-1.
Not links: a@fmi.ch/x, version 1.2/3, file.txt/`);
	assert.deepEqual(refs.map(r => [r.url, r.ids]), [
		["https://www.biorxiv.org/content/10.64898/2026.10.14.759128v1", { DOI: "10.64898/2026.10.14.759128" }],
		["https://nature.com/articles/s41586-024-07000-1", { DOI: "10.1038/s41586-024-07000-1" }],
	]);
	// The same link with and without https:// counts once
	assert.equal(P.extractReferences("https://www.nature.com/articles/s41586-024-07000-1 www.nature.com/articles/s41586-024-07000-1").length, 1);
});

test("extractReferences: bare preprint DOIs lose their version suffix", () => {
	assert.deepEqual(P.extractReferences("doi: 10.64898/2026.10.14.759128v2.").map(r => r.ids), [{ DOI: "10.64898/2026.10.14.759128" }]);
});

test("htmlToTextWithLinks keeps addresses of links hidden behind words", () => {
	let html = '<html><head><style>p{color:red}</style></head><body><!--StartFragment-->'
		+ '<p>Look at <a href="https://www.nature.com/articles/s41586-024-07000-1">this paper</a> and '
		+ '<a href="https://www.biorxiv.org/content/10.64898/2026.10.14.759128v1">www.biorxiv.org/content/10.64898/2026.10.14.759128v1</a> &amp; more</p>'
		+ '<!--EndFragment--></body></html>';
	let text = P.htmlToTextWithLinks(html);
	assert.equal(text, "Look at this paper <https://www.nature.com/articles/s41586-024-07000-1> and https://www.biorxiv.org/content/10.64898/2026.10.14.759128v1 & more");
	assert.deepEqual(P.extractReferences(text).map(r => r.ids), [
		{ DOI: "10.1038/s41586-024-07000-1" },
		{ DOI: "10.64898/2026.10.14.759128" },
	]);
});
