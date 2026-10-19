@echo off
cd /d "%~dp0"
if exist .env (
  node --env-file=.env scripts\launch.mjs %*
) else (
  node scripts\launch.mjs %*
)
pause
