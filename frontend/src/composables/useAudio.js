import { ref } from 'vue';

/**
 * 提示音。浏览器硬性规定：没有用户手势之前 AudioContext 是 suspended，声音放不出来。
 * 所以页面上必须留一个「声音自检」按钮，并且把这条限制讲明白 —— 不能只靠听声音。
 */
let actx = null;
export const audioArmed = ref(false);

export function armAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no AudioContext');
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    audioArmed.value = true;
    return true;
  } catch (e) {
    audioArmed.value = false;
    return false;
  }
}

export function beep(n = 2) {
  if (!audioArmed.value || !actx) return false;
  for (let i = 0; i < n; i++) {
    const t = actx.currentTime + i * 0.26;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(i % 2 ? 880 : 1320, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + 0.24);
  }
  try {
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  } catch (e) { /* 桌面浏览器没有震动，忽略 */ }
  return true;
}
