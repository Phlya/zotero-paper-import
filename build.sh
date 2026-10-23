#!/bin/sh
# Package plugin/ into build/teams-import-<version>.xpi
cd "$(dirname "$0")" || exit 1

# Zotero refuses to install a plugin whose manifest lacks any of these
for key in '"id"' '"update_url"' '"strict_max_version"'; do
	grep -q "$key" plugin/manifest.json || { echo "manifest.json: applications.zotero.$key is required" >&2; exit 1; }
done

VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' plugin/manifest.json | head -1)
OUT="build/teams-import-$VERSION.xpi"

mkdir -p build
rm -f "$OUT"
(cd plugin && zip -qr -X "../$OUT" . -x ".*" -x "*/.*") || exit 1
echo "$OUT"
