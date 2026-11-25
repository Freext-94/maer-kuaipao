<script setup>
import { RouterLink } from 'vue-router';

const props = defineProps({
  title: { type: String, default: '马儿快跑' },
  tabs: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  showLogout: { type: Boolean, default: true },
});

const emit = defineEmits(['select', 'logout']);

function isActive(tab) {
  return props.active === (tab.to || tab.key);
}
</script>

<template>
  <div class="m-app">
    <header class="p-topbar">
      <img class="p-topbar-logo" src="/brand/logo-card-256.png" alt="马儿快跑">
      <div class="p-topbar-main">
        <div class="p-topbar-title">{{ title }}</div>
      </div>
      <slot name="actions" />
      <button v-if="showLogout" class="p-topbar-logout" type="button" @click="emit('logout')">退出</button>
    </header>

    <main class="p-screen">
      <slot />
    </main>

    <nav v-if="tabs.length" class="p-tabbar" aria-label="主导航">
      <template v-for="tab in tabs" :key="tab.to || tab.key">
        <RouterLink v-if="tab.to" :to="tab.to" :class="{ on: isActive(tab) }">
          <img v-if="tab.icon && tab.icon.startsWith('/')" class="tab-icon" :src="tab.icon" alt="">
          <span v-else class="ic">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </RouterLink>
        <button v-else type="button" :class="{ on: isActive(tab) }" @click="emit('select', tab.key)">
          <img v-if="tab.icon && tab.icon.startsWith('/')" class="tab-icon" :src="tab.icon" alt="">
          <span v-else class="ic">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </template>
    </nav>

    <slot name="fab" />
  </div>
</template>
