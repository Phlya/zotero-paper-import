// Write the update manifest Zotero checks via the plugin's update_url.
// Usage: node scripts/make-updates-json.js build/teams-import-<version>.xpi > build/updates.json
// The manifest's update_url points at releases/latest/download/updates.json, so each release
// carries an updates.json describing itself.

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const manifest = require("../plugin/manifest.json");

const xpi = process.argv[2];
if (!xpi) {
	console.error("Usage: node scripts/make-updates-json.js <xpi>");
	process.exit(1);
}

const repo = process.env.GITHUB_REPOSITORY || "Phlya/zotero-teams-import";
const { id, strict_min_version, strict_max_version } = manifest.applications.zotero;
const version = manifest.version;
const hash = crypto.createHash("sha256").update(fs.readFileSync(xpi)).digest("hex");

const updates = {
	addons: {
		[id]: {
			updates: [{
				version,
				update_link: `https://github.com/${repo}/releases/download/v${version}/${path.basename(xpi)}`,
				update_hash: `sha256:${hash}`,
				applications: { zotero: { strict_min_version, strict_max_version } },
			}],
		},
	},
};
process.stdout.write(JSON.stringify(updates, null, 2) + "\n");
