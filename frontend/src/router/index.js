import { createRouter, createWebHashHistory } from 'vue-router';
import { getAuthToken } from '../api/http';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    children: [
      { path: '', name: 'dispatch', component: () => import('../views/admin/DispatchView.vue'), meta: { title: '工作台', perm: 'order.view' } },
      { path: 'orders', name: 'orders', component: () => import('../views/admin/OrdersView.vue'), meta: { title: '订单', perm: 'order.view' } },
      { path: 'ledger', name: 'ledger', component: () => import('../views/admin/LedgerView.vue'), meta: { title: '账单', perm: 'money.view' } },
      { path: 'users', name: 'users', component: () => import('../views/admin/UsersView.vue'), meta: { title: '用户与权限', perm: 'user.manage' } },
      { path: 'settings', name: 'settings', component: () => import('../views/admin/SettingsView.vue'), meta: { title: '设置', perm: 'setting.manage' } },
    ],
  },
  { path: '/m', name: 'merchant', component: () => import('../views/MerchantView.vue'), meta: { title: '商家工作台' } },
  { path: '/r', name: 'rider', component: () => import('../views/RiderView.vue'), meta: { title: '我的任务' } },
  { path: '/c', name: 'customer', component: () => import('../views/CustomerView.vue'), meta: { title: '马儿快跑' } },
  { path: '/', redirect: () => (getAuthToken() ? '/admin' : '/login') },
  { path: '/:any(.*)', redirect: '/' },
];

const router = createRouter({
  // 必须是 hash：NAS 上只要一条静态目录，不用配任何 rewrite
  history: createWebHashHistory(),
  routes,
});

/** 四端统一登录态：admin/m/r/c 都要求已登录，未登录回登录页。 */
router.beforeEach((to) => {
  const needAuth = ['/admin', '/m', '/r', '/c'].some((p) => to.path.startsWith(p));
  if (needAuth && !getAuthToken()) return { path: '/login', query: { next: to.fullPath } };
  return true;
});

export default router;
