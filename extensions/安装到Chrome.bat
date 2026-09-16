@echo off
chcp 65001 >nul
echo ═══════════════════════════════════════
echo   工作站同步 · Chrome 扩展安装助手
echo ═══════════════════════════════════════
echo.

:: 解压到用户目录
set TARGET=%USERPROFILE%\Desktop\工作站同步扩展
echo [1/3] 解压到: %TARGET%
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%" 2>nul

:: 用 PowerShell 解压
powershell -Command "Expand-Archive -Path '%~dp0工作站同步扩展-v1.1.zip' -DestinationPath '%TARGET%' -Force"

if %ERRORLEVEL% neq 0 (
    echo ❌ 解压失败，请手动解压 ZIP 文件
    pause
    exit /b 1
)

echo [2/3] 打开 Chrome 扩展管理页面...
start chrome://extensions/

echo.
echo [3/3] 请按以下步骤操作:
echo ─────────────────────────────────────
echo  1. 打开右上角「开发者模式」开关
echo  2. 点「加载已解压的扩展程序」
echo  3. 选择桌面的「工作站同步扩展」文件夹
echo  4. 点扩展图标 → 齿轮 → 填入坚果云账号
echo ─────────────────────────────────────
echo.
echo 文件位置: %TARGET%
echo.
pause
