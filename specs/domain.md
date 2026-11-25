> ⚠️ **已迁移 · 勿用**：本文件内容已并入 `02-domain.md`（业务规则）与 `01-constitution.md`（不变式）。唯一真源以 01–08 号基线文档为准。本文件仅为历史归档。

# 领域模型与不变式（已迁移）

## 1. 状态机

订单状态（`t_order.status`，VARCHAR 存枚举 name()）：

| 状态码 | 标签 | 终态 |
|---|---|---|
| `PENDING` | 待派单 | 否 |
| `PICKING` | 取货中 | 否 |
| `DELIVERING` | 配送中 | 否 |
| `FINISHED` | 已完成 | 是 |
| `CANCELLED` | 已取消 | 是 |

流转白名单（`OrderStatus.canMoveTo`）：
- `PENDING` → `PICKING`（派单）/ `CANCELLED`
- `PICKING` → `DELIVERING`（取货）/ `CANCELLED`
- `DELIVERING` → `FINISHED`（配送完成）/ `CANCELLED`
- 终态不可再流转（只能走冲正/减免/收款）

> 历史 V4 迁移：7 状态合并为 5 状态（去掉"待备货/备货完成"，合并"已送达+结单"为"配送完成"）。

## 2. 金额口径

- 所有金额以 **分 (BIGINT)** 存储，禁止 decimal/float 参与运算。
- 应收 = 货款（取货后为实付，否则估价）+ 服务费 + 附加服务费 − 优惠 + 冲正/减免（`receivable = baseOf + adjustments`）。
- 货款锁定：`goods_real_fen` 一旦写入不可修改；`NULL` 表示未取货/未录，`0` 表示已确认无货款。
- 欠款余额 = 流水之和（`Σ CHARGE − Σ PAYMENT + Σ ADJUST + Σ WAIVE`），无余额字段。
- 垫付：取货时实付 > 0 才建 `t_advance`；0 元不建；取消时必须追回或认损。

## 3. 时区

- 统计切日统一使用 `Asia/Shanghai`（北京时间 0 点）。
- 服务端不得依赖 JVM 默认时区；所有 `LocalDate.now()` 统计必须显式 `ZoneId.of("Asia/Shanghai")`。
- **现状**：`HealthService` 使用 `LocalDate.now()`（服务器默认时区），待修正（B4 迭代）。

## 4. 多商家组规则

- 一单可含多个商家组 (`t_order_merchant`)，每组独立备货/取货/垫付。
- 全部组取齐才允许进入 `DELIVERING`。
- 自由填写商家 → 生成 `status=pending` 待完善商家，不进常规搜索，未完善不通知。
- 已取货组的货款锁定；改组仅在未取货时允许；删组仅在未取货且非最后一组时允许。

## 5. 服务类型

- 服务类型从硬编码变为 `t_service_type` 表，后台可新增。
- `flow_kind`：`buy`（需要备货/垫付）/ `service`（标准）。
- `form_kind`：`buy`/`route`/`driver`/`blank`，决定内置区块。
- `form_schema`：JSON 额外字段定义；订单存 `service_details`（V6 已有），schema 快照待补（B5）。
- 内置字段（客户、商家组、货款、服务费、骑手、附件、备注）不放进 schema；服务类型按实际需求启用/停用。

## 6. 收款方式

- 四种：微信 (`wechat`) / 支付宝 (`alipay`) / 现金 (`cash`) / 欠款 (`credit`)。
- 选欠款：实收必须 = 0，不产生 payment 流水，整单应收计入客户账单。
- 选其他：实收可 < 应收，余额自动记欠款；实收 > 应收 拒绝。

## 7. 权限

- 角色：`super_admin` / `admin` / `rider` / `merchant` / `customer`；一人可多角色。
- 超管管理所有权限；管理员按矩阵授权；默认管理员拥有平台维护权限但不默认拥有用户/权限管理。
- 权限码共 27 项（订单 7、客户 3、商家 3、骑手 3、钱 3、设置 3、用户 4、权限 1）。

## 9. 地址维护规则

- 地址为**单行文本**（`t_address.address` / `t_merchant.address`），不拆分 poi/detail/floor 等字段。
- 管理员编辑用户信息时可编辑客户地址（`customerAddress`）与商家地址（`merchant.address`）。
- 客户端（客户自助）仅可维护**地址 + 电话**，不可修改名称，不显示备注。

## 10. 订单来源判定规则

- 订单 `source` 由所选联系渠道 `source_channel` 判定，而非独立传入：
  - `customer_call` / `customer_wechat` → `source = online`（客户发起）
  - `merchant_call` / `merchant_wechat` / `other` → `source = phone`（电话/商家发起）
- 若未提供 `source_channel`，默认 `source = phone`。

## 8. 术语表

| 旧 | 新 |
|---|---|
| 单子/工单/服务单 | 订单 |
| 欠款/欠款台账 | 客户账单 |
| 订单账单 | 订单明细 |
| 今日已收 | 累计收回 |
| 累计欠款 | 账单合计 |
| 货款争议/冲正 | 货款不对？ |
| 冲正/减免 | 商家退我钱 / 我补给商家 / 给客户免掉 |
| 打印账单 | 生成账单图片 |