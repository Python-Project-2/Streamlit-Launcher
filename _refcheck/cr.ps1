param(
  [string[]]$Dois,
  [string[]]$Queries,
  [string]$Doi,
  [string]$Query,
  [int]$Rows = 6,
  [string]$Filter = "from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article"
)
$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$UA = @{ "User-Agent" = "RefCheck/1.0 (mailto:refcheck2026@example.org)" }

function Get-Cr($url) {
  for ($try = 1; $try -le 5; $try++) {
    try { return Invoke-RestMethod -Uri $url -Headers $UA -TimeoutSec 60 }
    catch {
      $code = $null
      try { $code = $_.Exception.Response.StatusCode.value__ } catch {}
      if ($code -eq 429 -or $code -eq 503) { Start-Sleep -Seconds (3 * $try); continue }
      throw
    }
  }
  throw "giving up"
}

function Show-Doi($d) {
  $d = $d.Trim()
  if ($d -match 'doi\.org/(.+)$') { $d = $matches[1] }
  try {
    $m = (Get-Cr "https://api.crossref.org/works/$d").message
    $yr = ($m.published.'date-parts' | Select-Object -First 1)[0]
    $auth = ($m.author | ForEach-Object { "$($_.family) $($_.given)" }) -join " | "
    "DOI: $($m.DOI)"
    "T: $($m.title -join ' ')"
    "A: $auth"
    "J: $($m.'container-title' -join ' ') $yr v$($m.volume)($($m.issue)) p$($m.page)"
    "P: $($m.publisher) | TYPE $($m.type)"
    ""
  } catch { "DOI $d => NOT FOUND ($($_.Exception.Message))"; "" }
}

function Show-Q($q) {
  "### $q"
  $enc = [uri]::EscapeDataString($q)
  $url = "https://api.crossref.org/works?query.bibliographic=$enc&rows=$Rows&filter=$Filter&select=DOI,title,author,container-title,issued,volume,issue,page,article-number"
  try {
    $items = (Get-Cr $url).message.items
    $i = 0
    foreach ($m in $items) {
      $i++
      $yr = ($m.issued.'date-parts' | Select-Object -First 1)[0]
      $a1 = if ($m.author) { $m.author[0].family } else { "?" }
      "[$i] $yr $a1 | $($m.title -join ' ')"
      "    $($m.'container-title' -join ' ') v$($m.volume)($($m.issue)) p$($m.page) | $($m.DOI)"
    }
  } catch { "ERR $($_.Exception.Message)" }
  ""
  Start-Sleep -Milliseconds 1200
}

if ($Doi) { Show-Doi $Doi }
if ($Dois) { foreach ($d in $Dois) { Show-Doi $d; Start-Sleep -Milliseconds 800 } }
if ($Query) { Show-Q $Query }
if ($Queries) { foreach ($q in $Queries) { Show-Q $q } }
