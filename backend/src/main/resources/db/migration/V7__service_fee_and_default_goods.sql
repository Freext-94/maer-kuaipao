-- 服务类型基础费 + 默认商品（不与商家关联）
ALTER TABLE t_service_type ADD COLUMN base_fee_fen BIGINT NOT NULL DEFAULT 1000 AFTER flow_kind;

UPDATE t_service_type SET base_fee_fen = 1000 WHERE code = 'buy';
UPDATE t_service_type SET base_fee_fen = 1500 WHERE code = 'pickup';
UPDATE t_service_type SET base_fee_fen = 1800 WHERE code = 'errand';
UPDATE t_service_type SET base_fee_fen = 2000 WHERE code = 'transfer';
UPDATE t_service_type SET base_fee_fen = 3000 WHERE code = 'driver';

ALTER TABLE t_goods MODIFY COLUMN merchant_id BIGINT NULL;
