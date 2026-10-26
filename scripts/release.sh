#!/bin/sh
# Release a new version of one plugin: scripts/release.sh <plugin> <version>
#   e.g. scripts/release.sh teams-import 0.7.0
# Sets the version in plugins/<plugin>/manifest.json, runs the tests, commits, tags
# <plugin>-v<version> and pushes. The Release workflow on GitHub then builds the .xpi and
# publishes it with the combined updates.json.
set -e
cd "$(dirname "$0")/.."

PLUGIN="$1"
VERSION="$2"
if [ -z "$PLUGIN" ] || [ -z "$VERSION" ]; then
	echo "Usage: $0 <plugin> <version>   (plugins: $(ls plugins | tr '\n' ' '))" >&2
	exit 1
fi
MANIFEST="plugins/$PLUGIN/manifest.json"
if [ ! -f "$MANIFEST" ]; then
	echo "No such plugin: $PLUGIN" >&2
	exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "Commit or stash your changes first" >&2
	exit 1
fi

sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$MANIFEST"
rm "$MANIFEST.bak"
./test/run-tests.sh

TAG="$PLUGIN-v$VERSION"
git commit -qam "Release $PLUGIN $VERSION"
git tag "$TAG"
git push origin HEAD "$TAG"
echo "Tagged $TAG; the release appears at https://github.com/Phlya/zotero-paper-import/releases once the workflow finishes"
