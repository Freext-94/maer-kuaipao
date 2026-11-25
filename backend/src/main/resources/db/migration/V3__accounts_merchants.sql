-- ===================================================================
-- V3 · 账号权限与商家并入（B2）
-- 1) staff 角色改名为 admin，加权限表；
-- 2) 删免登令牌、月结对账单、客户账期三字段（已确认直接删，不兼容）；
-- 3) 商家并入用户表：类目多对多 + 自定义字段 + 待完善状态 + 主账号绑定。
-- ===================================================================

-- 1) 角色改名：staff -> admin（先改数据再改代码，顺序不能反）
UPDATE t_user_role SET role = 'admin' WHERE role = 'staff';

-- 2) 权限：权限码字典 + 角色-权限多对多
CREATE TABLE t_permission (
  id      BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  code    VARCHAR(64) NOT NULL COMMENT '权限码',
  name    VARCHAR(64) NOT NULL COMMENT '中文名',
  grp     VARCHAR(32) NOT NULL DEFAULT '' COMMENT '分组',
  sort_no INT         NOT NULL DEFAULT 0 COMMENT '排序',
  PRIMARY KEY (id),
  UNIQUE KEY uk_perm_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限码字典';

CREATE TABLE t_role_permission (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  role          VARCHAR(16) NOT NULL COMMENT 'admin/rider/merchant/customer',
  permission_id BIGINT      NOT NULL COMMENT '权限ID',
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_perm (role, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色默认权限；admin 的权限矩阵存这里';

INSERT INTO t_permission (code, name, grp, sort_no) VALUES
  ('order.view', '查看订单', '订单', 1),
  ('order.create', '录单', '订单', 2),
  ('order.edit', '改单', '订单', 3),
  ('order.dispatch', '派单', '订单', 4),
  ('order.flow', '取货/送达/结单', '订单', 5),
  ('order.cancel', '取消订单', '订单', 6),
  ('money.view', '查看账单', '账单', 11),
  ('money.receive', '登记收款', '账单', 12),
  ('money.adjust', '冲正/减免', '账单', 13),
  ('customer.manage', '管理客户', '客户', 21),
  ('merchant.manage', '管理商家', '商家', 31),
  ('rider.manage', '管理骑手', '骑手', 41),
  ('user.manage', '管理用户与权限', '系统', 51),
  ('setting.manage', '系统设置', '系统', 52);

-- admin 默认拥有全部权限（超管管理这张矩阵，管理员按勾选授权）
INSERT INTO t_role_permission (role, permission_id)
SELECT 'admin', id FROM t_permission;

-- 3) 账号字段：强制改密标记 + 最近登录
ALTER TABLE t_user
  ADD COLUMN must_change_password TINYINT NOT NULL DEFAULT 0 COMMENT '下次登录强制改密' AFTER password_hash,
  ADD COLUMN last_login_at datetime(3) NULL COMMENT '最近登录' AFTER status;

-- 4) 商家并入用户表
CREATE TABLE t_merchant_category (
  id      BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  code    VARCHAR(32) NOT NULL COMMENT '类目码',
  name    VARCHAR(32) NOT NULL COMMENT '类目名',
  sort_no INT         NOT NULL DEFAULT 0 COMMENT '排序',
  enabled TINYINT     NOT NULL DEFAULT 1 COMMENT '是否启用',
  PRIMARY KEY (id),
  UNIQUE KEY uk_mc_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家类目字典';

INSERT INTO t_merchant_category (code, name, sort_no) VALUES
  ('supermarket', '超市生鲜', 1),
  ('pharmacy', '药店', 2),
  ('convenience', '便利店', 3),
  ('food', '餐饮', 4),
  ('fruit', '水果', 5),
  ('other', '其他', 99);

CREATE TABLE t_merchant_category_rel (
  id          BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  merchant_id BIGINT NOT NULL COMMENT '商家ID',
  category_id BIGINT NOT NULL COMMENT '类目ID',
  PRIMARY KEY (id),
  UNIQUE KEY uk_mc_rel (merchant_id, category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家-类目多对多';

CREATE TABLE t_merchant_field (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  field_key     VARCHAR(32)  NOT NULL COMMENT '字段key',
  label         VARCHAR(32)  NOT NULL COMMENT '显示名',
  type          VARCHAR(16)  NOT NULL COMMENT 'text/textarea/number/phone/date/select/multiselect/switch',
  required      TINYINT      NOT NULL DEFAULT 0 COMMENT '是否必填',
  options_json  TEXT         NULL COMMENT 'select/multiselect 的选项 JSON',
  sort_no       INT          NOT NULL DEFAULT 0 COMMENT '排序',
  enabled       TINYINT      NOT NULL DEFAULT 1 COMMENT '是否启用',
  PRIMARY KEY (id),
  UNIQUE KEY uk_mf_key (field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家自定义字段定义';

-- 商家表扩展：状态/来源/主账号/自定义字段值
ALTER TABLE t_merchant
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT 'user用户创建/order下单生成/migrate迁移' AFTER status,
  ADD COLUMN from_order_id BIGINT NOT NULL DEFAULT 0 COMMENT '从哪张单生成的待完善商家' AFTER source,
  ADD COLUMN extra_json TEXT NULL COMMENT '自定义字段值 JSON' AFTER from_order_id,
  ADD COLUMN owner_user_id BIGINT NOT NULL DEFAULT 0 COMMENT '主账号用户ID' AFTER extra_json;

-- 现有商家：来源标 migrate，类目按旧文本回填（映射不到归 other）
UPDATE t_merchant SET source = 'migrate';
INSERT INTO t_merchant_category_rel (merchant_id, category_id)
SELECT m.id, c.id FROM t_merchant m
JOIN t_merchant_category c ON c.code = 'other'
WHERE m.deleted = 0
  AND NOT EXISTS (SELECT 1 FROM t_merchant_category_rel r WHERE r.merchant_id = m.id);

-- 5) 删免登令牌、月结对账单、客户账期三字段（已确认）
DROP TABLE t_access_token;
DROP TABLE t_monthly_bill;
ALTER TABLE t_customer
  DROP COLUMN billing_cycle,
  DROP COLUMN credit_limit_fen,
  DROP COLUMN settle_day;
