#!/bin/sh
# Run unit tests for the Zotero-independent parts of the plugin.
# Uses `node` if installed, otherwise VS Code's bundled Electron in Node mode.
cd "$(dirname "$0")/.." || exit 1

if command -v node >/dev/null 2>&1; then
	exec node --test "test/*.test.js"
fi

ELECTRON="/Applications/Visual Studio Code.app/Contents/MacOS/Code"
if [ -x "$ELECTRON" ]; then
	ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" --test "test/*.test.js"
fi

echo "No Node.js runtime found (install node, or VS Code)" >&2
exit 1
