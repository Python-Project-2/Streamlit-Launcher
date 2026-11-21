param(
  [Parameter(Mandatory=$true)][string]$File,
  [int]$Rows = 10,
  [string]$Filter = "from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article",
  [string]$Sort = "is-referenced-by-count",
  [string]$Field = "query.title"
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

$queries = Get-Content -LiteralPath $File -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }
foreach ($q in $queries) {
  "### $q"
  $enc = [uri]::EscapeDataString($q.Trim())
  $url = "https://api.crossref.org/works?$Field=$enc&rows=$Rows&filter=$Filter&sort=$Sort&order=desc&select=DOI,title,author,container-title,issued,volume,issue,page,is-referenced-by-count"
  try {
    $items = (Get-Cr $url).message.items
    $i = 0
    foreach ($m in $items) {
      $i++
      $yr = ($m.issued.'date-parts' | Select-Object -First 1)[0]
      $a1 = if ($m.author) { $m.author[0].family } else { "?" }
      "[$i] $yr c=$($m.'is-referenced-by-count') $a1 | $($m.title -join ' ')"
      "    $($m.'container-title' -join ' ') v$($m.volume)($($m.issue)) p$($m.page) | $($m.DOI)"
    }
  } catch { "ERR $($_.Exception.Message)" }
  ""
  Start-Sleep -Milliseconds 1200
}
