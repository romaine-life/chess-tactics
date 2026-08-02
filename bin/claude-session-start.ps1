# SessionStart entry point for Claude Code.
#
# Codex creates an environment once and runs setup once. Claude has no environment-creation
# event at all — only session events — so the same setup runs again on every startup, resume,
# clear, compact and fork. Setup therefore has to be able to tell ITS OWN session from any
# other session that has ever used this worktree, and the only thing that can answer that is
# the session id, which arrives on stdin as JSON and nowhere else.
#
# Read it here, hand it down as an environment variable, and let setup decide what to keep.
# Without this, `codex-environment-start.ps1` can only compare name/worktree/URL — identical
# for every session — and ends up adopting whatever process happens to be running.

$ErrorActionPreference = 'Stop'

$payload = ''
try { $payload = [Console]::In.ReadToEnd() } catch { $payload = '' }
if ($payload) {
    try {
        $event = $payload | ConvertFrom-Json
        if ($event.session_id) { $env:CLAUDE_SESSION_ID = [string]$event.session_id }
        if ($event.source) { $env:CLAUDE_SESSION_SOURCE = [string]$event.source }
    } catch {
        # A payload this script cannot read is not a reason to block the session. Setup falls
        # back to replacing the dev server, which is the safe direction: a session always ends
        # up on a process it started.
        Write-Host 'session identity was unreadable; starting a fresh dev server for safety.' -ForegroundColor Yellow
    }
}

& cmd.exe /c "`"$PSScriptRoot\codex-worktree-setup.cmd`""
exit $LASTEXITCODE
