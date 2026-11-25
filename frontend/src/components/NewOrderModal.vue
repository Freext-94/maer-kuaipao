<script setup>
import { computed, ref } from 'vue';
import ModalBox from './ModalBox.vue';
import OrderForm from './OrderForm.vue';

const emit = defineEmits(['close', 'saved']);
const props = defineProps({ role: { type: String, default: 'admin' } });
const formRef = ref(null);
const title = computed(() => (props.role === 'admin' ? '电话录单' : '下单'));
</script>

<template>
  <ModalBox
    :title="title"
    ok-text="提交订单"
    :busy="formRef && formRef.busy"
    wide
    @ok="formRef && formRef.save()"
    @cancel="emit('close')"
  >
    <OrderForm ref="formRef" :role="role" @saved="emit('saved', $event)" />
  </ModalBox>
</template>
