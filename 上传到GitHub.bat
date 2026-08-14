@echo off
chcp 65001 >nul
title XUANFENG 个人工作站 - 一键上传
echo ============================================
echo   LUSEM 个人工作站 · 一键上传 GitHub
echo   目标仓库: XUANFENG
echo ============================================
echo.

cd /d "%~dp0"

REM --- 检查 git ---
where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Git，请先安装: https://git-scm.com/download/win
  pause & exit /b 1
)
echo [OK] Git 已安装

REM --- 检查 gh CLI ---
where gh >nul 2>nul
if errorlevel 1 (
  echo [警告] 未检测到 gh CLI (GitHub CLI)
  echo        推送到已有仓库其实只需要 git，但创建/清空仓库需要 gh。
  echo        建议安装 gh: winget install GitHub.cli  (或用浏览器手动建仓库 XUANFENG)
  echo.
  set /p USE_GIT_ONLY="没有 gh 也要继续(仅推送到已存在的仓库)吗? [y/N]: "
  if /i not "%USE_GIT_ONLY%"=="y" exit /b 1
) else (
  echo [OK] gh CLI 已安装
  gh auth status >nul 2>nul
  if errorlevel 1 (
    echo [提示] gh 尚未登录，开始网页授权...
    gh auth login --hostname github.com --git-protocol https --web
  ) else (
    echo [OK] gh 已登录
  )
)

REM --- 取用户名 ---
set "GH_USER="
for /f "delims=" %%u in ('gh api user --jq .login 2^>nul') do set "GH_USER=%%u"
if "%GH_USER%"=="" set "GH_USER=%USERNAME%"
echo [信息] GitHub 用户名: %GH_USER%

REM --- 确保仓库存在 (不存在则新建) ---
gh repo view "%GH_USER%/XUANFENG" >nul 2>nul
if errorlevel 1 (
  echo [提示] 仓库 XUANFENG 不存在，正在新建(私有)...
  gh repo create XUANFENG --private --source=. --push 2>nul
  if errorlevel 1 gh repo create XUANFENG --private
  echo [OK] 仓库已创建
) else (
  echo [OK] 仓库 XUANFENG 已存在
)

REM --- 初始化 git 并推送 ---
if not exist .git (
  git init >nul 2>&1
  git branch -M main
)
git add -A
git -c user.name="LUSEM" -c user.email="lusem@users.noreply.github.com" commit -m "个人工作站 v41 - 2026-08-14 (客户体系升级)" >nul 2>&1
if errorlevel 1 git -c user.name="LUSEM" -c user.email="lusem@users.noreply.github.com" commit -m "个人工作站 v41 - 2026-08-14 (客户体系升级)"

echo [信息] 正在推送(覆盖旧内容)...
git remote remove origin 2>nul
git remote add origin "https://github.com/%GH_USER%/XUANFENG.git"
git push -u origin main --force

if errorlevel 1 (
  echo.
  echo [错误] 推送失败。可能原因: 网络不通 / 仓库为空且 gh 未建好 / 权限不足
  echo        请确认能打开 https://github.com 后重试
) else (
  echo.
  echo ============================================
  echo   [成功] 已上传到 https://github.com/%GH_USER%/XUANFENG
  echo ============================================
)
pause
