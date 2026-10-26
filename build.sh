#!/bin/sh
# Package plugins into build/<plugin>-<version>.xpi, each with its own copy of core/.
# Usage: ./build.sh [plugin ...]   (default: all plugins in plugins/)
cd "$(dirname "$0")" || exit 1

PLUGINS="$*"
[ -n "$PLUGINS" ] || PLUGINS=$(ls plugins)

mkdir -p build
for PLUGIN in $PLUGINS; do
	SRC="plugins/$PLUGIN"
	[ -f "$SRC/manifest.json" ] || { echo "No such plugin: $PLUGIN" >&2; exit 1; }

	# Zotero refuses to install a plugin whose manifest lacks any of these
	for key in '"id"' '"update_url"' '"strict_max_version"'; do
		grep -q "$key" "$SRC/manifest.json" || { echo "$SRC/manifest.json: applications.zotero.$key is required" >&2; exit 1; }
	done

	VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SRC/manifest.json" | head -1)
	OUT="build/$PLUGIN-$VERSION.xpi"
	STAGE="build/stage/$PLUGIN"

	rm -rf "$STAGE" "$OUT"
	mkdir -p "$STAGE"
	# "src/." copies the folder's contents on both macOS and Linux ("src/" nests it on Linux)
	cp -R "$SRC/." "$STAGE/"
	mkdir -p "$STAGE/content/core"
	cp core/*.js "$STAGE/content/core/"
	(cd "$STAGE" && zip -qr -X "../../$PLUGIN-$VERSION.xpi" . -x ".*" -x "*/.*") || exit 1
	rm -rf "$STAGE"
	# Zotero only installs an .xpi with manifest.json and bootstrap.js at the top level
	for file in manifest.json bootstrap.js content/core/importer.js; do
		unzip -l "$OUT" "$file" >/dev/null 2>&1 || { echo "$OUT: $file missing at the expected path" >&2; exit 1; }
	done
	echo "$OUT"
done
rmdir build/stage 2>/dev/null
exit 0
