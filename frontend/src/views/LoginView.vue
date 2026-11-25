<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { setAuthToken } from '../api/http';
import { showError } from '../composables/useToast';

const router = useRouter();
const route = useRoute();
const phone = ref('');
const password = ref('');
const busy = ref(false);

async function submit() {
  if (!phone.value || !password.value) {
    showError(new Error('手机号和密码都要填'));
    return;
  }
  busy.value = true;
  try {
    const d = await api.login(phone.value.trim(), password.value.trim());
    setAuthToken(d.token);
    // 按角色落到对应工作台：管理员进调度台，商家/骑手/客户进各自的端
    const roles = d.roles || [];
    let target = '/admin';
    if (!roles.includes('admin') && !roles.includes('super_admin')) {
      if (roles.includes('merchant')) target = '/m';
      else if (roles.includes('rider')) target = '/r';
      else target = '/c';
    }
    if (route.query.next) target = String(route.query.next);
    router.replace(target);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="m-app login-stage">
    <div class="login-hero">
      <img src="/brand/logo-card-256.png" alt="马儿快跑">
      <h1>马儿快跑</h1>
      <p>同城跑腿 · 自营调度台</p>
    </div>

    <form class="p-card login-card" @submit.prevent="submit">
      <div class="login-card-t">登录</div>
      <p class="p-small p-muted">电话接单仍然保留：老板在这里替客户录单，商家和骑手用手机号登录。</p>
      <div class="field">
        <label class="fl">手机号</label>
        <input v-model="phone" autocomplete="username" inputmode="tel" placeholder="11 位手机号">
      </div>
      <div class="field">
        <label class="fl">密码</label>
        <input v-model="password" type="password" autocomplete="current-password" placeholder="初始密码见部署说明">
      </div>
      <button class="btn pri block" type="submit" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>
      <div class="p-note" style="margin-top:14px">
        第一次登录后请立刻改掉初始密码。商家、骑手、客户都用手机号登录，账号由管理员在「用户」里建。
      </div>
    </form>

    <div class="login-foot">马儿跑得快，诚信赢天下</div>
  </div>
</template>
