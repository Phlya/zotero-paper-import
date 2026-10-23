/* global Zotero, Services, Cc, Ci */

var TeamsImport;
var TeamsInbox;
var chromeHandle;

function install() {}

async function startup({ id, version, rootURI }) {
	await Zotero.initializationPromise;

	let aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Ci.amIAddonManagerStartup);
	let manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", "teams-import", rootURI + "content/"],
	]);

	// Each script defines one global (TeamsLinkParser, TeamsDedup, TeamsImport, TeamsInbox) in this scope
	Services.scriptloader.loadSubScript(rootURI + "content/linkParser.js");
	Services.scriptloader.loadSubScript(rootURI + "content/dedup.js");
	Services.scriptloader.loadSubScript(rootURI + "content/teamsImport.js");
	Services.scriptloader.loadSubScript(rootURI + "content/teamsInbox.js");
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
	chromeHandle?.destruct();
	chromeHandle = null;
}

function uninstall() {}
