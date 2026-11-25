#!/bin/sh
# 备份：数据库 dump + 小票照片目录。NAS 上把这个脚本加进计划任务（每天 3:00）。
# 恢复：cat dump.sql | docker compose exec -T mysql mysql -upaotui -p"$PAOTUI_DB_PASSWORD" paotui
set -e
cd "$(dirname "$0")"

STAMP=$(date +%Y%m%d-%H%M)
OUT='backups'
mkdir -p "$OUT"

if [ ! -f .env ]; then
  echo "缺少 .env，请先 cp .env.example .env 并填好" >&2
  exit 1
fi
. ./.env

docker compose exec -T mysql mysqldump -upaotui -p"$PAOTUI_DB_PASSWORD" \
  --single-transaction --routines --triggers --events paotui \
  > "$OUT/paotui-$STAMP.sql"
gzip -f "$OUT/paotui-$STAMP.sql"

# uploads 是命名卷，从 backend 容器的挂载点直接拷，避免写死卷名
docker compose cp backend:/data/uploads "$OUT/uploads-$STAMP"
tar czf "$OUT/uploads-$STAMP.tgz" -C "$OUT" "uploads-$STAMP"
rm -rf "$OUT/uploads-$STAMP"

# 只留 14 天
find "$OUT" -name 'paotui-*.sql.gz' -mtime +14 -delete
find "$OUT" -name 'uploads-*.tgz' -mtime +14 -delete

ls -lh "$OUT" | tail -5
echo "备份完成：$OUT/paotui-$STAMP.sql.gz + uploads-$STAMP.tgz"
