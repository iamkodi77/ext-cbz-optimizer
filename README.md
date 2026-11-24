# PanelForge — Manga CBZ Converter (Browser Extension)

A Manifest V3 browser extension that ports the
[PanelForge local manga converter](https://github.com/mrcloudworks-glitch/manga-cbz-converter)
to run **entirely inside your browser**. Combine images, PDFs, ZIPs, and CBZ
archives into a reader-ready CBZ file — no server, no uploads, no account,
works offline.

Every tool and setting from the original Flask app is available, plus a few
extension-only extras (page reordering, settings import/export, conversion
history). See the parity table below.

## Install

### Chrome / Edge / Brave / Arc (load unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. Pin **PanelForge** to the toolbar. Clicking the icon opens the popup;
   the full converter opens in a tab (also via right-click → *Open PanelForge
   converter*, or the extension's Options page).

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json` in this folder.
   (For permanent installation, zip the folder — see *Packaging* — and sign it
   at [addons.mozilla.org](https://addons.mozilla.org).)

### Packaging (store-ready zip)

```bash
bash scripts/build-zip.sh   # -> dist/panelforge-cbz-converter.zip
```

The zip has `manifest.json` at its root, ready for the Chrome Web Store /
Edge Add-ons / AMO upload, or for manual "load unpacked" after unzipping.

## Usage

1. **Add pages** — drag & drop or click to browse. Supported: JPG, PNG, WebP,
   BMP, GIF, TIFF, PDF, ZIP, CBZ. Files are listed with thumbnails and sizes;
   reorder with ↑/↓ or drag, remove with ✕, or clear all.
2. **Tune conversion** — output name, format (JPEG/WebP/PNG), layout
   (standard or webtoon), reading direction, quality, device preset, screen
   size, spread splitting, and advanced options (PDF scale, page background,
   ZIP compression level).
3. **Add metadata** — optional `ComicInfo.xml` fields (title, series, number,
   writer, genre, summary).
4. **Build my CBZ** — the file downloads to your Downloads folder. Settings
   are saved automatically; recent conversions are listed below the form.

The toolbar popup shows your current settings at a glance and a shortcut to
the full converter.

## Feature parity with the original app

| Original (Flask + Pillow + PyMuPDF) | Extension |
| --- | --- |
| Images: JPEG, PNG, WebP, BMP, GIF, TIFF | ✅ Same set (TIFF via UTIF.js; GIF = first frame) |
| Documents/archives: PDF, ZIP, CBZ | ✅ Same set (PDF via PDF.js, archives via JSZip) |
| Natural page ordering (`2` before `10`) | ✅ On by default; toggleable, plus manual reordering |
| JPEG / WebP / lossless PNG output | ✅ Same, via canvas encoding |
| Quality slider (40–100, default 88) | ✅ Same range & default |
| Max dimensions (0 = original) | ✅ Same, never upscales |
| Double-page spread splitting | ✅ Same, with exposed spread-ratio slider (default 1.35) |
| Webtoon mode (slice, pad, no stretch) | ✅ Same geometry; requires screen size |
| Kindle / Kobo / PocketBook / BOOX / reMarkable presets | ✅ Identical preset list |
| Custom screen width/height | ✅ Same |
| RTL manga / LTR comic ordering | ✅ Same (also flips spread order & `ComicInfo.xml`) |
| Embedded `ComicInfo.xml` | ✅ Same fields & `Manga` flag |
| 2 GB combined limit | ✅ Same limit, checked before processing |
| ZIP path-traversal protection | ✅ Same checks (`..`, absolute paths) |
| EXIF orientation handling | ✅ Via `createImageBitmap({ imageOrientation: 'from-image' })` |
| PDF rendered at 2× | ✅ Default 2× (1×/1.5×/3× selectable) |
| ZIP DEFLATE level 6 | ✅ Default 6 (0–9 selectable) |
| Output pages `000001.jpg`… + `ComicInfo.xml` | ✅ Identical naming |
| — | ➕ File list with thumbnails, reorder, totals |
| — | ➕ Settings auto-save, export/import/reset (JSON) |
| — | ➕ Conversion history (stored locally) |
| — | ➕ Toolbar popup with settings summary |

### Intentional differences

- **Unreadable files are skipped with a warning** instead of failing the whole
  conversion (the web app returned an error). If *no* readable pages remain,
  you get the original error message.
- **Transparent pixels flatten onto white (or black)** instead of Pillow's
  RGB conversion; selectable under *Advanced → Page background*.
- **Very large images** are bounded by browser canvas limits (~16k–32k px per
  side depending on the browser); the web app had no such limit.

## Privacy

- **No network requests.** The extension has no host permissions and loads no
  remote code — every library is bundled in `lib/`.
- Files never leave your device; settings and history live in
  `chrome.storage.local` (or `localStorage` when the page runs standalone).
- Permissions requested: `storage` (settings/history) and `contextMenus`
  (the *Open PanelForge converter* shortcut). That's it.

## Development

```
manifest.json          MV3 manifest (Chrome/Edge/Brave + Firefox)
converter.html/.css    Full converter page (also the Options page)
js/converter.js        Conversion pipeline + UI wiring
js/core.js             Pure logic: sorting, geometry, ComicInfo.xml, presets
js/storage.js          Settings/history storage (chrome.storage → localStorage)
popup.html/.css/.js    Toolbar popup launcher
background.js          Open-on-install + context menu
lib/                   Vendored JSZip, PDF.js, UTIF.js (see THIRD-PARTY-NOTICES.md)
icons/                 Extension icons (regenerate: python3 scripts/make-icons.py)
tests/core.test.js     Node tests: parity + packaging checks
scripts/build-zip.sh   Build dist/panelforge-cbz-converter.zip
```

```bash
node --test tests/          # run tests (Node 18+)
bash scripts/build-zip.sh   # build the installable zip
```

The converter page also runs standalone (e.g. from any static server) with
`localStorage` instead of `chrome.storage` — handy for previews and testing.

## Limitations

- GIFs contribute their first frame (same as Pillow's default).
- Multi-page TIFFs contribute their first page (same as Pillow's default).
- Deflate-compressed TIFFs (rare) may not decode — UTIF.js needs pako for
  that variant; uncompressed/LZW TIFFs (the norm) work fine.
- Browser memory bounds the practical 2 GB limit; huge libraries may need
  splitting into smaller batches.

## Credits

Port of [mrcloudworks-glitch/manga-cbz-converter](https://github.com/mrcloudworks-glitch/manga-cbz-converter)
(PanelForge). Bundled libraries: JSZip (MIT/GPL), PDF.js (Apache-2.0),
UTIF.js (MIT) — see `lib/THIRD-PARTY-NOTICES.md`.
