-- ===================================================================
-- V16 · 烟酒类目：名称回归中文，类目码改为英文短码
-- 背景：历史行由管理界面手工新增，code 是自动生成的 c1795272885021；
--       V12 只把 name 改成了英文，未修正 code，界面出现
--       "Tobacco & Alcohol / c1795272885021" 这种组合。
-- 处理：统一为 code = tobacco_alcohol、name = 烟酒，
--       与 coffee(咖啡厅)、cake(蛋糕店)、milk_tea(奶茶店) 的英文码风格一致。
-- 商家关联走 t_merchant_category_rel(category_id)，改 code/name 不影响已有关系。
-- ===================================================================

UPDATE t_merchant_category
   SET code    = 'tobacco_alcohol',
       name    = '烟酒',
       sort_no = 10
 WHERE code = 'c1795272885021'
    OR name = 'Tobacco & Alcohol'
    OR code = 'tobacco_alcohol';
