-- ===================================================================
-- 演示数据（可选）：想在空系统里先点几单、看看台账和对账单长什么样，用它。
--
-- 顺序必须是：
--   1) 先启动一次后端 —— Flyway 建表，并自动创建调度台初始账号 13800000000
--   2) 导入本文件
--   3) 调一次「重算核销」：POST /api/admin/ledger/rebuild
--      下面的流水是直接 INSERT 的，而「哪笔付款冲了哪张单」是派生数据，必须重算一次
--
-- 所有 ID 占 900+ 段，避免和第 1 步自增生出来的记录撞主键。
-- 用完怎么删干净见文件末尾。
-- ===================================================================
SET NAMES utf8mb4;

INSERT INTO t_user (id, phone, name, password_hash, status, remark, creator) VALUES
  (901, '13512340001', '王姐', '', 'active', '演示数据', 'demo'),
  (902, '13512340002', '张哥', '', 'active', '演示数据', 'demo'),
  (903, '13512340003', '李叔', '', 'active', '演示数据', 'demo'),
  (904, '13512340004', '陈女士', '', 'active', '演示数据', 'demo'),
  (905, '13700001111', '小李', '', 'active', '演示数据', 'demo');

INSERT INTO t_user_role (user_id, role, scope_merchant_id, creator) VALUES
  (901, 'customer', 0, 'demo'),
  (902, 'customer', 0, 'demo'),
  (903, 'customer', 0, 'demo'),
  (904, 'customer', 0, 'demo'),
  (905, 'rider', 0, 'demo');

INSERT INTO t_merchant (id, name, category, phone, address, prep_timeout_min, status, creator) VALUES
  (901, '瑞雪生鲜超市', '超市', '13908001111', '科华北路 62 号', 15, 'active', 'demo'),
  (902, '康泰大药房（科华店）', '药店', '13908002222', '科华北路 88 号', 8, 'active', 'demo'),
  (903, '巷口水果铺', '水果', '13908003333', '玉林西路 12 号', 10, 'active', 'demo');

-- 演示商家挂到类目字典（超市 / 药店 / 水果）
INSERT INTO t_merchant_category_rel (merchant_id, category_id)
SELECT 901, id FROM t_merchant_category WHERE code = 'supermarket'
UNION ALL SELECT 902, id FROM t_merchant_category WHERE code = 'pharmacy'
UNION ALL SELECT 903, id FROM t_merchant_category WHERE code = 'fruit';

INSERT INTO t_customer (id, user_id, note, creator) VALUES
  (901, 901, '老客户，经常赊账', 'demo'),
  (902, 902, '货到付款，从不赊账', 'demo'),
  (903, 903, '每月 10 号统一转账', 'demo'),
  (904, 904, '新客，先少量挂账', 'demo');

INSERT INTO t_address (id, customer_id, address, is_default, creator) VALUES
  (901, 901, '王姐 13512340001 天府新城 B 区 3 栋 3 单元 1802 18楼 有电梯', 1, 'demo'),
  (902, 901, '王姐老公 13512340009 科华路小学 放门卫室', 0, 'demo'),
  (903, 902, '张哥 13512340002 锦绣花园 7 栋 7-2-301 3楼 有电梯', 1, 'demo'),
  (904, 903, '李叔 13512340003 华西宿舍 2 栋 2-1-45 4楼', 1, 'demo'),
  (905, 904, '陈女士 13512340004 汇日央扩 16 楼前台代收 16楼 有电梯', 1, 'demo');

-- 默认商品由管理员统一维护，不与商家关联
INSERT INTO t_goods (name, spec, est_price_fen, on_sale, sort_no, creator) VALUES
  ('鸡蛋', '一板 30 枚', 2200, 1, 1, 'demo'),
  ('牛奶', '950ml', 1200, 1, 2, 'demo'),
  ('大米', '10 斤', 5800, 1, 3, 'demo'),
  ('降压药', '按处方', 0, 1, 4, 'demo'),
  ('西瓜', '个', 3000, 1, 5, 'demo'),
  ('车厘子', '2 斤', 9800, 1, 6, 'demo');

-- 三张已结清的历史单：让台账和对账单一开门就有内容可看
INSERT INTO t_order (id, order_no, source, created_by_user_id, customer_id, merchant_id, rider_id,
  address_snapshot, goods_est_fen, goods_real_fen, service_fee_fen, status, note,
  period_month, dispatched_at, picked_at, delivered_at, finished_at, creator) VALUES
  (901, 'PT-DEMO-0001', 'phone', 905, 901, 902, 905,
   '{"address":"天府新城 B 区 3 栋 3 单元 1802 18楼 有电梯"}',
   12800, 12800, 800, 'FINISHED', '代取降压药（刷医保卡）',
   DATE_FORMAT(NOW() - INTERVAL 6 DAY, '%Y-%m'), NOW() - INTERVAL 6 DAY,
   NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY, 'demo'),
  (902, 'PT-DEMO-0002', 'phone', 905, 904, 901, 905,
   '{"address":"汇日央扩 16 楼前台代收 16楼 有电梯"}',
   8800, 8800, 800, 'FINISHED', '纸巾囤货',
   DATE_FORMAT(NOW() - INTERVAL 5 DAY, '%Y-%m'), NOW() - INTERVAL 5 DAY,
   NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY, 'demo'),
  (903, 'PT-DEMO-0003', 'phone', 905, 903, 901, 905,
   '{"address":"华西宿舍 2 栋 2-1-45 4楼"}',
   15600, 15600, 1000, 'FINISHED', '菜油 + 鸡蛋 + 水果',
   DATE_FORMAT(NOW() - INTERVAL 12 DAY, '%Y-%m'), NOW() - INTERVAL 12 DAY,
   NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 12 DAY, 'demo');

INSERT INTO t_order_item (order_id, goods_text, qty, unit_est_fen, unit_real_fen, creator) VALUES
  (901, '代取降压药 3 盒', 1, 12800, 12800, 'demo'),
  (902, '抽纸 3 提 + 洗洁精 1 瓶', 1, 8800, 8800, 'demo'),
  (903, '米 10 斤 + 鸡蛋 2 板 + 菜油', 1, 15600, 15600, 'demo');

INSERT INTO t_advance (order_id, merchant_id, amount_fen, method, recovered_fen, loss_fen, status, creator) VALUES
  (901, 902, 12800, 'transfer', 0, 0, 'paid', 'demo'),
  (902, 901, 8800, 'cash', 0, 0, 'paid', 'demo'),
  (903, 901, 15600, 'transfer', 0, 0, 'paid', 'demo');

-- type 只能写枚举名大写（CHARGE / PAYMENT / ADJUST / WAIVE / REFUND）。
-- MySQL 查询大小写不敏感、Java 判断敏感，写错会被应用当成非法值直接报错，不会静默算错钱。
INSERT INTO t_ledger_entry (customer_id, order_id, type, amount_fen, occurred_at, period_month, method, note, operator, idempotency_key, creator) VALUES
  (901, 901, 'CHARGE',  13600, NOW() - INTERVAL 6 DAY, DATE_FORMAT(NOW() - INTERVAL 6 DAY, '%Y-%m'), '', '结单挂账', 'demo', 'demo-c-901', 'demo'),
  (904, 902, 'CHARGE',   9600, NOW() - INTERVAL 5 DAY, DATE_FORMAT(NOW() - INTERVAL 5 DAY, '%Y-%m'), '', '结单挂账', 'demo', 'demo-c-902', 'demo'),
  (904, 902, 'PAYMENT', -5000, NOW() - INTERVAL 5 DAY + INTERVAL 1 SECOND, DATE_FORMAT(NOW() - INTERVAL 5 DAY, '%Y-%m'), '微信收款码', '结单当场收款', 'demo', 'demo-p-902', 'demo'),
  (903, 903, 'CHARGE',  16600, NOW() - INTERVAL 12 DAY, DATE_FORMAT(NOW() - INTERVAL 12 DAY, '%Y-%m'), '', '结单挂账', 'demo', 'demo-c-903', 'demo');

INSERT INTO t_rider_task (order_id, rider_id, assigned_by_user_id, status, picked_at, delivered_at, creator) VALUES
  (901, 905, 905, 'delivered', NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY, 'demo'),
  (902, 905, 905, 'delivered', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY, 'demo'),
  (903, 905, 905, 'delivered', NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 12 DAY, 'demo');

INSERT INTO t_order_status_log (order_id, from_status, to_status, action, actor_name, actor_role, reason, occurred_at, creator) VALUES
  (901, '', 'PENDING', 'CREATE', '老板', 'staff', '电话录单', NOW() - INTERVAL 6 DAY, 'demo'),
  (901, 'PENDING', 'PICKING', 'DISPATCH', '老板', 'staff', '指派小李', NOW() - INTERVAL 6 DAY, 'demo'),
  (901, 'PICKING', 'DELIVERING', 'PICK', '老板', 'staff', '取到货，开始配送', NOW() - INTERVAL 6 DAY, 'demo'),
  (901, 'DELIVERING', 'FINISHED', 'FINISH', '老板', 'staff', '应收 136.00，实收 0.00，挂账 136.00', NOW() - INTERVAL 6 DAY, 'demo'),
  (902, '', 'PENDING', 'CREATE', '老板', 'staff', '电话录单', NOW() - INTERVAL 5 DAY, 'demo'),
  (902, 'PENDING', 'PICKING', 'DISPATCH', '老板', 'staff', '指派小李', NOW() - INTERVAL 5 DAY, 'demo'),
  (902, 'PICKING', 'DELIVERING', 'PICK', '老板', 'staff', '取到货，开始配送', NOW() - INTERVAL 5 DAY, 'demo'),
  (902, 'DELIVERING', 'FINISHED', 'FINISH', '老板', 'staff', '应收 96.00，实收 50.00，挂账 46.00', NOW() - INTERVAL 5 DAY, 'demo'),
  (903, '', 'PENDING', 'CREATE', '老板', 'staff', '电话录单', NOW() - INTERVAL 12 DAY, 'demo'),
  (903, 'PENDING', 'PICKING', 'DISPATCH', '老板', 'staff', '指派小李', NOW() - INTERVAL 12 DAY, 'demo'),
  (903, 'PICKING', 'DELIVERING', 'PICK', '老板', 'staff', '取到货，开始配送', NOW() - INTERVAL 12 DAY, 'demo'),
  (903, 'DELIVERING', 'FINISHED', 'FINISH', '老板', 'staff', '应收 166.00，实收 0.00，挂账 166.00', NOW() - INTERVAL 12 DAY, 'demo');

INSERT INTO t_setting (k, v, remark, creator) VALUES
  ('default_service_fee_fen', '800', '默认跑腿费（分）', 'demo'),
  ('brand_name', '同城跑腿', '对账单抬头', 'demo');

-- 想造几条商家待办的活单，用调度台点两下更真实，不建议在这里灌。

-- ============ 用完删干净 ============
-- t_ledger_entry 上有禁止 DELETE 的触发器，所以要先拆触发器、删完再装回去：
--   DROP TRIGGER trg_ledger_no_delete;
--   DELETE FROM t_ledger_entry WHERE creator = 'demo';
--   CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON t_ledger_entry FOR EACH ROW
--     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 't_ledger_entry is append-only: rows must not be deleted';
--   DELETE FROM t_notify_record WHERE creator = 'demo';
--   DELETE FROM t_order_status_log WHERE order_id BETWEEN 900 AND 999;
--   DELETE FROM t_order_item WHERE order_id BETWEEN 900 AND 999;
--   DELETE FROM t_advance WHERE order_id BETWEEN 900 AND 999;
--   DELETE FROM t_rider_task WHERE order_id BETWEEN 900 AND 999;
--   DELETE FROM t_order WHERE id BETWEEN 900 AND 999;
--   DELETE FROM t_address WHERE customer_id BETWEEN 900 AND 999;
--   DELETE FROM t_customer WHERE id BETWEEN 900 AND 999;
--   DELETE FROM t_user_role WHERE user_id BETWEEN 900 AND 999;
--   DELETE FROM t_user WHERE id BETWEEN 900 AND 999;
--   DELETE FROM t_goods WHERE creator = 'demo';
--   DELETE FROM t_merchant_category_rel WHERE merchant_id BETWEEN 900 AND 999;
--   DELETE FROM t_merchant WHERE id BETWEEN 900 AND 999;
--   DELETE FROM t_setting WHERE creator = 'demo';
--   -- 最后调一次 POST /api/admin/ledger/rebuild
