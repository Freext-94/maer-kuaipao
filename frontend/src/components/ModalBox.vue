<script setup>
import { ref } from 'vue';

defineProps({
  title: { type: String, default: '' },
  okText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  busy: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  hideOk: { type: Boolean, default: false },
});

const emit = defineEmits(['ok', 'cancel']);
const rootEl = ref(null);
const bodyEl = ref(null);

defineExpose({ rootEl, bodyEl });
</script>

<template>
  <div ref="rootEl" class="modal on" @click.self="emit('cancel')">
    <div class="box" :style="wide ? { width: 'min(760px, 100%)' } : null">
      <div class="hd">{{ title }}</div>
      <div ref="bodyEl" class="bd"><slot /></div>
      <div class="ft">
        <button class="btn" type="button" @click="emit('cancel')">{{ cancelText }}</button>
        <button v-if="!hideOk" class="btn pri" type="button" :disabled="busy" @click="emit('ok')">{{ okText }}</button>
      </div>
    </div>
  </div>
</template>
