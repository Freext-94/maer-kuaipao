/** 与后端枚举一一对应的显示字典 + 时间格式化，页面里不再各自硬编码。 */

export const STATUS_COLOR = {
  PENDING: 'slate',
  PICKING: 'amber',
  DELIVERING: 'cyan',
  FINISHED: 'green',
  CANCELLED: 'red',
};

/** 状态码中文名（v2 简化状态机） */
export const STATUS_NAME = {
  PENDING: '待派单',
  PICKING: '取货中',
  DELIVERING: '派送中',
  FINISHED: '已完成',
  CANCELLED: '已取消',
};

/** 操作动作码中文名 */
export const ACTION_NAME = {
  CREATE: '录单',
  DISPATCH: '派单',
  PICKED: '取货',
  FINISH: '确认送达',
  CANCEL: '取消',
  ADJUST: '货款调整',
  EDIT: '改单',
};

/** 按业务区分订单类型；未知类型按服务订单处理。 */
const ORDER_TYPE_LABEL = {
  buy: '跑腿订单',
  pickup: '跑腿订单',
  errand: '代办订单',
  transfer: '接送订单',
  driver: '代驾订单',
};

/** 费用名按业务场景显示；库字段统一为 service_fee_fen，只是界面文案不同。 */
const FEE_LABEL = {
  buy: '跑腿费',
  pickup: '跑腿费',
  errand: '代办费',
  transfer: '接送费',
  driver: '代驾费',
};

export function orderTypeLabel(code) {
  return ORDER_TYPE_LABEL[code] || '服务订单';
}

export function feeLabel(code) {
  return FEE_LABEL[code] || '服务费';
}

/** 下单时的联系渠道（对应后端 source_channel），用于订单来源展示。 */
export const SOURCE_CHANNEL_LABEL = {
  customer_call: '客户来电',
  customer_wechat: '客户微信',
  merchant_call: '商家来电',
  merchant_wechat: '商家微信',
  other: '其他',
};

/** Q-11：订单来源优先按联系渠道显示，未记录再回退到 source。 */
export function sourceLabelOf(order) {
  if (!order) return '—';
  const ch = order.sourceChannel;
  if (ch) {
    const base = SOURCE_CHANNEL_LABEL[ch] || ch;
    return ch === 'other' && order.sourceChannelNote ? base + '：' + order.sourceChannelNote : base;
  }
  return order.source === 'phone' ? '电话' : '自助';
}

export const ROLE_LABEL = { admin: '调度台', merchant: '商家', rider: '骑手', customer: '客户', STAFF: '调度台' };

export const CHANNEL_NAME = {
  POLL: '常驻页轮询',
  SUBSCRIBE: '订阅消息',
  SMS: '短信',
  VOICE: '语音外呼',
  GROUP_MSG: '微信群卡片',
  MANUAL: '人工电话',
};

/** 免登录页看不到推送为什么失败，只能靠这张表解释「商家说没收到」。 */
export const NOTIFY_STATUS = {
  QUEUED: { label: '待发送', color: 'slate' },
  SENT_OK: { label: '已送达', color: 'green' },
  ACKED: { label: '已读', color: 'green' },
  FAILED: { label: '失败', color: 'red' },
  NO_QUOTA: { label: '无订阅额度', color: 'red' },
  SIG_PENDING: { label: '短信签名未报备', color: 'amber' },
};

export const LEDGER_TYPE = {
  CHARGE: { label: '挂账', color: 'amber' },
  PAYMENT: { label: '收款', color: 'green' },
  ADJUST: { label: '冲正', color: 'violet' },
  WAIVE: { label: '减免', color: 'blue' },
  REFUND: { label: '退款', color: 'red' },
};


export const ROLE_NAME = { STAFF: '内部', MERCHANT: '商家', RIDER: '骑手', CUSTOMER: '客户', admin: '调度台' };

export const BILL_STATUS = {
  draft: { label: '草稿', color: 'slate' },
  sent: { label: '已发出', color: 'amber' },
  confirmed: { label: '客户已确认', color: 'green' },
  disputed: { label: '客户有异议', color: 'red' },
};

export const CANCEL_CODES = [
  '客户电话取消',
  '商家缺货且无替代',
  '联系不上收货人',
  '运力不足',
  '下错单',
];

/** 后端 LocalDateTime 序列化成 "2026-11-20T21:56:12"（无时区，就是本机墙上时间）。 */
function toDate(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v).indexOf('T') > 0 ? String(v) : String(v).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const p2 = (n) => String(n).padStart(2, '0');

export function fmtTime(v) {
  const d = toDate(v);
  if (!d) return '—';
  return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '—';
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
    ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
}

export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '—';
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}

export function fmtClock(v) {
  const d = toDate(v);
  if (!d) return '—';
  return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

export function daysAgo(v) {
  const d = toDate(v);
  if (!d) return 0;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

export function minutesSince(v) {
  const d = toDate(v);
  if (!d) return 0;
  return Math.round((Date.now() - d.getTime()) / 60000);
}

export function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + p2(d.getMonth() + 1);
}

export function recentMonths(count = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(d.getFullYear() + '-' + p2(d.getMonth() + 1));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}
