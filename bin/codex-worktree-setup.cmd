@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"

echo chess-tactics Codex worktree setup: %REPO_DIR%

rem Codex-managed worktrees start at a detached HEAD by default. Give every
rem environment a durable, unique branch before an agent can modify files.
set "CURRENT_BRANCH="
for /f "usebackq delims=" %%B in (`git -C "%REPO_DIR%" symbolic-ref --quiet --short HEAD 2^>nul`) do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
  for /f "usebackq delims=" %%S in (`git -C "%REPO_DIR%" rev-parse --short HEAD`) do set "START_SHA=%%S"
  set "WORKTREE_BRANCH=codex/worktree-!START_SHA!-!RANDOM!!RANDOM!"
  echo creating feature branch !WORKTREE_BRANCH!
  git -C "%REPO_DIR%" switch -c "!WORKTREE_BRANCH!" || exit /b !ERRORLEVEL!
  echo publishing feature branch !WORKTREE_BRANCH!
  git -C "%REPO_DIR%" push --set-upstream origin "!WORKTREE_BRANCH!" || exit /b !ERRORLEVEL!
) else (
  echo using existing branch !CURRENT_BRANCH!
)

echo installing frontend dependencies
call npm.cmd --prefix "%REPO_DIR%\frontend" ci || exit /b !ERRORLEVEL!

echo installing backend dependencies
call npm.cmd --prefix "%REPO_DIR%\backend" ci || exit /b !ERRORLEVEL!

echo building frontend for backend preview
call npm.cmd --prefix "%REPO_DIR%\frontend" run build || exit /b !ERRORLEVEL!

echo chess-tactics Codex worktree setup complete
