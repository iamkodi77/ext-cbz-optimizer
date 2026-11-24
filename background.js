/* PanelForge background — opens the converter on install and adds a
 * context-menu shortcut. All conversion work happens in converter.html. */

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
  }
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'panelforge-open',
      title: 'Open PanelForge converter',
      contexts: ['page', 'action']
    });
  });
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'panelforge-open') {
    chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
  }
});
