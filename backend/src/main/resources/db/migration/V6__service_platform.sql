-- Expand the single-city service platform without changing existing order and ledger history.
ALTER TABLE t_order
  ADD COLUMN service_details JSON NULL COMMENT '服务类型专属信息快照' AFTER service_type,
  ADD COLUMN extra_fee_fen BIGINT NOT NULL DEFAULT 0 COMMENT '额外服务费用（分）' AFTER service_fee_fen;

CREATE TABLE t_order_merchant (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  merchant_id BIGINT NOT NULL,
  prep_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  picked_goods_fen BIGINT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  create_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  update_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_merchant (order_id, merchant_id),
  KEY idx_order_merchant (merchant_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单涉及的商家及分组履约状态';

INSERT IGNORE INTO t_order_merchant (order_id, merchant_id, prep_status, picked_goods_fen)
SELECT id, merchant_id, 'pending', goods_real_fen FROM t_order WHERE merchant_id IS NOT NULL;
ALTER TABLE t_advance DROP INDEX uk_advance_order,
  ADD UNIQUE KEY uk_advance_order_merchant (order_id, merchant_id);

CREATE TABLE t_customer_link (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  permissions VARCHAR(32) NOT NULL DEFAULT 'order',
  expires_at datetime(3) NULL,
  revoked_at datetime(3) NULL,
  last_used_at datetime(3) NULL,
  creator VARCHAR(64) NOT NULL DEFAULT '',
  create_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_link_hash (token_hash),
  KEY idx_customer_link (customer_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户专属免登录链接，仅限下单和查单';

CREATE TABLE t_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT NOT NULL DEFAULT 0,
  actor_name VARCHAR(64) NOT NULL DEFAULT '',
  http_method VARCHAR(8) NOT NULL,
  request_path VARCHAR(255) NOT NULL,
  response_status INT NOT NULL DEFAULT 200,
  occurred_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_time (occurred_at),
  KEY idx_audit_actor (actor_user_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台写操作审计，只记录路径和操作者，不记录密码等请求体';

ALTER TABLE t_user_role MODIFY COLUMN role VARCHAR(24) NOT NULL COMMENT 'super_admin/admin/rider/merchant/customer';
UPDATE t_service_type SET enabled = 0 WHERE code = 'transfer';
UPDATE t_user_role SET role = 'super_admin'
WHERE id = (SELECT id FROM (SELECT id FROM t_user_role WHERE role = 'admin' ORDER BY user_id, id LIMIT 1) first_admin);
INSERT IGNORE INTO t_permission (code, name, grp, sort_no) VALUES
  ('platform.manage', '平台配置与管理员管理', '平台', 1),
  ('service.manage', '服务类型管理', '平台', 2),
  ('link.manage', '客户下单链接管理', '客户', 22),
  ('audit.view', '操作记录查看', '系统', 53);
