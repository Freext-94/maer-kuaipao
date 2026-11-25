<script setup>
import { toast } from '../composables/useToast';
</script>

<template>
  <div id="toast" :class="[toast.kind, { on: toast.on }]">
    <div class="in">{{ toast.text }}</div>
  </div>
</template>
