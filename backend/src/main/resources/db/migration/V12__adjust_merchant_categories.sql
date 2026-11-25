-- ===================================================================
-- V12 · 商家类目调整
-- 1) 「烟酒」改为英文显示（历史行是界面手工新增，code 为自动生成）；
-- 2) 「超市生鲜」拆成「超市」「生鲜」两个独立类目，保留原 code 的商家关联；
-- 3) 新增蛋糕店、咖啡厅、奶茶店；
-- 4) 重排 sort_no：其他 保持末尾。
-- ===================================================================

-- 1) 烟酒 → 英文（幂等：历史库有中文行就改名，全新库没有就补一条英文类目）
UPDATE t_merchant_category
   SET name = 'Tobacco & Alcohol', sort_no = 10
 WHERE name = '烟酒';

INSERT INTO t_merchant_category (code, name, sort_no)
SELECT 'tobacco_alcohol', 'Tobacco & Alcohol', 10
 WHERE NOT EXISTS (
   SELECT 1 FROM t_merchant_category
    WHERE code = 'tobacco_alcohol' OR name = 'Tobacco & Alcohol'
 );

-- 2) 超市生鲜拆分：原 code 保留给「超市」，避免已有商家关联断裂
UPDATE t_merchant_category SET name = '超市', sort_no = 1 WHERE code = 'supermarket';
INSERT INTO t_merchant_category (code, name, sort_no)
SELECT 'fresh', '生鲜', 2
 WHERE NOT EXISTS (SELECT 1 FROM t_merchant_category WHERE code = 'fresh');

-- 3) 既有类目重排（避开新增类目占用的 2 / 7 / 8 / 9）
UPDATE t_merchant_category SET sort_no = 3 WHERE code = 'pharmacy';
UPDATE t_merchant_category SET sort_no = 4 WHERE code = 'convenience';
UPDATE t_merchant_category SET sort_no = 5 WHERE code = 'food';
UPDATE t_merchant_category SET sort_no = 6 WHERE code = 'fruit';

-- 4) 新增三个类目
INSERT INTO t_merchant_category (code, name, sort_no)
SELECT 'cake', '蛋糕店', 7
 WHERE NOT EXISTS (SELECT 1 FROM t_merchant_category WHERE code = 'cake');
INSERT INTO t_merchant_category (code, name, sort_no)
SELECT 'coffee', '咖啡厅', 8
 WHERE NOT EXISTS (SELECT 1 FROM t_merchant_category WHERE code = 'coffee');
INSERT INTO t_merchant_category (code, name, sort_no)
SELECT 'milk_tea', '奶茶店', 9
 WHERE NOT EXISTS (SELECT 1 FROM t_merchant_category WHERE code = 'milk_tea');
