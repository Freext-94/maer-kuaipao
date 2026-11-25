-- ===================================================================
-- V5 · 动态服务类型（P5 多业务）
-- 5 类业务：代买（有商家、垫资）/ 代取送 / 代办 / 接送 / 代驾（无商家、无垫资）。
-- ===================================================================

CREATE TABLE t_service_type (
  id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  code           VARCHAR(32)  NOT NULL COMMENT '类型码 buy/pickup/errand/transfer/driver',
  name           VARCHAR(32)  NOT NULL COMMENT '显示名',
  icon_path      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '图标路径',
  flow_kind      VARCHAR(16)  NOT NULL DEFAULT 'buy' COMMENT 'buy有商家垫资/service无商家',
  form_schema    TEXT         NULL COMMENT '额外表单字段 JSON',
  sort_no        INT          NOT NULL DEFAULT 0 COMMENT '排序',
  enabled        TINYINT      NOT NULL DEFAULT 1 COMMENT '是否启用',
  PRIMARY KEY (id),
  UNIQUE KEY uk_st_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务类型：代买/代取送/代办/接送/代驾';

INSERT INTO t_service_type (code, name, flow_kind, sort_no) VALUES
  ('buy', '代买', 'buy', 1),
  ('pickup', '代取送', 'service', 2),
  ('errand', '代办', 'service', 3),
  ('transfer', '接送', 'service', 4),
  ('driver', '代驾', 'service', 5);

-- 订单加服务类型；旧单回填 buy
ALTER TABLE t_order ADD COLUMN service_type VARCHAR(32) NOT NULL DEFAULT 'buy' COMMENT '服务类型码' AFTER source;
UPDATE t_order SET service_type = 'buy' WHERE service_type = '';

-- 订单的商家可空（无商家业务）——旧单都有商家，保留非空约束不变会拦新无商家单，这里放宽
ALTER TABLE t_order MODIFY COLUMN merchant_id BIGINT NULL COMMENT '商家ID，无商家业务可空';
