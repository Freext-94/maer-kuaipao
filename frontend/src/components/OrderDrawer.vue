<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import html2canvas from 'html2canvas';
import DrawerBox from './DrawerBox.vue';
import ModalBox from './ModalBox.vue';
import { api } from '../api';
import { fmtYuan, fmtMoney, parseYuan } from '../api/money';
import { useAuth } from '../composables/useAuth';
import {
  fmtDateTime, STATUS_COLOR, STATUS_NAME, ACTION_NAME, ROLE_LABEL, CANCEL_CODES,
  feeLabel, orderTypeLabel,
} from '../api/format';
import { showError, showToast } from '../composables/useToast';

const props = defineProps({ orderId: { type: Number, required: true } });
const emit = defineEmits(['close', 'changed']);
const auth = useAuth();

const detail = ref(null);
const detailSheet = ref(null);
const riders = ref([]);
const merchants = ref([]);
const loading = ref(true);
const busy = ref(false);
const dlg = reactive({ on: false, kind: '', title: '', okText: '确定' });
const form = reactive({});

const o = computed(() => (detail.value ? detail.value.order : null));

async function load() {
  loading.value = true;
  try {
    detail.value = await api.orderDetail(props.orderId);
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}

function refresh() {
  emit('changed');
  return load();
}

function open(kind, title, okText) {
  Object.keys(form).forEach((k) => delete form[k]);
  dlg.kind = kind;
  dlg.title = title;
  dlg.okText = okText || '确定';
  dlg.on = true;
  if (kind === 'pick') {
    form.realYuan = o.value.goodsRealFen != null ? fmtYuan(o.value.goodsRealFen) : fmtYuan(o.value.goodsEstFen);
    form.merchantAmounts = Object.fromEntries((o.value.merchantGroups || []).map(g => [g.merchantId, '']));
    form.method = 'cash';
    form.shot = null;
  }
  if (kind === 'complete') {
    form.shot = null;
    form.paidYuan = fmtYuan(totalDueOf(o.value));
    form.method = 'wechat';
  }
  if (kind === 'cancel') {
    form.code = '';
    form.text = '';
    form.recoveredYuan = o.value.advanceFen ? fmtYuan(o.value.advanceFen) : '';
    form.markLoss = false;
  }
  if (kind === 'adjust') {
    form.dir = 'merchant_refund';
    form.amountYuan = '';
    form.reason = '';
  }
  if (kind === 'dispatch') form.riderId = '';
  if (kind === 'edit') {
    form.eMerchantId = String(o.value.merchantId || '');
    form.eGoods = o.value.goodsText || '';
    form.eEstYuan = fmtYuan(o.value.goodsEstFen);
    form.eFeeYuan = fmtYuan(o.value.serviceFeeFen);
    form.eNote = o.value.note || '';
    form.eAddress = o.value.address ? o.value.address.address : '';
    form.eRiderId = o.value.riderId ? String(o.value.riderId) : '';
    form.eReason = '';
    form.eSourceChannel = o.value.sourceChannel || '';
    form.eSourceChannelNote = o.value.sourceChannelNote || '';
  }
}

const goodsLocked = computed(() => !!o.value && o.value.goodsRealFen != null);

async function shoot(ev, key) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const a = await api.uploadForAdmin(file, key, o.value.id);
    form.shot = a;
    showToast('照片已上传', 'ok');
  } catch (e) {
    showError(e);
  }
}

const finishPreview = computed(() => {
  if (!o.value || dlg.kind !== 'complete') return null;
  const recv = o.value.receivableFen;
  const paid = Math.max(0, Math.min(parseYuan(form.paidYuan), recv));
  const after = Math.max(0, o.value.customerOwedFen) + recv - paid;
  return { recv, paid, open: recv - paid, after };
});

/** 选「欠款」时实收锁 0；选其它方式默认收全额，可改小 */
function onFinishMethod() {
  form.paidYuan = form.method === 'credit' ? '0' : fmtYuan(totalDueOf(o.value));
}

function totalDueOf(order) {
  if (!order) return 0;
  return Math.max(0, order.customerOwedFen || 0) + Math.max(0, order.receivableFen || 0);
}

async function confirmDlg() {
  if (busy.value) return;
  busy.value = true;
  try {
    if (dlg.kind === 'dispatch') {
      if (!form.riderId) throw new Error('选一个骑手');
      await api.dispatch(o.value.id, Number(form.riderId));
    } else if (dlg.kind === 'pick') {
      const real = parseYuan(form.realYuan);
      if (real < 0) throw new Error('实际货款不能是负数');
      const merchantAmounts = {};
      let merchantTotal = 0;
      for (const group of (o.value.merchantGroups || [])) {
        merchantAmounts[group.merchantId] = (o.value.merchantGroups || []).length === 1
          ? real : parseYuan(form.merchantAmounts[group.merchantId]);
        merchantTotal += merchantAmounts[group.merchantId];
      }
      if ((o.value.merchantGroups || []).length > 1 && merchantTotal !== real) throw new Error('各商家实际货款合计必须等于实际货款');
      await api.pick(o.value.id, {
        goodsRealFen: real,
        merchantAmounts,
        receiptAttachmentId: form.shot ? form.shot.id : null,
        method: form.method,
      });
    } else if (dlg.kind === 'complete') {
      const paid = parseYuan(form.paidYuan);
      if (form.method === 'credit' && paid > 0) throw new Error('选了「欠款」就不能填实收');
      if (form.method !== 'credit' && paid <= 0) throw new Error('实收是 0，请把方式改成「欠款」');
      await api.complete(o.value.id, {
        attachmentId: form.shot ? form.shot.id : null,
        paidFen: paid,
        method: form.method,
      });
    } else if (dlg.kind === 'cancel') {
      await api.cancel(o.value.id, {
        code: form.code,
        text: form.text,
        recoveredFen: form.recoveredYuan === '' ? 0 : parseYuan(form.recoveredYuan),
        markLoss: !!form.markLoss,
      });
    } else if (dlg.kind === 'adjust') {
      const amt = parseYuan(form.amountYuan);
      if (amt <= 0) throw new Error('金额填实际数目，方向用上面的按钮选');
      if (!form.reason.trim()) throw new Error('写一句原因，月底对不上时靠它');
      await api.adjust(o.value.id, {
        deltaFen: amt,
        direction: form.dir,
        reason: form.reason.trim(),
        type: form.dir === 'waive' ? 'WAIVE' : 'ADJUST',
      });
    } else if (dlg.kind === 'edit') {
      if (form.eSourceChannel === 'other' && !String(form.eSourceChannelNote || '').trim()) throw new Error('请填写其他联系渠道');
      const patch = { reason: form.eReason };
      if (!goodsLocked.value) {
        patch.goodsText = form.eGoods;
        patch.goodsEstFen = parseYuan(form.eEstYuan);
      }
      patch.serviceFeeFen = parseYuan(form.eFeeYuan);
      patch.note = form.eNote;
      patch.address = form.eAddress;
      patch.sourceChannel = form.eSourceChannel;
      patch.sourceChannelNote = form.eSourceChannelNote;
      if (form.eRiderId && Number(form.eRiderId) !== o.value.riderId) {
        patch.riderId = Number(form.eRiderId);
      }
      if (form.eMerchantId && Number(form.eMerchantId) !== o.value.merchantId) {
        patch.merchantId = Number(form.eMerchantId);
      }
    await api.editOrder(o.value.id, patch);
  }
    dlg.on = false;
    showToast('已更新', 'ok');
    await refresh();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function quick(fn) {
  try {
    await fn();
    showToast('已更新', 'ok');
    await refresh();
  } catch (e) {
    showError(e);
  }
}

function attachLabel(a) {
  const type = { receipt: '小票', delivered: '送达', voucher: '凭证', order: '附件' }[a.bizType] || '附件';
  return (a.contentType || '').startsWith('audio/') ? type + '·语音' : type;
}

function badgeOf(code) {
  return STATUS_COLOR[code] || 'slate';
}

/** 是否正在生成图片（离屏渲染 + 截图期间显示反馈） */
const capturing = ref(false);

/**
 * 生成订单图片：克隆订单详情的只读 DOM 到一个不限高、不裁剪的离屏节点，
 * 用 html2canvas 按完整内容高度截图。图片即页面 UI 本身，且支持任意长图。
 */
async function generateBillImage() {
  if (!o.value || capturing.value) return;
  capturing.value = true;
  let stage = null;
  try {
    await nextTick();
    const source = detailSheet.value;
    if (!source) throw new Error('详情内容还没准备好');

    // 离屏舞台：固定宽度对齐抽屉（430），白底，绝对定位到视口外，
    // 关键是不设 overflow / max-height，让内容自然撑开以支持长图。
    stage = document.createElement('div');
    stage.className = 'm-app order-capture-stage';
    stage.style.cssText = [
      'position:fixed', 'left:-100000px', 'top:0', 'width:430px',
      'padding:14px 16px', 'background:#fff', 'box-sizing:border-box',
      'font-family:inherit', 'line-height:1.5',
    ].join(';');

    // 标题行（与抽屉头部一致，去掉「关闭」等操作按钮）
    const head = document.createElement('div');
    head.className = 'order-capture-head';
    head.style.cssText = 'display:flex;align-items:center;gap:8px;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid var(--line)';
    const h2 = document.createElement('div');
    h2.style.cssText = 'font-size:16px;font-weight:750;color:var(--ink);flex:1;min-width:0';
    h2.textContent = orderTypeLabel(o.value.serviceType) + ' · ' + o.value.orderNo;
    head.appendChild(h2);
    const st = document.createElement('span');
    st.className = 'badge ' + (STATUS_COLOR[o.value.status] || 'slate');
    st.textContent = o.value.statusLabel || '';
    head.appendChild(st);
    stage.appendChild(head);

    // 克隆详情只读内容，移除其中的操作按钮（.row 里都是改单/派单等按钮）
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.order-action-row').forEach((el) => el.remove());
    stage.appendChild(clone);
    document.body.appendChild(stage);

    // 等浏览器完成布局与样式（含 badge 等 .m-app 作用域样式）
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const fullHeight = Math.ceil(stage.scrollHeight);
    const fullWidth = Math.ceil(stage.scrollWidth);
    const canvas = await html2canvas(stage, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      // 长图关键：让 html2canvas 的渲染窗口覆盖整段内容，而不是只截视口
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      width: fullWidth,
      height: fullHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = (o.value.orderNo || '订单') + '-订单.png';
    a.click();
    showToast('订单图片已生成', 'ok');
  } catch (e) {
    showError(e);
  } finally {
    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    capturing.value = false;
  }
}

onMounted(async () => {
  await load();
  try {
    riders.value = await api.riders();
    merchants.value = await api.merchants();
  } catch (e) { /* 下拉数据拉不到只影响派单/改单，不进主流程 */ }
});
</script>

<template>
  <DrawerBox @close="emit('close')">
    <template #title>
      <template v-if="o">{{ orderTypeLabel(o.serviceType) }} · {{ o.orderNo }} <span class="badge" :class="badgeOf(o.status)">{{ o.statusLabel }}</span></template>
      <template v-else>加载中…</template>
    </template>
    <template #headExtra>
      <span v-if="o" class="badge slate">{{ o.source === 'phone' ? '电话录单' : '客户自助' }}</span>
      <span v-if="o && o.sourceChannel" class="badge ghost">{{ ({customer_call:'客户来电',customer_wechat:'客户微信',merchant_call:'商家来电',merchant_wechat:'商家微信',other:'其他'})[o.sourceChannel] || o.sourceChannel }}{{ o.sourceChannelNote ? '：' + o.sourceChannelNote : '' }}</span>
    </template>

    <div v-if="loading" class="muted center" style="padding:40px 0">正在读取订单…</div>

    <div v-else-if="o" ref="detailSheet">
      <div class="grid2" style="margin-bottom:14px">
        <div>
          <div class="muted small">客户</div>
          <b>{{ o.customerName }}</b> <span class="muted small">{{ o.customerPhone }}</span>
          <div class="small">
            已欠
            <b class="num" :style="{ color: o.customerOwedFen > 0 ? 'var(--danger)' : 'inherit' }">
              {{ fmtMoney(Math.max(0, o.customerOwedFen)) }}
            </b>
          </div>
        </div>
        <div>
          <div class="muted small">商家 / 骑手</div>
          {{ o.merchantName }} <span class="muted small">{{ o.merchantPhone }}</span>
          <div class="muted small">{{ o.riderName || '未指派' }}</div>
        </div>
        <div v-if="o.note" style="grid-column:1/-1">
          <div class="muted small">客户交代</div>
          <span v-if="o.note">{{ o.note }}</span>
        </div>
        <div style="grid-column:1/-1">
          <div class="muted small">送到</div>
          {{ o.address.address }}
        </div>
      </div>

      <div class="panel">
        <div class="bd">
          <div class="row">
            <div><div class="muted small">代买内容</div>{{ o.goodsText }}</div>
            <div class="right right-t"><div class="muted small">应收</div><div class="big-amt" style="font-size:22px">{{ fmtMoney(o.receivableFen) }}</div></div>
          </div>
          <div class="hr"></div>
          <dl class="kv">
            <dt>货款</dt>
            <dd class="num">
              估 {{ fmtMoney(o.goodsEstFen) }}
              <template v-if="o.goodsRealFen != null">→ 实付 <b>{{ fmtMoney(o.goodsRealFen) }}</b> 🔒</template>
              <span v-else class="muted small">（还没取货，未录实付）</span>
            </dd>
            <dt>{{ feeLabel(o.serviceType) }}</dt><dd class="num">{{ fmtMoney(o.serviceFeeFen) }}</dd>
            <dt>已核销</dt><dd class="num">{{ fmtMoney(o.paidFen) }}</dd>
            <dt>本单未收</dt>
            <dd class="num" :class="{ strong: o.owedFen > 0 }" :style="{ color: o.owedFen > 0 ? 'var(--danger)' : 'var(--ok)' }">{{ fmtMoney(o.owedFen) }}</dd>
            <template v-if="o.advanceFen">
              <dt>平台垫付</dt>
              <dd class="num">{{ fmtMoney(o.advanceFen) }}
                <span class="muted small">（{{ o.advanceStatus === 'settled' ? '已结清' : o.advanceStatus === 'loss' ? '部分损失' : '未回' }}）</span>
              </dd>
            </template>
            <template v-if="o.cancelText || o.cancelCode">
              <dt>取消原因</dt><dd>{{ o.cancelCode }}{{ o.cancelText ? '｜' + o.cancelText : '' }}</dd>
            </template>
          </dl>
          <div v-if="o.attachments && o.attachments.length" style="margin-top:10px">
            <div class="muted small">凭证</div>
            <div class="thumbs">
              <a v-for="a in o.attachments" :key="a.id" :href="a.url" target="_blank" rel="noreferrer">
                <img v-if="(a.contentType || '').startsWith('image/')" :src="a.url" :alt="a.fileName">
                <div v-else class="audio-thumb">语音</div>
                <span class="small">{{ attachLabel(a) }}</span>
              </a>
            </div>
          </div>
          <div v-else class="shot-hint">还没有任何凭证照片。取货时的小票是唯一能证明「垫付了多少」的东西。</div>
        </div>
      </div>

      <div class="row order-action-row" style="margin:14px 0 8px;flex-wrap:wrap;gap:6px">
        <button v-if="auth.can('order.edit') && !['FINISHED','CANCELLED'].includes(o.status)" class="btn edit-btn sm" @click="open('edit','改单','保存修改')">✎ 改单</button>
        <button v-if="auth.can('order.dispatch') && o.status === 'PENDING'" class="btn pri sm" @click="open('dispatch','指派骑手','派单')">指派骑手</button>
        <button v-if="auth.can('order.flow') && o.status === 'PICKING'" class="btn pri sm" @click="open('pick','取货登记','确认已取货')">取到货</button>
        <button v-if="auth.can('order.flow') && o.status === 'DELIVERING'" class="btn pri sm" @click="open('complete','确认送达','确认送达并收款')">确认送达</button>
        <button v-if="auth.can('money.adjust') && o.goodsRealFen != null && o.status !== 'CANCELLED'" class="btn sm" @click="open('adjust','货款不对？','记这一笔')">货款不对？</button>
        <button v-if="auth.can('order.cancel') && !['FINISHED','CANCELLED'].includes(o.status)" class="btn dgr sm" @click="open('cancel','取消订单','确认取消')">取消订单</button>
      </div>

      <h3 style="margin:16px 0 8px">状态与操作轨迹</h3>
      <ul class="tl">
        <li v-for="(l, i) in detail.logs" :key="i" :class="{ bad: l.toStatus === 'CANCELLED', warn: (l.reason || '').includes('缺货') }">
          <div>
            <b>{{ ACTION_NAME[l.action] || (l.fromStatus ? (STATUS_NAME[l.fromStatus] || l.fromStatus) + (l.fromStatus !== l.toStatus ? ' → ' + (STATUS_NAME[l.toStatus] || l.toStatus) : '') : '新建') }}</b>
            <span class="w">{{ fmtDateTime(l.occurredAt) }}</span>
          </div>
          <div class="w">{{ l.actorName }}<template v-if="l.actorRole">（{{ ROLE_LABEL[l.actorRole] || l.actorRole }}）</template><template v-if="l.reason"> · {{ l.reason }}</template></div>
        </li>
      </ul>
      <h3 v-if="detail.editLogs && detail.editLogs.length" style="margin:16px 0 8px">改单记录</h3>
      <ul v-if="detail.editLogs && detail.editLogs.length" class="tl">
        <li v-for="l in detail.editLogs" :key="l.id">
          <div><b>{{ l.field }}</b><span class="w">{{ fmtDateTime(l.createTime) }}</span></div>
          <div class="w">{{ l.oldValue || '（空）' }} → {{ l.newValue || '（空）' }}<template v-if="l.reason"> · {{ l.reason }}</template></div>
          <div class="w">{{ l.actor }}</div>
        </li>
      </ul>
    </div>

    <template #foot>
      <span class="small muted">单号 {{ o ? o.orderNo : '' }}</span>
      <span class="grow"></span>
      <button v-if="o" class="btn sm" @click="generateBillImage">生成订单图片</button>
      <button class="btn sm" @click="load">刷新</button>
    </template>
  </DrawerBox>

  <ModalBox
    v-if="dlg.on"
    :title="dlg.title"
    :ok-text="dlg.okText"
    :busy="busy"
    @ok="confirmDlg"
    @cancel="dlg.on = false"
  >
    <template v-if="dlg.kind === 'dispatch'">
      <div class="field">
        <label class="fl">骑手</label>
        <select v-model="form.riderId">
          <option value="">请选择…</option>
          <option v-for="r in riders" :key="r.userId" :value="String(r.userId)">{{ r.name }}</option>
        </select>
      </div>
      <div class="note">派单后订单进入「取货中」，骑手到店取货后进入「派送中」。</div>
    </template>

    <template v-else-if="dlg.kind === 'pick'">
      <div class="note" style="margin-bottom:12px">
        这一步记的是<b>你替客户垫给商家的钱</b>。0 元也能提交（商家送、客户已付、代取不花钱）。
        填错不能直接改，要走「货款不对？」记一笔，原值永久保留。
      </div>
      <div class="grid2">
        <div class="field">
          <label class="fl">实际货款（元），估价 {{ o ? fmtYuan(o.goodsEstFen) : '' }}</label>
          <input v-model="form.realYuan" inputmode="decimal">
        </div>
        <div v-if="o.merchantGroups && o.merchantGroups.length > 1" class="stack" style="margin-top:12px">
          <label v-for="g in o.merchantGroups" :key="g.merchantId" class="field">
            <span class="fl">{{ g.merchantName }}实际货款（元）</span>
            <input v-model="form.merchantAmounts[g.merchantId]" inputmode="decimal">
          </label>
        </div>
        <div class="field">
          <label class="fl">怎么付给商家的</label>
          <select v-model="form.method">
            <option value="cash">现金</option>
            <option value="transfer">扫码转账</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="fl">小票照片（选填）</label>
        <input type="file" accept="image/*,.webp" @change="shoot($event, 'receipt')">
        <div v-if="form.shot" class="small" style="color:var(--ok)">已上传 {{ form.shot.fileName }}</div>
        <div v-else class="hint">拍不了就跳过，先把单子走完；事后在订单详情里还能补。</div>
      </div>
    </template>

    <template v-else-if="dlg.kind === 'delivering'">
      <p class="muted">确认后骑手端和客户端都会显示「配送中」。</p>
    </template>

    <template v-else-if="dlg.kind === 'complete'">
      <dl class="kv" style="margin-bottom:10px">
        <dt>货款</dt><dd class="num">{{ o ? fmtMoney(o.goodsRealFen != null ? o.goodsRealFen : o.goodsEstFen) : '' }}</dd>
        <dt>{{ o ? feeLabel(o.serviceType) : '服务费' }}</dt><dd class="num">{{ o ? fmtMoney(o.serviceFeeFen) : '' }}</dd>
        <dt>本单应收</dt><dd class="num strong">{{ o ? fmtMoney(o.receivableFen) : '' }}</dd>
        <dt>历史欠款</dt><dd class="num">{{ o ? fmtMoney(Math.max(0, o.customerOwedFen || 0)) : '' }}</dd>
        <dt>合计应收</dt><dd class="num strong">{{ o ? fmtMoney(totalDueOf(o)) : '' }}</dd>
      </dl>
      <div class="field" style="margin-bottom:10px">
        <label class="fl">送达照片（选填）</label>
        <input type="file" accept="image/*" @change="shoot($event, 'delivered')">
        <div v-if="form.shot" class="small" style="color:var(--ok)">已上传 {{ form.shot.fileName }}</div>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="fl">收款方式</label>
          <select v-model="form.method" @change="onFinishMethod">
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
            <option value="cash">现金</option>
            <option value="credit">欠款（这次不收钱）</option>
          </select>
        </div>
        <div class="field">
          <label class="fl">当场实收（元）</label>
          <input v-model="form.paidYuan" inputmode="decimal" :disabled="form.method === 'credit'">
        </div>
      </div>
      <div v-if="finishPreview" class="alert" :class="finishPreview.open > 0 ? 'warn' : 'info'">
        <template v-if="finishPreview.open > 0">
          本单还差 <b>{{ fmtMoney(finishPreview.open) }}</b>，完成后记到 {{ o.customerName }} 账上，共欠
          <b>{{ fmtMoney(finishPreview.after) }}</b>。
        </template>
        <template v-else>当场收清，{{ o.customerName }} 不新增欠款。</template>
      </div>
    </template>

    <template v-else-if="dlg.kind === 'cancel'">
      <div v-if="o && o.advanceFen" class="alert err" style="margin-bottom:12px">
        本单已垫付 <b>{{ fmtMoney(o.advanceFen) }}</b>。必须先记「已向商家追回」或勾选「确认损失」，否则不允许取消——这个口子漏一次就是真金白银。
      </div>
      <div class="field">
        <label class="fl">取消原因（必填，月底复盘看是哪一环出问题）</label>
        <select v-model="form.code">
          <option value="">请选择…</option>
          <option v-for="c in CANCEL_CODES" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field"><label class="fl">补充说明</label><input v-model="form.text" placeholder="选填"></div>
      <template v-if="o && o.advanceFen">
        <div class="grid2">
          <div class="field">
            <label class="fl">已追回（元）</label>
            <input v-model="form.recoveredYuan" inputmode="decimal">
          </div>
          <div class="field">
            <label class="fl">未追回的部分</label>
            <label class="small"><input type="checkbox" v-model="form.markLoss"> 确认为平台损失（计入成本，不算客户欠款）</label>
          </div>
        </div>
      </template>
    </template>

    <template v-else-if="dlg.kind === 'adjust'">
      <div class="note" style="margin-bottom:12px">
        小票上记的 <b>{{ o ? fmtMoney(o.goodsRealFen) : '' }}</b> 不会改。先选是哪种情况，金额只填数字，不用管正负。
      </div>
      <div class="field">
        <label class="fl">是哪种情况？</label>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: form.dir === 'merchant_refund' }" @click="form.dir = 'merchant_refund'">商家退我钱</button>
          <button type="button" class="chip" :class="{ on: form.dir === 'pay_merchant' }" @click="form.dir = 'pay_merchant'">我补给商家</button>
          <button type="button" class="chip" :class="{ on: form.dir === 'waive' }" @click="form.dir = 'waive'">给客户免掉</button>
        </div>
        <div class="hint">
          <template v-if="form.dir === 'merchant_refund'">商家少收了、退了差价 → 客户的应收跟着减少</template>
          <template v-else-if="form.dir === 'pay_merchant'">你多付给商家了、要补回来 → 客户的应收跟着增加</template>
          <template v-else>这笔钱老板自己让掉，不再找客户要</template>
        </div>
      </div>
      <div class="field">
        <label class="fl">多少钱（元，填正数）</label>
        <input v-model="form.amountYuan" inputmode="decimal" placeholder="4.40">
      </div>
      <div class="field">
        <label class="fl">怎么回事（必填）</label>
        <input v-model="form.reason" placeholder="例：西瓜称重比小票多了 4 块 4，商家退给我了">
      </div>
    </template>

    <template v-else-if="dlg.kind === 'edit'">
      <div class="field">
        <label class="fl">配送骑手（可改派）</label>
        <select v-model="form.eRiderId">
          <option value="">暂不指派</option>
          <option v-for="r in riders" :key="r.userId" :value="String(r.userId)">{{ r.name }}</option>
        </select>
      </div>
      <div class="field">
        <label class="fl">联系渠道（选填）</label>
        <select v-model="form.eSourceChannel">
          <option value="">未记录</option><option value="customer_call">客户来电</option><option value="customer_wechat">客户微信</option>
          <option value="merchant_call">商家来电</option><option value="merchant_wechat">商家微信</option><option value="other">其他</option>
        </select>
        <input v-if="form.eSourceChannel === 'other'" v-model="form.eSourceChannelNote" maxlength="128" placeholder="请填写其他渠道" style="margin-top:6px">
      </div>
      <div v-if="goodsLocked" class="alert warn" style="margin-bottom:10px">
        已取货，货款和买什么锁定了；要改钱请走「货款不对？」，这里只能改地址、费用、时间和备注。
      </div>
      <div class="field">
        <label class="fl">商家（客户填的不存在时，这里改成正确的）</label>
        <select v-model="form.eMerchantId" :disabled="goodsLocked">
          <option value="">请选择…</option>
          <option v-for="m in merchants" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
        </select>
      </div>
      <div class="field">
        <label class="fl">买什么</label>
        <textarea v-model="form.eGoods" rows="2" :disabled="goodsLocked"></textarea>
      </div>
      <div class="grid2">
        <div class="field">
          <label class="fl">货款估价（元）</label>
          <input v-model="form.eEstYuan" inputmode="decimal" :disabled="goodsLocked">
        </div>
        <div class="field">
          <label class="fl">{{ o ? feeLabel(o.serviceType) : '服务费' }}（元）</label>
          <input v-model="form.eFeeYuan" inputmode="decimal">
        </div>
        <div class="field">
          <label class="fl">收货地址</label>
          <input v-model="form.eAddress" placeholder="一行填完：小区、门牌、楼层">
        </div>
        <div class="field">
          <label class="fl">备注</label>
          <input v-model="form.eNote">
        </div>
      </div>
      <div class="field">
        <label class="fl">为什么改（必填，留个说法）</label>
        <input v-model="form.eReason" placeholder="例：客户来电把地址改到 2 栋 801">
      </div>
    </template>

  </ModalBox>
</template>
