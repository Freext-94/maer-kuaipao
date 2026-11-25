# API 概览

服务端提供 JSON REST API，默认前缀为 `/api`。接口成功时返回统一包装结构：

```json
{"code":0,"msg":"ok","data":{}}
```

金额字段使用整数分。例如 `1250` 表示 12.50 元。服务端在登录后通过 `X-Auth-Token` 请求头识别账号；具体权限还会按角色和资源归属校验。

## 身份验证

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/auth/login` | 手机号和密码登录 |
| `GET` | `/api/auth/me` | 获取当前账号及角色 |
| `POST` | `/api/auth/logout` | 退出当前会话 |

除登录接口外，业务接口需要携带登录返回的令牌：

```http
X-Auth-Token: <登录令牌>
```

## 调度管理

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` / `POST` | `/api/admin/orders` | 查询订单、创建订单 |
| `GET` | `/api/admin/orders/{id}` | 查看订单、状态记录和改单记录 |
| `PUT` | `/api/admin/orders/{id}` | 修改未完成订单 |
| `POST` | `/api/admin/orders/{id}/dispatch` | 指派骑手 |
| `POST` | `/api/admin/orders/{id}/pick` | 登记取货与实际货款 |
| `POST` | `/api/admin/orders/{id}/complete` | 确认配送完成并记录收款 |
| `POST` | `/api/admin/orders/{id}/cancel` | 取消订单 |
| `GET` | `/api/admin/orders/{id}/edit-logs` | 查询订单修改记录 |
| `GET` | `/api/admin/health` | 经营概览与账务检查结果 |
| `GET` | `/api/admin/audit` | 查看管理员操作审计记录 |

## 客户、骑手与商家

| 路径 | 主要能力 |
|---|---|
| `/api/admin/customers`、`/api/admin/merchants`、`/api/admin/riders` | 管理客户、商家和骑手档案 |
| `/api/admin/users`、`/api/admin/permissions` | 管理账号、角色与管理员权限 |
| `/api/m/poll`、`/api/m/orders` | 商家查看待处理订单与订单历史 |
| `/api/r/tasks`、`/api/r/history` | 骑手查看当前任务与历史订单 |
| `/api/r/orders/{id}/pick` | 骑手登记实际取货金额 |
| `/api/r/orders/{id}/complete` | 骑手确认送达并登记收款 |
| `/api/c/profile`、`/api/c/orders` | 客户查看资料、创建和查询本人订单 |
| `/api/c/ledger`、`/api/c/repay` | 客户查看账单并登记还款 |

## 账单与设置

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/admin/bills`、`/api/admin/debts` | 查询订单账单和客户欠款汇总 |
| `GET` | `/api/admin/ledger/{customerId}` | 查看指定客户的账务明细 |
| `POST` | `/api/admin/ledger/{customerId}/payment` | 登记线下收款或还款 |
| `GET` / `PUT` | `/api/admin/settings` | 读取、修改平台配置 |
| `GET` / `POST` / `PUT` | `/api/admin/service-types` | 管理服务类型 |
| `GET` / `POST` / `PUT` | `/api/admin/default-goods` | 管理常用商品 |

接口以当前服务端实现为准。请求字段、校验规则或返回结构发生变化时，请结合对应 Controller 与 DTO 一并查看。
