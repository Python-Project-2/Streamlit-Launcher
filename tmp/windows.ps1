Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@
$target = (Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -First 1).Id
$results = New-Object System.Collections.ArrayList
$cb = [Win+EnumWindowsProc]{
  param($h, $l)
  $pid2 = 0
  [Win]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  if ($pid2 -eq $target) {
    $t = New-Object System.Text.StringBuilder 256
    $c = New-Object System.Text.StringBuilder 256
    [Win]::GetWindowText($h, $t, 256) | Out-Null
    [Win]::GetClassName($h, $c, 256) | Out-Null
    $null = $results.Add("$([Win]::IsWindowVisible($h)) | $($c.ToString()) | $($t.ToString())")
  }
  return $true
}
[Win]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$results | Where-Object { $_ -match 'Excel|NUIDialog|#32770|True' } | Select-Object -First 15
