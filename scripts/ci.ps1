# CI 脚本（Windows / PowerShell）
# 用法：powershell -File scripts/ci.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$javaHome = Join-Path $root ".tools\jdk\jdk-17.0.13+11"
$maven = Join-Path $root ".tools\apache-maven-3.9.16\bin\mvn.cmd"

if (-not (Test-Path $javaHome)) { throw "JDK not found: $javaHome" }
if (-not (Test-Path $maven)) { throw "Maven not found: $maven" }

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

Write-Host "=== Backend: mvn test ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
& $maven -s (Join-Path $root ".tools\settings.xml") test
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Backend tests failed" }
Pop-Location

Write-Host "=== Frontend: npm run build ===" -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Frontend build failed" }
Pop-Location

Write-Host "=== CI PASSED ===" -ForegroundColor Green