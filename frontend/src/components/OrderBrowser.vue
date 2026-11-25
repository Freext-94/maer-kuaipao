<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DateRangeFilter from './DateRangeFilter.vue';
import OrderCard from './OrderCard.vue';
import StatCards from './StatCards.vue';
import Pager from './Pager.vue';
import EmptyState from './EmptyState.vue';
import { fmtMoney } from '../api/money';
import { STATUS_NAME } from '../api/format';
import { showError } from '../composables/useToast';

const props = defineProps({
  loader: { type: Function, required: true },
  statuses: { type: Array, default: () => [] },
  pageSize: { type: Number, default: 10 },
  defaultRange: { type: String, default: 'last30' },
  heading: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜单号 / 客户 / 手机号 / 内容' },
  emptyTitle: { type: String, default: '没有符合条件的订单' },
  emptyText: { type: String, default: '换个关键词、状态或日期再试。' },
  showCustomer: { type: Boolean, default: true },
  showPayment: { type: Boolean, default: true },
  showStats: { type: Boolean, default: true },
  customerView: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
});
const emit = defineEmits(['select', 'loaded']);

// Q-13：快捷选项改为 今天 / 近 7 天 / 近 30 天；日期可不选（空则加载全部）
const presets = [
  { value: 'clear', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'last7', label: '近 7 天' },
  { value: 'last30', label: '近 30 天' },
];
const initial = presetRange(props.defaultRange);
const orders = ref([]);
const loading = ref(true);
const q = ref('');
const status = ref('');
const from = ref(initial[0]);
const to = ref(initial[1]);
const page = ref(1);

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function presetRange(kind) {
  const today = new Date();
  if (kind === 'clear') return ['', ''];
  if (kind === 'today') return [ymd(today), ymd(today)];
  if (kind === 'last7' || kind === 'last30') {
    const first = new Date(today);
    first.setDate(first.getDate() - (kind === 'last7' ? 6 : 29));
    return [ymd(first), ymd(today)];
  }
  return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(today)];
}

function validateRange() {
  // Q-13：日期区间非必选；都为空表示查全部，只填一边按单边边界处理
  if (from.value && to.value && from.value > to.value) throw new Error('结束日期不能早于开始日期');
  if (from.value && to.value && (new Date(to.value) - new Date(from.value)) / 86400000 > 366) {
    throw new Error('日期区间最多支持 12 个月');
  }
}

async function reload() {
  loading.value = true;
  try {
    validateRange();
    const result = await props.loader({ from: from.value, to: to.value, all: !from.value && !to.value });
    orders.value = Array.isArray(result) ? result : (result?.orders || []);
    emit('loaded', orders.value);
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}

const searched = computed(() => {
  const key = q.value.trim().toLowerCase();
  return orders.value.filter((o) => {
    const day = String(o.createTime || '').slice(0, 10);
    if (day && from.value && day < from.value) return false;
    if (day && to.value && day > to.value) return false;
    if (!key) return true;
    return [o.orderNo, o.customerName, o.customerPhone, o.goodsText, o.merchantName, o.riderName]
      .join(' ').toLowerCase().includes(key);
  });
});

const shown = computed(() => {
  const list = status.value ? searched.value.filter((o) => o.status === status.value) : searched.value;
  return list.slice().sort((a, b) => String(a.orderNo || '').localeCompare(String(b.orderNo || '')));
});

const statusOptions = computed(() => {
  if (props.statuses.length) return props.statuses;
  const map = new Map();
  for (const o of orders.value) {
    if (o.status && !map.has(o.status)) map.set(o.status, { code: o.status, label: o.statusLabel || STATUS_NAME[o.status] || o.status });
  }
  return [...map.values()];
});

function countOf(code) {
  return searched.value.filter((o) => o.status === code).length;
}

const statusChips = computed(() => [
  { code: '', label: '全部', n: searched.value.length },
  ...statusOptions.value.map((s) => ({ code: s.code, label: s.label, n: countOf(s.code) })),
]);

const pageCount = computed(() => Math.max(1, Math.ceil(shown.value.length / props.pageSize)));
const paged = computed(() => shown.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize));
watch(shown, () => { page.value = 1; });

// Q-14/Q-15：统计只计有效单，已取消订单不计入；第三项改为带符号的「其他调整金额」
const stat = computed(() => {
  let goods = 0, service = 0, adjust = 0, n = 0;
  for (const o of shown.value) {
    if (o.status === 'CANCELLED') continue;
    n += 1;
    goods += o.goodsRealFen != null ? o.goodsRealFen : (o.goodsEstFen || 0);
    service += o.serviceFeeFen || 0;
    adjust += o.adjustmentsFen || 0;
  }
  return { n, goods, service, adjust, allCancelled: shown.value.length > 0 && n === 0 };
});
function signedMoney(fen) {
  const sign = fen > 0 ? '+' : fen < 0 ? '-' : '';
  return '¥' + sign + fmtMoney(Math.abs(fen)).replace(/^¥/, '');
}
const statItems = computed(() => {
  const dash = stat.value.allCancelled ? '¥-' : null;
  return [
    { label: '货款合计', value: dash ?? fmtMoney(stat.value.goods), foot: stat.value.n + ' 单' },
    { label: '服务费合计', value: dash ?? fmtMoney(stat.value.service) },
    { label: '其他调整金额', value: dash ?? signedMoney(stat.value.adjust),
      color: stat.value.adjust > 0 ? 'var(--ok)' : stat.value.adjust < 0 ? 'var(--danger)' : undefined },
  ];
});

onMounted(reload);
function focusOrder(orderNo) {
  q.value = orderNo || '';
  status.value = '';
  from.value = '';
  to.value = '';
  reload();
}
defineExpose({ reload, focusOrder });
</script>

<template>
  <div>
    <div class="p-toolbar">
      <input v-model="q" type="search" :placeholder="searchPlaceholder">
    </div>

    <DateRangeFilter
      v-model:from="from"
      v-model:to="to"
      :loading="loading"
      :presets="presets"
      note="按下单日期统计 · 日期可不选（不选查全部）· 按订单号排序"
      @change="reload"
    />

    <div class="p-chips">
      <button
        v-for="c in statusChips"
        :key="c.code || 'all'"
        class="chip"
        :class="{ on: status === c.code }"
        type="button"
        @click="status = c.code"
      >{{ c.label }} <span class="n">{{ c.n }}</span></button>
    </div>

    <slot name="stats" :orders="shown" :items="statItems">
      <StatCards v-if="showStats" :items="statItems" />
    </slot>

    <div v-if="heading" class="p-sec-t">{{ heading }}<span class="more">{{ shown.length }} 单</span></div>
    <div class="p-small p-muted order-browser-page">第 {{ page }}/{{ pageCount }} 页<template v-if="clickable"> · 点订单卡查看详情和操作</template></div>
    <div v-if="loading" class="p-loading">加载中…</div>
    <EmptyState v-else-if="!shown.length" :title="emptyTitle" :text="emptyText" />
    <template v-else>
      <OrderCard
        v-for="o in paged"
        :key="o.id"
        :order="o"
        :clickable="clickable"
        :show-customer="showCustomer"
        :show-payment="showPayment"
        :customer-view="customerView"
        @click="emit('select', o)"
      >
        <template v-if="$slots.tags" #tags><slot name="tags" :order="o" /></template>
        <template v-if="$slots.details" #details><slot name="details" :order="o" /></template>
        <template v-if="$slots.default"><slot :order="o" /></template>
        <template v-if="$slots.actions" #actions><slot name="actions" :order="o" /></template>
      </OrderCard>
    </template>

    <Pager v-if="!loading && shown.length" v-model="page" :page-count="pageCount" :total="shown.length" :page-size="props.pageSize" />
  </div>
</template>

<style scoped>
.order-browser-page { margin: -4px 0 10px; }
.shared-range { margin-bottom: 8px; }
</style>
