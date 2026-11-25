/**
 * 全站金额只有一个入口：后端传什么都是「分」（整数），界面显示都是「元」。
 * 严禁在任何页面里就地写 /100 或 *100 —— 浮点误差就是这么进账本的。
 */
export function fmtYuan(fen) {
  const n = Number(fen || 0);
  return (n / 100).toFixed(2);
}

export function fmtMoney(fen) {
  return '¥' + fmtYuan(fen);
}

/** 用户输入 → 整数分。空/非法一律当 0，由业务层去判负数。 */
export function parseYuan(text) {
  const n = Number(String(text == null ? '' : String(text)).trim());
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function addFen(...list) {
  return list.reduce((sum, v) => sum + Number(v || 0), 0);
}
