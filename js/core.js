/*
 * PanelForge core logic — pure, DOM-free helpers shared by the converter page
 * and the Node test suite. Mirrors the behaviour of the original Python app
 * (manga-cbz-converter/app.py) so the extension is a faithful port.
 *
 * Loaded as a classic script in the extension (exposes window.PanelForgeCore)
 * and via require() in tests.
 */
(function (global) {
  'use strict';

  var IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff'];
  var ARCHIVE_EXTENSIONS = ['.zip', '.cbz'];
  var ALLOWED_EXTENSIONS = IMAGE_EXTENSIONS.concat(ARCHIVE_EXTENSIONS, ['.pdf']);

  var MAX_COMBINED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB, same as the web app

  // ---------------------------------------------------------------------------
  // File names / ordering
  // ---------------------------------------------------------------------------

  function extOf(name) {
    var lower = String(name || '').toLowerCase();
    var dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
  }

  function isSupportedFile(name) {
    return ALLOWED_EXTENSIONS.indexOf(extOf(name)) !== -1;
  }

  function isImageName(name) {
    return IMAGE_EXTENSIONS.indexOf(extOf(name)) !== -1;
  }

  /**
   * Natural sort key: split into digit / non-digit runs so "2" sorts before
   * "10", exactly like the Python `natural_key` in the original app.
   * Returns an array of numbers and strings; compare with naturalCompare.
   */
  function naturalKey(value) {
    return String(value).split(/(\d+)/).map(function (part) {
      return /^\d+$/.test(part) ? parseInt(part, 10) : part.toLowerCase();
    });
  }

  function naturalCompare(a, b) {
    var ka = Array.isArray(a) ? a : naturalKey(a);
    var kb = Array.isArray(b) ? b : naturalKey(b);
    var len = Math.max(ka.length, kb.length);
    for (var i = 0; i < len; i++) {
      var x = ka[i];
      var y = kb[i];
      if (x === y) continue;
      if (x === undefined) return -1;
      if (y === undefined) return 1;
      if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  }

  /** Reject absolute paths and ".." traversal inside ZIP/CBZ archives. */
  function safeArchiveName(name) {
    var parts = String(name || '').split(/[\\/]+/);
    if (/^([a-zA-Z]:)?[\\/]/.test(name)) return false; // absolute / drive path
    return parts.indexOf('..') === -1;
  }

  /** Sanitise the requested output name and guarantee a .cbz extension. */
  function outputFileName(name) {
    var clean = String(name || '').trim()
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '');
    if (!clean) clean = 'manga';
    if (!/\.cbz$/i.test(clean)) clean += '.cbz';
    return clean;
  }

  /** Zero-padded page entry name inside the CBZ, e.g. 000007.jpg */
  function pageName(index, extension) {
    var ext = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' }[String(extension || '').toLowerCase()] || 'jpg';
    return String(index).padStart(6, '0') + '.' + ext;
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  // ---------------------------------------------------------------------------
  // Geometry — mirrors process_image() / _webtoon_pages() in app.py
  // ---------------------------------------------------------------------------

  function toDim(value) {
    var n = parseInt(value, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  /**
   * Fit (width x height) inside (maxWidth x maxHeight), preserving aspect
   * ratio and never upscaling. A 0 bound means "unbounded" on that axis.
   * Equivalent to PIL's Image.thumbnail().
   */
  function fitWithin(width, height, maxWidth, maxHeight) {
    var w = Math.max(1, width);
    var h = Math.max(1, height);
    var scale = 1;
    if (maxWidth > 0) scale = Math.min(scale, maxWidth / w);
    if (maxHeight > 0) scale = Math.min(scale, maxHeight / h);
    if (scale >= 1) return { width: w, height: h };
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
  }

  /** True when a page is wide enough to be a double-page spread. */
  function isSpread(width, height, ratio) {
    var threshold = parseFloat(ratio);
    if (isNaN(threshold) || threshold <= 0) threshold = 1.35;
    return width / Math.max(1, height) >= threshold;
  }

  /**
   * Vertical slices for Webtoon mode. Crops in source pixels so artwork is
   * never stretched; the caller pads the final slice to the screen size.
   * Returns [{ top, height }] in source-pixel coordinates.
   */
  function webtoonSlices(imgWidth, imgHeight, screenWidth, screenHeight) {
    if (!screenWidth || !screenHeight) {
      throw new Error('Choose an e-reader preset or enter a width and height for Webtoon mode.');
    }
    var sliceHeight = Math.max(1, Math.round(imgWidth * screenHeight / screenWidth));
    var slices = [];
    for (var top = 0; top < imgHeight; top += sliceHeight) {
      slices.push({ top: top, height: Math.min(sliceHeight, imgHeight - top) });
    }
    return slices;
  }

  // ---------------------------------------------------------------------------
  // ComicInfo.xml — mirrors comic_info() in app.py
  // ---------------------------------------------------------------------------

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function comicInfoXml(meta) {
    meta = meta || {};
    var fields = [
      ['Title', meta.title],
      ['Series', meta.series],
      ['Number', meta.number],
      ['Writer', meta.writer],
      ['Genre', meta.genre],
      ['Summary', meta.summary],
      ['Manga', meta.direction === 'rtl' ? 'YesAndRightToLeft' : 'No']
    ];
    var lines = ['<?xml version="1.0" encoding="utf-8"?>', '<ComicInfo>'];
    fields.forEach(function (pair) {
      var value = pair[1] == null ? '' : String(pair[1]).trim();
      if (value) lines.push('  <' + pair[0] + '>' + escapeXml(value) + '</' + pair[0] + '>');
    });
    lines.push('</ComicInfo>');
    return lines.join('\n') + '\n';
  }

  // ---------------------------------------------------------------------------
  // Settings & device presets
  // ---------------------------------------------------------------------------

  var DEFAULT_SETTINGS = {
    outputName: 'my-manga',
    format: 'jpeg',            // jpeg | webp | png
    layout: 'standard',        // standard | webtoon
    direction: 'rtl',          // rtl (manga) | ltr
    quality: 88,               // 40–100, JPEG/WebP only
    device: '0x0',             // preset value "WxH", 0x0 = original/custom
    maxWidth: 0,               // 0 = original
    maxHeight: 0,              // 0 = original
    splitSpreads: false,
    spreadRatio: 1.35,
    naturalSort: true,
    pdfScale: 2,               // PDF render scale (original used 2x)
    background: 'white',       // white | black — alpha flatten + webtoon padding
    compressionLevel: 6,       // ZIP DEFLATE level 0–9
    title: '',
    series: '',
    number: '',
    writer: '',
    genre: '',
    summary: ''
  };

  var SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

  /** E-reader screen presets, identical to the original app's <select>. */
  var DEVICE_PRESETS = [
    { group: 'Amazon Kindle — 6 inch', options: [
      { value: '600x800', label: 'Kindle 1–7 / Kindle 8 & 10 (600×800)' },
      { value: '758x1024', label: 'Kindle Paperwhite 1–2 (758×1024)' },
      { value: '1072x1448', label: 'Kindle Paperwhite 3–4 / Voyage (1072×1448)' },
      { value: '1080x1440', label: 'Kindle 11 (2022) / 11 (2024) (1080×1440)' },
      { value: '1236x1648', label: 'Kindle Paperwhite 5 / Signature 1 (1236×1648)' }
    ]},
    { group: 'Amazon Kindle — large & color', options: [
      { value: '1264x1680', label: 'Kindle Paperwhite 6 / Signature 2 (1264×1680)' },
      { value: '1264x1680', label: 'Kindle Colorsoft / Colorsoft 2 (1264×1680)' },
      { value: '1440x1920', label: 'Kindle Oasis 1 (1440×1920)' },
      { value: '1264x1680', label: 'Kindle Oasis 2–3 (1264×1680)' },
      { value: '1860x2480', label: 'Kindle Scribe / Scribe 2024 (1860×2480)' }
    ]},
    { group: 'Kobo — compact & 6 inch', options: [
      { value: '600x800', label: 'Kobo Mini / Touch / original Aura (600×800)' },
      { value: '758x1024', label: 'Kobo Glo / Aura Edition 2 / Nia (758×1024)' },
      { value: '1072x1448', label: 'Kobo Glo HD / Clara HD / Clara 2E / Clara BW / Clara Colour (1072×1448)' }
    ]},
    { group: 'Kobo — 6.8 to 8 inch', options: [
      { value: '1080x1440', label: 'Kobo Aura H2O / Aura H2O Edition 2 (1080×1440)' },
      { value: '1264x1680', label: 'Kobo Libra H2O / Libra 2 / Libra Colour (1264×1680)' },
      { value: '1404x1872', label: 'Kobo Aura HD / Aura One / Forma / Sage (1404×1872)' }
    ]},
    { group: 'Kobo — large screen', options: [
      { value: '1440x1920', label: 'Kobo Elipsa / Elipsa 2E (1440×1920)' }
    ]},
    { group: 'Other popular e-readers', options: [
      { value: '758x1024', label: 'PocketBook Basic Lux / Verse (758×1024)' },
      { value: '1072x1448', label: 'PocketBook Touch HD / Verse Pro (1072×1448)' },
      { value: '1264x1680', label: 'PocketBook Era / InkPad 4 (1264×1680)' },
      { value: '1404x1872', label: 'BOOX Page / Leaf 2 (1404×1872)' },
      { value: '1872x1404', label: 'reMarkable 1 / 2 (1872×1404)' }
    ]}
  ];

  function clampQuality(value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return DEFAULT_SETTINGS.quality;
    return Math.max(40, Math.min(100, n));
  }

  function clampSpreadRatio(value) {
    var n = parseFloat(value);
    if (isNaN(n)) return DEFAULT_SETTINGS.spreadRatio;
    return Math.max(1, Math.min(2, Math.round(n * 100) / 100));
  }

  function clampCompressionLevel(value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return DEFAULT_SETTINGS.compressionLevel;
    return Math.max(0, Math.min(9, n));
  }

  function clampPdfScale(value) {
    var n = parseFloat(value);
    return [1, 1.5, 2, 3].indexOf(n) !== -1 ? n : DEFAULT_SETTINGS.pdfScale;
  }

  /** Merge stored settings over defaults, keeping only known keys. */
  function normalizeSettings(stored) {
    var out = {};
    SETTINGS_KEYS.forEach(function (key) { out[key] = DEFAULT_SETTINGS[key]; });
    if (stored && typeof stored === 'object') {
      SETTINGS_KEYS.forEach(function (key) {
        if (stored[key] !== undefined) out[key] = stored[key];
      });
    }
    out.quality = clampQuality(out.quality);
    out.spreadRatio = clampSpreadRatio(out.spreadRatio);
    out.compressionLevel = clampCompressionLevel(out.compressionLevel);
    out.pdfScale = clampPdfScale(out.pdfScale);
    out.maxWidth = toDim(out.maxWidth);
    out.maxHeight = toDim(out.maxHeight);
    if (['jpeg', 'webp', 'png'].indexOf(out.format) === -1) out.format = 'jpeg';
    if (['standard', 'webtoon'].indexOf(out.layout) === -1) out.layout = 'standard';
    if (['rtl', 'ltr'].indexOf(out.direction) === -1) out.direction = 'rtl';
    if (['white', 'black'].indexOf(out.background) === -1) out.background = 'white';
    out.splitSpreads = !!out.splitSpreads;
    out.naturalSort = out.naturalSort !== false;
    return out;
  }

  var api = {
    IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
    ARCHIVE_EXTENSIONS: ARCHIVE_EXTENSIONS,
    ALLOWED_EXTENSIONS: ALLOWED_EXTENSIONS,
    MAX_COMBINED_BYTES: MAX_COMBINED_BYTES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SETTINGS_KEYS: SETTINGS_KEYS,
    DEVICE_PRESETS: DEVICE_PRESETS,
    extOf: extOf,
    isSupportedFile: isSupportedFile,
    isImageName: isImageName,
    naturalKey: naturalKey,
    naturalCompare: naturalCompare,
    safeArchiveName: safeArchiveName,
    outputFileName: outputFileName,
    pageName: pageName,
    formatBytes: formatBytes,
    toDim: toDim,
    fitWithin: fitWithin,
    isSpread: isSpread,
    webtoonSlices: webtoonSlices,
    escapeXml: escapeXml,
    comicInfoXml: comicInfoXml,
    clampQuality: clampQuality,
    clampSpreadRatio: clampSpreadRatio,
    clampCompressionLevel: clampCompressionLevel,
    clampPdfScale: clampPdfScale,
    normalizeSettings: normalizeSettings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PanelForgeCore = api;
})(typeof self !== 'undefined' ? self : this);
