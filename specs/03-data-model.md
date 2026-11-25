# 03 · 数据模型（Data Model）

> **对应审查条目**：B1–B6。
> **原则**：数据一致、向后兼容。字段必须有唯一数据来源；规格定义了但数据库没有、或 API 允许传入但数据库不存的字段，都是缺陷。
> **约定**：所有表 `utf8mb4`；金额字段 `BIGINT`（分）；主数据带 `creator/create_time/updater/update_time/deleted`；台账/状态日志/分配表只追加、无 `deleted`。结构唯一真源是 `backend/src/main/resources/db/migration/`（V1–V10），已执行迁移不可修改（见 08 §F18）。V9 删除客户链接/备货遗留/旧时间字段；V10 删除 `t_user.must_change_password`（不做强制改密）与 `platform.manage` 权限码。

---

## B1 · `t_order` 待补字段

### B1.1 `settle_method`（结算方式）— 归属争议

**原 spec（G9）**：`t_order` 增加 `settle_method VARCHAR(16)`（wechat/alipay/cash/credit）。

**本次审查建议（`PROPOSED`，本规格采纳）**：**不要**把 `settle_method` 放在 `t_order`。理由：
- 一张订单可能存在多次收款、甚至不同渠道组合（扫码 20 + 现金 10 + 欠款 5）；
- 订单只有一个 `settle_method` 无法准确表达组合收款。

**推荐做法**：
- 收款方式放入**支付记录 / 资金流水表**（`t_ledger_entry.method` 已有此能力，见 B1.3）；
- 每笔收款单独记录渠道；
- 订单只保留必要的**结算状态或汇总数据**（如 `paid_fen` 汇总由流水派生，不落库）；
- 汇总数据不能取代原始流水。

> **U-06（本规格倾向）**：采纳"放流水不放订单"。请用户确认后，从 B4 待办中移除"t_order.settle_method"。裁决前，代码现状（无此字段）视为与推荐方向一致。

### B1.2 `discount_fen`（优惠）

- 一期不启用（见 02 §A3.2）。若字段保留，恒为 0，API 拒绝非零。
- **一致性要求**：不能出现"docs 定义了字段、数据库没有、API 却允许传入"的情况。三者必须一致（`CONFIRMED`）。

### B1.3 唯一数据来源原则（本次强化）

| 数据 | 权威来源 | 派生/缓存 |
|---|---|---|
| 客户欠款余额 | `t_ledger_entry` 之和 | 快照（可重建，一期不做） |
| 订单应收 | ledger 派生（CHARGE+ADJUST+WAIVE） | OrderView 展示值 |
| 已收 / 未收 | ledger PAYMENT 之和 | OrderView 展示值 |
| 收款方式 | `t_ledger_entry.method`，每笔一条 | 订单汇总（不落库） |

---

## B2 · `t_order_merchant` 扩展（`DEFERRED`，见 02 §A5）

### B2.1 推荐字段（一期高优先级，保留 B3 扩展计划）

| 字段 | 类型建议 | 作用 |
|---|---|---|
| seq | INT | 商家组顺序（订单内唯一，从 1 开始） |
| name | VARCHAR | 商家名称（必填） |
| phone | VARCHAR | 联系电话（选填） |
| category | VARCHAR | 商家类别 |
| source | VARCHAR | 商家来源（existing/manual/pending） |
| goods_est_fen | BIGINT | 预估货款 |
| goods_real_fen | BIGINT | 实际货款（确认后锁定） |
| receipt | VARCHAR | 取货凭证（关联文件记录） |
| notified_at | DATETIME | 通知时间 |
| ready_at | DATETIME | 备货完成时间 |
| picked_at | DATETIME | 实际取货时间 |

### B2.2 额外约束（`PROPOSED`）

1. 每个商家组必须属于一个订单；
2. 每个商家组拥有独立状态；
3. 实际货款确认后锁定（呼应 I-1）；
4. 取货凭证必须关联文件记录（不能只存字符串）；
5. 商家组删除不能破坏订单商品及财务流水关联；
6. `seq` 应有订单内唯一性约束。

### B2.3 `t_order_item.order_merchant_id`（必须补，`PROPOSED` 高优先级）

- `t_order_item` 增加 `order_merchant_id BIGINT NULL`；
- 这不是普通扩展，而是**多商家订单的数据关系基础**（见 02 §A5.3）；
- 当前表有此字段（V4 已加），但需确认所有写入路径都正确填充。

---

## B3 · `t_merchant` 待补

### B3.1 基础信息字段（`CONFIRMED`，V3 已有）

- `status`（pending/active/paused）
- `source`（user/order/migrate）
- `from_order_id`（来源订单）
- `owner_user_id`（主账号）
- `created_at` / `updated_at`

### B3.2 动态扩展信息（`PROPOSED`）

- 营业时间
- 备货超时（`prep_timeout_min` 已有）
- 商家类别（关系表 `t_merchant_category_rel` 已有）
- 备注
- 其他业务属性（`extra_json`）

### B3.3 `t_merchant_field`（暂不决定，`UNDECIDED`）

- **本规格建议**：暂不直接决定创建 `t_merchant_field` 表。
- 现状：ADR-0003 决定推迟到 B5 建表；V3 迁移实际已创建该表（字段：`field_key/label/type/required/options_json/sort_no/enabled`），但无 CRUD。
- 需用户确认：是保留表并补 CRUD，还是维持"字段定义硬编码在前端"。见 07-gaps.md G10/G15。

### B3.4 `extra_json` 约束（`PROPOSED`）

- 增加 **JSON Schema 定义和版本号**；
- 禁止任意格式写入；写入前按 schema 校验。

---

## B4 · `t_service_type` 待补

### B4.1 推荐完整结构（`PROPOSED`）

```
t_service_type
├── id
├── code             唯一，创建后不可改
├── name
├── icon_path
├── flow_kind        业务流程
├── form_kind        页面模板（待补）
├── form_schema      动态字段 JSON
├── schema_version   表单版本（待补）
├── base_fee_fen     默认基础费用
├── sort_no
├── enabled
├── created_at       （待补）
└── updated_at       （待补）
```

**字段职责**：
- `form_kind` 控制页面模板（`buy`/`route`/`driver`/`blank`）；
- `form_schema` 控制动态字段；
- `schema_version` 控制表单版本；
- `base_fee_fen` 控制默认基础费用。

### B4.2 迁移要求（`CONFIRMED` 原则）

- 必须通过 **Flyway Migration 新增脚本**补充字段（如 V9）；
- **不要直接修改已经执行过的历史 Flyway 迁移文件**（V1–V5 不动）。

> 当前 V5 已建 `t_service_type`，但缺 `form_kind`、`schema_version`、`created_at`、`updated_at`（`base_fee_fen` 已存在于 data-model 描述，需核对数据库实际）。见 07-gaps.md G17。

---

## B5 · `t_order_service` 表（新建，`PROPOSED`）

### B5.1 建表目的

独立存储服务订单信息，解决"配置变更后历史订单无法正确展示"的问题。

### B5.2 推荐字段（`PROPOSED`）

| 字段 | 说明 |
|---|---|
| id | 主键 |
| order_id | 关联订单 |
| service_type_id | 关联服务类型 |
| schema_snapshot | **下单时的表单结构快照**（含 label/type） |
| service_data | 按 schema 填写的值 |
| schema_version | 表单版本 |

### B5.3 `schema_snapshot` 的重要性（核心理由）

> 客户 2026 年提交的代驾订单，到了 2027 年管理员修改了代驾表单，历史订单仍必须能够按照 2026 年的表单结构正确展示。

因此：
- 每次下单把当时的 `form_schema` 复制一份存进 `schema_snapshot`；
- 历史订单详情按快照渲染，不读当前服务类型配置；
- 服务类型禁用/改版不影响历史订单（呼应 A6.2 约束 5）。

> 当前代码：`service_details` 存在 `t_order`，但无快照、无独立表。见 07-gaps.md G12/G14。

---

## B6 · 已删除表（保留删除决定 + 证据核查）

### B6.1 处置表

| 表 | 建议 |
|---|---|
| `t_access_token` | 确认是否已由当前认证机制（Sa-Token）替代 |
| `t_monthly_bill` | 确认是否可由资金流水生成月度账单 |

### B6.2 证据核查要求（`PROPOSED`，重要）

**不要仅凭当前代码没有引用，就认为历史表没有价值。** 删除前必须：
1. 检查 Flyway 历史迁移（`V3` 已执行 `DROP`）；
2. 检查数据库中是否仍有相关数据；
3. 检查 API 和前端是否存在隐性依赖；
4. 确认不再需要后，保持删除状态，不因"预留功能"恢复。

> 现状：客户专属链接功能已取消，`t_customer_link` 由 V9 删除（见 ADR-0001 废止说明）；`t_access_token` 也保持删除状态。客户自助下单继续使用 `/api/c/orders` 登录态入口，不再提供免登链接。

---

## B8 · 2026-11-23 迭代变更（V12 / V13 / V16，`CONFIRMED`）

### B8.1 商家类目调整（V12 / V16）
- `超市生鲜` 拆分为 `超市` (supermarket) + `生鲜` (fresh) 两个独立类目
- `烟酒` 类目名称保持中文 `烟酒`，类目码为英文 `tobacco_alcohol`（V12 曾把名称改成英文且遗留自动生成的数字 code，V16 统一修正）
- 新增类目：`蛋糕店` (cake)、`咖啡厅` (coffee)、`奶茶店` (milk_tea)
- sort_no 重排，保持 `other` 末尾

### B8.2 收货地址合并为一行（V13）
- `t_address` 新增 `address VARCHAR(255)` 单行文本字段
- 历史 `contact_name/phone/poi/detail/floor/elevator` 合并回填到 `address`
- 旧列删除，新订单只写 `address`
- `t_order.address_snapshot` 历史单照旧可读，新单只写 address

### B8.3 订单来源判定（A3.3 / 02 §A?）
- `t_order.source` 由 `source_channel` 推导：`customer_*` → `online`，其余 → `phone`
- 不再独立传入 `source`

### B8.4 商家类目词条维护（`CONFIRMED`）
- 设置 > 商家类目：超级管理员可新增/编辑/删除词条，普通管理员与其他角色只读
- 类目名用中文、类目码必填小写英文短码（`[a-z][a-z0-9_]*`，如 `coffee`、`tobacco_alcohol`），不再自动生成数字码
- 删除类目时同步清理 `t_merchant_category_rel` 关联；类目码重复时拒绝保存

## B7 · 现有表字典（沿用，未变更部分）

> 完整字段字典见旧版 `data-model.md` 内容，已并入本文件；以下为核心表索引，字段细节以数据库 V1–V9 迁移为准。

| 分类 | 表 |
|---|---|
| 订单 | `t_order`、`t_order_item`、`t_order_merchant`、`t_order_service`(B5待建)、`t_order_edit_log`、`t_order_status_log`、`t_advance` |
| 客户/地址 | `t_customer`、`t_address`、`t_customer_repay_request` |
| 商家 | `t_merchant`、`t_merchant_category`、`t_merchant_category_rel`、`t_merchant_field` |
| 用户/权限 | `t_user`、`t_user_role`、`t_permission`、`t_role_permission` |
| 服务类型 | `t_service_type` |
| 资金 | `t_ledger_entry`（只追加）、`t_ledger_allocation`（派生） |
| 文件/通知 | `t_attachment`、`t_notify_record` |
| 骑手 | `t_rider_task` |
| 系统 | `t_setting`、`t_audit_log` |

**已删除对象**：`t_monthly_bill`（V3）、`t_access_token`（V3）、`t_customer_link`（V9）、`t_merchant_prep`（V9）、`v_customer_balance`（V9）、`t_quick_phrase`（V17）。`t_order.notified_at / ready_at / delivering_at` 亦由 V9 删除。
