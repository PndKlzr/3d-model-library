@echo off
setlocal
cd /d "%~dp0"

echo.
echo 3D Model Library - development setup
echo ====================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :missing_node

where npm >nul 2>nul
if errorlevel 1 goto :missing_node

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)"
if errorlevel 1 goto :old_node

echo Installing the exact dependencies from package-lock.json...
call npm ci
if errorlevel 1 goto :install_failed

echo Preparing the Electron runtime for the first launch...
call npm exec -- install-electron
if errorlevel 1 goto :electron_failed

echo Creating a desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-development-shortcut.ps1" -ProjectRoot "%~dp0"
if errorlevel 1 goto :shortcut_failed

echo.
echo Setup complete.
echo Use the desktop shortcut or start-3d-model-library.cmd to open the app.
echo.
pause
exit /b 0

:missing_node
echo.
echo Node.js and npm were not found.
echo Install Node.js 22.12 or newer from https://nodejs.org/ and run this file again.
echo.
pause
exit /b 1

:old_node
echo.
echo Node.js 22.12 or newer is required. Your installed version is:
node --version
echo Download a current LTS version from https://nodejs.org/ and run this file again.
echo.
pause
exit /b 1

:install_failed
echo.
echo Dependency installation failed. Review the npm error above; no global package was installed.
echo.
pause
exit /b 1

:electron_failed
echo.
echo Electron could not be prepared. Check your internet connection or antivirus, then run this setup again.
echo.
pause
exit /b 1

:shortcut_failed
echo.
echo Dependencies were installed, but the desktop shortcut could not be created.
echo You can still use start-3d-model-library.cmd from this folder.
echo.
pause
exit /b 1

