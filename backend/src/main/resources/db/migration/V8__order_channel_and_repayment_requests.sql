ALTER TABLE t_order
  ADD COLUMN source_channel VARCHAR(32) NOT NULL DEFAULT '' COMMENT '订单联系渠道' AFTER source,
  ADD COLUMN source_channel_note VARCHAR(128) NOT NULL DEFAULT '' COMMENT '其他联系渠道补充' AFTER source_channel;

CREATE TABLE t_customer_repay_request (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  amount_fen BIGINT NOT NULL,
  method VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  handled_by VARCHAR(64) NOT NULL DEFAULT '',
  handled_at datetime(3) NULL,
  create_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_repay_customer_status (customer_id, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户还款申报，管理员确认后才写入正式账本';
