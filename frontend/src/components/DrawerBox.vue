<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
  title: { type: String, default: '' },
});

const emit = defineEmits(['close']);
const shown = ref(false);

function close() {
  if (!shown.value) return;
  shown.value = false;
  setTimeout(() => emit('close'), 200);
}

onMounted(async () => {
  await nextTick();
  requestAnimationFrame(() => { shown.value = true; });
});

onBeforeUnmount(() => { shown.value = false; });

defineExpose({ close });
</script>

<template>
  <div class="mask" :class="{ on: shown }" @click="close"></div>
  <aside class="drawer" :class="{ on: shown }">
    <div class="hd">
      <h2 style="margin: 0">
        <slot name="title">{{ title }}</slot>
      </h2>
      <div class="right row">
        <slot name="headExtra"></slot>
        <button class="btn sm" type="button" @click="close">关闭</button>
      </div>
    </div>
    <div class="bd"><slot /></div>
    <div v-if="$slots.foot" class="ft"><slot name="foot"></slot></div>
  </aside>
</template>
