<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import OrderForm from '../components/OrderForm.vue';
import OrderBrowser from '../components/OrderBrowser.vue';
import StatCards from '../components/StatCards.vue';
import DrawerBox from '../components/DrawerBox.vue';
import EmptyState from '../components/EmptyState.vue';
import ModalBox from '../components/ModalBox.vue';
import ServicePicker from '../components/ServicePicker.vue';
import { api } from '../api';
import { fmtMoney, fmtYuan, parseYuan } from '../api/money';
import { fmtDateTime } from '../api/format';
import { setAuthToken } from '../api/http';
import { showError, showToast } from '../composables/useToast';

const profile = ref(null);
const orderForm = ref(null);
const activeService = ref('buy');
const orderBrowser = ref(null);
const ledger = ref(null);
const tab = ref('order');
const busy = ref(false);
const billLoading = ref(false);
const monthDetail = reactive({ on: false, month: null, orders: [] });
const dlg = reactive({ on: false, kind: '', title: '' });
const dialogForm = reactive({});

const tabs = [
  { key: 'order', label: '下单', icon: '＋' },
  { key: 'list', label: '订单', icon: '/brand/tab-order.svg' },
  { key: 'bill', label: '账单', icon: '/brand/tab-bill.svg' },
  { key: 'me', label: '我的', icon: '/brand/tab-mine.svg' },
];
const title = computed(() => ({ order: '马儿快跑', list: '我的订单', bill: '我的账单', me: '我的' }[tab.value] || '马儿快跑'));
const serviceTypes = computed(() => (profile.value && profile.value.serviceTypes) || []);
// 月度账单卡片（后端 myLedger.months，已含当月订单）
const monthCards = computed(() => (ledger.value && ledger.value.months) || []);
// 账单首页顶部统计：累计挂账、已付
const allTotals = computed(() => monthCards.value.reduce((acc, m) => {
  acc.chargeFen += m.chargeFen || 0;
  acc.paidFen += m.paidFen || 0;
  acc.count += m.count || 0;
  return acc;
}, { chargeFen: 0, paidFen: 0, count: 0 }));
const billTopStats = computed(() => [
  { label: '当前挂账', value: fmtMoney(Math.max(0, allTotals.value.chargeFen - allTotals.value.paidFen)), foot: allTotals.value.count + ' 笔流水' },
  { label: '累计已付', value: fmtMoney(allTotals.value.paidFen), color: 'var(--ok)' },
]);

async function loadProfile() {
  try {
    profile.value = await api.cProfile();
  } catch (e) {
    showError(e);
  }
}

function loadOrders() {
  return api.cOrders();
}

async function loadLedger() {
  billLoading.value = true;
  try {
    ledger.value = await api.cLedger();
  } catch (e) {
    showError(e);
  } finally {
    billLoading.value = false;
  }
}

function chooseService(code) {
  activeService.value = code;
  orderForm.value?.selectService(code);
}

function switchTab(t) {
  tab.value = t;
  if (t === 'order') loadProfile();
  if (t === 'bill' && !ledger.value) loadLedger();
  if (t === 'me') {
    loadProfile();
    loadLedger();
  }
}

async function openBill(month) {
  tab.value = 'bill';
  if (!ledger.value) await loadLedger();
  const m = monthCards.value.find((x) => x.month === month);
  if (m) openMonthDetail(m);
}

function openMonthDetail(m) {
  monthDetail.month = m;
  monthDetail.orders = (m && m.orders) || [];
  monthDetail.on = true;
}

function jumpToOrder(o) {
  monthDetail.on = false;
  tab.value = 'list';
  nextTick(() => orderBrowser.value?.focusOrder(o?.orderNo));
}

async function onOrderSaved() {
  tab.value = 'list';
  await nextTick();
  await Promise.all([orderBrowser.value?.reload(), loadProfile()]);
}

function resetDialog(kind, title) {
  Object.keys(dialogForm).forEach((k) => delete dialogForm[k]);
  dlg.kind = kind;
  dlg.title = title;
  dlg.on = true;
}

function openRepay() {
  resetDialog('repay', '还款登记');
  dialogForm.repayYuan = fmtYuan(profile.value.owedFen);
  dialogForm.repayMethod = '微信收款码';
}

function openProfile() {
  resetDialog('profile', '修改手机号');
  dialogForm.editPhone = profile.value.phone;
}

function openAddress(a) {
  resetDialog('address', a ? '编辑收货地址' : '新增收货地址');
  dialogForm.addr = a ? { ...a } : { address: '' };
}

async function confirmDlg() {
  if (dlg.kind === 'repay') return confirmRepay();
  busy.value = true;
  try {
    if (dlg.kind === 'profile') {
      await api.cUpdateProfile({ phone: dialogForm.editPhone });
      showToast('手机号已更新', 'ok');
    } else if (dlg.kind === 'address') {
      const body = { address: dialogForm.addr.address, isDefault: true };
      if (dialogForm.addr.id) await api.cUpdateAddress(dialogForm.addr.id, body);
      else await api.cAddAddress(body);
      showToast('地址已保存', 'ok');
    }
    dlg.on = false;
    await loadProfile();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function confirmRepay() {
  busy.value = true;
  try {
    const r = await api.cRepay(parseYuan(dialogForm.repayYuan), dialogForm.repayMethod);
    dlg.on = false;
    showToast('还款已申报，等待老板核对；确认前欠款不会变化', 'ok');
    await Promise.all([loadProfile(), loadLedger()]);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

onMounted(loadProfile);

async function logout() {
  try { await api.logout(); } catch (e) { /* 退出不阻塞 */ }
  setAuthToken('');
  location.hash = '#/login';
}
</script>

<template>
  <AppShell :title="title" :tabs="tabs" :active="tab" @select="switchTab" @logout="logout">
    <div v-if="!profile" class="p-card center muted">正在读取…</div>

    <template v-else-if="tab === 'order'">
      <div class="m-banner"><img src="/brand-kit/mobile-banner-1500x600.png" alt="马儿快跑"></div>
      <div class="p-card">
        <div class="p-row">
          <div><b>当前欠款</b><div class="p-small p-muted">结单后记入账单</div></div>
          <div class="p-right big-amt" style="font-size:22px" :style="{ color: profile.owedFen > 0 ? 'var(--danger)' : 'var(--ok)' }">
            {{ fmtMoney(profile.owedFen) }}
          </div>
        </div>
      </div>
      <div class="home-services">
        <div class="p-row"><b>选一个服务</b><span class="p-right p-small p-muted">三秒内下单</span></div>
        <ServicePicker :types="serviceTypes" :model-value="activeService" @update:model-value="chooseService" />
      </div>
      <div class="p-card order-page-form">
        <OrderForm
          ref="orderForm"
          role="customer"
          inline
          hide-service-select
          :customer-profile="profile"
          @saved="onOrderSaved"
          @service-change="activeService = $event"
        />
      </div>
    </template>

    <template v-else-if="tab === 'list'">
      <OrderBrowser
        ref="orderBrowser"
        :loader="loadOrders"
        heading="我的订单"
        :show-customer="false"
        customer-view
        empty-title="还没有订单"
        empty-text="提交订单后，进度和金额会显示在这里。"
      >
        <template #default="{ order: o }">
          <div v-if="o.attachments && o.attachments.length" class="thumbs">
            <a v-for="a in o.attachments" :key="a.id" :href="a.url" target="_blank" rel="noreferrer">
              <img :src="a.url" :alt="a.fileName">
            </a>
          </div>
        </template>
      </OrderBrowser>
    </template>

    <template v-else-if="tab === 'bill'">
      <StatCards :items="billTopStats" />
      <div class="profile-actions" style="margin:8px 0 12px">
        <button v-if="profile && profile.owedFen > 0" class="mbtn" type="button" @click="openRepay">还款登记</button>
      </div>
      <div class="p-sec-t monthly-title">月度账单<span class="more">{{ monthCards.length }} 个月 · 点卡片看当月订单</span></div>
      <div v-if="billLoading" class="p-loading">账单加载中…</div>
      <EmptyState v-else-if="!monthCards.length" kind="bills" title="还没有账单" text="订单结单后会自动挂账，这里按月汇总。" />
      <div v-for="m in monthCards" :key="m.month" class="p-card month-card" style="cursor:pointer" @click="openMonthDetail(m)">
        <div class="p-row">
          <b>{{ m.month.replace('-', '年') }}月账单</b>
          <button type="button" class="p-right p-small p-muted link-btn" @click.stop="openMonthDetail(m)">查看详情 ›</button>
        </div>
        <div class="p-grid two" style="margin-top:8px">
          <div class="p-cell"><div class="k">挂账</div><div class="v">{{ fmtMoney(Math.max(0, (m.chargeFen || 0) - (m.paidFen || 0))) }}</div></div>
          <div class="p-cell"><div class="k">已付</div><div class="v" style="color:var(--ok)">{{ fmtMoney(m.paidFen) }}</div></div>
        </div>
        <div class="p-small p-muted" style="margin-top:6px">{{ m.count }} 笔流水<template v-if="m.adjustFen"> · 冲正/减免 {{ fmtMoney(m.adjustFen) }}</template></div>
      </div>
      <div class="p-note" style="margin-top:12px">账单按月汇总挂账与还款；点某月可查看当月订单，再点订单看详情。</div>
    </template>

    <template v-else-if="tab === 'me'">
      <div class="p-card center">
        <div class="p-muted p-small">当前欠款</div>
        <div class="big-amt" :style="{ color: profile.owedFen > 0 ? 'var(--danger)' : 'var(--ok)' }">{{ fmtMoney(profile.owedFen) }}</div>
        <div class="p-small p-muted">
          还款申报经老板核对后冲抵账单<template v-if="profile.prepaidFen">｜预收 {{ fmtMoney(profile.prepaidFen) }}</template>
        </div>
        <div class="profile-actions">
          <button class="mbtn alt" type="button" @click="openProfile">修改手机号</button>
        </div>
        <div class="p-small p-muted" style="margin-top:10px">先按平时的方式付款，再在这里登记，老板核对后自动冲抵欠款。</div>
      </div>

      <div class="p-card address-card">
        <div class="p-row">
          <b>收货地址</b>
          <button class="btn sm p-right" type="button" @click="openAddress()">＋ 新增</button>
        </div>
        <div v-for="a in profile.addresses" :key="a.id" class="address-row">
          <span>{{ a.address }}</span>
          <button class="btn sm" type="button" @click="openAddress(a)">编辑</button>
        </div>
        <div v-if="!profile.addresses.length" class="p-small p-muted" style="margin-top:8px">还没有地址，可在下单页或这里新增。</div>
      </div>

      <div class="p-note">
        订单进度请留意老板的微信消息，或进入「订单」刷新查看。
      </div>
    </template>

    <DrawerBox v-if="monthDetail.on" @close="monthDetail.on = false">
      <template #title>{{ monthDetail.month && monthDetail.month.month ? monthDetail.month.month.replace('-', '年') + '月账单' : '账单详情' }}</template>
      <div v-if="monthDetail.month" class="p-card bill-month-summary">
        <div class="p-grid two">
          <div class="p-cell"><div class="k">挂账</div><div class="v">{{ fmtMoney(Math.max(0, (monthDetail.month.chargeFen || 0) - (monthDetail.month.paidFen || 0))) }}</div></div>
          <div class="p-cell"><div class="k">已付</div><div class="v" style="color:var(--ok)">{{ fmtMoney(monthDetail.month.paidFen) }}</div></div>
        </div>
      </div>
      <div class="p-sec-t">当月订单<span class="more">{{ monthDetail.orders.length }} 单 · 点击查看</span></div>
      <EmptyState v-if="!monthDetail.orders.length" kind="orders" title="这个月没有关联订单" text="当月只有还款或调整流水，没有结单订单。" />
      <button v-for="o in monthDetail.orders" :key="o.id" type="button" class="p-card c-bill-order" @click="jumpToOrder(o)">
        <div class="p-row">
          <b class="num p-small">{{ o.orderNo }}</b>
          <span class="p-right p-small p-muted">{{ o.finishedAt ? '结单 ' + fmtDateTime(o.finishedAt) : '下单 ' + fmtDateTime(o.createTime) }} ›</span>
        </div>
        <div class="p-small p-muted p-ell" style="margin-top:2px">{{ o.goodsText || o.serviceTypeName || '—' }}</div>
        <div class="p-grid three" style="margin-top:8px">
          <div class="p-cell"><div class="k">应付</div><div class="v">{{ fmtMoney(o.receivableFen) }}</div></div>
          <div class="p-cell" :class="{ hot: o.owedFen > 0 }"><div class="k">未付</div><div class="v" :style="o.owedFen > 0 ? 'color:var(--danger)' : ''">{{ fmtMoney(o.owedFen) }}</div></div>
          <div class="p-cell"><div class="k">已付</div><div class="v" style="color:var(--ok)">{{ fmtMoney(o.paidFen) }}</div></div>
        </div>
      </button>
      <div class="p-note" style="margin-top:12px">系统只记录账单和还款，不设额度、不拦新单。</div>
    </DrawerBox>

    <ModalBox v-if="dlg.on" :title="dlg.title" :busy="busy" ok-text="保存" @ok="confirmDlg" @cancel="dlg.on = false">
      <template v-if="dlg.kind === 'repay'">
        <div class="grid2">
          <div class="field"><label class="fl">还款金额（元）</label><input v-model="dialogForm.repayYuan" inputmode="decimal"></div>
          <div class="field">
            <label class="fl">方式</label>
            <select v-model="dialogForm.repayMethod"><option>微信收款码</option><option>现金</option><option>支付宝</option></select>
          </div>
        </div>
        <div class="note">请先按平时方式付款，再提交申报。老板核对到账后才会冲抵欠款。</div>
      </template>
      <template v-else-if="dlg.kind === 'profile'">
        <div class="p-note">称呼由管理员维护，这里只能改手机号。</div>
        <div class="field"><label class="fl">手机号</label><input v-model="dialogForm.editPhone" inputmode="tel"></div>
      </template>
      <template v-else-if="dlg.kind === 'address'">
        <div class="field"><label class="fl">收货地址</label><input v-model="dialogForm.addr.address" placeholder="例：幸福小区 3 栋 2 单元 1802，放门口"></div>
        <div class="p-note">联系人和电话请直接写在地址里，一行填完。</div>
      </template>
    </ModalBox>
  </AppShell>
</template>

<style scoped>
.home-services { margin-top: 12px; margin-bottom: 12px; }
.home-services > .p-row { margin-bottom: 10px; }
.order-page-form { margin-top: 12px; }
.bill-head { margin-bottom: 12px; }
.ledger-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 0; border-bottom: 1px dashed var(--line); font-size: 12.5px;
}
.ledger-row:last-child { border-bottom: 0; }
.profile-actions { display: flex; justify-content: center; gap: 8px; margin-top: 10px; }
.profile-actions .mbtn { margin: 0; }
.monthly-title { margin-top: 16px; }
.month-row + .month-row { margin-top: 10px; }
.month-card { display: block; width: 100%; text-align: left; cursor: pointer; }
.link-btn { background: none; border: 0; cursor: pointer; color: var(--primary, #0F766E); text-decoration: underline; padding: 0; }
.month-card + .month-card { margin-top: 10px; }
.bill-month-summary { background: var(--cream); border-color: var(--brand); }
.c-bill-order { display: block; width: 100%; text-align: left; cursor: pointer; padding: 11px 12px; }
.c-bill-order + .c-bill-order { margin-top: 10px; }
.address-card { margin-top: 16px; }
.address-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); font-size: 12.5px;
}
</style>
