<script setup>
import { fmtYuan } from '../api/money';

const props = defineProps({
  types: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  defaultFeeFen: { type: Number, default: 1000 },
});
const emit = defineEmits(['update:modelValue']);

const ICONS = {
  buy: '/brand-kit/icons/service-buy.svg',
  pickup: '/brand-kit/icons/service-pickup.svg',
  errand: '/brand-kit/icons/service-errand.svg',
  transfer: '/brand-kit/icons/service-transfer.svg',
  driver: '/brand-kit/icons/service-driver.svg',
};
const DESCS = {
  buy: '按客户原话去买，垫付货款',
  pickup: '取件、送文件、送钥匙',
  errand: '排队、缴费、办证、取号',
  transfer: '机场、车站、医院、上下学',
  driver: '按起点到终点代驾',
};

function iconOf(s) {
  return s.iconPath || ICONS[s.code] || ICONS.buy;
}
function nameOf(s) {
  return s.code === 'buy' ? '代买跑腿' : s.name;
}
function descOf(s) {
  return DESCS[s.code] || '';
}
function feeFen(s) {
  return s.baseFeeFen != null ? Number(s.baseFeeFen) : props.defaultFeeFen;
}
</script>

<template>
  <div class="svc-grid">
    <button
      v-for="s in types"
      :key="s.code"
      class="svc-card"
      :class="{ on: modelValue === s.code }"
      type="button"
      @click="emit('update:modelValue', s.code)"
    >
      <img class="svc-ic" :src="iconOf(s)" :alt="s.name">
      <span class="svc-name">{{ nameOf(s) }}</span>
      <span class="svc-desc">{{ descOf(s) }}</span>
      <span class="svc-fee">起步 ¥{{ fmtYuan(feeFen(s)) }}</span>
    </button>
  </div>
</template>

<style scoped>
.svc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.svc-card {
  display: flex; flex-direction: column; align-items: flex-start;
  min-width: 0; padding: 13px 14px; text-align: left;
  background: #fff; border: 1px solid #EEE6D6; border-radius: 14px;
}
.svc-card.on { border-color: #F5B301; box-shadow: 0 0 0 2px rgba(245, 179, 1, .18); }
.svc-ic { width: 44px; height: 44px; border-radius: 12px; margin-bottom: 8px; flex: 0 0 auto; }
.svc-name { font-weight: 700; font-size: 15px; color: #1A1A1A; }
.svc-desc { font-size: 12px; color: #8A8578; line-height: 1.45; min-height: 34px; margin-top: 2px; }
.svc-fee { font-size: 12px; color: #8A8578; margin-top: 4px; }
</style>
