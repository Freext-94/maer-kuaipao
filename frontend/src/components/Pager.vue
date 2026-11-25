<script setup>
const props = defineProps({
  modelValue: { type: Number, default: 1 },
  pageCount: { type: Number, default: 1 },
  total: { type: Number, default: null },
  pageSize: { type: Number, default: null },
});
const emit = defineEmits(['update:modelValue']);

function go(page) {
  emit('update:modelValue', Math.max(1, Math.min(props.pageCount, page)));
}
</script>

<template>
  <div class="shared-pager">
    <button class="btn sm" type="button" :disabled="modelValue <= 1" @click="go(1)">首页</button>
    <button class="btn sm" type="button" :disabled="modelValue <= 1" @click="go(modelValue - 1)">上一页</button>
    <span class="p-small p-muted">{{ modelValue }} / {{ pageCount }}<template v-if="total !== null"> · {{ total }} 条</template><template v-if="pageSize !== null"> · {{ pageSize }} 条/页</template></span>
    <button class="btn sm" type="button" :disabled="modelValue >= pageCount" @click="go(modelValue + 1)">下一页</button>
    <button class="btn sm" type="button" :disabled="modelValue >= pageCount" @click="go(pageCount)">尾页</button>
  </div>
</template>
