# Flyway 迁移实跑记录

- 日期：2026-11-22
- 环境：MySQL 8.0.28，端口 3307，库 `paotui_test`
- 用户：paotui / paotui
- 迁移脚本：V1–V8 全部执行成功
- 测试：`mvn test` → 12 tests, 0 failures, 0 errors
- 警告：V3 迁移中 `VALUES function` deprecated 警告（MySQL 8.0.28），不影响执行；建议后续迁移脚本改用 alias 语法。
- 结论：迁移链路可跑通，无阻塞错误。

## V9 增量（2026-11-23，待实跑）

- V9 脚本：`V9__remove_customer_link_and_legacy_fields.sql`。
- 内容：删除 `v_customer_balance`、`t_customer_link`、`t_merchant_prep`、`link.manage` 权限，并删除 `t_order.notified_at / ready_at / delivering_at`。
- 本次环境未提供 Maven/JDK，未能本地实跑；部署或测试环境启动后端时由 Flyway 自动执行。