/* 台账与状态机冒烟测试：node prototype/selftest.js
 * 覆盖 index.html 的 6 步演示剧本 + 恒等式与非法流转。
 */
'use strict';
var path = require('path');
var S = require(path.join(__dirname, 'assets', 'store.js'));

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  \u2713 ' + msg); }
  else { fail++; console.log('  \u00d7 ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + '（实际 ' + a + '，期望 ' + b + '）'); }
function throws(fn, msg) {
  try { fn(); ok(false, msg + ' —— 但没有抛错'); }
  catch (e) { ok(true, msg + '：' + e.message); }
}

console.log('\n[1] 种子数据与初始恒等式');
S.reset();
var s = S.get();
ok(s.orders.length >= 11, '订单种子 ' + s.orders.length + ' 单（历史 6 + 今日 5）');
eq(S.verifyLedger(s).length, 0, '初始恒等式：' + JSON.stringify(S.verifyLedger(s)));

console.log('\n[2] 剧本第 1 步：电话录单（王姐 / 瑞雪生鲜 / 估价 86 / 跑腿费 8 / 指派小李）');
var r = S.createOrder({
  source: 'phone', customer_id: 'C1', address_id: 'A1', merchant_id: 'M1', rider_id: 'R1',
  text: '瑞雪超市 3 个西瓜 + 一提抽纸', est_yuan: '86', fee_yuan: '8'
});
var oid = r.order.id;
ok(r.order.source === 'phone' && r.order.created_by === '老板', 'source=phone 且记录录单员');
eq(r.order.status, 'PENDING_PREP', '填了骑手 → 直接进「待商家备货」并通知商家');
var notified = r.state.notify.filter(function (n) { return n.order_id === oid; });
eq(notified.length, 3, '一次派单落 3 条多渠道通知记录（poll/group_msg/manual）');

console.log('\n[3] 剧本第 2 步：商家轮询拉单 + 点备货完成');
var p = S.pollMerchant('M1');
ok(p.orders.indexOf(oid) >= 0, '商家拉到本单');
var sub = p.state.notify.filter(function (n) { return n.order_id === oid && n.channel === 'subscribe'; })[0];
eq(sub.status, 'no_quota', '瑞雪超市订阅额度 0 → 记 no_quota（证明不能只靠推送）');
S.markReady(oid);
eq(S.orderById(S.get(), oid).status, 'READY_FOR_PICKUP', '状态 → 备货完成');
eq(S.quotaOf('M1').quota_left, 1, '商家每操作一次攒 1 条额度（requestSubscribeMessage 的等价物）');

console.log('\n[4] 剧本第 3 步：骑手取货，实付 92.40（比估价高）+ 小票照');
try { S.markPicked(oid, { real_yuan: '92.40' }); ok(false, '缺小票照应当被拒'); }
catch (e) { ok(/小票/.test(e.message), '缺小票照被拒：' + e.message); }
S.markPicked(oid, { real_yuan: '92.40', receipt: 'receipt-924.jpg', method: 'cash', actor: '小李' });
var o = S.orderById(S.get(), oid);
eq(o.status, 'PICKED_UP', '状态 → 已取货');
eq(o.goods_real_fen, 9240, 'goods_real 锁定为 9240 分');
var adv = S.get().advances.filter(function (a) { return a.order_id === oid; })[0];
eq(adv.amount_fen, 9240, '垫付流水 92.40 已记录');
eq(S.orderReceivable(S.get(), o), 10040, '应收 = 92.40 + 8.00 = 100.40');

console.log('\n[5] 剧本第 4 步：送达后当场只收 50 → 本单挂账 50.40；次日再收 30');
var owed0 = S.customerBalance(S.get(), 'C1');
S.startDelivery(oid, '小李');
throws(function () { S.markDelivered(oid, {}); }, '缺送达照片被拒');
S.markDelivered(oid, { photo: 'door-1.jpg', actor: '小李' });
S.finishOrder(oid, { paid_yuan: '50', method: '现金' });
s = S.get(); o = S.orderById(s, oid);
eq(o.status, 'FINISHED', '状态 → 已结单');
eq(S.customerBalance(s, 'C1') - owed0, 5040, '王姐欠款增加 50.40（原有旧账 ' + S.fen2yuan(owed0) + '）');
eq(S.orderPaid(s, oid), 5000, '本单已核销 50.00（付款优先冲本单）');
eq(S.openChargesOf(s, 'C1').filter(function (x) { return x.entry.order_id === oid; })[0].open_fen, 5040, '本单未收 50.40');
var before = S.customerBalance(S.get(), 'C1');
S.receivePayment('C1', '30', '次日微信转账');
eq(S.customerBalance(S.get(), 'C1'), before - 3000, '次日收款 30 → 本单未收降到 20.40');
eq(S.openChargesOf(S.get(), 'C1').filter(function (x) { return x.entry.order_id === oid; })[0].open_fen, 5040, '不指定单据时先冲最老挂账（王姐上周的 136.00），本单仍欠 50.40');
S.receivePayment('C1', '20', '客户指明：上次西瓜那单的尾款', oid);
eq(S.openChargesOf(S.get(), 'C1').filter(function (x) { return x.entry.order_id === oid; })[0].open_fen, 3040, '指明单据时优先冲本单 → 本单未收降到 30.40');
eq(S.verifyLedger(S.get()).length, 0, '恒等式仍平：' + JSON.stringify(S.verifyLedger(S.get())));

console.log('\n[6] 剧本第 5 步：争议——货款 92.40 改 88.00 必须走冲正，不许改原值');
s = S.get(); o = S.orderById(s, oid);
var owed1 = S.customerBalance(s, 'C1');
S.adjustOrderAmount(oid, '-4.40', '客户对账指出西瓜称重偏高，商家退差', 'adjust');
s = S.get(); o = S.orderById(s, oid);
eq(o.goods_real_fen, 9240, '原垫付值 92.40 保持不变');
eq(S.orderReceivable(s, o), 9600, '应收自动重算为 96.00');
eq(S.customerBalance(s, 'C1'), owed1 - 440, '欠款同步降 4.40');
eq(S.verifyLedger(s).length, 0, '冲正后恒等式仍平：' + JSON.stringify(S.verifyLedger(s)));
throws(function () { S.adjustOrderAmount(oid, '-1', '', 'adjust'); }, '无原因调整被拒');

console.log('\n[7] 非法流转守卫');
throws(function () { S.markReady(oid); }, '终态单拒绝回退');
throws(function () { S.markPicked('T2', { real_yuan: '10', receipt: 'x' }); }, '待备货不能直接跳到已取货');
throws(function () { S.finishOrder('T1', { paid_yuan: '1' }); }, '待派单不能直接结单');
throws(function () { S.markDelivered('T3', { photo: 'x' }); }, '未取货不能标送达');

console.log('\n[8] 取消保护：已垫付的单不记追回就不许取消');
throws(function () { S.cancelOrder('T5', '客户电话取消：家里已经有了', {}); }, '未记追回 → 拒绝取消');
throws(function () { S.cancelOrder('T5', '客户电话取消', { recovered_yuan: '20' }); }, '只追回 20/46 → 仍拒绝');
throws(function () { S.cancelOrder('T5', ''); }, '无原因 → 拒绝取消');
S.cancelOrder('T5', '客户电话取消：家里已经有了', { recovered_yuan: '20', mark_loss: true });
var t5 = S.orderById(S.get(), 'T5');
eq(t5.status, 'CANCELLED', '勾选确认损失后允许取消');
var a5 = S.get().advances.filter(function (a) { return a.order_id === 'T5'; })[0];
eq(a5.loss_fen, 2600, '本单垫付损失 26.00 已入账（不进客户欠款，进平台成本）');
eq(S.verifyLedger(S.get()).length, 0, '取消后恒等式仍平');

console.log('\n[9] 多付转预收 + COD 客户零欠款');
S.receivePayment('C2', '100', '张哥预付');
s = S.get();
ok(S.customerBalance(s, 'C2') < 0, '张哥余额为负 = 预收 ' + S.fen2yuan(-S.customerBalance(s, 'C2')));
eq(S.verifyLedger(s).length, 0, '预收不破坏恒等式：' + JSON.stringify(S.verifyLedger(s)));

console.log('\n[10] 月结对账单');
var month = S.currentMonth();
S.buildBill('C1', month);
s = S.get();
var bill = s.bills.filter(function (b) { return b.customer_id === 'C1'; })[0];
ok(!!bill, '王姐 ' + month + ' 对账单已生成');
eq(bill.opening_fen + bill.charged_fen - bill.paid_fen, bill.closing_fen, '期初 + 本期应收 − 本期实收 = 期末');
eq(bill.closing_fen, S.customerBalance(s, 'C1'), '对账单期末 == 台账余额（' + S.fen2yuan(bill.closing_fen) + '）');
S.confirmBill(bill.id);
eq(S.get().bills.filter(function (b) { return b.id === bill.id; })[0].status, 'confirmed', '客户点「我确认无误」→ 留证');
throws(function () { S.buildBill('C1', month); }, '已确认的对账单不允许被覆盖重算');

console.log('\n[11] 随机压力：200 单随机收款/冲正/减免后恒等式必须始终平');
S.reset();
var ids = S.get().customers.map(function (c) { return c.id; });
var seedv = 7;
function rnd() { seedv = (seedv * 1103515245 + 12345) % 2147483648; return seedv / 2147483648; }
for (var i = 0; i < 200; i++) {
  var cid = ids[Math.floor(rnd() * ids.length)];
  var created = S.createOrder({
    source: rnd() > 0.4 ? 'phone' : 'online', customer_id: cid, address_id: null,
    merchant_id: 'M' + (1 + Math.floor(rnd() * 3)), rider_id: 'R' + (1 + Math.floor(rnd() * 2)),
    text: '随机单 ' + i, est_yuan: (10 + Math.floor(rnd() * 90)) + '.00', fee_yuan: '8'
  });
  var id2 = created.order.id;
  S.markReady(id2);
  var real = (10 + Math.floor(rnd() * 90)) + '.' + String(Math.floor(rnd() * 100)).padStart(2, '0');
  S.markPicked(id2, { real_yuan: real, receipt: 'r.jpg' });
  S.startDelivery(id2, 'x');
  S.markDelivered(id2, { photo: 'd.jpg' });
  var recv = S.orderReceivable(S.get(), S.orderById(S.get(), id2));
  var payPart = rnd() < 0.35 ? Math.floor(recv * rnd()) : recv;
  S.finishOrder(id2, { paid_yuan: S.fen2yuan(payPart) });
  if (rnd() < 0.2) S.adjustOrderAmount(id2, '-' + (1 + Math.floor(rnd() * 5)) + '.00', '称重差异退差', 'adjust');
  if (rnd() < 0.3) S.receivePayment(cid, (5 + Math.floor(rnd() * 40)) + '.00', '零散收款');
}
var issues = S.verifyLedger(S.get());
eq(issues.length, 0, '200 单随机操作后恒等式全平');
var totalOwed = ids.reduce(function (sum, c) { return sum + Math.max(0, S.customerBalance(S.get(), c)); }, 0);
console.log('  合计挂账 ' + S.fen2yuan(totalOwed) + ' 元（各客户余额见下）');
ids.forEach(function (c) { console.log('    ' + c + ' = ' + S.fen2yuan(S.customerBalance(S.get(), c))); });

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
