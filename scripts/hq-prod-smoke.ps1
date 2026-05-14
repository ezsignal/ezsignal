param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$DispatchToken,

  [Parameter(Mandatory = $true)]
  [string]$WebhookSecret,

  [ValidateSet("kafra", "sarjan", "richjoker", "shinobi")]
  [string]$Brand = "kafra"
)

$ErrorActionPreference = "Stop"

function Write-Step($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

$base = $BaseUrl.TrimEnd("/")
$statusUrl = "$base/api/hq/dispatch/status"
$runUrl = "$base/api/hq/dispatch/run?limit=20"
$webhookUrl = "$base/api/hq/webhooks/signal"

Write-Step "1) Status endpoint"
$status1 = Invoke-RestMethod -Method Get -Uri $statusUrl
$status1 | ConvertTo-Json -Depth 8

Write-Step "2) Unauthorized dispatch should fail"
try {
  Invoke-RestMethod -Method Get -Uri $runUrl | Out-Null
  throw "Unauthorized dispatch unexpectedly succeeded."
}
catch {
  $msg = $_.Exception.Message
  Write-Host "Expected unauthorized response: $msg" -ForegroundColor Yellow
}

Write-Step "3) Authorized dispatch should pass"
$headers = @{ Authorization = "Bearer $DispatchToken" }
$run = Invoke-RestMethod -Method Get -Uri $runUrl -Headers $headers
$run | ConvertTo-Json -Depth 8

Write-Step "4) Send one webhook event"
$eventId = "evt-prod-smoke-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payload = @{
  event_id = $eventId
  event = "signal"
  action = "buy"
  type = "buy"
  pair = "XAUUSD"
  live_price = 3330.10
  entry_target = 3329.80
  sl = 3322.0
  tp1 = 3333.0
  tp2 = 3336.0
  tp3 = 3339.0
  brands = @($Brand)
  webhook_secret = $WebhookSecret
} | ConvertTo-Json -Depth 8 -Compress

$ingress = Invoke-RestMethod -Method Post -Uri $webhookUrl -Headers @{
  "x-webhook-provider" = "manual"
  "x-event-id" = $eventId
} -ContentType "application/json" -Body $payload
$ingress | ConvertTo-Json -Depth 8

Write-Step "5) Wait and check status again"
Start-Sleep -Seconds 3
$status2 = Invoke-RestMethod -Method Get -Uri $statusUrl
$status2 | ConvertTo-Json -Depth 8

Write-Step "Done"
Write-Host "Smoke test finished. Validate sent/failed/deadLetter counts in output above." -ForegroundColor Green
