Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win2 {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
}
"@
$target = (Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -First 1).Id
$dlg = [IntPtr]::Zero
$cb = [Win2+EnumProc]{
  param($h, $l)
  $pid2 = 0
  [Win2]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  if ($pid2 -eq $target) {
    $c = New-Object System.Text.StringBuilder 256
    [Win2]::GetClassName($h, $c, 256) | Out-Null
    if ($c.ToString() -eq 'NUIDialog') { $script:dlg = $h }
  }
  return $true
}
[Win2]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
if ($dlg -ne [IntPtr]::Zero) {
  $texts = New-Object System.Collections.ArrayList
  $cb2 = [Win2+EnumProc]{
    param($h, $l)
    $c = New-Object System.Text.StringBuilder 256
    $t = New-Object System.Text.StringBuilder 512
    [Win2]::GetClassName($h, $c, 256) | Out-Null
    [Win2]::GetWindowText($h, $t, 512) | Out-Null
    if ($t.Length -gt 0) { $null = $texts.Add("$($c.ToString()): $($t.ToString())") }
    return $true
  }
  [Win2]::EnumChildWindows($dlg, $cb2, [IntPtr]::Zero) | Out-Null
  $texts | Select-Object -First 20
} else { 'no dialog' }
