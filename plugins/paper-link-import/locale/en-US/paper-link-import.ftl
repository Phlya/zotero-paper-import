paper-link-import-menu-import-text =
    .label = Import Papers from Text…

paper-link-import-dialog-window =
    .title = Import Papers from Text
paper-link-import-intro = Paste any text with links to papers, DOIs, arXiv IDs or PubMed IDs, e.g. from a chat, an e-mail or a web page. Papers already in the library are skipped.
paper-link-import-target = Saving to: { $target }
paper-link-import-fulltext =
    .label = Download full text when available
paper-link-import-button-import =
    .label = Import
paper-link-import-button-close =
    .label = Close

paper-link-import-status-working = Importing { $done } of { $total }…
paper-link-import-status-fulltext = Looking for full text for { $total ->
    [one] 1 new item…
   *[other] { $total } new items…
}
paper-link-import-status-done = Added { $added }, { $duplicates } already in library, { $skipped } not papers, { $failed } failed
paper-link-import-status-none = No links or identifiers found.

paper-link-import-result-working = Working…
paper-link-import-result-added = Added
paper-link-import-result-added-reason = Added: { $reason }
paper-link-import-result-added-file = Added, with full text
paper-link-import-result-added-nofile = Added, no full text found
paper-link-import-result-duplicate = Already in library (same { $reason })
paper-link-import-result-failed = Failed: { $reason }
paper-link-import-result-skipped = Skipped: { $reason }

paper-link-import-prefs-import = Importing
paper-link-import-prefs-match-titles =
    .label = Treat papers with an identical title as already in the library
paper-link-import-prefs-tag = Tag for imported items:
paper-link-import-prefs-paper-types =
    .label = Only import papers (articles, preprints, books, chapters, conference papers, theses, reports)

paper-link-import-prefs-fulltext =
    .label = Download full text by default
