/*
 * PanelForge storage — settings + conversion history.
 * Uses chrome.storage.local inside the extension and falls back to
 * localStorage so the converter page also works standalone (e.g. preview).
 */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'panelforge.settings.v1';
  var HISTORY_KEY = 'panelforge.history.v1';
  var MAX_HISTORY = 20;

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function readLocal(key) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLocal(key, value) {
    try { global.localStorage && global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  function get(key) {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        chrome.storage.local.get([key], function (result) {
          resolve(result && result[key] !== undefined ? result[key] : null);
        });
      });
    }
    return Promise.resolve(readLocal(key));
  }

  function set(key, value) {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        var obj = {}; obj[key] = value;
        chrome.storage.local.set(obj, function () { resolve(); });
      });
    }
    writeLocal(key, value);
    return Promise.resolve();
  }

  function remove(key) {
    if (hasChromeStorage()) {
      return new Promise(function (resolve) {
        chrome.storage.local.remove([key], function () { resolve(); });
      });
    }
    try { global.localStorage && global.localStorage.removeItem(key); } catch (e) { /* noop */ }
    return Promise.resolve();
  }

  global.PanelForgeStorage = {
    SETTINGS_KEY: SETTINGS_KEY,
    HISTORY_KEY: HISTORY_KEY,
    MAX_HISTORY: MAX_HISTORY,
    get: get,
    set: set,
    remove: remove,
    loadSettings: function () { return get(SETTINGS_KEY); },
    saveSettings: function (settings) { return set(SETTINGS_KEY, settings); },
    loadHistory: function () {
      return get(HISTORY_KEY).then(function (h) { return Array.isArray(h) ? h : []; });
    },
    addHistory: function (entry) {
      return get(HISTORY_KEY).then(function (h) {
        var list = Array.isArray(h) ? h : [];
        list.unshift(entry);
        return set(HISTORY_KEY, list.slice(0, MAX_HISTORY));
      });
    },
    clearHistory: function () { return set(HISTORY_KEY, []); }
  };
})(typeof self !== 'undefined' ? self : this);
