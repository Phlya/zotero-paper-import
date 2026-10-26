/* global Zotero, Services, Cc, Ci */

var PaperLinkImport;
var chromeHandle;

function install() {}

async function startup({ id, version, rootURI }) {
	await Zotero.initializationPromise;

	// The import dialog is opened by chrome:// URL
	let aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Ci.amIAddonManagerStartup);
	let manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", "paper-link-import", rootURI + "content/"],
	]);

	// Shared core first, then this plugin's script; each defines one global in this scope
	for (let script of ["core/linkParser.js", "core/dedup.js", "core/importer.js", "paperLinkImport.js"]) {
		Services.scriptloader.loadSubScript(rootURI + "content/" + script);
	}
	PaperLinkImport.init({ id, version, rootURI });
	Zotero.PaperLinkImport = PaperLinkImport;

	for (let win of Zotero.getMainWindows()) {
		onMainWindowLoad({ window: win });
	}
	PaperLinkImport.registerMenus();
	PaperLinkImport.registerPrefPane();
}

function onMainWindowLoad({ window }) {
	window.MozXULElement.insertFTLIfNeeded("paper-link-import.ftl");
}

function onMainWindowUnload({ window }) {
	window.document.querySelector('[href="paper-link-import.ftl"]')?.remove();
}

function shutdown() {
	for (let win of Zotero.getMainWindows()) {
		onMainWindowUnload({ window: win });
	}
	PaperLinkImport?.shutdown();
	PaperLinkImport = undefined;
	delete Zotero.PaperLinkImport;
	chromeHandle?.destruct();
	chromeHandle = null;
}

function uninstall() {}
