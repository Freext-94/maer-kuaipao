import { http } from './http';

/** 全部接口按 docs/api.md 一处收口，页面里不再出现裸路径。 */
export const api = {
  // -------------------------------------------------- 登录（调度台）
  login: (phone, password) => http.post('/api/auth/login', { phone, password }),
  me: () => http.get('/api/auth/me'),
  logout: () => http.post('/api/auth/logout'),

  // -------------------------------------------------- 看板 / 订单
  statuses: () => http.get('/api/admin/statuses'),
  health: () => http.get('/api/admin/health'),
  orders: (query) => http.get('/api/admin/orders', query),
  orderDetail: (id) => http.get('/api/admin/orders/' + id),
  createOrder: (cmd) => http.post('/api/admin/orders', cmd),
  dispatch: (id, riderId) => http.post('/api/admin/orders/' + id + '/dispatch', { riderId }),
  pick: (id, body) => http.post('/api/admin/orders/' + id + '/pick', body),
  complete: (id, body) => http.post('/api/admin/orders/' + id + '/complete', body),
  cancel: (id, body) => http.post('/api/admin/orders/' + id + '/cancel', body),
  adjust: (id, body) => http.post('/api/admin/orders/' + id + '/adjust', body),
  editOrder: (id, body) => http.put('/api/admin/orders/' + id, body),
  editLogs: (id) => http.get('/api/admin/orders/' + id + '/edit-logs'),

  // -------------------------------------------------- 主数据（录单选档用；管理入口在用户页）
  riders: async () => {
    const users = await http.get('/api/admin/users');
    return (users || []).filter((u) => (u.roles || []).includes('rider'))
      .map((u) => ({ userId: u.id, name: u.name, phone: u.phone }));
  },
  customers: (q) => http.get('/api/admin/customers', q ? { q } : undefined),
  createCustomer: (body) => http.post('/api/admin/customers', body),
  addAddress: (customerId, body) => http.post('/api/admin/customers/' + customerId + '/addresses', body),
  merchants: (q) => http.get('/api/admin/merchants', q ? { q } : undefined),
  saveMerchant: (body) => http.post('/api/admin/merchants', body),

  // -------------------------------------------------- 用户与权限（含客户/商家/骑手档案）
  users: () => http.get('/api/admin/users'),
  saveUser: (body) => http.post('/api/admin/users', body),
  updateUser: (id, body) => http.put('/api/admin/users/' + id, body),
  deleteUser: (id) => http.del('/api/admin/users/' + id),
  resetPassword: (id, password) => http.post('/api/admin/users/' + id + '/reset-password', { password }),
  permissions: () => http.get('/api/admin/permissions'),
  grantedPermissions: () => http.get('/api/admin/permissions/granted'),
  saveGrantedPermissions: (ids) => http.put('/api/admin/permissions/granted', ids),
  categories: () => http.get('/api/admin/merchant-categories'),
  saveCategory: (body) => http.post('/api/admin/merchant-categories', body),
  updateCategory: (id, body) => http.put('/api/admin/merchant-categories/' + id, body),
  deleteCategory: (id) => http.del('/api/admin/merchant-categories/' + id),

  // -------------------------------------------------- 服务类型
  serviceTypes: () => http.get('/api/admin/service-types', { enabledOnly: true }),
  allServiceTypes: () => http.get('/api/admin/service-types'),
  createServiceType: (body) => http.post('/api/admin/service-types', body),
  updateServiceType: (id, body) => http.put('/api/admin/service-types/' + id, body),
  defaultGoods: () => http.get('/api/admin/default-goods'),
  createDefaultGoods: (body) => http.post('/api/admin/default-goods', body),
  updateDefaultGoods: (id, body) => http.put('/api/admin/default-goods/' + id, body),
  deleteDefaultGoods: (id) => http.del('/api/admin/default-goods/' + id),

  // -------------------------------------------------- 设置
  settings: () => http.get('/api/admin/settings'),
  saveSettings: (patch) => http.put('/api/admin/settings', patch),
  auditLogs: () => http.get('/api/admin/audit'),

  // -------------------------------------------------- 钱
  ledger: (customerId) => http.get('/api/admin/ledger/' + customerId),
  payment: (customerId, body) => http.post('/api/admin/ledger/' + customerId + '/payment', body),
  pendingRepaymentRequests: () => http.get('/api/admin/repayment-requests'),
  confirmRepaymentRequest: (id) => http.post('/api/admin/repayment-requests/' + id + '/confirm'),
  rejectRepaymentRequest: (id) => http.post('/api/admin/repayment-requests/' + id + '/reject'),
  waive: (customerId, body) => http.post('/api/admin/ledger/' + customerId + '/waive', body),
  rebuildLedger: () => http.post('/api/admin/ledger/rebuild'),
  billSummary: function (query, to) {
    return http.get('/api/admin/bills', (query && typeof query === 'object') ? query : { from: query, to });
  },
  debts: () => http.get('/api/admin/debts'),
  openException: (body) => http.post('/api/admin/exceptions', body),

  // -------------------------------------------------- 照片
  uploadForAdmin: (file, bizType, bizId) =>
    http.upload('/api/admin/upload', file, { bizType, bizId }),
  uploadForRider: (file, bizType, bizId) =>
    http.upload('/api/r/upload', file, { bizType, bizId }),

  // -------------------------------------------------- 商家端（只读工作台）
  mPoll: () => http.get('/api/m/poll'),
  mOrders: () => http.get('/api/m/orders'),

  // -------------------------------------------------- 骑手端
  rTasks: () => http.get('/api/r/tasks'),
  rServiceTypes: () => http.get('/api/r/service-types'),
  rDefaultGoods: () => http.get('/api/r/default-goods'),
  rCustomerOptions: (q) => http.get('/api/r/customer-options', q ? { q } : undefined),
  rMerchants: () => http.get('/api/r/merchants'),
  rPick: (id, body) => http.post('/api/r/orders/' + id + '/pick', body),
  rComplete: (id, body) => http.post('/api/r/orders/' + id + '/complete', body),
  rHistory: () => http.get('/api/r/history'),
  rBills: function (query, to) {
    return http.get('/api/r/bills', (query && typeof query === 'object') ? query : { from: query, to });
  },
  rCustomers: () => http.get('/api/r/customers'),
  rCreate: (body) => http.post('/api/r/orders', body),

  // -------------------------------------------------- 客户端
  cProfile: () => http.get('/api/c/profile'),
  cUpdateProfile: (body) => http.post('/api/c/profile', body),
  cAddAddress: (body) => http.post('/api/c/addresses', body),
  cUpdateAddress: (id, body) => http.put('/api/c/addresses/' + id, body),
  cDefaultGoods: () => http.get('/api/c/default-goods'),
  cCreate: (body) => http.post('/api/c/orders', body),
  cOrders: () => http.get('/api/c/orders'),
  cRepay: (amountFen, method) => http.post('/api/c/repay', { amountFen, method }),
  cLedger: () => http.get('/api/c/ledger'),

};
