#!/bin/sh
# Release a new version: scripts/release.sh 0.7.0
# Sets the version in plugin/manifest.json, runs the tests, commits, tags v<version> and pushes.
# The Release workflow on GitHub then builds the .xpi and publishes it with updates.json.
set -e
cd "$(dirname "$0")/.."

VERSION="$1"
if [ -z "$VERSION" ]; then
	echo "Usage: $0 <version>" >&2
	exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "Commit or stash your changes first" >&2
	exit 1
fi

sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" plugin/manifest.json
rm plugin/manifest.json.bak
./test/run-tests.sh

git commit -qam "Release $VERSION"
git tag "v$VERSION"
git push origin HEAD "v$VERSION"
echo "Tagged v$VERSION; the release appears at https://github.com/Phlya/zotero-teams-import/releases once the workflow finishes"
