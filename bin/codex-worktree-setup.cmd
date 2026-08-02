@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0..") do set "REPO_DIR=%%~fI"

echo chess-tactics Codex worktree setup: %REPO_DIR%

echo requesting named authenticated Codex session grant
node "%REPO_DIR%\bin\codex-auth-grant.mjs" || exit /b !ERRORLEVEL!

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

rem Claude Code has no environment-creation event: its SessionStart hook runs
rem this script on every session (startup, resume, clear, compact, fork), and
rem the documented rule is that those hooks stay fast. So each step below is
rem skipped once its own output is already current. npm writes
rem node_modules\.package-lock.json on install, so a lockfile newer than that
rem copy is the exact "dependencies are stale" signal.
call :ensure_deps frontend || exit /b !ERRORLEVEL!
call :ensure_deps backend || exit /b !ERRORLEVEL!

call :is_stale "%REPO_DIR%\frontend\package-lock.json" "%REPO_DIR%\frontend\dist\index.html"
if !STALE! == 0 (
  echo frontend preview build is current
) else (
  echo building frontend for backend preview
  call npm.cmd --prefix "%REPO_DIR%\frontend" run build || exit /b !ERRORLEVEL!
)

echo starting named full-stack development server
pwsh.exe -NoLogo -File "%REPO_DIR%\bin\codex-environment-start.ps1" || exit /b !ERRORLEVEL!

echo chess-tactics Codex worktree setup complete
exit /b 0

rem Installs a workspace only when its lockfile is newer than the installed tree.
:ensure_deps
call :is_stale "%REPO_DIR%\%~1\package-lock.json" "%REPO_DIR%\%~1\node_modules\.package-lock.json"
if !STALE! == 0 (
  echo %~1 dependencies are current
  exit /b 0
)
echo installing %~1 dependencies
call npm.cmd --prefix "%REPO_DIR%\%~1" ci || exit /b !ERRORLEVEL!
exit /b 0

rem STALE=1 unless %2 exists and is at least as new as %1.
:is_stale
set "STALE=1"
if not exist "%~2" exit /b 0
for /f "usebackq delims=" %%R in (`pwsh.exe -NoLogo -NoProfile -Command "if ((Get-Item -LiteralPath '%~2').LastWriteTimeUtc -ge (Get-Item -LiteralPath '%~1').LastWriteTimeUtc) { '0' } else { '1' }"`) do set "STALE=%%R"
exit /b 0
