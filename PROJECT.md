> **2026-11-21 改造中**：品牌改「马儿快跑」，不做账期/额度/月结/免登，先出可点原型。
> 新计划：`docs/需求与改造计划.md`；第二轮方案：`docs/改造方案-第二轮问题.md`；品牌素材：`brand-kit/`；旧原型：`prototype-v2/index.html`（只作流程参考）。
> 本文档描述改造前的结构，生产代码尚未按新计划修改。

# 项目说明

自营同城跑腿服务商的内部经营系统。当前范围是 **Track A**：不依赖微信资质（无小程序、无微信支付、无短信签名），全部收款线下完成、系统只记账。

## 目录结构

```
同城跑腿/
├── backend/            Java 17 + Spring Boot 3.2 + MyBatis-Plus + Flyway
│   ├── src/main/java/com/example/paotui/
│   │   ├── controller/  按角色分包：admin / m / r / c / share / auth
│   │   ├── service/     业务与不变式（OrderService、LedgerService 是核心）
│   │   ├── mapper/      MyBatis-Plus BaseMapper + 少量 @Select 聚合查询
│   │   ├── entity/      与表一一对应
│   │   ├── enums/       OrderStatus（含流转白名单）等
│   │   ├── security/    AuthInterceptor + Principal + Ctx
│   │   ├── config/      属性绑定、Sa-Token、静态资源、初始账号
│   │   └── common/      统一返回、业务异常、全局异常处理
│   └── src/main/resources/db/migration/V1__init_schema.sql   ← 结构的唯一真源
├── frontend/           Vue 3 + Vite（hash 路由，无 UI 框架，复用原型样式）
├── prototype/          已评审的可点静态原型（交互与视觉基准，不是运行代码）
├── database/           可选演示数据 demo-data.sql
├── docker/             compose + 两个 Dockerfile + nginx + my.cnf + backup.sh
├── docs/               design.md（不变式）/ api.md（接口）
└── .tools/             本机专用 JDK/Maven/Maven 镜像配置，不提交、不参与构建
```

## 技术栈与版本约定

| 层 | 选型 | 不要换成 |
|---|---|---|
| 后端 | JDK 17、Spring Boot 3.2、MyBatis-Plus **`mybatis-plus-spring-boot3-starter`**、Sa-Token、Flyway | 用 `mybatis-plus-boot-starter`（非 boot3 版）会在 Spring 6.1 下报 `factoryBeanObjectType` 错，所有 Mapper Bean 注册失败 |
| 数据 | MySQL 8，`utf8mb4` | 不要引入 H2/SQLite 兼容层，迁移脚本按 MySQL 方言写并在真库上验 |
| 前端 | Vue 3 + Vite + vue-router（hash history）+ 自写 fetch 封装 | 不要引 Element Plus / axios / Pinia，样式沿用 `prototype/assets/app.css` |
| 金额 | `BIGINT` 存分 | 禁止 `decimal`/`float` 参与运算 |

## 编码约定

- 包名 `com.example.paotui`；类名 PascalCase、方法 camelCase、数据库字段 snake_case。
- 统一返回 `Result<T>`，业务拒绝抛 `BizException`（中文 `msg` 会被前端直接展示，所以文案要能给人看）。
- 表结构：主数据（客户/地址/商家/商品/用户）带 `creator/create_time/updater/update_time/deleted`；**台账、状态日志、核销分配表只追加，不带 `deleted`**。
- 状态/类型字段用 `VARCHAR` 存枚举 `name()`，不用序号，方便人肉查库和后续加值。
- 注释只在"为什么"不显然处写一行（例如"核销关系是派生数据，所以可以整段重算"），不解释代码在做什么。

## 改动前必须先读

`docs/design.md` 里的三条不变式：货款取货后不可改、余额只能由流水推导、垫付未清算不许进终态。历史上每一版系统被钱坑到，都是因为有人"顺手"给余额加了个 setter。

## 验证方式

- 后端：`cd backend && mvn test`（需要 `127.0.0.1:3307` 的 MySQL 与 `paotui_test` 库）。**16 个集成测试覆盖录单到对账全链路、非法流转、垫付追回硬拦、数据库层禁止改流水、幂等、FIFO 顺序。**
- 前端：`cd frontend && npm run build` 必须零错误。
- 手工回归（改完必跑）：录单 → 商家 poll 并点备货完成 → 取货录 92.40 → 送达 → 结单只收 50 → 冲正 -4.40 → 台账欠款应为 46.00 → 生成对账单 → 客户确认 → 再建应被拒 → 顶部健康条 `issues` 始终为空。

## 还没做（Track B 及以后）

微信支付 JSAPI、微信登录与订阅消息、短信/语音兜底、账龄与自动停单、经营看板、OCR 小票、运力外溢转单。加这些时后端表和状态机不动，只加模块：微信相关能力集中在 `controller` 与新增的 `wechat` 包，台账与状态机不接受任何"为了推送方便"的改动。

`prototype/index.html` 里那份"一单要录 10–13 项，超过能坚持的线"的验收问题仍然有效，砍字段优先于加工具。

## 规格优先（SDD）

- 本项目采用 Specification-Driven Development：**规格是唯一真源**。
- 所有业务规则、数据模型、接口契约、验收标准以 `specs/` 为准。
- 变更流程与编号约定见 `specs/README.md`。
- 架构决策记录见 `specs/decisions/`。
- 与 `specs/` 冲突时，以 `specs/` 为准；历史 `docs/` 仅作参考。
