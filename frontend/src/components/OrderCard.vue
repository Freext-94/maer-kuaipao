<script setup>
import { computed } from 'vue';
import { fmtMoney } from '../api/money';
import { fmtDateTime, STATUS_COLOR, orderTypeLabel } from '../api/format';

const props = defineProps({
  order: { type: Object, required: true },
  clickable: { type: Boolean, default: false },
  hot: { type: Boolean, default: false },
  showCustomer: { type: Boolean, default: true },
  showPayment: { type: Boolean, default: true },
  showDate: { type: Boolean, default: true },
  customerView: { type: Boolean, default: false },
});

const emit = defineEmits(['click']);
const badge = computed(() => STATUS_COLOR[props.order.status] || 'slate');
const address = computed(() => (props.order.address && props.order.address.address) || '');
</script>

<template>
  <component
    :is="clickable ? 'button' : 'article'"
    class="p-order"
    :class="['st-' + badge, { hot, 'p-order-static': !clickable }]"
    :type="clickable ? 'button' : undefined"
    @click="clickable && emit('click', order)"
  >
    <div class="p-order-h">
      <b class="p-order-no p-order-title">{{ order.orderNo }}</b>
      <span class="badge ghost">{{ orderTypeLabel(order.serviceType) }}</span>
      <span class="p-right badge" :class="badge">{{ order.statusLabel }}</span>
    </div>

    <div v-if="showCustomer" class="p-order-sub">
      <b>{{ order.customerName || '客户' }}</b>
      <span class="p-muted"> · {{ order.customerPhone || '无手机号' }}</span>
    </div>
    <div class="p-order-sub p-order-goods">{{ order.goodsText || '—' }}</div>
    <div v-if="order.merchantName || address || showDate" class="p-order-sub">
      <template v-if="order.merchantName">{{ order.merchantName }}</template>
      <template v-if="order.merchantName && address"> → </template>
      <template v-if="address">{{ address }}</template>
      <template v-if="showDate && (order.merchantName || address)"> · </template>
      <template v-if="showDate">{{ fmtDateTime(order.createTime) }}</template>
    </div>

    <slot name="details" :order="order" />

    <div v-if="$slots.tags" class="p-tags">
      <slot name="tags" :order="order" />
    </div>

    <div v-if="showPayment" class="p-order-pay">
      <span>应收 <b class="num">{{ fmtMoney(order.receivableFen) }}</b></span>
      <span v-if="order.owedFen > 0" class="p-order-owed">
        {{ customerView ? '未付' : '未收' }} {{ fmtMoney(order.owedFen) }}
      </span>
      <span v-else class="p-order-paid">{{ customerView ? '已付清' : '已收清' }}</span>
    </div>

    <slot :order="order" />

    <div v-if="$slots.actions" class="p-order-actions">
      <slot name="actions" :order="order" />
    </div>
  </component>
</template>
