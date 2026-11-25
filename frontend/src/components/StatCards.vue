<script setup>
defineProps({
  items: { type: Array, default: () => [] },
});
</script>

<template>
  <div class="p-kpis" :class="{ three: items.length === 3 }">
    <div v-for="item in items" :key="item.label" class="p-kpi" :class="item.tone || ''">
      <div class="k">{{ item.label }}</div>
      <div class="v" :style="item.color ? { color: item.color } : null">{{ item.value }}</div>
      <div v-if="item.foot" class="f">{{ item.foot }}</div>
    </div>
  </div>
</template>
