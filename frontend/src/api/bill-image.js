import { fmtYuan } from './money';

/**
 * 账单 PNG：Canvas 2D 直接出图（逻辑宽 750，实际 1500px）。
 * 不生成 PDF、不调用 window.print()，手机上点一下就是一张可转发的图片。
 */
const W = 750;
const FONT = '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
const INK = '#0D0E11';
const MUTED = '#8A8A90';
const LINE = '#E8E2D6';
const BRAND = '#F5B301';

function yuan(v) {
  return fmtYuan(v);
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function newCanvas(height) {
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = Math.max(300, Math.round(height)) * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, canvas.height / 2);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

function download(canvas, name) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = name;
  a.click();
}

function font(ctx, size, bold) {
  ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
}

function wrap(ctx, text, maxWidth, maxLines) {
  const s = String(text == null ? '' : text);
  const lines = [];
  let line = '';
  for (const ch of s) {
    if (line && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (maxLines && lines.length >= maxLines) break;
    } else {
      line += ch;
    }
  }
  if (line && (!maxLines || lines.length < maxLines)) lines.push(line);
  return lines;
}

async function brandHeader(ctx, rightTitle, rightSub) {
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, W, 8);

  const logo = await loadImage('/brand/logo-card-256.png');
  if (logo) ctx.drawImage(logo, 24, 26, 54, 54);

  ctx.fillStyle = INK;
  font(ctx, 22, true);
  ctx.fillText('马儿快跑', 92, 52);
  ctx.fillStyle = MUTED;
  font(ctx, 12, false);
  ctx.fillText('马儿跑得快，诚信赢天下', 92, 72);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  font(ctx, 14, true);
  ctx.fillText(rightTitle || '', W - 24, 48);
  ctx.fillStyle = MUTED;
  font(ctx, 12, false);
  ctx.fillText(rightSub || '', W - 24, 68);
  ctx.textAlign = 'left';
}

function divider(ctx, y) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(W - 24, y);
  ctx.stroke();
  return y + 18;
}

async function watermark(ctx, height) {
  const wm = await loadImage('/brand/logo-watermark.png');
  if (!wm) return;
  ctx.save();
  ctx.globalAlpha = 0.12;
  const wmW = 320;
  const wmH = wmW * (wm.height / wm.width);
  ctx.drawImage(wm, (W - wmW) / 2, (height - wmH) / 2, wmW, wmH);
  ctx.restore();
}

function footer(ctx, height) {
  ctx.fillStyle = MUTED;
  font(ctx, 11, false);
  ctx.textAlign = 'center';
  ctx.fillText('马儿跑得快，诚信赢天下　·　生成于 ' + new Date().toLocaleString('zh-CN'), W / 2, height - 24);
  ctx.textAlign = 'left';
}

/** 期间账单：顶部合计 + 订单明细 */
export async function downloadPeriodBill({ from, to, totals, orders }) {
  const list = (orders || []).slice(0, 80);
  const H = 470 + list.length * 30 + (orders && orders.length > list.length ? 26 : 0);
  const { canvas, ctx } = newCanvas(H);
  await brandHeader(ctx, '账单', (from || '') + ' 至 ' + (to || ''));
  let y = divider(ctx, 96);

  // 合计卡片
  ctx.fillStyle = '#FDFBF6';
  ctx.fillRect(24, y, W - 48, 86);
  const cells = [
    ['订单数', (totals.orderCount || 0) + ' 单'],
    ['应收', '¥' + yuan(totals.receivableFen)],
    ['已收', '¥' + yuan(totals.paidFen)],
    ['未收', '¥' + yuan(totals.owedFen)],
  ];
  cells.forEach((c, i) => {
    const x = 40 + (i % 2) * 340;
    const yy = y + 28 + Math.floor(i / 2) * 38;
    ctx.fillStyle = MUTED;
    font(ctx, 11, false);
    ctx.fillText(c[0], x, yy);
    ctx.fillStyle = i === 3 ? '#A32222' : INK;
    font(ctx, 15, true);
    ctx.textAlign = 'left';
    ctx.fillText(c[1], x + 70, yy);
  });
  y += 108;

  // 表头
  const cols = [24, 190, 300, 430, 530, 640];
  const heads = ['单号', '客户', '结单日', '应收', '已收', '未收'];
  ctx.fillStyle = MUTED;
  font(ctx, 11, true);
  heads.forEach((h, i) => {
    if (i >= 3) {
      ctx.textAlign = 'right';
      ctx.fillText(h, cols[i] + 60, y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(h, cols[i], y);
    }
  });
  ctx.textAlign = 'left';
  y += 8;
  y = divider(ctx, y);

  list.forEach((o) => {
    ctx.fillStyle = INK;
    font(ctx, 11.5, false);
    ctx.fillText(String(o.orderNo || '').slice(-10), cols[0], y);
    ctx.fillText(String(o.customerName || '').slice(0, 8), cols[1], y);
    ctx.fillStyle = MUTED;
    ctx.fillText(String(o.finishedAt || o.createTime || '').slice(5, 10), cols[2], y);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(yuan(o.receivableFen), cols[3] + 60, y);
    ctx.fillText(yuan(o.paidFen), cols[4] + 60, y);
    ctx.fillStyle = Number(o.owedFen || 0) > 0 ? '#A32222' : MUTED;
    ctx.fillText(yuan(o.owedFen), cols[5] + 60, y);
    ctx.textAlign = 'left';
    y += 30;
  });

  if (orders && orders.length > list.length) {
    ctx.fillStyle = MUTED;
    font(ctx, 11, false);
    ctx.fillText('其余 ' + (orders.length - list.length) + ' 单未在图片中列出，请到账单页查看。', 24, y);
    y += 26;
  }

  await watermark(ctx, H);
  footer(ctx, H);
  download(canvas, '账单-' + (from || '') + '-' + (to || '') + '.png');
}

/** 客户账单详情：支持整月或自定义区间，移动端卡片样式 + 正中间水印。 */
export async function downloadCustomerBill({ month, from, to, customerName, totals, entries }) {
  const list = entries || [];
  const H = 470 + list.length * 40;
  const { canvas, ctx } = newCanvas(H);
  const period = month
    ? String(month).replace('-', '年') + '月账单'
    : (from || '') + ' 至 ' + (to || '');
  await brandHeader(ctx, customerName || '客户', period);
  let y = divider(ctx, 96);

  const cells = [
    ['挂账', '¥' + yuan(totals.chargeFen)],
    ['已还', '¥' + yuan(totals.paidFen)],
    ['冲正/减免', '¥' + yuan(totals.adjustFen)],
    [month ? '当月净增' : '区间净增', '¥' + yuan(totals.netFen)],
  ];
  ctx.fillStyle = '#FDFBF6';
  ctx.fillRect(24, y, W - 48, 88);
  cells.forEach((c, i) => {
    const x = 40 + (i % 2) * 340;
    const yy = y + 30 + Math.floor(i / 2) * 40;
    ctx.fillStyle = MUTED;
    font(ctx, 11, false);
    ctx.fillText(c[0], x, yy);
    ctx.fillStyle = i === 3 && Number(totals.netFen || 0) > 0 ? '#A32222' : INK;
    font(ctx, 15, true);
    ctx.fillText(c[1], x + 84, yy);
  });
  y += 112;

  ctx.fillStyle = MUTED;
  font(ctx, 12, true);
  ctx.fillText('流水明细（' + list.length + ' 笔）', 24, y);
  y += 10;
  y = divider(ctx, y);

  list.forEach((e) => {
    ctx.fillStyle = INK;
    font(ctx, 12.5, false);
    const label = { CHARGE: '挂账', PAYMENT: '收款', ADJUST: '冲正', WAIVE: '减免', REFUND: '退款' }[e.type] || e.type;
    ctx.fillText(label + (e.orderNo ? '  ' + e.orderNo : ''), 24, y);
    ctx.fillStyle = MUTED;
    font(ctx, 10.5, false);
    const date = String(e.occurredAt || '').replace('T', ' ').slice(5, 16);
    ctx.fillText(date + (e.note ? '  ' + e.note : ''), 24, y + 16);
    ctx.fillStyle = Number(e.amountFen || 0) > 0 ? '#A32222' : '#1F6B3B';
    font(ctx, 13, true);
    ctx.textAlign = 'right';
    ctx.fillText('¥' + yuan(e.amountFen), W - 24, y + 6);
    ctx.textAlign = 'left';
    y += 40;
  });

  await watermark(ctx, H);
  footer(ctx, H);
  const filePeriod = month || (from || '') + '_' + (to || '');
  download(canvas, (customerName || '客户') + '-' + filePeriod + '-账单.png');
}
