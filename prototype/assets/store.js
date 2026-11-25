/* 同城跑腿原型 · 数据层
 * 金额一律整数分。台账只可追加流水，余额是流水的派生值。
 * 浏览器用 localStorage；Node 里可直接 require 做逻辑冒烟测试。
 */
(function (root) {
  'use strict';

  var KEY = 'paotui_proto_v1';
  var DAY = 86400000;

  /* ---------- 金额与时间 ---------- */
  function yuan2fen(v) { return Math.round(Number(v || 0) * 100); }
  function fen2yuan(f) { return (Number(f || 0) / 100).toFixed(2); }
  function money(f) { return '¥' + fen2yuan(f); }
  function nowMs() { return Date.now(); }
  function iso(ms) { return new Date(ms).toISOString(); }
  function periodOf(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function stamp(ms) {
    var d = new Date(ms);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function today0(offsetDays) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime() + (offsetDays || 0) * DAY;
  }
  function at(hour, minute, offsetDays) {
    var d = new Date(today0(offsetDays));
    d.setHours(hour, minute || 0, 0, 0);
    return d.getTime();
  }

  /* ---------- 订单状态机 ---------- */
  var ST = {
    PENDING_DISPATCH: { name: '待派单', color: 'slate' },
    PENDING_PREP: { name: '待商家备货', color: 'amber' },
    READY_FOR_PICKUP: { name: '备货完成', color: 'blue' },
    PICKED_UP: { name: '已取货', color: 'violet' },
    DELIVERING: { name: '配送中', color: 'cyan' },
    DELIVERED: { name: '已送达', color: 'orange' },
    FINISHED: { name: '已结清/已挂账', color: 'green' },
    CANCELLED: { name: '已取消', color: 'red' }
  };
  var TRANSITIONS = {
    PENDING_DISPATCH: ['PENDING_PREP', 'CANCELLED'],
    PENDING_PREP: ['READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['DELIVERING', 'CANCELLED'],
    DELIVERING: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['FINISHED', 'CANCELLED'],
    FINISHED: [],
    CANCELLED: []
  };
  function canMove(from, to) { return (TRANSITIONS[from] || []).indexOf(to) >= 0; }
  function isTerminal(s) { return s === 'FINISHED' || s === 'CANCELLED'; }

  var ACTION_OF = {
    PENDING_PREP: '通知商家备货',
    READY_FOR_PICKUP: '备货完成',
    PICKED_UP: '已取货',
    DELIVERING: '开始配送',
    DELIVERED: '送达',
    FINISHED: '结单',
    CANCELLED: '取消订单'
  };

  /* ---------- 种子数据 ---------- */
  function seed() {
    var s = {
      seq: { order: 1006, entry: 500, notify: 1, bill: 1 },
      settings: { base_fee_fen: 800, operator: '老板' },
      merchants: [
        { id: 'M1', name: '瑞雪生鲜超市', category: '超市', phone: '13908001111', prep_timeout_min: 15 },
        { id: 'M2', name: '康泰大药房（科华店）', category: '药店', phone: '13908002222', prep_timeout_min: 8 },
        { id: 'M3', name: '巷口水果铺', category: '水果', phone: '13908003333', prep_timeout_min: 10 }
      ],
      riders: [
        { id: 'R1', name: '小李', phone: '13700001111' },
        { id: 'R2', name: '老板本人', phone: '13700002222' }
      ],
      customers: [
        {
          id: 'C1', name: '王姐', phone: '13512340001', billing_cycle: 'on_credit',
          credit_limit_fen: 50000, settle_day: 5, note: '老客户，住天府大道，经常赊账',
          addresses: [
            { id: 'A1', contact_name: '王姐', contact_phone: '13512340001', poi: '天府新城 B 区 3 栋', detail: '3 单元 1802', floor: 18, elevator: true },
            { id: 'A2', contact_name: '王姐老公', contact_phone: '13512340009', poi: '科华路小学 门卫室', detail: '放门卫即可', floor: 0, elevator: false }
          ]
        },
        {
          id: 'C2', name: '张哥', phone: '13512340002', billing_cycle: 'cod',
          credit_limit_fen: 0, settle_day: 0, note: '货到付款，从不赊账',
          addresses: [{ id: 'A3', contact_name: '张哥', contact_phone: '13512340002', poi: '锦绣花园 7 栋', detail: '7-2-301', floor: 3, elevator: true }]
        },
        {
          id: 'C3', name: '李叔', phone: '13512340003', billing_cycle: 'monthly',
          credit_limit_fen: 80000, settle_day: 10, note: '月结，每月 10 号统一转账',
          addresses: [{ id: 'A4', contact_name: '李叔', contact_phone: '13512340003', poi: '华西宿舍 2 栋', detail: '2-1-45', floor: 4, elevator: false }]
        },
        {
          id: 'C4', name: '陈女士', phone: '13512340004', billing_cycle: 'on_credit',
          credit_limit_fen: 20000, settle_day: 5, note: '新客，额度先给 200',
          addresses: [{ id: 'A5', contact_name: '陈女士', contact_phone: '13512340004', poi: '汇日央扩 16 楼', detail: '前台代收', floor: 16, elevator: true }]
        }
      ],
      orders: [], entries: [], advances: [], prep: [], tasks: [],
      notify: [], statusLog: [], exceptions: [], bills: [], allocations: [],
      quota: [
        { owner: '瑞雪生鲜超市', tmpl: '新单提醒', quota_left: 0 },
        { owner: '康泰大药房（科华店）', tmpl: '新单提醒', quota_left: 2 }
      ],
      pollCursor: 0
    };
    buildHistory(s);
    buildToday(s);
    return s;
  }

  function nextOrderNo(s) {
    s.seq.order += 1;
    return 'PT' + String(nowMs()).slice(-6) + String(s.seq.order).slice(-3);
  }

  /* 历史订单：只留下台账与垫付结果，用于让欠款页和对账单有内容 */
  function buildHistory(s) {
    var hist = [
      { d: -12, h: 9, cust: 'C3', mer: 'M1', est: 15600, real: 15600, fee: 1000, pay: 0, note: '月结：菜油+鸡蛋+水果' },
      { d: -9, h: 15, cust: 'C1', mer: 'M3', est: 6400, real: 6800, fee: 800, pay: 7600, note: '西瓜+饮料，当场付 76' },
      { d: -6, h: 10, cust: 'C1', mer: 'M2', est: 12800, real: 12800, fee: 800, pay: 0, note: '代取药（医保卡）' },
      { d: -5, h: 14, cust: 'C4', mer: 'M1', est: 8800, real: 8800, fee: 800, pay: 0, note: '纸巾囤货' },
      { d: -3, h: 11, cust: 'C1', mer: 'M1', est: 4200, real: 4200, fee: 800, pay: 5000, note: '牛奶，付 50 欠 0（余 10 抵下次的口头约定不记账）' },
      { d: -2, h: 16, cust: 'C4', mer: 'M2', est: 24500, real: 24500, fee: 1200, pay: 0, note: '代买保健品（超过 200 额度，本单已口头提醒）' }
    ];
    hist.forEach(function (h, i) {
      var created = at(h.h, 20, h.d);
      var o = {
        id: 'H' + i, order_no: 'PT' + String(created).slice(-8), source: 'phone',
        created_by: '老板', created_at: created,
        customer_id: h.cust, merchant_id: h.mer, rider_id: i % 2 ? 'R2' : 'R1',
        address: null,
        items: [{ text: h.note, qty: 1, unit_est_fen: h.est, unit_real_fen: h.real }],
        goods_est_fen: h.est, goods_real_fen: h.real, service_fee_fen: h.fee,
        status: 'FINISHED', period_month: periodOf(created),
        ts: {
          dispatched_at: created + 60000, ready_at: created + 8 * 60000,
          picked_at: created + 25 * 60000, delivering_at: created + 28 * 60000,
          delivered_at: created + 45 * 60000, finished_at: created + 46 * 60000
        },
        attachments: [{ type: 'receipt', name: '小票-' + i + '.jpg' }],
        cancel_reason: null, note: h.note
      };
      var c = s.customers.filter(function (x) { return x.id === h.cust; })[0];
      o.address = { poi: c.addresses[0].poi, detail: c.addresses[0].detail, contact_name: c.addresses[0].contact_name, contact_phone: c.addresses[0].contact_phone, floor: c.addresses[0].floor, elevator: c.addresses[0].elevator };
      s.orders.push(o);
      s.advances.push({ id: 'ADV' + i, order_id: o.id, amount_fen: h.real, method: 'transfer', recovered_fen: 0, status: 'settled', created_at: created });
      // 挂账 + 收款
      s.entries.push({
        id: 'E' + (s.seq.entry += 1), customer_id: h.cust, order_id: o.id, type: 'charge',
        amount_fen: h.real + h.fee, occurred_at: created + 46 * 60000, period_month: o.period_month,
        operator: '老板', note: '结单挂账', reversal_of_id: null
      });
      if (h.pay > 0) {
        s.entries.push({
          id: 'E' + (s.seq.entry += 1), customer_id: h.cust, order_id: o.id, type: 'payment',
          amount_fen: -h.pay, occurred_at: created + 47 * 60000, period_month: o.period_month,
          operator: '老板', note: '现金/转账', reversal_of_id: null
        });
      }
      s.statusLog.push({ order_id: o.id, from: null, to: 'PENDING_DISPATCH', actor: '老板', role: 'staff', at: created, reason: '电话录单（历史）' });
      s.statusLog.push({ order_id: o.id, from: 'DELIVERED', to: 'FINISHED', actor: '老板', role: 'staff', at: created + 46 * 60000, reason: '结单' });
    });
    runAllocations(s);
  }

  /* 今日订单：覆盖各种状态，方便看板上手就有东西 */
  function buildToday(s) {
    // 1) 待派单（刚接的电话）
    var t1 = at(8, 40, 0);
    s.orders.push(mkOrder(s, {
      id: 'T1', created_at: t1, source: 'phone', customer_id: 'C2', merchant_id: 'M3',
      rider_id: null, status: 'PENDING_DISPATCH', est: 5800, fee: 800,
      text: '5 斤车厘子 + 2 盒蓝莓', addr: 'A3', note: '客户说 11 点前到'
    }));
    // 2) 待商家备货（已通知，商家未确认）
    var t2 = at(9, 5, 0);
    s.orders.push(mkOrder(s, {
      id: 'T2', created_at: t2, source: 'phone', customer_id: 'C1', merchant_id: 'M2',
      rider_id: 'R1', status: 'PENDING_PREP', est: 9600, fee: 800,
      text: '代取降压药 3 盒（带上次的小票照片）', addr: 'A1', note: '', prep_at: t2 + 60000
    }));
    s.prep[s.prep.length] = { order_id: 'T2', merchant_id: 'M2', status: 'notified', notified_at: t2 + 60000, ready_at: null, acked_channel: null, shortage: false };
    pushNotify(s, 'T2', 'new_order', 'poll', '瑞雪→康泰 常驻页', 'polled', t2 + 60000);
    // 3) 备货完成（等取货）
    var t3 = at(9, 30, 0);
    s.orders.push(mkOrder(s, {
      id: 'T3', created_at: t3, source: 'online', customer_id: 'C4', merchant_id: 'M1',
      rider_id: 'R2', status: 'READY_FOR_PICKUP', est: 3200, fee: 800,
      text: '一瓶酱油 + 一袋盐 + 4 个西红柿', addr: 'A5', note: '线上自助下单（客户手机）', prep_at: t3 + 5 * 60000
    }));
    s.prep.push({ order_id: 'T3', merchant_id: 'M1', status: 'ready', notified_at: t3 + 30000, ready_at: t3 + 5 * 60000, acked_channel: 'poll', shortage: false });
    // 4) 配送中
    var t4 = at(10, 0, 0);
    s.orders.push(mkOrder(s, {
      id: 'T4', created_at: t4, source: 'phone', customer_id: 'C3', merchant_id: 'M1',
      rider_id: 'R1', status: 'DELIVERING', est: 12400, real: 12900, fee: 1000,
      text: '米 10 斤 + 鸡蛋 2 板', addr: 'A4', note: '', prep_at: t4 + 4 * 60000,
      picked_at: t4 + 20 * 60000, delivering_at: t4 + 24 * 60000
    }));
    s.prep.push({ order_id: 'T4', merchant_id: 'M1', status: 'ready', notified_at: t4 + 2 * 60000, ready_at: t4 + 4 * 60000, acked_channel: 'poll', shortage: false });
    s.advances.push({ id: 'ADVT4', order_id: 'T4', amount_fen: 12900, method: 'cash', recovered_fen: 0, status: 'paid', created_at: t4 + 20 * 60000 });
    s.tasks.push({ order_id: 'T4', rider_id: 'R1', assigned_by: '老板', status: 'delivering', pickup_at: t4 + 20 * 60000, delivered_at: null, note: '' });
    s.statusLog.push({ order_id: 'T4', from: 'READY_FOR_PICKUP', to: 'PICKED_UP', actor: '小李', role: 'rider', at: t4 + 20 * 60000, reason: '实付 129.00，小票已拍' });
    s.statusLog.push({ order_id: 'T4', from: 'PICKED_UP', to: 'DELIVERING', actor: '小李', role: 'rider', at: t4 + 24 * 60000, reason: '' });
    // 5) 已送达待结（客户当场付了一部分）
    var t5 = at(8, 10, 0);
    s.orders.push(mkOrder(s, {
      id: 'T5', created_at: t5, source: 'phone', customer_id: 'C1', merchant_id: 'M3',
      rider_id: 'R2', status: 'DELIVERED', est: 4600, real: 4600, fee: 800,
      text: '凤梨 2 个', addr: 'A1', note: '', prep_at: t5 + 3 * 60000,
      picked_at: t5 + 18 * 60000, delivering_at: t5 + 20 * 60000, delivered_at: t5 + 35 * 60000
    }));
    s.prep.push({ order_id: 'T5', merchant_id: 'M3', status: 'ready', notified_at: t5 + 60000, ready_at: t5 + 3 * 60000, acked_channel: 'poll', shortage: false });
    s.advances.push({ id: 'ADVT5', order_id: 'T5', amount_fen: 4600, method: 'transfer', recovered_fen: 0, status: 'paid', created_at: t5 + 18 * 60000 });
    s.tasks.push({ order_id: 'T5', rider_id: 'R2', assigned_by: '老板', status: 'delivered', pickup_at: t5 + 18 * 60000, delivered_at: t5 + 35 * 60000, note: '' });
  }

  function mkOrder(s, o) {
    var cust = s.customers.filter(function (c) { return c.id === o.customer_id; })[0];
    var addr = cust.addresses.filter(function (a) { return a.id === o.addr; })[0] || cust.addresses[0];
    var rec = {
      id: o.id, order_no: 'PT' + String(o.created_at).slice(-8), source: o.source,
      created_by: o.source === 'phone' ? '老板' : '客户自助',
      created_at: o.created_at, customer_id: o.customer_id, merchant_id: o.merchant_id,
      rider_id: o.rider_id,
      address: { poi: addr.poi, detail: addr.detail, contact_name: addr.contact_name, contact_phone: addr.contact_phone, floor: addr.floor, elevator: addr.elevator },
      items: [{ text: o.text, qty: 1, unit_est_fen: o.est, unit_real_fen: o.real || null }],
      goods_est_fen: o.est, goods_real_fen: o.real || null, service_fee_fen: o.fee,
      status: o.status, period_month: periodOf(o.created_at), note: o.note || '',
      attachments: [], cancel_reason: null,
      ts: {
        dispatched_at: o.prep_at ? o.prep_at - 30000 : null,
        notified_at: o.prep_at || null,
        ready_at: o.prep_at || null,
        picked_at: o.picked_at || null,
        delivering_at: o.delivering_at || null,
        delivered_at: o.delivered_at || null,
        finished_at: o.finished_at || null
      }
    };
    s.statusLog.push({ order_id: o.id, from: null, to: 'PENDING_DISPATCH', actor: rec.created_by, role: 'staff', at: o.created_at, reason: o.source === 'phone' ? '电话接单录单' : '客户小程序下单' });
    return rec;
  }

  function pushNotify(s, order_id, scene, channel, target, status, atMs) {
    s.seq.notify += 1;
    s.notify.push({
      id: 'N' + s.seq.notify, order_id: order_id, scene: scene, channel: channel,
      target: target, status: status, at: atMs || nowMs(), acked_at: status === 'acked' ? (atMs || nowMs()) : null
    });
  }

  /* ---------- 计算层（派生值，全部由原始数据算出） ---------- */
  function find(s, coll, id) { return s[coll].filter(function (x) { return x.id === id; })[0] || null; }
  function orderById(s, id) { return find(s, 'orders', id); }
  function entriesOf(s, customerId) {
    return s.entries.filter(function (e) { return e.customer_id === customerId; })
      .sort(function (a, b) { return a.occurred_at - b.occurred_at; });
  }

  /* 单张订单应收 = 货款(取货后锁定 real) + 跑腿费 + 该单所有 adjust/waive 流水 */
  function orderReceivable(s, o) {
    var goods = (o.goods_real_fen != null) ? o.goods_real_fen : o.goods_est_fen;
    var adj = s.entries.filter(function (e) {
      return e.order_id === o.id && (e.type === 'adjust' || e.type === 'waive');
    }).reduce(function (sum, e) { return sum + e.amount_fen; }, 0);
    return goods + o.service_fee_fen + adj;
  }
  /* 该单被核销了多少（只算已挂账 charge 上分摊到的付款） */
  function orderPaid(s, orderId) {
    var charge = s.entries.filter(function (e) { return e.order_id === orderId && e.type === 'charge'; })[0];
    if (!charge) return 0;
    return s.allocations.filter(function (a) { return a.charged_entry_id === charge.id; })
      .reduce(function (sum, a) { return sum + a.allocated_fen; }, 0);
  }
  function customerBalance(s, customerId) {
    return entriesOf(s, customerId).reduce(function (sum, e) { return sum + e.amount_fen; }, 0);
  }
  function disputedOf(s, customerId) {
    var ids = s.orders.filter(function (o) { return o.customer_id === customerId; }).map(function (o) { return o.id; });
    return s.exceptions.filter(function (x) {
      return ids.indexOf(x.order_id) >= 0 && x.status === 'open';
    }).reduce(function (sum, x) { return sum + x.disputed_fen; }, 0);
  }

  /* FIFO 核销：付款先冲本单挂账，再按时间顺序冲最老的挂账（只能核销发生在付款之前的挂账） */
  function runAllocations(s) {
    s.allocations = [];
    s.customers.forEach(function (c) {
      var list = entriesOf(s, c.id);
      var opens = [];
      list.forEach(function (e) {
        if (e.type === 'payment') {
          var pay = -e.amount_fen;
          pay = consume(s, opens, e, pay, function (o) { return o.order_id && o.order_id === e.order_id; });
          pay = consume(s, opens, e, pay, function () { return true; });
          if (pay > 0) {
            s.allocations.push({ payment_entry_id: e.id, charged_entry_id: null, order_id: null, allocated_fen: pay, occurred_at: e.occurred_at, prepaid: true });
          }
          return;
        }
        if (e.amount_fen > 0) opens.push({ entry_id: e.id, order_id: e.order_id, remain: e.amount_fen, occurred_at: e.occurred_at });
      });
    });
    return s.allocations;
  }
  function consume(s, opens, payment, pay, accept) {
    for (var i = 0; i < opens.length && pay > 0; i++) {
      var o = opens[i];
      if (o.remain <= 0 || o.occurred_at > payment.occurred_at || !accept(o)) continue;
      var use = Math.min(o.remain, pay);
      o.remain -= use;
      pay -= use;
      s.allocations.push({
        payment_entry_id: payment.id, charged_entry_id: o.entry_id,
        order_id: o.order_id, allocated_fen: use, occurred_at: payment.occurred_at
      });
    }
    return pay;
  }

  /* 恒等式校验：客户余额 == Σ挂账类流水 == 已核销 + 未核销挂账 */
  function verifyLedger(s) {
    var issues = [];
    runAllocations(s);
    s.customers.forEach(function (c) {
      var bal = customerBalance(s, c.id);
      var gross = s.entries.filter(function (e) {
        return e.customer_id === c.id && e.type !== 'payment';
      }).reduce(function (sum, e) { return sum + e.amount_fen; }, 0);
      var allocated = s.allocations.filter(function (a) { return a.charged_entry_id && isOwn(s, a, c.id); })
        .reduce(function (sum, a) { return sum + a.allocated_fen; }, 0);
      var prepaid = s.allocations.filter(function (a) {
        return a.prepaid && entryCustomer(s, a.payment_entry_id) === c.id;
      }).reduce(function (sum, a) { return sum + a.allocated_fen; }, 0);
      // 余额 = 挂账类流水 − 已核销 − 转预收
      if (bal !== gross - allocated - prepaid) {
        issues.push(c.name + '：余额 ' + fen2yuan(bal) + ' 与「应收 ' + fen2yuan(gross) + ' − 已核销 ' + fen2yuan(allocated) + ' − 预收 ' + fen2yuan(prepaid) + '」不平');
      }
    });
    // 已结清单据逐单核对：该单的挂账类流水之和 == 重算应收
    s.orders.forEach(function (o) {
      if (o.status !== 'FINISHED') return;
      var rows = s.entries.filter(function (e) { return e.order_id === o.id && e.type !== 'payment'; });
      if (!rows.length) { issues.push(o.order_no + ' 已结单但无挂账流水'); return; }
      var sum = rows.reduce(function (acc, e) { return acc + e.amount_fen; }, 0);
      if (sum !== orderReceivable(s, o)) {
        issues.push(o.order_no + '：挂账类流水合计 ' + fen2yuan(sum) + ' 与重算应收 ' + fen2yuan(orderReceivable(s, o)) + ' 不一致');
      }
    });
    return issues;
  }

  /* 客户当前未收齐的挂账单笔（FIFO 分摊后剩余） */
  function openChargesOf(s, customerId) {
    return s.entries.filter(function (e) {
      return e.customer_id === customerId && e.type !== 'payment' && e.amount_fen > 0;
    }).map(function (e) {
      var used = s.allocations.filter(function (a) { return a.charged_entry_id === e.id; })
        .reduce(function (sum, a) { return sum + a.allocated_fen; }, 0);
      return { entry: e, open_fen: e.amount_fen - used };
    }).filter(function (x) { return x.open_fen > 0; });
  }
  function isOwn(s, a, customerId) { return entryCustomer(s, a.charged_entry_id) === customerId; }
  function entryCustomer(s, entryId) {
    var e = s.entries.filter(function (x) { return x.id === entryId; })[0];
    return e ? e.customer_id : null;
  }

  /* ---------- 持久化 ---------- */
  var memoryOnly = null;
  function hasLS() { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } }
  function load() {
    if (!hasLS()) return memoryOnly || (memoryOnly = seed());
    var raw = localStorage.getItem(KEY);
    if (!raw) { var s = seed(); save(s); return s; }
    try { return JSON.parse(raw); } catch (e) { var s2 = seed(); save(s2); return s2; }
  }
  function save(s) {
    s.updated_at = nowMs();
    if (hasLS()) localStorage.setItem(KEY, JSON.stringify(s));
    else memoryOnly = s;
    return s;
  }

  /* ---------- 写操作（唯一入口，全部走这里） ---------- */
  var Store = {
    ST: ST, TRANSITIONS: TRANSITIONS, canMove: canMove, isTerminal: isTerminal, ACTION_OF: ACTION_OF,
    money: money, fen2yuan: fen2yuan, yuan2fen: yuan2fen, stamp: stamp, periodOf: periodOf, iso: iso,
    orderById: orderById, entriesOf: entriesOf, customerBalance: customerBalance,
    orderReceivable: orderReceivable, orderPaid: orderPaid, disputedOf: disputedOf,
    openChargesOf: openChargesOf,
    verifyLedger: verifyLedger, runAllocations: runAllocations, find: find,

    get: function () { var s = load(); runAllocations(s); return s; },
    reset: function () { var s = seed(); save(s); return s; },
    commit: function (s) { return save(s); },

    /* 电话/线上录单 */
    createOrder: function (input) {
      var s = load();
      var cust = input.customer_id ? find(s, 'customers', input.customer_id) : null;
      if (!cust) {
        s.customers.seq = (s.customers.seq || 0) + 1;
        cust = {
          id: 'C' + (s.customers.length + 1) + 'N', name: input.new_customer_name || '新客户',
          phone: input.new_customer_phone || '', billing_cycle: input.billing_cycle || 'on_credit',
          credit_limit_fen: yuan2fen(input.credit_limit_yuan || 200), settle_day: 5, note: '录单时新建',
          addresses: []
        };
        s.customers.push(cust);
      }
      var addr = null;
      if (input.address_id) addr = cust.addresses.filter(function (a) { return a.id === input.address_id; })[0];
      if (!addr && input.addr_poi) {
        addr = {
          id: 'A' + Date.now(), contact_name: input.contact_name || cust.name, contact_phone: input.contact_phone || cust.phone,
          poi: input.addr_poi, detail: input.addr_detail || '', floor: Number(input.floor || 0), elevator: !!input.elevator
        };
        cust.addresses.push(addr);
      }
      if (!addr) addr = cust.addresses[0];
      var created = nowMs();
      var no = nextOrderNo(s);
      var id = 'O' + created + '_' + s.seq.order;
      var o = {
        id: id, order_no: no, source: input.source || 'phone',
        created_by: input.created_by || s.settings.operator, created_at: created,
        customer_id: cust.id, merchant_id: input.merchant_id, rider_id: input.rider_id || null,
        address: addr ? { poi: addr.poi, detail: addr.detail, contact_name: addr.contact_name, contact_phone: addr.contact_phone, floor: addr.floor, elevator: addr.elevator } : null,
        items: [{ text: input.text, qty: Number(input.qty || 1), unit_est_fen: yuan2fen(input.est_yuan), unit_real_fen: null }],
        goods_est_fen: yuan2fen(input.est_yuan), goods_real_fen: null,
        service_fee_fen: yuan2fen(input.fee_yuan), status: 'PENDING_DISPATCH',
        period_month: periodOf(created), note: input.note || '', attachments: [], cancel_reason: null,
        ts: { dispatched_at: null, notified_at: null, ready_at: null, picked_at: null, delivering_at: null, delivered_at: null, finished_at: null }
      };
      s.orders.push(o);
      s.statusLog.push({ order_id: id, from: null, to: 'PENDING_DISPATCH', actor: o.created_by, role: 'staff', at: created, reason: o.source === 'phone' ? '电话接单录单' : '客户自助下单' });
      // 一屏录单：填了骑手就直接通知商家，省一次点击
      if (o.rider_id) doDispatch(s, o, input.notify_mode || 'auto');
      save(s);
      return { order: o, state: s };
    },

    assignRider: function (orderId, riderId) {
      var s = load(); var o = orderById(s, orderId);
      o.rider_id = riderId;
      if (o.status === 'PENDING_DISPATCH') doDispatch(s, o, 'auto');
      return save(s);
    },

    /* 通知商家备货 */
    notifyMerchant: function (orderId, mode) {
      var s = load(); var o = orderById(s, orderId);
      doDispatch(s, o, mode || 'auto');
      return save(s);
    },

    /* 商家备货完成（或后台代点） */
    markReady: function (orderId, opts) {
      opts = opts || {};
      var s = load(); var o = orderById(s, orderId);
      if (!canMove(o.status, 'READY_FOR_PICKUP')) throw new Error('状态不允许：' + ST[o.status].name + ' → 备货完成');
      var p = s.prep.filter(function (x) { return x.order_id === orderId; })[0];
      var t = nowMs();
      if (p) { p.status = 'ready'; p.ready_at = t; p.acked_channel = opts.acked_channel || 'poll'; }
      o.ts.ready_at = t;
      move(s, o, 'READY_FOR_PICKUP', opts.actor || '商家', opts.actor ? 'staff' : 'merchant', opts.reason || '');
      // 演示"额度是攒出来的"：商家每次操作顺手 +1（真实实现是 requestSubscribeMessage）
      grantQuota(s, o.merchant_id, 1);
      return save(s);
    },

    reportShortage: function (orderId, text) {
      var s = load(); var o = orderById(s, orderId);
      var p = s.prep.filter(function (x) { return x.order_id === orderId; })[0];
      if (p) { p.shortage = true; p.shortage_text = text || '缺货'; }
      pushNotify(s, orderId, 'shortage', 'manual', '调度台标红', 'queued');
      s.statusLog.push({ order_id: orderId, from: o.status, to: o.status, actor: '商家', role: 'merchant', at: nowMs(), reason: '缺货：' + (text || '') });
      return save(s);
    },

    /* 骑手取货：录实付货款 + 小票照 —— 之后货款字段锁定 */
    markPicked: function (orderId, opts) {
      opts = opts || {};
      var s = load(); var o = orderById(s, orderId);
      if (!canMove(o.status, 'PICKED_UP')) throw new Error('状态不允许：' + ST[o.status].name + ' → 已取货');
      var real = yuan2fen(opts.real_yuan);
      if (!(real > 0)) throw new Error('必须录入实际垫付货款');
      if (!opts.receipt) throw new Error('必须上传小票照片');
      var t = nowMs();
      o.goods_real_fen = real;
      o.items[0].unit_real_fen = real;
      o.ts.picked_at = t;
      o.attachments.push({ type: 'receipt', name: opts.receipt, at: t });
      s.advances.push({ id: 'ADV' + t, order_id: orderId, amount_fen: real, method: opts.method || 'cash', recovered_fen: 0, status: 'paid', created_at: t });
      var task = s.tasks.filter(function (x) { return x.order_id === orderId; })[0];
      if (task) { task.status = 'picked'; task.pickup_at = t; } else s.tasks.push({ order_id: orderId, rider_id: o.rider_id, assigned_by: '老板', status: 'picked', pickup_at: t, delivered_at: null, note: '' });
      move(s, o, 'PICKED_UP', opts.actor || '骑手', 'rider', '垫付 ' + money(real) + '，小票已存证');
      return save(s);
    },

    startDelivery: function (orderId, actor) {
      var s = load(); var o = orderById(s, orderId);
      if (!canMove(o.status, 'DELIVERING')) throw new Error('状态不允许');
      o.ts.delivering_at = nowMs();
      var task = s.tasks.filter(function (x) { return x.order_id === orderId; })[0];
      if (task) task.status = 'delivering';
      move(s, o, 'DELIVERING', actor || '骑手', 'rider', '');
      return save(s);
    },

    markDelivered: function (orderId, opts) {
      opts = opts || {};
      var s = load(); var o = orderById(s, orderId);
      if (!canMove(o.status, 'DELIVERED')) throw new Error('状态不允许');
      if (!opts.photo) throw new Error('送达需拍照（无接触放门口时的凭证）');
      o.ts.delivered_at = nowMs();
      o.attachments.push({ type: 'delivered', name: opts.photo, at: o.ts.delivered_at });
      var task = s.tasks.filter(function (x) { return x.order_id === orderId; })[0];
      if (task) { task.status = 'delivered'; task.delivered_at = o.ts.delivered_at; }
      move(s, o, 'DELIVERED', opts.actor || '骑手', 'rider', '');
      return save(s);
    },

    /* 结单：挂账（应收全额）+ 当场实收（付款流水），FIFO 自动核销 */
    finishOrder: function (orderId, opts) {
      opts = opts || {};
      var s = load(); var o = orderById(s, orderId);
      if (!canMove(o.status, 'FINISHED')) throw new Error('状态不允许');
      var t = nowMs();
      var base = ((o.goods_real_fen != null) ? o.goods_real_fen : o.goods_est_fen) + o.service_fee_fen;
      var recv = orderReceivable(s, o);
      var paid = yuan2fen(opts.paid_yuan != null ? opts.paid_yuan : fen2yuan(recv));
      if (paid > recv) throw new Error('实收 ' + money(paid) + ' 大于应收 ' + money(recv) + '；多付请走「充值/预收」');
      // 挂账只记基础应收（货款+跑腿费），此前若有冲正已单独成流水，避免重复计入
      s.entries.push({ id: 'E' + (s.seq.entry += 1), customer_id: o.customer_id, order_id: o.id, type: 'charge', amount_fen: base, occurred_at: t, period_month: o.period_month, operator: opts.actor || '老板', note: '结单挂账', reversal_of_id: null });
      if (paid > 0) {
        s.entries.push({ id: 'E' + (s.seq.entry += 1), customer_id: o.customer_id, order_id: o.id, type: 'payment', amount_fen: -paid, occurred_at: t + 1, period_month: o.period_month, operator: opts.actor || '老板', note: opts.method || '现金', reversal_of_id: null });
      }
      o.ts.finished_at = t;
      move(s, o, 'FINISHED', opts.actor || '老板', 'staff', '应收 ' + money(recv) + '，实收 ' + money(paid) + '，挂账 ' + money(recv - paid));
      return save(s);
    },

    /* 后续收款：只产生付款流水。默认先冲最老挂账；客户指明"这是那单的钱"时传 orderId */
    receivePayment: function (customerId, amountYuan, note, orderId) {
      var s = load(); var t = nowMs();
      var amt = yuan2fen(amountYuan);
      if (!(amt > 0)) throw new Error('金额必须大于 0');
      s.entries.push({ id: 'E' + (s.seq.entry += 1), customer_id: customerId, order_id: orderId || null, type: 'payment', amount_fen: -amt, occurred_at: t, period_month: periodOf(t), operator: '老板', note: note || '转账/现金', reversal_of_id: null });
      return save(s);
    },

    /* 改货款：绝不改原值，只加一条 adjust 流水（挂账原单不动，应收自动重算） */
    adjustOrderAmount: function (orderId, deltaYuan, reason, type) {
      var s = load(); var o = orderById(s, orderId);
      var delta = yuan2fen(deltaYuan);
      if (!reason) throw new Error('调整必须写原因');
      s.entries.push({
        id: 'E' + (s.seq.entry += 1), customer_id: o.customer_id, order_id: orderId,
        type: type || 'adjust', amount_fen: delta, occurred_at: nowMs(),
        period_month: o.period_month, operator: '老板', note: reason, reversal_of_id: null
      });
      s.statusLog.push({ order_id: orderId, from: o.status, to: o.status, actor: '老板', role: 'staff', at: nowMs(), reason: (type === 'waive' ? '减免 ' : '冲正 ') + money(delta) + '：' + reason });
      return save(s);
    },

    openDispute: function (orderId, amountYuan, text) {
      var s = load(); var o = orderById(s, orderId);
      s.exceptions.push({ id: 'X' + nowMs(), order_id: orderId, type: 'goods_cost_dispute', disputed_fen: yuan2fen(amountYuan), status: 'open', text: text, raised_at: nowMs() });
      return save(s);
    },

    /* 取消：若已垫付，必须先处理追回（老板真金白银的口子） */
    cancelOrder: function (orderId, reason, recovery) {
      var s = load(); var o = orderById(s, orderId);
      if (isTerminal(o.status)) throw new Error('该单已是终态，不能取消');
      if (!reason) throw new Error('取消必须选原因');
      var adv = s.advances.filter(function (a) { return a.order_id === orderId; })[0];
      if (adv) {
        recovery = recovery || {};
        var rec = yuan2fen(recovery.recovered_yuan || 0);
        if (rec <= 0 && !recovery.mark_loss) {
          throw new Error('已垫付 ' + money(adv.amount_fen) + '：请先记录「已向商家追回」或勾选「确认损失」，否则不允许取消');
        }
        if (rec > adv.amount_fen) throw new Error('追回金额不能大于垫付金额');
        if (rec < adv.amount_fen && !recovery.mark_loss) {
          throw new Error('只追回 ' + money(rec) + '，剩余 ' + money(adv.amount_fen - rec) + ' 需勾选「确认损失」');
        }
        adv.recovered_fen = rec;
        adv.loss_fen = adv.amount_fen - rec;
        adv.status = rec >= adv.amount_fen ? 'settled' : 'loss';
      }
      o.cancel_reason = reason;
      move(s, o, 'CANCELLED', '老板', 'staff', reason + (adv && adv.loss_fen ? '（本单垫付损失 ' + money(adv.loss_fen) + '）' : ''));
      return save(s);
    },

    /* 商家拉单（轮询）：真实系统里是 GET /api/m/poll?since= */
    pollMerchant: function (merchantId) {
      var s = load();
      var mine = s.prep.filter(function (p) {
        return p.merchant_id === merchantId && p.status === 'notified';
      }).map(function (p) { return p.order_id; });
      var fresh = mine.filter(function (oid) {
        return !s.notify.some(function (n) { return n.order_id === oid && n.channel === 'poll' && n.status === 'acked'; });
      });
      fresh.forEach(function (oid) {
        pushNotify(s, oid, 'new_order', 'poll', merchantName(s, merchantId), 'acked', nowMs());
        var n = s.notify[s.notify.length - 1]; n.acked_at = nowMs();
        var p = s.prep.filter(function (x) { return x.order_id === oid; })[0];
        if (p) p.acked_channel = 'poll';
      });
      // 模拟订阅消息：有额度就发，没额度就记 no_quota（这正是为什么不能只靠推送）
      mine.forEach(function (oid) {
        if (s.notify.some(function (n) { return n.order_id === oid && n.channel === 'subscribe'; })) return;
        var q = quotaOf(s, merchantId);
        if (q && q.quota_left > 0) { q.quota_left -= 1; pushNotify(s, oid, 'new_order', 'subscribe', merchantName(s, merchantId), 'sent_ok'); }
        else pushNotify(s, oid, 'new_order', 'subscribe', merchantName(s, merchantId), 'no_quota');
      });
      // 超时未确认 → 短信兜底（Track A 无签名，只会是 sig_pending）
      s.prep.forEach(function (p) {
        if (p.merchant_id !== merchantId || p.status !== 'notified') return;
        var m = find(s, 'merchants', merchantId);
        var over = nowMs() - p.notified_at > (m ? m.prep_timeout_min : 10) * 60000;
        if (over && !s.notify.some(function (n) { return n.order_id === p.order_id && n.channel === 'sms'; })) {
          pushNotify(s, p.order_id, 'prep_timeout', 'sms', m ? m.phone : '', 'sig_pending');
        }
      });
      save(s);
      return { orders: mine, fresh: fresh, state: s };
    },

    quotaOf: function (merchantId) {
      var s = load();
      var q = quotaOf(s, merchantId);
      save(s);
      return q;
    },

    buildBill: function (customerId, month) {
      var s = load();
      var old = (s.bills || []).filter(function (b) { return b.customer_id === customerId && b.period_month === month; })[0];
      if (old && old.status === 'confirmed') {
        throw new Error('该客户 ' + month + ' 的对账单已确认，不能覆盖重算；如需更正请走「冲正」流水后生成新账期');
      }
      var list = entriesOf(s, customerId);
      var opening = 0, charged = 0, paid = 0, rows = [];
      list.forEach(function (e) {
        if (periodOf(e.occurred_at) < month) { opening += e.amount_fen; return; }
        if (periodOf(e.occurred_at) > month) return;
        if (e.type === 'charge') charged += e.amount_fen;
        else if (e.type === 'payment') paid += -e.amount_fen;
        else if (e.type === 'adjust') { if (e.amount_fen > 0) charged += e.amount_fen; else paid += -e.amount_fen; }
        else if (e.type === 'waive') paid += -e.amount_fen;
        rows.push(e);
      });
      s.seq.bill += 1;
      var bill = {
        id: 'B' + s.seq.bill, customer_id: customerId, period_month: month,
        opening_fen: opening, charged_fen: charged, paid_fen: paid, closing_fen: opening + charged - paid,
        rows: rows, status: 'draft', share_token: 'sh' + Math.abs(hashCode(customerId + month)), created_at: nowMs(), confirmed_at: null
      };
      s.bills = (s.bills || []).filter(function (b) { return !(b.customer_id === customerId && b.period_month === month); });
      s.bills.push(bill);
      return save(s);
    },

    confirmBill: function (billId) {
      var s = load();
      var b = s.bills.filter(function (x) { return x.id === billId; })[0];
      if (b) { b.status = 'confirmed'; b.confirmed_at = nowMs(); }
      return save(s);
    },

    currentMonth: function () { return periodOf(nowMs()); }
  };

  function hashCode(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return h;
  }
  function merchantName(s, id) { var m = find(s, 'merchants', id); return m ? m.name : id; }
  function quotaOf(s, merchantId) {
    var name = merchantName(s, merchantId);
    var q = s.quota.filter(function (x) { return x.owner === name; })[0];
    if (!q) { q = { owner: name, tmpl: '新单提醒', quota_left: 0 }; s.quota.push(q); }
    return q;
  }
  function grantQuota(s, merchantId, n) {
    var name = merchantName(s, merchantId);
    var q = s.quota.filter(function (x) { return x.owner === name; })[0];
    if (!q) { q = { owner: name, tmpl: '新单提醒', quota_left: 0 }; s.quota.push(q); }
    q.quota_left += n;
  }
  function move(s, o, to, actor, role, reason) {
    var from = o.status;
    if (!canMove(from, to)) throw new Error('非法流转：' + ST[from].name + ' → ' + ST[to].name);
    o.status = to;
    s.statusLog.push({ order_id: o.id, from: from, to: to, actor: actor, role: role, at: nowMs(), reason: reason || '' });
  }
  function doDispatch(s, o, mode) {
    if (o.status !== 'PENDING_DISPATCH') return;
    var t = nowMs();
    o.status = 'PENDING_PREP';
    o.ts.dispatched_at = t; o.ts.notified_at = t;
    s.tasks.push({ order_id: o.id, rider_id: o.rider_id, assigned_by: s.settings.operator, status: 'pending', pickup_at: null, delivered_at: null, note: '' });
    s.prep.push({ order_id: o.id, merchant_id: o.merchant_id, status: 'notified', notified_at: t, ready_at: null, acked_channel: null, shortage: false });
    s.statusLog.push({ order_id: o.id, from: 'PENDING_DISPATCH', to: 'PENDING_PREP', actor: s.settings.operator, role: 'staff', at: t, reason: '指派' + (nameOf(s, o.rider_id) || '（未定）') + '，已通知商家' });
    // 一次派单 = 一次多渠道触达，全部留痕
    pushNotify(s, o.id, 'new_order', 'poll', merchantName(s, o.merchant_id) + ' 常驻页', 'queued');
    pushNotify(s, o.id, 'new_order', 'group_msg', '商家微信群（人工转发）', 'queued');
    pushNotify(s, o.id, 'new_order', 'manual', '老板电话', 'queued');
  }
  function nameOf(s, riderId) { var r = find(s, 'riders', riderId); return r ? r.name : null; }

  root.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof globalThis !== 'undefined' ? globalThis : this);
