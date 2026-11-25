<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api';
import { fmtYuan, parseYuan } from '../api/money';
import { feeLabel, orderTypeLabel, SOURCE_CHANNEL_LABEL } from '../api/format';
import { showError, showToast } from '../composables/useToast';

const emit = defineEmits(['saved', 'service-change']);
const props = defineProps({
  role: { type: String, default: 'admin' },
  inline: { type: Boolean, default: false },
  hideServiceSelect: { type: Boolean, default: false },
  customerProfile: { type: Object, default: null },
});

const isAdmin = computed(() => props.role === 'admin');
const isRider = computed(() => props.role === 'rider');
const isCustomer = computed(() => props.role === 'customer');
// 来源优先按录单时选的联系渠道显示，未选再回退到角色默认值（Q-11）
const sourceLabel = computed(() => {
  const ch = f.value.sourceChannel;
  if (isAdmin.value && ch) {
    const base = SOURCE_CHANNEL_LABEL[ch] || ch;
    return ch === 'other' && f.value.sourceChannelNote.trim() ? base + '：' + f.value.sourceChannelNote.trim() : base;
  }
  return ({ admin: '电话', rider: '骑手', customer: '客户' }[props.role] || '电话');
});

const busy = ref(false);
const riders = ref([]);
const files = ref([]);
const serviceTypes = ref([]);
const defaultGoods = ref([]);

const f = ref({
  serviceType: 'buy',
  customerId: '',
  addressId: '',
  address: '',
  merchantId: '',
  goodsText: '',
  estYuan: '',
  feeYuan: '',
  riderId: '',
  assignSelf: 'self',
  sourceChannel: '',
  sourceChannelNote: '',
  serviceDetails: {
    pickupAddress: '', deliveryAddress: '', itemDescription: '', taskDescription: '',
    serviceAddress: '', destination: '', scheduledAt: '', vehiclePlate: '',
  },
});

const isBuy = computed(() => f.value.serviceType === 'buy');
const svcName = computed(() => {
  const st = serviceTypes.value.find((s) => s.code === f.value.serviceType);
  return st ? st.name : '';
});
const estTotal = computed(() => parseYuan(f.value.estYuan) + parseYuan(f.value.feeYuan));
const owed = computed(() => (custPicked.value ? custPicked.value.owedFen || 0 : 0));
const customerMerchants = computed(() => (props.customerProfile && props.customerProfile.merchants) || []);
// Q-06：快捷填入只取默认商品前五个（在售优先，按 sortNo 已由后端排好）
const quickGoods = computed(() => defaultGoods.value
  .filter((g) => g.onSale !== 0)
  .slice(0, 5)
  .map((g) => ({ ...g, quickKey: 'default-' + g.id })));
// Q-08/Q-09/Q-10：快捷填入历史栈，用于撤销/清空，并联动货款估价
const goodsHistory = ref([]);
const canUndo = computed(() => goodsHistory.value.length > 0);

// ---------------------------------------------------------------- 客户检索
const custQ = ref('');
const custSug = ref([]);
const custOpen = ref(false);
const custPicked = ref(null);
const custNew = ref(false);
const newCust = ref({ name: '', phone: '', note: '' });
let custTimer = null;

// ---------------------------------------------------------------- 商家检索
const merQ = ref('');
const merSug = ref([]);
const merOpen = ref(false);
const merPicked = ref(null);
const selectedMerchants = ref([]);
const merAddMode = ref(false);
const merNew = ref(false);
const newMer = ref({ name: '', category: '', phone: '' });
let merTimer = null;

async function searchCust() {
  if (isCustomer.value) return;
  const q = custQ.value.trim();
  try {
    const loader = isRider.value ? api.rCustomerOptions : api.customers;
    custSug.value = await loader(q || undefined);
    custOpen.value = true;
  } catch (e) {
    showError(e);
  }
}

function onCustInput() {
  custNew.value = false;
  custPicked.value = null;
  f.value.customerId = '';
  f.value.addressId = '';
  clearTimeout(custTimer);
  custTimer = setTimeout(searchCust, 260);
}

function pickCust(c) {
  custPicked.value = c;
  f.value.customerId = String(c.id);
  const list = c.addresses || [];
  f.value.addressId = list.length ? String(list[0].id) : '';
  custOpen.value = false;
  custQ.value = '';
}

function clearCust() {
  custPicked.value = null;
  f.value.customerId = '';
  f.value.addressId = '';
  custQ.value = '';
}

async function saveNewCust() {
  if (!newCust.value.name.trim()) {
    showError(new Error('写个称呼，下次找得到人'));
    return;
  }
  if (!/^1\d{10}$/.test(newCust.value.phone.trim())) {
    showError(new Error('手机号要填 11 位'));
    return;
  }
  try {
    const c = await api.createCustomer({
      name: newCust.value.name.trim(),
      phone: newCust.value.phone.trim(),
      note: newCust.value.note.trim(),
    });
    pickCust({
      id: c.id,
      name: newCust.value.name.trim(),
      phone: newCust.value.phone.trim(),
      note: newCust.value.note.trim(),
      addresses: [],
      owedFen: 0,
    });
    custNew.value = false;
    showToast('客户已建档', 'ok');
  } catch (e) {
    showError(e);
  }
}

// ---------------------------------------------------------------- 商家与商品
async function searchMer() {
  const q = merQ.value.trim();
  // Q-02：客户端直接用 profile 带下来的全量商家做本地检索（店名/类目/电话）
  if (isCustomer.value) {
    const list = customerMerchants.value;
    merSug.value = q
      ? list.filter((m) => [m.name, m.category, m.phone].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase())))
      : list;
    merOpen.value = true;
    return;
  }
  try {
    const loader = isRider.value ? api.rMerchants : api.merchants;
    merSug.value = await loader(q || undefined);
    merOpen.value = true;
  } catch (e) {
    showError(e);
  }
}

function onMerInput() {
  merNew.value = false;
  merPicked.value = null;
  f.value.merchantId = '';
  clearTimeout(merTimer);
  merTimer = setTimeout(searchMer, 260);
}

function pickMer(m) {
  if (selectedMerchants.value.some((x) => x.id === m.id)) return;
  selectedMerchants.value.push(m);
  merPicked.value = selectedMerchants.value[0] || m;
  f.value.merchantId = merPicked.value ? String(merPicked.value.id) : '';
  merAddMode.value = false;
  merOpen.value = false;
  merQ.value = '';
}

function toggleCustomerMerchant(m) {
  const i = selectedMerchants.value.findIndex((x) => String(x.id) === String(m.id));
  if (i >= 0) selectedMerchants.value.splice(i, 1);
  else selectedMerchants.value.push(m);
  merPicked.value = selectedMerchants.value[0] || null;
  f.value.merchantId = merPicked.value ? String(merPicked.value.id) : '';
}

function clearMer() {
  merPicked.value = null;
  selectedMerchants.value = [];
  merAddMode.value = false;
  f.value.merchantId = '';
  merQ.value = '';
}

function removeMer(i) {
  selectedMerchants.value.splice(i, 1);
  merPicked.value = selectedMerchants.value[0] || null;
  f.value.merchantId = merPicked.value ? String(merPicked.value.id) : '';
  if (!selectedMerchants.value.length) merAddMode.value = false;
}

async function saveNewMer() {
  if (!newMer.value.name.trim()) {
    showError(new Error('店名必填'));
    return;
  }
  try {
    const m = await api.saveMerchant({
      name: newMer.value.name.trim(),
      category: newMer.value.category.trim(),
      phone: newMer.value.phone.trim(),
    });
    pickMer(m);
    merNew.value = false;
    showToast('商家已建档', 'ok');
  } catch (e) {
    showError(e);
  }
}

function appendGoods(g) {
  const text = g.name + (g.spec ? '（' + g.spec + '）' : '');
  const cur = f.value.goodsText.trim();
  const addFen = Number(g.estPriceFen) || 0;
  const nextEst = addFen ? fmtYuan(parseYuan(f.value.estYuan) + addFen) : f.value.estYuan;
  // 记录这一步的增量，供撤销/清空时连同货款估价一起回滚
  goodsHistory.value.push({
    prevText: f.value.goodsText,
    prevEst: f.value.estYuan,
    hadText: Boolean(cur),
    addFen,
  });
  f.value.goodsText = (cur ? cur + '，' : '') + text;
  if (addFen) f.value.estYuan = nextEst;
}

function undoGoods() {
  const step = goodsHistory.value.pop();
  if (!step) return;
  f.value.goodsText = step.prevText;
  if (step.addFen) f.value.estYuan = step.prevEst;
}

function clearGoods() {
  if (!f.value.goodsText.trim() && !parseYuan(f.value.estYuan)) return;
  goodsHistory.value = [];
  f.value.goodsText = '';
  f.value.estYuan = '';
}

// ---------------------------------------------------------------- 附件与金额
function addFiles(ev) {
  const list = Array.from(ev.target.files || []);
  for (const file of list) {
    if (files.value.length >= 9) {
      showToast('最多 9 个附件');
      break;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast(file.name + ' 超过 8MB，跳过');
      continue;
    }
    files.value.push({ file, name: file.name });
  }
  ev.target.value = '';
}

function removeFile(i) {
  files.value.splice(i, 1);
}

function sanitizeMoney(v) {
  let s = String(v == null ? '' : v).trim().replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  const parts = s.split('.');
  if (parts[0].length > 8) parts[0] = parts[0].slice(0, 8);
  if (parts.length > 1 && parts[1].length > 2) parts[1] = parts[1].slice(0, 2);
  return parts.join('.');
}

function onEstInput() {
  f.value.estYuan = sanitizeMoney(f.value.estYuan);
}

function onFeeInput() {
  f.value.feeYuan = sanitizeMoney(f.value.feeYuan);
}

function moneyInvalid(text, label) {
  const s = String(text == null ? '' : text).trim();
  if (s === '') return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) return label + ' 格式不对，只能填数字、最多两位小数';
  return null;
}

function fallbackFeeFen() {
  return Number((props.customerProfile && props.customerProfile.defaultFeeFen) ?? 1000);
}

function feeOf(type) {
  return type && type.baseFeeFen != null ? Number(type.baseFeeFen) : fallbackFeeFen();
}

function applyServiceFee() {
  const type = serviceTypes.value.find((s) => s.code === f.value.serviceType);
  f.value.feeYuan = fmtYuan(feeOf(type));
}

function onServiceChange() {
  clearMer();
  f.value.estYuan = '';
  goodsHistory.value = [];
  applyServiceFee();
  emit('service-change', f.value.serviceType);
}

// ---------------------------------------------------------------- 提交
async function save() {
  if (busy.value) return null;
  if (!f.value.customerId || !custPicked.value) {
    showError(new Error(isCustomer.value ? '客户资料还没有加载完成' : '先选客户，或当场新建一个'));
    return null;
  }
  if (!f.value.goodsText.trim()) {
    showError(new Error('请写清楚本次要买什么或办理什么'));
    return null;
  }
  if (isAdmin.value && f.value.sourceChannel === 'other' && !f.value.sourceChannelNote.trim()) {
    showError(new Error('请填写其他联系渠道'));
    return null;
  }
  const requiredDetails = {
    pickup: ['pickupAddress', 'deliveryAddress', 'itemDescription'],
    errand: ['taskDescription', 'serviceAddress'],
    transfer: ['pickupAddress', 'destination', 'scheduledAt'],
    driver: ['pickupAddress', 'destination', 'scheduledAt', 'vehiclePlate'],
  }[f.value.serviceType] || [];
  if (requiredDetails.some((key) => !String(f.value.serviceDetails[key] || '').trim())) {
    showError(new Error('请补全本项服务的必填信息'));
    return null;
  }
  const errEst = moneyInvalid(f.value.estYuan, isBuy.value ? '货款估价' : '其他代垫费用');
  if (errEst) { showError(new Error(errEst)); return null; }
  const errFee = moneyInvalid(f.value.feeYuan, feeLabel(f.value.serviceType));
  if (errFee) { showError(new Error(errFee)); return null; }
  if (!f.value.addressId && !f.value.address.trim()) {
    showError(new Error('请选择旧地址，或填写一个新地址'));
    return null;
  }

  busy.value = true;
  try {
    const merchantIds = isBuy.value ? selectedMerchants.value.map((m) => Number(m.id)) : [];
    const base = {
      customerId: Number(f.value.customerId),
      serviceType: f.value.serviceType,
      serviceDetails: f.value.serviceDetails,
      goodsText: f.value.goodsText.trim(),
      goodsEstFen: parseYuan(f.value.estYuan),
      serviceFeeFen: parseYuan(f.value.feeYuan),
      // Q-03：商家可留空，无商家时传 null 而不是 Number('')=0
      merchantId: merchantIds.length ? Number(f.value.merchantId) : null,
      merchantIds,
      ...(isAdmin.value ? { sourceChannel: f.value.sourceChannel, sourceChannelNote: f.value.sourceChannelNote } : {}),
    };
    let o;
    if (isCustomer.value) {
      let addressId = Number(f.value.addressId) || null;
      if (!addressId) {
        const a = await api.cAddAddress({
          address: f.value.address.trim(),
          isDefault: !(custPicked.value.addresses || []).length,
        });
        addressId = a.id;
      }
      o = await api.cCreate({ ...base, addressId });
    } else {
      if (f.value.addressId) base.addressId = Number(f.value.addressId);
      else base.address = f.value.address.trim();
      if (isRider.value) {
        o = await api.rCreate({ ...base, assignSelf: f.value.assignSelf !== 'none' });
      } else {
        o = await api.createOrder({
          ...base,
          source: 'phone',
          riderId: f.value.riderId ? Number(f.value.riderId) : null,
        });
      }
    }

    let failed = 0;
    let firstErr = '';
    if (isAdmin.value) {
      for (const item of files.value) {
        try {
          await api.uploadForAdmin(item.file, 'order', o.id);
        } catch (e) {
          failed += 1;
          if (!firstErr) firstErr = item.name + '：' + (e.message || e);
        }
      }
    }
    const assigned = isRider.value ? f.value.assignSelf !== 'none' : Boolean(f.value.riderId);
    const message = isCustomer.value
      ? '已提交 ' + o.orderNo + '，等老板派单'
      : (isAdmin.value ? '已录单 ' : '已下单 ') + o.orderNo + (assigned ? '，进入取货中' : '，待指派骑手');
    showToast(message + (failed ? '；' + failed + ' 个附件没传上（' + firstErr + '）' : ''), failed ? '' : 'ok');
    emit('saved', o);
    return o;
  } catch (e) {
    showError(e);
    return null;
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    const typeLoader = isCustomer.value
      ? () => Promise.resolve((props.customerProfile && props.customerProfile.serviceTypes) || [])
      : isRider.value ? api.rServiceTypes : api.serviceTypes;
    const goodsLoader = isCustomer.value
      ? () => Promise.resolve((props.customerProfile && props.customerProfile.defaultGoods) || [])
      : isRider.value ? api.rDefaultGoods : api.defaultGoods;
    const [st, dg] = await Promise.all([typeLoader(), goodsLoader()]);
    serviceTypes.value = st || [];
    defaultGoods.value = dg || [];
    if (!serviceTypes.value.some((s) => s.code === f.value.serviceType) && serviceTypes.value.length) {
      f.value.serviceType = serviceTypes.value[0].code;
    }
    applyServiceFee();
    emit('service-change', f.value.serviceType);

    if (isCustomer.value) {
      const p = props.customerProfile;
      custPicked.value = {
        id: p.customerId,
        name: p.name,
        phone: p.phone,
        owedFen: p.owedFen,
        addresses: p.addresses || [],
      };
      f.value.customerId = String(p.customerId);
      if (p.addresses && p.addresses.length) f.value.addressId = String(p.addresses[0].id);
      // Q-03：商家可留空，不再默认帮客户选中第一家
    } else {
      if (isAdmin.value) riders.value = (await api.riders()) || [];
    }
  } catch (e) {
    showError(e);
  }
});

onBeforeUnmount(() => {
  clearTimeout(custTimer);
  clearTimeout(merTimer);
});

function selectService(code) {
  if (!serviceTypes.value.some((s) => s.code === code)) return;
  f.value.serviceType = code;
  onServiceChange();
}
defineExpose({ save, busy, selectService });
</script>

<template>
  <div class="order-form" :class="{ 'order-form-inline': inline }">
    <div v-if="!hideServiceSelect" class="field">
      <label class="fl">服务类型</label>
      <select v-model="f.serviceType" @change="onServiceChange">
        <option v-for="s in serviceTypes" :key="s.code" :value="s.code">{{ s.name }} · ¥{{ fmtYuan(feeOf(s)) }}</option>
      </select>
      <span class="badge ghost" style="margin-left:6px">{{ orderTypeLabel(f.serviceType) }}</span>
    </div>

    <div class="grid2">
      <div class="field">
        <label class="fl">客户</label>
        <div class="picker">
          <div v-if="custPicked" class="picked">
            <b>{{ custPicked.name }}</b>
            <span class="small muted">{{ custPicked.phone }}</span>
            <span v-if="owed > 0" class="badge amber">已欠 {{ fmtYuan(owed) }}</span>
            <span class="grow"></span>
            <button v-if="!isCustomer" type="button" class="btn sm" @click="clearCust">换一个</button>
            <span v-else class="badge ghost">本人</span>
          </div>
          <template v-else>
            <input v-model="custQ" placeholder="姓名 / 手机号 / 备注" @input="onCustInput" @focus="custQ && searchCust()">
            <div v-if="custOpen && custSug.length" class="sug">
              <button v-for="c in custSug" :key="c.id" type="button" @click="pickCust(c)">
                <b>{{ c.name }}</b>
                <span class="muted small">{{ c.phone }}</span>
                <span v-if="c.owedFen > 0" class="badge amber">欠 {{ fmtYuan(c.owedFen) }}</span>
                <div v-if="c.note" class="small muted">{{ c.note }}</div>
              </button>
            </div>
            <div v-else-if="custOpen" class="sug empty">没搜到{{ isAdmin ? '，点下面「新客」建档' : '，请换个关键词' }}</div>
            <button v-if="isAdmin" type="button" class="btn sm addnew" @click="custNew = !custNew; custOpen = false">
              {{ custNew ? '收起' : '＋ 新客' }}
            </button>
          </template>
        </div>
        <div v-if="isAdmin && custNew && !custPicked" class="subpanel">
          <div class="row">
            <input v-model="newCust.name" placeholder="称呼，如：刘姐">
            <input v-model="newCust.phone" placeholder="手机号（11 位）" inputmode="tel" maxlength="11">
          </div>
          <input v-model="newCust.note" placeholder="备注：门禁、习惯（选填）" style="margin-top:6px">
          <div class="row" style="margin-top:8px">
            <button type="button" class="btn pri sm" @click="saveNewCust">保存并选中</button>
            <button type="button" class="btn sm" @click="custNew = false">取消</button>
          </div>
        </div>
      </div>

      <!-- Q-04：客户地址紧跟客户，在商家之前（一行填完，不再拆分） -->
      <div class="field order-form-wide">
        <label class="fl">客户地址 / 服务落点</label>
        <div v-if="custPicked && custPicked.addresses && custPicked.addresses.length" class="chips" style="margin-bottom:8px">
          <button
            v-for="a in custPicked.addresses" :key="a.id" type="button" class="chip"
            :class="{ on: String(f.addressId) === String(a.id) }"
            @click="f.addressId = String(a.id)"
          >{{ a.address }}</button>
          <button type="button" class="chip" :class="{ on: f.addressId === '' }" @click="f.addressId = ''">＋ 用新地址</button>
        </div>
        <div v-if="!f.addressId" class="row">
          <input v-model="f.address" placeholder="一行填完：小区、门牌、楼层（必填）">
        </div>
      </div>

      <div v-if="isBuy" class="field">
        <label class="fl">购买商家（可多选）</label>
        <div v-if="isCustomer" class="picker">
          <input v-model="merQ" placeholder="搜店名 / 类目 / 电话（可多选）" @input="onMerInput" @focus="merQ && searchMer()">
          <div v-if="merOpen && merSug.length" class="sug">
            <button v-for="m in merSug" :key="m.id" type="button" @click="toggleCustomerMerchant(m)">
              <b>{{ m.name }}</b>
              <span class="muted small">{{ m.category || '未分类' }}</span>
              <span v-if="selectedMerchants.some((x) => String(x.id) === String(m.id))" class="badge green">已选</span>
              <div v-if="m.phone" class="small muted">{{ m.phone }}</div>
            </button>
          </div>
          <div v-else-if="merOpen && !merSug.length" class="sug empty">没搜到，换个关键词试试</div>
          <div class="chips" style="margin-top:8px">
            <button
              v-for="m in selectedMerchants" :key="m.id" type="button" class="chip on"
              @click="toggleCustomerMerchant(m)"
            >{{ m.name }}<span class="x">×</span></button>
          </div>
          <div class="small muted" style="margin-top:6px">已选 {{ selectedMerchants.length }} 家，可不选；跨店购买可继续点选。</div>
        </div>
        <div v-else class="picker">
          <div v-if="selectedMerchants.length && !merAddMode" class="picked" style="flex-wrap:wrap">
            <span v-for="(m, i) in selectedMerchants" :key="m.id" class="chip on" style="max-width:100%">
              {{ m.name }}<button type="button" class="x" @click="removeMer(i)">×</button>
            </span>
            <span class="small muted">{{ selectedMerchants.length }} 家</span>
            <span class="grow"></span>
            <button type="button" class="btn pri sm" @click="merAddMode = true">＋ 加商家</button>
            <button type="button" class="btn sm" @click="clearMer">重选</button>
          </div>
          <template v-else>
            <input
              v-model="merQ"
              :placeholder="merAddMode ? '继续搜第二家店名 / 类目 / 电话' : '店名 / 类目 / 电话'"
              @input="onMerInput"
              @focus="merQ && searchMer()"
            >
            <div v-if="merAddMode" class="small muted" style="margin:4px 0">已选 {{ selectedMerchants.length }} 家，继续搜索即可追加。</div>
            <div v-if="merOpen && merSug.length" class="sug">
              <button v-for="m in merSug" :key="m.id" type="button" @click="pickMer(m)">
                <b>{{ m.name }}</b>
                <span class="muted small">{{ m.category || '未分类' }}</span>
                <div v-if="m.phone" class="small muted">{{ m.phone }}</div>
              </button>
            </div>
            <div v-else-if="merOpen" class="sug empty">没搜到{{ isAdmin ? '，点下面「新商家」建档' : '，请换个关键词' }}</div>
            <div class="row" style="margin-top:6px">
              <button v-if="isAdmin" type="button" class="btn sm addnew" @click="merNew = !merNew; merOpen = false">
                {{ merNew ? '收起' : '＋ 新商家' }}
              </button>
              <button v-if="merAddMode" type="button" class="btn sm" @click="merAddMode = false">完成添加</button>
              <button v-if="merAddMode && selectedMerchants.length" type="button" class="btn sm" @click="clearMer">清空重选</button>
            </div>
          </template>
        </div>
        <div v-if="isAdmin && merNew" class="subpanel">
          <div class="row">
            <input v-model="newMer.name" placeholder="店名">
            <input v-model="newMer.category" placeholder="类目，如：超市" style="width:120px">
          </div>
          <input v-model="newMer.phone" placeholder="门店电话（选填）" style="margin-top:6px">
          <div class="row" style="margin-top:8px">
            <button type="button" class="btn pri sm" @click="saveNewMer">保存并选中</button>
            <button type="button" class="btn sm" @click="merNew = false">取消</button>
          </div>
        </div>
      </div>

      <div v-if="!isBuy" class="field order-form-wide">
        <label class="fl">{{ svcName }}服务信息</label>
        <div v-if="f.serviceType === 'pickup'" class="grid2">
          <input v-model="f.serviceDetails.pickupAddress" placeholder="取件地址（必填）">
          <input v-model="f.serviceDetails.deliveryAddress" placeholder="送达地址（必填）">
          <input v-model="f.serviceDetails.itemDescription" placeholder="物品说明（必填）">
        </div>
        <div v-else-if="f.serviceType === 'errand'" class="grid2">
          <input v-model="f.serviceDetails.taskDescription" placeholder="代办事项（必填）">
          <input v-model="f.serviceDetails.serviceAddress" placeholder="办理地点（必填）">
        </div>
        <div v-else class="grid2">
          <input v-model="f.serviceDetails.pickupAddress" placeholder="出发地点（必填）">
          <input v-model="f.serviceDetails.destination" placeholder="目的地（必填）">
          <input v-model="f.serviceDetails.scheduledAt" type="datetime-local" aria-label="预约时间">
          <input v-if="f.serviceType === 'driver'" v-model="f.serviceDetails.vehiclePlate" placeholder="车牌号（必填）">
        </div>
      </div>

      <div class="field order-form-wide">
        <label class="fl">{{ isBuy ? '买什么（照客户原话记）' : '服务摘要' }}</label>
        <textarea v-model="f.goodsText" rows="3" :placeholder="isBuy ? '例：3 个西瓜 + 一提抽纸' : '简要描述本次服务内容'"></textarea>
      </div>

      <div v-if="isBuy && quickGoods.length" class="field order-form-wide">
        <label class="fl">默认商品（点一下加进清单，最多显示 5 个）</label>
        <div class="chips">
          <button v-for="g in quickGoods" :key="g.quickKey" type="button" class="chip" @click="appendGoods(g)">
            {{ g.name }}<template v-if="g.spec">（{{ g.spec }}）</template><template v-if="g.estPriceFen"> · {{ fmtYuan(g.estPriceFen) }}</template>
          </button>
        </div>
        <div class="row" style="margin-top:8px">
          <button type="button" class="btn sm" :disabled="!canUndo" @click="undoGoods">↶ 撤销上一次</button>
          <button type="button" class="btn sm" @click="clearGoods">清空填入</button>
          <span class="small muted">撤销/清空会连同商品估价一起回退</span>
        </div>
      </div>

      <div class="field">
        <label class="fl">{{ isBuy ? '商品估价（元）' : '其他代垫费用（元）' }}</label>
        <input v-model="f.estYuan" inputmode="decimal" placeholder="0" @input="onEstInput">
      </div>
      <div class="field">
        <label class="fl">{{ feeLabel(f.serviceType) }}（元）</label>
        <input v-model="f.feeYuan" inputmode="decimal" :readonly="isCustomer" @input="onFeeInput">
        <div v-if="isCustomer" class="hint">按所选服务类型的基础费用自动计算。</div>
      </div>

      <div v-if="isAdmin" class="field order-form-wide">
        <label class="fl">联系渠道（选填）</label>
        <div class="grid2">
          <select v-model="f.sourceChannel">
            <option value="">未记录</option>
            <option value="customer_call">客户来电</option>
            <option value="customer_wechat">客户微信</option>
            <option value="merchant_call">商家来电</option>
            <option value="merchant_wechat">商家微信</option>
            <option value="other">其他</option>
          </select>
          <input v-if="f.sourceChannel === 'other'" v-model="f.sourceChannelNote" maxlength="128" placeholder="请填写其他渠道">
        </div>
      </div>
      <div v-if="isAdmin" class="field order-form-wide">
        <label class="fl">附件（选填，图片或语音，最多 9 个）</label>
        <input type="file" multiple accept="image/*,audio/*,.webp" @change="addFiles">
        <div v-if="files.length" class="chips" style="margin-top:6px">
          <span v-for="(it, i) in files" :key="i" class="chip on">
            {{ it.name }}<button type="button" class="x" @click="removeFile(i)">×</button>
          </span>
        </div>
      </div>

      <div v-if="isAdmin" class="field order-form-wide">
        <label class="fl">谁去送（不选则停在「待派单」）</label>
        <div class="chips">
          <button
            v-for="r in riders" :key="r.userId" type="button" class="chip"
            :class="{ on: String(f.riderId) === String(r.userId) }"
            @click="f.riderId = String(f.riderId) === String(r.userId) ? '' : r.userId"
          >{{ r.name }}</button>
          <button type="button" class="chip" :class="{ on: f.riderId === '' }" @click="f.riderId = ''">先不指派</button>
        </div>
      </div>
      <div v-else-if="isRider" class="field order-form-wide">
        <label class="fl">派单方式</label>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: f.assignSelf === 'self' }" @click="f.assignSelf = 'self'">指派自己（直接取货中）</button>
          <button type="button" class="chip" :class="{ on: f.assignSelf === 'none' }" @click="f.assignSelf = 'none'">先不指派</button>
        </div>
      </div>
    </div>

    <div class="shared-form-total">
      <span class="badge ghost">来源：{{ sourceLabel }}</span>
      <span class="muted">本单预估 <b class="num">¥{{ fmtYuan(estTotal) }}</b></span>
    </div>
    <button v-if="inline" class="mbtn order-form-submit" type="button" :disabled="busy" @click="save">提交订单</button>
    <div v-if="inline" class="small muted center" style="margin-top:8px">货款以商家小票实付为准，多退少补，订单里能看到小票照片。</div>
  </div>
</template>

<style scoped>
.order-form-wide { grid-column: 1 / -1; }
.picker { position: relative; }
.picker > input { width: 100%; }
.picked {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--brand-soft);
}
.sug {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 40;
  background: #fff; border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(13, 14, 17, .12); max-height: 260px; overflow: auto;
}
.sug button {
  display: block; width: 100%; text-align: left; padding: 8px 12px;
  border: 0; background: #fff; cursor: pointer; font: inherit;
  border-bottom: 1px solid var(--line);
}
.sug button:last-child { border-bottom: 0; }
.sug button:hover { background: var(--brand-soft); }
.sug button b { margin-right: 6px; }
.sug.empty { padding: 10px 12px; color: var(--muted); font-size: 12.5px; }
.addnew { margin-top: 6px; }
.subpanel {
  margin-top: 8px; padding: 10px; border: 1px dashed var(--line);
  border-radius: 10px; background: #fbfaf6;
}
.chip .x {
  border: 0; background: transparent; cursor: pointer; font-size: 14px;
  line-height: 1; margin-left: 4px; color: var(--muted);
}
.order-form-submit { margin-top: 14px; }
input[readonly] { background: var(--cream); color: var(--ink); }
</style>
