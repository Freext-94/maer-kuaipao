/* 马儿快跑 · UI 层 · 可用 API：esc, money, yuan, pct, fmtDate, fmtDay, fmtTime, timeAgo, isToday, toast, err, empty, attachHtml, bindAttach, modal, sheet, closeSheet, require, requirePerm, adminPage, mobilePage, bindTabbar, goLogin, logout, switchWorkspace, goWorkspace */
(function (root) {
  'use strict';

  var UI = {};

  var LOGO = 'assets/brand/logo-card-transparent-1200.png';
  var ROLE_NAME = { admin: '调度台', merchant: '商家工作台', rider: '骑手端', customer: '客户端' };
  var ROLE_PAGE = { admin: 'dispatch.html', merchant: 'merchant.html', rider: 'rider.html', customer: 'customer.html' };

  var ADMIN_TABS = [
    { k: 'dispatch', href: 'dispatch.html', t: '工作台', icon: 'tab-order.svg', perm: 'order.view' },
    { k: 'orders', href: 'dispatch.html?view=orders', t: '订单', icon: 'tab-order.svg', perm: 'order.view' },
    { k: 'billing', href: 'billing.html', t: '账单', icon: 'tab-bill.svg', perm: 'bill.view' },
    { k: 'users', href: 'users.html', t: '用户', full: '用户与权限', icon: 'tab-user.svg', perm: 'user.view' },
    { k: 'me', href: 'settings.html?view=me', t: '我的', icon: 'tab-mine.svg' }
  ];

  function store() { return root.Store || null; }

  function can(perm) {
    try { return !!(store() && store().can(perm)); } catch (e) { return false; }
  }

  function frame(inner) {
    return '<div class="app-frame"><div class="app-screen"><div class="page">' + inner + '</div></div></div>';
  }

  function toastNode() { return '<div id="toast" class="toast"></div>'; }

  function mountBody(inner) {
    document.body.innerHTML = frame(inner) + toastNode();
  }

  function currentPage() {
    return (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
  }

  /* ---------- 格式化 ---------- */
  UI.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.money = function (fen) { return '¥' + (Number(fen || 0) / 100).toFixed(2); };
  UI.yuan = function (fen) { return (Number(fen || 0) / 100).toFixed(2); };
  UI.pct = function (n) { return Math.round(Number(n || 0) * 100) + '%'; };

  UI.fmtDate = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  UI.fmtDay = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  UI.fmtTime = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  UI.timeAgo = function (iso) {
    if (!iso) return '—';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return String(iso);
    var diff = Date.now() - t;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return Math.floor(diff / 86400000) + ' 天前';
  };
  UI.isToday = function (iso) {
    if (!iso) return false;
    try {
      if (store() && typeof store().isToday === 'function') return !!store().isToday(iso);
    } catch (e) { /* 落到本地判断 */ }
    var d = new Date(iso), n = new Date();
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };

  /* ---------- 轻提示 ---------- */
  var toastTimer = null;
  UI.toast = function (msg, kind) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = 'toast ' + (kind || '');
    el.textContent = String(msg == null ? '' : msg);
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2600);
  };
  UI.err = function (e) {
    UI.toast(e && e.message ? e.message : String(e), 'err');
  };

  /* ---------- 空状态 / 附件 ---------- */
  UI.empty = function (img, title, desc) {
    var src = img || 'assets/brand/empty-orders.svg';
    return '<div class="empty">' +
      '<img src="' + UI.esc(src) + '" alt="">' +
      (title ? '<b>' + UI.esc(title) + '</b>' : '') +
      (desc ? '<span>' + UI.esc(desc) + '</span>' : '') +
      '</div>';
  };

  UI.attachHtml = function (list, removable) {
    if (!list || !list.length) return '<div class="muted small">还没有附件</div>';
    return '<div class="attach-list">' + list.map(function (a) {
      var isAudio = a.kind === 'audio';
      return '<div class="attach-item" data-att="' + UI.esc(a.id) + '">' +
        '<span class="ic">' + (isAudio ? '音' : '图') + '</span>' +
        '<span class="nm" title="' + UI.esc(a.name) + '">' + UI.esc(a.name || '未命名附件') + '</span>' +
        '<span class="muted small nowrap">' + UI.esc(a.size || '') + '</span>' +
        (isAudio ? '<button type="button" class="btn sm" data-play="' + UI.esc(a.id) + '">▶</button>' : '') +
        (removable ? '<button type="button" class="rm" data-rm="' + UI.esc(a.id) + '" aria-label="移除附件">×</button>' : '') +
        '</div>';
    }).join('') + '</div>';
  };

  UI.bindAttach = function (scope, draft, onChange) {
    if (!scope) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-rm]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-rm');
        draft.attachments = (draft.attachments || []).filter(function (a) { return String(a.id) !== id; });
        if (onChange) onChange();
      });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-play]'), function (b) {
      b.addEventListener('click', function () {
        UI.toast('原型不播放真实音频；正式版这里会显示语音条', 'ok');
      });
    });
  };

  /* ---------- 浮层：模态 / 底部抽屉 ---------- */
  UI.modal = function (opt) {
    opt = opt || {};
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-hd">' + (opt.title || '') +
      '<button type="button" class="btn sm ghost" data-x="close">关闭</button></div>' +
      '<div class="modal-bd">' + (opt.body || '') + '</div>' +
      '<div class="modal-ft">' +
      '<button type="button" class="btn" data-x="no">' + UI.esc(opt.cancelText || '取消') + '</button>' +
      '<button type="button" class="btn pri" data-x="yes">' + UI.esc(opt.okText || '确定') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);

    var modal = mask.querySelector('.modal');
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }

    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    mask.querySelector('[data-x="close"]').addEventListener('click', close);
    mask.querySelector('[data-x="no"]').addEventListener('click', close);
    mask.querySelector('[data-x="yes"]').addEventListener('click', function () {
      try {
        if (opt.onOk && opt.onOk(modal) === false) return;
        close();
      } catch (e) {
        console.error(e);
        UI.err(e);
      }
    });
    if (opt.onMount) {
      try { opt.onMount(modal); } catch (e) { console.error(e); }
    }
    var first = modal.querySelector('input:not([type="hidden"]),select,textarea');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) { /* ignore */ } }, 40);
    return modal;
  };

  var sheetEl = null;
  UI.sheet = function (opt) {
    opt = opt || {};
    UI.closeSheet();
    var mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-hd">' + (opt.title || '') +
      '<button type="button" class="btn sm ghost" data-x="close">关闭</button></div>' +
      '<div class="sheet-bd">' + (opt.body || '') + '</div>' +
      (opt.foot != null ? '<div class="sheet-ft">' + opt.foot + '</div>' : '') +
      '</div>';
    document.body.appendChild(mask);
    sheetEl = mask;

    mask.addEventListener('click', function (e) { if (e.target === mask) UI.closeSheet(); });
    mask.querySelector('[data-x="close"]').addEventListener('click', UI.closeSheet);
    if (opt.onMount) {
      try { opt.onMount(mask.querySelector('.sheet')); } catch (e) { console.error(e); }
    }
    return mask.querySelector('.sheet');
  };
  UI.closeSheet = function () {
    if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl);
    sheetEl = null;
  };

  /* ---------- 会话 / 鉴权 ---------- */
  UI.goLogin = function (next) {
    var target = next || currentPage();
    location.href = 'login.html?next=' + encodeURIComponent(target);
  };

  UI.require = function (role) {
    var s = null, me = null;
    try { s = store() ? store().session() : null; } catch (e) { s = null; }
    if (!s) { UI.goLogin(); return false; }
    try { me = store().me(); } catch (e) { me = null; }
    if (!me) {
      try { store().logout(); } catch (e) { /* ignore */ }
      UI.goLogin();
      return false;
    }
    if (role && s.type !== role) {
      location.href = 'login.html?switch=1';
      return false;
    }
    return true;
  };

  function permLabel(perm) {
    try {
      var groups = store().PERM_GROUPS || [];
      for (var i = 0; i < groups.length; i++) {
        var items = groups[i].items || [];
        for (var j = 0; j < items.length; j++) {
          if (items[j][0] === perm) return items[j][1];
        }
      }
    } catch (e) { /* ignore */ }
    return perm;
  }

  UI.requirePerm = function (perm) {
    var s = null, me = null;
    try { s = store() ? store().session() : null; } catch (e) { s = null; }
    try { me = store() ? store().me() : null; } catch (e) { me = null; }
    if (!s || !me) {
      try { if (s) store().logout(); } catch (e) { /* ignore */ }
      UI.goLogin();
      return false;
    }
    if (can(perm)) return true;

    var who = UI.esc(me.name) + '，';
    var label = UI.esc(permLabel(perm));
    var roleName = ROLE_NAME[s.type] || '工作台';

    mountBody(
      '<header class="topbar">' +
      '<img class="topbar-logo" src="' + LOGO + '" alt="马儿快跑">' +
      '<div class="topbar-main"><div class="topbar-title">没有权限</div>' +
      '<div class="topbar-sub">' + UI.esc(me.name) + ' · ' + UI.esc(roleName) + '</div></div>' +
      '</header>' +
      '<div class="page-body">' +
      '<div class="card" style="padding:26px 18px;text-align:center">' +
      '<span class="badge red">403</span>' +
      '<h2 style="margin:12px 0 6px;font-size:16px">当前账号没有「' + label + '」权限</h2>' +
      '<p class="muted small" style="margin-bottom:0">' + who +
      '这个操作需要管理员授权。可以换一个有权限的账号，或让超级管理员在「用户及权限」里开通。</p>' +
      '<div class="nav-actions">' +
      '<a class="btn pri block" href="login.html?switch=1">切换账号</a>' +
      '<a class="btn ghost block" href="index.html">回原型导航</a>' +
      '</div></div></div>'
    );
    return false;
  };

  UI.logout = function () {
    try { store().logout(); } catch (e) { /* ignore */ }
    location.href = 'login.html';
  };
  UI.switchWorkspace = function () { location.href = 'login.html?switch=1'; };
  UI.goWorkspace = function (ws) {
    try {
      var St = store();
      if (!St) throw new Error('数据层没有加载');
      var me = St.me();
      if (!me) { UI.goLogin(); return; }
      St.setSession(me.id, ws);
      location.href = ROLE_PAGE[ws.type] || 'index.html';
    } catch (e) {
      UI.err(e);
    }
  };

  /* ---------- 管理端手机壳 ---------- */
  function todayFeeFen() {
    var St = store();
    try {
      if (St && typeof St.billingSummary === 'function') {
        var sum = St.billingSummary();
        if (sum && typeof sum.todayServiceFeeFen === 'number') return sum.todayServiceFeeFen;
      }
    } catch (e) { /* 回退旧口径 */ }
    try {
      var orders = St.get().orders || [];
      return orders.reduce(function (total, x) {
        if (x.status === 'CANCELLED' || !UI.isToday(x.createdAt)) return total;
        return total + Number(x.serviceFeeFen || 0);
      }, 0);
    } catch (e) { return 0; }
  }

  function topbarHtml(o) {
    var fee = todayFeeFen();
    var me = null;
    try { me = store() ? store().me() : null; } catch (e) { me = null; }

    return '<header class="topbar">' +
      '<img class="topbar-logo" src="' + LOGO + '" alt="马儿快跑">' +
      '<div class="topbar-main">' +
      '<div class="topbar-title">' + UI.esc(o.title || '工作台') + '</div>' +
      (o.sub ? '<div class="topbar-sub">' + UI.esc(o.sub) + '</div>' : '') +
      '</div>' +
      '<div class="topbar-meta">' +
      '<span class="fee">今天 ' + UI.money(fee) + '</span>' +
      '<b>' + UI.esc(me ? me.name : '未登录') + '</b>' +
      '</div>' +
      '</header>';
  }

  function adminTabbar(active) {
    var tabs = ADMIN_TABS.filter(function (t) { return !t.perm || can(t.perm); });
    return '<nav class="tabbar">' + tabs.map(function (t) {
      var on = t.k === active;
      var label = t.full || t.t;
      return '<a href="' + t.href + '"' + (on ? ' class="on" aria-current="page"' : '') +
        ' title="' + UI.esc(label) + '" aria-label="' + UI.esc(label) + '">' +
        '<img src="assets/brand/' + t.icon + '" alt="">' +
        '<span>' + UI.esc(t.t) + '</span>' +
        '</a>';
    }).join('') + '</nav>';
  }

  function fabHtml(fab) {
    if (!fab) return '';
    if (!can('order.create')) return '';
    var o = typeof fab === 'string' ? { label: fab } : (fab || {});
    var href = o.href || 'dispatch.html?new=1';
    var label = o.label || '录单';
    return '<a class="fab" href="' + UI.esc(href) + '">＋ ' + UI.esc(label) + '</a>';
  }

  UI.adminPage = function (opt) {
    opt = opt || {};
    if (!UI.require('admin')) return null;
    if (opt.perm && !UI.requirePerm(opt.perm)) return null;

    var html = topbarHtml(opt) +
      (opt.actions ? '<div class="topbar-actions">' + opt.actions + '</div>' : '') +
      '<div class="page-body" id="pageBody">' + (opt.body || '') + '</div>' +
      adminTabbar(opt.active) +
      fabHtml(opt.fab);

    mountBody(html);
    return document.getElementById('pageBody');
  };

  /* ---------- 商家 / 骑手 / 客户端手机壳 ---------- */
  UI.mobilePage = function (opt) {
    opt = opt || {};
    if (!UI.require(opt.role)) return null;

    var me = null;
    try { me = store() ? store().me() : null; } catch (e) { me = null; }
    var roleName = opt.roleName || ROLE_NAME[opt.role] || '工作台';

    var html =
      '<header class="topbar">' +
      '<img class="topbar-logo" src="' + LOGO + '" alt="马儿快跑">' +
      '<div class="topbar-main">' +
      '<div class="topbar-title">' + UI.esc(opt.title || roleName) + '</div>' +
      (opt.sub ? '<div class="topbar-sub">' + UI.esc(opt.sub) + '</div>' : '') +
      '</div>' +
      '<div class="topbar-meta"><b>' + UI.esc(me ? me.name : '未登录') + '</b>' + UI.esc(roleName) + '</div>' +
      '</header>' +
      '<div class="page-body" id="pageBody">' + (opt.body || '') + '</div>' +
      (opt.tabbar ? '<nav class="tabbar">' + opt.tabbar + '</nav>' : '');

    document.body.innerHTML = frame(html) + toastNode();
    return document.getElementById('pageBody');
  };

  UI.bindTabbar = function (fn) {
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar [data-tab]'), function (el) {
      el.addEventListener('click', function (e) {
        var href = el.getAttribute('href');
        if (el.tagName === 'A' && (!href || href === '#')) e.preventDefault();
        if (typeof fn === 'function') fn(el.getAttribute('data-tab'), el);
      });
    });
  };

  root.UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
