# SessionEnd entry point for Claude Code: stop the dev server this session started.
#
# A session owns its dev server for exactly its own lifetime. Leaving the process behind is
# what let a later session inherit it, so ending the session ends the server — but only when
# this session is the recorded owner, so a `resume`/`clear` handoff never kills the process
# the next session is about to keep using.

$ErrorActionPreference = 'Stop'

$repoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $repoDir '.codex-session\environment.json'
if (-not (Test-Path -LiteralPath $statePath)) { exit 0 }

$payload = ''
try { $payload = [Console]::In.ReadToEnd() } catch { $payload = '' }
$sessionId = ''
$reason = ''
if ($payload) {
    try {
        $event = $payload | ConvertFrom-Json
        $sessionId = [string]$event.session_id
        $reason = [string]$event.reason
    } catch { $sessionId = '' }
}
if (-not $sessionId) { exit 0 }

# `resume` and `clear` end this session only to start another one on the same environment.
# Tearing the server down there would bounce it for no reason.
if ($reason -in @('resume', 'clear')) { exit 0 }

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$recordedOwner = if ($state.PSObject.Properties['session_id']) { [string]$state.session_id } else { '' }
if (-not [string]::Equals($recordedOwner, $sessionId, [StringComparison]::Ordinal)) { exit 0 }

if ($env:DEVCTL_SCRIPT -and (Test-Path -LiteralPath $env:DEVCTL_SCRIPT)) {
    $devctlCommand = Get-Item -LiteralPath $env:DEVCTL_SCRIPT
} else {
    $devctlCommand = Get-Command devctl -ErrorAction SilentlyContinue
}
# Teardown is a courtesy, never a failure: an unreachable devctl leaves a process the next
# session replaces anyway, and SessionEnd cannot report an error usefully.
if (-not $devctlCommand) { exit 0 }

try { & $devctlCommand -Command stop -Target ([string]$state.name) | Out-Host } catch { }
exit 0
