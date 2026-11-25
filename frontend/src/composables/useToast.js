import { reactive } from 'vue';

/** 全站提示条：后端的中文拒绝语一定要让用户看见，不能只 console.error。 */
export const toast = reactive({ text: '', kind: '', on: false });

let timer = null;

export function showToast(msg, kind) {
  toast.text = msg || '';
  toast.kind = kind || '';
  toast.on = true;
  clearTimeout(timer);
  timer = setTimeout(() => { toast.on = false; }, 2600);
}

export function showError(e) {
  showToast((e && e.message) ? e.message : String(e), 'err');
}
