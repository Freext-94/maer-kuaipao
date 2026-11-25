<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { api } from '../../api';
import { fmtYuan, parseYuan } from '../../api/money';
import { fmtDateTime, feeLabel } from '../../api/format';
import { showError, showToast } from '../../composables/useToast';
import { useAuth } from '../../composables/useAuth';

const auth = useAuth();
const view = ref('home');
const serviceTypes = ref([]);
const categories = ref([]);
const cfg = reactive({ prefix: 'MR', feeYuan: '10' });
const busy = ref(false);
const form = reactive({});
const auditLogs = ref([]);
const auditLoading = ref(false);
const auditPage = ref(1);
const AUDIT_SIZE = 10;
const pagedAudit = computed(() => auditLogs.value.slice((auditPage.value - 1) * AUDIT_SIZE, auditPage.value * AUDIT_SIZE));
const auditPageCount = computed(() => Math.max(1, Math.ceil(auditLogs.value.length / AUDIT_SIZE)));
const defaultGoods = ref([]);
const goodsForm = reactive({ name: '', spec: '', priceYuan: '', sortNo: '' });
const svcForm = reactive({ code: '', name: '', flowKind: 'service', baseFeeYuan: '10' });
const catForm = reactive({ id: null, code: '', name: '', sortNo: '' });

const TITLES = {
  basic: '基础设置',
  services: '服务类型',
  goods: '默认商品',
  categories: '商家类目',
  brand: '品牌素材',
  audit: '后台操作记录',
};

const BRAND_LOGOS = [
  { name: '标准 Logo', file: 'logo-512.png', src: '/brand/logo-512.png', note: '512×512，浅色背景使用' },
  { name: '卡片 Logo', file: 'logo-card-256.png', src: '/brand/logo-card-256.png', note: '登录页、分享卡片' },
  { name: 'App 图标', file: 'app-icon-512.png', src: '/brand-kit/app-icon-512.png', note: '512×512，桌面图标' },
  { name: '米色底 Logo', file: 'logo-on-cream-1200.png', src: '/brand-kit/logo-on-cream-1200.png', note: '1200 宽，印刷/海报' },
];
const BRAND_POSTERS = [
  { name: '移动端横幅', file: 'mobile-banner-1500x600.png', src: '/brand-kit/mobile-banner-1500x600.png', note: '1500×600，首页/朋友圈' },
  { name: '社交分享封面', file: 'og-cover-1200x630.png', src: '/brand-kit/og-cover-1200x630.png', note: '1200×630，链接预览' },
];
const BRAND_ICONS = [
  { name: '代买', src: '/brand-kit/icons/service-buy.svg' },
  { name: '代取送', src: '/brand-kit/icons/service-pickup.svg' },
  { name: '代办', src: '/brand-kit/icons/service-errand.svg' },
  { name: '代驾', src: '/brand-kit/icons/service-driver.svg' },
];

const me = computed(() => auth.me.value || {});
const roleLabel = computed(() => {
  const roles = me.value.roles || [];
  if (roles.includes('super_admin')) return '超级管理员';
  if (roles.includes('admin')) return '管理员';
  if (roles.includes('merchant')) return '商家';
  if (roles.includes('rider')) return '骑手';
  if (roles.includes('customer')) return '客户';
  return '员工';
});
const isSuperAdmin = computed(() => (me.value.roles || []).includes('super_admin'));
const enabledSvcCount = computed(() => serviceTypes.value.filter((s) => s.enabled === 1).length);
const flowLabel = (k) => ({
  buy: '代买', pickup: '代取送', errand: '代办', transfer: '接送', driver: '代驾', service: '服务',
}[k] || '服务');

async function load() {
  try {
    const [st, svc, cats, dg] = await Promise.all([
      api.settings(),
      api.allServiceTypes(), api.categories(), api.defaultGoods(),
    ]);
    serviceTypes.value = svc || [];
    categories.value = cats || [];
    defaultGoods.value = dg || [];
    cfg.prefix = (st && st.order_no_prefix) || 'MR';
    cfg.feeYuan = String(((Number(st && st.default_service_fee_fen) || 1000) / 100).toFixed(2));
  } catch (e) {
    showError(e);
  }
}

function go(v) {
  view.value = v;
  if (v === 'audit') loadAudit();
}

function back() {
  view.value = 'home';
}

async function saveCfg() {
  try {
    await api.saveSettings({
      order_no_prefix: cfg.prefix.trim().toUpperCase(),
      default_service_fee_fen: String(Math.round(parseYuan(cfg.feeYuan))),
    });
    showToast('设置已保存，下一单生效', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function addServiceType() {
  if (!svcForm.code.trim() || !svcForm.name.trim()) {
    showError(new Error('类型码和显示名都要填'));
    return;
  }
  busy.value = true;
  try {
    await api.createServiceType({
      code: svcForm.code.trim(),
      name: svcForm.name.trim(),
      flowKind: svcForm.flowKind,
      baseFeeFen: parseYuan(svcForm.baseFeeYuan || '10'),
      sortNo: serviceTypes.value.length + 1,
    });
    svcForm.code = '';
    svcForm.name = '';
    serviceTypes.value = (await api.allServiceTypes()) || [];
    showToast('服务类型已新增', 'ok');
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function toggleService(t) {
  try {
    await api.updateServiceType(t.id, { enabled: t.enabled !== 1 });
    serviceTypes.value = (await api.allServiceTypes()) || [];
    showToast(t.enabled === 1 ? '已停用' : '已启用', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function updateServiceFee(t, yuan) {
  try {
    await api.updateServiceType(t.id, { baseFeeFen: parseYuan(yuan) });
    serviceTypes.value = (await api.allServiceTypes()) || [];
    showToast('基础费已更新', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function addDefaultGoods() {
  if (!goodsForm.name.trim()) {
    showError(new Error('品名必填'));
    return;
  }
  try {
    await api.createDefaultGoods({
      name: goodsForm.name.trim(), spec: goodsForm.spec.trim(),
      estPriceFen: parseYuan(goodsForm.priceYuan), sortNo: Number(goodsForm.sortNo) || undefined,
    });
    goodsForm.name = '';
    goodsForm.spec = '';
    goodsForm.priceYuan = '';
    goodsForm.sortNo = '';
    defaultGoods.value = (await api.defaultGoods()) || [];
    showToast('默认商品已新增', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function removeDefaultGoods(g) {
  try {
    await api.deleteDefaultGoods(g.id);
    defaultGoods.value = (await api.defaultGoods()) || [];
    showToast('已删除', 'ok');
  } catch (e) {
    showError(e);
  }
}

function exportAudit() {
  const lines = [
    ['时间', '操作人', '方法', '路径', '状态'],
    ...auditLogs.value.map((a) => [fmtDateTime(a.occurredAt), a.actorName, a.httpMethod, a.requestPath, a.responseStatus]),
  ];
  const csv = '\uFEFF' + lines.map((r) => r.map((x) => '"' + String(x == null ? '' : x).replaceAll('"', '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = '后台操作记录.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function resetCategoryForm() {
  catForm.id = null;
  catForm.code = '';
  catForm.name = '';
  catForm.sortNo = '';
}

function editCategory(c) {
  catForm.id = c.id;
  catForm.code = c.code || '';
  catForm.name = c.name || '';
  catForm.sortNo = c.sortNo == null ? '' : String(c.sortNo);
}

async function saveCategory() {
  if (!catForm.name.trim()) {
    showError(new Error('类目名必填'));
    return;
  }
  if (!catForm.code.trim()) {
    showError(new Error('类目码必填，例：coffee'));
    return;
  }
  const editing = !!catForm.id;
  try {
    const body = {
      code: catForm.code.trim(),
      name: catForm.name.trim(),
      sortNo: Number(catForm.sortNo) || categories.value.length + 1,
    };
    if (editing) {
      await api.updateCategory(catForm.id, body);
    } else {
      await api.saveCategory(body);
    }
    resetCategoryForm();
    categories.value = (await api.categories()) || [];
    showToast(editing ? '类目已更新' : '类目已新增', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function removeCategory(c) {
  if (!window.confirm('删除类目「' + c.name + '」？已关联该类的商家会失去这个类目标记。')) return;
  try {
    await api.deleteCategory(c.id);
    if (catForm.id === c.id) resetCategoryForm();
    categories.value = (await api.categories()) || [];
    showToast('类目已删除', 'ok');
  } catch (e) {
    showError(e);
  }
}

async function rebuild() {
  try {
    const r = await api.rebuildLedger();
    showToast('已重算 ' + r.customers + ' 位客户的核销；不平项 ' + (r.issues ? r.issues.length : 0) + ' 条', r.issues && r.issues.length ? '' : 'ok');
  } catch (e) {
    showError(e);
  }
}

async function loadAudit() {
  auditLoading.value = true;
  try {
    auditLogs.value = (await api.auditLogs()) || [];
  } catch (e) {
    showError(e);
  } finally {
    auditLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <!-- 首页：系统配置 -->
    <template v-if="view === 'home'">
      <div class="p-card set-profile">
        <div class="set-avatar">{{ (me.name || '管').slice(0, 1) }}</div>
        <div class="p-grow">
          <div class="p-row" style="gap:8px">
            <b style="font-size:16px">{{ me.name || '管理员' }}</b>
            <span class="badge ghost">{{ roleLabel }}</span>
          </div>
          <div class="p-small p-muted" style="margin-top:3px">{{ me.phone || '—' }} · 马儿快跑调度台</div>
        </div>
      </div>

      <div class="p-sec-t" style="margin-top:18px">系统设置</div>

      <button class="p-card set-row" type="button" @click="go('basic')">
        <span class="set-ic">⚙</span>
        <span class="p-grow">
          <b>基础设置</b>
          <span class="p-small p-muted">单号前缀 {{ cfg.prefix }} · 默认服务费 ¥{{ cfg.feeYuan }}</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <button class="p-card set-row" type="button" @click="go('services')">
        <span class="set-ic">类</span>
        <span class="p-grow">
          <b>服务类型</b>
          <span class="p-small p-muted">{{ enabledSvcCount }} 项启用 / 共 {{ serviceTypes.length }} 项</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <button class="p-card set-row" type="button" @click="go('goods')">
        <span class="set-ic">品</span>
        <span class="p-grow">
          <b>默认商品</b>
          <span class="p-small p-muted">{{ defaultGoods.length }} 个 · 管理员维护，不与商家关联</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <button class="p-card set-row" type="button" @click="go('categories')">
        <span class="set-ic">店</span>
        <span class="p-grow">
          <b>商家类目</b>
          <span class="p-small p-muted">{{ categories.length }} 个类目</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <button class="p-card set-row" type="button" @click="go('brand')">
        <span class="set-ic">牌</span>
        <span class="p-grow">
          <b>品牌素材</b>
          <span class="p-small p-muted">Logo · 图标 · 海报 · 品牌色</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <button v-if="auth.can('audit.view')" class="p-card set-row" type="button" @click="go('audit')">
        <span class="set-ic">记</span>
        <span class="p-grow">
          <b>后台操作记录</b>
          <span class="p-small p-muted">谁改了单、收了款，都留痕</span>
        </span>
        <span class="set-arrow">›</span>
      </button>

      <div class="p-note" style="margin-top:16px">
        马儿快跑 · 调度台<br>
        账号、权限以及客户/商家/骑手档案请到「用户」页维护。
      </div>
    </template>

    <!-- 子页 -->
    <template v-else>
      <div class="p-row" style="margin-bottom:12px">
        <button class="btn sm" type="button" @click="back">‹ 返回</button>
        <b style="font-size:16px">{{ TITLES[view] }}</b>
      </div>

      <!-- 基础设置 -->
      <template v-if="view === 'basic'">
        <div class="p-card">
          <div class="field">
            <label class="fl">单号前缀（1~6 位字母或数字）</label>
            <input v-model="cfg.prefix" maxlength="6" placeholder="MR" :disabled="!auth.can('setting.manage')">
          </div>
          <div class="field">
            <label class="fl">默认服务费（元）</label>
            <input v-model="cfg.feeYuan" inputmode="decimal" :disabled="!auth.can('setting.manage')">
          </div>
          <div class="p-row">
            <button v-if="auth.can('setting.manage')" class="btn pri" type="button" @click="saveCfg">保存设置</button>
            <span class="p-small p-muted">只影响之后新录的单，历史单号不变。</span>
          </div>
        </div>
        <div v-if="auth.can('setting.manage')" class="p-sec-t" style="margin-top:18px">台账维护</div>
        <div v-if="auth.can('setting.manage')" class="p-card">
          <p class="p-small p-muted">手工补过流水后，点一下全量重算谁的钱冲了哪一单。</p>
          <button class="btn" type="button" @click="rebuild">重算核销关系</button>
        </div>
      </template>

      <!-- 服务类型 -->
      <template v-else-if="view === 'services'">
        <div v-if="!serviceTypes.length" class="p-card"><div class="p-empty"><b>还没有服务类型</b><span>在下面新增一个即可。</span></div></div>
        <div v-for="t in serviceTypes" :key="t.id" class="p-card">
          <div class="p-row">
            <b>{{ t.name }}</b>
            <span class="badge slate">{{ flowLabel(t.flowKind) }}</span>
            <span class="badge" :class="t.enabled === 1 ? 'green' : 'red'">{{ t.enabled === 1 ? '启用' : '停用' }}</span>
            <span class="p-right p-small p-muted mono">{{ t.code }}</span>
          </div>
          <div class="p-row" style="justify-content:flex-end;margin-top:8px;gap:6px">
            <span class="p-small p-muted">基础费 ¥</span>
            <input
              :value="((t.baseFeeFen || 0) / 100).toFixed(2)"
              inputmode="decimal"
              style="width:84px"
              @change="updateServiceFee(t, $event.target.value)"
            >
            <button class="btn sm" type="button" @click="toggleService(t)">{{ t.enabled === 1 ? '停用' : '启用' }}</button>
          </div>
        </div>
        <div class="p-sec-t" style="margin-top:18px">新增服务类型</div>
        <div class="p-card">
          <div class="field"><label class="fl">类型码（小写字母开头）</label><input v-model="svcForm.code" placeholder="例：medicine"></div>
          <div class="field"><label class="fl">显示名</label><input v-model="svcForm.name" placeholder="例：代买药"></div>
          <div class="field"><label class="fl">{{ feeLabel(svcForm.code) }}（元）</label><input v-model="svcForm.baseFeeYuan" inputmode="decimal"></div>
          <div class="field">
            <label class="fl">流程</label>
            <select v-model="svcForm.flowKind">
              <option value="buy">代买</option>
              <option value="pickup">代取送</option>
              <option value="errand">代办</option>
              <option value="transfer">接送</option>
              <option value="driver">代驾</option>
              <option value="service">通用服务</option>
            </select>
          </div>
          <button class="btn pri" type="button" :disabled="busy" @click="addServiceType">新增</button>
        </div>
      </template>

      <!-- 默认商品 -->
      <template v-else-if="view === 'goods'">
        <div v-if="!defaultGoods.length" class="p-card"><div class="p-empty"><b>还没有默认商品</b><span>维护后客户下单可直接点选。</span></div></div>
        <div v-for="g in defaultGoods" :key="g.id" class="p-card">
          <div class="p-row">
            <b>{{ g.name }}</b>
            <span class="badge slate">{{ g.spec || '无规格' }}</span>
            <span class="p-right p-small p-muted num">{{ fmtYuan(g.estPriceFen) }}</span>
          </div>
          <div class="p-row" style="justify-content:flex-end;margin-top:6px">
            <button class="btn sm" type="button" @click="removeDefaultGoods(g)">删除</button>
          </div>
        </div>
        <div class="p-sec-t" style="margin-top:18px">新增默认商品</div>
        <div class="p-card">
          <div class="field"><label class="fl">品名</label><input v-model="goodsForm.name" placeholder="例：农夫山泉 550ml"></div>
          <div class="field"><label class="fl">规格</label><input v-model="goodsForm.spec" placeholder="1 箱 24 瓶"></div>
          <div class="grid2">
            <div class="field"><label class="fl">参考价（元）</label><input v-model="goodsForm.priceYuan" inputmode="decimal"></div>
            <div class="field"><label class="fl">排序</label><input v-model="goodsForm.sortNo" inputmode="numeric"></div>
          </div>
          <button class="btn pri" type="button" @click="addDefaultGoods">新增</button>
        </div>
      </template>

      <!-- 商家类目 -->
      <template v-else-if="view === 'categories'">
        <div v-if="!categories.length" class="p-card"><div class="p-empty"><b>还没有商家类目</b><span>新增后商家建档时可归类。</span></div></div>
        <div v-for="c in categories" :key="c.id" class="p-card">
          <div class="p-row">
            <b>{{ c.name }}</b>
            <span class="p-right p-small p-muted mono">{{ c.code }}</span>
          </div>
          <div v-if="isSuperAdmin" class="p-row" style="margin-top:8px;gap:6px">
            <span class="p-small p-muted">排序 {{ c.sortNo }}</span>
            <button class="btn sm" type="button" @click="editCategory(c)">编辑</button>
            <button class="btn sm dgr" type="button" @click="removeCategory(c)">删除</button>
          </div>
        </div>
        <template v-if="isSuperAdmin">
          <div class="p-sec-t" style="margin-top:18px">{{ catForm.id ? '编辑类目' : '新增类目' }}</div>
          <div class="p-card">
            <div class="field"><label class="fl">类目名</label><input v-model="catForm.name" placeholder="例：水果"></div>
            <div class="field"><label class="fl">类目码（英文，例：fruit / coffee / tobacco_alcohol）</label><input v-model="catForm.code" placeholder="fruit"></div>
            <div class="field"><label class="fl">排序</label><input v-model="catForm.sortNo" inputmode="numeric" placeholder="数字"></div>
            <div class="p-row" style="gap:6px">
              <button class="btn pri" type="button" @click="saveCategory">{{ catForm.id ? '保存' : '新增' }}</button>
              <button v-if="catForm.id" class="btn" type="button" @click="resetCategoryForm">取消编辑</button>
            </div>
          </div>
        </template>
      </template>

      <!-- 品牌素材 -->
      <template v-else-if="view === 'brand'">
        <div class="p-sec-t">品牌标识</div>
        <div class="brand-grid">
          <div v-for="it in BRAND_LOGOS" :key="it.file" class="p-card brand-item">
            <div class="brand-thumb"><img :src="it.src" :alt="it.name"></div>
            <div class="p-row" style="margin-top:8px">
              <b class="p-grow">{{ it.name }}</b>
              <a class="btn sm" :href="it.src" :download="it.file">下载</a>
            </div>
            <div class="p-small p-muted">{{ it.note }}</div>
          </div>
        </div>

        <div class="p-sec-t" style="margin-top:18px">宣传物料</div>
        <div class="brand-grid">
          <div v-for="it in BRAND_POSTERS" :key="it.file" class="p-card brand-item">
            <div class="brand-thumb wide"><img :src="it.src" :alt="it.name"></div>
            <div class="p-row" style="margin-top:8px">
              <b class="p-grow">{{ it.name }}</b>
              <a class="btn sm" :href="it.src" :download="it.file">下载</a>
            </div>
            <div class="p-small p-muted">{{ it.note }}</div>
          </div>
        </div>

        <div class="p-sec-t" style="margin-top:18px">服务图标</div>
        <div class="p-card">
          <div class="brand-icons">
            <div v-for="ic in BRAND_ICONS" :key="ic.src" class="brand-icon">
              <img :src="ic.src" :alt="ic.name">
              <span class="p-small p-muted">{{ ic.name }}</span>
            </div>
          </div>
        </div>

        <div class="p-sec-t" style="margin-top:18px">品牌色</div>
        <div class="p-card">
          <div class="brand-colors">
            <div class="brand-color">
              <span style="background:#F5B301"></span>
              <b>马儿黄</b>
              <span class="p-small p-muted mono">#F5B301</span>
            </div>
            <div class="brand-color">
              <span style="background:#0D0E11"></span>
              <b>墨黑</b>
              <span class="p-small p-muted mono">#0D0E11</span>
            </div>
            <div class="brand-color">
              <span style="background:#FBF8F2"></span>
              <b>米白</b>
              <span class="p-small p-muted mono">#FBF8F2</span>
            </div>
          </div>
          <div class="hint">完整规范见项目内 brand-kit/brand-guide.md；对外物料优先用 SVG，印刷用 1200 宽 PNG。</div>
        </div>
      </template>

      <!-- 操作记录 -->
      <template v-else-if="view === 'audit'">
        <div class="p-row" style="margin-bottom:8px">
          <span class="p-small p-muted">共 {{ auditLogs.length }} 条 · 第 {{ auditPage }}/{{ auditPageCount }} 页</span>
          <span class="grow"></span>
          <button class="btn sm" type="button" @click="loadAudit">刷新</button>
          <button class="btn sm pri" type="button" @click="exportAudit">导出 CSV</button>
        </div>
        <div class="p-card pad0">
          <div v-if="auditLoading" class="p-loading">正在读取…</div>
          <div v-else-if="!auditLogs.length" class="p-empty"><b>暂无后台写操作</b><span>有人新增、改单、收款后会记录在这里。</span></div>
          <div v-for="a in pagedAudit" :key="a.id" class="p-list-row top">
            <div class="p-grow">
              <div class="p-small"><b>{{ a.actorName }}</b> · {{ a.httpMethod }} {{ a.requestPath }}</div>
              <div class="p-small p-muted">{{ fmtDateTime(a.occurredAt) }}</div>
            </div>
            <span class="badge" :class="a.responseStatus < 400 ? 'green' : 'red'">{{ a.responseStatus }}</span>
          </div>
        </div>
        <div v-if="auditLogs.length" class="p-row" style="justify-content:center;gap:8px;margin:12px 0">
          <button class="btn sm" type="button" :disabled="auditPage <= 1" @click="auditPage--">上一页</button>
          <span class="p-small p-muted">{{ auditPage }} / {{ auditPageCount }}</span>
          <button class="btn sm" type="button" :disabled="auditPage >= auditPageCount" @click="auditPage++">下一页</button>
        </div>
      </template>
    </template>

  </div>
</template>

<style scoped>
.set-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.set-avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--brand);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  flex: 0 0 auto;
}
.set-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  margin-top: 10px;
  cursor: pointer;
}
.set-row b { display: block; font-size: 14.5px; }
.set-row .p-small { display: block; margin-top: 2px; }
.set-ic {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--cream, #f6f1e8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--ink);
  flex: 0 0 auto;
}
.set-arrow {
  color: var(--muted);
  font-size: 22px;
  line-height: 1;
}
.brand-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.brand-item { margin: 0; }
.brand-thumb {
  height: 120px;
  border-radius: 10px;
  background: #f6f1e8;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.brand-thumb.wide { height: 100px; }
.brand-thumb img {
  max-width: 86%;
  max-height: 86%;
  object-fit: contain;
}
.brand-icons {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.brand-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.brand-icon img {
  width: 46px;
  height: 46px;
  padding: 8px;
  border-radius: 12px;
  background: #f6f1e8;
}
.brand-colors {
  display: grid;
  gap: 10px;
}
.brand-color {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-color > span:first-child {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  flex: 0 0 auto;
}
.brand-color b { font-size: 13.5px; }
@media (max-width: 380px) {
  .brand-grid { grid-template-columns: 1fr; }
}
</style>
