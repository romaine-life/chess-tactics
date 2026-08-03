param(
    [string]$DevctlScript = $env:DEVCTL_SCRIPT,
    [int]$HealthTimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'

$repoDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$frontendDir = Join-Path $repoDir 'frontend'
$statePath = Join-Path $repoDir '.codex-session\environment.json'

if (-not (Test-Path -LiteralPath $statePath)) {
    throw "Environment identity is missing: $statePath"
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expectedUrl = "http://$($state.name).chess-tactics.localhost"

if ($DevctlScript) {
    if (-not (Test-Path -LiteralPath $DevctlScript)) {
        throw "DEVCTL_SCRIPT does not exist: $DevctlScript"
    }
    $devctlCommand = Get-Item -LiteralPath $DevctlScript
} else {
    $devctlCommand = Get-Command devctl -ErrorAction SilentlyContinue
    if (-not $devctlCommand) {
        throw 'devctl is unavailable. Load the PowerShell profile or set DEVCTL_SCRIPT to devctl.ps1.'
    }
}

function Get-DevctlList {
    # Setup needs only its approved name. Probing every unrelated environment
    # while holding devctl's lifecycle mutex serializes otherwise independent
    # worktree creation behind their health timeouts.
    return & $devctlCommand -Command list -Target ([string]$state.name) -Json
}

function Remove-DeadDevctlEntries {
    & $devctlCommand -Command clean -Target ([string]$state.name)
}

function Stop-DevctlEnvironment {
    & $devctlCommand -Command stop -Target ([string]$state.name)
}

function Start-DevctlFrontend {
    return & $devctlCommand -Command up -Target frontend -Name ([string]$state.name) -Cwd $frontendDir -Project chess-tactics -Json
}

$listedJson = (Get-DevctlList | Out-String).Trim()
$entries = if ($listedJson) { @($listedJson | ConvertFrom-Json) } else { @() }
$existing = @($entries | Where-Object { $_.name -eq $state.name })

if ($existing.Count -gt 1) {
    throw "devctl has more than one entry named '$($state.name)'. Run devctl clean and retry."
}

# A dev server belongs to the session that started it. Name, worktree and URL are all
# identical for every session that ever runs here, so they cannot answer "is this mine?" —
# only the recorded owner can. An unowned or foreign process is replaced, never adopted:
# handing a live server to a second session means one session's test runs bounce the other
# session's backend under it, which looks to the owner like the app hanging for no reason.
$sessionId = [string]$env:CLAUDE_SESSION_ID
$recordedOwner = if ($state.PSObject.Properties['session_id']) { [string]$state.session_id } else { '' }
$ownedByThisSession = $sessionId -and $recordedOwner -and [string]::Equals($recordedOwner, $sessionId, [StringComparison]::Ordinal)

$entry = $existing | Select-Object -First 1
if ($entry) {
    $sameWorktree = [string]::Equals(
        [IO.Path]::GetFullPath([string]$entry.cwd).TrimEnd('\'),
        [IO.Path]::GetFullPath($frontendDir).TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase
    )
    if (-not $sameWorktree) {
        throw "Environment name '$($state.name)' is already owned by another live dev server at $($entry.cwd)."
    }
    if ($entry.status -eq 'ready' -and $ownedByThisSession -and $entry.url -eq $expectedUrl) {
        # The same session re-entering: a resume, a compaction, or a cleared context. Its own
        # server keeps running rather than being bounced mid-task.
        Write-Host "Reusing this session's dev server $($entry.name) at $($entry.url)." -ForegroundColor Green
    } else {
        $owner = if ($recordedOwner) { "session $recordedOwner" } else { 'an unrecorded session' }
        Write-Host "Replacing the dev server left by $owner — this session starts its own." -ForegroundColor Yellow
        Stop-DevctlEnvironment | Out-Host
        Remove-DeadDevctlEntries | Out-Host
        $entry = $null
    }
}

if (-not $entry) {
    $entryJson = (Start-DevctlFrontend | Out-String).Trim()
    $entry = $entryJson | ConvertFrom-Json
}

if ($entry.url -ne $expectedUrl) {
    throw "devctl returned '$($entry.url)' but this environment requires '$expectedUrl'."
}

$state | Add-Member -NotePropertyName session_id -NotePropertyValue $sessionId -Force
$state | Add-Member -NotePropertyName devctl_name -NotePropertyValue $entry.name -Force
$state | Add-Member -NotePropertyName frontend_port -NotePropertyValue ([int]$entry.port) -Force
$state | Add-Member -NotePropertyName server_pid -NotePropertyValue ([int]$entry.pid) -Force
$state | Add-Member -NotePropertyName url -NotePropertyValue $entry.url -Force
$state | Add-Member -NotePropertyName status -NotePropertyValue 'starting' -Force
$state | Add-Member -NotePropertyName updated_at -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding utf8

$deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
$healthy = $false
do {
    if (-not (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) {
        throw "The named Vite process exited before $expectedUrl became healthy. Run: devctl logs $($entry.name)"
    }
    try {
        # Chrome and curl honor the special-use .localhost suffix directly, but
        # Windows/.NET DNS does not resolve nested names such as
        # feature.chess-tactics.localhost. Probe Caddy over loopback with the
        # exact Host header the browser sends.
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1/' -Headers @{ Host = $state.hostname } -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 750
    }
} while ([DateTime]::UtcNow -lt $deadline)

if (-not $healthy) {
    throw "$expectedUrl did not become healthy within $HealthTimeoutSeconds seconds."
}

$state.status = 'ready'
$state.updated_at = [DateTime]::UtcNow.ToString('o')
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding utf8

Write-Host "Named environment ready: $expectedUrl" -ForegroundColor Green
