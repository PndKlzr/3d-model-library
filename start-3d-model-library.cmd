@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\package.json" (
  echo Dependencies are missing. Run setup-windows.cmd first.
  pause
  exit /b 1
)

call npm run electron:dev
if errorlevel 1 (
  echo.
  echo The application stopped with an error. Review the message above.
  pause
  exit /b 1
)

