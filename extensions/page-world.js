/* ═══════════════════════════════════════════════════
   工作站同步 · Page World Script
   通过 chrome.scripting.executeScript 注入到 MAIN world
   可直接访问页面 localStorage
   ═══════════════════════════════════════════════════ */

(function() {
  if (window.__wsSyncReady) return;

  var SYNC_KEYS = [
    'workstation-calendar',
    'workstation-notes',
    'workstation-projects',
    'workstation-clients',
    'workstation-client-tags',
    'workstation-preset-tags',
    'workstation-tag-hidden',
    'workstation-site',
  ];

  function getSnapshot() {
    var snap = {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var key = SYNC_KEYS[i];
      var val = localStorage.getItem(key);
      if (val !== null) {
        try { snap[key] = JSON.parse(val); } catch(e) { snap[key] = val; }
      }
    }
    snap._ts = Date.now();
    return snap;
  }

  function setSnapshot(data) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key === '_ts') continue;
      if (SYNC_KEYS.indexOf(key) >= 0) {
        var val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        localStorage.setItem(key, val);
      }
    }
  }

  // 监听来自 content script 的消息
  window.addEventListener('message', function(e) {
    if (e.data && e.data.source === 'ws-sync-content') {
      if (e.data.type === 'get-data') {
        window.postMessage({
          source: 'ws-sync-page',
          type: 'data-response',
          data: getSnapshot()
        }, '*');
      }
      if (e.data.type === 'inject-data') {
        setSnapshot(e.data.data);
        window.postMessage({
          source: 'ws-sync-page',
          type: 'data-injected'
        }, '*');
      }
    }
  });

  // 轮询检测 localStorage 变化
  var _snap = JSON.stringify(getSnapshot());
  setInterval(function() {
    var cur = JSON.stringify(getSnapshot());
    if (cur !== _snap) {
      _snap = cur;
      window.postMessage({
        source: 'ws-sync-page',
        type: 'data-changed',
        data: getSnapshot()
      }, '*');
    }
  }, 3000);

  window.__wsSyncReady = true;
  console.log('[工作站同步] Page script injected via MAIN world');
})();
