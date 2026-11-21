param(
  [Parameter(Mandatory=$true)][string]$File
)
$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = @{ "User-Agent" = "RefCheck/1.0 (mailto:refcheck2026@example.org)" }

function Get-Cr($url) {
  for ($try = 1; $try -le 6; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $UA -TimeoutSec 60 }
    catch {
      $code = $null
      try { $code = [int]$_.Exception.Response.StatusCode } catch {}
      if ($code -eq 429 -or $code -eq 503 -or $code -eq 0) { Start-Sleep -Seconds (2 * $try); continue }
      throw
    }
  }
  throw "giving up"
}

$dois = Get-Content -LiteralPath $File -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }
foreach ($line in $dois) {
  $d = $line.Trim()
  "IN: $d"
  try {
    $m = (Get-Cr "https://api.crossref.org/works/$d").message
    $yr = ($m.published.'date-parts' | Select-Object -First 1)[0]
    $auth = ($m.author | ForEach-Object { "$($_.family) $($_.given)" }) -join "; "
    "  T: $($m.title -join ' ')"
    "  A: $auth"
    "  J: $($m.'container-title' -join ' ') $yr v$($m.volume)($($m.issue)) p$($m.page) art$($m.'article-number')"
    "  P: $($m.publisher) | $($m.type) | DOI $($m.DOI)"
  } catch { "  NOT FOUND" }
  ""
  Start-Sleep -Milliseconds 700
}
