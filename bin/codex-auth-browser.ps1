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
using System.Threading;

[ComImport]
[Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IVirtualDesktopManager
{
    [PreserveSig]
    int IsWindowOnCurrentVirtualDesktop(IntPtr topLevelWindow, out int onCurrentDesktop);

    [PreserveSig]
    int GetWindowDesktopId(IntPtr topLevelWindow, out Guid desktopId);

    [PreserveSig]
    int MoveWindowToDesktop(IntPtr topLevelWindow, ref Guid desktopId);
}

[ComImport]
[Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a")]
internal class VirtualDesktopManager
{
}

public static class CodexAuthBrowserWindow
{
    private delegate bool EnumWindowsCallback(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);

    [DllImport("user32.dll")]
    private static extern bool GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, System.Text.StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags);

    private static bool IsOnCurrentDesktop(IntPtr window)
    {
        IVirtualDesktopManager manager = null;
        try
        {
            manager = (IVirtualDesktopManager)new VirtualDesktopManager();
            int onCurrentDesktop;
            int result = manager.IsWindowOnCurrentVirtualDesktop(window, out onCurrentDesktop);
            return result >= 0 && onCurrentDesktop != 0;
        }
        catch
        {
            // Current supported Windows versions provide this API. Failing open preserves
            // compatibility with stripped-down Windows images where COM is unavailable.
            return true;
        }
        finally
        {
            if (manager != null && Marshal.IsComObject(manager))
            {
                Marshal.FinalReleaseComObject(manager);
            }
        }
    }

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
            if (processIds.Contains(processId) && IsWindowVisible(window) && IsOnCurrentDesktop(window))
            {
                windows.Add(window);
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static string WindowTitle(IntPtr window)
    {
        int length = GetWindowTextLength(window);
        var title = new System.Text.StringBuilder(length + 1);
        GetWindowText(window, title, title.Capacity);
        return title.ToString();
    }

    public static bool Surface(IntPtr window)
    {
        const int RestoreWindow = 9;
        const uint NoMove = 0x0002;
        const uint NoSize = 0x0001;
        const uint ShowWindow = 0x0040;
        var topmost = new IntPtr(-1);
        var notTopmost = new IntPtr(-2);
        uint flags = NoMove | NoSize | ShowWindow;

        bool restored = ShowWindowAsync(window, RestoreWindow);
        bool raised = SetWindowPos(window, topmost, 0, 0, 0, 0, flags);
        SetForegroundWindow(window);
        Thread.Sleep(350);
        bool normalized = SetWindowPos(window, notTopmost, 0, 0, 0, 0, flags);
        return restored && raised && normalized && IsWindowVisible(window) && IsOnCurrentDesktop(window);
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
for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
  Start-Sleep -Milliseconds 100
  $visibleHandles = @([CodexAuthBrowserWindow]::VisibleHandles($browserProcessName))
  $windowToActivate = $visibleHandles | Where-Object { $_.ToInt64() -notin $existingHandles } | Select-Object -First 1
  if ($null -eq $windowToActivate) {
    $windowToActivate = $visibleHandles |
      Where-Object { [CodexAuthBrowserWindow]::WindowTitle($_) -like "*$($approvalUri.Host)*" } |
      Select-Object -First 1
  }
  if ($null -ne $windowToActivate) {
    break
  }
}

if ($null -eq $windowToActivate) {
  throw "The browser command ran, but no new or auth-matching window appeared on the active desktop"
}

if (-not [CodexAuthBrowserWindow]::Surface($windowToActivate)) {
  throw "The approval window appeared, but Windows could not surface it on the active desktop"
}
