teams-import-menu-import-text =
    .label = Import Papers from Teams Text…
teams-import-menu-check-inbox =
    .label = Check Teams Inbox Now

teams-import-dialog-window =
    .title = Import Papers from Teams
teams-import-intro = Paste Teams messages, links, DOIs or arXiv IDs. Papers already in the library are skipped.
teams-import-target = Saving to: { $target }
teams-import-fulltext =
    .label = Download full text when available
teams-import-button-import =
    .label = Import
teams-import-button-close =
    .label = Close

teams-import-status-working = Importing { $done } of { $total }…
teams-import-status-fulltext = Looking for full text for { $total ->
    [one] 1 new item…
   *[other] { $total } new items…
}
teams-import-status-done = Added { $added }, skipped { $duplicates } already in library, { $failed } failed
teams-import-status-none = No links or identifiers found.

teams-import-result-working = Working…
teams-import-result-added = Added
teams-import-result-added-reason = Added: { $reason }
teams-import-result-added-file = Added, with full text
teams-import-result-added-nofile = Added, no full text found
teams-import-result-duplicate = Already in library (same { $reason })
teams-import-result-failed = Failed: { $reason }

teams-import-prefs-import = Importing
teams-import-prefs-match-titles =
    .label = Treat papers with an identical title as already in the library
teams-import-prefs-tag = Tag for imported items:

teams-import-prefs-auto = Automatic import from Teams
teams-import-prefs-auto-intro = A Power Automate flow saves each new channel message as a file in a OneDrive folder. Zotero checks the folder while it's running and imports the papers, with a note linking back to the message.
teams-import-prefs-auto-enable =
    .label = Import papers from the Teams inbox folder automatically
teams-import-prefs-inbox = Inbox folder:
teams-import-prefs-inbox-hint = Leave empty to use ZoteroInbox in your OneDrive folder.
teams-import-prefs-library = Save to library:
teams-import-prefs-collection = Collection:
teams-import-prefs-collection-none =
    .label = None (library root)
teams-import-prefs-collection-new =
    .label = New Collection…
teams-import-prefs-collection-new-prompt = Name of the new collection:
teams-import-prefs-interval = Check every (minutes):
