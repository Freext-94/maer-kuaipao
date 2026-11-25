# ADR-0004 统计时区 Asia/Shanghai

## 背景
docs R6 要求按北京时间 0 点切日；代码 `HealthService` 使用 `LocalDate.now()`（服务器默认时区）。

## 决策
所有统计切日统一 `ZoneId.of("Asia/Shanghai")`；NAS 部署服务器时区可能非 +08:00，不得依赖默认时区。

## 后果
- B4 迭代修正 `HealthService` 及 billing 接口。
- 新增代码禁止使用 `LocalDate.now()` / `LocalDateTime.now()` 做切日统计。