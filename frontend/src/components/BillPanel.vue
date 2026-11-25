<script setup>
import { computed } from 'vue';
import DateRangeFilter from './DateRangeFilter.vue';
import StatCards from './StatCards.vue';
import EmptyState from './EmptyState.vue';

const props = defineProps({
  from: { type: String, required: true },
  to: { type: String, required: true },
  title: { type: String, default: '' },
  stats: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: '账单加载中…' },
  empty: { type: Boolean, default: false },
  emptyTitle: { type: String, default: '这个区间没有账单' },
  emptyText: { type: String, default: '换个时间范围看看。' },
  rangeNote: { type: String, default: '按客户统计 · 日期区间最多 12 个月' },
  note: { type: String, default: '' },
  hideRange: { type: Boolean, default: false },
});
const emit = defineEmits(['update:from', 'update:to', 'change']);
const rangeLabel = computed(() => (props.from === props.to ? props.from : props.from + ' 至 ' + props.to));
</script>

<template>
  <div>
    <div v-if="title || $slots.actions" class="p-row bill-head">
      <div>
        <b>{{ title }}</b>
        <div class="p-small p-muted">{{ rangeLabel }}</div>
      </div>
      <div v-if="$slots.actions" class="p-right bill-actions"><slot name="actions" /></div>
    </div>

    <DateRangeFilter
      v-if="!hideRange"
      :from="from"
      :to="to"
      :loading="loading"
      :note="rangeNote"
      @update:from="emit('update:from', $event)"
      @update:to="emit('update:to', $event)"
      @change="emit('change')"
    />
    <slot name="toolbar" />
    <StatCards :items="stats" />

    <div v-if="loading" class="p-loading">{{ loadingText }}</div>
    <EmptyState v-else-if="empty" kind="bills" :title="emptyTitle" :text="emptyText" />
    <slot v-else :range-label="rangeLabel" />

    <div v-if="note" class="p-note bill-note">{{ note }}</div>
  </div>
</template>

<style scoped>
.bill-head { margin-bottom: 12px; }
.bill-actions { display: flex; gap: 8px; }
.bill-note { margin-top: 12px; }
</style>
