# 马儿快跑 · Track A 线上工具

> **2026-11-21 改造方案阶段**：品牌「马儿快跑」；不做账期/信用额度/月结，不做免登，全员手机号+密码；移动端优先，账单生成图片不生成 PDF。
> 改造计划：`docs/需求与改造计划.md`　｜　第二轮 11 条方案：`docs/改造方案-第二轮问题.md`　｜　品牌素材：`brand-kit/`
> 旧原型 `prototype-v2/index.html` 只作流程参考，视觉/交互按新方案和 brand-kit 重做。生产代码尚未按新计划修改。

自营同城跑腿服务商的内部经营系统：**在线/电话录单 → 派单 → 取货垫付 → 派送 → 配送完成挂账与收款 → 客户账单/资金流水**。

Track A 的含义是**不依赖任何微信资质**：不办个体工商户、不开微信支付、不做小程序、不发短信。四端均为手机号+密码登录；客户自助下单使用登录态 H5，不再提供免登链接。收款线下完成、系统只记账，将来办了个体户可在同一套后端上加微信登录与在线收款（Track B）。

## 现在能做什么

| 端 | 入口 | 用途 |
|---|---|---|
| 调度台（PC） | `/#/login` → `/#/admin` | 电话录单、看板派单、取货/配送完成、取消与垫付追回、货款调整；收款/欠款/减免在账单页 |
| 商家端（手机） | `/#/login` → `/#/m` | 只读工作台：每 12 秒拉单、新单响铃 + 高亮、查看历史；不再代客下单或确认备货 |
| 骑手端（手机） | `/#/login` → `/#/r` | 我的任务、取货时录实际垫付并拍小票、配送完成时收款确认 |
| 客户端（手机） | `/#/login` → `/#/c` | 自助下单、看自己的单、看客户账单、主动还款登记 |

## 快速开始（开发机）

需要 JDK 17、Maven 3.9、MySQL 8。国内网络下 `repo.maven.apache.org` 直连不通，用带镜像的配置：

```bash
# 1) 建库建号
mysql -uroot -p -e "CREATE DATABASE paotui DEFAULT CHARACTER SET utf8mb4;
CREATE USER 'paotui'@'%' IDENTIFIED BY 'paotui'; GRANT ALL ON paotui.* TO 'paotui'@'%';"
# MySQL 开了 binlog 时，建触发器需要这个开关（详见 docker/my.cnf）
mysql -uroot -p -e "SET GLOBAL log_bin_trust_function_creators = ON;"

# 2) 配置初始管理员密码，再启动后端（首次启动自动执行 Flyway 建表）
export PAOTUI_ADMIN_PASSWORD='换成你自己的强密码'
cd backend && mvn -s ../.tools/settings.xml spring-boot:run

# 3) 前端
cd frontend && npm install && npm run dev     # http://localhost:5173
```

跑测试（需要能连到 `127.0.0.1:3307` 的 MySQL 与 `paotui_test` 库）：

```bash
cd backend && mvn -s ../.tools/settings.xml test
```

想先点几单试试，可导入演示数据。**顺序不能颠倒**：表是应用第一次启动时由 Flyway 建的、初始账号也是那时建的，所以要先把应用跑起来，再导数据。

```bash
# 1) 先启动一次后端（建表 + 建初始账号），确认可登录后停下
cd backend && mvn -s ../.tools/settings.xml spring-boot:run

# 2) 导入演示数据（ID 占 900+ 段，不会撞主键）
mysql -upaotui -p paotui < database/demo-data.sql

# 3) 重算核销：演示流水是直接 INSERT 的，而核销关系是派生数据
curl -X POST localhost:8080/api/admin/ledger/rebuild -H "X-Auth-Token: <登录后的 token>"
```

上线前用不着它就按 `database/demo-data.sql` 末尾那段注释删干净（注意台账有禁止 DELETE 的触发器，得先拆后装）。

`t_ledger_entry.type` 只能写枚举名大写（`CHARGE` / `PAYMENT` / `ADJUST` / `WAIVE` / `REFUND`）。MySQL 查询大小写不敏感、Java 判断敏感，写错会把一笔收款当成挂账——所以应用遇到非法值会直接报错而不是猜。

## NAS / 云主机部署

```bash
cd docker
cp .env.example .env      # 设置强密码、公开镜像地址和对外端口
docker compose pull
docker compose up -d
docker compose ps
```

发布仓库推送 `v1.0.0` 标签后，GitHub Actions 会构建并推送 `backend`、`web` 两个多架构镜像到 GHCR。首次发布后需在 GitHub Packages 将两个容器包设为 Public，NAS 才能匿名拉取。

对外只暴露 `PAOTUI_HTTP_PORT`（默认 8088）一个端口；MySQL 和后端都只在内网。

**先内网用，别急着对外。** 家用宽带通常封 80/443，而且 ICP 备案要求"接入商"与你实际对外的线路一致——家庭宽带线路无法备案，用个人备案的域名在家庭宽带上对外提供经营性服务，备案号有被核查注销的风险。等迁到云服务器（备案接入商=云厂商）后再对外发链接更稳妥。过渡期给商家/骑手发链接，可以用局域网或 VPN 组网。

HTTPS 是手机浏览器的现实要求（拍照、通知等能力在非 HTTPS 下会受限），NAS 上用反向代理签发的证书即可。

### 备份

```bash
cd docker && ./backup.sh      # 丢进 NAS 计划任务，每天一次
```

产出 `docker/backups/paotui-<时间>.sql.gz` 与 `uploads-<时间>.tgz`（小票/送达照），保留 14 天。恢复：

```bash
gunzip -c backups/paotui-XXX.sql.gz | docker compose exec -T mysql mysql -upaotui -p paotui
docker compose cp backups/uploads-XXX/uploads-XXX backend:/data/uploads
```

## 上线后第一件事

1. 使用部署时配置的 `PAOTUI_ADMIN_PHONE` 和 `PAOTUI_ADMIN_PASSWORD` 登录调度台。
2. 在「设置 → 服务类型」按实际业务启用需要的类型（代买/代取送/代办/接送/代驾），停用的类型不会出现在下单页。
3. 建商家、骑手、客户账号，四端均用手机号+密码登录。
4. 给客户补收货地址，客户即可自助下单；调度台/骑手也可代客录单。
5. 收款、减免、还款申报核对统一在「账单」页完成，订单页只管订单行为。

## 三条不能妥协的规则

系统的钱账部分刻意做"硬"，改代码前先看 `docs/design.md`：

1. **取货时录下的实付货款不可修改**。有争议只能新增一条"冲正"流水，原值和小票永久保留。
2. **客户欠款余额 = 流水之和**，没有余额字段可改。数据库上对 `t_ledger_entry` 加了禁止 UPDATE/DELETE 的触发器，绕过应用直接改表也会被拒。
3. **垫付没交代的单进不了终态**：已付给商家的钱，必须先记「已追回」或勾「确认损失」。

## 明确没做（以及为什么）

- **在线收款/自动扣款**：需要商户号；且微信支付分先享后付、委托代扣是邀约制，小平台拿不到。现实做法就是客户扫收款码 + 回系统登记一笔还款。
- **微信订阅消息、短信、语音外呼**：订阅消息一次授权只换一条额度、长期订阅商业类目拿不到；短信签名需企业/个体户资质报备。所以商家提醒走"常驻页 + 提示音 + 电话"。
- **地图距离计费、智能派单、抢单大厅、多租户 SaaS、OCR**：1-3 人自送、日均 <50 单的规模用不上，加了只会拖慢运营。
- 原型阶段留的验收问题（一单要录 10-13 项是否太多）仍然有效，见 `prototype/index.html`。

## 文档

- `docs/design.md` 架构、状态机、台账不变式、鉴权与通知设计
- `docs/api.md` 接口清单
- `PROJECT.md` 目录结构、约定、给后续 AI 改代码时的边界说明
- `prototype/` 已评审通过的可点原型（纯静态，双击 `index.html` 即可），是交互与视觉的对照基准
