/*
 * PanelForge converter page — all processing happens locally in the browser.
 * Port of manga-cbz-converter/app.py: same inputs, settings, geometry and
 * ComicInfo.xml output, but with canvas + JSZip + PDF.js instead of
 * Pillow + Flask + PyMuPDF.
 */
(function () {
  'use strict';

  var core = window.PanelForgeCore;
  var store = window.PanelForgeStorage;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    form: $('converter'), input: $('files'), dropzone: $('dropzone'),
    list: $('file-list'), toolbar: $('file-toolbar'), totals: $('file-totals'),
    addMore: $('add-more'), clearFiles: $('clear-files'),
    outputName: $('output-name'), format: $('format'), layout: $('layout'),
    direction: $('direction'), quality: $('quality'), qualityOut: $('quality-out'),
    device: $('device'), maxWidth: $('max-width'), maxHeight: $('max-height'),
    webtoonHelp: $('webtoon-help'), splitSpreads: $('split-spreads'),
    spreadRatio: $('spread-ratio'), spreadRatioOut: $('spread-ratio-out'),
    naturalSort: $('natural-sort'), pdfScale: $('pdf-scale'),
    background: $('background'), compressionLevel: $('compression-level'),
    title: $('title'), series: $('series'), number: $('number'),
    writer: $('writer'), genre: $('genre'), summary: $('summary'),
    submit: $('submit'), status: $('status'),
    progressWrap: $('progress-wrap'), progress: $('progress'), progressLabel: $('progress-label'),
    result: $('result'), resultName: $('result-name'), resultMeta: $('result-meta'),
    downloadAgain: $('download-again'), convertAnother: $('convert-another'),
    historyList: $('history-list'), clearHistory: $('clear-history'),
    exportSettings: $('export-settings'), importSettings: $('import-settings'),
    importFile: $('import-file'), resetSettings: $('reset-settings'),
    version: $('version')
  };

  var files = [];            // [{ id, file, thumbUrl }]
  var nextId = 1;
  var resultBlob = null;     // last CBZ blob (kept for "Download again")
  var resultUrl = null;
  var resultName = '';
  var saveTimer = null;
  var busy = false;

  // ---------------------------------------------------------------------------
  // Status / progress helpers
  // ---------------------------------------------------------------------------

  function setStatus(message, kind) {
    els.status.textContent = message || '';
    els.status.className = kind || '';
  }

  function setProgress(percent, label) {
    els.progressWrap.hidden = false;
    els.progress.value = Math.max(0, Math.min(100, Math.round(percent)));
    if (label) els.progressLabel.textContent = label;
  }

  function hideProgress() {
    els.progressWrap.hidden = true;
    els.progress.value = 0;
    els.progressLabel.textContent = '';
  }

  // ---------------------------------------------------------------------------
  // Settings: build device list, load / apply / save
  // ---------------------------------------------------------------------------

  function buildDeviceOptions() {
    core.DEVICE_PRESETS.forEach(function (group) {
      var optgroup = document.createElement('optgroup');
      optgroup.label = group.group;
      group.options.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        optgroup.appendChild(option);
      });
      els.device.appendChild(optgroup);
    });
  }

  function collectSettings() {
    return core.normalizeSettings({
      outputName: els.outputName.value,
      format: els.format.value,
      layout: els.layout.value,
      direction: els.direction.value,
      quality: els.quality.value,
      device: els.device.value,
      maxWidth: els.maxWidth.value,
      maxHeight: els.maxHeight.value,
      splitSpreads: els.splitSpreads.checked,
      spreadRatio: els.spreadRatio.value,
      naturalSort: els.naturalSort.checked,
      pdfScale: els.pdfScale.value,
      background: els.background.value,
      compressionLevel: els.compressionLevel.value,
      title: els.title.value,
      series: els.series.value,
      number: els.number.value,
      writer: els.writer.value,
      genre: els.genre.value,
      summary: els.summary.value
    });
  }

  function applySettings(s) {
    els.outputName.value = s.outputName;
    els.format.value = s.format;
    els.layout.value = s.layout;
    els.direction.value = s.direction;
    els.quality.value = s.quality;
    els.qualityOut.textContent = s.quality + '%';
    els.device.value = s.device;
    els.maxWidth.value = s.maxWidth;
    els.maxHeight.value = s.maxHeight;
    els.splitSpreads.checked = s.splitSpreads;
    els.spreadRatio.value = s.spreadRatio;
    els.spreadRatioOut.textContent = Number(s.spreadRatio).toFixed(2).replace(/0$/, '');
    els.naturalSort.checked = s.naturalSort;
    els.pdfScale.value = String(s.pdfScale);
    els.background.value = s.background;
    els.compressionLevel.value = String(s.compressionLevel);
    els.title.value = s.title;
    els.series.value = s.series;
    els.number.value = s.number;
    els.writer.value = s.writer;
    els.genre.value = s.genre;
    els.summary.value = s.summary;
    updateLayout();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.saveSettings(collectSettings()); }, 300);
  }

  function updateLayout() {
    var webtoon = els.layout.value === 'webtoon';
    els.webtoonHelp.hidden = !webtoon;
    els.spreadRatio.disabled = !els.splitSpreads.checked;
  }

  function initSettingsControls() {
    buildDeviceOptions();

    els.device.addEventListener('change', function () {
      var parts = els.device.value.split('x');
      els.maxWidth.value = parts[0] || '0';
      els.maxHeight.value = parts[1] || '0';
      scheduleSave();
    });
    [els.maxWidth, els.maxHeight].forEach(function (input) {
      input.addEventListener('input', function () {
        els.device.value = '0x0'; // manual edit -> custom size
        scheduleSave();
      });
    });
    els.quality.addEventListener('input', function () {
      els.qualityOut.textContent = els.quality.value + '%';
      scheduleSave();
    });
    els.spreadRatio.addEventListener('input', function () {
      els.spreadRatioOut.textContent = Number(els.spreadRatio.value).toFixed(2).replace(/0$/, '');
      scheduleSave();
    });
    els.layout.addEventListener('change', function () { updateLayout(); scheduleSave(); });
    els.splitSpreads.addEventListener('change', function () { updateLayout(); scheduleSave(); });
    els.form.addEventListener('change', scheduleSave);
    els.form.addEventListener('input', scheduleSave);

    store.loadSettings().then(function (stored) {
      applySettings(core.normalizeSettings(stored));
    });
  }

  // ---------------------------------------------------------------------------
  // File intake: list, thumbnails, reorder, totals
  // ---------------------------------------------------------------------------

  function badgeFor(name) {
    var ext = core.extOf(name).replace('.', '').toUpperCase() || 'FILE';
    var cls = 'badge';
    if (core.ARCHIVE_EXTENSIONS.indexOf(core.extOf(name)) !== -1) cls += ' archive';
    if (core.extOf(name) === '.pdf') cls += ' pdf';
    return { text: ext.slice(0, 4), cls: cls };
  }

  function renderFiles() {
    els.list.innerHTML = '';
    files.forEach(function (entry, index) {
      var row = document.createElement('div');
      row.className = 'file-item';
      row.draggable = true;
      row.dataset.id = String(entry.id);

      if (entry.thumbUrl) {
        var img = document.createElement('img');
        img.className = 'thumb';
        img.alt = '';
        img.src = entry.thumbUrl;
        row.appendChild(img);
      } else {
        var badge = badgeFor(entry.file.name);
        var span = document.createElement('span');
        span.className = badge.cls;
        span.textContent = badge.text;
        row.appendChild(span);
      }

      var name = document.createElement('span');
      name.className = 'fname';
      name.textContent = entry.file.name;
      name.title = entry.file.name;
      row.appendChild(name);

      var size = document.createElement('span');
      size.className = 'fsize';
      size.textContent = core.formatBytes(entry.file.size);
      row.appendChild(size);

      [['↑', -1, 'Move up'], ['↓', 1, 'Move down'], ['✕', 0, 'Remove']].forEach(function (cfg) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fbtn';
        btn.textContent = cfg[0];
        btn.title = cfg[2];
        btn.setAttribute('aria-label', cfg[2] + ' ' + entry.file.name);
        btn.addEventListener('click', function () {
          if (cfg[1] === 0) removeFile(entry.id);
          else moveFile(entry.id, cfg[1]);
        });
        row.appendChild(btn);
      });

      row.addEventListener('dragstart', function (e) {
        row.classList.add('dragging');
        e.dataTransfer.setData('text/plain', String(entry.id));
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        var targetIndex = files.findIndex(function (f) { return f.id === entry.id; });
        var draggedIndex = files.findIndex(function (f) { return f.id === draggedId; });
        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
        var moved = files.splice(draggedIndex, 1)[0];
        files.splice(targetIndex, 0, moved);
        renderFiles();
      });

      els.list.appendChild(row);
    });

    var total = files.reduce(function (sum, e) { return sum + e.file.size; }, 0);
    els.list.classList.toggle('show', files.length > 0);
    els.toolbar.hidden = files.length === 0;
    els.totals.textContent = files.length
      ? files.length + (files.length === 1 ? ' file' : ' files') + ' · ' + core.formatBytes(total) +
        (total > core.MAX_COMBINED_BYTES ? ' — over the 2 GB limit!' : '')
      : '';
  }

  function removeFile(id) {
    var index = files.findIndex(function (f) { return f.id === id; });
    if (index === -1) return;
    if (files[index].thumbUrl) URL.revokeObjectURL(files[index].thumbUrl);
    files.splice(index, 1);
    renderFiles();
  }

  function moveFile(id, delta) {
    var index = files.findIndex(function (f) { return f.id === id; });
    var target = index + delta;
    if (index === -1 || target < 0 || target >= files.length) return;
    var entry = files.splice(index, 1)[0];
    files.splice(target, 0, entry);
    renderFiles();
  }

  function clearFiles() {
    files.forEach(function (f) { if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl); });
    files = [];
    els.input.value = '';
    renderFiles();
  }

  function addFiles(fileList) {
    var added = 0;
    var skipped = 0;
    Array.prototype.forEach.call(fileList, function (file) {
      if (!core.isSupportedFile(file.name)) { skipped++; return; }
      var thumbUrl = core.isImageName(file.name) ? URL.createObjectURL(file) : null;
      files.push({ id: nextId++, file: file, thumbUrl: thumbUrl });
      added++;
    });
    if (added && els.naturalSort.checked) {
      files.sort(function (a, b) { return core.naturalCompare(a.file.name, b.file.name); });
    }
    renderFiles();
    if (skipped) setStatus(skipped + ' unsupported file' + (skipped > 1 ? 's' : '') + ' skipped. Supported: JPG, PNG, WebP, BMP, GIF, TIFF, PDF, ZIP, CBZ.', 'error');
    else if (added) setStatus('');
  }

  function initFileControls() {
    els.input.addEventListener('change', function () { addFiles(els.input.files); els.input.value = ''; });
    els.addMore.addEventListener('click', function () { els.input.click(); });
    els.clearFiles.addEventListener('click', clearFiles);

    ['dragenter', 'dragover'].forEach(function (evt) {
      els.dropzone.addEventListener(evt, function (e) { e.preventDefault(); els.dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      els.dropzone.addEventListener(evt, function (e) { e.preventDefault(); els.dropzone.classList.remove('drag'); });
    });
    els.dropzone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
  }

  // ---------------------------------------------------------------------------
  // Decoding: images (incl. TIFF), ZIP/CBZ archives, PDFs
  // ---------------------------------------------------------------------------

  function makeCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function canvasFromSource(source, width, height) {
    var canvas = makeCanvas(width, height);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var canvas = canvasFromSource(img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
      img.src = url;
    });
  }

  function decodeTiff(file) {
    return file.arrayBuffer().then(function (buffer) {
      if (typeof UTIF === 'undefined') throw new Error('TIFF decoder unavailable');
      var ifds = UTIF.decode(buffer);
      if (!ifds || !ifds.length) throw new Error('Unreadable TIFF');
      UTIF.decodeImage(buffer, ifds[0]); // first frame, like PIL's Image.open()
      var rgba = UTIF.toRGBA8(ifds[0]);
      var canvas = makeCanvas(ifds[0].width, ifds[0].height);
      var ctx = canvas.getContext('2d');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
      return canvas;
    });
  }

  function decodeImageFile(file) {
    if (core.extOf(file.name) === '.tif' || core.extOf(file.name) === '.tiff') {
      return decodeTiff(file).catch(function () { return decodeViaImg(file); });
    }
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(function (bitmap) {
          var canvas = canvasFromSource(bitmap, bitmap.width, bitmap.height);
          if (bitmap.close) bitmap.close();
          return canvas;
        })
        .catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }

  function expandArchive(file, settings) {
    return JSZip.loadAsync(file).then(function (zip) {
      var entries = [];
      zip.forEach(function (relativePath, entry) {
        if (entry.dir) return;
        if (!core.safeArchiveName(relativePath)) return;
        if (!core.isImageName(relativePath)) return;
        entries.push({ path: relativePath, entry: entry });
      });
      entries.sort(function (a, b) {
        return settings.naturalSort
          ? core.naturalCompare(a.path, b.path)
          : (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      });
      var chain = Promise.resolve([]);
      entries.forEach(function (item) {
        chain = chain.then(function (acc) {
          return item.entry.async('blob').then(function (blob) {
            var inner = new File([blob], item.path.split(/[\\/]/).pop(), { type: blob.type || '' });
            return decodeImageFile(inner).then(function (canvas) { acc.push(canvas); return acc; });
          });
        });
      });
      return chain;
    });
  }

  function expandPdf(file, settings) {
    if (typeof pdfjsLib === 'undefined') return Promise.reject(new Error('PDF engine unavailable'));
    var workerSrc = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('lib/pdf.worker.min.js')
      : 'lib/pdf.worker.min.js';
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    return file.arrayBuffer()
      .then(function (buffer) { return pdfjsLib.getDocument({ data: buffer }).promise; })
      .then(function (pdf) {
        var pages = [];
        var chain = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) {
          (function (pageNumber) {
            chain = chain.then(function () {
              return pdf.getPage(pageNumber).then(function (page) {
                var viewport = page.getViewport({ scale: settings.pdfScale });
                var canvas = makeCanvas(viewport.width, viewport.height);
                return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise
                  .then(function () { pages.push(canvas); });
              });
            });
          })(n);
        }
        return chain.then(function () { return pages; });
      });
  }

  /** Expand one top-level file into an array of source canvases. */
  function expandFile(file, settings) {
    var ext = core.extOf(file.name);
    if (core.IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
      return decodeImageFile(file).then(function (canvas) { return [canvas]; });
    }
    if (core.ARCHIVE_EXTENSIONS.indexOf(ext) !== -1) return expandArchive(file, settings);
    if (ext === '.pdf') return expandPdf(file, settings);
    return Promise.resolve([]);
  }

  // ---------------------------------------------------------------------------
  // Page processing — mirrors process_image() / _webtoon_pages() in app.py
  // ---------------------------------------------------------------------------

  function bgColor(settings) { return settings.background === 'black' ? '#000000' : '#ffffff'; }

  /** Flatten a source canvas onto the background colour at the fitted size. */
  function flatten(source, width, height, settings) {
    var fitted = core.fitWithin(source.width, source.height, width, height);
    var canvas = makeCanvas(fitted.width, fitted.height);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor(settings);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function cropCanvas(source, sx, sy, sw, sh) {
    var canvas = makeCanvas(sw, sh);
    canvas.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function processSource(source, settings) {
    if (settings.layout === 'webtoon') {
      var slices = core.webtoonSlices(source.width, source.height, settings.maxWidth, settings.maxHeight);
      return slices.map(function (slice) {
        var crop = cropCanvas(source, 0, slice.top, source.width, slice.height);
        var fitted = core.fitWithin(crop.width, crop.height, settings.maxWidth, settings.maxHeight);
        var page = makeCanvas(settings.maxWidth, settings.maxHeight);
        var ctx = page.getContext('2d');
        ctx.fillStyle = bgColor(settings);
        ctx.fillRect(0, 0, page.width, page.height);
        // Anchored at the top, centred horizontally — same as the original.
        ctx.drawImage(crop, 0, 0, crop.width, crop.height, Math.floor((page.width - fitted.width) / 2), 0, fitted.width, fitted.height);
        return page;
      });
    }

    var pages;
    if (settings.splitSpreads && core.isSpread(source.width, source.height, settings.spreadRatio)) {
      var middle = Math.floor(source.width / 2);
      var left = cropCanvas(source, 0, 0, middle, source.height);
      var right = cropCanvas(source, middle, 0, source.width - middle, source.height);
      pages = settings.direction === 'rtl' ? [right, left] : [left, right];
    } else {
      pages = [source];
    }
    return pages.map(function (page) { return flatten(page, settings.maxWidth, settings.maxHeight, settings); });
  }

  function canvasToBlob(canvas, format, quality) {
    var mime = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }[format] || 'image/jpeg';
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) return resolve(blob);
        if (mime === 'image/webp') { // browsers without WebP encoding
          return canvas.toBlob(function (fallback) {
            if (fallback) resolve(fallback); else reject(new Error('Could not encode page.'));
          }, 'image/jpeg', quality);
        }
        reject(new Error('Could not encode page.'));
      }, mime, quality);
    });
  }

  // ---------------------------------------------------------------------------
  // Conversion pipeline
  // ---------------------------------------------------------------------------

  function triggerDownload(blob, filename) {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = resultUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function convert() {
    if (busy) return;
    if (!files.length) { setStatus('Choose at least one file.', 'error'); return; }

    var settings = collectSettings();
    var totalBytes = files.reduce(function (sum, e) { return sum + e.file.size; }, 0);
    if (totalBytes > core.MAX_COMBINED_BYTES) {
      setStatus('Combined size exceeds the 2 GB limit.', 'error');
      return;
    }
    if (settings.layout === 'webtoon' && (!settings.maxWidth || !settings.maxHeight)) {
      setStatus('Choose an e-reader preset or enter a width and height for Webtoon mode.', 'error');
      return;
    }

    busy = true;
    els.submit.disabled = true;
    els.submit.querySelector('span').textContent = 'Building your comic…';
    els.result.hidden = true;
    setStatus('Processing pages locally. Large files may take a moment.');
    setProgress(0, 'Starting…');

    var zip = new JSZip();
    var pageNumber = 0;
    var warnings = 0;
    var queue = files.slice();
    var index = 0;

    function next() {
      if (index >= queue.length) return finish();
      var entry = queue[index++];
      setProgress((index / queue.length) * 60, 'Reading ' + entry.file.name + ' (' + index + '/' + queue.length + ')');
      expandFile(entry.file, settings)
        .then(function (sources) {
          var chain = Promise.resolve();
          sources.forEach(function (source) {
            chain = chain.then(function () {
              var pages = processSource(source, settings);
              var inner = Promise.resolve();
              pages.forEach(function (page) {
                inner = inner.then(function () {
                  pageNumber++;
                  return canvasToBlob(page, settings.format, settings.quality / 100)
                    .then(function (blob) {
                      zip.file(core.pageName(pageNumber, settings.format), blob);
                      setProgress(60, 'Packed page ' + pageNumber);
                    });
                });
              });
              return inner;
            });
          });
          return chain;
        })
        .catch(function () { warnings++; })
        .then(next);
    }

    function finish() {
      if (pageNumber === 0) {
        busy = false;
        els.submit.disabled = false;
        els.submit.querySelector('span').textContent = 'Build my CBZ';
        hideProgress();
        setStatus('The selected files did not contain readable images.', 'error');
        return;
      }
      zip.file('ComicInfo.xml', core.comicInfoXml(settings));
      zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: settings.compressionLevel }
      }, function (meta) {
        setProgress(60 + meta.percent * 0.4, 'Compressing… ' + Math.round(meta.percent) + '%');
      }).then(function (blob) {
        resultBlob = blob;
        resultName = core.outputFileName(settings.outputName);
        triggerDownload(blob, resultName);
        els.resultName.textContent = resultName;
        els.resultMeta.textContent = pageNumber + (pageNumber === 1 ? ' page' : ' pages') + ' · ' + core.formatBytes(blob.size) +
          (warnings ? ' · ' + warnings + ' unreadable file' + (warnings > 1 ? 's' : '') + ' skipped' : '');
        els.result.hidden = false;
        setStatus('Done — ' + pageNumber + ' pages packed into ' + resultName, 'success');
        store.addHistory({
          name: resultName,
          pages: pageNumber,
          size: blob.size,
          format: settings.format,
          layout: settings.layout,
          date: new Date().toISOString()
        }).then(renderHistory);
      }).catch(function () {
        setStatus('Conversion failed. Check the files and try again.', 'error');
      }).then(function () {
        busy = false;
        els.submit.disabled = false;
        els.submit.querySelector('span').textContent = 'Build my CBZ';
        hideProgress();
      });
    }

    next();
  }

  // ---------------------------------------------------------------------------
  // History + settings import/export/reset
  // ---------------------------------------------------------------------------

  function renderHistory() {
    return store.loadHistory().then(function (history) {
      els.historyList.innerHTML = '';
      els.clearHistory.hidden = history.length === 0;
      if (!history.length) {
        var empty = document.createElement('p');
        empty.className = 'history-empty';
        empty.textContent = 'No conversions yet.';
        els.historyList.appendChild(empty);
        return;
      }
      history.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'history-item';
        var name = document.createElement('span');
        name.className = 'hname';
        name.textContent = item.name;
        var meta = document.createElement('span');
        meta.className = 'hmeta';
        var when = item.date ? new Date(item.date).toLocaleString() : '';
        meta.textContent = item.pages + ' pages · ' + core.formatBytes(item.size) + ' · ' + (item.format || '').toUpperCase() + (when ? ' · ' + when : '');
        row.appendChild(name);
        row.appendChild(meta);
        els.historyList.appendChild(row);
      });
    });
  }

  function downloadText(text, filename, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function initSettingsActions() {
    els.exportSettings.addEventListener('click', function () {
      downloadText(JSON.stringify(collectSettings(), null, 2), 'panelforge-settings.json');
      setStatus('Settings exported.', 'success');
    });
    els.importSettings.addEventListener('click', function () { els.importFile.click(); });
    els.importFile.addEventListener('change', function () {
      var file = els.importFile.files[0];
      els.importFile.value = '';
      if (!file) return;
      file.text().then(function (text) {
        try {
          var parsed = JSON.parse(text);
          var settings = core.normalizeSettings(parsed);
          applySettings(settings);
          store.saveSettings(settings);
          setStatus('Settings imported.', 'success');
        } catch (e) {
          setStatus('Could not import that file — expected PanelForge settings JSON.', 'error');
        }
      });
    });
    els.resetSettings.addEventListener('click', function () {
      var defaults = core.normalizeSettings({});
      applySettings(defaults);
      store.saveSettings(defaults);
      setStatus('Settings reset to defaults.', 'success');
    });
    els.clearHistory.addEventListener('click', function () {
      store.clearHistory().then(renderHistory);
    });
  }

  // ---------------------------------------------------------------------------
  // Result actions + init
  // ---------------------------------------------------------------------------

  function initResultActions() {
    els.downloadAgain.addEventListener('click', function () {
      if (resultBlob) triggerDownload(resultBlob, resultName);
    });
    els.convertAnother.addEventListener('click', function () {
      clearFiles();
      els.result.hidden = true;
      resultBlob = null;
      if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
      setStatus('');
      els.dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function init() {
    try {
      var manifest = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
        ? chrome.runtime.getManifest() : null;
      if (manifest && manifest.version) els.version.textContent = 'v' + manifest.version;
    } catch (e) { /* standalone preview */ }

    initSettingsControls();
    initFileControls();
    initSettingsActions();
    initResultActions();
    renderFiles();
    renderHistory();

    els.form.addEventListener('submit', function (e) { e.preventDefault(); convert(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
