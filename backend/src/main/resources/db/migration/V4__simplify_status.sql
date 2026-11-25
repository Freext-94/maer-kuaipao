-- ===================================================================
-- V4 · 状态机简化（P1）
-- 7 状态 → 5 状态：去掉「待备货/备货完成」，合并「已送达+结单」为「配送完成」。
-- 映射：
--   PENDING_DISPATCH          -> PENDING    待派单
--   PENDING_PREP              -> PICKING    取货中
--   READY_FOR_PICKUP          -> PICKING    取货中
--   PICKED_UP                 -> DELIVERING 配送中
--   DELIVERING                -> DELIVERING 配送中
--   DELIVERED                 -> FINISHED   已完成（历史已送达未结单的单直接算完成，欠款在账单里补收）
--   FINISHED / CANCELLED      保持不变
-- ===================================================================

UPDATE t_order SET status = 'PENDING'    WHERE status = 'PENDING_DISPATCH';
UPDATE t_order SET status = 'PICKING'    WHERE status IN ('PENDING_PREP', 'READY_FOR_PICKUP');
UPDATE t_order SET status = 'DELIVERING' WHERE status IN ('PICKED_UP', 'DELIVERING');
UPDATE t_order SET status = 'FINISHED'   WHERE status = 'DELIVERED';

-- 状态日志里的旧状态码也一并归一，方便轨迹按新状态着色
UPDATE t_order_status_log SET from_status = 'PENDING'    WHERE from_status = 'PENDING_DISPATCH';
UPDATE t_order_status_log SET to_status   = 'PENDING'    WHERE to_status   = 'PENDING_DISPATCH';
UPDATE t_order_status_log SET from_status = 'PICKING'    WHERE from_status IN ('PENDING_PREP', 'READY_FOR_PICKUP');
UPDATE t_order_status_log SET to_status   = 'PICKING'    WHERE to_status   IN ('PENDING_PREP', 'READY_FOR_PICKUP');
UPDATE t_order_status_log SET from_status = 'DELIVERING' WHERE from_status IN ('PICKED_UP', 'DELIVERED');
UPDATE t_order_status_log SET to_status   = 'DELIVERING' WHERE to_status   IN ('PICKED_UP', 'DELIVERED');
UPDATE t_order_status_log SET to_status   = 'FINISHED'   WHERE to_status   = 'DELIVERED';

-- 商家备货表已不需要，停用（保留表结构不删，历史数据可查）
UPDATE t_merchant_prep SET status = 'cancelled' WHERE status NOT IN ('cancelled');
