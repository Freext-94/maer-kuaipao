-- ===================================================================
-- V11 · 商品统一由管理员配置，删除商家常用商品
-- 1) 商品由管理员在系统配置里统一维护，t_goods 不再按商家归属；
--    清理历史商家商品数据，删除 merchant_id 及其索引；
-- 2) t_order_item.goods_id 全项目没有写入路径（商品是 goods_text 文本快照），
--    删除这个残留字段。
-- ===================================================================

DELETE FROM t_goods WHERE merchant_id IS NOT NULL;

ALTER TABLE t_goods DROP INDEX idx_goods_merchant;

ALTER TABLE t_goods
  DROP COLUMN merchant_id,
  COMMENT = '管理员配置的默认商品，点选只是快捷方式：下单允许自由文本';

ALTER TABLE t_order_item DROP COLUMN goods_id;
