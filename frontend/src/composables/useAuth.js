import { computed, ref } from 'vue';
import { api } from '../api';

/**
 * 当前登录者与有效权限码。
 * 前端只负责入口显隐，真正的拦截始终由后端 AuthInterceptor 完成。
 */
const me = ref(null);
const permissions = ref([]);
const loading = ref(false);
const error = ref('');
let inflight = null;

const isSuper = computed(() => ((me.value && me.value.roles) || []).includes('super_admin'));

function can(code) {
  if (!code) return true;
  if (isSuper.value) return true;
  return permissions.value.includes(code);
}

async function loadAuth(force) {
  if (!force && me.value) return me.value;
  if (inflight) return inflight;
  loading.value = true;
  inflight = api.me()
    .then((d) => {
      me.value = d || null;
      permissions.value = (d && d.permissions) || [];
      error.value = '';
      return d;
    })
    .catch((e) => {
      error.value = (e && e.message) || '读取账号信息失败';
      throw e;
    })
    .finally(() => {
      loading.value = false;
      inflight = null;
    });
  return inflight;
}

function resetAuth() {
  me.value = null;
  permissions.value = [];
  error.value = '';
}

export function useAuth() {
  return { me, permissions, loading, error, isSuper, can, loadAuth, resetAuth };
}
