# Zotero paper import plugins

Two Zotero plugins that add papers to your library from links, skipping papers that are already
there and optionally downloading full text. They share the same import code but work on their own;
install either or both.

| Plugin | What it does |
|---|---|
| **Paper Link Import** | *Tools → Import Papers from Text…*: paste any text (chat or e-mail messages, web pages, reference lists) with links to papers, DOIs, arXiv or PubMed IDs, and import them. |
| **Teams Paper Import** | Watches a Microsoft Teams channel: a Power Automate flow saves each new message to a OneDrive folder, and the plugin imports the papers into a chosen library and collection, with a note linking back to the message. |

Built and checked against Zotero 10.0.4.

## Install

Download the `.xpi` you want from [Releases](https://github.com/Phlya/zotero-paper-import/releases)
(`paper-link-import-<version>.xpi` or `teams-import-<version>.xpi`), then in Zotero:
**Tools → Plugins → ⚙ → Install Plugin From File…** and pick it. Zotero checks for new versions and
updates installed plugins automatically.

## Paper Link Import

1. Select the library/collection to import into (like *Add Item by Identifier*).
2. **Tools → Import Papers from Text…**
3. Paste text with links, DOIs, `arXiv:` IDs or `PMID:`s. When the clipboard has formatting (copied
   from Teams, Outlook or a web page), links hidden behind words keep their addresses.
4. Tick *Download full text when available* if wanted, then **Import** (or ⌘↩).

Each reference is reported as *Added*, *Already in library (same DOI/arXiv ID/PMID/…/title)*,
*Skipped: not a paper* or *Failed*, with the reason. Click a title to select that item in Zotero.

Settings (**Settings → Paper Link Import**): default for downloading full text, a tag for new items
(none by default), whether an identical title counts as a duplicate, and whether to import only papers.

## Teams Paper Import

Setup, including the Power Automate flow: [docs/power-automate-setup.md](docs/power-automate-setup.md).
It covers top-level posts and replies in threads.

Settings (**Settings → Teams Import**): turn automatic import on/off, the inbox folder (empty means
`ZoteroInbox` in your OneDrive folder), the library (My Library or a group library) and collection
to save into, how often to check, and the same import options as above (new items are tagged
`teams-import` by default). **Tools → Check Teams Inbox Now** checks the folder immediately.

## How importing works

For each link or identifier in the text (`core/importer.js`):

1. **Parse** (`core/linkParser.js`): find links with or without `https://`, bare DOIs and labelled
   arXiv/PubMed IDs; unwrap Safe Links/redirects; drop Teams/SharePoint/image links; strip tracking
   parameters; and derive a DOI/arXiv/PMID/PMCID from the URL where possible (doi.org, Nature,
   bioRxiv/medRxiv, eLife, Science, PNAS, Wiley, PLOS, PubMed, PMC, arXiv, …). Elsevier links
   (ScienceDirect, Cell, Lancet) carry a PII and bioRxiv/medRxiv PDF links an article ID; both are
   turned into DOIs via Crossref.
2. **Duplicate check #1** (`core/dedup.js`) using only those identifiers and the URL, with no network.
3. **Resolve metadata** without saving: identifier lookup (Zotero's *Add by Identifier*
   translators) if there is an identifier, otherwise load the page in a hidden browser and run
   Zotero's web translators; if none match, use a DOI from the page's `citation_doi` meta tags.
   **PDF links** that none of this identifies are downloaded and passed to Zotero's
   *Retrieve Metadata for PDF*. If the resulting item is a duplicate it is removed again, and the
   PDF goes to the existing item if that has none. A PDF Zotero can't recognize is kept as a
   standalone PDF.
4. **Skip non-papers**: links that resolve to code, videos, news or web pages are skipped unless
   *Only import papers* is off.
5. **Duplicate check #2** with the resolved DOI/arXiv/PMID/URL and normalized title.
6. **Save** into the library/collection and tag it.
7. **Full text** (optional): Zotero's own *Find Full Text*, which uses translators, Unpaywall,
   any custom resolvers/proxy you've configured, and handles Elsevier's bot check itself
   (occasionally by asking you to click "verify").

Duplicates are checked within the target library only, ignoring items in the trash. Titles shorter
than 4 words are not used for matching.

## Repository layout

```
core/                       shared import code, copied into each plugin at build time
plugins/paper-link-import/  Paper Link Import (import dialog)
plugins/teams-import/       Teams Paper Import (inbox watcher, Teams message parsing)
test/                       unit tests for the Zotero-independent parts
scripts/                    release helpers
```

## Development

```sh
./test/run-tests.sh   # unit tests (uses node, or VS Code's Electron)
./build.sh            # → build/<plugin>-<version>.xpi for each plugin
```

Logging goes to Zotero's debug output (Help → Debug Output Logging), prefixed `Paper Link Import:`
or `Teams Import:`.

## Releasing

```sh
scripts/release.sh teams-import 0.7.0
scripts/release.sh paper-link-import 0.2.0
```

This sets the version in `plugins/<plugin>/manifest.json`, runs the tests, commits, tags
`<plugin>-v<version>` and pushes. The *Release* GitHub Actions workflow builds that plugin's `.xpi`
and publishes it. It also updates `updates.json` on the fixed
[`updates`](https://github.com/Phlya/zotero-paper-import/releases/tag/updates) release, which both
plugins' `update_url` point at: it lists the current version of every plugin, and each release
replaces only its own entry. (A fixed address is more predictable than GitHub's
`releases/latest/download/`, which can lag behind new releases. GitHub may also serve the previous
`updates.json` for a few minutes after a release.)

## License

MIT, see [LICENSE](LICENSE).
