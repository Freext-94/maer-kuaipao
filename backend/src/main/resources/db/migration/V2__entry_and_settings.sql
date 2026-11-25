-- ===================================================================
-- V2 · 录单台增强（B1）
-- 只加不改：常用词、附件排序、改单审计、可配置的单号前缀与默认跑腿费。
-- 删账期/月结/免登令牌放到 V3（要同步删代码，不能只动表）。
-- ===================================================================

-- 常用词：录单时点一下追加到"买什么"里，减少打字
CREATE TABLE t_quick_phrase (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  text        VARCHAR(64) NOT NULL COMMENT '常用语原文',
  sort_no     INT         NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
  enabled     TINYINT     NOT NULL DEFAULT 1 COMMENT '是否启用',
  use_count   INT         NOT NULL DEFAULT 0 COMMENT '被点次数，用来把常用的往前排',
  creator     VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater     VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_phrase_text (text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='录单常用词';

INSERT INTO t_quick_phrase (text, sort_no) VALUES
  ('放门口，别敲门', 1),
  ('到了打电话', 2),
  ('要新鲜的，坏的挑出来', 3),
  ('顺便带包烟', 4),
  ('有点急，尽快', 5);

-- 一个订单可以挂多张图/音频，需要稳定顺序
ALTER TABLE t_attachment ADD COLUMN sort_no INT NOT NULL DEFAULT 0 COMMENT '同一业务下的排序' AFTER sha1;

-- 改单审计：谁在什么时候把哪个字段从什么改成了什么
CREATE TABLE t_order_edit_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id    BIGINT       NOT NULL COMMENT '订单ID',
  field       VARCHAR(32)  NOT NULL COMMENT '字段名',
  old_value   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '改前',
  new_value   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '改后',
  reason      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原因',
  actor       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人',
  create_time datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_edit_order (order_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单修改留痕，只追加';

-- 零散配置：单号前缀、默认跑腿费
INSERT INTO t_setting (k, v, remark) VALUES
  ('order_no_prefix', 'MR', '单号前缀，默认 MR'),
  ('default_service_fee_fen', '1000', '默认跑腿费（分）')
ON DUPLICATE KEY UPDATE remark = VALUES(remark);
