<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import NewOrderModal from '../../components/NewOrderModal.vue';
import OrderDrawer from '../../components/OrderDrawer.vue';
import OrderCard from '../../components/OrderCard.vue';
import StatCards from '../../components/StatCards.vue';
import EmptyState from '../../components/EmptyState.vue';
import { api } from '../../api';
import { fmtMoney, fmtYuan } from '../../api/money';
import { minutesSince, sourceLabelOf } from '../../api/format';
import { showError } from '../../composables/useToast';
import { loadStatuses, store as stStore } from '../../composables/useStatuses';
import { useAuth } from '../../composables/useAuth';

const auth = useAuth();
const orders = ref([]);
const health = ref(null);
const loading = ref(true);
const filter = ref('');
const openId = ref(null);
const creating = ref(false);
let timer = null;

const CHIP_STATUS = ['PENDING', 'PICKING', 'DELIVERING', 'FINISHED'];

function todayKey(d) {
  const x = d ? new Date(d) : new Date();
  if (isNaN(x.getTime())) return '';
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

function isBoardOrder(o) {
  if (!['FINISHED', 'CANCELLED'].includes(o.status)) return true;
  return todayKey(o.finishedAt || o.createTime) === todayKey();
}

async function refresh() {
  try {
    const [list, h] = await Promise.all([
      api.orders({ all: 'true', limit: 300 }),
      api.health(),
    ]);
    orders.value = (list || []).filter(isBoardOrder);
    health.value = h || null;
    loading.value = false;
  } catch (e) {
    showError(e);
    loading.value = false;
  }
}

function countOf(code) {
  return orders.value.filter((o) => o.status === code).length;
}

const shown = computed(() => (filter.value ? orders.value.filter((o) => o.status === filter.value) : orders.value));

const chips = computed(() => [
  { code: '', label: '全部', n: orders.value.length },
  ...CHIP_STATUS.map((code) => {
    const s = stStore.list.filter((x) => x.code === code)[0];
    return { code, label: s ? s.label : code, n: countOf(code) };
  }),
]);

const primaryStats = computed(() => health.value ? [
  { label: '今天服务费', value: fmtMoney(health.value.todayServiceFeeFen), foot: '按结单时间' },
  { label: '昨天服务费', value: fmtMoney(health.value.yesterdayServiceFeeFen), foot: '北京时间' },
  { label: '账单合计', value: fmtMoney(health.value.totalBillFen), foot: '全部客户未收', tone: 'brand' },
] : []);

const secondaryStats = computed(() => health.value ? [
  { label: '进行中', value: health.value.inProgress, foot: '今天未结单' },
  { label: '欠款', value: fmtMoney(health.value.owedFen), foot: '全部客户' },
  { label: '垫付未回', value: fmtMoney(health.value.advanceOutstandingFen), foot: '骑手经手' },
] : []);

function waited(o) {
  const n = minutesSince(o.createTime);
  return n > 0 ? '已等 ' + n + ' 分钟' : '';
}

onMounted(async () => {
  await loadStatuses();
  await refresh();
  timer = setInterval(refresh, 8000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div>
    <StatCards v-if="health" :items="primaryStats" />
    <StatCards v-if="health" :items="secondaryStats" />

    <div class="p-chips">
      <button
        v-for="c in chips"
        :key="c.code || 'all'"
        class="chip"
        :class="{ on: filter === c.code }"
        type="button"
        @click="filter = c.code"
      >
        {{ c.label }} <span class="n">{{ c.n }}</span>
      </button>
    </div>

    <div v-if="loading" class="p-loading">加载中…</div>
    <div v-else-if="stStore.error" class="p-alert err">状态枚举读不到：{{ stStore.error }}</div>

    <template v-else>
      <div class="p-sec-t">
        订单
        <span class="more">{{ shown.length }} 单 · 8 秒自动刷新</span>
      </div>
      <EmptyState v-if="!shown.length" title="这个状态没有订单" text="换个状态看看，或点右下角「＋ 电话录单」新建一单。" />
      <OrderCard v-for="o in shown" :key="o.id" :order="o" clickable :show-date="false" @click="openId = o.id">
        <template #tags>
          <span class="badge slate">{{ sourceLabelOf(o) }}</span>
          <span class="badge" :class="o.riderName ? 'ghost' : 'red'">{{ o.riderName || '未指派' }}</span>
          <span v-if="o.advanceFen" class="badge violet">垫付{{ fmtMoney(o.advanceFen) }}</span>
          <span v-if="o.owedFen > 0" class="badge amber">欠 {{ fmtYuan(o.owedFen) }}</span>
          <span v-if="waited(o) && o.status === 'PENDING'" class="badge ghost">{{ waited(o) }}</span>
        </template>
      </OrderCard>
    </template>

    <button v-if="auth.can('order.create')" class="p-fab" type="button" @click="creating = true">
      ＋ 电话录单
    </button>

    <NewOrderModal
      v-if="creating"
      @close="creating = false"
      @saved="creating = false; refresh()"
    />

    <OrderDrawer
      v-if="openId"
      :order-id="openId"
      @close="openId = null"
      @changed="refresh"
    />
  </div>
</template>
