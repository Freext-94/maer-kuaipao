<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import { minutesSince } from '../api/format';
import { audioArmed, armAudio, beep } from '../composables/useAudio';
import { setAuthToken } from '../api/http';
import { showError, showToast } from '../composables/useToast';
import AppShell from '../components/AppShell.vue';
import OrderCard from '../components/OrderCard.vue';
import OrderBrowser from '../components/OrderBrowser.vue';
import EmptyState from '../components/EmptyState.vue';

const waiting = ref([]);
const tab = ref('waiting');
const lastPoll = ref(0);
const INTERVAL = 12;
const tabs = [
  { key: 'waiting', label: '工作台', icon: '▦' },
  { key: 'orders', label: '订单', icon: '/brand/tab-order.svg' },
];
const title = computed(() => (tab.value === 'waiting' ? '商家工作台' : '订单'));
let pollTimer = null;

async function poll(manual) {
  try {
    const d = await api.mPoll();
    const before = new Set(waiting.value.map((o) => o.id));
    waiting.value = d.pending || [];
    const freshOrders = waiting.value.filter((o) => !before.has(o.id));
    lastPoll.value = Date.now();
    if (freshOrders.length) {
      const rang = beep(2);
      showToast('有 ' + freshOrders.length + ' 张新单' + (rang ? '' : '（请先点「声音自检」）'), 'ok');
    } else if (manual) {
      showToast('没有新单');
    }
  } catch (e) {
    showError(e);
  }
}

function soundCheck() {
  if (armAudio()) {
    beep(2);
    showToast('提示音正常，页面请一直开着', 'ok');
  } else {
    showToast('这个浏览器不允许播放，请换 Chrome / 夸克打开', 'err');
  }
}

async function loadOrders() {
  const d = await api.mOrders();
  waiting.value = d.waiting || [];
  return d.done || [];
}

function switchTab(t) {
  tab.value = t;
}

function fresh(o) {
  return minutesSince(o.createTime) < 2;
}

onMounted(async () => {
  try {
    const me = await api.mPoll();
    waiting.value = me.pending || [];
    lastPoll.value = Date.now();
  } catch (e) {
    showError(e);
  }
  pollTimer = setInterval(() => poll(false), INTERVAL * 1000);
});
onBeforeUnmount(() => clearInterval(pollTimer));

async function logout() {
  try { await api.logout(); } catch (e) { /* 退出不阻塞 */ }
  setAuthToken('');
  location.hash = '#/login';
}
</script>

<template>
  <AppShell :title="title" :tabs="tabs" :active="tab" @select="switchTab" @logout="logout">
    <template v-if="tab === 'waiting'">
      <div class="m-banner"><img src="/brand-kit/mobile-banner-1500x600.png" alt="马儿快跑"></div>
      <div class="p-card">
        <div class="p-row wrap">
          <div><b>待完成订单 <span class="num">{{ waiting.length }}</span></b></div>
          <div class="p-right p-row wrap">
            <button class="btn sm" type="button" @click="soundCheck">声音自检</button>
            <button class="btn sm pri" type="button" @click="poll(true)">立即拉取</button>
          </div>
        </div>
        <div v-if="!audioArmed" class="p-note" style="margin-top:10px"><b>声音还没开。</b>请先点「声音自检」，并保持页面打开。</div>
        <div class="p-alert info" style="margin-top:10px">请用 <b>Chrome / 夸克</b> 打开并「添加到桌面」全屏挂着，别在微信里直接点开。</div>
      </div>

      <div class="p-sec-t" style="margin-top:14px">待完成<span class="more">{{ waiting.length }} 单</span></div>
      <EmptyState v-if="!waiting.length" title="暂无新单" text="页面保持打开即可，新单会自动出现。" />
      <OrderCard v-for="o in waiting" :key="o.id" :order="o" :hot="fresh(o)" :show-date="false">
        <template #details>
          <div class="p-order-sub">送到：{{ o.address && o.address.address ? o.address.address : '—' }}</div>
          <div class="p-order-sub">骑手取走后可在「订单」里查历史。</div>
        </template>
      </OrderCard>
      <div class="p-note" style="margin-top:14px">这个页面每 {{ INTERVAL }} 秒自动拉一次新单。挂机拉单是新单提醒的主路径。</div>
    </template>

    <template v-else-if="tab === 'orders'">
      <OrderBrowser
        :loader="loadOrders"
        heading="订单"
        empty-title="还没有历史订单"
        empty-text="完成或取消的订单会显示在这里。"
      />
    </template>

  </AppShell>
</template>
