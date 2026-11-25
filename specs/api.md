> ⚠️ **已迁移 · 勿用**：本文件内容已并入 `04-api.md`（C0–C5）与 `05-security.md`。唯一真源以 01–08 号基线文档为准。本文件仅为历史归档。

# 接口契约（反向自 controller，已迁移）

> 统一返回 `Result<T>`；业务拒绝抛 `BizException`（中文 msg 前端直接展示）。鉴权：Sa-Token，手机号+密码登录。

## 认证

| Method | Path | 说明 |
|---|---|---|
| POST | /api/auth/login | 手机号+密码 → {token, user, workspaces, permissions} |
| POST | /api/auth/switch-workspace | 切换工作区 |

## 调度台订单 `/api/admin/orders`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/admin/orders | 列表（status/day/from/to/customerId/merchantId/riderId/limit/all） |
| GET | /api/admin/orders/{id} | 详情（order + logs + editLogs + notices） |
| POST | /api/admin/orders | 录单（OrderCreateCmd） |
| POST | /api/admin/orders/{id}/dispatch | 派单（riderId） |
| POST | /api/admin/orders/{id}/pick | 取货（goodsRealFen, merchantAmounts, receiptAttachmentId, method） |
| POST | /api/admin/orders/{id}/complete | 配送完成（attachmentId, paidFen, method） |
| POST | /api/admin/orders/{id}/cancel | 取消（code, text, recoveredFen, markLoss） |
| PUT | /api/admin/orders/{id} | 改单（OrderEditCmd，状态白名单） |
| GET | /api/admin/orders/{id}/edit-logs | 修改记录 |
| POST | /api/admin/orders/{id}/adjust | 调整（deltaFen, reason, type, direction） |
| GET | /api/admin/statuses | 状态列表 |
| GET | /api/admin/health | 健康自检 + 统计 |

> 待补（B3）：`POST/PATCH/DELETE /api/admin/orders/{id}/merchant-groups`、`POST .../merchant-groups/{groupId}/pickup`。

## 账单与欠款 `/api/admin`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/admin/bills | 账单（from/to） |
| GET | /api/admin/debts | 客户欠款总览 |
| GET | /api/admin/ledger/{customerId} | 客户台账详情 |
| POST | /api/admin/ledger/{customerId}/payment | 登记收款 |
| POST | /api/admin/ledger/{customerId}/waive | 减免 |
| POST | /api/admin/ledger/rebuild | 重算核销 |
| GET | /api/admin/repayment-requests | 待确认还款申报 |
| POST | /api/admin/repayment-requests/{id}/confirm | 确认 |
| POST | /api/admin/repayment-requests/{id}/reject | 驳回 |

## 用户与权限 `/api/admin`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/admin/users | 用户列表 |
| POST | /api/admin/users | 新建用户（含 merchant 对象） |
| PUT | /api/admin/users/{id} | 修改用户（含 address 单行地址） |
| POST | /api/admin/users/{id}/reset-password | 重置密码 |
| GET | /api/admin/permissions | 权限字典 |
| GET | /api/admin/permissions/granted | 已授权权限 |
| PUT | /api/admin/permissions/granted | 保存授权 |
| GET | /api/admin/merchant-categories | 类目列表 |
| POST | /api/admin/merchant-categories | 新建类目 |

> 待补（B3）：`GET /api/admin/merchants/pending`、`POST /api/admin/merchants/{id}/complete`。
> 待补（B5）：`GET/POST/PUT /api/admin/merchant-fields`、`GET/POST/PUT /api/admin/service-types/{id}/schema`。

## 服务类型 `/api/admin/service-types`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/admin/service-types | 列表（enabledOnly） |
| POST | /api/admin/service-types | 新建 |
| PUT | /api/admin/service-types/{id} | 修改 |
| POST | /api/admin/service-types/{id}/icon | 上传图标 |

## 商家端 `/api/m`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/m/poll | 待完成订单（挂机轮询） |
| GET | /api/m/orders | 待完成 + 已完成/取消（只读） |

> 商家代下及备货确认均已取消；上述接口只读。

## 骑手端 `/api/r`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/r/tasks | 我的任务 |
| POST | /api/r/orders/{id}/pick | 取货 |
| POST | /api/r/orders/{id}/deliver | 送达 |

## 客户端 `/api/c`

| Method | Path | 说明 |
|---|---|---|
| GET | /api/c/orders | 我的订单 |
| POST | /api/c/orders | 自助下单 |
| GET | /api/c/debts | 我的欠款 |
| POST | /api/c/repay-requests | 提交还款申报 |

## 公共

| Method | Path | 说明 |
|---|---|---|
| GET | /api/public/service-types | 客户端下单用服务类型 |
| GET | /files/{path} | 文件下载（FileController） |
| POST | /api/admin/upload | 上传（图片/音频） |