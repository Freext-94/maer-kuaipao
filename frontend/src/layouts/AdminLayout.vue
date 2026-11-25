<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../api';
import { setAuthToken } from '../api/http';
import { showToast } from '../composables/useToast';
import { useAuth } from '../composables/useAuth';

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const TABS = [
  { to: '/admin', label: '工作台', icon: '▦', perm: 'order.view' },
  { to: '/admin/orders', label: '订单', icon: '/brand/tab-order.svg', perm: 'order.view' },
  { to: '/admin/ledger', label: '账单', icon: '/brand/tab-bill.svg', perm: 'money.view' },
  { to: '/admin/users', label: '用户', icon: '/brand/tab-user.svg', perm: 'user.manage' },
  { to: '/admin/settings', label: '设置', icon: '⚙', perm: 'setting.manage' },
];

const health = ref(null);
const booted = ref(false);
let timer = null;

const tabs = computed(() => TABS.filter((t) => auth.can(t.perm)));
const allowed = computed(() => !route.meta.perm || auth.can(route.meta.perm));
const title = computed(() => route.meta.title || '调度台');

async function refreshHealth() {
  if (!auth.me.value) return;
  try {
    health.value = await api.health();
  } catch (e) {
    health.value = null;
  }
}

async function logout() {
  try {
    await api.logout();
  } catch (e) { /* 登不上也要出去 */ }
  setAuthToken('');
  auth.resetAuth();
  showToast('已退出登录');
  router.replace('/login');
}

onMounted(async () => {
  try {
    await auth.loadAuth(true);
  } catch (e) {
    booted.value = true;
    return;
  }
  booted.value = true;
  if (!allowed.value && route.path === '/admin' && tabs.value.length) {
    router.replace(tabs.value[0].to);
  }
  await refreshHealth();
  timer = setInterval(refreshHealth, 15000);
});

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <AppShell :title="title" :tabs="tabs" :active="route.path" @logout="logout">
    <div v-if="!booted" class="p-loading">正在读取账号…</div>

    <div v-else-if="!auth.me.value" class="p-card">
      <div class="p-empty">
        <b>登录状态已失效</b>
        <span>{{ auth.error.value || '请重新登录后再进入调度台' }}</span>
      </div>
      <button class="btn pri block" type="button" @click="router.replace('/login')">去登录</button>
    </div>

    <div v-else-if="!allowed" class="p-card">
      <div class="p-empty">
        <b>没有这一页的权限</b>
        <span>当前账号未被授予「{{ title }}」权限。需要的话请让超级管理员在用户与权限里勾选。</span>
      </div>
      <div v-if="tabs.length" class="p-row wrap" style="justify-content:center">
        <RouterLink v-for="t in tabs" :key="t.to" class="btn sm" :to="t.to">{{ t.label }}</RouterLink>
      </div>
    </div>

    <template v-else>
      <div v-if="health && health.issues && health.issues.length" class="p-alert err" style="margin-bottom:12px">
        <b>台账不平（这是程序问题，不是操作错）：</b>{{ health.issues.join('；') }}
      </div>
      <RouterView />
    </template>
  </AppShell>
</template>
