<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ModalBox from '../components/ModalBox.vue';
import AppShell from '../components/AppShell.vue';
import OrderCard from '../components/OrderCard.vue';
import OrderBrowser from '../components/OrderBrowser.vue';
import OrderBillPanel from '../components/OrderBillPanel.vue';
import EmptyState from '../components/EmptyState.vue';
import NewOrderModal from '../components/NewOrderModal.vue';
import { api } from '../api';
import { fmtMoney, fmtYuan, parseYuan } from '../api/money';
import { feeLabel } from '../api/format';
import { setAuthToken } from '../api/http';
import { showError, showToast } from '../composables/useToast';

const tasks = ref([]);
const advSum = ref(0);
const loading = ref(true);
const busy = ref(false);
const tab = ref('tasks');
const creating = ref(false);
const orderBrowser = ref(null);
const dlg = reactive({ on: false, kind: '', order: null, title: '' });
const form = reactive({});
const tabs = [
  { key: 'tasks', label: '工作台', icon: '▦' },
  { key: 'history', label: '订单', icon: '/brand/tab-order.svg' },
  { key: 'bill', label: '账单', icon: '/brand/tab-bill.svg' },
];
const title = computed(() => ({ tasks: '骑手工作台', history: '订单', bill: '账单' }[tab.value] || '马儿快跑'));
let timer = null;

async function load() {
  try {
    const d = await api.rTasks();
    tasks.value = d.tasks || [];
    advSum.value = d.advanceOutstandingFen || 0;
  } catch (e) {
    showError(e);
  } finally {
    loading.value = false;
  }
}

function loadHistory() {
  return api.rHistory();
}

function loadBill({ q, from, to, all }) {
  return api.rBills({ q, from, to, all });
}

function focusOrder(order) {
  tab.value = 'history';
  nextTick(() => orderBrowser.value?.focusOrder(order?.orderNo));
}

function switchTab(t) {
  tab.value = t;
}

async function onOrderSaved() {
  creating.value = false;
  await load();
  if (orderBrowser.value) await orderBrowser.value.reload();
}

async function refreshTasks() {
  loading.value = true;
  await load();
  showToast('任务已刷新', 'ok');
}

function open(kind, o, title) {
  Object.keys(form).forEach((k) => delete form[k]);
  dlg.kind = kind;
  dlg.order = o;
  dlg.title = title;
  dlg.on = true;
  if (kind === 'pick') {
    form.realYuan = fmtYuan(o.goodsEstFen);
    form.merchantAmounts = Object.fromEntries((o.merchantGroups || []).map(g => [g.merchantId, '']));
    form.method = 'cash';
    form.shot = null;
  }
  if (kind === 'complete') {
    form.shot = null;
    form.paidYuan = fmtYuan(totalDueOf(o));
    form.method = 'wechat';
  }
}

function totalDueOf(o) {
  return Math.max(0, o.customerOwedFen || 0) + Math.max(0, o.receivableFen || 0);
}

async function shoot(ev, bizType) {
  const file = ev.target.files && ev.target.files[0];
  if (!file || !dlg.order) return;
  try {
    form.shot = await api.uploadForRider(file, bizType, dlg.order.id);
    showToast('照片已上传', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function act(fn, msg) {
  busy.value = true;
  try {
    await fn();
    dlg.on = false;
    showToast(msg || '已更新', 'ok');
    await load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

function onMethod() {
  form.paidYuan = form.method === 'credit' ? '0' : fmtYuan(totalDueOf(dlg.order));
}

function confirmDlg() {
  const o = dlg.order;
  if (dlg.kind === 'pick') {
    const real = parseYuan(form.realYuan);
    if (real < 0) {
      showError(new Error('实际货款不能是负数'));
      return;
    }
    const groups = o.merchantGroups || [];
    const merchantAmounts = {};
    let merchantTotal = 0;
    for (const group of groups) {
      const amount = groups.length === 1 ? real : parseYuan(form.merchantAmounts[group.merchantId]);
      merchantAmounts[group.merchantId] = amount;
      merchantTotal += amount;
    }
    if (groups.length > 1 && merchantTotal !== real) {
      showError(new Error('各商家实际货款合计必须等于实际货款'));
      return;
    }
    return act(() => api.rPick(o.id, {
      goodsRealFen: real,
      merchantAmounts,
      receiptAttachmentId: form.shot ? form.shot.id : null,
      method: form.method,
    }), '已取货，进入配送');
  }
  if (dlg.kind === 'complete') {
    const paid = parseYuan(form.paidYuan);
    if (form.method === 'credit' && paid > 0) {
      showError(new Error('选了「欠款」就不能填实收'));
      return;
    }
    if (form.method !== 'credit' && paid <= 0) {
      showError(new Error('实收是 0，请把方式改成「欠款」'));
      return;
    }
    return act(() => api.rComplete(o.id, {
      attachmentId: form.shot ? form.shot.id : null,
      paidFen: paid,
      method: form.method,
    }), '已确认送达');
  }
}

onMounted(async () => {
  await load();
  timer = setInterval(load, 15000);
});
onBeforeUnmount(() => clearInterval(timer));

async function logout() {
  try { await api.logout(); } catch (e) { /* 退出不阻塞 */ }
  setAuthToken('');
  location.hash = '#/login';
}
</script>

<template>
  <AppShell :title="title" :tabs="tabs" :active="tab" @select="switchTab" @logout="logout">
    <template #actions>
      <button v-if="tab === 'tasks'" class="p-topbar-logout" type="button" @click="refreshTasks">刷新</button>
    </template>

    <template v-if="tab === 'tasks'">
      <div class="p-card">
        <div class="p-row">
          <div><b>进行中 <span class="num">{{ tasks.length }}</span></b></div>
          <div class="p-right">
            <div class="p-small p-muted">我经手未回款垫付</div>
            <b class="num">{{ fmtMoney(advSum) }}</b>
          </div>
        </div>
        <div class="p-small p-muted" style="margin-top:6px">取货时把实付货款和小票拍准，比什么都重要。</div>
      </div>

      <div v-if="loading" class="p-loading">加载中…</div>
      <EmptyState v-else-if="!tasks.length" title="当前没有待办任务" text="新任务出现后可在这里取货、送达和收款。" />
      <OrderCard v-for="o in tasks" :key="o.id" :order="o" :show-payment="false" :show-date="false">
        <template #details>
          <dl class="kv" style="grid-template-columns:56px 1fr;font-size:13px;margin-top:8px">
            <dt>商家电话</dt>
            <dd><a :href="'tel:' + o.merchantPhone">{{ o.merchantPhone || '—' }}</a></dd>
            <dt>收货地址</dt>
            <dd v-if="o.address">{{ o.address.address }}</dd>
            <dd v-else>—</dd>
            <dt>收款</dt>
            <dd>
              <span v-if="o.customerOwedFen > 0 && o.status === 'FINISHED'" class="badge slate">已挂账</span>
              <span class="badge" :class="o.owedFen > 0 ? 'orange' : 'green'">应{{ o.owedFen > 0 ? '收 ' + fmtMoney(o.receivableFen) : '已收清' }}</span>
              <div class="p-small p-muted">赊账客户不用收钱，其余按上面金额收。</div>
            </dd>
            <template v-if="o.advanceFen"><dt>已垫付</dt><dd class="num strong">{{ fmtMoney(o.advanceFen) }}</dd></template>
          </dl>
        </template>
        <template #actions>
          <a class="btn sm" :href="'tel:' + o.merchantPhone">打商家电话</a>
          <button v-if="o.status === 'PICKING'" class="btn pri block" type="button" @click="open('pick', o, '取货 · 录垫付金额')">① 已到店取货：录垫付 + 拍小票</button>
          <button v-if="o.status === 'DELIVERING'" class="btn pri block" type="button" @click="open('complete', o, '确认送达')">② 确认送达：收款确认</button>
        </template>
      </OrderCard>
    </template>

    <template v-else-if="tab === 'history'">
      <OrderBrowser
        ref="orderBrowser"
        :loader="loadHistory"
        heading="订单"
        empty-title="还没有配送过的订单"
        empty-text="完成或取消的配送会显示在这里。"
      />
    </template>

    <template v-else-if="tab === 'bill'">
      <OrderBillPanel
        :loader="loadBill"
        mode="search"
        export-name="骑手账单"
        empty-title="没有匹配的账单"
        empty-text="换个客户名/手机号/单号试试。"
        @select-order="focusOrder"
      />
    </template>

    <NewOrderModal v-if="creating" role="rider" @close="creating = false" @saved="onOrderSaved" />

    <ModalBox v-if="dlg.on" :title="dlg.title" :busy="busy" ok-text="确认" @ok="confirmDlg" @cancel="dlg.on = false">
      <template v-if="dlg.kind === 'pick'">
        <div class="p-note" style="margin-bottom:12px">记的是<b>你替客户垫给商家的钱</b>。填错不能直接改，只能走「货款不对？」记一笔。</div>
        <div class="grid2">
          <div class="field"><label class="fl">实际货款（元），估价 {{ dlg.order ? fmtYuan(dlg.order.goodsEstFen) : '' }}</label><input v-model="form.realYuan" inputmode="decimal"></div>
          <div class="field"><label class="fl">怎么付给商家</label><select v-model="form.method"><option value="cash">现金</option><option value="transfer">扫码转账</option></select></div>
        </div>
        <div v-if="dlg.order && dlg.order.merchantGroups && dlg.order.merchantGroups.length > 1" class="field">
          <label v-for="g in dlg.order.merchantGroups" :key="g.merchantId" class="field">
            <span class="fl">{{ g.merchantName }}实际货款（元）</span>
            <input v-model="form.merchantAmounts[g.merchantId]" inputmode="decimal">
          </label>
        </div>
        <div class="field">
          <label class="fl">小票照片（选填）</label>
          <input type="file" accept="image/*" capture="environment" @change="shoot($event, 'receipt')">
          <div v-if="form.shot" class="shot-hint">已上传</div>
          <div v-else class="shot-hint" style="color:var(--muted)">不拍也能取货，事后还能补</div>
        </div>
      </template>

      <template v-else-if="dlg.kind === 'complete'">
        <dl class="kv" style="margin-bottom:10px">
          <dt>货款</dt><dd class="num">{{ dlg.order ? fmtMoney(dlg.order.goodsRealFen != null ? dlg.order.goodsRealFen : dlg.order.goodsEstFen) : '' }}</dd>
          <dt>{{ dlg.order ? feeLabel(dlg.order.serviceType) : '服务费' }}</dt><dd class="num">{{ dlg.order ? fmtMoney(dlg.order.serviceFeeFen) : '' }}</dd>
          <dt>本单应收</dt><dd class="num strong">{{ dlg.order ? fmtMoney(dlg.order.receivableFen) : '' }}</dd>
          <dt>历史欠款</dt><dd class="num">{{ dlg.order ? fmtMoney(Math.max(0, dlg.order.customerOwedFen || 0)) : '' }}</dd>
          <dt>合计应收</dt><dd class="num strong">{{ dlg.order ? fmtMoney(totalDueOf(dlg.order)) : '' }}</dd>
        </dl>
        <div class="field" style="margin-bottom:10px">
          <label class="fl">送达照片（选填）</label>
          <input type="file" accept="image/*" capture="environment" @change="shoot($event, 'delivered')">
          <div v-if="form.shot" class="shot-hint">已上传</div>
        </div>
        <div class="field"><label class="fl">收款方式</label><select v-model="form.method" @change="onMethod"><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="cash">现金</option><option value="credit">欠款（这次不收钱）</option></select></div>
        <div class="field"><label class="fl">当场实收（元）</label><input v-model="form.paidYuan" inputmode="decimal" :disabled="form.method === 'credit'"></div>
        <div class="p-note">默认按<b>客户历史欠款合计</b>收款；选「欠款」则本单整单记客户账上，多收部分先冲最老挂账。</div>
      </template>
    </ModalBox>

    <template #fab>
      <button class="p-fab" type="button" @click="creating = true">＋ 下单</button>
    </template>
  </AppShell>
</template>
