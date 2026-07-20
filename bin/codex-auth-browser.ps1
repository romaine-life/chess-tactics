$ErrorActionPreference = 'Stop'

$approvalUrl = $env:CODEX_AUTH_APPROVAL_URL
if ([string]::IsNullOrWhiteSpace($approvalUrl)) {
  throw 'CODEX_AUTH_APPROVAL_URL is required'
}

$approvalUri = [Uri]$approvalUrl
if ($approvalUri.Scheme -notin @('http', 'https')) {
  throw "Unsupported approval URL scheme: $($approvalUri.Scheme)"
}

$userChoicePath = 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice'
$progId = (Get-ItemProperty -LiteralPath $userChoicePath).ProgId
$handlerPath = "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command"
$handlerCommand = (Get-Item -LiteralPath $handlerPath).GetValue('')

if ($handlerCommand -match '^\s*"([^"]+)"') {
  $browserExecutable = $Matches[1]
} elseif ($handlerCommand -match '^\s*([^\s]+)') {
  $browserExecutable = $Matches[1]
} else {
  throw "Could not resolve the executable for the default HTTPS handler $progId"
}

if (-not (Test-Path -LiteralPath $browserExecutable -PathType Leaf)) {
  throw "The default HTTPS browser executable does not exist: $browserExecutable"
}

$browserProcessName = [IO.Path]::GetFileNameWithoutExtension($browserExecutable)
$browserFileName = [IO.Path]::GetFileName($browserExecutable).ToLowerInvariant()
$newWindowBrowsers = @('brave.exe', 'chrome.exe', 'firefox.exe', 'msedge.exe', 'opera.exe', 'vivaldi.exe')

Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class CodexAuthBrowserWindow
{
    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    public static IntPtr[] VisibleHandles(string processName)
    {
        var processIds = new HashSet<uint>();
        foreach (var process in Process.GetProcessesByName(processName))
        {
            processIds.Add((uint)process.Id);
            process.Dispose();
        }

        var windows = new List<IntPtr>();
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            if (processIds.Contains(processId) && IsWindowVisible(window))
            {
                windows.Add(window);
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static bool BringToFront(IntPtr window)
    {
        const int RestoreWindow = 9;
        ShowWindowAsync(window, RestoreWindow);
        return SetForegroundWindow(window);
    }
}
'@

$existingHandles = @([CodexAuthBrowserWindow]::VisibleHandles($browserProcessName) | ForEach-Object { $_.ToInt64() })

if ($browserFileName -in $newWindowBrowsers) {
  $escapedUrl = $approvalUri.AbsoluteUri.Replace('"', '%22')
  Start-Process -FilePath $browserExecutable -ArgumentList @('--new-window', "`"$escapedUrl`"") -WindowStyle Normal
} else {
  Start-Process -FilePath $approvalUri.AbsoluteUri -WindowStyle Normal
}

$windowToActivate = $null
for ($attempt = 0; $attempt -lt 50; $attempt += 1) {
  Start-Sleep -Milliseconds 100
  $visibleHandles = @([CodexAuthBrowserWindow]::VisibleHandles($browserProcessName))
  $windowToActivate = $visibleHandles | Where-Object { $_.ToInt64() -notin $existingHandles } | Select-Object -First 1
  if ($null -ne $windowToActivate) {
    break
  }
}

if ($null -eq $windowToActivate) {
  $windowToActivate = [CodexAuthBrowserWindow]::VisibleHandles($browserProcessName) | Select-Object -First 1
}

if ($null -ne $windowToActivate) {
  [void][CodexAuthBrowserWindow]::BringToFront($windowToActivate)
}
