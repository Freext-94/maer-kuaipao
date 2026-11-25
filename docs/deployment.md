# 部署与运维

马儿快跑通过 Docker Compose 运行在 NAS 或 Linux 主机上。部署由 MySQL、Java 服务和 Nginx 网页入口组成，业务数据与上传文件分别保存在 Docker 持久卷中。

## 环境要求

- Docker Engine 24 或更新版本
- Docker Compose v2 插件
- 建议至少 2 核 CPU、4 GB 内存和 20 GB 可用空间
- 手机浏览器使用时建议配置 HTTPS 反向代理

## 部署步骤

```bash
git clone https://github.com/Freext-94/maer-kuaipao.git
cd maer-kuaipao/docker
cp .env.example .env
```

编辑 `.env`，为下列项目设置独立密码：

| 变量 | 用途 |
|---|---|
| `PAOTUI_MYSQL_ROOT_PASSWORD` | MySQL root 管理员密码 |
| `PAOTUI_DB_PASSWORD` | 应用连接数据库的密码 |
| `PAOTUI_ADMIN_PASSWORD` | 初始超级管理员密码 |
| `PAOTUI_ADMIN_PHONE` | 初始管理员手机号，默认 `13800000000` |
| `PAOTUI_HTTP_PORT` | 网页服务映射端口，默认 `8088` |

镜像默认指向 GitHub Container Registry 的 `v1.0.0` 版本。拉取并启动：

```bash
docker compose pull
docker compose up -d
docker compose ps
```

浏览器访问 `http://<服务器地址>:8088`。初次启动时 Flyway 会创建数据库表，应用会按环境变量创建初始管理员。登录后请在账号管理中创建商家、骑手、客户和其他管理员账号。

### 更新版本

在 `.env` 中将镜像标签设为目标版本，然后执行：

```bash
docker compose pull
docker compose up -d
```

数据库迁移在应用启动时自动执行。升级前请先备份数据库和上传文件。

## 持久化与备份

Compose 使用 `paotui-mysql-data` 保存数据库，`paotui-uploads` 保存订单附件。不要删除这两个卷，除非确认其中数据不再需要。

`docker/backup.sh` 可将数据库与上传文件打包到 `docker/backups/`，并清理 14 天前的备份：

```bash
cd docker
./backup.sh
```

建议通过 NAS 计划任务每天执行，并将备份复制到另一块磁盘或独立存储。至少定期验证一次恢复流程；备份成功信息不等同于恢复验证通过。

恢复前先停止写入，在项目 `docker/` 目录下导入 SQL 备份：

```bash
gzip -dc backups/paotui-YYYYMMDD-HHMM.sql.gz | docker compose exec -T mysql mysql -upaotui -p paotui
```

恢复附件时将备份压缩包内容解压后复制到 `paotui-uploads` 对应卷的 `/data/uploads` 目录。完成后启动服务并抽查订单、账单及附件。

## 网络和安全

- 只对外开放 `PAOTUI_HTTP_PORT`，不要把 MySQL 3306 或 Java 8080 暴露到公网。
- 对外服务请配置 HTTPS，并设置反向代理的上传大小限制以匹配应用设置。
- 使用唯一强密码，不要将 `.env` 提交到代码仓库或发送到公开渠道。
- 定期更新主机、Docker 和项目镜像，检查磁盘空间与容器健康状态。
- 上传凭证可能包含订单及客户信息，应限制文件卷和备份文件的访问权限。

## 常见检查

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs --tail=200 web
docker compose logs --tail=200 mysql
```

如果页面能打开但接口不可用，先检查后端日志及 MySQL 健康状态；如果应用反复重启，检查 `.env` 中数据库连接与密码是否一致。更多 API 和业务流程说明见[架构文档](design.md)。
