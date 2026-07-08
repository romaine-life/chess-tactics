@echo off
setlocal

for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"

echo chess-tactics Codex worktree setup: %REPO_DIR%
echo installing frontend dependencies
call npm.cmd --prefix "%REPO_DIR%\frontend" ci || exit /b %ERRORLEVEL%

echo installing backend dependencies
call npm.cmd --prefix "%REPO_DIR%\backend" ci || exit /b %ERRORLEVEL%

echo building frontend for backend preview
call npm.cmd --prefix "%REPO_DIR%\frontend" run build || exit /b %ERRORLEVEL%

echo chess-tactics Codex worktree setup complete
