<script setup>
import { computed, onMounted, ref } from 'vue';
import BillPanel from './BillPanel.vue';
import DrawerBox from './DrawerBox.vue';
import { fmtDate, daysAgo, orderTypeLabel, STATUS_NAME, STATUS_COLOR } from '../api/format';
import { fmtMoney as money } from '../api/money';
import { showError } from '../composables/useToast';

const props = defineProps({
  loader: { type: Function, required: true },
  detailLoader: { type: Function, default: null },
  exportName: { type: String, default: '客户账单' },
  emptyTitle: { type: String, default: '这个区间没有已结单' },
  emptyText: { type: String, default: '换个时间范围看看，或先去工作台完成订单。' },
  // Q-16：账单页用 search 模式（搜索框 + 欠款筛选，无时间区间）；骑手端沿用 range 模式
  mode: { type: String, default: 'range' },
});
const emit = defineEmits(['loaded', 'select-order']);

const orders = ref([]);
const billLoading = ref(true);
const detailOn = ref(false);
const detailRow = ref(null);
const detailLed = ref(null);
const detailLoading = ref(false);
const from = ref(firstOfMonth());
const to = ref(todayKey());
// Q-16：账单搜索与客户欠款筛选（按本次加载数据内的欠款判定）
const searchQ = ref('');
const debtFilter = ref('all');
let searchTimer = null;

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayKey() { return ymd(new Date()); }
function firstOfMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

const rangeLabel = computed(() => (from.value === to.value ? from.value : from.value + ' 至 ' + to.value));
const groups = computed(() => {
  const map = new Map();
  for (const o of orders.value) {
    let g = map.get(o.customerId);
    if (!g) {
      g = {
        customerId: o.customerId,
        name: o.customerName || '客户',
        phone: o.customerPhone || '',
        count: 0,
        goodsFen: 0,
        serviceFen: 0,
        receivableFen: 0,
        paidFen: 0,
        owedFen: 0,
        orders: [],
      };
      map.set(o.customerId, g);
    }
    g.count += 1;
    g.goodsFen += o.goodsRealFen != null ? o.goodsRealFen : (o.goodsEstFen || 0);
    g.serviceFen += o.serviceFeeFen || 0;
    g.receivableFen += o.receivableFen || 0;
    g.paidFen += o.paidFen || 0;
    g.owedFen += o.owedFen || 0;
    g.orders.push(o);
  }
  const all = [...map.values()];
  // Q-16：欠款筛选按本次加载数据内的 owedFen 判定
  const filtered = props.mode === 'search' && debtFilter.value !== 'all'
    ? all.filter((g) => (debtFilter.value === 'owed' ? g.owedFen > 0 : g.owedFen <= 0))
    : all;
  return filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
});

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reload, 280);
}
const totals = computed(() => groups.value.reduce((acc, g) => {
  acc.count += g.count;
  acc.goodsFen += g.goodsFen;
  acc.serviceFen += g.serviceFen;
  acc.receivableFen += g.receivableFen;
  acc.paidFen += g.paidFen;
  acc.owedFen += g.owedFen;
  return acc;
}, { count: 0, goodsFen: 0, serviceFen: 0, receivableFen: 0, paidFen: 0, owedFen: 0 }));
const statItems = computed(() => [
  { label: '货款合计', value: money(totals.value.goodsFen), foot: (props.mode === 'search' ? '全部订单' : rangeLabel.value) + ' · ' + totals.value.count + ' 单' },
  { label: '服务费合计', value: money(totals.value.serviceFen) },
  { label: '已收合计', value: money(totals.value.paidFen), color: 'var(--ok)' },
  { label: '未收合计', value: money(totals.value.owedFen), color: 'var(--danger)', tone: 'brand' },
]);
// Q-17：详情列出该客户全部状态订单；管理端用 /ledger/{id}，骑手端用本次加载的客户订单兜底
const detailOrders = computed(() => {
  if (detailLed.value?.orders?.length) return detailLed.value.orders;
  if (detailRow.value) return (detailRow.value.orders || []);
  return [];
});
// 搜索模式不按日期过滤，空态与统计脚注不能再说“这个区间”
const resolvedEmptyTitle = computed(() => props.mode === 'search' ? '没有匹配的账单' : props.emptyTitle);
const resolvedEmptyText = computed(() => props.mode === 'search'
  ? '换个客户名/手机号/单号试试，或先去工作台完成订单。' : props.emptyText);

function validateRange() {
  if (!from.value || !to.value) throw new Error('请选择开始和结束日期');
  if (from.value > to.value) throw new Error('结束日期不能早于开始日期');
  if ((new Date(to.value) - new Date(from.value)) / 86400000 > 366) {
    throw new Error('日期区间最多支持 12 个月');
  }
}

function rowsOf(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.orders)) return result.orders;
  return (result?.customers || []).flatMap((c) => c.orders || []);
}

async function reload() {
  billLoading.value = true;
  try {
    if (props.mode !== 'search') validateRange();
    const query = props.mode === 'search'
      ? { q: searchQ.value.trim() }
      : { from: from.value, to: to.value };
    orders.value = rowsOf(await props.loader(query));
    emit('loaded', orders.value);
    if (detailRow.value) {
      const id = detailRow.value.customerId;
      detailRow.value = groups.value.find((g) => g.customerId === id) || null;
      if (!detailRow.value) detailOn.value = false;
      else if (props.detailLoader) await loadDetail(id);
    }
  } catch (e) {
    showError(e);
  } finally {
    billLoading.value = false;
  }
}

async function loadDetail(customerId) {
  if (!props.detailLoader) return;
  detailLoading.value = true;
  try {
    detailLed.value = await props.detailLoader(customerId);
  } catch (e) {
    showError(e);
  } finally {
    detailLoading.value = false;
  }
}

function openCustomer(row) {
  detailRow.value = row;
  detailOn.value = true;
  detailLed.value = null;
  loadDetail(row.customerId);
}

function selectOrder(o) {
  detailOn.value = false;
  emit('select-order', o);
}

function oldestDays() {
  const charges = detailLed.value?.openCharges || [];
  if (!charges.length) return 0;
  return Math.max(...charges.map((c) => daysAgo(c.occurredAt)));
}

function exportCsv() {
  const lines = [
    ['单号', '订单类型', '结单时间', '客户', '内容', '货款(分)', '服务费(分)', '附加服务费(分)', '应收(分)', '已收(分)', '未收(分)'],
    ...groups.value.flatMap((g) => g.orders.map((o) => [
      o.orderNo, orderTypeLabel(o.serviceType), o.finishedAt, g.name, o.goodsText,
      o.goodsRealFen == null ? o.goodsEstFen : o.goodsRealFen,
      o.serviceFeeFen, o.extraFeeFen, o.receivableFen, o.paidFen, o.owedFen,
    ])),
  ];
  const csv = '\uFEFF' + lines.map((row) => row.map((x) => '"' + String(x == null ? '' : x).replaceAll('"', '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = props.exportName + '-' + from.value + '-' + to.value + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(reload);
defineExpose({ reload });
</script>

<template>
  <BillPanel
    v-model:from="from"
    v-model:to="to"
    :stats="statItems"
    :loading="billLoading"
    :empty="!groups.length"
    :empty-title="resolvedEmptyTitle"
    :empty-text="resolvedEmptyText"
    :hide-range="mode === 'search'"
    :note="mode === 'search' ? '账单以客户归集：按客户名/手机号/单号搜索；欠款筛选以本次加载的数据为准。' : '账单以客户归集：订单金额 = 区间内已结单应收合计，已结款 = 这些订单已收合计，欠款 = 差额。'"
    @change="reload"
  >
    <template v-if="mode === 'search'" #toolbar>
      <div class="p-toolbar bill-search-bar">
        <input v-model="searchQ" type="search" placeholder="搜客户名 / 手机号 / 单号" @input="onSearchInput">
      </div>
      <div class="p-card bill-query-bar">
        <div class="p-filters">
          <button v-for="c in [{v:'all',l:'全部'},{v:'owed',l:'有欠款'},{v:'clear',l:'已结清'}]" :key="c.v"
            class="chip" :class="{ on: debtFilter === c.v }" type="button" @click="debtFilter = c.v">{{ c.l }}</button>
          <button class="btn sm pri" type="button" :disabled="billLoading" @click="reload">查询</button>
        </div>
      </div>
    </template>
    <div class="p-sec-t">客户账单<span class="more">{{ groups.length }} 位客户</span></div>
    <button v-for="g in groups" :key="g.customerId" class="p-order p-cust-card" type="button" @click="openCustomer(g)">
      <div class="p-order-h">
        <span class="p-order-name">{{ g.name }}</span>
        <span class="badge" :class="g.owedFen > 0 ? 'amber' : 'green'">{{ g.owedFen > 0 ? '欠 ' + money(g.owedFen) : '已结清' }}</span>
        <span class="p-right p-small p-muted">›</span>
      </div>
      <div class="p-order-sub">{{ g.phone || '无手机号' }} · {{ g.count }} 单</div>
      <div class="p-grid three">
        <div class="p-cell"><div class="k">订单金额</div><div class="v">{{ money(g.receivableFen) }}</div></div>
        <div class="p-cell"><div class="k">已结款</div><div class="v">{{ money(g.paidFen) }}</div></div>
        <div class="p-cell" :class="{ hot: g.owedFen > 0 }"><div class="k">欠款</div><div class="v">{{ money(g.owedFen) }}</div></div>
      </div>
      <div class="p-order-sub">最近结单 {{ g.orders.length ? fmtDate(g.orders[g.orders.length - 1].finishedAt) : '—' }}</div>
    </button>
    <div class="p-row bill-export"><button class="btn sm" type="button" @click="exportCsv">导出 CSV</button></div>
  </BillPanel>

  <DrawerBox v-if="detailOn" @close="detailOn = false">
    <template #title>{{ detailRow ? detailRow.name : '' }} · 客户账单</template>
    <template #headExtra>
      <span v-if="detailRow" class="badge" :class="detailRow.owedFen > 0 ? 'amber' : 'green'">{{ detailRow.owedFen > 0 ? '欠 ' + money(detailRow.owedFen) : '已结清' }}</span>
    </template>

    <template v-if="detailRow">
      <div class="p-card bill-detail-summary">
        <div class="p-grid three bill-detail-grid">
          <div class="p-cell"><div class="k">账单金额</div><div class="v">{{ money(detailRow.receivableFen) }}</div></div>
          <div class="p-cell"><div class="k">已结款</div><div class="v">{{ money(detailRow.paidFen) }}</div></div>
          <div class="p-cell hot"><div class="k">欠款</div><div class="v">{{ money(detailRow.owedFen) }}</div></div>
        </div>
        <div class="p-small p-muted bill-detail-meta">{{ detailRow.phone || '无手机号' }} · {{ mode === 'search' ? '全部订单' : rangeLabel }} · {{ detailRow.count }} 单</div>
        <div v-if="detailLed?.openCharges?.length" class="p-small bill-detail-meta">全部订单未收 {{ detailLed.openCharges.length }} 笔 · 最老 {{ oldestDays() }} 天</div>
      </div>

      <div class="p-sec-t bill-detail-section">相关订单<span class="more">{{ detailOrders.length }} 单</span></div>
      <button v-for="o in detailOrders" :key="o.id" type="button" class="p-card bill-order bill-order-clickable" @click="selectOrder(o)">
        <div class="p-row">
          <b class="num p-small">{{ o.orderNo }}</b>
          <span class="badge" :class="STATUS_COLOR[o.status] || 'slate'">{{ o.statusLabel || STATUS_NAME[o.status] || o.status }}</span>
          <span class="p-right p-small p-muted">{{ o.finishedAt ? '结单 ' + fmtDate(o.finishedAt) : '下单 ' + fmtDate(o.createTime) }}</span>
        </div>
        <div class="p-small p-muted p-ell bill-order-goods">{{ o.goodsText || '—' }}</div>
        <div class="p-grid three">
          <div class="p-cell"><div class="k">应收</div><div class="v">{{ o.status === 'CANCELLED' ? '¥-' : money(o.receivableFen) }}</div></div>
          <div class="p-cell"><div class="k">已收</div><div class="v">{{ o.status === 'CANCELLED' ? '¥-' : money(o.paidFen) }}</div></div>
          <div class="p-cell" :class="{ hot: o.owedFen > 0 }"><div class="k">未收</div><div class="v">{{ o.status === 'CANCELLED' ? '¥-' : money(o.owedFen) }}</div></div>
        </div>
      </button>
      <div class="p-note bill-detail-note">系统只记录账单和还款，不设额度、不拦新单。</div>
    </template>

    <template v-if="$slots.foot" #foot>
      <slot name="foot" :group="detailRow" :ledger="detailLed" :reload="reload" />
    </template>
  </DrawerBox>
</template>

<style scoped>
.bill-search-bar { margin-bottom: 10px; }
.bill-query-bar { margin-bottom: 12px; padding: 8px 10px; }
.bill-export { margin-top: 12px; justify-content: flex-end; }
.bill-detail-summary { background: var(--cream); border-color: var(--brand); }
.bill-detail-grid { margin-top: 0; }
.bill-detail-meta { margin-top: 6px; }
.bill-detail-section { margin-top: 14px; }
.bill-order { padding: 11px 12px; }
.bill-order-clickable { display: block; width: 100%; text-align: left; cursor: pointer; }
.bill-order-clickable::after { content: '查看订单 ›'; display: block; margin-top: 8px; font-size: 12px; color: var(--brand); }
.bill-order-goods { margin-top: 2px; }
.bill-detail-note { margin-top: 12px; }
</style>
