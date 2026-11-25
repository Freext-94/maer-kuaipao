-- ===================================================================
-- V15 · 地址文本剔除联系人与电话（修正 V13 的历史回填口径）
-- V13 已删除拆分列，无法按原字段重建；这里按客户账号的称呼/手机号
-- 从已拼好的地址文本中剥离，仅保留位置信息（小区 门牌 N楼 有电梯）。
-- 新单由业务代码直接写纯地址，本迁移只处理历史数据。
-- ===================================================================
UPDATE t_address a
JOIN t_customer c ON c.id = a.customer_id AND c.deleted = 0
JOIN t_user u ON u.id = c.user_id AND u.deleted = 0
   SET a.address = TRIM(REPLACE(REPLACE(REPLACE(REPLACE(a.address, u.name, ''), u.phone, ''), '  ', ' '), '  ', ' '))
 WHERE a.address <> ''
   AND (u.name <> '' OR u.phone <> '');
