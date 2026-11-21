param(
  [Parameter(Mandatory=$true)][string]$File,
  [int]$Rows = 10,
  [string]$Years = "2022 TO 2026",
  [string]$Sort = "CITED desc"
)
$ErrorActionPreference = "Continue"
$queries = Get-Content -LiteralPath $File -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }
foreach ($q in $queries) {
  "### $q"
  $full = "($q) AND (PUB_YEAR:[$Years])"
  $enc = [uri]::EscapeDataString($full)
  $s = [uri]::EscapeDataString($Sort)
  $u = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=$enc&format=json&pageSize=$Rows&resultType=lite&sort=$s"
  try {
    $r = Invoke-RestMethod $u -TimeoutSec 45
    "hits=$($r.hitCount)"
    $r.resultList.result | ForEach-Object { "$($_.pubYear) c=$($_.citedByCount) | $($_.title) | $($_.journalTitle) | $($_.doi)" }
  } catch { "ERR $($_.Exception.Message)" }
  ""
  Start-Sleep -Milliseconds 600
}
