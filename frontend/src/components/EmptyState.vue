<script setup>
defineProps({
  kind: { type: String, default: 'orders' },
  title: { type: String, default: '暂无数据' },
  text: { type: String, default: '' },
});
</script>

<template>
  <div class="p-card shared-empty">
    <div class="p-empty">
      <img class="empty-art" :src="'/brand/empty-' + kind + '.svg'" alt="">
      <b>{{ title }}</b>
      <span v-if="text">{{ text }}</span>
      <slot />
    </div>
  </div>
</template>
