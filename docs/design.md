# 设计说明

## 一句话架构

一个 Spring Boot 单体 + 一个 Vue3 静态站 + 一个 MySQL。没有 Redis、没有消息队列、没有微服务：日均 <50 单、1-3 个使用者，多一个组件就多一份运维负担，而这个系统的使用者不是运维人员。

```
浏览器/手机 ──HTTPS──> nginx(web) ──┬── 静态文件  frontend/dist
                                    ├── /api/*    → backend:8080
                                    └── /files/*  → uploads 卷（nginx 直接发，不走 Java）
backend ── JDBC ──> mysql(卷)
```

## 订单状态机

唯一真源是 `enums/OrderStatus.java` 里的 `TRANSITIONS` 白名单，所有流转必须过 `OrderService.move()`；非法流转抛 `BizException`，中文文案直接给前端展示。

```
PENDING_DISPATCH 待派单
  └─(派单，同一事务里建骑手任务 + 商家备货记录 + 三条通知)→ PENDING_PREP
PENDING_PREP 待商家备货 ──(商家点/老板代点)→ READY_FOR_PICKUP
READY_FOR_PICKUP 备货完成 ──(取货：录实付货款 + 小票照)→ PICKED_UP
PICKED_UP 已取货 → DELIVERING 配送中 → DELIVERED 已送达
DELIVERED → FINISHED 已结清/已挂账
任意非终态 → CANCELLED 已取消（原因必填）
```

三个关键约束：

1. **`goods_real_fen` 在 `PICKED_UP` 时写入后不再可变**。`markPicked` 里显式拒绝二次写入；改金额只能走 `adjustAmount` 新增冲正流水。
2. **结单必须先挂账再记实收**：`finish()` 先写一条 `charge`（货款 + 跑腿费），再按当场实收写 `payment`。应收 = `charge + Σ该单 adjust/waive`，因此"先付一半"不需要任何特殊分支。
3. **取消要清算垫付**：`cancel()` 检查 `t_advance`，`recovered_fen + loss_fen` 必须覆盖垫付金额，否则拒绝进入终态。这是老板最容易漏钱的地方，宁可卡住也不放过。

派生值不落库：`receivable`（应收）、`paid`（已核销）、`owed`（未收）全部由查询算出，避免"字段和事实打架"。

## 台账不变式

`t_ledger_entry` 只追加。三条防线：

- Service 层：`LedgerService.post()` 是唯一写入口，没有余额 setter。
- 数据库层：`V1__init_schema.sql` 建了 `BEFORE UPDATE` / `BEFORE DELETE` 触发器直接 `SIGNAL SQLSTATE '45000'`。集成测试 `ledgerIsAppendOnlyAtDbLevel` 专门验证绕过应用直连改表也会被拒。
  - 副作用：清库不能用 `DELETE FROM t_ledger_entry`，测试用 `flyway.clean()`（连带拆掉触发器）。备份恢复同理，走 `mysqldump`。
- 自检：`HealthService.issues()` 每次页面刷新都跑，逐单核对 `挂账类流水合计 == 重算应收`、逐客户核对 `收款 == 已核销 + 预收`。不平就在页面顶部红字报警。

**核销关系（`t_ledger_allocation`）是派生数据**，不是事实。每次台账写入都按客户重算一遍（`reallocate`），所以：

- 允许反复重算，`POST /api/admin/ledger/rebuild` 可全量重建（手工补过流水之后要调一次）；
- 付款分配规则：先冲**本单**挂账（客户说"这是上次那单的钱"），再按时间冲**最老**挂账（默认先还旧账），剩下的转**预收**（余额变负，下次下单直接抵）。

金额一律 `BIGINT` 分。`decimal` 在 ORM/JSON/前端三跳里迟早出精度事故，前端只在输入框和展示层做元↔分转换。

## 鉴权：两套并存，入口即分权

`AuthInterceptor` 按路径前缀决定用哪种身份，Service 层拿到的 `Principal` 一定带对了 scope：

- `/api/admin/**`：Sa-Token 会话（`X-Auth-Token` 头），必须是 `staff` 角色。
- `/api/m/**`、`/api/r/**`、`/api/c/**`：免登令牌（`X-Access-Token` 头），令牌上记着 `scope_type + scope_id`，类型不匹配直接拒。商家/骑手/客户**不需要账号**，Track A 没有微信登录，这是唯一现实的做法。
- `/api/share/bill/**`：公开，靠 128 位随机 `share_token`。

`merchant_id`、`rider_id`、`customer_id` 一律从 `Principal` 取，**绝不接受前端传来的这些 ID**；商家/骑手端每个写操作都先做归属校验（`belongCheck`），否则一张泄露的链接就能改别人家的单。

一个手机号可能同时是客户、骑手和老板，所以 `t_user` 只标识自然人，权限全在 `t_user_role`（多对多）。

## 通知：主路径是轮询，不是推送

Track A 没有订阅消息也没有短信签名，能用的只有：

| 渠道 | 机制 | 配额 |
|---|---|---|
| `POLL` | 商家页面每 12 秒 `GET /api/m/poll`，服务端把该单排队中的 poll 通知标为 `ACKED` | 无限制，**主路径** |
| `GROUP_MSG` | 调度台一键复制预格式化文本，人工丢微信群 | 无限制，兜底 |
| `MANUAL` | 老板打电话 | 无限制，永远保留 |

`T_notify_record` 把每一次触达都落库，`channelStats` 能统计出各渠道实际命中情况——这就是用来回答"我那天说没收到"的东西。将来接订阅消息时，`NO_QUOTA`（额度不足静默失败）和 `SIG_PENDING`（短信签名未报备）这两个状态是必须存在的，因为**推送失败是无声的**。

浏览器不允许在没有用户手势的情况下自动播放声音，所以商家端有一个常驻的「声音自检」按钮；真机上必须让商家用系统浏览器"添加到桌面"全屏挂机，微信内置浏览器切后台会挂起 JS 和音频。

## 凭证文件

小票照和送达照落本地磁盘（`PAOTUI_UPLOAD_DIR`），数据库只存相对路径 + SHA-1。文件名是随机串，URL 即能力凭证（capability URL）：不列目录、只接受图片 MIME、限 8MB。

这在这个规模下够用，但要清楚它的边界：**知道 URL 就能看到图片**。对外暴露前应在 nginx 上加一层 Referer/内网限制，或改成签名 URL。

## 迁移约定

- 只有一个 Flyway 脚本目录 `backend/src/main/resources/db/migration`，它是结构的唯一真源；`database/demo-data.sql` 只是可选演示数据，不含结构。
- 迁移**只加不改**：已发布的 `V1` 永远不动，改结构加 `V2__xxx.sql`。
- 生产 MySQL 必须开 `log_bin_trust_function_creators`（见 `docker/my.cnf`），否则应用用户建不了 V1 里的触发器，报 ERROR 1419。
- `t_ledger_entry` 的触发器会让 `DELETE` 失败，写清理脚本时注意。

## 已知取舍

- 逻辑删除只用在主数据（客户/地址/商家/商品/用户）上。台账、状态日志、分配表**没有** `deleted` 字段——给"只追加"的表加软删等于开后门。
- 没做多租户 `tenant_id`：这是单个服务商自用，加一列常量 0 只是噪音。真要给第二家服务商共用，再评估。
- 信用额度是**提醒线不是硬拦截**：电话录单不拦（老客户当面不好驳），只在看板和结单时标红；客户自助下单才拦（隔着屏幕，拦得住）。这个不对称是刻意的。
- 单实例部署，宕机即停摆。可接受 RTO 约 4 小时（重部署 + 恢复最近一次 dump）。
