#!/usr/bin/env bash
# Build a loadable/installable extension zip: dist/panelforge-cbz-converter.zip
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/panelforge-cbz-converter.zip
zip -r dist/panelforge-cbz-converter.zip \
  manifest.json background.js converter.html converter.css popup.html popup.css \
  js lib icons \
  -x '*.DS_Store' >/dev/null
echo "Built dist/panelforge-cbz-converter.zip ($(du -h dist/panelforge-cbz-converter.zip | cut -f1))"
echo "Install: unzip, then load the folder as an unpacked extension (or upload the zip to a store)."
