<script setup>
import { onMounted, ref } from 'vue';
import OrderBrowser from '../../components/OrderBrowser.vue';
import OrderDrawer from '../../components/OrderDrawer.vue';
import NewOrderModal from '../../components/NewOrderModal.vue';
import { api } from '../../api';
import { fmtMoney } from '../../api/money';
import { sourceLabelOf } from '../../api/format';
import { loadStatuses, store as stStore } from '../../composables/useStatuses';
import { useAuth } from '../../composables/useAuth';

const auth = useAuth();
const browserRef = ref(null);
const openId = ref(null);
const creating = ref(false);

function loadOrders({ from, to, all }) {
  return api.orders(all ? { all: true, limit: 500 } : { from, to, limit: 500 });
}

onMounted(loadStatuses);
</script>

<template>
  <div>
    <OrderBrowser
      ref="browserRef"
      :loader="loadOrders"
      :statuses="stStore.list"
      :page-size="10"
      clickable
      @select="openId = $event.id"
    >
      <template #tags="{ order: o }">
        <span class="badge slate">{{ sourceLabelOf(o) }}</span>
        <span class="badge" :class="o.riderName ? 'ghost' : 'red'">{{ o.riderName || '未指派' }}</span>
        <span v-if="o.advanceFen" class="badge violet">垫付{{ fmtMoney(o.advanceFen) }}</span>
      </template>
    </OrderBrowser>

    <button v-if="auth.can('order.create')" class="p-fab" type="button" @click="creating = true">＋ 电话录单</button>
    <NewOrderModal v-if="creating" @close="creating = false" @saved="creating = false; browserRef.reload()" />
    <OrderDrawer v-if="openId" :order-id="openId" @close="openId = null" @changed="browserRef.reload()" />
  </div>
</template>
