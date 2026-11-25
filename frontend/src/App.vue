<script setup>
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import ToastHost from './components/ToastHost.vue';

const route = useRoute();

const ROLE_TITLE = { '/m': '商家端', '/r': '骑手端', '/c': '客户端' };

watch(
  () => route.path,
  () => {
    const t = route.meta && route.meta.title;
    document.title = (ROLE_TITLE[route.path] ? ROLE_TITLE[route.path] + ' · ' : '马儿快跑 · ') + (t || '调度台');
  },
  { immediate: true },
);
</script>

<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" :key="route.fullPath" />
  </router-view>
  <ToastHost />
</template>
