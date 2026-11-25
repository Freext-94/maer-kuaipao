#!/bin/bash
# 部署后自检：验证当前 V1.0 登录、权限、订单和账务接口。
#   ./smoke.sh
#   BASE=http://127.0.0.1:8088 PHONE=13800000000 PASS='实际初始密码' ./smoke.sh
set -u
BASE="${BASE:-http://127.0.0.1:8088}"
PHONE="${PHONE:-13800000000}"
PASS="${PASS:-}"
fail=0

say() { printf '  %-24s %s\n' "$1" "$2"; }
check() {
  if printf '%s' "$3" | grep -Eq "$2"; then say "$1" "OK"; else say "$1" "FAIL"; fail=1; fi
}

echo "== 马儿快跑 V1.0 部署自检：$BASE =="
code=$(curl -sS -o /dev/null -m 10 -w '%{http_code}' "$BASE/") || code=000
check "前端首页" '^200$' "$code"

if [ -z "$PASS" ]; then
  say "登录密码" "FAIL（请设置 PASS 环境变量）"
  exit 1
fi

body=$(curl -sS -m 10 -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"password\":\"$PASS\"}") || body=''
check "管理员登录" '"code"[[:space:]]*:[[:space:]]*0' "$body"
TOK=$(printf '%s' "$body" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOK" ]; then
  say "登录令牌" "FAIL（后续检查跳过）"
  exit 1
fi

A=(-H "X-Auth-Token: $TOK" -H 'Content-Type: application/json')
health=$(curl -sS -m 15 "${A[@]}" "$BASE/api/admin/health") || health=''
check "健康接口" '"code"[[:space:]]*:[[:space:]]*0' "$health"
check "账务健康" '"issues"[[:space:]]*:[[:space:]]*\[\]' "$health"
check "订单状态接口" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 10 "${A[@]}" "$BASE/api/admin/statuses" || true)"
check "订单列表" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 10 "${A[@]}" "$BASE/api/admin/orders" || true)"
check "客户列表" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 10 "${A[@]}" "$BASE/api/admin/customers" || true)"
check "商家列表" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 10 "${A[@]}" "$BASE/api/admin/merchants" || true)"
check "骑手列表" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 10 "${A[@]}" "$BASE/api/admin/riders" || true)"
check "账单接口" '"code"[[:space:]]*:[[:space:]]*0' "$(curl -sS -m 15 "${A[@]}" "$BASE/api/admin/bills" || true)"

unauth=$(curl -sS -m 10 "$BASE/api/admin/orders" || true)
check "未登录访问受限" '"code"[[:space:]]*:[[:space:]]*401|请先登录' "$unauth"

echo
if [ "$fail" -eq 0 ]; then
  echo "自检通过。"
else
  echo "自检未通过；检查 docker compose logs --tail 100 backend。"
fi
exit "$fail"
