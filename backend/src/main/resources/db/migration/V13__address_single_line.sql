-- ===================================================================
-- V13 · 收货地址合并为一行文本
-- 1) t_address 拆分的联系人/电话/小区/门牌/楼层/电梯合并成一个 address 字段；
-- 2) 先按「联系人 电话 小区 门牌 N楼 有电梯」回填，避免历史地址丢失；
-- 3) 订单快照是下单时的文本副本，历史单照旧可读，新单只写 address。
-- ===================================================================

ALTER TABLE t_address
  ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT '' COMMENT '收货地址（一行文本）' AFTER customer_id;

UPDATE t_address
   SET address = CONCAT_WS(' ',
         NULLIF(contact_name, ''),
         NULLIF(contact_phone, ''),
         NULLIF(poi, ''),
         NULLIF(detail, ''),
         IF(floor > 0, CONCAT(floor, '楼'), NULL),
         IF(elevator = 1, '有电梯', NULL)
       )
 WHERE address = '';

ALTER TABLE t_address
  DROP COLUMN contact_name,
  DROP COLUMN contact_phone,
  DROP COLUMN poi,
  DROP COLUMN detail,
  DROP COLUMN floor,
  DROP COLUMN elevator;
