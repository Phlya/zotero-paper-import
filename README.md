# Teams Paper Import (Zotero plugin)

Imports papers linked in Microsoft Teams messages into Zotero, skipping papers that are
already in the library, and optionally downloading full text.

Two ways in:

- **Automatic**: a Power Automate flow saves each new channel message to a OneDrive folder, and
  the plugin imports the papers from there into the library and collection chosen in
  *Settings → Teams Import* (My Library or a group library), with a note linking back to the message. Setup: [docs/power-automate-setup.md](docs/power-automate-setup.md).
- **Manual**: paste message text, links, DOIs or arXiv IDs into *Tools → Import Papers from Teams Text…*.

Built and checked against Zotero 10.0.4.

## Install

```sh
./build.sh          # → build/teams-import-0.6.0.xpi
```

In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…** and pick the `.xpi`.

## Use

1. Select the library/collection to import into (like *Add Item by Identifier*).
2. **Tools → Import Papers from Teams Text…**
3. Paste one or more Teams messages (copied text or HTML), links, DOIs, `arXiv:` IDs or `PMID:`s.
4. Tick *Download full text when available* if wanted, then **Import** (or ⌘↩).

Each reference is reported as *Added*, *Already in library (same DOI/arXiv ID/PMID/PMCID/URL/title)*
or *Failed*. Click a title to select that item in Zotero. New items get the tag `teams-import`.

## How it works

For each link or identifier in the text:

1. **Parse** (`content/linkParser.js`): unwrap Safe Links/redirects, drop Teams/SharePoint/image
   links, strip tracking parameters, and derive a DOI/arXiv/PMID/PMCID from the URL where possible
   (doi.org, Nature, bioRxiv/medRxiv, eLife, Science, PNAS, Wiley, PLOS, PubMed, PMC, arXiv, …).
   Elsevier links (ScienceDirect, Cell, Lancet) carry a PII, which is turned into a DOI via
   Crossref because those sites block automated page loads.
2. **Duplicate check #1** (`content/dedup.js`) using only those identifiers and the URL — no network.
3. **Resolve metadata** without saving: identifier lookup (Zotero's *Add by Identifier*
   translators) if there is an identifier, otherwise load the page in a hidden browser and run
   Zotero's web translators; if none match, use a DOI from the page's `citation_doi` meta tags.
   **PDF links** that none of this identifies are downloaded and passed to Zotero's
   *Retrieve Metadata for PDF*, which creates the item from the file itself (usually from the DOI
   printed on it). If that item turns out to be a duplicate it is removed again, and the PDF goes
   to the existing item if that has none. A PDF Zotero can't recognize is kept as a standalone PDF.
4. **Duplicate check #2** with the resolved DOI/arXiv/PMID/URL and normalized title.
5. **Save** into the selected library/collection and tag it.
6. **Full text** (optional): Zotero's own *Find Full Text* (`Zotero.Attachments.addAvailableFiles`),
   which uses translators, Unpaywall and any custom resolvers/proxy you've configured.

Duplicate checks ignore items in the trash. Titles shorter than 4 words are not used for matching.

## Elsevier links

ScienceDirect, cell.com and thelancet.com answer automated page loads with a Cloudflare bot
challenge, so the plugin never loads them for metadata: it takes the article's PII from the link
and looks up the DOI in Crossref. Full text then comes from Zotero's own *Find Full Text*, which
handles Elsevier's challenge itself (occasionally by asking you to click "verify").

## Preferences

Under **Settings → Teams Import**, or in the Config Editor:

| Pref | Default | |
|---|---|---|
| `extensions.teams-import.fetchFullText` | `true` | Default for the full-text checkbox (remembered) |
| `extensions.teams-import.tag` | `teams-import` | Tag added to new items (empty = none) |
| `extensions.teams-import.matchTitles` | `true` | Treat an identical title as a duplicate |
| `extensions.teams-import.autoImport` | `true` | Watch the inbox folder |
| `extensions.teams-import.inboxPath` | *(empty)* | Inbox folder; empty = `ZoteroInbox` in the OneDrive folder |
| `extensions.teams-import.targetLibrary` | `user` | Library for automatic imports: `user` or `group:<groupID>` |
| `extensions.teams-import.targetCollection` | *(empty)* | Collection key in that library (empty = library root) |
| `extensions.teams-import.scanIntervalMinutes` | `5` | How often to check the folder |

## Development

```sh
./test/run-tests.sh   # unit tests for linkParser.js (links, identifiers, Teams messages) (uses node, or VS Code's Electron)
./build.sh
```

Logging goes to Zotero's debug output (Help → Debug Output Logging), prefixed `Teams Import:`.
