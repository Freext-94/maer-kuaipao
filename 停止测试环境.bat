@echo off
rem 关闭本地测试环境
setlocal enabledelayedexpansion
set "SEEN="
echo 正在关闭本地测试环境...
for %%p in (5178 8080 3307) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%%p "') do (
    set "SKIP="
    for %%b in (!SEEN!) do if "%%a"=="%%b" set "SKIP=1"
    if not defined SKIP (
      echo   关闭 %%p 端口上的进程 %%a
      taskkill /pid %%a /f
      set "SEEN=!SEEN! %%a"
    )
  )
)
echo 完成，按任意键关闭。
pause
