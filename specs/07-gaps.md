# 07 · 规格漂移清单（Gaps）

> **对应审查条目**：E1（15 个漂移点）。
> **原则**：业务优先、不回避冲突。每个漂移点必须有明确处理结果，不能长期停留"待确认"。
> **分类**：使用 01 §0.2 的七态（CONFIRMED / IMPLEMENTED / NOT_IMPLEMENTED / IMPLEMENTATION_GAP / SPEC_GAP / UNDECIDED / DEPRECATED）。
> **生成日期**：2026-11-22；重构日期 2026-11-23。对比 docs 历史规格、本规格体系（01–08）与当前代码（V1–V8）。

---

## 1. 处置原则（更新，替换原三类法）

**原处置原则**（作废）：以代码为准 / 代码未完成 / 待决策。
**问题**：尤其"以代码为准"不适合完整重构项目——会把代码里碰巧实现的东西当成业务需求。

**新处置原则**：
1. **业务规则以规格（01/02）为准**，代码状态只作跟踪，不反向定义需求（呼应宪法 §3 纪律 1）；
2. 规格缺失 → 标 `SPEC_GAP`，先补规格再补代码；
3. 规则明确代码没做 → 标 `NOT_IMPLEMENTED` / `IMPLEMENTATION_GAP`，spec 先行；
4. 规格与代码不一致 → 标 `IMPLEMENTATION_GAP`，判断以哪边为准并记录理由；
5. 业务未定 → 标 `UNDECIDED`，写入 U 编号，交用户裁决；
6. 已废弃 → 标 `DEPRECATED`，保留记录但不修。

**每个漂移点必须有明确处理结果，不能长期停留在"待确认"。**

---

## 2. 漂移点清单（G1–G15 + 新增）

### 2.1 每个漂移点必填字段

| 字段 | 说明 |
|---|---|
| Gap ID | G1–G18 |
| 问题描述 | 一句话 |
| 涉及模块 | 规格文档 + 代码模块 |
| 当前规格 | 规格怎么说 |
| 当前代码 | 代码怎么做 |
| 目标规格 | 最终应以什么为准 |
| 修复方案 | 具体动作 |
| 优先级 | P0（资金/数据/权限/安全/核心流程）、P1（核心功能缺失/一致性）、P2（优化/扩展） |
| 依赖项 | 前置任务/U 编号 |
| 迭代归属 | 批次/版本 |
| 验收标准 | 对应 Axx |
| 状态 | 七态之一 |

---

### 2.2 漂移明细

#### G1 · B3 多商家
- **涉及**：02 §A5 / 03 §B2 / 04 §C1 / `OrderService`
- 当前规格：docs 说"待做"；本规格完整定义规则
- 当前代码：V6 已建 `t_order_merchant`，create 写入组，markPicked 支持多组金额
- 目标规格：以本规格 02 §A5 为准
- 修复方案：规格已补；代码按排期 `DEFERRED`（用户明确先不做）
- 优先级：P0（规则） / 实现 DEFERRED
- 依赖：U-07
- 迭代：未来批次
- 验收：A13–A17, A28
- **状态**：`CONFIRMED`（规则）+ `DEFERRED`（实现）

#### G2 · V4 状态机简化
- 涉及：02 §A2 / `OrderStatus.java`
- 当前规格：旧 docs 说 7/8 状态
- 当前代码：5 状态（V4 迁移）
- 目标规格：5 状态 + 重新定义业务含义（02 §A2.1）
- 修复方案：旧 docs 已作废；本规格已对齐
- 优先级：P1
- 验收：A1, A18
- **状态**：`CONFIRMED`

#### G3 · 服务类型
- 涉及：02 §A6 / 03 §B4 / `V5/V6` 迁移
- 当前规格：docs 说 B5 待做；本规格定义完整结构
- 当前代码：已建 `t_service_type`、CRUD + 图标上传
- 目标规格：以 02 §A6 + 03 §B4 为准（补 form_kind/schema_version）
- 修复方案：新增 Flyway 迁移补字段（03 §B4）
- 优先级：P1
- 依赖：U-01（命名）
- 验收：A25
- **状态**：`IMPLEMENTATION_GAP`（缺 form_kind/版本字段）

#### G4 · 客户专属链接（已关闭）
- 功能取消：客户免登下单链接、签发/吊销接口、`t_customer_link` 及 `link.manage` 权限全部移除（V9）。
- 客户自助下单保留登录态入口 `/api/c/orders`，无需免登链接。
- **状态**：`DEPRECATED`（不再作为待补缺口）

#### G5 · 审计表
- 涉及：05 §5 / `t_audit_log`
- 当前规格：docs 未提
- 当前代码：V6 新增 + `AdminAuditController`
- 目标规格：补入本规格（05 §5 已补）
- 优先级：P2
- **状态**：`CONFIRMED`（已补入规格）

#### G6 · 还款申报
- 涉及：04 §C5 / `t_customer_repay_request`
- 当前规格：docs 未提
- 当前代码：V8 新增 + 确认/驳回
- 目标规格：补入 04 §C5（已补）
- 优先级：P1
- **状态**：`CONFIRMED`

#### G7 · 订单渠道
- 涉及：03 §B7 / `source_channel`
- 当前规格：docs 未提
- 当前代码：V8 新增 `source_channel/source_channel_note`
- 目标规格：补入数据字典（03 §B7 已列）
- 优先级：P2
- **状态**：`CONFIRMED`

#### G8 · 待完善商家
- 涉及：04 §C1 / ADR-0005 / `Merchant`
- 当前规格：docs R1/R9 详述
- 当前代码：Merchant 有 status/source/from_order_id，但无 pending 端点、create 不生成 pending 商家
- 目标规格：按 ADR-0005（pending 不进搜索、无电话不通知）
- 修复方案：补 pending 生成 + 补全端点（04 §C1）
- 优先级：P0
- 依赖：U-07（B3 暂缓）
- 迭代：未来批次
- 验收：A16, A28
- **状态**：`NOT_IMPLEMENTED`

#### G9 · settle_method
- 涉及：03 §B1 / `Order`
- 当前规格：docs R5 要求落库 `t_order.settle_method`
- 当前代码：无此字段，complete/finish 不保存 method
- 目标规格：**改为放支付记录/流水，不放 t_order**（03 §B1 采纳审查建议）
- 修复方案：从待办移除 t_order 字段；确认流水记录 method 已覆盖需求
- 优先级：P1
- 依赖：U-06
- 验收：A22, A24
- **状态**：`UNDECIDED`（待用户确认 U-06）

#### G10 · 商家自定义字段
- 涉及：03 §B3.3 / ADR-0003
- 当前规格：docs R9 要求 `t_merchant_field` CRUD
- 当前代码：V3 已建表，但无 CRUD；字段定义硬编码前端
- 目标规格：待用户决定保留表+CRUD 或维持硬编码
- 修复方案：见 U（03 §B3.3）
- 优先级：P2
- **状态**：`UNDECIDED`

#### G11 · SVG 清洗
- 涉及：04 §C4 / 05 §3 / `UploadService`
- 当前规格：docs R8 要求 sanitize；本次审查建议默认禁止
- 当前代码：普通上传白名单不含 SVG（实际禁止）；服务类型图标上传另走路径
- 目标规格：待 U-05 裁决
- 修复方案：按裁决统一（禁止 or 清洗）
- 优先级：P1
- 依赖：U-05
- 验收：A26
- **状态**：`UNDECIDED`

#### G12 · schema 快照
- 涉及：03 §B5 / ADR（无）
- 当前规格：docs R8 要求 `schema_snapshot`
- 当前代码：`service_details` 存 `t_order`，无快照、无独立表
- 目标规格：建 `t_order_service` 存快照（03 §B5）
- 修复方案：新增 Flyway 迁移 + 下单写快照
- 优先级：P1
- 验收：A25
- **状态**：`NOT_IMPLEMENTED`

#### G13 · 时区
- 涉及：02 §A4 / ADR-0004 / `HealthService`
- 当前规格：docs R6 + 本规格 7 条
- 当前代码：`HealthService` 用 `LocalDate.now()`（服务器默认时区）
- 目标规格：应用层显式 Asia/Shanghai；DB 存 UTC 待裁决
- 修复方案：先改统计切日（B4）；DB 存 UTC 见 U-03
- 优先级：P0（财务统计口径）
- 依赖：U-03
- 验收：A19, A20
- **状态**：`IMPLEMENTATION_GAP`

#### G14 · t_order_service 表
- 涉及：03 §B5
- 当前规格：docs R8 要求
- 当前代码：未建表
- 目标规格：按 03 §B5 建表
- 优先级：P1
- **状态**：`NOT_IMPLEMENTED`

#### G15 · t_merchant_field 表
- 涉及：03 §B3.3
- 当前规格：docs R9 要求
- 当前代码：V3 已建表，无 CRUD
- 目标规格：同 G10
- 优先级：P2
- **状态**：`IMPLEMENTATION_GAP`

#### G16 ·（新增）权限码数量不一致
- 涉及：02 §A8.2
- 当前规格：旧 domain.md 声称 27 项
- 当前代码：实际 15 项
- 目标规格：以 15 项为唯一权威清单（02 §A8.2）
- 修复方案：旧表述作废；核对前端菜单/种子是否多用或漏用
- 优先级：P0（权限是安全项）
- 验收：A9
- **状态**：`IMPLEMENTATION_GAP`

#### G17 ·（新增）t_service_type 字段不全
- 涉及：03 §B4
- 当前规格：需 form_kind/schema_version/created_at/updated_at
- 当前代码：V5 建表缺这些字段
- 目标规格：新增 Flyway 迁移补齐
- 优先级：P1
- **状态**：`NOT_IMPLEMENTED`

#### G18 ·（新增）鉴权机制文档过时
- 涉及：05 §1 / `docs/design.md`
- 当前规格：05 描述全员手机号登录
- 当前代码：已删免登令牌（B2）；design.md 仍写免登令牌+staff
- 目标规格：以 05 为准
- 修复方案：design.md 标注过时或更新
- 优先级：P2
- **状态**：`IMPLEMENTATION_GAP`（文档层）

---

## 3. 优先级统计与迭代建议

| 优先级 | 漂移点 | 说明 |
|---|---|---|
| P0 | G8, G13, G16 | 权限/财务口径/待完善商家——上线前必须处理 |
| P1 | G2*, G3, G4, G6, G9, G11, G12, G14, G17, G18 | 核心一致性与功能 |
| P2 | G5, G7, G10, G15 | 优化与平台扩展 |
| DEFERRED | G1 | 规则已定，实现暂缓 |

> G2 状态已 `CONFIRMED`，列此仅为完整性。

---

## 4. UNDECIDED 汇总（必须裁决，不能长期挂起）

| U 编号 | 主题 | 关联漂移 | 裁决后动作 |
|---|---|---|---|
| U-01 | 服务类型数量与命名 | G3 | 已裁决：按实际需求增减，后台启用/停用，不固定五类 |
| U-02 | 收款方式拆分 vs 四枚举 | G9 | 决定是否改结构 |
| U-03 | DB 存 UTC vs 本地 DATETIME | G13 | 决定迁移方案 |
| U-04 | 欠款"≤0 且 ≥0"矛盾 | I-2 | 固定为欠款≥0 |
| U-05 | SVG 禁止 vs 清洗 | G11 | 统一上传策略 |
| U-06 | settle_method 归属 | G9 | 确认放流水 |
| U-07 | 多商家规则定但实现暂缓 | G1, G8 | 确认排期 |
| U-08 | 四类/七态分类层次 | 01 §0.2 | 确认分类法 |
| U-09 | 是否增加 IN_SERVICE 状态 | 02 §A2.2 | 判断服务阶段 |
| U-10 | `t_merchant_field` 保留+CRUD 或硬编码 | G10/G15 | 决定方案 |
| U-11 | F2 各附件类型数量上限具体数字 | 04 §C4.3 | 填验收数字 |

> U-10 正文见 `03-data-model.md §B3.3`（`t_merchant_field` 保留+CRUD 或维持硬编码）；U-11 正文见 `04-api.md §C4.3`（九类附件逐项数量上限）。两者裁决后同步更新本表与对应正文。

> 每个 U 编号裁决后，须新增 ADR 记录并更新引用它的所有文档（宪法 §6）。
