<script setup>
import { computed } from 'vue';

const props = defineProps({
  from: { type: String, required: true },
  to: { type: String, required: true },
  loading: { type: Boolean, default: false },
  note: { type: String, default: '按客户统计 · 日期区间最多 12 个月' },
  presets: {
    type: Array,
    default: () => [
      { value: 'month', label: '本月' },
      { value: 'lastMonth', label: '上月' },
    ],
  },
});
const emit = defineEmits(['update:from', 'update:to', 'change']);

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function presetRange(value) {
  const today = new Date();
  if (value === 'clear') return ['', ''];
  if (value === 'today') return [ymd(today), ymd(today)];
  if (value === 'last7' || value === 'last30') {
    const first = new Date(today);
    first.setDate(first.getDate() - (value === 'last7' ? 6 : 29));
    return [ymd(first), ymd(today)];
  }
  const first = value === 'lastMonth'
    ? new Date(today.getFullYear(), today.getMonth() - 1, 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const last = value === 'lastMonth'
    ? new Date(today.getFullYear(), today.getMonth(), 0)
    : today;
  return [ymd(first), ymd(last)];
}

const kind = computed(() => {
  for (const preset of props.presets) {
    const [first, last] = presetRange(preset.value);
    if (props.from === first && props.to === last) return preset.value;
  }
  return '';
});

function applyPreset(value) {
  const [first, last] = presetRange(value);
  emit('update:from', first);
  emit('update:to', last);
  emit('change');
}
</script>

<template>
  <div class="p-card shared-range">
    <div class="p-filters">
      <button
        v-for="preset in presets"
        :key="preset.value"
        class="chip"
        :class="{ on: kind === preset.value }"
        type="button"
        @click="applyPreset(preset.value)"
      >{{ preset.label }}</button>
      <input :value="from" type="date" aria-label="开始日期" @change="emit('update:from', $event.target.value)">
      <span class="p-small p-muted">至</span>
      <input :value="to" type="date" aria-label="结束日期" @change="emit('update:to', $event.target.value)">
      <button class="btn sm pri" type="button" :disabled="loading" @click="emit('change')">查询</button>
    </div>
    <div class="p-small p-muted shared-range-note">{{ note }}</div>
  </div>
</template>
