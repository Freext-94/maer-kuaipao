# ADR-0002 状态机简化为 5 状态

## 背景
V4 迁移将 7 状态合并为 5 状态：去掉"待备货/备货完成"，合并"已送达+结单"为"配送完成"。

## 决策
采用 5 状态：PENDING / PICKING / DELIVERING / FINISHED / CANCELLED。备货状态收口到 `t_order_merchant.prep_status`，不再作为订单状态。

## 后果
- `docs/` 中 8 状态描述已过时，以代码为准。
- 商家备货进度通过商家组 `prep_status` 跟踪。