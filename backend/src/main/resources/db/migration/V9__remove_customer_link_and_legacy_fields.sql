-- ===================================================================
-- V9 · 删除已取消功能与旧状态机遗留
-- 1) 客户专属链接：功能取消，删除 t_customer_link 与 link.manage 权限；
-- 2) 商家端代下：仅保留商家工作台，不保留代下入口；
-- 3) 旧状态机：删除 t_merchant_prep 和 t_order 上不再写入的时间字段；
-- 4) v_customer_balance 引用了 V3 已删除的 credit_limit_fen，且代码不依赖，直接删除。
-- ===================================================================

DROP VIEW IF EXISTS v_customer_balance;

DROP TABLE IF EXISTS t_customer_link;

DELETE FROM t_role_permission
WHERE permission_id IN (SELECT id FROM t_permission WHERE code = 'link.manage');
DELETE FROM t_permission WHERE code = 'link.manage';

DROP TABLE IF EXISTS t_merchant_prep;

ALTER TABLE t_order
  DROP COLUMN notified_at,
  DROP COLUMN ready_at,
  DROP COLUMN delivering_at;
