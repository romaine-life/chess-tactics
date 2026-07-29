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
    return & $devctlCommand -Command list -Json
}

function Remove-DeadDevctlEntries {
    & $devctlCommand -Command clean
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

$entry = $existing | Select-Object -First 1
if ($entry) {
    $sameWorktree = [string]::Equals(
        [IO.Path]::GetFullPath([string]$entry.cwd).TrimEnd('\'),
        [IO.Path]::GetFullPath($frontendDir).TrimEnd('\'),
        [StringComparison]::OrdinalIgnoreCase
    )
    if ($entry.status -eq 'running' -and $sameWorktree -and $entry.url -eq $expectedUrl) {
        Write-Host "Reusing named dev server $($entry.name) at $($entry.url)." -ForegroundColor Green
    } elseif ($entry.status -eq 'dead') {
        Remove-DeadDevctlEntries | Out-Host
        $entry = $null
    } else {
        throw "Environment name '$($state.name)' is already owned by another live dev server at $($entry.cwd)."
    }
}

if (-not $entry) {
    $entryJson = (Start-DevctlFrontend | Out-String).Trim()
    $entry = $entryJson | ConvertFrom-Json
}

if ($entry.url -ne $expectedUrl) {
    throw "devctl returned '$($entry.url)' but this environment requires '$expectedUrl'."
}

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
