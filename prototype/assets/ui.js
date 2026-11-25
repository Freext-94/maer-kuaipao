/* 同城跑腿原型 · 共享 UI 层（无依赖） */
(function (root) {
  'use strict';
  var LS_KEY = 'paotui_proto_v1';

  var UI = {};

  UI.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.money = function (fen) { return '¥' + (Number(fen || 0) / 100).toFixed(2); };
  UI.yuan = function (fen) { return (Number(fen || 0) / 100).toFixed(2); };
  UI.stName = function (s) { return Store.ST[s] ? Store.ST[s].name : s; };
  UI.stColor = function (s) { return Store.ST[s] ? Store.ST[s].color : 'slate'; };
  UI.badge = function (s) { return '<span class="badge ' + UI.stColor(s) + '">' + UI.esc(UI.stName(s)) + '</span>'; };

  UI.order = function (s, id) { return s.orders.filter(function (o) { return o.id === id; })[0] || null; };
  UI.customer = function (s, id) { return s.customers.filter(function (c) { return c.id === id; })[0] || null; };
  UI.merchant = function (s, id) { return s.merchants.filter(function (m) { return m.id === id; })[0] || null; };
  UI.rider = function (s, id) { return s.riders.filter(function (r) { return r.id === id; })[0] || null; };
  UI.advOf = function (s, id) { return s.advances.filter(function (a) { return a.order_id === id; })[0] || null; };
  UI.prepOf = function (s, id) { return s.prep.filter(function (p) { return p.order_id === id; })[0] || null; };
  UI.notifyOf = function (s, id) { return s.notify.filter(function (n) { return n.order_id === id; }); };
  UI.logOf = function (s, id) {
    return s.statusLog.filter(function (l) { return l.order_id === id; }).sort(function (a, b) { return a.at - b.at; });
  };
  UI.isToday = function (ms) {
    var d = new Date(ms), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };

  /* ---------- toast ---------- */
  var toastTimer = null;
  UI.toast = function (msg, kind) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = kind || '';
    el.innerHTML = '<div class="in">' + UI.esc(msg) + '</div>';
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2600);
  };
  UI.err = function (e) { UI.toast(e && e.message ? e.message : String(e), 'err'); };

  /* ---------- 提示音（演示"必须用户手势解锁音频"这条硬限制） ---------- */
  var actx = null, armed = false;
  UI.audioArmed = function () { return armed; };
  UI.armAudio = function () {
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) throw new Error('no AudioContext');
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      armed = true;
      return true;
    } catch (e) { armed = false; return false; }
  };
  UI.beep = function (n) {
    if (!armed || !actx) return false;
    n = n || 2;
    for (var i = 0; i < n; i++) {
      var t = actx.currentTime + i * 0.26;
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(i % 2 ? 880 : 1320, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + 0.24);
    }
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { }
    return true;
  };

  /* ---------- 数据变更订阅（同标签轮询 + 跨标签 storage 事件） ---------- */
  var subs = [];
  UI.onData = function (fn) { subs.push(fn); };
  function fire() {
    if (document.querySelector('.modal.on')) return;
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  root.addEventListener('storage', function (e) { if (e.key === LS_KEY) fire(); });
  root.setInterval(fire, 2500);
  UI.refreshNow = fire;
  UI.reset = function () { Store.reset(); UI.toast('演示数据已重置', 'ok'); setTimeout(function () { root.location.reload(); }, 260); };

  /* ---------- PC 页面骨架 ---------- */
  var NAV = [
    { g: '内部工具（Track A · 无需资质）' },
    { k: 'dispatch', h: 'dispatch.html', t: '调度台 · 看板与电话录单' },
    { k: 'ledger', h: 'ledger.html', t: '客户欠款台账' },
    { k: 'bill', h: 'bill.html', t: '月结对账单' },
    { k: 'merchant', h: 'merchant.html', t: '商家端（手机）' },
    { k: 'rider', h: 'rider.html', t: '骑手端（手机）' },
    { g: '对外小程序（Track B · 需个体工商户）' },
    { k: 'customer', h: 'customer.html', t: '客户端自助下单' },
    { g: '说明' },
    { k: 'index', h: 'index.html', t: '原型导航与演示剧本' }
  ];
  UI.page = function (opt) {
    var nav = NAV.map(function (n) {
      if (n.g) return '<div class="grp">' + UI.esc(n.g) + '</div>';
      return '<a href="' + n.h + '"' + (n.k === opt.active ? ' class="on"' : '') + '>' + UI.esc(n.t) + '</a>';
    }).join('');
    document.body.innerHTML =
      '<div class="app">' +
      '<aside class="side"><div class="logo"><b>同城跑腿 · 可点原型</b><span>数据存在本机浏览器</span></div>' + nav +
      '<div class="grp">演示</div><a href="#" id="navReset">重置演示数据</a></aside>' +
      '<main class="main"><div class="topbar"><h1>' + UI.esc(opt.title) + '</h1>' +
      (opt.sub ? '<span class="muted small">' + UI.esc(opt.sub) + '</span>' : '') +
      '<div class="right row" id="topActions"></div></div>' +
      '<div id="pageBody"></div></main></div>' +
      '<div id="toast"></div>';
    document.getElementById('pageBody').innerHTML = opt.body;
    if (opt.actions) document.getElementById('topActions').innerHTML = opt.actions;
    var r = document.getElementById('navReset');
    if (r) r.addEventListener('click', function (e) { e.preventDefault(); UI.reset(); });
    UI.bannerMount = document.getElementById('pageBody').firstElementChild;
    return document.getElementById('pageBody');
  };

  /* 恒等式自检条：所有页面顶部都挂一条，账不平立刻看见 */
  UI.verifyBar = function () {
    var s = Store.get();
    var issues = Store.verifyLedger(s);
    var today = s.orders.filter(function (o) { return UI.isToday(o.created_at); });
    var doing = today.filter(function (o) { return !Store.isTerminal(o.status); });
    var owed = s.customers.reduce(function (sum, c) { return sum + Math.max(0, Store.customerBalance(s, c.id)); }, 0);
    var advOpen = s.advances.filter(function (a) { return !UI.order(s, a.order_id) || UI.order(s, a.order_id).status !== 'CANCELLED'; })
      .reduce(function (sum, a) { return sum + Math.max(0, a.amount_fen - Store.orderPaid(s, a.order_id)); }, 0);
    var html = issues.length
      ? '<div class="alert err"><b>台账不平（原型不该出现，出现即 bug）：</b>' + UI.esc(issues.join('；')) + '</div>'
      : '<div class="row small" style="gap:18px;flex-wrap:wrap">' +
      '<span><b class="num">' + doing.length + '</b> 单进行中 / 今日 ' + today.length + ' 单</span>' +
      '<span class="hr" style="width:1px;height:14px;background:var(--line);margin:0"></span>' +
      '<span>客户欠款合计 <b class="num">' + UI.money(owed) + '</b></span>' +
      '<span>垫付资金占用 <b class="num">' + UI.money(advOpen) + '</b></span>' +
      '<span class="badge green">恒等式平：余额 = 应收 − 已核销 − 预收</span>' +
      '</div>';
    return '<div class="panel" style="margin-bottom:14px"><div class="bd" style="padding:10px 16px">' + html + '</div></div>';
  };

  /* ---------- 抽屉 ---------- */
  var drawerEl = null, maskEl = null;
  function ensureDrawer() {
    if (drawerEl) return;
    maskEl = document.createElement('div');
    maskEl.className = 'mask';
    maskEl.addEventListener('click', UI.closeDrawer);
    drawerEl = document.createElement('aside');
    drawerEl.className = 'drawer';
    document.body.appendChild(maskEl);
    document.body.appendChild(drawerEl);
  }
  UI.openDrawer = function (opt) {
    ensureDrawer();
    drawerEl.innerHTML =
      '<div class="hd"><h2 style="margin:0">' + opt.title + '</h2><div class="right row">' + (opt.headExtra || '') +
      '<button class="btn sm" id="dwClose">关闭</button></div></div>' +
      '<div class="bd">' + opt.body + '</div>' +
      (opt.foot ? '<div class="ft">' + opt.foot + '</div>' : '');
    maskEl.classList.add('on');
    drawerEl.classList.add('on');
    document.getElementById('dwClose').addEventListener('click', UI.closeDrawer);
    if (opt.onMount) opt.onMount(drawerEl);
  };
  UI.closeDrawer = function () {
    if (!drawerEl) return;
    drawerEl.classList.remove('on');
    maskEl.classList.remove('on');
  };

  /* ---------- 弹窗表单 ---------- */
  UI.modal = function (opt) {
    var box = document.createElement('div');
    box.className = 'modal on';
    box.innerHTML =
      '<div class="box"><div class="hd">' + opt.title + '</div>' +
      '<div class="bd">' + opt.body + '</div>' +
      '<div class="ft"><button class="btn" data-x="no">' + (opt.cancelText || '取消') + '</button>' +
      '<button class="btn pri" data-x="yes">' + (opt.okText || '确定') + '</button></div></div>';
    document.body.appendChild(box);
    function close() { box.remove(); }
    box.querySelector('[data-x=no]').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    box.querySelector('[data-x=yes]').addEventListener('click', function () {
      try {
        if (opt.onOk(box) !== false) close();
      } catch (e) {
        // 业务校验失败和代码 bug 都从这里冒出来：弹给用户看，同时也进控制台，别吞掉
        console.error(e);
        UI.err(e);
      }
    });
    var first = box.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 40);
    return box;
  };

  /* ---------- 手机外框 ---------- */
  UI.mobilePage = function (opt) {
    var links = (opt.roles || []).map(function (r) {
      return '<a href="' + r.h + '"' + (r.k === opt.active ? ' class="badge green" style="text-decoration:none"' : ' class="chip"') + '>' + UI.esc(r.t) + '</a>';
    }).join('');
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:16px 12px 30px">' +
      '<div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap;justify-content:center">' +
      '<a href="index.html" class="chip">← 原型导航</a>' + links + '</div>' +
      '<div class="phone"><div class="frame">' +
      '<div class="status-bar"><span>' + UI.esc(opt.clock || '9:41') + '</span><span>同城跑腿 · ' + UI.esc(opt.roleName) + ' · 演示</span><span>100%</span></div>' +
      '<div class="bar"><span>' + UI.esc(opt.title) + '</span><span class="sub">' + UI.esc(opt.sub || '') + '</span>' +
      '<span class="right" style="margin-left:auto;font-weight:400;font-size:12px">' + (opt.barRight || '') + '</span></div>' +
      '<div class="screen" id="screen"></div>' +
      (opt.tabbar || '') +
      '</div><div class="cap">' + UI.esc(opt.cap || '') + '</div></div></div>' +
      '<div id="toast"></div>';
    return document.getElementById('screen');
  };

  root.UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
