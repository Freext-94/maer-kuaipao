-- ===================================================================
-- V10 · 不做强制改密 + 权限码对齐
-- 1) 不做强制改密要求：删除 t_user.must_change_password，
--    账号由管理员建号/重置密码时直接告知初始密码，登录不再返回改密标记；
-- 2) platform.manage 与 user.manage / setting.manage 重叠且无独立接口，删除；
-- 3) service.manage 启用：服务类型写操作独立鉴权；
-- 4) V6 新增权限码未同步授权给 admin，补齐 audit.view / service.manage。
-- ===================================================================

ALTER TABLE t_user
  DROP COLUMN must_change_password;

DELETE FROM t_role_permission
WHERE permission_id IN (SELECT id FROM t_permission WHERE code = 'platform.manage');
DELETE FROM t_permission WHERE code = 'platform.manage';

INSERT INTO t_role_permission(role, permission_id)
SELECT 'admin', p.id
FROM t_permission p
WHERE p.code IN ('audit.view', 'service.manage')
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role = 'admin' AND rp.permission_id = p.id
  );
