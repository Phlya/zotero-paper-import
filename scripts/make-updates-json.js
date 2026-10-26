// Write the update manifest Zotero checks via each plugin's update_url.
// Usage: node scripts/make-updates-json.js <plugin> <xpi> [previous updates.json] > updates.json
//
// Both plugins point their update_url at releases/latest/download/updates.json, so that one file
// lists the current version of every plugin. Each release starts from the previous latest
// release's file and replaces only its own plugin's entry.

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const [plugin, xpi, previous] = process.argv.slice(2);
if (!plugin || !xpi) {
	console.error("Usage: node scripts/make-updates-json.js <plugin> <xpi> [previous updates.json]");
	process.exit(1);
}

const manifest = require(path.resolve(__dirname, "..", "plugins", plugin, "manifest.json"));
const repo = process.env.GITHUB_REPOSITORY || "Phlya/zotero-paper-import";
const { id, strict_min_version, strict_max_version } = manifest.applications.zotero;
const version = manifest.version;
const hash = crypto.createHash("sha256").update(fs.readFileSync(xpi)).digest("hex");

let updates = { addons: {} };
if (previous && fs.existsSync(previous)) {
	try {
		updates = JSON.parse(fs.readFileSync(previous, "utf8"));
		updates.addons = updates.addons || {};
	}
	catch (e) {
		console.error(`Ignoring unreadable ${previous}: ${e.message}`);
	}
}

updates.addons[id] = {
	updates: [{
		version,
		update_link: `https://github.com/${repo}/releases/download/${plugin}-v${version}/${path.basename(xpi)}`,
		update_hash: `sha256:${hash}`,
		applications: { zotero: { strict_min_version, strict_max_version } },
	}],
};
process.stdout.write(JSON.stringify(updates, null, 2) + "\n");
