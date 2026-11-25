@echo off
rem 同城跑腿 · 启动本地测试环境（数据库 + 后端 + 前端）
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "DBDIR=C:\Users\%USERNAME%\paotui-devdb"
set "JAVA=%~dp0.tools\jdk\jdk-17.0.13+11\bin\javaw.exe"
set "JAR=%~dp0backend\target\paotui-backend-0.1.0.jar"
set "MYSQLD=%DBDIR%\mysql-8.0.28-winx64\bin\mysqld.exe"

call :port 3307
if "!P!"=="0" (
  echo   [1/3] 启动数据库...
  if not exist "%MYSQLD%" ( echo     找不到 !MYSQLD! & goto :fail )
  start "paotui-mysql" /min "%MYSQLD%" --defaults-file="%DBDIR%\my.ini"
  call :wait 8
) else (
  echo   [1/3] 数据库已在运行
)

call :port 8080
if "!P!"=="0" (
  echo   [2/3] 启动后端...
  if not exist "%JAR%" ( echo     找不到 !JAR! 请先在 backend 目录执行打包 & goto :fail )
  start "paotui-backend" /min "%JAVA%" -jar "%JAR%" --spring.profiles.active=dev
  call :wait 14
) else (
  echo   [2/3] 后端已在运行
)

call :port 5178
if "!P!"=="0" (
  echo   [3/3] 启动前端...
  start "paotui-web" /min cmd /c "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 5178"
  call :wait 10
) else (
  echo   [3/3] 前端已在运行
)

call :port 8080
if "!P!"=="0" ( echo     后端没起来，请看名为 paotui-backend 的黑色窗口 & goto :fail )

echo.
echo     电脑调度台    http://127.0.0.1:5178
echo     手机测试      http://本机局域网IP:5178   （IP 看 paotui-web 窗口里的 Network 行，需同一 WiFi）
echo     接口文档      http://127.0.0.1:8080/swagger-ui.html
echo.
echo     初始账号 13800000000 / ***********   登录后请先改密码
echo     关闭请双击「停止测试环境.bat」
echo.
start "" http://127.0.0.1:5178
goto :eof

:fail
echo.
echo     启动未完成。按任意键关闭本窗口。
pause
goto :eof

:port
set "P=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":%1 "') do set "P=1"
goto :eof

:wait
rem 用 ping 计时：timeout 命令在部分环境下会被替换或需要控制台输入
ping -n %1 127.0.0.1
goto :eof
