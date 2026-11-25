<script setup>
import { onMounted, reactive, ref } from 'vue';
import ModalBox from '../../components/ModalBox.vue';
import OrderBillPanel from '../../components/OrderBillPanel.vue';
import OrderDrawer from '../../components/OrderDrawer.vue';
import { api } from '../../api';
import { fmtMoney, fmtYuan, parseYuan } from '../../api/money';
import { fmtDateTime } from '../../api/format';
import { showError, showToast } from '../../composables/useToast';
import { useAuth } from '../../composables/useAuth';

const auth = useAuth();
const active = reactive({ group: null, ledger: null, reload: null });
const openOrderId = ref(null);
const pay = reactive({ on: false, amount: '', method: '微信转账', orderId: '', note: '', busy: false });
const waive = reactive({ on: false, amount: '', reason: '', busy: false });
const repaymentRequests = ref([]);

async function loadRepaymentRequests() {
  try { repaymentRequests.value = await api.pendingRepaymentRequests(); }
  catch (e) { showError(e); }
}
onMounted(() => { if (auth.can('money.view')) loadRepaymentRequests(); });

// Q-16：账单页改为按客户搜索，取消时间区间；q 传给后端做客户名/手机/单号/内容匹配
function loadBill({ q }) {
  return api.billSummary({ q, all: true });
}

function bindActive(scope) {
  active.group = scope.group;
  active.ledger = scope.ledger;
  active.reload = scope.reload;
}

function openPay(scope) {
  bindActive(scope);
  pay.amount = fmtYuan(Math.max(0, active.ledger?.owedFen || 0));
  pay.method = '微信转账';
  pay.orderId = '';
  pay.note = '';
  pay.on = true;
}

async function confirmPay() {
  if (pay.busy) return;
  const amt = parseYuan(pay.amount);
  if (amt <= 0) {
    showError(new Error('收款金额必须大于 0'));
    return;
  }
  const owed = Math.max(0, active.ledger?.owedFen || 0);
  if (amt > owed) {
    showError(new Error('收款超过当前欠款 ' + fmtMoney(owed)));
    return;
  }
  pay.busy = true;
  try {
    await api.payment(active.group.customerId, {
      amountFen: amt,
      method: pay.method,
      note: pay.note || '调度台登记收款',
      orderId: pay.orderId ? Number(pay.orderId) : null,
    });
    pay.on = false;
    showToast('已登记收款 ' + fmtMoney(amt), 'ok');
    await active.reload();
  } catch (e) {
    showError(e);
  } finally {
    pay.busy = false;
  }
}

async function confirmRepayRequest(item, scope) {
  try {
    await api.confirmRepaymentRequest(item.id);
    showToast('已确认客户还款', 'ok');
    await loadRepaymentRequests();
    await scope.reload();
  } catch (e) { showError(e); }
}

async function rejectRepayRequest(item, scope) {
  try {
    await api.rejectRepaymentRequest(item.id);
    showToast('已驳回还款申报', 'ok');
    await loadRepaymentRequests();
    await scope.reload();
  } catch (e) { showError(e); }
}

function openWaive(scope) {
  bindActive(scope);
  waive.amount = '';
  waive.reason = '';
  waive.on = true;
}

async function confirmWaive() {
  if (waive.busy) return;
  const amt = parseYuan(waive.amount);
  if (amt <= 0) {
    showError(new Error('减免金额必须大于 0'));
    return;
  }
  if (!waive.reason.trim()) {
    showError(new Error('写一句原因，这是老板自己让出去的钱'));
    return;
  }
  waive.busy = true;
  try {
    await api.waive(active.group.customerId, { amountFen: amt, reason: waive.reason.trim() });
    waive.on = false;
    showToast('已减免 ' + fmtMoney(amt), 'ok');
    await active.reload();
  } catch (e) {
    showError(e);
  } finally {
    waive.busy = false;
  }
}

</script>

<template>
  <div>
    <div v-if="auth.can('money.view') && repaymentRequests.length" class="p-card" style="margin-bottom:12px">
      <div class="p-row"><b>待核对还款</b><span class="p-right p-muted p-small">{{ repaymentRequests.length }} 笔</span></div>
      <div v-for="r in repaymentRequests" :key="r.id" class="p-row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <span><b>{{ r.customerName }}</b> {{ r.customerPhone }} · {{ fmtMoney(r.amountFen) }} · {{ r.method }} · {{ fmtDateTime(r.createTime) }}</span>
        <button v-if="auth.can('money.receive')" class="btn sm pri" type="button" @click="confirmRepayRequest(r, { reload: loadRepaymentRequests })">核对到账</button>
        <button v-if="auth.can('money.receive')" class="btn sm" type="button" @click="rejectRepayRequest(r, { reload: loadRepaymentRequests })">驳回</button>
      </div>
    </div>
    <OrderBillPanel :loader="loadBill" :detail-loader="api.ledger" mode="search" @select-order="openOrderId = $event.id">
      <template #foot="scope">
        <button
          v-if="auth.can('money.receive') && scope.ledger && scope.ledger.owedFen > 0"
          class="btn pri"
          type="button"
          @click="openPay(scope)"
        >登记收款</button>
        <button v-if="auth.can('money.adjust')" class="btn" type="button" @click="openWaive(scope)">减免</button>
      </template>
    </OrderBillPanel>

    <OrderDrawer v-if="openOrderId" :order-id="openOrderId" @close="openOrderId = null" />

    <ModalBox
      v-if="pay.on"
      :title="'登记收款 · ' + (active.group ? active.group.name : '')"
      ok-text="确认收款"
      :busy="pay.busy"
      @ok="confirmPay"
      @cancel="pay.on = false"
    >
      <div class="p-note" style="margin-bottom:12px">
        全部账单当前欠 <b>{{ active.ledger ? fmtMoney(active.ledger.owedFen) : '' }}</b>。收款不能超过欠款，多收的钱请另外登记。
      </div>
      <div class="field"><label class="fl">金额（元）</label><input v-model="pay.amount" inputmode="decimal"></div>
      <div class="field">
        <label class="fl">方式</label>
        <select v-model="pay.method"><option>微信转账</option><option>支付宝</option><option>现金</option></select>
      </div>
      <div class="field">
        <label class="fl">冲抵哪一单（不选 = 先冲最老欠款）</label>
        <select v-model="pay.orderId">
          <option value="">按最老欠款依次冲抵</option>
          <option v-for="c in (active.ledger ? active.ledger.openCharges : [])" :key="c.entryId" :value="String(c.orderId || '')">
            {{ c.orderNo || '零散挂账' }}（欠 {{ fmtYuan(c.openFen) }}）
          </option>
        </select>
      </div>
      <div class="field"><label class="fl">备注</label><input v-model="pay.note" placeholder="例：客户微信转来，先还最老一单"></div>
    </ModalBox>

    <ModalBox v-if="waive.on" title="减免（老板让客）" ok-text="确认减免" :busy="waive.busy" @ok="confirmWaive" @cancel="waive.on = false">
      <div class="p-note" style="margin-bottom:12px">减免会单独成一条流水，月底能对出「这个月让了多少」。</div>
      <div class="field"><label class="fl">减免金额（元）</label><input v-model="waive.amount" inputmode="decimal"></div>
      <div class="field"><label class="fl">原因（必填）</label><input v-model="waive.reason" placeholder="例：送晚了，免 5 元"></div>
    </ModalBox>

  </div>
</template>
