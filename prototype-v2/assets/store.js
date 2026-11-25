/* 马儿快跑 · 可点原型 v2 · 数据与业务逻辑（localStorage） */
(function (root) {
  'use strict';

  var KEY = 'maer_proto_v2';
  var SCHEMA_VERSION = 3;
  var BJ_OFFSET_MIN = 480;

  var ST = {
    PENDING_DISPATCH: { label: '待派单', color: 'slate' },
    PENDING_PREP: { label: '待商家备货', color: 'amber' },
    READY_FOR_PICKUP: { label: '备货完成', color: 'blue' },
    PICKED_UP: { label: '已取货', color: 'violet' },
    DELIVERING: { label: '配送中', color: 'cyan' },
    DELIVERED: { label: '已送达', color: 'orange' },
    FINISHED: { label: '已结单', color: 'green' },
    CANCELLED: { label: '已取消', color: 'red' }
  };

  var COLUMNS = [
    { code: 'PENDING_DISPATCH', label: '待派单' },
    { code: 'PENDING_PREP', label: '待准备' },
    { code: 'READY_FOR_PICKUP', label: '待取货 / 待服务' },
    { code: 'PICKED_UP', label: '已取货 / 已上车' },
    { code: 'DELIVERING', label: '服务中' },
    { code: 'DELIVERED', label: '已送达' },
    { code: 'FINISHED', label: '已结单' }
  ];

  var METHODS = [
    { code: 'wechat', label: '微信' },
    { code: 'alipay', label: '支付宝' },
    { code: 'cash', label: '现金' },
    { code: 'credit', label: '欠款' }
  ];
  var METHOD_LABELS = { wechat: '微信', alipay: '支付宝', cash: '现金', credit: '欠款' };

  var PERM_GROUPS = [
    { g: '订单', items: [
      ['order.view', '查看订单/看板'], ['order.create', '电话录单'], ['order.dispatch', '派单'],
      ['order.pick', '取货/开始服务'], ['order.finish', '结单收款'], ['order.cancel', '取消订单'], ['order.adjust', '货款不对（退/补/免）']
    ] },
    { g: '客户', items: [['customer.view', '查看客户'], ['customer.create', '新增客户'], ['customer.edit', '编辑客户备注']] },
    { g: '商家', items: [['merchant.view', '查看商家'], ['merchant.create', '新增商家'], ['merchant.edit', '编辑商家']] },
    { g: '骑手', items: [['rider.view', '查看骑手'], ['rider.create', '新增骑手'], ['rider.edit', '编辑骑手']] },
    { g: '钱', items: [['ledger.view', '查看账单/欠款'], ['ledger.payment', '登记收款'], ['bill.view', '查看账单']] },
    { g: '设置', items: [['setting.view', '查看设置'], ['setting.edit', '修改设置'], ['brand.edit', '品牌素材']] },
    { g: '用户', items: [['user.view', '查看用户'], ['user.create', '新建用户'], ['user.edit', '编辑用户'], ['user.reset', '重置密码']] },
    { g: '权限', items: [['permission.manage', '管理权限']] }
  ];

  var ALL_PERMS = [];
  PERM_GROUPS.forEach(function (g) { g.items.forEach(function (it) { ALL_PERMS.push(it[0]); }); });

  var DEFAULT_ROLE_PERMS = {
    admin: ALL_PERMS.filter(function (p) { return !/^(user\.|permission\.)/.test(p); }),
    merchant: ['m.order.view', 'm.prep.ready', 'm.shortage'],
    rider: ['r.task.view', 'r.pick', 'r.deliver', 'r.collect'],
    customer: ['c.order.create', 'c.order.view', 'c.debt.view']
  };

  var FIELD_TYPES = ['text', 'textarea', 'number', 'phone', 'date', 'select', 'multiselect', 'switch'];

  /* ---------- 小工具 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowIso() { return new Date().toISOString(); }
  function yuan(fen) { return (num(fen) / 100).toFixed(2); }

  function bjShift(ms) { return new Date(ms + BJ_OFFSET_MIN * 60000); }
  function bjKeyOf(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var b = bjShift(d.getTime());
    return b.getUTCFullYear() + '-' + pad2(b.getUTCMonth() + 1) + '-' + pad2(b.getUTCDate());
  }
  function bjTodayKey() { return bjKeyOf(new Date().toISOString()); }
  function bjDayStartMs(key) {
    var p = String(key).split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) - BJ_OFFSET_MIN * 60000;
  }
  function bjIso(ms) { return new Date(ms).toISOString(); }
  function bjAt(dayOffset, hour, minute) {
    var base = bjDayStartMs(bjTodayKey()) + dayOffset * 86400000;
    return bjIso(base + hour * 3600000 + (minute || 0) * 60000);
  }
  function isToday(iso) { return bjKeyOf(iso) === bjTodayKey(); }
  function isTerminal(status) { return status === 'FINISHED' || status === 'CANCELLED'; }

  /* ---------- 种子数据 ---------- */
  function seed() {
    var users = [
      { id: 1, name: '老板', phone: '13800000000', password: '仅原型虚构数据', status: 'active', lastLogin: bjAt(0, 8, 30), roles: [{ role: 'super_admin' }], mustChangePassword: false },
      { id: 2, name: '刘姐', phone: '13900000001', password: '123456', status: 'active', lastLogin: bjAt(0, 9, 10), roles: [{ role: 'customer' }, { role: 'merchant', merchantId: 1 }, { role: 'rider' }], mustChangePassword: false },
      { id: 3, name: '王姐', phone: '13900000004', password: '123456', status: 'active', lastLogin: bjAt(0, 10, 20), roles: [{ role: 'customer' }], mustChangePassword: false },
      { id: 4, name: '小李', phone: '13900000003', password: '123456', status: 'active', lastLogin: bjAt(0, 8, 50), roles: [{ role: 'rider' }], mustChangePassword: false },
      { id: 5, name: '瑞雪超市', phone: '13900000002', password: '123456', status: 'active', lastLogin: bjAt(0, 9, 0), roles: [{ role: 'merchant', merchantId: 1 }], mustChangePassword: false },
      { id: 6, name: '小张', phone: '13900000005', password: '123456', status: 'active', lastLogin: bjAt(0, 8, 40), roles: [{ role: 'admin' }], mustChangePassword: false },
      { id: 7, name: '老周', phone: '13900000006', password: '123456', status: 'active', lastLogin: bjAt(0, 9, 30), roles: [{ role: 'rider' }], mustChangePassword: false },
      { id: 8, name: '陈先生', phone: '13900000007', password: '123456', status: 'active', lastLogin: bjAt(0, 10, 0), roles: [{ role: 'customer' }], mustChangePassword: false },
      { id: 9, name: '康民药店', phone: '13900000008', password: '123456', status: 'active', lastLogin: bjAt(0, 9, 15), roles: [{ role: 'merchant', merchantId: 2 }], mustChangePassword: false }
    ];

    var customers = [
      {
        id: 1, userId: 3, note: '3 号楼，放门口，常买水果',
        addresses: [{ id: 1, poi: '城市花园 3 栋', detail: '2 单元 1802，放门口鞋柜', contactName: '王姐', phone: '13900000004', isDefault: true }]
      },
      {
        id: 2, userId: 2, note: '瑞雪超市老板，也跑单',
        addresses: [{ id: 2, poi: '瑞雪超市', detail: '南城店二楼', contactName: '刘姐', phone: '13900000001', isDefault: true }]
      },
      {
        id: 3, userId: 8, note: '写字楼前台代收，下午 3 点后有人在',
        addresses: [{ id: 3, poi: '万达写字楼 A 座', detail: '18 楼前台，找陈先生', contactName: '陈先生', phone: '13900000007', isDefault: true }]
      }
    ];

    var merchantCategories = [
      { id: 1, code: 'fresh', name: '超市生鲜', sortNo: 1, enabled: true },
      { id: 2, code: 'pharmacy', name: '药店', sortNo: 2, enabled: true },
      { id: 3, code: 'convenience', name: '便利店', sortNo: 3, enabled: true },
      { id: 4, code: 'food', name: '餐饮', sortNo: 4, enabled: true },
      { id: 5, code: 'fruit', name: '水果', sortNo: 5, enabled: true },
      { id: 6, code: 'other', name: '其他', sortNo: 6, enabled: true }
    ];

    var merchants = [
      { id: 1, name: '瑞雪生鲜超市', phone: '0769-88880001', address: '南城街道鸿福路 12 号', status: 'active', source: 'migrate', fromOrderId: null, categoryIds: [1], prepTimeoutMin: 10, extra: { contact: '刘姐', businessHours: '07:00-22:00' }, ownerUserId: 5, legacyCategory: '生鲜/超市' },
      { id: 2, name: '康民药店', phone: '0769-88880002', address: '南城街道元美路 8 号', status: 'active', source: 'migrate', fromOrderId: null, categoryIds: [2], prepTimeoutMin: 8, extra: { contact: '值班药师', businessHours: '08:00-23:00' }, ownerUserId: 9, legacyCategory: '药店' },
      { id: 3, name: '美宜佳便利店', phone: '0769-88880003', address: '城市花园东门', status: 'active', source: 'migrate', fromOrderId: null, categoryIds: [3], prepTimeoutMin: 6, extra: { businessHours: '24 小时' }, ownerUserId: null, legacyCategory: '便利店' },
      { id: 4, name: '楼下王记水果', phone: '', address: '', status: 'pending', source: 'order', fromOrderId: 7, categoryIds: [], prepTimeoutMin: 10, extra: {}, ownerUserId: null, legacyCategory: '' }
    ];

    var merchantFields = [
      { id: 1, fieldKey: 'contact', label: '联系人', type: 'text', required: false, options: [], sortNo: 1, enabled: true },
      { id: 2, fieldKey: 'businessHours', label: '营业时间', type: 'text', required: false, options: [], sortNo: 2, enabled: true },
      { id: 3, fieldKey: 'deliveryArea', label: '配送范围', type: 'text', required: false, options: [], sortNo: 3, enabled: true }
    ];

    var serviceTypes = [
      {
        code: 'buy', name: '代买跑腿', short: '代买', icon: 'assets/brand/service-buy.svg',
        formKind: 'buy', flowKind: 'buy', defaultFeeFen: 1000, enabled: true,
        desc: '按客户原话去买，垫付货款', sortNo: 1,
        schema: [
          { key: 'buyNote', label: '购买要求', type: 'textarea', required: false, placeholder: '挑熟的、不要冰的……', options: [], sortNo: 1 }
        ]
      },
      {
        code: 'pickup', name: '代取送', short: '取送', icon: 'assets/brand/service-pickup.svg',
        formKind: 'route', flowKind: 'standard', defaultFeeFen: 1500, enabled: true,
        desc: '取件、送文件、送钥匙', sortNo: 2,
        schema: [
          { key: 'origin', label: '取件地点', type: 'text', required: true, placeholder: '去哪里取', options: [], sortNo: 1 },
          { key: 'dest', label: '送到地点', type: 'text', required: true, placeholder: '送到哪里', options: [], sortNo: 2 },
          { key: 'content', label: '取送什么', type: 'text', required: true, placeholder: '文件 / 钥匙 / 包裹', options: [], sortNo: 3 },
          { key: 'appointmentAt', label: '期望时间', type: 'text', required: false, placeholder: '尽快 / 明天 09:00', options: [], sortNo: 4 }
        ]
      },
      {
        code: 'errand', name: '代办', short: '代办', icon: 'assets/brand/service-errand.svg',
        formKind: 'route', flowKind: 'standard', defaultFeeFen: 2000, enabled: true,
        desc: '排队、缴费、办证、取号', sortNo: 3,
        schema: [
          { key: 'origin', label: '办理地点', type: 'text', required: true, placeholder: '去哪里办', options: [], sortNo: 1 },
          { key: 'dest', label: '办完送到', type: 'text', required: false, placeholder: '回执送到哪里', options: [], sortNo: 2 },
          { key: 'content', label: '办什么', type: 'textarea', required: true, placeholder: '排队取号、交材料……', options: [], sortNo: 3 },
          { key: 'appointmentAt', label: '期望时间', type: 'text', required: false, placeholder: '明天 09:00', options: [], sortNo: 4 }
        ]
      },
      {
        code: 'transfer', name: '接送', short: '接送', icon: 'assets/brand/service-transfer.svg',
        formKind: 'route', flowKind: 'scheduled', defaultFeeFen: 6000, enabled: true,
        desc: '机场、车站、医院、上下学', sortNo: 4,
        schema: [
          { key: 'origin', label: '上车地点', type: 'text', required: true, placeholder: '从哪里出发', options: [], sortNo: 1 },
          { key: 'dest', label: '目的地', type: 'text', required: true, placeholder: '到哪里', options: [], sortNo: 2 },
          { key: 'appointmentAt', label: '用车时间', type: 'text', required: true, placeholder: '明天 08:30', options: [], sortNo: 3 },
          { key: 'content', label: '补充说明', type: 'text', required: false, placeholder: '几件行李、几个人', options: [], sortNo: 4 }
        ]
      },
      {
        code: 'driver', name: '代驾', short: '代驾', icon: 'assets/brand/service-driver.svg',
        formKind: 'driver', flowKind: 'scheduled', defaultFeeFen: 8000, enabled: true,
        desc: '按起点到终点代驾', sortNo: 5,
        schema: [
          { key: 'origin', label: '出发地点', type: 'text', required: true, placeholder: '车停在哪里', options: [], sortNo: 1 },
          { key: 'dest', label: '目的地', type: 'text', required: true, placeholder: '开到哪里', options: [], sortNo: 2 },
          { key: 'plateNo', label: '车牌号', type: 'text', required: true, placeholder: '粤S·8K2M9', options: [], sortNo: 3 },
          { key: 'carModel', label: '车型', type: 'text', required: false, placeholder: '本田雅阁', options: [], sortNo: 4 },
          { key: 'appointmentAt', label: '用车时间', type: 'text', required: false, placeholder: '现在', options: [], sortNo: 5 }
        ]
      }
    ];

    var itemSeq = 1;
    var groupSeq = 1;
    function it(text, qty, estFen) { return { id: itemSeq++, text: text, qty: qty || 1, estFen: num(estFen) }; }
    function sumItems(items) {
      return (items || []).reduce(function (s, x) { return s + num(x.estFen); }, 0);
    }
    function mkGroup(seqNo, m, opt) {
      opt = opt || {};
      var items = opt.items || [];
      var est = opt.goodsEstFen != null ? num(opt.goodsEstFen) : sumItems(items);
      return {
        id: groupSeq++, seq: seqNo,
        merchantId: m ? m.id : null,
        merchantName: m ? m.name : (opt.merchantName || ''),
        merchantPhone: m ? (m.phone || '') : (opt.merchantPhone || ''),
        categoryNames: m ? (m.categoryIds || []).map(function (id) {
          var c = merchantCategories.filter(function (x) { return x.id === id; })[0];
          return c ? c.name : '';
        }).filter(Boolean) : [],
        source: opt.source || (m && m.status === 'pending' ? 'pending' : 'existing'),
        prepStatus: opt.prepStatus || 'not_needed',
        notifiedAt: opt.notifiedAt || null,
        readyAt: opt.readyAt || null,
        goodsEstFen: est,
        goodsRealFen: opt.goodsRealFen != null ? num(opt.goodsRealFen) : null,
        pickedAt: opt.pickedAt || null,
        receiptName: opt.receiptName || '',
        note: opt.note || '',
        items: items
      };
    }
    function sumGroupEst(groups) { return groups.reduce(function (s, g) { return s + num(g.goodsEstFen); }, 0); }
    function sumGroupReal(groups) {
      return groups.reduce(function (s, g) { return s + (g.goodsRealFen != null ? num(g.goodsRealFen) : 0); }, 0);
    }
    var addr1 = { contactName: '王姐', phone: '13900000004', poi: '城市花园 3 栋', detail: '2 单元 1802，放门口鞋柜' };
    var addr2 = { contactName: '刘姐', phone: '13900000001', poi: '瑞雪超市', detail: '南城店二楼' };
    var addr3 = { contactName: '陈先生', phone: '13900000007', poi: '万达写字楼 A 座', detail: '18 楼前台' };
    var addr5 = { contactName: '陈先生', phone: '13900000007', poi: '城市花园南门', detail: '上车点' };
    var addr6 = { contactName: '王姐', phone: '13900000004', poi: '南城酒吧街', detail: '路边等' };

    var g1 = mkGroup(1, merchants[0], {
      items: [it('西瓜 3 个', 3, 6000), it('抽纸 1 提', 1, 2600)], goodsEstFen: 8600, goodsRealFen: 9240,
      prepStatus: 'ready', notifiedAt: bjAt(0, 10, 5), readyAt: bjAt(0, 10, 40), pickedAt: bjAt(0, 10, 52),
      receiptName: '小票-瑞雪超市-92.40.jpg'
    });
    var g2 = mkGroup(2, merchants[1], {
      items: [it('体温计 1 支', 1, 1800)], goodsRealFen: 1800,
      prepStatus: 'ready', notifiedAt: bjAt(0, 10, 5), readyAt: bjAt(0, 10, 42), pickedAt: bjAt(0, 10, 55),
      receiptName: '小票-康民药店-18.00.jpg'
    });
    var g3 = mkGroup(1, merchants[0], {
      items: [it('排骨 2 斤', 1, 3000), it('玉米 3 根', 1, 2000)], goodsRealFen: 5000,
      prepStatus: 'ready', notifiedAt: bjAt(0, 8, 12), readyAt: bjAt(0, 9, 35), pickedAt: bjAt(0, 9, 45),
      receiptName: '小票-瑞雪超市-50.00.jpg'
    });
    var g4 = mkGroup(1, merchants[2], {
      items: [it('牛奶 1 箱', 1, 2500)], goodsRealFen: 2400,
      prepStatus: 'ready', notifiedAt: bjAt(0, 9, 2), readyAt: bjAt(0, 9, 40), pickedAt: bjAt(0, 9, 48),
      receiptName: '小票-美宜佳-24.00.jpg'
    });
    var g5 = mkGroup(2, merchants[1], {
      items: [it('感冒药 1 盒', 1, 1800)],
      prepStatus: 'notified', notifiedAt: bjAt(0, 9, 2)
    });
    var g6 = mkGroup(1, merchants[3], {
      items: [it('果篮 1 个', 1, 8000)],
      prepStatus: 'not_needed', source: 'pending'
    });
    var g7 = mkGroup(1, merchants[2], {
      items: [it('牛奶 1 箱', 1, 2500), it('面包 2 袋', 2, 0)], goodsRealFen: 2400,
      prepStatus: 'ready', notifiedAt: bjAt(-1, 15, 2), readyAt: bjAt(-1, 15, 40), pickedAt: bjAt(-1, 15, 50)
    });
    var g8 = mkGroup(1, merchants[0], {
      items: [it('烟 1 条', 1, 22000)],
      prepStatus: 'cancelled'
    });
    var g9 = mkGroup(1, merchants[0], {
      items: [it('车厘子 2 斤', 1, 4000), it('草莓 1 盒', 1, 2800)],
      prepStatus: 'notified', notifiedAt: bjAt(0, 11, 21)
    });

    var orders = [
      {
        id: 1, no: 'MR1121-A3K9', serviceType: 'buy', customerId: 1, riderId: 4, status: 'DELIVERED',
        source: 'phone', merchantId: 1, merchantGroups: [g1, g2],
        goodsEstFen: sumGroupEst([g1, g2]), goodsRealFen: sumGroupReal([g1, g2]),
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 1, address: addr1,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '西瓜要挑熟一点的', createdAt: bjAt(0, 9, 50), dispatchedAt: bjAt(0, 9, 52),
        readyAt: bjAt(0, 10, 45), pickedAt: bjAt(0, 10, 55), deliveringAt: bjAt(0, 11, 0),
        deliveredAt: bjAt(0, 11, 25), finishedAt: null, settleMethod: null,
        attachments: [
          { id: 1, kind: 'image', name: '小票-瑞雪超市-92.40.jpg', size: '1.2MB' },
          { id: 2, kind: 'audio', name: '客户语音-少买一瓶水.m4a', size: '320KB' },
          { id: 3, kind: 'image', name: '小票-康民药店-18.00.jpg', size: '760KB' }
        ], cancelReason: '', deliverNote: ''
      },
      {
        id: 2, no: 'MR1121-B7Q2', serviceType: 'buy', customerId: 1, riderId: 4, status: 'FINISHED',
        source: 'phone', merchantId: 1, merchantGroups: [g3],
        goodsEstFen: sumGroupEst([g3]), goodsRealFen: 5000,
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 1, address: addr1,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '', createdAt: bjAt(0, 8, 10), dispatchedAt: bjAt(0, 8, 12), readyAt: bjAt(0, 9, 35),
        pickedAt: bjAt(0, 9, 45), deliveringAt: bjAt(0, 9, 50), deliveredAt: bjAt(0, 9, 58),
        finishedAt: bjAt(0, 10, 40), settleMethod: 'wechat',
        attachments: [{ id: 4, kind: 'image', name: '小票-瑞雪超市-50.00.jpg', size: '980KB' }],
        cancelReason: '', deliverNote: ''
      },
      {
        id: 3, no: 'MR1121-C1M8', serviceType: 'buy', customerId: 3, riderId: 4, status: 'READY_FOR_PICKUP',
        source: 'phone', merchantId: 3, merchantGroups: [g4, g5],
        goodsEstFen: sumGroupEst([g4, g5]), goodsRealFen: null,
        serviceFeeFen: 1500, extraFeeFen: 0, discountFen: 0, addressId: 3, address: addr3,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '两家店都要取齐再送', createdAt: bjAt(0, 9, 0), dispatchedAt: bjAt(0, 9, 2),
        readyAt: bjAt(0, 9, 40), pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null,
        settleMethod: null, attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 4, no: 'MR1121-D4T6', serviceType: 'errand', customerId: 2, riderId: null, status: 'PENDING_DISPATCH',
        source: 'phone', merchantId: null, merchantGroups: [],
        goodsEstFen: 0, goodsRealFen: null,
        serviceFeeFen: 2000, extraFeeFen: 0, discountFen: 0, addressId: 2, address: addr2,
        service: { origin: '南城社保局', dest: '瑞雪超市（南城店）', content: '排队取号，交社保材料，办完把回执带回超市', appointmentAt: '明天 09:00', contactName: '刘姐', contactPhone: '13900000001' },
        serviceSchemaSnapshot: clone(serviceTypes[2].schema),
        note: '要带身份证复印件', createdAt: bjAt(0, 10, 0), dispatchedAt: null, readyAt: null,
        pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null, settleMethod: null,
        attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 5, no: 'MR1121-E9R3', serviceType: 'transfer', customerId: 3, riderId: 4, status: 'READY_FOR_PICKUP',
        source: 'phone', merchantId: null, merchantGroups: [],
        goodsEstFen: 0, goodsRealFen: null,
        serviceFeeFen: 6000, extraFeeFen: 0, discountFen: 0, addressId: 3, address: addr5,
        service: { origin: '城市花园南门', dest: '白云机场 T2 航站楼', content: '送机，2 件行李', appointmentAt: '明天 08:30', contactName: '陈先生', contactPhone: '13900000007' },
        serviceSchemaSnapshot: clone(serviceTypes[3].schema),
        note: '航班 11:20，别迟到', createdAt: bjAt(0, 8, 0), dispatchedAt: bjAt(0, 8, 1), readyAt: bjAt(0, 8, 10),
        pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null, settleMethod: null,
        attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 6, no: 'MR1121-F2W7', serviceType: 'driver', customerId: 1, riderId: 7, status: 'DELIVERING',
        source: 'phone', merchantId: null, merchantGroups: [],
        goodsEstFen: 0, goodsRealFen: null,
        serviceFeeFen: 8000, extraFeeFen: 0, discountFen: 0, addressId: 1, address: addr6,
        service: { origin: '南城酒吧街', dest: '城市花园 3 栋', content: '代驾回家', appointmentAt: '现在', plateNo: '粤S·8K2M9', carModel: '本田雅阁', contactName: '王姐', contactPhone: '13900000004' },
        serviceSchemaSnapshot: clone(serviceTypes[4].schema),
        note: '', createdAt: bjAt(0, 10, 55), dispatchedAt: bjAt(0, 10, 56), readyAt: bjAt(0, 11, 0),
        pickedAt: bjAt(0, 11, 5), deliveringAt: bjAt(0, 11, 6), deliveredAt: null, finishedAt: null,
        settleMethod: null, attachments: [{ id: 5, kind: 'image', name: '上车前车况.jpg', size: '1.1MB' }],
        cancelReason: '', deliverNote: ''
      },
      {
        id: 7, no: 'MR1121-G5H1', serviceType: 'buy', customerId: 3, riderId: null, status: 'PENDING_DISPATCH',
        source: 'phone', merchantId: 4, merchantGroups: [g6],
        goodsEstFen: sumGroupEst([g6]), goodsRealFen: null,
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 3, address: addr3,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '前台代收，老板说楼下水果店就行', createdAt: bjAt(0, 10, 30), dispatchedAt: null, readyAt: null,
        pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null, settleMethod: null,
        attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 8, no: 'MR1121-H8N4', serviceType: 'buy', customerId: 1, riderId: 7, status: 'FINISHED',
        source: 'phone', merchantId: 3, merchantGroups: [g7],
        goodsEstFen: sumGroupEst([g7]), goodsRealFen: 2400,
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 1, address: addr1,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '', createdAt: bjAt(-1, 15, 0), dispatchedAt: bjAt(-1, 15, 2), readyAt: bjAt(-1, 15, 40),
        pickedAt: bjAt(-1, 15, 50), deliveringAt: bjAt(-1, 15, 55), deliveredAt: bjAt(-1, 16, 10),
        finishedAt: bjAt(-1, 16, 20), settleMethod: 'cash', attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 9, no: 'MR1121-J6P3', serviceType: 'pickup', customerId: 3, riderId: 4, status: 'FINISHED',
        source: 'phone', merchantId: null, merchantGroups: [],
        goodsEstFen: 0, goodsRealFen: 0,
        serviceFeeFen: 1500, extraFeeFen: 0, discountFen: 0, addressId: 3, address: addr3,
        service: { origin: '市行政服务中心', dest: '万达写字楼 A 座', content: '取营业执照', appointmentAt: '', contactName: '陈先生', contactPhone: '13900000007' },
        serviceSchemaSnapshot: clone(serviceTypes[1].schema),
        note: '', createdAt: bjAt(-3, 14, 0), dispatchedAt: bjAt(-3, 14, 1), readyAt: bjAt(-3, 14, 10),
        pickedAt: bjAt(-3, 14, 30), deliveringAt: bjAt(-3, 14, 35), deliveredAt: bjAt(-3, 15, 0),
        finishedAt: bjAt(-3, 15, 10), settleMethod: 'credit', attachments: [], cancelReason: '', deliverNote: ''
      },
      {
        id: 10, no: 'MR1121-K2V5', serviceType: 'buy', customerId: 2, riderId: null, status: 'CANCELLED',
        source: 'phone', merchantId: 1, merchantGroups: [g8],
        goodsEstFen: sumGroupEst([g8]), goodsRealFen: null,
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 2, address: addr2,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '', createdAt: bjAt(-1, 11, 0), dispatchedAt: null, readyAt: null,
        pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null, settleMethod: null,
        attachments: [], cancelReason: '客户改口，不买了', deliverNote: ''
      },
      {
        id: 11, no: 'MR1121-L9C6', serviceType: 'buy', customerId: 3, riderId: 4, status: 'PENDING_PREP',
        source: 'phone', merchantId: 1, merchantGroups: [g9],
        goodsEstFen: sumGroupEst([g9]), goodsRealFen: null,
        serviceFeeFen: 1000, extraFeeFen: 0, discountFen: 0, addressId: 3, address: addr3,
        service: {}, serviceSchemaSnapshot: clone(serviceTypes[0].schema),
        note: '要新鲜一点的，坏的挑出来', createdAt: bjAt(0, 11, 20), dispatchedAt: bjAt(0, 11, 21), readyAt: null,
        pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null, settleMethod: null,
        attachments: [], cancelReason: '', deliverNote: ''
      }
    ];

    var ledger = [
      { id: 1, customerId: 1, orderId: 2, type: 'CHARGE', amountFen: 6000, method: '', note: '结单应收', at: bjAt(0, 10, 40), operator: '老板' },
      { id: 2, customerId: 1, orderId: 2, type: 'PAYMENT', amountFen: -3000, method: 'wechat', note: '结单当场收款', at: bjAt(0, 10, 41), operator: '老板' },
      { id: 3, customerId: 1, orderId: 8, type: 'CHARGE', amountFen: 3400, method: '', note: '结单应收', at: bjAt(-1, 16, 20), operator: '老板' },
      { id: 4, customerId: 1, orderId: 8, type: 'PAYMENT', amountFen: -1000, method: 'cash', note: '客户付一部分', at: bjAt(-1, 16, 22), operator: '小李' },
      { id: 5, customerId: 3, orderId: 9, type: 'CHARGE', amountFen: 1500, method: '', note: '结单应收', at: bjAt(-3, 15, 10), operator: '老板' }
    ];

    var notices = [
      { id: 1, type: 'prep', orderId: 11, groupId: g9.id, merchantId: 1, text: '瑞雪生鲜超市：有一单待备货', at: bjAt(0, 11, 21), read: false },
      { id: 2, type: 'prep', orderId: 3, groupId: g5.id, merchantId: 2, text: '康民药店：有一单待备货', at: bjAt(0, 9, 2), read: false }
    ];

    var logs = [];
    function log(orderId, action, reason, at, actor, role, extra) {
      var e = { id: logs.length + 1, orderId: orderId, action: action, reason: reason || '', at: at || nowIso(), actor: actor || '老板', role: role || 'staff' };
      if (extra) { e.beforeJson = extra.beforeJson; e.afterJson = extra.afterJson; }
      logs.push(e);
    }
    log(1, 'CREATE', '电话录单 · 代买跑腿（瑞雪生鲜超市、康民药店）', bjAt(0, 9, 50));
    log(1, 'DISPATCH', '指派小李，已通知瑞雪生鲜超市、康民药店', bjAt(0, 9, 52));
    log(1, 'MERCHANT_READY', '瑞雪生鲜超市确认备货完成', bjAt(0, 10, 40), '瑞雪超市', 'merchant');
    log(1, 'MERCHANT_READY', '康民药店确认备货完成', bjAt(0, 10, 42), '康民药店', 'merchant');
    log(1, 'PICKED', '瑞雪生鲜超市：垫付 92.40，小票已存证', bjAt(0, 10, 52), '小李', 'rider');
    log(1, 'PICKED', '康民药店：垫付 18.00，小票已存证', bjAt(0, 10, 55), '小李', 'rider');
    log(1, 'DELIVERING', '两家店已取齐，开始配送', bjAt(0, 11, 0), '小李', 'rider');
    log(1, 'DELIVERED', '送达拍照，放门口', bjAt(0, 11, 25), '小李', 'rider');
    log(2, 'CREATE', '电话录单 · 代买跑腿（瑞雪生鲜超市）', bjAt(0, 8, 10));
    log(2, 'DISPATCH', '指派小李，已通知瑞雪生鲜超市', bjAt(0, 8, 12));
    log(2, 'PICKED', '瑞雪生鲜超市：垫付 50.00', bjAt(0, 9, 45), '小李', 'rider');
    log(2, 'FINISH', '应收 60.00，实收 30.00（微信），欠 30.00', bjAt(0, 10, 40));
    log(3, 'CREATE', '电话录单 · 代买跑腿（美宜佳便利店、康民药店）', bjAt(0, 9, 0));
    log(3, 'DISPATCH', '指派小李，已通知美宜佳便利店、康民药店', bjAt(0, 9, 2));
    log(3, 'MERCHANT_READY', '美宜佳便利店确认备货完成', bjAt(0, 9, 40), '调度台');
    log(3, 'PICKED', '美宜佳便利店：垫付 24.00，小票已存证；康民药店待取', bjAt(0, 9, 48), '小李', 'rider');
    log(4, 'CREATE', '电话录单 · 代办', bjAt(0, 10, 0));
    log(5, 'CREATE', '电话录单 · 接送', bjAt(0, 8, 0));
    log(5, 'DISPATCH', '指派小李，明天 08:30 用车', bjAt(0, 8, 1));
    log(6, 'CREATE', '电话录单 · 代驾', bjAt(0, 10, 55));
    log(6, 'PICKED', '已上车，开始代驾', bjAt(0, 11, 5), '老周', 'rider');
    log(7, 'CREATE', '电话录单 · 代买跑腿（楼下王记水果，待完善商家）', bjAt(0, 10, 30));
    log(8, 'CREATE', '电话录单 · 代买跑腿（美宜佳便利店）', bjAt(-1, 15, 0));
    log(8, 'PICKED', '美宜佳便利店：垫付 24.00', bjAt(-1, 15, 50), '老周', 'rider');
    log(8, 'FINISH', '应收 34.00，实收 10.00（现金），欠 24.00', bjAt(-1, 16, 20));
    log(9, 'CREATE', '电话录单 · 代取送', bjAt(-3, 14, 0));
    log(9, 'FINISH', '应收 15.00，实收 0.00（欠款），欠 15.00', bjAt(-3, 15, 10));
    log(10, 'CREATE', '电话录单 · 代买跑腿（瑞雪生鲜超市）', bjAt(-1, 11, 0));
    log(10, 'CANCEL', '客户改口，不买了', bjAt(-1, 11, 20));
    log(11, 'CREATE', '电话录单 · 代买跑腿（瑞雪生鲜超市）', bjAt(0, 11, 20));
    log(11, 'DISPATCH', '指派小李，已通知瑞雪生鲜超市', bjAt(0, 11, 21));
    log(11, 'EDIT', '客户补充：草莓要小盒', bjAt(0, 11, 22), '老板', 'staff', {
      beforeJson: JSON.stringify({ note: '要新鲜一点的，坏的挑出来' }),
      afterJson: JSON.stringify({ note: '要新鲜一点的，坏的挑出来；草莓要小盒' })
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      session: null,
      seq: {
        user: 9, customer: 3, merchant: 4, order: 11, ledger: 5, log: logs.length, quick: 5,
        address: 3, group: groupSeq - 1, item: itemSeq - 1, category: 6, field: 3,
        serviceType: 5, notice: 2, attachment: 5
      },
      users: users,
      customers: customers,
      merchants: merchants,
      merchantCategories: merchantCategories,
      merchantFields: merchantFields,
      serviceTypes: serviceTypes,
      orders: orders,
      ledger: ledger,
      logs: logs,
      notices: notices,
      rolePerms: clone(DEFAULT_ROLE_PERMS),
      settings: {
        orderPrefix: 'MR',
        defaultFeeFen: 1000,
        defaultServiceFeeFen: 1000,
        quickPhrases: [
          { id: 1, text: '矿泉水一箱', enabled: true, sort: 1 },
          { id: 2, text: '啤酒两提', enabled: true, sort: 2 },
          { id: 3, text: '香烟一包', enabled: true, sort: 3 },
          { id: 4, text: '水果拼盘', enabled: true, sort: 4 },
          { id: 5, text: '感冒药', enabled: true, sort: 5 }
        ],
        brand: {
          logo: 'assets/brand/logo-horizontal.svg',
          mark: 'assets/brand/logo-mark.svg',
          loginHero: 'assets/brand/login-hero.svg',
          emptyOrders: 'assets/brand/empty-orders.svg',
          emptyDebts: 'assets/brand/empty-debts.svg'
        }
      }
    };
  }
  /* ---------- 存取 ---------- */
  var state = null;

  function load() {
    var raw = null;
    try { if (root.localStorage) raw = root.localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    if (raw) {
      try {
        var s = JSON.parse(raw);
        if (s && s.schemaVersion === SCHEMA_VERSION) return s;
      } catch (e) { /* ignore */ }
    }
    var fresh = seed();
    try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(fresh)); } catch (e) { /* ignore */ }
    return fresh;
  }

  function save() {
    try { if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function get() {
    if (!state) state = load();
    return state;
  }

  function reset() {
    state = seed();
    save();
    return state;
  }

  function nextId(key) {
    var s = get();
    s.seq[key] = (s.seq[key] || 0) + 1;
    return s.seq[key];
  }

  /* ---------- 查询 ---------- */
  function user(id) {
    return get().users.filter(function (u) { return u.id === Number(id); })[0] || null;
  }
  function customer(id) {
    return get().customers.filter(function (c) { return c.id === Number(id); })[0] || null;
  }
  function customerByUser(userId) {
    return get().customers.filter(function (c) { return c.userId === Number(userId); })[0] || null;
  }
  function merchant(id) {
    return get().merchants.filter(function (m) { return m.id === Number(id); })[0] || null;
  }
  function order(id) {
    return get().orders.filter(function (o) { return o.id === Number(id); })[0] || null;
  }
  function serviceType(code) {
    return get().serviceTypes.filter(function (s) { return s.code === code; })[0] || null;
  }
  function category(idOrCode) {
    var list = get().merchantCategories;
    return list.filter(function (c) { return c.id === Number(idOrCode) || c.code === String(idOrCode); })[0] || null;
  }
  function users() { return get().users.slice(); }
  function customers() {
    return get().customers.map(function (c) {
      var copy = {};
      Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
      copy.user = user(c.userId);
      return copy;
    });
  }
  function riders() {
    return get().users.filter(function (u) { return hasRole(u, 'rider') && u.status === 'active'; });
  }

  function hasRole(u, role) {
    return !!(u && u.roles && u.roles.some(function (r) { return r.role === role; }));
  }

  function workspacesOf(u) {
    if (!u) return [];
    var out = [];
    if (hasRole(u, 'super_admin') || hasRole(u, 'admin')) {
      out.push({ type: 'admin', name: '调度台', desc: hasRole(u, 'super_admin') ? '超级管理员' : '管理员' });
    }
    u.roles.forEach(function (r) {
      if (r.role === 'merchant' && r.merchantId) {
        var m = merchant(r.merchantId);
        if (m) out.push({ type: 'merchant', merchantId: m.id, name: m.name + ' · 商家工作台', desc: '商家账号' });
      }
    });
    if (hasRole(u, 'rider')) out.push({ type: 'rider', name: '骑手端', desc: '接单与履约' });
    if (hasRole(u, 'customer')) {
      var c = customerByUser(u.id);
      if (c) out.push({ type: 'customer', customerId: c.id, name: '客户端', desc: '下单与账单' });
    }
    return out;
  }

  function login(phone, password) {
    var u = get().users.filter(function (x) { return x.phone === String(phone).trim(); })[0];
    if (!u || u.password !== String(password)) throw new Error('手机号或密码不对');
    if (u.status !== 'active') throw new Error('这个账号已被停用，请联系管理员');
    if (!u.password) throw new Error('该账号还未设置密码，请联系管理员');
    u.lastLogin = nowIso();
    save();
    return u;
  }

  function setSession(userId, ws) {
    var u = user(userId);
    if (!u) throw new Error('用户不存在');
    ws = ws || {};
    var allowed = workspacesOf(u).some(function (w) {
      return w.type === ws.type &&
        String(w.merchantId || '') === String(ws.merchantId || '') &&
        String(w.customerId || '') === String(ws.customerId || '');
    });
    if (!allowed) throw new Error('这个账号没有该工作区权限');
    get().session = {
      userId: u.id, type: ws.type,
      merchantId: ws.merchantId || null, customerId: ws.customerId || null, at: nowIso()
    };
    save();
  }

  function session() { return get().session; }
  function me() { var s = get().session; return s ? user(s.userId) : null; }
  function logout() { get().session = null; save(); }

  function rolePerms() {
    var s = get();
    if (!s.rolePerms) s.rolePerms = clone(DEFAULT_ROLE_PERMS);
    return s.rolePerms;
  }

  function can(perm) {
    var s = get().session;
    var u = me();
    if (!s || !u) return false;
    if (s.type === 'admin') {
      if (hasRole(u, 'super_admin')) return true;
      if (!hasRole(u, 'admin')) return false;
      return (rolePerms().admin || []).indexOf(perm) >= 0;
    }
    return (rolePerms()[s.type] || []).indexOf(perm) >= 0;
  }

  function saveRolePerms(role, perms) {
    if (['admin', 'merchant', 'rider', 'customer'].indexOf(role) < 0) throw new Error('角色不存在');
    var list = [];
    (perms || []).forEach(function (p) {
      if (typeof p === 'string' && p && list.indexOf(p) < 0) list.push(p);
    });
    rolePerms()[role] = list;
    save();
    return list;
  }

  /* ---------- 设置与主数据 ---------- */
  function settings() { return get().settings; }

  function saveSettings(patch) {
    var s = get();
    patch = patch || {};
    Object.keys(patch).forEach(function (k) { s.settings[k] = patch[k]; });
    var fee = null;
    if (patch.defaultFeeFen != null) fee = num(patch.defaultFeeFen);
    else if (patch.defaultServiceFeeFen != null) fee = num(patch.defaultServiceFeeFen);
    if (fee != null) {
      s.settings.defaultFeeFen = fee;
      s.settings.defaultServiceFeeFen = fee;
      var buy = s.serviceTypes.filter(function (x) { return x.code === 'buy'; })[0];
      if (buy) buy.defaultFeeFen = fee;
    }
    save();
    return s.settings;
  }

  function addQuickPhrase(text) {
    var s = get();
    var t = (text || '').trim();
    if (!t) throw new Error('常用词不能为空');
    if (s.settings.quickPhrases.some(function (p) { return p.text === t; })) throw new Error('已经有这个词了');
    s.settings.quickPhrases.push({ id: nextId('quick'), text: t, enabled: true, sort: s.settings.quickPhrases.length + 1 });
    save();
  }

  function removeQuickPhrase(id) {
    var s = get();
    s.settings.quickPhrases = s.settings.quickPhrases.filter(function (p) { return p.id !== Number(id); });
    save();
  }

  function moveQuickPhrase(id, dir) {
    var s = get();
    var arr = s.settings.quickPhrases.slice().sort(function (a, b) { return a.sort - b.sort; });
    var i = arr.findIndex(function (p) { return p.id === Number(id); });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    var tmp = arr[i].sort; arr[i].sort = arr[j].sort; arr[j].sort = tmp;
    arr.sort(function (a, b) { return a.sort - b.sort; });
    s.settings.quickPhrases = arr;
    save();
  }

  function categories() {
    return get().merchantCategories.slice().sort(function (a, b) { return a.sortNo - b.sortNo; });
  }

  function saveCategory(data) {
    var s = get();
    data = data || {};
    var name = String(data.name || '').trim();
    if (!name) throw new Error('类目名称必填');
    var c = null;
    if (data.id) c = s.merchantCategories.filter(function (x) { return x.id === Number(data.id); })[0];
    else if (data.code) c = s.merchantCategories.filter(function (x) { return x.code === data.code; })[0];
    if (!c) {
      var id = nextId('category');
      c = { id: id, code: String(data.code || ('cat' + id)).trim(), name: name, sortNo: s.merchantCategories.length + 1, enabled: true };
      s.merchantCategories.push(c);
    }
    if (data.code && c.code !== data.code && !s.merchantCategories.some(function (x) { return x.id !== c.id && x.code === data.code; })) c.code = data.code;
    c.name = name;
    if (data.sortNo != null) c.sortNo = num(data.sortNo, c.sortNo);
    if (data.enabled != null) c.enabled = !!data.enabled;
    save();
    return c;
  }

  function merchantFields() {
    return get().merchantFields.slice().sort(function (a, b) { return a.sortNo - b.sortNo; });
  }

  function saveMerchantField(data) {
    var s = get();
    data = data || {};
    var key = String(data.fieldKey || '').trim();
    var label = String(data.label || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(key)) throw new Error('字段 key 要是英文，字母开头');
    if (!label) throw new Error('字段名称必填');
    var type = data.type || 'text';
    if (FIELD_TYPES.indexOf(type) < 0) throw new Error('字段类型不支持');
    var f = null;
    if (data.id) f = s.merchantFields.filter(function (x) { return x.id === Number(data.id); })[0];
    else f = s.merchantFields.filter(function (x) { return x.fieldKey === key; })[0];
    if (!f) {
      f = { id: nextId('field'), fieldKey: key, label: label, type: type, required: false, options: [], sortNo: s.merchantFields.length + 1, enabled: true };
      s.merchantFields.push(f);
    }
    if (s.merchantFields.some(function (x) { return x.id !== f.id && x.fieldKey === key; })) throw new Error('字段 key 重复');
    f.fieldKey = key;
    f.label = label;
    f.type = type;
    if (data.required != null) f.required = !!data.required;
    if (data.options) f.options = data.options.slice();
    if (data.sortNo != null) f.sortNo = num(data.sortNo, f.sortNo);
    if (data.enabled != null) f.enabled = !!data.enabled;
    save();
    return f;
  }

  function serviceTypes() { return get().serviceTypes.slice(); }

  function saveServiceType(patch) {
    var s = get();
    if (!patch || !patch.code) throw new Error('缺少服务类型 code');
    var st = s.serviceTypes.filter(function (x) { return x.code === patch.code; })[0];
    if (!st) throw new Error('服务类型不存在');
    Object.keys(patch).forEach(function (k) {
      if (k === 'code') return;
      if (k === 'defaultFeeFen') {
        var fee = num(patch[k]);
        if (fee < 0) throw new Error('默认服务费不能为负');
        st.defaultFeeFen = fee;
      } else {
        st[k] = patch[k];
      }
    });
    if (st.code === 'buy' && patch.defaultFeeFen != null) {
      s.settings.defaultFeeFen = st.defaultFeeFen;
      s.settings.defaultServiceFeeFen = st.defaultFeeFen;
    }
    save();
    return st;
  }

  function addServiceType(data) {
    var s = get();
    data = data || {};
    var code = String(data.code || '').trim();
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) throw new Error('code 要用小写英文，字母开头');
    if (s.serviceTypes.some(function (x) { return x.code === code; })) throw new Error('服务类型 code 已存在');
    var name = String(data.name || '').trim();
    if (!name) throw new Error('服务类型名称必填');
    var formKind = data.formKind || 'blank';
    if (['buy', 'route', 'driver', 'blank'].indexOf(formKind) < 0) throw new Error('表单版式不支持');
    var flowKind = data.flowKind || 'standard';
    if (['buy', 'standard', 'scheduled'].indexOf(flowKind) < 0) throw new Error('流程类型不支持');
    var st = {
      code: code, name: name, short: data.short || name, icon: data.icon || 'assets/brand/service-buy.svg',
      formKind: formKind, flowKind: flowKind, defaultFeeFen: num(data.defaultFeeFen, num(s.settings.defaultFeeFen, 1000)),
      enabled: data.enabled !== false, desc: data.desc || '', sortNo: data.sortNo != null ? num(data.sortNo) : s.serviceTypes.length + 1,
      schema: (data.schema || []).slice()
    };
    s.serviceTypes.push(st);
    s.seq.serviceType = Math.max(s.seq.serviceType || 0, s.serviceTypes.length);
    save();
    return st;
  }

  /* ---------- 金额与流水 ---------- */
  function groupsOf(o) { return (o && o.merchantGroups) ? o.merchantGroups : []; }
  function groupPickedCount(o) {
    return groupsOf(o).filter(function (g) { return !!g.pickedAt; }).length;
  }
  function groupPayFen(g) {
    return g.goodsRealFen != null ? num(g.goodsRealFen) : num(g.goodsEstFen);
  }

  function baseOf(o) {
    if (!o) return 0;
    var groups = groupsOf(o);
    var goods;
    if (groups.length) {
      goods = groups.reduce(function (s, g) { return s + groupPayFen(g); }, 0);
    } else {
      goods = o.goodsRealFen != null ? num(o.goodsRealFen) : num(o.goodsEstFen);
    }
    return goods + num(o.serviceFeeFen) + num(o.extraFeeFen) - num(o.discountFen);
  }

  function adjustmentsOf(orderId) {
    return get().ledger.filter(function (e) {
      return e.orderId === Number(orderId) && (e.type === 'ADJUST' || e.type === 'WAIVE');
    }).reduce(function (s, e) { return s + num(e.amountFen); }, 0);
  }

  function receivable(o) { return baseOf(o) + adjustmentsOf(o.id); }

  function paidOf(orderId) {
    return -get().ledger.filter(function (e) {
      return e.orderId === Number(orderId) && e.type === 'PAYMENT';
    }).reduce(function (s, e) { return s + num(e.amountFen); }, 0);
  }

  function owedOf(o) { return Math.max(0, receivable(o) - paidOf(o.id)); }

  function debtOf(customerId) {
    return get().ledger.filter(function (e) { return e.customerId === Number(customerId); })
      .reduce(function (s, e) { return s + num(e.amountFen); }, 0);
  }

  function paymentsOf(orderId) {
    return get().ledger.filter(function (e) { return e.orderId === Number(orderId) && e.type === 'PAYMENT'; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function ledgerOfCustomer(customerId) {
    return get().ledger.filter(function (e) { return e.customerId === Number(customerId); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function post(entry) {
    var s = get();
    var e = {
      id: nextId('ledger'),
      customerId: entry.customerId,
      orderId: entry.orderId || null,
      type: entry.type,
      amountFen: num(entry.amountFen),
      method: entry.method || '',
      note: entry.note || '',
      at: entry.at || nowIso(),
      operator: entry.operator || (me() ? me().name : '系统')
    };
    s.ledger.push(e);
    save();
    return e;
  }

  function logAction(orderId, action, reason, actor, role, extra) {
    var s = get();
    var e = {
      id: nextId('log'), orderId: orderId, action: action, reason: reason || '',
      at: nowIso(), actor: actor || (me() ? me().name : '系统'), role: role || 'staff'
    };
    if (extra) { e.beforeJson = extra.beforeJson || ''; e.afterJson = extra.afterJson || ''; }
    s.logs.push(e);
    save();
    return e;
  }

  function logsOf(orderId) {
    return get().logs.filter(function (l) { return l.orderId === Number(orderId); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function editLogsOf(orderId) {
    return get().logs.filter(function (l) { return l.orderId === Number(orderId) && l.action === 'EDIT'; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }

  function statusLabel(o) {
    if (!o) return '';
    if (o.status === 'PENDING_PREP') return o.serviceType === 'buy' ? '待商家备货' : '待准备';
    if (o.status === 'READY_FOR_PICKUP') {
      if (o.serviceType === 'transfer' || o.serviceType === 'driver') return '待接到';
      if (o.serviceType === 'pickup' || o.serviceType === 'errand') return '待取件';
      return '待取货';
    }
    if (o.status === 'PICKED_UP') {
      if (o.serviceType === 'transfer') return '已接到';
      if (o.serviceType === 'driver') return '已上车';
      return '已取货';
    }
    if (o.status === 'DELIVERING') {
      if (o.serviceType === 'transfer' || o.serviceType === 'driver') return '行程中';
      return '配送中';
    }
    return ST[o.status] ? ST[o.status].label : o.status;
  }

  function statusColor(o) { return (o && ST[o.status]) ? ST[o.status].color : 'slate'; }
  /* ---------- 账单（北京时间切日） ---------- */
  function rangeStart(v) {
    if (v == null || v === '') return -Infinity;
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return bjDayStartMs(s);
    var t = new Date(s).getTime();
    return isNaN(t) ? -Infinity : t;
  }
  function rangeEnd(v) {
    if (v == null || v === '') return Infinity;
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return bjDayStartMs(s) + 86400000;
    var t = new Date(s).getTime();
    return isNaN(t) ? Infinity : t;
  }
  function inRange(iso, from, to) {
    if (!iso) return false;
    var t = new Date(iso).getTime();
    if (isNaN(t)) return false;
    return t >= rangeStart(from) && t < rangeEnd(to);
  }

  function feeSumBetween(startMs, endMs) {
    return get().orders.filter(function (o) {
      if (o.status !== 'FINISHED' || !o.finishedAt) return false;
      var t = new Date(o.finishedAt).getTime();
      return t >= startMs && t < endMs;
    }).reduce(function (s, o) { return s + num(o.serviceFeeFen); }, 0);
  }

  function billingSummary(date) {
    var key = (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) ? String(date) : bjTodayKey();
    var todayStart = bjDayStartMs(key);
    var todayEnd = todayStart + 86400000;
    var yesterdayStart = todayStart - 86400000;
    var totalBillFen = get().ledger.reduce(function (s, e) { return s + num(e.amountFen); }, 0);
    return {
      todayServiceFeeFen: feeSumBetween(todayStart, todayEnd),
      yesterdayServiceFeeFen: feeSumBetween(yesterdayStart, todayStart),
      totalBillFen: totalBillFen
    };
  }

  function billingOrders(from, to, opts) {
    opts = opts || {};
    return get().orders.filter(function (o) {
      var ts = null;
      if (o.finishedAt) ts = new Date(o.finishedAt).getTime();
      else if (opts.includeOpen || opts.includeUnfinished) ts = new Date(o.createdAt).getTime();
      if (ts == null || isNaN(ts)) return false;
      if (!o.finishedAt && !opts.includeOpen && !opts.includeUnfinished) return false;
      if (opts.includeOpen || opts.includeUnfinished) {
        if (o.status === 'CANCELLED') return false;
      } else if (o.status !== 'FINISHED') {
        return false;
      }
      if (ts < rangeStart(from) || ts >= rangeEnd(to)) return false;
      if (opts.status && o.status !== opts.status) return false;
      if (opts.customerId && Number(opts.customerId) !== o.customerId) return false;
      if (opts.serviceType && o.serviceType !== opts.serviceType) return false;
      return true;
    }).sort(function (a, b) {
      return new Date(b.finishedAt || b.createdAt) - new Date(a.finishedAt || a.createdAt);
    });
  }

  function billingPayments(from, to, opts) {
    opts = opts || {};
    var method = opts.method ? normalizeMethod(opts.method) : null;
    return get().ledger.filter(function (e) {
      if (e.type !== 'PAYMENT') return false;
      if (!inRange(e.at, from, to)) return false;
      if (opts.customerId && Number(opts.customerId) !== e.customerId) return false;
      if (opts.orderId && Number(opts.orderId) !== e.orderId) return false;
      if (method && normalizeMethod(e.method) !== method) return false;
      return true;
    }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }

  function orderGoodsFen(o) {
    var groups = groupsOf(o);
    if (groups.length) {
      return groups.reduce(function (s, g) { return s + groupPayFen(g); }, 0);
    }
    return o.goodsRealFen != null ? num(o.goodsRealFen) : num(o.goodsEstFen);
  }

  function billingTotals(orders, payments) {
    orders = orders || [];
    payments = payments || [];
    var out = {
      orderCount: orders.length,
      goodsFen: 0, serviceFeeFen: 0, extraFeeFen: 0, discountFen: 0,
      receivableFen: 0, paidFen: 0, owedFen: 0,
      paymentCount: payments.length, paymentFen: 0, collectedFen: 0
    };
    orders.forEach(function (o) {
      out.goodsFen += orderGoodsFen(o);
      out.serviceFeeFen += num(o.serviceFeeFen);
      out.extraFeeFen += num(o.extraFeeFen);
      out.discountFen += num(o.discountFen);
      out.receivableFen += receivable(o);
      out.paidFen += paidOf(o.id);
      out.owedFen += owedOf(o);
    });
    payments.forEach(function (e) { out.paymentFen += Math.abs(num(e.amountFen)); });
    out.collectedFen = out.paymentFen;
    return out;
  }

  function periodRange(kind, value) {
    var todayStart = bjDayStartMs(bjTodayKey());
    if (kind === 'yesterday') {
      return { from: bjIso(todayStart - 86400000), to: bjIso(todayStart), label: '昨天' };
    }
    if (kind === 'month' || kind === 'yearMonth') {
      var y, m;
      if (value && /^\d{4}-\d{1,2}$/.test(String(value))) {
        var p = String(value).split('-');
        y = Number(p[0]); m = Number(p[1]);
      } else {
        var b = bjShift(Date.now());
        y = b.getUTCFullYear(); m = b.getUTCMonth() + 1;
      }
      if (m < 1 || m > 12) throw new Error('月份不对');
      var ms = Date.UTC(y, m - 1, 1) - BJ_OFFSET_MIN * 60000;
      var next = Date.UTC(y, m, 1) - BJ_OFFSET_MIN * 60000;
      return { from: bjIso(ms), to: bjIso(next), label: y + '年' + m + '月' };
    }
    return { from: bjIso(todayStart), to: bjIso(todayStart + 86400000), label: '今天' };
  }

  function collectedFenOfCustomer(customerId) {
    return get().ledger.filter(function (e) {
      return e.type === 'PAYMENT' && e.customerId === Number(customerId);
    }).reduce(function (s, e) { return s + Math.abs(num(e.amountFen)); }, 0);
  }

  function debtCustomers() {
    return get().customers.map(function (c) {
      var entries = ledgerOfCustomer(c.id);
      var lastOrderAt = null, lastPaymentAt = null;
      get().orders.forEach(function (o) {
        if (o.customerId !== c.id) return;
        if (!lastOrderAt || new Date(o.createdAt) > new Date(lastOrderAt)) lastOrderAt = o.createdAt;
      });
      entries.forEach(function (e) {
        if (e.type !== 'PAYMENT') return;
        if (!lastPaymentAt || new Date(e.at) > new Date(lastPaymentAt)) lastPaymentAt = e.at;
      });
      return {
        customer: c,
        owedFen: Math.max(0, debtOf(c.id)),
        collectedFen: collectedFenOfCustomer(c.id),
        lastOrderAt: lastOrderAt,
        lastPaymentAt: lastPaymentAt
      };
    }).sort(function (a, b) {
      if (b.owedFen !== a.owedFen) return b.owedFen - a.owedFen;
      return new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0);
    });
  }

  function customerBill(customerId) {
    var c = customer(customerId);
    if (!c) throw new Error('客户不存在');
    var openOrders = get().orders.filter(function (o) {
      return o.customerId === c.id && o.status === 'FINISHED' && owedOf(o) > 0;
    }).sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var payments = get().ledger.filter(function (e) {
      return e.type === 'PAYMENT' && e.customerId === c.id;
    }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return {
      customer: c,
      owedFen: Math.max(0, debtOf(c.id)),
      collectedFen: collectedFenOfCustomer(c.id),
      openOrders: openOrders,
      payments: payments,
      entries: ledgerOfCustomer(c.id)
    };
  }

  function collectedTotalFen() {
    return get().ledger.filter(function (e) { return e.type === 'PAYMENT'; })
      .reduce(function (s, e) { return s + Math.abs(num(e.amountFen)); }, 0);
  }

  function normalizeMethod(m) {
    if (!m) return null;
    var s = String(m).trim();
    if (METHOD_LABELS[s]) return s;
    var map = { '微信': 'wechat', '支付宝': 'alipay', '现金': 'cash', '欠款': 'credit', '扫码': 'wechat' };
    return map[s] || null;
  }

  function payDebt(customerId, amountFen, method, note, orderId) {
    var c = customer(customerId);
    if (!c) throw new Error('客户不存在');
    var amount = num(amountFen);
    if (amount <= 0) throw new Error('收款金额必须大于 0');
    var debt = Math.max(0, debtOf(c.id));
    if (amount > debt) {
      throw new Error('收款 ' + yuan(amount) + ' 超过当前欠款 ' + yuan(debt) + '；多收的钱请另外登记');
    }
    var targets;
    if (orderId) {
      var one = order(orderId);
      if (!one) throw new Error('订单不存在');
      if (one.status !== 'FINISHED') throw new Error('这张单还没结单，先结单再收款');
      if (owedOf(one) <= 0) throw new Error('这张单没有未收金额');
      if (amount > owedOf(one)) throw new Error('这张单只欠 ' + yuan(owedOf(one)));
      targets = [one];
    } else {
      targets = get().orders.filter(function (o) {
        return o.customerId === c.id && o.status === 'FINISHED' && owedOf(o) > 0;
      }).sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    }
    var remaining = amount;
    targets.forEach(function (o) {
      if (remaining <= 0) return;
      var owed = owedOf(o);
      if (owed <= 0) return;
      var alloc = Math.min(remaining, owed);
      post({
        customerId: c.id, orderId: o.id, type: 'PAYMENT', amountFen: -alloc,
        method: normalizeMethod(method) || 'wechat', note: note || '登记收款'
      });
      remaining -= alloc;
    });
    if (remaining > 0) throw new Error('没有可冲抵的未收订单');
    return amount;
  }
  /* ---------- 订单 ---------- */
  function sumGroupsEst(groups) {
    return (groups || []).reduce(function (s, g) { return s + num(g.goodsEstFen); }, 0);
  }
  function sumGroupsReal(groups) {
    return (groups || []).reduce(function (s, g) { return s + (g.goodsRealFen != null ? num(g.goodsRealFen) : 0); }, 0);
  }
  function categoryNamesOf(m) {
    return (m && m.categoryIds ? m.categoryIds : []).map(function (id) {
      var c = category(id);
      return c ? c.name : '';
    }).filter(Boolean);
  }
  function hasPhone(g) {
    return !!(g && String(g.merchantPhone || '').trim());
  }

  function resolveMerchantForGroup(raw, orderId) {
    var s = get();
    if (raw.merchantId) {
      var byId = merchant(raw.merchantId);
      if (!byId) throw new Error('第 ' + raw.seq + ' 组的商家不存在');
      return byId;
    }
    var name = String(raw.merchantName || '').trim();
    if (!name) throw new Error('第 ' + raw.seq + ' 组要选商家或填店名');
    var found = s.merchants.filter(function (m) {
      return m.status === 'active' && String(m.name).trim() === name;
    })[0];
    if (found) return found;
    var m = {
      id: nextId('merchant'), name: name, phone: String(raw.merchantPhone || '').trim(), address: '',
      status: 'pending', source: 'order', fromOrderId: orderId || null,
      categoryIds: [], prepTimeoutMin: 10, extra: {}, ownerUserId: null, legacyCategory: ''
    };
    s.merchants.push(m);
    return m;
  }

  function buildItems(rawItems, fallbackText, fallbackEst) {
    var items = [];
    if (rawItems && rawItems.length) {
      rawItems.forEach(function (x, i) {
        var text = String((x && (x.text || x.goodsText)) || '').trim();
        if (!text) throw new Error('第 ' + (i + 1) + ' 件物品要写清楚买什么');
        var qty = x && x.qty != null ? Math.max(1, Math.round(num(x.qty, 1))) : 1;
        var est = x && x.estFen != null ? num(x.estFen) : 0;
        if (est < 0) throw new Error('估价不能为负');
        items.push({ id: nextId('item'), text: text, qty: qty, estFen: est });
      });
    } else if (fallbackText && String(fallbackText).trim()) {
      items.push({ id: nextId('item'), text: String(fallbackText).trim(), qty: 1, estFen: num(fallbackEst) });
    }
    if (!items.length) throw new Error('每家店至少要有一件物品');
    return items;
  }

  function buildGroup(raw, orderId, seqNo, riderId) {
    raw = raw || {};
    var m = resolveMerchantForGroup({
      merchantId: raw.merchantId, merchantName: raw.merchantName,
      merchantPhone: raw.merchantPhone, seq: seqNo
    }, orderId);
    var items = buildItems(raw.items, raw.goodsText || raw.text, raw.goodsEstFen != null ? raw.goodsEstFen : raw.estFen);
    var phone = String(raw.merchantPhone != null && raw.merchantPhone !== '' ? raw.merchantPhone : (m.phone || '')).trim();
    var est = raw.goodsEstFen != null ? num(raw.goodsEstFen) : items.reduce(function (s, x) { return s + num(x.estFen); }, 0);
    var notified = !!(riderId && phone);
    var g = {
      id: nextId('group'),
      seq: seqNo,
      merchantId: m.id,
      merchantName: m.name,
      merchantPhone: phone,
      categoryNames: categoryNamesOf(m),
      source: m.status === 'pending' ? 'pending' : (raw.source || 'existing'),
      prepStatus: notified ? 'notified' : (raw.prepStatus || 'not_needed'),
      notifiedAt: notified ? nowIso() : null,
      readyAt: null,
      goodsEstFen: est,
      goodsRealFen: null,
      pickedAt: null,
      receiptName: '',
      note: String(raw.note || '').trim(),
      items: items
    };
    return { group: g, merit: m };
  }

  function pushNotice(orderId, g) {
    get().notices.push({
      id: nextId('notice'), type: 'prep', orderId: orderId, groupId: g.id, merchantId: g.merchantId,
      text: g.merchantName + '：有一单待备货', at: nowIso(), read: false
    });
  }

  function notifyGroup(o, g) {
    if (g.prepStatus === 'cancelled' || g.pickedAt) return false;
    if (!hasPhone(g)) {
      if (g.prepStatus !== 'ready') g.prepStatus = 'not_needed';
      return false;
    }
    g.prepStatus = 'notified';
    g.notifiedAt = nowIso();
    pushNotice(o.id, g);
    return true;
  }

  function recalcOrder(o) {
    var groups = groupsOf(o);
    if (!groups.length) return;
    o.merchantId = groups[0].merchantId || null;
    o.goodsEstFen = sumGroupsEst(groups);
    var allPicked = groups.every(function (g) { return !!g.pickedAt; });
    o.goodsRealFen = allPicked ? sumGroupsReal(groups) : null;
    if (allPicked && !o.pickedAt) o.pickedAt = nowIso();
  }

  function statusAfterGroups(o) {
    var st = serviceType(o.serviceType);
    if (!o.riderId) { o.status = 'PENDING_DISPATCH'; return; }
    if (!st || st.flowKind !== 'buy') { o.status = 'READY_FOR_PICKUP'; return; }
    var groups = groupsOf(o);
    var pending = groups.some(function (g) {
      return !g.pickedAt && (g.prepStatus === 'notified' || g.prepStatus === 'silent');
    });
    if (groups.length && groups.every(function (g) { return !!g.pickedAt; })) {
      o.status = 'PICKED_UP';
      if (!o.pickedAt) o.pickedAt = nowIso();
      return;
    }
    o.status = pending ? 'PENDING_PREP' : 'READY_FOR_PICKUP';
    if (o.status === 'READY_FOR_PICKUP' && !o.readyAt) o.readyAt = nowIso();
  }

  function nextOrderNo() {
    var s = get();
    var key = bjTodayKey();
    var mmdd = key.slice(5, 7) + key.slice(8, 10);
    var alphabet = 'ACDEFGHJKLMNPQRTUVWXY3479';
    var prefix = (s.settings.orderPrefix || 'MR').toUpperCase();
    var no;
    do {
      no = prefix + mmdd + '-';
      for (var i = 0; i < 4; i++) no += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    } while (s.orders.some(function (o) { return o.no === no; }));
    return no;
  }

  function createOrder(d) {
    var s = get();
    d = d || {};
    var st = serviceType(d.serviceType);
    if (!st) throw new Error('服务类型不存在');
    if (!d.customerId) throw new Error('先选客户，或者当场新建一个');
    var c = customer(d.customerId);
    if (!c) throw new Error('客户不存在');
    var fee = num(d.serviceFeeFen);
    if (fee <= 0) throw new Error('跑腿费必须大于 0');

    var addr = d.address || (c.addresses && c.addresses[0]) || null;
    if (st.formKind === 'buy' && !addr) throw new Error('这个客户还没有收货地址，填一个新地址');
    if (addr && d.saveAddress) {
      if (!c.addresses) c.addresses = [];
      if (!c.addresses.some(function (a) { return a.poi === addr.poi && a.detail === addr.detail; })) {
        addr.id = nextId('address');
        c.addresses.push(addr);
      }
    }

    var riderId = d.riderId ? Number(d.riderId) : null;
    if (riderId && !user(riderId)) throw new Error('骑手不存在');
    var oid = nextId('order');
    var groups = [];

    if (st.flowKind === 'buy' || st.formKind === 'buy') {
      var rawGroups = d.merchantGroups;
      if (!rawGroups || !rawGroups.length) {
        if (d.merchantId || (d.goodsText && String(d.goodsText).trim())) {
          rawGroups = [{
            merchantId: d.merchantId || null, merchantName: d.merchantName || '',
            merchantPhone: d.merchantPhone || '', items: d.items,
            goodsText: d.goodsText, goodsEstFen: d.goodsEstFen, note: d.groupNote || ''
          }];
        } else {
          rawGroups = [];
        }
      }
      if (!rawGroups.length) throw new Error('代买至少填一家要去的店');
      rawGroups.forEach(function (raw, i) {
        if (!raw || !(raw.items && raw.items.length) && !(raw.goodsText && String(raw.goodsText).trim()) && !(raw.text && String(raw.text).trim())) {
          throw new Error('每家店至少填一件要买的东西');
        }
        var built = buildGroup(raw, oid, i + 1, riderId);
        groups.push(built.group);
      });
    }

    var o = {
      id: oid,
      no: nextOrderNo(),
      serviceType: d.serviceType,
      customerId: Number(d.customerId),
      riderId: riderId,
      status: 'PENDING_DISPATCH',
      source: d.source || 'phone',
      merchantId: groups.length ? groups[0].merchantId : null,
      merchantGroups: groups,
      goodsEstFen: sumGroupsEst(groups),
      goodsRealFen: null,
      serviceFeeFen: fee,
      extraFeeFen: num(d.extraFeeFen),
      discountFen: num(d.discountFen),
      addressId: addr ? addr.id : null,
      address: addr ? { contactName: addr.contactName, phone: addr.phone, poi: addr.poi, detail: addr.detail } : null,
      service: d.service || {},
      serviceSchemaSnapshot: d.serviceSchemaSnapshot ? d.serviceSchemaSnapshot : clone(st.schema || []),
      note: d.note || '',
      createdAt: nowIso(), dispatchedAt: null, readyAt: null,
      pickedAt: null, deliveringAt: null, deliveredAt: null, finishedAt: null,
      settleMethod: null,
      attachments: (d.attachments || []).slice(),
      cancelReason: '', deliverNote: ''
    };

    if (!riderId) {
      o.status = 'PENDING_DISPATCH';
    } else if (st.flowKind === 'buy') {
      o.dispatchedAt = nowIso();
      var needs = groups.some(function (g) { return g.prepStatus === 'notified'; });
      o.status = needs ? 'PENDING_PREP' : 'READY_FOR_PICKUP';
      if (!needs) o.readyAt = nowIso();
    } else {
      o.dispatchedAt = nowIso();
      o.status = 'READY_FOR_PICKUP';
    }

    s.orders.unshift(o);
    groups.forEach(function (g) {
      if (g.prepStatus === 'notified') pushNotice(o.id, g);
    });
    var names = groups.map(function (g) { return g.merchantName; }).filter(Boolean);
    logAction(o.id, 'CREATE', '电话录单 · ' + st.name + (names.length ? '（' + names.join('、') + '）' : ''), me() ? me().name : '老板');
    if (riderId) {
      var r = user(riderId);
      var notifiedNames = groups.filter(function (g) { return g.prepStatus === 'notified'; }).map(function (g) { return g.merchantName; });
      logAction(o.id, 'DISPATCH',
        '指派' + (r ? r.name : '') + (notifiedNames.length ? '，已通知' + notifiedNames.join('、') : '，无需商家备货'),
        me() ? me().name : '老板');
    }
    save();
    return o;
  }

  function editOrder(orderId, patch) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status === 'FINISHED' || o.status === 'CANCELLED') throw new Error('已结单 / 已取消的订单不能改，只能走货款调整或收款');
    patch = patch || {};
    var reason = String(patch.reason || '').trim();
    if (!reason) throw new Error('改单必须写原因');
    var before = clone(o);
    var changed = [];
    var isPre = ['PENDING_DISPATCH', 'PENDING_PREP', 'READY_FOR_PICKUP'].indexOf(o.status) >= 0;
    var isMid = o.status === 'PICKED_UP' || o.status === 'DELIVERING';
    var has = function (k) { return Object.prototype.hasOwnProperty.call(patch, k); };

    if (o.status === 'DELIVERED') {
      Object.keys(patch).forEach(function (k) {
        if (k !== 'note' && k !== 'reason') throw new Error('已送达的订单只能改备注');
      });
      if (has('note')) { o.note = String(patch.note || ''); changed.push('备注'); }
    } else if (isPre) {
      if (has('customerId') && Number(patch.customerId) !== o.customerId) {
        if (get().ledger.some(function (e) { return e.orderId === o.id; })) throw new Error('这单已经有收付款流水，不能改客户');
        var nc = customer(patch.customerId);
        if (!nc) throw new Error('客户不存在');
        o.customerId = nc.id;
        changed.push('客户');
      }
      if (has('addressId') && patch.addressId) {
        var ac = customer(o.customerId);
        var a = ac && (ac.addresses || []).filter(function (x) { return x.id === Number(patch.addressId); })[0];
        if (a) {
          o.addressId = a.id;
          o.address = { contactName: a.contactName, phone: a.phone, poi: a.poi, detail: a.detail };
          changed.push('地址');
        }
      }
      if (has('address') && patch.address) {
        var pa = patch.address || {};
        o.address = {
          contactName: pa.contactName != null ? pa.contactName : (o.address ? o.address.contactName : ''),
          phone: pa.phone != null ? pa.phone : (o.address ? o.address.phone : ''),
          poi: pa.poi != null ? pa.poi : (o.address ? o.address.poi : ''),
          detail: pa.detail != null ? pa.detail : (o.address ? o.address.detail : '')
        };
        changed.push('地址/联系人');
      }
      if (has('serviceFeeFen')) {
        var fee = num(patch.serviceFeeFen);
        if (fee <= 0) throw new Error('跑腿费必须大于 0');
        o.serviceFeeFen = fee; changed.push('跑腿费');
      }
      if (has('extraFeeFen')) {
        var extra = num(patch.extraFeeFen);
        if (extra < 0) throw new Error('附加费不能为负');
        o.extraFeeFen = extra; changed.push('附加费');
      }
      if (has('discountFen')) {
        var disc = num(patch.discountFen);
        if (disc < 0) throw new Error('优惠不能为负');
        o.discountFen = disc; changed.push('优惠');
      }
      if (has('note')) { o.note = String(patch.note || ''); changed.push('备注'); }
      if (has('service') && patch.service) {
        o.service = o.service || {};
        Object.keys(patch.service).forEach(function (k) { o.service[k] = patch.service[k]; });
        changed.push('服务表单');
      }
      if (has('serviceSchemaSnapshot') && patch.serviceSchemaSnapshot) {
        o.serviceSchemaSnapshot = clone(patch.serviceSchemaSnapshot);
      }
      if (has('merchantGroups')) {
        var editType = serviceType(o.serviceType);
        if (!editType || editType.flowKind !== 'buy') throw new Error('这个服务类型没有商家组');
        if (!patch.merchantGroups || !patch.merchantGroups.length) throw new Error('代买单不能把商家组清空');
        var newGroups = [];
        patch.merchantGroups.forEach(function (raw, i) {
          newGroups.push(buildGroup(raw, o.id, i + 1, o.riderId).group);
        });
        o.merchantGroups = newGroups;
        recalcOrder(o);
        if (o.riderId) {
          newGroups.forEach(function (g) {
            if (g.prepStatus === 'notified') pushNotice(o.id, g);
          });
          statusAfterGroups(o);
        }
        changed.push('商家组/物品');
      }
    } else if (isMid) {
      ['customerId', 'merchantGroups', 'goodsEstFen', 'goodsRealFen', 'serviceFeeFen', 'extraFeeFen', 'discountFen'].forEach(function (k) {
        if (has(k)) throw new Error('已取货 / 配送中不能改客户、商家组、货款、跑腿费');
      });
      if (has('address') && patch.address) {
        var pa2 = patch.address || {};
        o.address = {
          contactName: pa2.contactName != null ? pa2.contactName : (o.address ? o.address.contactName : ''),
          phone: pa2.phone != null ? pa2.phone : (o.address ? o.address.phone : ''),
          poi: pa2.poi != null ? pa2.poi : (o.address ? o.address.poi : ''),
          detail: pa2.detail != null ? pa2.detail : (o.address ? o.address.detail : '')
        };
        changed.push('地址/联系人');
      }
      if (has('service') && patch.service) {
        o.service = o.service || {};
        Object.keys(patch.service).forEach(function (k) { o.service[k] = patch.service[k]; });
        changed.push('服务表单');
      }
      if (has('note')) { o.note = String(patch.note || ''); changed.push('备注'); }
    } else {
      throw new Error('当前状态不能改单');
    }

    logAction(o.id, 'EDIT',
      reason + (changed.length ? '；改动：' + changed.join('、') : ''),
      me() ? me().name : '老板', 'staff',
      { beforeJson: JSON.stringify(before), afterJson: JSON.stringify(o) });
    save();
    return o;
  }

  function addMerchantGroup(orderId, group) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    var st = serviceType(o.serviceType);
    if (!st || st.flowKind !== 'buy') throw new Error('这个服务类型不需要商家');
    if (['PICKED_UP', 'DELIVERING', 'DELIVERED', 'FINISHED', 'CANCELLED'].indexOf(o.status) >= 0) {
      throw new Error('取货后不能再补商家');
    }
    if (!group) throw new Error('缺少商家组');
    if (!o.merchantGroups) o.merchantGroups = [];
    var built = buildGroup(group, o.id, o.merchantGroups.length + 1, o.riderId);
    o.merchantGroups.push(built.group);
    recalcOrder(o);
    if (o.riderId) {
      var didNotify = notifyGroup(o, built.group);
      statusAfterGroups(o);
      if (didNotify) o.status = 'PENDING_PREP';
    }
    logAction(o.id, 'ADD_GROUP', '补商家：' + built.group.merchantName, me() ? me().name : '老板');
    save();
    return o;
  }
  function dispatch(orderId, riderId) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'PENDING_DISPATCH') throw new Error('这单已经是「' + statusLabel(o) + '」，不用再派');
    var r = user(riderId);
    if (!r || !hasRole(r, 'rider')) throw new Error('骑手不存在');
    var st = serviceType(o.serviceType);
    o.riderId = r.id;
    o.dispatchedAt = nowIso();
    if (st && st.flowKind === 'buy') {
      var need = false;
      groupsOf(o).forEach(function (g) {
        if (g.pickedAt || g.prepStatus === 'cancelled' || g.prepStatus === 'ready') return;
        if (notifyGroup(o, g)) need = true;
      });
      o.status = need ? 'PENDING_PREP' : 'READY_FOR_PICKUP';
      if (!need && !o.readyAt) o.readyAt = nowIso();
    } else {
      o.status = 'READY_FOR_PICKUP';
    }
    logAction(o.id, 'DISPATCH', '指派' + r.name + (st && st.flowKind === 'buy' ? '，已通知商家' : ''), me() ? me().name : '老板');
    save();
    return o;
  }

  function markReady(orderId, groupId) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    var groups = groupsOf(o);
    if (!groups.length) {
      if (o.status !== 'PENDING_PREP') throw new Error('只有在等备货时才谈得上备货完成');
      o.status = 'READY_FOR_PICKUP';
      o.readyAt = nowIso();
      logAction(o.id, 'MERCHANT_READY', '调度台确认准备完成', me() ? me().name : '老板');
      save();
      return o;
    }
    var targets;
    if (groupId) {
      var g = groups.filter(function (x) { return x.id === Number(groupId); })[0];
      if (!g) throw new Error('商家组不存在');
      if (g.pickedAt) throw new Error('这家已经取过货了');
      targets = [g];
    } else {
      targets = groups.filter(function (g) {
        return !g.pickedAt && (g.prepStatus === 'notified' || g.prepStatus === 'silent');
      });
      if (!targets.length) throw new Error('这单没有待备货的商家组');
    }
    targets.forEach(function (g) {
      g.prepStatus = 'ready';
      g.readyAt = nowIso();
    });
    var stillPending = groups.some(function (g) {
      return !g.pickedAt && (g.prepStatus === 'notified' || g.prepStatus === 'silent');
    });
    if (!stillPending && o.status === 'PENDING_PREP') {
      o.status = 'READY_FOR_PICKUP';
      o.readyAt = o.readyAt || nowIso();
    }
    logAction(o.id, 'MERCHANT_READY',
      targets.map(function (g) { return g.merchantName; }).join('、') + ' 确认备货完成',
      me() ? me().name : '老板',
      me() && me().name !== '老板' ? 'merchant' : 'staff');
    save();
    return o;
  }

  function markShortage(orderId, groupId, text) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    var groups = groupsOf(o);
    var g = null;
    if (groupId) g = groups.filter(function (x) { return x.id === Number(groupId); })[0];
    else if (groups.length === 1) g = groups[0];
    if (!g) throw new Error('要指明是哪家店缺货');
    g.prepStatus = 'silent';
    g.note = (g.note ? g.note + '；' : '') + '缺货：' + (text || '缺货');
    logAction(o.id, 'SHORTAGE', g.merchantName + '：' + (text || '缺货'), me() ? me().name : '系统', 'merchant');
    save();
    return o;
  }

  function pickupGroup(orderId, groupId, data) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    var groups = groupsOf(o);
    if (!groups.length) throw new Error('这一单没有商家组，请直接用取货');
    if (o.status !== 'READY_FOR_PICKUP') throw new Error('当前状态「' + statusLabel(o) + '」不能取货');
    var g = groups.filter(function (x) { return x.id === Number(groupId); })[0];
    if (!g) throw new Error('商家组不存在');
    if (g.pickedAt) throw new Error('这家已经取过货了');
    data = data || {};
    if (data.goodsRealFen === undefined || data.goodsRealFen === null || data.goodsRealFen === '') {
      throw new Error('必须录实际货款；0 元也要填 0');
    }
    var amount = Number(data.goodsRealFen);
    if (!isFinite(amount) || amount < 0) throw new Error('实际货款不能为负');
    g.goodsRealFen = amount;
    g.pickedAt = nowIso();
    g.receiptName = data.receiptName || (data.receipt && data.receipt.name) || '';
    if (data.note) g.note = (g.note ? g.note + '；' : '') + data.note;
    if (data.receipt && typeof data.receipt === 'object') {
      var rec = clone(data.receipt);
      if (!rec.id) rec.id = nextId('attachment');
      if (!rec.kind) rec.kind = 'image';
      o.attachments = o.attachments || [];
      o.attachments.push(rec);
    }
    var allPicked = groups.every(function (x) { return !!x.pickedAt; });
    if (allPicked) {
      o.status = 'PICKED_UP';
      o.pickedAt = nowIso();
      o.goodsRealFen = sumGroupsReal(groups);
    } else {
      o.status = 'READY_FOR_PICKUP';
      o.goodsRealFen = null;
    }
    logAction(o.id, 'PICKED',
      '取货 · ' + g.merchantName + '：' + (amount === 0 ? '实付 0 元（已确认无货款）' : '垫付 ' + yuan(amount)) +
      (g.receiptName ? '，小票已存证' : '，未拍照'),
      me() ? me().name : '骑手', 'rider');
    save();
    return o;
  }

  function pickup(orderId, data) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    data = data || {};
    var groups = groupsOf(o);
    if (groups.length) {
      if (data.groupId) return pickupGroup(orderId, data.groupId, data);
      if (groups.length === 1) return pickupGroup(orderId, groups[0].id, data);
      throw new Error('这一单有 ' + groups.length + ' 家店，请按商家逐个取货');
    }
    if (o.status !== 'READY_FOR_PICKUP') throw new Error('当前状态不能取货');
    var amount = data.goodsRealFen != null && data.goodsRealFen !== '' ? Number(data.goodsRealFen) : 0;
    if (!isFinite(amount) || amount < 0) throw new Error('金额不能为负');
    o.goodsRealFen = amount;
    o.pickMethod = data.method || 'scan';
    o.pickNote = data.note || '';
    if (data.receipt && typeof data.receipt === 'object') {
      var rec = clone(data.receipt);
      if (!rec.id) rec.id = nextId('attachment');
      o.attachments = o.attachments || [];
      o.attachments.push(rec);
    }
    o.status = 'PICKED_UP';
    o.pickedAt = nowIso();
    logAction(o.id, 'PICKED',
      (o.serviceType === 'buy' ? '垫付 ' + yuan(amount) : '已接单开始服务') +
      (data.receipt ? '，小票已存证' : '，未拍照'),
      me() ? me().name : '骑手', 'rider');
    save();
    return o;
  }

  function startService(orderId) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'PICKED_UP') throw new Error('当前状态不能开始服务');
    var groups = groupsOf(o);
    var left = groups.filter(function (g) { return !g.pickedAt; });
    if (left.length) throw new Error('还有 ' + left.length + ' 家店没取货，全部取齐才能开始配送');
    o.status = 'DELIVERING';
    o.deliveringAt = nowIso();
    logAction(o.id, 'DELIVERING',
      o.serviceType === 'transfer' || o.serviceType === 'driver' ? '行程开始' : '开始配送',
      me() ? me().name : '骑手', 'rider');
    save();
    return o;
  }

  function deliver(orderId, note) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'DELIVERING') throw new Error('当前状态不能送达');
    o.status = 'DELIVERED';
    o.deliveredAt = nowIso();
    o.deliverNote = note || '';
    logAction(o.id, 'DELIVERED', note || '已送达', me() ? me().name : '骑手', 'rider');
    save();
    return o;
  }

  function finish(orderId, paidFen, method) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status !== 'DELIVERED') throw new Error('只有已送达的单才能结单');
    var methodCode = normalizeMethod(method);
    if (!methodCode) throw new Error('收款方式要选：微信 / 支付宝 / 现金 / 欠款');
    var recv = receivable(o);
    var paid = num(paidFen);
    if (paid < 0) throw new Error('实收不能为负');
    if (methodCode === 'credit' && paid !== 0) throw new Error('选「欠款」时实收必须填 0');
    if (paid > recv) throw new Error('实收 ' + yuan(paid) + ' 大于应收 ' + yuan(recv) + '；多收的钱请另外登记');

    o.status = 'FINISHED';
    o.finishedAt = nowIso();
    o.settleMethod = methodCode;
    post({ customerId: o.customerId, orderId: o.id, type: 'CHARGE', amountFen: baseOf(o), note: '结单应收' });
    if (paid > 0) {
      post({ customerId: o.customerId, orderId: o.id, type: 'PAYMENT', amountFen: -paid, method: methodCode, note: '结单收款' });
    }
    logAction(o.id, 'FINISH',
      '应收 ' + yuan(recv) + '，实收 ' + yuan(paid) + '（' + METHOD_LABELS[methodCode] + '），欠 ' + yuan(recv - paid),
      me() ? me().name : '老板');
    save();
    return o;
  }

  function cancel(orderId, reason, opts) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (isTerminal(o.status)) throw new Error('这单已经结束了');
    var why = String(reason || '').trim();
    if (!why) throw new Error('取消必须写原因');
    if (typeof opts === 'boolean') opts = opts ? { legacyConfirmed: true } : {};
    opts = opts || {};

    var groups = groupsOf(o);
    var advance = groups.reduce(function (s, g) {
      return s + (g.goodsRealFen != null && num(g.goodsRealFen) > 0 ? num(g.goodsRealFen) : 0);
    }, 0);
    if (!groups.length && o.goodsRealFen != null && num(o.goodsRealFen) > 0) advance = num(o.goodsRealFen);

    var recovered = null;
    if (opts.recoveredFen != null) {
      recovered = num(opts.recoveredFen);
      if (recovered < 0) throw new Error('追回金额不能为负');
      if (recovered > advance) throw new Error('追回金额不能超过已垫付 ' + yuan(advance));
    }
    if (advance > 0 && recovered == null && !opts.markLoss && !opts.legacyConfirmed) {
      throw new Error('这单已垫付 ' + yuan(advance) + '，取消前必须确认已向商家追回或计入损失');
    }
    o.status = 'CANCELLED';
    o.cancelledAt = nowIso();
    o.cancelReason = why;
    groups.forEach(function (g) {
      if (!g.pickedAt) g.prepStatus = 'cancelled';
    });
    var tail = '';
    if (opts.markLoss) tail = '；垫付 ' + yuan(advance) + ' 计入损失';
    else if (recovered != null) tail = '；已向商家追回 ' + yuan(recovered);
    logAction(o.id, 'CANCEL', why + tail, me() ? me().name : '老板');
    save();
    return o;
  }

  function adjust(orderId, a, b, c) {
    var o = order(orderId);
    if (!o) throw new Error('订单不存在');
    if (o.status === 'CANCELLED') throw new Error('已取消的订单不用再调货款');
    var delta, reason, type, label;
    if (a && typeof a === 'object') {
      var dir = a.direction;
      var amount = num(a.amountFen);
      reason = String(a.reason || '').trim();
      if (!reason) throw new Error('调货款必须写明原因');
      if (amount <= 0) throw new Error('差多少钱只填正数');
      if (dir === 'merchant_refund') { delta = -amount; type = 'ADJUST'; label = '商家退我钱'; }
      else if (dir === 'pay_merchant') { delta = amount; type = 'ADJUST'; label = '我补给商家'; }
      else if (dir === 'waive') { delta = -amount; type = 'WAIVE'; label = '给客户免掉'; }
      else throw new Error('方向要选：商家退我钱 / 我补给商家 / 给客户免掉');
    } else {
      delta = num(a);
      reason = String(b || '').trim();
      type = c || 'ADJUST';
      if (!reason) throw new Error('调货款必须写明原因');
      if (!delta) throw new Error('差额不能为 0');
      label = type === 'WAIVE' ? '给客户免掉' : (delta < 0 ? '商家退我钱' : '我补给商家');
    }
    post({ customerId: o.customerId, orderId: o.id, type: type, amountFen: delta, note: label + '：' + reason });
    logAction(o.id, type === 'WAIVE' ? 'WAIVE' : 'ADJUST', label + ' ' + yuan(Math.abs(delta)) + '：' + reason, me() ? me().name : '老板');
    save();
    return o;
  }
  /* ---------- 客户 / 商家 / 用户 ---------- */
  function addCustomer(data) {
    var s = get();
    data = data || {};
    var name = String(data.name || '').trim();
    var phone = String(data.phone || '').trim();
    if (!name) throw new Error('客户称呼必填');
    if (!/^1\d{10}$/.test(phone)) throw new Error('手机号要填 11 位');
    if (s.users.some(function (u) { return u.phone === phone; })) throw new Error('手机号 ' + phone + ' 已经建过账号了');
    var u = {
      id: nextId('user'), name: name, phone: phone, password: data.password || '123456',
      status: 'active', lastLogin: null, roles: [{ role: 'customer' }], mustChangePassword: false
    };
    s.users.push(u);
    var c = { id: nextId('customer'), userId: u.id, note: String(data.note || '').trim(), addresses: [] };
    if (data.address && data.address.poi) {
      c.addresses.push({
        id: nextId('address'), poi: data.address.poi, detail: data.address.detail || '',
        contactName: name, phone: phone, isDefault: true
      });
    }
    s.customers.push(c);
    save();
    return c;
  }

  function legacyCategoryIds(text) {
    var t = String(text || '');
    if (!t) return [];
    var hit = [];
    get().merchantCategories.forEach(function (c) {
      if (t.indexOf(c.name) >= 0 || c.name.indexOf(t) >= 0) hit.push(c.id);
    });
    if (!hit.length) {
      if (/生鲜|超市|菜/.test(t)) hit.push(1);
      else if (/药/.test(t)) hit.push(2);
      else if (/便利|小卖/.test(t)) hit.push(3);
      else if (/餐|饭|食/.test(t)) hit.push(4);
      else if (/水果/.test(t)) hit.push(5);
      else {
        var other = get().merchantCategories.filter(function (c) { return c.code === 'other'; })[0];
        if (other) hit.push(other.id);
      }
    }
    return hit;
  }

  function normalizeCategoryIds(list) {
    var out = [];
    (list || []).forEach(function (x) {
      var c = null;
      if (typeof x === 'number' || /^\d+$/.test(String(x))) c = category(Number(x));
      if (!c) c = get().merchantCategories.filter(function (y) { return y.code === String(x); })[0];
      if (!c) c = get().merchantCategories.filter(function (y) { return y.name === String(x); })[0];
      if (c && out.indexOf(c.id) < 0) out.push(c.id);
    });
    return out;
  }

  function normalizeRoles(roles) {
    if (!roles) return [];
    var out = [];
    roles.forEach(function (r) {
      var role = typeof r === 'string' ? r : (r && r.role);
      if (!role) return;
      if (out.some(function (x) { return x.role === role; })) {
        if (role === 'merchant' && r && r.merchantId) {
          out.forEach(function (x) { if (x.role === 'merchant') x.merchantId = Number(r.merchantId); });
        }
        return;
      }
      var item = { role: role };
      if (role === 'merchant' && r && r.merchantId) item.merchantId = Number(r.merchantId);
      if (role === 'customer' && r && r.customerId) item.customerId = Number(r.customerId);
      out.push(item);
    });
    return out;
  }

  function addMerchant(data) {
    var s = get();
    data = data || {};
    var name = String(data.name || '').trim();
    if (!name) throw new Error('店名必填');
    var catIds = normalizeCategoryIds(data.categoryIds || data.categories);
    if (!catIds.length && data.category) catIds = legacyCategoryIds(data.category);
    var m = {
      id: nextId('merchant'), name: name,
      phone: String(data.phone || '').trim(), address: String(data.address || '').trim(),
      status: data.status || 'active', source: 'user', fromOrderId: null,
      categoryIds: catIds, prepTimeoutMin: num(data.prepTimeoutMin, 10),
      extra: data.extra || {}, ownerUserId: null,
      legacyCategory: String(data.category || '').trim()
    };
    s.merchants.push(m);
    save();
    return m;
  }

  function validateMerchantPayload(data, u) {
    var mer = data.merchant || data;
    var catIds = normalizeCategoryIds(mer.categoryIds || mer.categories);
    if (!catIds.length) throw new Error('商家至少要选一个类目');
    var name = String(mer.name || (u && u.name) || '').trim();
    if (!name) throw new Error('店名必填');
    return { mer: mer, catIds: catIds, name: name };
  }

  function applyMerchantToUser(u, data) {
    var role = u.roles.filter(function (r) { return r.role === 'merchant'; })[0];
    if (!role) throw new Error('这个用户没有商家角色');
    var m = role.merchantId ? merchant(role.merchantId) : null;
    var info = data || {};
    if (!info.merchant && !info.categoryIds && !info.categories) {
      if (!m) throw new Error('商家角色要绑定门店，请填店名和类目');
      return m;
    }
    var v = validateMerchantPayload(info.merchant ? { merchant: info.merchant } : info, u);
    var mer = v.mer;
    if (!m) {
      m = {
        id: nextId('merchant'), name: v.name, phone: '', address: '', status: 'active',
        source: 'user', fromOrderId: null, categoryIds: [], prepTimeoutMin: 10,
        extra: {}, ownerUserId: u.id, legacyCategory: ''
      };
      get().merchants.push(m);
    }
    m.name = v.name;
    m.categoryIds = v.catIds;
    if (mer.phone != null) m.phone = String(mer.phone || '').trim();
    if (mer.address != null) m.address = String(mer.address || '').trim();
    if (mer.prepTimeoutMin != null) m.prepTimeoutMin = num(mer.prepTimeoutMin, m.prepTimeoutMin || 10);
    if (mer.extra) m.extra = mer.extra;
    m.status = 'active';
    m.source = m.source || 'user';
    m.ownerUserId = u.id;
    m.legacyCategory = v.catIds.map(function (id) {
      var c = category(id);
      return c ? c.name : '';
    }).filter(Boolean).join('/');
    role.merchantId = m.id;
    return m;
  }

  function addUser(data) {
    var s = get();
    data = data || {};
    var phone = String(data.phone || '').trim();
    if (!/^1\d{10}$/.test(phone)) throw new Error('手机号要填 11 位');
    if (s.users.some(function (u) { return u.phone === phone; })) throw new Error('手机号已存在');
    var roles = normalizeRoles(data.roles);
    if (!roles.length) throw new Error('至少选一个角色');
    var merchantRole = roles.filter(function (r) { return r.role === 'merchant'; })[0];
    if (merchantRole) {
      var bound = merchantRole.merchantId ? merchant(merchantRole.merchantId) : null;
      if (data.merchant) {
        validateMerchantPayload(data, { name: data.name || phone });
      } else if (!bound || !bound.categoryIds || !bound.categoryIds.length) {
        throw new Error('勾了商家角色，要填门店信息（至少一个类目）');
      }
    }
    var u = {
      id: nextId('user'), name: String(data.name || '').trim() || phone, phone: phone,
      password: data.password || '123456', status: 'active', lastLogin: null, roles: roles,
      mustChangePassword: !!data.mustChangePassword
    };
    s.users.push(u);
    if (merchantRole) applyMerchantToUser(u, data);
    if (hasRole(u, 'customer') && !customerByUser(u.id)) {
      var c = { id: nextId('customer'), userId: u.id, note: String(data.note || '').trim(), addresses: [] };
      if (data.address && data.address.poi) {
        c.addresses.push({
          id: nextId('address'), poi: data.address.poi, detail: data.address.detail || '',
          contactName: u.name, phone: phone, isDefault: true
        });
      }
      s.customers.push(c);
    }
    save();
    return u;
  }

  function updateUser(userId, patch) {
    var u = user(userId);
    if (!u) throw new Error('用户不存在');
    patch = patch || {};
    if (patch.name != null) u.name = String(patch.name).trim() || u.name;
    if (patch.phone != null) {
      var np = String(patch.phone).trim();
      if (!/^1\d{10}$/.test(np)) throw new Error('手机号要填 11 位');
      if (get().users.some(function (x) { return x.id !== u.id && x.phone === np; })) throw new Error('手机号已存在');
      u.phone = np;
    }
    if (patch.status != null) {
      if (u.id === 1 && patch.status !== 'active') throw new Error('不能停用初始超级管理员');
      u.status = patch.status;
    }
    if (patch.roles) {
      var nr = normalizeRoles(patch.roles);
      if (!nr.length) throw new Error('至少留一个角色');
      if (u.id === 1 && !nr.some(function (r) { return r.role === 'super_admin'; })) throw new Error('初始超级管理员不能降级');
      u.roles = nr;
    }
    if (patch.password) {
      if (String(patch.password).length < 6) throw new Error('密码至少 6 位');
      u.password = patch.password;
    }
    if (patch.mustChangePassword != null) u.mustChangePassword = !!patch.mustChangePassword;

    if (hasRole(u, 'merchant')) {
      var mr = u.roles.filter(function (r) { return r.role === 'merchant'; })[0];
      if (patch.merchant) {
        applyMerchantToUser(u, patch);
      } else if (!mr.merchantId || !merchant(mr.merchantId)) {
        throw new Error('商家角色要绑定门店，请填店名和类目');
      }
    } else if (patch.merchant) {
      throw new Error('这个用户没有商家角色，先在角色里勾上商家');
    }

    if (hasRole(u, 'customer') && !customerByUser(u.id)) {
      get().customers.push({ id: nextId('customer'), userId: u.id, note: '', addresses: [] });
    }
    save();
    return u;
  }

  function resetPassword(userId, pwd) {
    var u = user(userId);
    if (!u) throw new Error('用户不存在');
    if (!pwd || String(pwd).length < 6) throw new Error('密码至少 6 位');
    u.password = String(pwd);
    u.mustChangePassword = true;
    save();
    return u;
  }

  function disableUser(userId) {
    if (Number(userId) === 1) throw new Error('不能停用初始超级管理员');
    return updateUser(userId, { status: 'disabled' });
  }

  function enableUser(userId) { return updateUser(userId, { status: 'active' }); }

  function pendingMerchants() {
    return get().merchants.filter(function (m) { return m.status === 'pending'; });
  }

  function completeMerchant(merchantId, d) {
    var s = get();
    d = d || {};
    var m = merchant(merchantId);
    if (!m) throw new Error('商家不存在');
    if (m.status !== 'pending') throw new Error('这个商家不是待完善状态');
    var catIds = normalizeCategoryIds(d.categoryIds || d.categories);
    if (!catIds.length) throw new Error('补全商家至少要选一个类目');
    var phone = String(d.phone != null ? d.phone : m.phone).trim();
    if (!phone) throw new Error('补全商家要填门店电话');
    var address = String(d.address != null ? d.address : m.address).trim();
    if (!address) throw new Error('补全商家要填门店地址');
    var name = String(d.name || m.name).trim();

    var target = s.merchants.filter(function (x) {
      if (x.id === m.id || x.status !== 'active') return false;
      return x.name === name || (!!phone && x.phone === phone);
    })[0];

    if (target) {
      s.orders.forEach(function (o) {
        groupsOf(o).forEach(function (g) {
          if (g.merchantId !== m.id) return;
          g.merchantId = target.id;
          g.merchantName = target.name;
          g.merchantPhone = target.phone || g.merchantPhone;
          g.categoryNames = categoryNamesOf(target);
          g.source = 'existing';
        });
        if (o.merchantId === m.id && groupsOf(o).length) o.merchantId = groupsOf(o)[0].merchantId;
      });
      catIds.forEach(function (id) {
        if (target.categoryIds.indexOf(id) < 0) target.categoryIds.push(id);
      });
      if (!target.address) target.address = address;
      if (!target.phone) target.phone = phone;
      s.merchants = s.merchants.filter(function (x) { return x.id !== m.id; });
      m = target;
    } else {
      m.name = name;
      m.phone = phone;
      m.address = address;
      m.categoryIds = catIds;
      m.status = 'active';
      m.source = 'user';
    }
    m.legacyCategory = m.categoryIds.map(function (id) {
      var c = category(id);
      return c ? c.name : '';
    }).filter(Boolean).join('/');

    if (d.createAccount) {
      if (!/^1\d{10}$/.test(String(d.phone || m.phone))) throw new Error('开通账号要用 11 位手机号');
      var accPhone = String(d.phone || m.phone);
      var acc = s.users.filter(function (u) { return u.phone === accPhone; })[0];
      if (!acc) {
        acc = {
          id: nextId('user'), name: m.name, phone: accPhone,
          password: d.password || '123456', status: 'active', lastLogin: null,
          roles: [{ role: 'merchant', merchantId: m.id }], mustChangePassword: true
        };
        s.users.push(acc);
      } else {
        var mr = acc.roles.filter(function (r) { return r.role === 'merchant'; })[0];
        if (mr) mr.merchantId = m.id;
        else acc.roles.push({ role: 'merchant', merchantId: m.id });
      }
      m.ownerUserId = acc.id;
    }
    save();
    return m;
  }

  /* ---------- 看板 ---------- */
  function stats() {
    var s = get();
    var todayKey = bjTodayKey();
    var today = s.orders.filter(function (o) { return bjKeyOf(o.createdAt) === todayKey; }).length;
    var active = s.orders.filter(function (o) { return !isTerminal(o.status); }).length;
    var bs = billingSummary();
    var debt = s.customers.reduce(function (sum, c) { return sum + Math.max(0, debtOf(c.id)); }, 0);
    var todayPaid = s.ledger.filter(function (e) {
      return e.type === 'PAYMENT' && bjKeyOf(e.at) === todayKey;
    }).reduce(function (sum, e) { return sum + Math.abs(num(e.amountFen)); }, 0);
    return {
      today: today,
      active: active,
      todayServiceFeeFen: bs.todayServiceFeeFen,
      yesterdayServiceFeeFen: bs.yesterdayServiceFeeFen,
      totalBillFen: bs.totalBillFen,
      debt: debt,
      todayPaid: todayPaid
    };
  }

  function health() {
    var issues = [];
    var s = get();
    var bs = billingSummary();
    var debtSum = s.customers.reduce(function (sum, c) { return sum + Math.max(0, debtOf(c.id)); }, 0);
    if (Math.abs(bs.totalBillFen - debtSum) > 1) issues.push('账单合计与客户欠款合计不一致');
    s.orders.forEach(function (o) {
      if (o.status === 'PICKED_UP' && groupsOf(o).some(function (g) { return !g.pickedAt; })) {
        issues.push(o.no + ' 已取货但商家组未取齐');
      }
    });
    return { ok: !issues.length, issues: issues };
  }
  /* ---------- 自检 ---------- */
  function selftest() {
    var results = [];
    var backupState = state;
    var raw = null;
    try { if (root.localStorage) raw = root.localStorage.getItem(KEY); } catch (e) { /* ignore */ }
    state = seed();

    function check(cond, msg) { if (!cond) throw new Error(msg); }
    function run(name, fn) {
      try {
        results.push({ name: name, ok: true, msg: fn() || '通过' });
      } catch (e) {
        results.push({ name: name, ok: false, msg: e && e.message ? e.message : String(e) });
      }
    }

    try {
      setSession(1, { type: 'admin' });

      run('0 元取货', function () {
        var o = createOrder({
          serviceType: 'buy', customerId: 1, serviceFeeFen: 1000, riderId: 4,
          merchantGroups: [{ merchantId: 1, items: [{ text: '自检商品', qty: 1, estFen: 500 }] }]
        });
        var g = o.merchantGroups[0];
        markReady(o.id, g.id);
        pickupGroup(o.id, g.id, { goodsRealFen: 0 });
        check(g.goodsRealFen === 0, '商家组货款应为 0');
        check(o.status === 'PICKED_UP', '取齐后订单应为已取货');
        check(o.goodsRealFen === 0, '订单货款合计应为 0');
        check(baseOf(o) === o.serviceFeeFen, '应收应等于跑腿费');
        return '实付 0 元可提交，应收 = 跑腿费';
      });

      run('欠款结单实收必须 0', function () {
        var o = createOrder({
          serviceType: 'pickup', customerId: 1, serviceFeeFen: 1500, riderId: 4,
          address: { poi: '自检点', detail: '' }
        });
        check(o.status === 'READY_FOR_PICKUP', '派单后应待取件');
        pickup(o.id, { goodsRealFen: 0 });
        startService(o.id);
        deliver(o.id, '自检送达');
        var threw = false;
        try { finish(o.id, 500, 'credit'); } catch (e) { threw = true; }
        check(threw, '欠款 + 实收 50 应被拒绝');
        finish(o.id, 0, 'credit');
        check(o.status === 'FINISHED', '应已结单');
        check(paymentsOf(o.id).length === 0, '欠款不应产生收款流水');
        check(owedOf(o) === receivable(o), '应收应全部挂账');
        return '欠款只挂账、不写收款流水';
      });

      run('全部商家组取齐才 PICKED_UP', function () {
        var o = createOrder({
          serviceType: 'buy', customerId: 1, serviceFeeFen: 1000, riderId: 4,
          merchantGroups: [
            { merchantId: 1, items: [{ text: 'A 店商品', qty: 1, estFen: 500 }] },
            { merchantId: 2, items: [{ text: 'B 店商品', qty: 1, estFen: 300 }] }
          ]
        });
        check(o.status === 'PENDING_PREP', '派单后应待备货');
        var gs = o.merchantGroups;
        markReady(o.id, gs[0].id);
        markReady(o.id, gs[1].id);
        check(o.status === 'READY_FOR_PICKUP', '两组备货完成后应待取货');
        pickupGroup(o.id, gs[0].id, { goodsRealFen: 100 });
        check(o.status === 'READY_FOR_PICKUP', '只取一家不能进已取货');
        check(groupPickedCount(o) === 1, '应显示已取 1/2');
        var blocked = false;
        try { startService(o.id); } catch (e) { blocked = true; }
        check(blocked, '未取齐不能开始配送');
        pickupGroup(o.id, gs[1].id, { goodsRealFen: 0 });
        check(o.status === 'PICKED_UP', '全部取齐后应已取货');
        check(o.goodsRealFen === 100, '订单货款应为两组之和');
        return '部分取货保持待取货，取齐才推进';
      });

      run('余额 = 流水', function () {
        var before = debtOf(1);
        var beforeLedger = ledgerOfCustomer(1).reduce(function (s, e) { return s + num(e.amountFen); }, 0);
        check(before === beforeLedger, '还款前余额应等于流水合计');
        payDebt(1, 100, 'cash', '自检登记还款');
        var after = debtOf(1);
        check(before - after === 100, '还款后欠款应减少 100');
        var afterLedger = ledgerOfCustomer(1).reduce(function (s, e) { return s + num(e.amountFen); }, 0);
        check(after === afterLedger, '还款后余额应等于流水合计');
        return '欠款余额始终等于流水净额';
      });

      run('累计收回 = 全部 PAYMENT', function () {
        var manual = get().ledger.filter(function (e) { return e.type === 'PAYMENT'; })
          .reduce(function (s, e) { return s + Math.abs(num(e.amountFen)); }, 0);
        check(collectedTotalFen() === manual, '累计收回应等于全部收款绝对值之和');
        return '累计收回 ¥' + yuan(manual);
      });

      run('权限判断', function () {
        setSession(1, { type: 'admin' });
        check(can('user.view') && can('permission.manage'), '超管应全部通过');
        setSession(6, { type: 'admin' });
        check(can('order.view'), '管理员应有订单权限');
        check(!can('user.view'), '管理员默认没有用户管理权限');
        setSession(5, { type: 'merchant', merchantId: 1 });
        check(can('m.prep.ready'), '商家应有备货权限');
        check(!can('order.view'), '商家不应有调度台订单权限');
        setSession(1, { type: 'admin' });
        return '超管全通过；管理员看 rolePerms；其它角色只看本工作区';
      });

      run('账单合计', function () {
        var bs = billingSummary();
        var manualTotal = get().ledger.reduce(function (s, e) { return s + num(e.amountFen); }, 0);
        var todayKey = bjTodayKey();
        var manualToday = get().orders.filter(function (o) {
          return o.status === 'FINISHED' && bjKeyOf(o.finishedAt) === todayKey;
        }).reduce(function (s, o) { return s + num(o.serviceFeeFen); }, 0);
        check(bs.totalBillFen === manualTotal, '账单合计应等于全部流水净额');
        var debtSum = get().customers.reduce(function (s, c) { return s + debtOf(c.id); }, 0);
        check(bs.totalBillFen === debtSum, '账单合计应等于客户欠款合计');
        check(bs.todayServiceFeeFen === manualToday, '今天跑腿费应按结单时间统计');
        var r = periodRange('today');
        var os = billingOrders(r.from, r.to);
        var ps = billingPayments(r.from, r.to);
        var tt = billingTotals(os, ps);
        check(tt.orderCount === os.length, '订单合计条数应一致');
        var recv = os.reduce(function (s, o) { return s + receivable(o); }, 0);
        check(tt.receivableFen === recv, '订单区块应收合计应一致');
        check(periodRange('yesterday').label === '昨天', '昨天区间标签不对');
        return '三个数与明细合计一致';
      });
    } finally {
      state = backupState;
      try {
        if (root.localStorage) {
          if (raw == null) root.localStorage.removeItem(KEY);
          else root.localStorage.setItem(KEY, raw);
        }
      } catch (e) { /* ignore */ }
    }
    return results;
  }

  root.Store = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    ST: ST,
    COLUMNS: COLUMNS,
    METHODS: METHODS,
    METHOD_LABELS: METHOD_LABELS,
    PERM_GROUPS: PERM_GROUPS,
    ALL_PERMS: ALL_PERMS,
    DEFAULT_ROLE_PERMS: DEFAULT_ROLE_PERMS,
    FIELD_TYPES: FIELD_TYPES,

    get: get,
    save: save,
    reset: reset,
    load: load,
    nextId: nextId,

    session: session,
    me: me,
    login: login,
    logout: logout,
    setSession: setSession,

    user: user,
    users: users,
    customer: customer,
    customers: customers,
    customerByUser: customerByUser,
    merchant: merchant,
    order: order,
    serviceType: serviceType,
    category: category,
    riders: riders,

    hasRole: hasRole,
    workspacesOf: workspacesOf,
    can: can,
    rolePerms: rolePerms,
    saveRolePerms: saveRolePerms,

    settings: settings,
    saveSettings: saveSettings,
    addQuickPhrase: addQuickPhrase,
    removeQuickPhrase: removeQuickPhrase,
    moveQuickPhrase: moveQuickPhrase,
    categories: categories,
    saveCategory: saveCategory,
    merchantFields: merchantFields,
    saveMerchantField: saveMerchantField,
    serviceTypes: serviceTypes,
    saveServiceType: saveServiceType,
    addServiceType: addServiceType,

    createOrder: createOrder,
    editOrder: editOrder,
    addMerchantGroup: addMerchantGroup,
    dispatch: dispatch,
    markReady: markReady,
    markShortage: markShortage,
    pickupGroup: pickupGroup,
    pickup: pickup,
    startService: startService,
    deliver: deliver,
    finish: finish,
    cancel: cancel,
    adjust: adjust,
    logsOf: logsOf,
    editLogsOf: editLogsOf,
    statusLabel: statusLabel,
    statusColor: statusColor,
    groupsOf: groupsOf,
    groupPickedCount: groupPickedCount,
    isTerminal: isTerminal,
    nextOrderNo: nextOrderNo,
    logAction: logAction,

    baseOf: baseOf,
    orderGoodsFen: orderGoodsFen,
    adjustmentsOf: adjustmentsOf,
    receivable: receivable,
    paidOf: paidOf,
    owedOf: owedOf,
    debtOf: debtOf,
    paymentsOf: paymentsOf,
    ledgerOfCustomer: ledgerOfCustomer,
    post: post,

    billingSummary: billingSummary,
    billingOrders: billingOrders,
    billingPayments: billingPayments,
    billingTotals: billingTotals,
    periodRange: periodRange,
    debtCustomers: debtCustomers,
    customerBill: customerBill,
    collectedTotalFen: collectedTotalFen,
    payDebt: payDebt,

    addCustomer: addCustomer,
    addMerchant: addMerchant,
    addUser: addUser,
    updateUser: updateUser,
    resetPassword: resetPassword,
    disableUser: disableUser,
    enableUser: enableUser,
    pendingMerchants: pendingMerchants,
    completeMerchant: completeMerchant,

    stats: stats,
    health: health,
    isToday: isToday,
    selftest: selftest
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
