/* PanelForge popup — launcher + current-settings summary. */
(function () {
  'use strict';

  var core = window.PanelForgeCore;
  var store = window.PanelForgeStorage;

  function openConverter() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
    } else {
      window.open('converter.html', '_blank');
    }
  }

  function deviceLabel(settings) {
    if (!settings.maxWidth && !settings.maxHeight) return 'Original size';
    return settings.maxWidth + '×' + settings.maxHeight + ' px';
  }

  function init() {
    document.getElementById('open-converter').addEventListener('click', openConverter);

    store.loadSettings().then(function (stored) {
      var s = core.normalizeSettings(stored);
      var summary = document.getElementById('summary');
      summary.textContent =
        'Output: ' + s.format.toUpperCase() + ' · ' + s.quality + '% quality\n' +
        'Layout: ' + (s.layout === 'webtoon' ? 'Webtoon strip' : 'Standard pages') + ' · ' +
        (s.direction === 'rtl' ? 'Right-to-left (manga)' : 'Left-to-right') + '\n' +
        'Screen: ' + deviceLabel(s) + (s.splitSpreads ? ' · Splitting spreads' : '');
      summary.style.whiteSpace = 'pre-line';
    });

    store.loadHistory().then(function (history) {
      if (!history.length) return;
      var last = history[0];
      var el = document.getElementById('last');
      el.hidden = false;
      el.textContent = 'Last: ' + last.name + ' — ' + last.pages + ' pages · ' + core.formatBytes(last.size);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
