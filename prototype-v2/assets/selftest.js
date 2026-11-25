/* 马儿快跑 · 原型 v2 · 数据层自检（浏览器 console + 结果面板） */
(function (root) {
  'use strict';

  var doc = root.document;

  function logResults(results) {
    if (!root.console) return;
    var failed = results.filter(function (r) { return !r.ok; }).length;
    var title = 'Store 自检：' + (results.length - failed) + ' 通过 / ' + failed + ' 失败';
    if (console.groupCollapsed) {
      console.groupCollapsed(title);
      results.forEach(function (r) {
        if (r.ok) console.log('[通过] ' + r.name + ' — ' + r.msg);
        else console.error('[失败] ' + r.name + ' — ' + r.msg);
      });
      console.groupEnd();
    } else {
      console.log(title);
      results.forEach(function (r) { console.log((r.ok ? '[通过] ' : '[失败] ') + r.name + ' — ' + r.msg); });
    }
  }

  function renderPanel(results) {
    if (!doc || !doc.body || doc.body.children.length === 0) return;
    var old = doc.getElementById('storeSelftestPanel');
    if (old) old.parentNode.removeChild(old);

    var failed = results.filter(function (r) { return !r.ok; }).length;
    var panel = doc.createElement('div');
    panel.id = 'storeSelftestPanel';
    panel.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px', 'z-index:99999',
      'width:min(360px, calc(100vw - 28px))', 'max-height:52vh', 'overflow:auto',
      'background:#111', 'color:#f5f5f5', 'border:1px solid #333', 'border-radius:10px',
      'padding:10px 12px', 'font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)'
    ].join(';');

    var head = doc.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
    var title = doc.createElement('b');
    title.textContent = 'Store 自检';
    var badge = doc.createElement('span');
    badge.textContent = (results.length - failed) + ' 通过 / ' + failed + ' 失败';
    badge.style.cssText = 'margin-left:auto;font-weight:600;color:' + (failed ? '#ff7b7b' : '#79d97f');
    head.appendChild(title);
    head.appendChild(badge);
    panel.appendChild(head);

    results.forEach(function (r) {
      var row = doc.createElement('div');
      row.style.cssText = 'padding:3px 0;border-top:1px solid #262626';
      var mark = doc.createElement('span');
      mark.textContent = r.ok ? '✓ ' : '✕ ';
      mark.style.color = r.ok ? '#79d97f' : '#ff7b7b';
      var name = doc.createElement('b');
      name.textContent = r.name;
      var msg = doc.createElement('span');
      msg.textContent = ' — ' + r.msg;
      msg.style.color = '#b9b9b9';
      row.appendChild(mark);
      row.appendChild(name);
      row.appendChild(msg);
      panel.appendChild(row);
    });

    doc.body.appendChild(panel);
  }

  function run() {
    var results;
    if (!root.Store || typeof root.Store.selftest !== 'function') {
      results = [{ name: '加载数据层', ok: false, msg: '没有找到 Store.selftest，请先引入 assets/store.js' }];
    } else {
      try {
        results = root.Store.selftest();
      } catch (e) {
        results = [{ name: '运行自检', ok: false, msg: (e && e.message) ? e.message : String(e) }];
      }
    }
    logResults(results);
    renderPanel(results);
    return results;
  }

  if (doc && doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
