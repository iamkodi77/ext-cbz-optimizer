'use strict';
/* Parity tests for the extension core, mirroring tests/test_app.py of the
 * original Python app plus extension-specific checks. Run: node --test tests/ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/core.js');

const ROOT = path.join(__dirname, '..');

// --- Natural ordering (original: "2 before 10") -----------------------------
test('natural sort puts 2 before 10', () => {
  const names = ['page10.png', 'page2.png', 'page1.png', 'page20.png'];
  assert.deepEqual([...names].sort(core.naturalCompare), ['page1.png', 'page2.png', 'page10.png', 'page20.png']);
});

test('natural sort is case-insensitive and handles mixed names', () => {
  const names = ['B2.jpg', 'a10.jpg', 'A2.jpg', 'b1.jpg'];
  assert.deepEqual([...names].sort(core.naturalCompare), ['a10.jpg', 'A2.jpg', 'b1.jpg', 'B2.jpg'].sort(core.naturalCompare));
  assert.ok(core.naturalCompare('Page2', 'page10') < 0);
});

// --- File types ---------------------------------------------------------------
test('supported extensions match the original app', () => {
  for (const n of ['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.bmp', 'a.gif', 'a.tif', 'a.tiff', 'a.pdf', 'a.zip', 'a.cbz']) {
    assert.ok(core.isSupportedFile(n), n);
  }
  for (const n of ['a.txt', 'a.mp4', 'a', 'a.rar', 'a.7z']) assert.ok(!core.isSupportedFile(n), n);
});

// --- Archive safety (original: ZIP path traversal protection) ----------------
test('safeArchiveName rejects traversal and absolute paths', () => {
  assert.ok(core.safeArchiveName('pages/001.jpg'));
  assert.ok(core.safeArchiveName('001.jpg'));
  assert.ok(!core.safeArchiveName('../evil.jpg'));
  assert.ok(!core.safeArchiveName('a/../../evil.jpg'));
  assert.ok(!core.safeArchiveName('/etc/passwd'));
  assert.ok(!core.safeArchiveName('..\\evil.jpg'));
});

// --- Geometry (original: thumbnail / spread / webtoon) -----------------------
test('fitWithin never upscales and preserves aspect ratio', () => {
  assert.deepEqual(core.fitWithin(100, 150, 600, 800), { width: 100, height: 150 });
  assert.deepEqual(core.fitWithin(1200, 1600, 600, 800), { width: 600, height: 800 });
  assert.deepEqual(core.fitWithin(1200, 800, 0, 800), { width: 1200, height: 800 });
  assert.deepEqual(core.fitWithin(1200, 1600, 600, 0), { width: 600, height: 800 });
  assert.deepEqual(core.fitWithin(1200, 1600, 0, 0), { width: 1200, height: 1600 });
});

test('spread detection uses the 1.35 ratio by default', () => {
  assert.ok(core.isSpread(300, 100, 1.35));   // original test_spread_split_rtl
  assert.ok(!core.isSpread(100, 150, 1.35));
  assert.ok(!core.isSpread(130, 100, 1.35));
});

test('webtoon slicing matches the original (600x2000 -> 3 pages at 600x800)', () => {
  const slices = core.webtoonSlices(600, 2000, 600, 800);
  assert.equal(slices.length, 3);
  assert.deepEqual(slices, [
    { top: 0, height: 800 },
    { top: 800, height: 800 },
    { top: 1600, height: 400 }
  ]);
});

test('webtoon mode requires a screen size', () => {
  assert.throws(() => core.webtoonSlices(100, 500, 0, 0), /Choose an e-reader preset/);
});

// --- ComicInfo.xml (original: embedded metadata + RTL flag) ------------------
test('comicInfoXml embeds metadata and RTL flag', () => {
  const xml = core.comicInfoXml({ title: 'Test Chapter', direction: 'rtl' });
  assert.ok(xml.includes('<Title>Test Chapter</Title>'));
  assert.ok(xml.includes('<Manga>YesAndRightToLeft</Manga>'));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
});

test('comicInfoXml omits empty fields and escapes XML', () => {
  const xml = core.comicInfoXml({ title: 'A & B <C>', series: '', direction: 'ltr' });
  assert.ok(xml.includes('<Title>A &amp; B &lt;C&gt;</Title>'));
  assert.ok(!xml.includes('<Series>'));
  assert.ok(xml.includes('<Manga>No</Manga>'));
});

// --- Output naming ------------------------------------------------------------
test('outputFileName guarantees .cbz and strips path separators', () => {
  assert.equal(core.outputFileName('chapter'), 'chapter.cbz');
  assert.equal(core.outputFileName('chapter.cbz'), 'chapter.cbz');
  assert.equal(core.outputFileName('a/b\\c:d'), 'abcd.cbz');
  assert.equal(core.outputFileName(''), 'manga.cbz');
});

test('pageName zero-pads to six digits', () => {
  assert.equal(core.pageName(1, 'jpeg'), '000001.jpg');
  assert.equal(core.pageName(7, 'png'), '000007.png');
  assert.equal(core.pageName(42, 'webp'), '000042.webp');
});

// --- Settings -----------------------------------------------------------------
test('normalizeSettings applies original defaults', () => {
  const s = core.normalizeSettings({});
  assert.equal(s.format, 'jpeg');
  assert.equal(s.quality, 88);
  assert.equal(s.direction, 'rtl');
  assert.equal(s.spreadRatio, 1.35);
  assert.equal(s.pdfScale, 2);
  assert.equal(s.compressionLevel, 6);
  assert.equal(s.naturalSort, true);
});

test('normalizeSettings clamps out-of-range values', () => {
  const s = core.normalizeSettings({ quality: 999, spreadRatio: 99, compressionLevel: -3, maxWidth: -5, format: 'gif' });
  assert.equal(s.quality, 100);
  assert.equal(s.spreadRatio, 2);
  assert.equal(s.compressionLevel, 0);
  assert.equal(s.maxWidth, 0);
  assert.equal(s.format, 'jpeg');
});

test('device presets cover Kindle, Kobo, PocketBook, BOOX and reMarkable', () => {
  const labels = core.DEVICE_PRESETS.flatMap(g => g.options.map(o => o.label)).join(' ');
  for (const brand of ['Kindle', 'Kobo', 'PocketBook', 'BOOX', 'reMarkable']) {
    assert.ok(labels.includes(brand), brand);
  }
  const values = core.DEVICE_PRESETS.flatMap(g => g.options.map(o => o.value));
  assert.ok(values.includes('600x800') && values.includes('1860x2480') && values.includes('1872x1404'));
});

test('formatBytes formats sizes like the original UI', () => {
  assert.equal(core.formatBytes(512), '512 B');
  assert.equal(core.formatBytes(2048), '2 KB');
  assert.equal(core.formatBytes(1536 * 1024), '1.5 MB');
});

// --- Extension packaging -------------------------------------------------------
test('manifest.json is valid MV3 and references existing files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name && manifest.version);
  const refs = [
    manifest.action.default_popup,
    manifest.options_page,
    manifest.background.service_worker,
    ...Object.values(manifest.icons)
  ];
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(ROOT, ref)), `missing ${ref}`);
  }
  // No host permissions: the extension must work fully offline.
  assert.ok(!manifest.host_permissions || manifest.host_permissions.length === 0);
});

test('extension pages load no remote code (offline / CSP safe)', () => {
  const files = ['converter.html', 'popup.html', 'js/core.js', 'js/storage.js', 'js/converter.js', 'js/popup.js', 'background.js'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/https?:\/\//.test(src.replace(/https:\/\/github\.com\/mrcloudworks-glitch\/manga-cbz-converter/g, '')), `${f} references a remote URL`);
    assert.ok(!/<script[^>]*\son\w+\s*=/.test(src), `${f} uses inline handlers`);
  }
  const html = fs.readFileSync(path.join(ROOT, 'converter.html'), 'utf8');
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'converter.html has an inline script');
});

test('vendored libraries are present', () => {
  for (const f of ['lib/jszip.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js', 'lib/utif.js']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
});
