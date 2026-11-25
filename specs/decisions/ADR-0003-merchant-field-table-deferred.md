# ADR-0003 商家自定义字段表推迟到 B5

## 背景
docs R9 要求 `t_merchant_field` 表 + 自定义字段 CRUD，但代码未实现。

## 决策
推迟到 B5 迭代；当前 `t_merchant.extra_json` 已可存值，字段定义先硬编码在前端，B5 再建表与 CRUD。

## 后果
- B5 迭代需新建 `t_merchant_field` 表 + Flyway 迁移。
- 一期只做 8 种字段类型（text/textarea/number/phone/date/select/multiselect/switch）。