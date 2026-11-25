import { reactive, computed } from 'vue';
import { api } from '../api';
import { STATUS_COLOR } from '../api/format';

/**
 * 状态机列数和顺序由后端 GET /api/admin/statuses 决定，前端不复制一份枚举，
 * 免得两边各改一列变成"界面上点不出这一步"。
 */
export const store = reactive({ list: [], loaded: false, loading: false, error: '' });

export async function loadStatuses(force = false) {
  if (store.loaded && !force) return store.list;
  store.loading = true;
  try {
    const rows = await api.statuses();
    store.list = (rows || []).map((r) => ({
      code: r.code,
      label: r.label,
      terminal: String(r.terminal) === 'true',
      color: STATUS_COLOR[r.code] || 'slate',
    }));
    store.loaded = true;
    store.error = '';
  } catch (e) {
    store.error = e.message;
  } finally {
    store.loading = false;
  }
  return store.list;
}

export function labelOf(code) {
  const hit = store.list.filter((s) => s.code === code)[0];
  return hit ? hit.label : code;
}

export function colorOf(code) {
  return STATUS_COLOR[code] || 'slate';
}

export function isTerminal(code) {
  const hit = store.list.filter((s) => s.code === code)[0];
  return hit ? hit.terminal : code === 'FINISHED' || code === 'CANCELLED';
}

export function nextStates(code) {
  return NEXT[code] || [];
}

/** 后端 OrderStatus.TRANSITIONS 的镜像：界面只按这张表给按钮，非法动作根本不出现。 */
const NEXT = {
  PENDING: ['PICKING', 'CANCELLED'],
  PICKING: ['DELIVERING', 'CANCELLED'],
  DELIVERING: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
};

export function useStatusList() {
  return computed(() => store.list);
}
