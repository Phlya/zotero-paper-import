/* global Zotero, Services */

var TeamsImport;
var TeamsInbox;

function install() {}

async function startup({ id, version, rootURI }) {
	await Zotero.initializationPromise;

	// Shared core first, then this plugin's scripts; each defines one global in this scope
	for (let script of ["core/linkParser.js", "core/dedup.js", "core/importer.js",
		"teamsMessage.js", "teamsImport.js", "teamsInbox.js"]) {
		Services.scriptloader.loadSubScript(rootURI + "content/" + script);
	}
	TeamsImport.init({ id, version, rootURI });
	Zotero.TeamsImport = TeamsImport;

	for (let win of Zotero.getMainWindows()) {
		onMainWindowLoad({ window: win });
	}
	TeamsImport.registerMenus();
	TeamsImport.registerPrefPane();
	TeamsImport.observePrefs();
	TeamsInbox.start();
}

function onMainWindowLoad({ window }) {
	window.MozXULElement.insertFTLIfNeeded("teams-import.ftl");
}

function onMainWindowUnload({ window }) {
	window.document.querySelector('[href="teams-import.ftl"]')?.remove();
}

function shutdown() {
	for (let win of Zotero.getMainWindows()) {
		onMainWindowUnload({ window: win });
	}
	TeamsInbox?.stop();
	TeamsImport?.shutdown();
	TeamsImport = undefined;
	TeamsInbox = undefined;
	delete Zotero.TeamsImport;
}

function uninstall() {}
