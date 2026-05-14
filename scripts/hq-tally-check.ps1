param(
  [string]$BaseUrl = "https://signal.ezos.my"
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Host "FAIL: $message" -ForegroundColor Red
  exit 1
}

$url = "$($BaseUrl.TrimEnd('/'))/api/hq/audit/tally"
Write-Host "Checking: $url" -ForegroundColor Cyan

$res = Invoke-RestMethod -Method Get -Uri $url
if (-not $res.ok) {
  Fail "Endpoint returned ok=false"
}

Write-Host "Backend: $($res.runtime.backend) | DB: $($res.runtime.dbConfigured)" -ForegroundColor Yellow
Write-Host "Healthy: $($res.healthy)" -ForegroundColor Yellow

if (-not $res.healthy) {
  Write-Host "Issues:" -ForegroundColor Yellow
  foreach ($issue in $res.issues) {
    Write-Host " - $issue" -ForegroundColor DarkYellow
  }
  Fail "Tally health check failed."
}

Write-Host "Brand totals:" -ForegroundColor Green
$res.brands.PSObject.Properties | ForEach-Object {
  $name = $_.Name
  $v = $_.Value
  Write-Host " - ${name}: active=$($v.activeUsers), expired=$($v.expiredUsers), keys=$($v.keysIssued), signalsToday=$($v.signalsToday), perf=$($v.performanceLogs)"
}

Write-Host "Global totals: active=$($res.global.activeUsers), expired=$($res.global.expiredUsers), keys=$($res.global.keysIssued), signalsToday=$($res.global.signalsToday), perf=$($res.global.performanceLogs)" -ForegroundColor Green
Write-Host "PASS: HQ tally is healthy." -ForegroundColor Green
