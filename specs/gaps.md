> ⚠️ **已迁移 · 勿用**：本文件内容已并入 `07-gaps.md`（G1–G18，七态分类，必填字段）。唯一真源以 01–08 号基线文档为准。本文件仅为历史归档。

# 规格↔代码漂移清单（已迁移）

> 生成日期：2026-11-22。对比 `docs/` 历史规格与当前代码（V1–V8）。

| # | 漂移点 | 文档说法 | 代码现状 | 处置 |
|---|---|---|---|---|
| G1 | B3 多商家 | docs 说"待做" | V6 已建 `t_order_merchant`，create 已写入组，markPicked 支持多组金额 | 以代码为准；docs 过时 |
| G2 | V4 状态机简化 | docs 说 7 状态 | 代码 5 状态（V4 迁移） | 以代码为准；docs 过时 |
| G3 | 服务类型 | docs 说 B5 待做 | V5/V6 已建 `t_service_type`，CRUD+图标上传已实现 | 以代码为准；docs 过时 |
| G4 | 客户专属链接 | docs 说已删免登 | V9 已删除 `t_customer_link`、公开接口与 `link.manage` 权限 | 已关闭：功能取消，客户自助下单用 `/api/c/orders` 登录态入口 |
| G5 | 审计表 | docs 未提及 | V6 新增 `t_audit_log` + `AdminAuditController` | 代码超前，补入 spec |
| G6 | 还款申报 | docs 未提及 | V8 新增 `t_customer_repay_request` + 确认/驳回 | 代码超前，补入 spec |
| G7 | 订单渠道 | docs 未提及 | V8 新增 `source_channel/source_channel_note` | 代码超前，补入 spec |
| G8 | 待完善商家 | docs R1/R9 详细描述 | Merchant 有 status/source/from_order_id，但无 pending 端点、create 不生成 pending 商家 | 代码未完成，按 B3 迭代补 |
| G9 | settle_method | docs R5 要求落库 | Order 实体无此字段，finish/complete 不保存 method | 代码未完成，按 B4 迭代补 |
| G10 | 商家自定义字段 | docs R9 要求 `t_merchant_field` | 无此表、无 CRUD | 代码未完成，按 B5 迭代补 |
| G11 | SVG 清洗 | docs R8 要求 sanitize | 上传直接保存原始文件 | 代码未完成，按 B5 迭代补 |
| G12 | schema 快照 | docs R8 要求 `schema_snapshot` | `t_order_service` 表未建，service_details 存 t_order 但无快照 | 代码未完成，按 B5 迭代补 |
| G13 | 时区 | docs R6 要求 Asia/Shanghai | `HealthService` 用 `LocalDate.now()` | 代码未完成，按 B4 迭代补 |
| G14 | t_order_service 表 | docs R8 要求 | 未建表 | 按 B5 迭代决定是否需要 |
| G15 | t_merchant_field 表 | docs R9 要求 | 未建表 | 按 B5 迭代补 |

## 处置原则

- "以代码为准"：docs 过时，更新 docs 对齐代码（不改代码）。
- "代码未完成"：按对应迭代补代码，spec 先行。
- "待决策"：写入 `specs/decisions/` ADR。