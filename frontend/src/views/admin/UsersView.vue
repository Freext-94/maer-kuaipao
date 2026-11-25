<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import ModalBox from '../../components/ModalBox.vue';
import Pager from '../../components/Pager.vue';
import { api } from '../../api';
import { fmtDateTime } from '../../api/format';
import { showError, showToast } from '../../composables/useToast';
import { useAuth } from '../../composables/useAuth';

const auth = useAuth();
const users = ref([]);
const categories = ref([]);
const permissionGroups = ref([]);
const permissionIds = ref([]);
const busy = ref(false);
const q = ref('');
const roleFilter = ref('');
const dlg = reactive({ on: false, kind: '' });
const form = reactive({});
const resetDlg = reactive({ on: false, user: null, password: '', busy: false });
const removeDlg = reactive({ on: false, user: null, busy: false });

const ROLE_NAME = { super_admin: '超级管理员', admin: '管理员', rider: '骑手', merchant: '商家', customer: '客户' };
const isSuper = auth.isSuper;
const availableRoles = computed(() => (isSuper.value ? ['admin', 'rider', 'merchant', 'customer'] : ['rider', 'merchant', 'customer']));

const USER_PAGE_SIZE = 10;
const page = ref(1);
const filtered = computed(() => {
  const key = q.value.trim().toLowerCase();
  return users.value.filter((u) => {
    if (roleFilter.value && !(u.roles || []).includes(roleFilter.value)) return false;
    if (!key) return true;
    return [u.name, u.phone, u.merchant && u.merchant.name].join(' ').toLowerCase().includes(key);
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / USER_PAGE_SIZE)));
const pagedUsers = computed(() => filtered.value.slice((page.value - 1) * USER_PAGE_SIZE, page.value * USER_PAGE_SIZE));
watch([q, roleFilter], () => { page.value = 1; });

async function load() {
  try {
    const [us, cats] = await Promise.all([api.users(), api.categories()]);
    users.value = us || [];
    categories.value = cats || [];
    if (page.value > pageCount.value) page.value = pageCount.value;
  } catch (e) {
    showError(e);
  }
}

async function openPermissions() {
  try {
    const [groups, granted] = await Promise.all([api.permissions(), api.grantedPermissions()]);
    permissionGroups.value = groups || [];
    permissionIds.value = granted || [];
    dlg.kind = 'permissions';
    dlg.on = true;
  } catch (e) {
    showError(e);
  }
}

async function savePermissions() {
  busy.value = true;
  try {
    await api.saveGrantedPermissions(permissionIds.value);
    dlg.on = false;
    await auth.loadAuth(true);
    showToast('管理员权限已更新，导航已刷新', 'ok');
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

function togglePermission(id) {
  const i = permissionIds.value.indexOf(id);
  if (i >= 0) permissionIds.value.splice(i, 1);
  else permissionIds.value.push(id);
}

function open(kind, seed) {
  Object.keys(form).forEach((k) => delete form[k]);
  Object.assign(form, seed || {});
  dlg.kind = kind;
  dlg.on = true;
}

function toggleRole(r) {
  const arr = form.roles || (form.roles = []);
  const i = arr.indexOf(r);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(r);
}

function hasRole(r) {
  return (form.roles || []).includes(r);
}

function toggleCategory(code) {
  const arr = form.categories || (form.categories = []);
  const i = arr.indexOf(code);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(code);
}

async function saveUser() {
  if (!form.name || !form.name.trim()) {
    showError(new Error('称呼必填'));
    return;
  }
  if (!form.phone || !/^1\d{10}$/.test(form.phone)) {
    showError(new Error('手机号要填 11 位'));
    return;
  }
  if (!form.id && (!form.password || !form.password.trim())) {
    showError(new Error('要设一个初始密码'));
    return;
  }
  if (hasRole('merchant') && !form.merchantName) {
    showError(new Error('勾了商家，要填店名'));
    return;
  }
  if (hasRole('merchant') && !(form.categories && form.categories.length)) {
    showError(new Error('商家至少选一个类目'));
    return;
  }
  busy.value = true;
  try {
    const body = {
      name: form.name.trim(),
      phone: form.phone,
      roles: form.roles || [],
      status: form.status || 'active',
      customerNote: form.customerNote || '',
      customerAddress: form.customerAddress || '',
    };
    let uid = form.id;
    if (uid) {
      await api.updateUser(uid, body);
    } else {
      body.password = form.password;
      const created = await api.saveUser(body);
      uid = created && created.id;
    }
    if (hasRole('merchant') && form.merchantName && uid) {
      await api.updateUser(uid, {
        ...body,
        merchant: {
          name: form.merchantName,
          categories: form.categories,
          phone: form.merchantPhone || form.phone,
          address: form.merchantAddress || '',
        },
      });
    }
    dlg.on = false;
    showToast('已保存', 'ok');
    await load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

function openReset(u) {
  resetDlg.user = u;
  resetDlg.password = '';
  resetDlg.on = true;
}

async function confirmReset() {
  if (!resetDlg.password || resetDlg.password.trim().length < 6) {
    showError(new Error('新密码至少 6 位'));
    return;
  }
  resetDlg.busy = true;
  try {
    await api.resetPassword(resetDlg.user.id, resetDlg.password.trim());
    resetDlg.on = false;
    showToast('密码已重置', 'ok');
  } catch (e) {
    showError(e);
  } finally {
    resetDlg.busy = false;
  }
}

function openRemove(u) {
  removeDlg.user = u;
  removeDlg.on = true;
}

async function confirmRemove() {
  removeDlg.busy = true;
  try {
    await api.deleteUser(removeDlg.user.id);
    removeDlg.on = false;
    showToast('用户已删除', 'ok');
    await load();
  } catch (e) {
    showError(e);
  } finally {
    removeDlg.busy = false;
  }
}

function edit(u) {
  form.id = u.id;
  form.name = u.name;
  form.phone = u.phone;
  form.status = u.status;
  form.roles = [...(u.roles || [])];
  form.customerNote = u.customerNote || '';
  form.customerAddress = u.customerAddress || '';
  if (u.merchant) {
    form.merchantName = u.merchant.name;
    form.merchantPhone = u.merchant.phone;
    form.merchantAddress = u.merchant.address;
    form.categories = [...(u.merchant.categories || [])];
  }
  dlg.kind = 'user';
  dlg.on = true;
}

onMounted(load);
</script>

<template>
  <div>
    <div class="p-toolbar">
      <input v-model="q" type="search" placeholder="搜姓名 / 手机号 / 门店">
      <button v-if="isSuper" class="btn sm" type="button" @click="openPermissions">权限矩阵</button>
    </div>

    <div class="p-chips">
      <button class="chip" :class="{ on: roleFilter === '' }" type="button" @click="roleFilter = ''">全部 {{ users.length }}</button>
      <button
        v-for="r in ['admin', 'rider', 'merchant', 'customer']"
        :key="r"
        class="chip"
        :class="{ on: roleFilter === r }"
        type="button"
        @click="roleFilter = r"
      >{{ ROLE_NAME[r] }}</button>
    </div>

    <div v-if="!filtered.length" class="p-card">
      <div class="p-empty"><b>没有匹配的用户</b><span>换个姓名、手机号或角色试试。</span></div>
    </div>
    <template v-else>
      <div v-for="u in pagedUsers" :key="u.id" class="p-card">
        <div class="p-row">
          <b>{{ u.name }}</b>
          <span class="badge" :class="u.status === 'active' ? 'green' : 'red'">{{ u.status === 'active' ? '正常' : '停用' }}</span>
          <span class="p-right p-small p-muted">{{ u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '从未登录' }}</span>
        </div>
        <div class="p-small p-muted" style="margin-top:3px">{{ u.phone }}</div>
        <div class="p-tags">
          <span v-for="r in (u.roles || [])" :key="r" class="badge slate">{{ ROLE_NAME[r] || r }}</span>
        </div>
        <div v-if="u.merchant" class="p-small" style="margin-top:6px">
          门店：{{ u.merchant.name }}<template v-if="u.merchant.address"> · {{ u.merchant.address }}</template>
        </div>
        <div v-if="u.customerId && u.customerNote" class="p-small p-muted" style="margin-top:4px">备注：{{ u.customerNote }}</div>
        <div v-if="u.customerId && u.customerAddress" class="p-small p-muted" style="margin-top:4px">地址：{{ u.customerAddress }}</div>
        <div class="p-row" style="justify-content:flex-end;margin-top:9px;gap:6px">
          <button class="btn sm" type="button" @click="edit(u)">编辑</button>
          <button class="btn sm" type="button" @click="openReset(u)">重置密码</button>
          <button class="btn sm" type="button" @click="openRemove(u)">删除</button>
        </div>
      </div>
      <Pager v-model="page" :page-count="pageCount" :total="filtered.length" :page-size="USER_PAGE_SIZE" />
    </template>

    <div class="p-note" style="margin-top:12px">
      账号、角色与档案（客户备注/地址、商家门店）在这里统一维护；商品由管理员在系统配置里统一维护。客户账号由这里建号设初始密码，不开放自注册。已有订单或流水的客户不能删除，只能停用。
    </div>

    <button class="p-fab" type="button" @click="open('user', { roles: [] })">＋ 新建用户</button>

    <ModalBox
      v-if="dlg.on"
      :title="dlg.kind === 'permissions' ? '管理员权限矩阵' : form.id ? '编辑用户' : '新建用户'"
      :busy="busy"
      :ok-text="dlg.kind === 'permissions' ? '保存权限' : '保存'"
      @ok="dlg.kind === 'permissions' ? savePermissions() : saveUser()"
      @cancel="dlg.on = false"
    >
      <template v-if="dlg.kind === 'permissions'">
        <div class="p-note" style="margin-bottom:12px">只影响「管理员」账号；超级管理员始终拥有全部权限。</div>
        <div v-for="group in permissionGroups" :key="group.grp" class="field">
          <label class="fl">{{ group.grp }}</label>
          <div class="p-tags">
            <label v-for="p in group.items" :key="p.id" class="chip" :class="{ on: permissionIds.includes(p.id) }">
              <input type="checkbox" :checked="permissionIds.includes(p.id)" style="width:auto" @change="togglePermission(p.id)">
              {{ p.name }}
            </label>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="field">
          <label class="fl">称呼</label>
          <input v-model="form.name" placeholder="如：刘姐 / 小李">
        </div>
        <div class="field">
          <label class="fl">手机号</label>
          <input v-model="form.phone" inputmode="tel" maxlength="11" :disabled="!!form.id">
        </div>
        <div v-if="!form.id" class="field">
          <label class="fl">初始密码</label>
          <input v-model="form.password" type="text" placeholder="至少 6 位，交给本人后请提醒妥善保管">
        </div>
        <div v-if="form.id" class="field">
          <label class="fl">状态</label>
          <select v-model="form.status"><option value="active">正常</option><option value="disabled">停用</option></select>
        </div>
        <div class="field">
          <label class="fl">角色（可多选）</label>
          <div class="p-tags">
            <label v-for="r in availableRoles" :key="r" class="chip" :class="{ on: hasRole(r) }">
              <input type="checkbox" :checked="hasRole(r)" style="width:auto" @change="toggleRole(r)">
              {{ ROLE_NAME[r] }}
            </label>
          </div>
        </div>
        <div v-if="hasRole('customer')" class="field">
          <label class="fl">客户备注</label>
          <input v-model="form.customerNote" placeholder="例: 不吃香菜">
        </div>
        <div v-if="hasRole('customer')" class="field">
          <label class="fl">收货地址</label>
          <input v-model="form.customerAddress" placeholder="例: 幸福小区 3 栋 2 单元 1802，放门口">
          <div class="hint">一行填完，联系人和电话写在这里。</div>
        </div>
        <div v-if="hasRole('merchant')" class="p-card flat" style="background:#FDFBF6">
          <div class="field">
            <label class="fl">店名</label>
            <input v-model="form.merchantName" placeholder="如：瑞雪生鲜超市">
          </div>
          <div class="field">
            <label class="fl">类目（至少一个）</label>
            <div class="p-tags">
              <label v-for="c in categories" :key="c.id" class="chip" :class="{ on: (form.categories || []).includes(c.code) }">
                <input type="checkbox" :checked="(form.categories || []).includes(c.code)" style="width:auto" @change="toggleCategory(c.code)">
                {{ c.name }}
              </label>
            </div>
          </div>
          <div class="field">
            <label class="fl">门店电话</label>
            <input v-model="form.merchantPhone" placeholder="可与登录号相同">
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="fl">门店地址</label>
            <input v-model="form.merchantAddress">
          </div>
        </div>
      </template>
    </ModalBox>

    <ModalBox
      v-if="resetDlg.on"
      :title="'重置密码 · ' + (resetDlg.user ? resetDlg.user.name : '')"
      ok-text="确认重置"
      :busy="resetDlg.busy"
      @ok="confirmReset"
      @cancel="resetDlg.on = false"
    >
      <div class="p-note" style="margin-bottom:12px">新密码至少 6 位，重置后立即生效。</div>
      <div class="field">
        <label class="fl">新密码</label>
        <input v-model="resetDlg.password" type="text" placeholder="至少 6 位">
      </div>
    </ModalBox>

    <ModalBox
      v-if="removeDlg.on"
      :title="'删除用户 · ' + (removeDlg.user ? removeDlg.user.name : '')"
      ok-text="确认删除"
      :busy="removeDlg.busy"
      @ok="confirmRemove"
      @cancel="removeDlg.on = false"
    >
      <div class="p-note">删除后该账号无法登录。已有订单或流水的客户会被系统拒绝删除，请改用「停用」。</div>
    </ModalBox>

  </div>
</template>
