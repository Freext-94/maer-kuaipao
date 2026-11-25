> ⚠️ **已迁移 · 勿用**：本文件内容已并入 `03-data-model.md`（B1–B7）与 `08-architecture.md`（迁移回滚）。唯一真源以 01–08 号基线文档为准。本文件仅为历史归档。

# 数据模型字典（反向自 V1–V8，已迁移）

> 所有表 `utf8mb4`，金额字段 `BIGINT`（分）。主数据带 `creator/create_time/updater/update_time/deleted`；台账/状态日志/核销分配表只追加、无 `deleted`。

## 核心表

### t_order（订单主表）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| order_no | VARCHAR | 单号，前缀可配（默认 MR） |
| source | VARCHAR | 来源 |
| source_channel | VARCHAR | 联系渠道 |
| source_channel_note | VARCHAR | 其他渠道补充 |
| service_type | VARCHAR | 服务类型码 |
| service_details | JSON | 服务专属信息（V6） |
| created_by_user_id | BIGINT | |
| customer_id | BIGINT | |
| merchant_id | BIGINT NULL | 主商家/兼容 |
| rider_id | BIGINT NULL | |
| address_snapshot | TEXT (JSON) | 地址快照 |
| goods_est_fen | BIGINT | 货款估价 |
| goods_real_fen | BIGINT NULL | 实付货款（NULL=未录） |
| service_fee_fen | BIGINT | 服务费（界面按业务显示跑腿费/代办费/代驾费等） |
| extra_fee_fen | BIGINT | 附加服务费 |
| status | VARCHAR | 状态码 |
| note | TEXT | 客户交代；「什么时候要」功能已取消（V14 删除 expect_desc） |
| cancel_code / cancel_text | VARCHAR | |
| period_month | VARCHAR | |
| dispatched_at … finished_at / cancelled_at | DATETIME | 时间戳 |
| creator / create_time / updater / update_time | | |

> 待补（B4）：`settle_method VARCHAR(16)`（wechat/alipay/cash/credit）。

### t_order_merchant（订单商家组）— V6 基础，待扩展（B3）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK | |
| order_id | BIGINT | |
| merchant_id | BIGINT | |
| prep_status | VARCHAR | pending/ready/cancelled/picked（V6 简化） |
| picked_goods_fen | BIGINT NULL | 该组实付 |
| note | VARCHAR | |
| create_time / update_time | DATETIME | |

> 待扩展（B3-V9）：`seq`、`merchant_name`、`merchant_phone`、`merchant_category`、`source`、`goods_est_fen`、`goods_real_fen`、`receipt_attachment_id`、`notified_at`、`ready_at`、`picked_at`；唯一键改为 `(order_id, seq)`。

### t_order_item
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id | | |
| order_merchant_id | BIGINT NULL | 待补（B3） |
| goods_text | VARCHAR | 买什么 |
| qty / unit_est_fen / unit_real_fen | | |

### t_advance（垫付）
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id / merchant_id | | |
| amount_fen / method / voucher_attachment_id | | |
| recovered_fen / loss_fen / status | | |
| creator / create_time | | |

> 唯一键 `(order_id, merchant_id)`（V6 调整）。

### t_merchant（商家/门店）
| 字段 | 类型 | 说明 |
|---|---|---|
| id / name / category / phone / address | | |
| prep_timeout_min | INT | |
| status | VARCHAR | pending/active/paused |
| source | VARCHAR | user/order/migrate |
| from_order_id | BIGINT NULL | |
| extra_json | TEXT (JSON) | 自定义字段值 |
| owner_user_id | BIGINT NULL | |
| creator / create_time / updater / update_time / deleted | | |

> 待补（B5）：`t_merchant_field` 表（自定义字段定义）尚未创建。

### t_merchant_category / t_merchant_category_rel

> 种子类目（V12/V16 更新）：supermarket(超市)、fresh(生鲜)、pharmacy(药店)、convenience(便利店)、food(餐饮)、fruit(水果)、cake(蛋糕店)、coffee(咖啡厅)、milk_tea(奶茶店)、tobacco_alcohol(烟酒)、other(其他)。类目名用中文，类目码用英文短码（与 coffee/cake 一致）；V16 修正了烟酒类目遗留的自动生成数字 code。
| 表 | 字段 |
|---|---|
| t_merchant_category | id, code, name, sort_no, enabled |
| t_merchant_category_rel | id, merchant_id, category_id |

### t_customer
| 字段 | 类型 | 说明 |
|---|---|---|
| id / user_id / note | | |
| （已删除）billing_cycle / credit_limit_fen / settle_day | | V2 删除 |

### t_user / t_user_role
| 表 | 字段 |
|---|---|
| t_user | id, phone (唯一), password_hash, name, status, remark, last_login_at, creator, create_time, updater, update_time（V10 删除 must_change_password） |
| t_user_role | id, user_id, role, scope_merchant_id |

### t_permission / t_role_permission
| 表 | 字段 |
|---|---|
| t_permission | id, code, name, grp, sort_no |
| t_role_permission | role, permission_id (或 permission_code) |

### t_service_type
| 字段 | 类型 | 说明 |
|---|---|---|
| id / code (唯一) / name / icon_path | | |
| flow_kind | VARCHAR | buy/service |
| form_kind | — | 待补（B5），当前无此字段 |
| form_schema | TEXT (JSON) | 额外表单字段 |
| base_fee_fen | BIGINT | |
| sort_no / enabled | | |

### t_ledger_entry（台账，只追加）
| 字段 | 类型 | 说明 |
|---|---|---|
| id / customer_id / order_id | | |
| type | VARCHAR | CHARGE/PAYMENT/ADJUST/WAIVE/REFUND |
| amount_fen | BIGINT | CHARGE 正，PAYMENT 负 |
| method | VARCHAR | wechat/alipay/cash |
| note / operator | VARCHAR | |
| occurred_at / period_month | | |
| idempotency_key | VARCHAR | |

### t_attachment
| 字段 | 类型 | 说明 |
|---|---|---|
| id / biz_type / biz_id / storage_path / file_name / content_type / sort_no | | |

### t_order_edit_log
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id / editor / at / action / before_json / after_json / reason | | |

### t_order_status_log
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id / from_status / to_status / action / actor_name / actor_role / reason / occurred_at / creator | | |

### t_notify_record
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id / channel / status / payload / created_at | | |

### t_rider_task
| 字段 | 类型 | 说明 |
|---|---|---|
| id / order_id / rider_id / status / picked_at / delivered_at / assigned_by_user_id / creator / create_time | | |

### t_address
| 字段 | 类型 | 说明 |
|---|---|---|
| id / customer_id / contact_name / contact_phone / poi / detail / floor / elevator / is_default | | |

### t_setting
| 字段 | 类型 | 说明 |
|---|---|---|
| key / value | | order_no_prefix, default_service_fee_fen |

### t_audit_log
| 字段 | 类型 | 说明 |
|---|---|---|
| id / actor_user_id / actor_name / http_method / request_path / response_status / occurred_at | | |

### t_customer_repay_request
| 字段 | 类型 | 说明 |
|---|---|---|
| id / customer_id / amount_fen / method / status / handled_by / handled_at / create_time | | |

### 已删除的表
- `t_access_token`（V3 删除）
- `t_monthly_bill`（V2 删除）