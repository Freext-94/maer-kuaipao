# 接口清单

> 平台扩展接口（V6，客户链接相关已于 V9 取消）：`GET /api/admin/bills?from=yyyy-MM-dd&to=yyyy-MM-dd` 返回日期范围内订单、账务流水和应收/收款/欠款汇总；也支持 `?q=关键词&all=true` 按客户名/手机/单号搜索并加载全部状态订单（账单页 Q-16 使用）；`GET /api/admin/audit` 返回最近 500 条后台写操作审计；`GET/PUT /api/admin/permissions/granted?role=admin` 查询和设置管理员权限。客户自助下单使用登录态 `/api/c/orders`，不再提供免登链接；商家端只保留只读工作台，不再提供代下接口。

订单创建支持 `serviceType`、`serviceDetails`、`merchantIds` 和 `extraFeeFen`；代买支持多个商家，取货登记可传 `merchantAmounts`（商家 ID 到实际货款分的映射），其合计必须等于 `goodsRealFen`。

统一返回 `{ "code": 0, "msg": "ok", "data": ... }`，`code != 0` 时 `msg` 是**可以直接展示给用户的中文**（业务拒绝和程序异常都走这里）。

**所有金额字段单位都是「分」，整数。** 前端只在自己的输入框和展示层做元↔分转换。

## 鉴权

| 前缀 | 凭证 | 说明 |
|---|---|---|
| `/api/auth/**` | 无 | 登录、当前用户 |
| `/api/admin/**` | 请求头 `X-Auth-Token` | Sa-Token 会话，需 `staff` 角色 |
| `/api/m/**` `/api/r/**` `/api/c/**` | 请求头 `X-Access-Token` | 免登令牌，类型必须与路径匹配 |
| `/api/share/**` | 无 | 靠 128 位随机 `token` |

PC 端开发时可用 `?token=xxx` 传免登令牌（拦截器也读 query），移动端建议走头。

## 登录

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{phone, password}` → `{token, name, roles}` |
| GET | `/api/auth/me` | 当前登录者 |
| POST | `/api/auth/logout` | 注销 |

## 调度台 · 订单

| 方法 | 路径 | 请求体 / 参数 |
|---|---|---|
| GET | `/api/admin/orders` | `status, day(yyyy-MM-dd), customerId, merchantId, riderId, limit, all(bool)` |
| GET | `/api/admin/orders/{id}` | → `{order, logs[], notices[]}` |
| POST | `/api/admin/orders` | `OrderCreateCmd`，见下 |
| POST | `/api/admin/orders/{id}/dispatch` | `{riderId}` 指派并通知商家 |
| POST | `/api/admin/orders/{id}/ready` | 老板代点备货完成（留痕） |
| POST | `/api/admin/orders/{id}/pick` | `{goodsRealFen, receiptAttachmentId, method}` |
| POST | `/api/admin/orders/{id}/delivering` | 无体 |
| POST | `/api/admin/orders/{id}/delivered` | `{attachmentId}` 必填 |
| POST | `/api/admin/orders/{id}/finish` | `{paidFen, method}`，`paidFen <= 应收` |
| POST | `/api/admin/orders/{id}/cancel` | `{code, text, recoveredFen, markLoss}` |
| POST | `/api/admin/orders/{id}/adjust` | `{deltaFen, reason, type: ADJUST\|WAIVE}` |
| GET | `/api/admin/statuses` | 状态枚举与中文名 |
| GET | `/api/admin/health` | 今日/进行中/欠款合计/垫付未回/`issues[]`/渠道命中统计 |

### OrderCreateCmd

```json
{
  "source": "phone",              // phone 电话代录 | online 客户自助
  "customerId": 1,                 // 或下面四个字段当场建档
  "newCustomerName": "", "newCustomerPhone": "",
  "newCustomerCycle": "on_credit", // on_credit | cod | monthly
  "newCreditLimitFen": 20000,
  "merchantId": 1,
  "addressId": 1,                  // 或 poi/detail/floor/elevator 新增地址
  "goodsText": "3 个西瓜 + 一提抽纸",
  "goodsEstFen": 8600,
  "serviceFeeFen": 800,
  "riderId": 3,                    // 填了就直接进「待商家备货」并通知商家
  "note": "",
  "enforceCreditLimit": false      // 客户端置 true，超额直接拒单
}
```

### OrderView 主要字段

`statusLabel` `receivableFen`（派生） `paidFen`（已核销） `owedFen` `advanceFen` `advanceStatus`
`customerOwedFen` `polled`（商家是否已读到）
`address{}` `attachments[{id,bizType,url,fileName}]` `goodsRealFen`（取货后为 null 表示未录）

## 调度台 · 主数据

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/admin/customers` | 列表（含 `owedFen`、地址）/ 新建 |
| POST | `/api/admin/customers/{id}/addresses` | 加地址 |
| POST | `/api/admin/customers/{id}/credit-limit` | `{creditLimitFen, reason}` |
| GET/POST | `/api/admin/merchants` | 列表 / 新增或更新（带 `id` 即更新） |
| GET/POST/PUT/DELETE | `/api/admin/default-goods` | 管理员配置的默认商品（各端下单点选） |
| GET/POST | `/api/admin/riders` | 骑手列表 / 新建（已存在手机号则只加角色） |
| GET/POST/DELETE | `/api/admin/tokens` `/{id}` | 免登链接：列表（含 `url`、`lastSeenAt`）/ 签发 `{scopeType, scopeId, label}` / 吊销 |
| POST | `/api/admin/upload?bizType=&bizId=` | `multipart` 字段名 `file` → `{id, url}` |

## 调度台 · 钱

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/ledger/{customerId}` | `{owedFen, prepaidFen, entries[], orders[]（该客户全部状态订单）, openCharges[], exceptions[]}` |
| POST | `/api/admin/ledger/{customerId}/payment` | `{amountFen, method, note, orderId?, evidenceAttachmentId?}`；不传 `orderId` 则先冲最老挂账 |
| POST | `/api/admin/ledger/{customerId}/waive` | `{amountFen, orderId?, reason}` 原因必填 |
| POST | `/api/admin/ledger/rebuild` | 全量重算核销关系（手工补过流水后用），返回 `{customers, issues[]}` |
| POST | `/api/admin/exceptions` | `{orderId, type, disputedFen, text}` 争议挂账 |
| GET | `/api/admin/bills` | 已生成账单列表（含 `sharePath`） |
| POST | `/api/admin/bills` | `{customerId, periodMonth}`；**已确认的账单不允许覆盖**，会报错 |
| GET | `/api/admin/bills/{customerId}/preview?month=` | 不落库预览 |

## 对账单（公开）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/share/bill/{token}` | 只读账单：期初/本期/期末 + 逐笔 + `status` |
| POST | `/api/share/bill/{token}/confirm` | 客户点「我确认无误」，落 `confirmedAt` |
| POST | `/api/share/bill/{token}/dispute` | `{text}` |

## 商家端 `X-Access-Token`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/m/poll` | 待完成订单；服务端把排队中的 poll 通知标为已读 |
| GET | `/api/m/orders` | 待完成 + 已完成/取消（只读） |

商家代下与备货确认已取消，商家端不再提供写接口。

## 骑手端 `X-Access-Token`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/r/tasks` | `{tasks[], advanceOutstandingFen}` 我经手未回的垫付 |
| POST | `/api/r/orders/{id}/pick` | `{goodsRealFen, receiptAttachmentId, method}` |
| POST | `/api/r/orders/{id}/delivering` | 无体 |
| POST | `/api/r/orders/{id}/delivered` | `{attachmentId}` |
| POST | `/api/r/orders/{id}/finish` | `{paidFen, method}` 当场代收时用 |
| POST | `/api/r/upload?bizType=&bizId=` | 小票/送达照 |

未派给当前令牌照人的单，以上接口一律 403。

## 客户端 `X-Access-Token`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/c/profile` | `{owedFen, prepaidFen, creditLimitFen, addresses[], merchants[], defaultFeeFen}` |
| GET | `/api/c/default-goods` | 管理员配置的默认商品 |
| POST | `/api/c/orders` | 同 `OrderCreateCmd`（服务端强制 `source=online` 并开启额度拦截） |
| GET | `/api/c/orders` | 我的单（不含已取消） |
| POST | `/api/c/repay` | `{amountFen, method}` 只生成一条待确认的付款流水 |

## 静态资源

`GET /files/{随机文件名}` —— 小票与送达照。URL 即凭证，不列目录。

## 业务错误示例（`code=1`，`msg` 可直接展示）

- `状态不允许：待商家备货 → 已取货`
- `必须上传小票照片，客户不认账时这是唯一凭据`
- `已垫付 ¥92.40：请先记录「已向商家追回」或勾选「确认损失」，否则不允许取消`
- `实收 ¥200.00 大于应收 ¥100.40；多付的钱请在台账里记充值，不要塞进这一单`
- `当前欠款 ¥600.00 已到额度上限 ¥500.00 元，请先结清再下单`
