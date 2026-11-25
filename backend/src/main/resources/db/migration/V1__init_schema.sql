-- ===================================================================
-- 同城跑腿 Track A · 初始结构
-- 金额一律 BIGINT，单位「分」；时间 datetime(3)。
-- 唯一真源：本文件由 Flyway 执行，不要在服务器上手工改表。
-- ===================================================================

-- ---------------------------------------------------------------- 身份与权限
CREATE TABLE t_user (
  id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  phone           VARCHAR(20)  NOT NULL COMMENT '手机号，登录标识',
  name            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '称呼',
  password_hash   VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'BCrypt，仅内部员工需要',
  status          VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  remark          VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  creator         VARCHAR(64)  DEFAULT '' COMMENT '创建人',
  create_time     datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater         VARCHAR(64)  DEFAULT '' COMMENT '更新人',
  update_time     datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  deleted         TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除 0否1是',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='自然人：一个手机号可同时是客户/商家/骑手/员工';

CREATE TABLE t_user_role (
  id                BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id           BIGINT      NOT NULL COMMENT '用户ID',
  role              VARCHAR(16) NOT NULL COMMENT 'staff/rider/merchant/customer',
  scope_merchant_id BIGINT      NOT NULL DEFAULT 0 COMMENT '商家角色时限定所属商家，0=不限',
  creator           VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time       datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater           VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time       datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_role (user_id, role, scope_merchant_id),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色是多对多，openid/手机号本身不代表权限';

-- 商家/骑手/客户端免登链接用的长随机串，Track A 没有微信登录，全靠它
CREATE TABLE t_access_token (
  id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  token        VARCHAR(64) NOT NULL COMMENT '随机串，出现在链接里',
  scope_type   VARCHAR(16) NOT NULL COMMENT 'merchant/rider/customer',
  scope_id     BIGINT      NOT NULL COMMENT '对应商家/骑手(用户)/客户ID',
  label        VARCHAR(64) NOT NULL DEFAULT '' COMMENT '发给谁，便于回收时认人',
  revoked_at   datetime(3) NULL COMMENT '吊销时间',
  last_seen_at datetime(3) NULL COMMENT '最近一次访问',
  creator      VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater      VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_token (token),
  KEY idx_scope (scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='免登令牌，泄露可吊销，不影响主数据';

-- ---------------------------------------------------------------- 客户与商家
CREATE TABLE t_customer (
  id                 BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  user_id            BIGINT      NOT NULL COMMENT '对应 t_user',
  billing_cycle      VARCHAR(16) NOT NULL DEFAULT 'on_credit' COMMENT 'on_credit赊账/cod货到付款/monthly月结',
  credit_limit_fen   BIGINT      NOT NULL DEFAULT 0 COMMENT '信用额度（分），0=不允许赊账',
  settle_day         TINYINT     NOT NULL DEFAULT 5 COMMENT '每月结算日',
  note               VARCHAR(255) NOT NULL DEFAULT '' COMMENT '习惯、门禁、常买啥',
  creator            VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time        datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater            VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time        datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  deleted            TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_customer_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户档案；欠款余额不存这里，见 v_customer_balance';

CREATE TABLE t_address (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  customer_id   BIGINT      NOT NULL COMMENT '客户ID',
  contact_name  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '收货称呼',
  contact_phone VARCHAR(20) NOT NULL DEFAULT '' COMMENT '收货电话',
  poi           VARCHAR(128) NOT NULL COMMENT '小区/写字楼',
  detail        VARCHAR(128) NOT NULL DEFAULT '' COMMENT '门牌/放置方式',
  floor         SMALLINT    NOT NULL DEFAULT 0 COMMENT '楼层，0=未知',
  elevator      TINYINT     NOT NULL DEFAULT 0 COMMENT '有无电梯',
  is_default    TINYINT     NOT NULL DEFAULT 0 COMMENT '默认地址',
  creator       VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater       VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  deleted       TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  PRIMARY KEY (id),
  KEY idx_addr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收货地址';

CREATE TABLE t_merchant (
  id               BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  name             VARCHAR(128) NOT NULL COMMENT '店名',
  category         VARCHAR(32) NOT NULL DEFAULT '' COMMENT '超市/药店/水果…',
  phone            VARCHAR(20) NOT NULL DEFAULT '' COMMENT '联系电话',
  address          VARCHAR(255) NOT NULL DEFAULT '' COMMENT '地址',
  prep_timeout_min SMALLINT    NOT NULL DEFAULT 10 COMMENT '超过几分钟未确认算超时，触发兜底',
  status           VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/paused',
  creator          VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time      datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater          VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time      datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  deleted          TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  PRIMARY KEY (id),
  KEY idx_merchant_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='合作商家';

CREATE TABLE t_goods (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  merchant_id   BIGINT      NOT NULL COMMENT '商家ID',
  name          VARCHAR(128) NOT NULL COMMENT '品名',
  spec          VARCHAR(64) NOT NULL DEFAULT '' COMMENT '规格',
  est_price_fen BIGINT      NOT NULL DEFAULT 0 COMMENT '常用估价（分）',
  on_sale       TINYINT     NOT NULL DEFAULT 1 COMMENT '是否可选',
  sort_no       INT         NOT NULL DEFAULT 0 COMMENT '排序',
  creator       VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater       VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  deleted       TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  PRIMARY KEY (id),
  KEY idx_goods_merchant (merchant_id, on_sale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='常用代买品，只是快捷方式：下单允许自由文本';

-- ---------------------------------------------------------------- 订单
CREATE TABLE t_order (
  id                 BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_no           VARCHAR(32) NOT NULL COMMENT '单号，对外可见',
  source             VARCHAR(16) NOT NULL DEFAULT 'phone' COMMENT 'phone电话录单/online客户自助',
  created_by_user_id BIGINT      NOT NULL COMMENT '录单人；online 时是客户本人',
  customer_id        BIGINT      NOT NULL COMMENT '客户ID',
  merchant_id        BIGINT      NOT NULL COMMENT '商家ID',
  rider_id           BIGINT      NULL COMMENT '骑手（t_user.id），可空=待派单',
  address_snapshot   TEXT        NOT NULL COMMENT '下单时地址快照 JSON，改地址不影响历史单',
  goods_est_fen      BIGINT      NOT NULL DEFAULT 0 COMMENT '货款估价（分）',
  goods_real_fen     BIGINT      NULL COMMENT '实际垫付货款，取货后锁定不可改（分）',
  service_fee_fen    BIGINT      NOT NULL DEFAULT 0 COMMENT '跑腿费（分）',
  status             VARCHAR(24) NOT NULL COMMENT '订单状态，见 OrderStatus',
  expect_desc        VARCHAR(64) NOT NULL DEFAULT '' COMMENT '客户说的时间要求原话',
  note               VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  cancel_code        VARCHAR(32) NOT NULL DEFAULT '' COMMENT '取消原因码',
  cancel_text        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '取消原因说明',
  period_month       CHAR(7)     NOT NULL COMMENT '所属账期 yyyy-MM',
  dispatched_at      datetime(3) NULL COMMENT '派单',
  notified_at        datetime(3) NULL COMMENT '通知商家',
  ready_at           datetime(3) NULL COMMENT '商家备货完成',
  picked_at          datetime(3) NULL COMMENT '取货完成（货款在此锁定）',
  delivering_at      datetime(3) NULL COMMENT '开始配送',
  delivered_at       datetime(3) NULL COMMENT '送达',
  finished_at        datetime(3) NULL COMMENT '结单（挂账或收清）',
  cancelled_at       datetime(3) NULL COMMENT '取消',
  creator            VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time        datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间=下单时间',
  updater            VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time        datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_order_status (status),
  KEY idx_order_customer (customer_id, create_time),
  KEY idx_order_merchant (merchant_id, create_time),
  KEY idx_order_rider (rider_id, status),
  KEY idx_order_period (period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表；应收不落库，由货款+跑腿费+流水推导';

CREATE TABLE t_order_item (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id      BIGINT      NOT NULL COMMENT '订单ID',
  goods_id      BIGINT      NULL COMMENT '常用商品ID，自由文本时为空',
  goods_text    VARCHAR(255) NOT NULL COMMENT '品名数量原话',
  qty           INT         NOT NULL DEFAULT 1 COMMENT '数量',
  unit_est_fen  BIGINT      NOT NULL DEFAULT 0 COMMENT '单件估价（分）',
  unit_real_fen BIGINT      NULL COMMENT '单件实付（分）',
  creator       VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater       VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_item_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细行';

-- 兼作审计表：谁在什么时候把单子从哪推到哪，凭这个倒查
CREATE TABLE t_order_status_log (
  id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id    BIGINT      NULL COMMENT '订单ID，账户类操作可空',
  from_status VARCHAR(24) NOT NULL DEFAULT '' COMMENT '原状态',
  to_status   VARCHAR(24) NOT NULL DEFAULT '' COMMENT '新状态',
  action      VARCHAR(32) NOT NULL DEFAULT '' COMMENT '动作码',
  actor_name  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '操作人称呼',
  actor_role  VARCHAR(16) NOT NULL DEFAULT '' COMMENT 'staff/merchant/rider/customer',
  reason      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原因/说明',
  occurred_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发生时间',
  creator     VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_log_order (order_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='状态与操作轨迹，只追加';

CREATE TABLE t_attachment (
  id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  biz_type     VARCHAR(24) NOT NULL COMMENT 'receipt小票/delivered送达/voucher转账凭证/dispute',
  biz_id       BIGINT      NOT NULL COMMENT '业务ID（订单等）',
  file_name    VARCHAR(255) NOT NULL COMMENT '原始文件名',
  storage_path VARCHAR(255) NOT NULL COMMENT '相对存储路径',
  content_type VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'MIME',
  size_bytes   BIGINT      NOT NULL DEFAULT 0 COMMENT '字节数',
  sha1         VARCHAR(64) NOT NULL DEFAULT '' COMMENT '内容指纹，防替换',
  uploader     VARCHAR(64) NOT NULL DEFAULT '' COMMENT '上传者',
  creator      VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_att_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='凭证文件，小票照是客户不认账时唯一的东西';

-- ---------------------------------------------------------------- 垫付
CREATE TABLE t_advance (
  id                    BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id              BIGINT      NOT NULL COMMENT '订单ID',
  merchant_id           BIGINT      NOT NULL COMMENT '付给哪个商家',
  amount_fen            BIGINT      NOT NULL COMMENT '平台垫付金额（分）',
  method                VARCHAR(16) NOT NULL DEFAULT 'cash' COMMENT 'cash/transfer',
  voucher_attachment_id BIGINT      NOT NULL DEFAULT 0 COMMENT '转账截图，0=无',
  recovered_fen         BIGINT      NOT NULL DEFAULT 0 COMMENT '已向商家追回（分）',
  loss_fen              BIGINT      NOT NULL DEFAULT 0 COMMENT '确认收不回的损失（分）',
  status                VARCHAR(16) NOT NULL DEFAULT 'paid' COMMENT 'paid/settled/loss',
  creator               VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time           datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater               VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time           datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_advance_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='垫付台账：单子要进终态必须先把它结清';

-- ---------------------------------------------------------------- 欠款台账（核心）
CREATE TABLE t_ledger_entry (
  id                    BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  customer_id           BIGINT      NOT NULL COMMENT '客户ID',
  order_id              BIGINT      NULL COMMENT '关联订单，零散收款可为空',
  type                  VARCHAR(16) NOT NULL COMMENT 'charge挂账/payment收款/adjust冲正/waive减免/refund退款',
  amount_fen            BIGINT      NOT NULL COMMENT '带符号：挂账为正，收款为负（分）',
  reversal_of_id        BIGINT      NOT NULL DEFAULT 0 COMMENT '冲哪条流水，0=不是冲正',
  occurred_at           datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '业务发生时间',
  period_month          CHAR(7)     NOT NULL COMMENT '账期 yyyy-MM',
  method                VARCHAR(24) NOT NULL DEFAULT '' COMMENT '现金/微信/支付宝',
  note                  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  operator              VARCHAR(64) NOT NULL DEFAULT '' COMMENT '经办人',
  evidence_attachment_id BIGINT     NOT NULL DEFAULT 0 COMMENT '凭证，0=无',
  idempotency_key       VARCHAR(64) NULL COMMENT '幂等键，重复提交只落一条',
  creator               VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time           datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_entry_idem (idempotency_key),
  KEY idx_entry_customer (customer_id, occurred_at),
  KEY idx_entry_order (order_id),
  KEY idx_entry_period (period_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资金流水，只可追加：余额=Σ本表';

-- 应用层绕过直接改表也不行：数据库层兜住（见 02-ledger-invariants）
CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON t_ledger_entry FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 't_ledger_entry is append-only: post a reversing entry instead';

CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON t_ledger_entry FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 't_ledger_entry is append-only: rows must not be deleted';

CREATE TABLE t_ledger_allocation (
  id               BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  payment_entry_id BIGINT      NOT NULL COMMENT '付款流水',
  charged_entry_id BIGINT      NULL COMMENT '被冲抵的挂账流水，NULL=转为预收',
  order_id         BIGINT      NULL COMMENT '冗余，便于按单看已收',
  allocated_fen    BIGINT      NOT NULL COMMENT '本次核销金额（分）',
  occurred_at      datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '核销时间',
  prepaid          TINYINT     NOT NULL DEFAULT 0 COMMENT '1=多付转预收',
  creator          VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time      datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_alloc_payment (payment_entry_id),
  KEY idx_alloc_charged (charged_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='核销关系：钱怎么分摊到单据上';

CREATE TABLE t_order_exception (
  id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id     BIGINT      NOT NULL COMMENT '订单ID',
  type         VARCHAR(32) NOT NULL COMMENT 'goods_cost_dispute/shortage/undelivered',
  disputed_fen BIGINT      NOT NULL DEFAULT 0 COMMENT '争议金额（分）',
  status       VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open/resolved',
  text         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '客户怎么说',
  resolution   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '怎么解决的',
  resolved_by  VARCHAR(64) NOT NULL DEFAULT '' COMMENT '处理人',
  creator      VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater      VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_exc_order (order_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='争议：争议额单独挂账，不阻塞其他款核销';

CREATE TABLE t_monthly_bill (
  id            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  customer_id   BIGINT      NOT NULL COMMENT '客户ID',
  period_month  CHAR(7)     NOT NULL COMMENT '账期 yyyy-MM',
  opening_fen   BIGINT      NOT NULL DEFAULT 0 COMMENT '期初欠款（分）',
  charged_fen   BIGINT      NOT NULL DEFAULT 0 COMMENT '本期新增应收（分）',
  paid_fen      BIGINT      NOT NULL DEFAULT 0 COMMENT '本期实收（分）',
  closing_fen   BIGINT      NOT NULL DEFAULT 0 COMMENT '期末应还（分）',
  snapshot_json TEXT        NOT NULL COMMENT '生成时的逐笔快照，客户确认后不再变',
  status        VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/sent/confirmed/disputed',
  share_token   VARCHAR(64) NOT NULL COMMENT '客户免登录只读链接',
  confirmed_at  datetime(3) NULL COMMENT '客户点确认时间，催款凭据',
  creator       VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater       VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time   datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_bill_cust_month (customer_id, period_month),
  UNIQUE KEY uk_bill_share (share_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='月结对账单';

-- ---------------------------------------------------------------- 履约
CREATE TABLE t_merchant_prep (
  id             BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id       BIGINT      NOT NULL COMMENT '订单ID',
  merchant_id    BIGINT      NOT NULL COMMENT '商家ID',
  status         VARCHAR(16) NOT NULL DEFAULT 'notified' COMMENT 'notified/ready/silent/cancelled',
  notified_at    datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '通知时间',
  ready_at       datetime(3) NULL COMMENT '备货完成时间',
  acked_channel  VARCHAR(16) NOT NULL DEFAULT '' COMMENT '实际生效渠道 poll/manual…',
  shortage       TINYINT     NOT NULL DEFAULT 0 COMMENT '商家上报缺货',
  shortage_text  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '缺什么',
  creator        VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time    datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater        VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time    datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_prep_order (order_id),
  KEY idx_prep_merchant (merchant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家备货确认，时效统计从这里取';

CREATE TABLE t_rider_task (
  id                  BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id            BIGINT      NOT NULL COMMENT '订单ID',
  rider_id            BIGINT      NOT NULL COMMENT '骑手 t_user.id',
  assigned_by_user_id BIGINT      NOT NULL COMMENT '指派人',
  status              VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/picked/delivering/delivered/failed',
  picked_at           datetime(3) NULL COMMENT '取货',
  delivered_at        datetime(3) NULL COMMENT '送达',
  note                VARCHAR(255) NOT NULL DEFAULT '' COMMENT '骑手备注',
  creator             VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time         datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater             VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time         datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_order (order_id),
  KEY idx_task_rider (rider_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='骑手任务；1-3 人自送，只做手动指派';

-- ---------------------------------------------------------------- 通知
CREATE TABLE t_notify_record (
  id               BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  order_id         BIGINT      NULL COMMENT '订单ID',
  scene            VARCHAR(32) NOT NULL COMMENT 'new_order/prep_timeout/shortage/bill_sent…',
  channel          VARCHAR(16) NOT NULL COMMENT 'poll/group_msg/sms/voice/manual/subscribe',
  target           VARCHAR(128) NOT NULL DEFAULT '' COMMENT '发给谁',
  status           VARCHAR(24) NOT NULL COMMENT 'queued/sent_ok/acked/failed/no_quota/sig_pending',
  err_code         VARCHAR(32) NOT NULL DEFAULT '' COMMENT '错误码',
  err_msg          VARCHAR(255) NOT NULL DEFAULT '' COMMENT '错误说明',
  attempts         INT         NOT NULL DEFAULT 0 COMMENT '重试次数',
  sent_at          datetime(3) NULL COMMENT '发出时间',
  acked_at         datetime(3) NULL COMMENT '对方读到时间',
  creator          VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time      datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_notify_order (order_id, channel),
  KEY idx_notify_status (status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每次触达都留痕，用来回答"我怎么没收到"';

CREATE TABLE t_setting (
  id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
  k            VARCHAR(64) NOT NULL COMMENT '键',
  v            VARCHAR(255) NOT NULL DEFAULT '' COMMENT '值',
  remark       VARCHAR(255) NOT NULL DEFAULT '' COMMENT '说明',
  creator      VARCHAR(64) DEFAULT '' COMMENT '创建人',
  create_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updater      VARCHAR(64) DEFAULT '' COMMENT '更新人',
  update_time  datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_setting_k (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='跑腿费默认值等零散配置';

-- ---------------------------------------------------------------- 派生视图
-- 欠款余额=Σ流水。存成表就要维护一致性，存成视图永远是对的。
CREATE VIEW v_customer_balance AS
SELECT c.id                                        AS customer_id,
       c.user_id                                   AS user_id,
       COALESCE(SUM(e.amount_fen), 0)              AS owed_fen,
       COALESCE(MAX(c.credit_limit_fen), 0)        AS credit_limit_fen,
       COALESCE(SUM(CASE WHEN e.type = 'charge' THEN e.amount_fen ELSE 0 END), 0) AS charged_fen
FROM t_customer c
LEFT JOIN t_ledger_entry e ON e.customer_id = c.id
WHERE c.deleted = 0
GROUP BY c.id, c.user_id;
