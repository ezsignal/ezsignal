param(
  [string]$BaseUrl = "https://signal.ezos.my",
  [switch]$SkipReplay
)

$ErrorActionPreference = "Stop"

function Read-EnvFile([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Env file not found: $path"
  }

  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $k, $v = $line.Split("=", 2)
    $map[$k.Trim()] = $v.Trim().Trim('"')
  }
  return $map
}

function Step([string]$text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Require-Value([hashtable]$map, [string]$key, [string]$label) {
  $value = $map[$key]
  if (-not $value) {
    throw "Missing $label ($key)"
  }
  return $value
}

function Get-LatestSignalPayload([string]$supabaseUrl, [string]$serviceKey) {
  $headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
  $url = "$supabaseUrl/rest/v1/webhook_event_ingress?select=payload,received_at&order=received_at.desc&limit=60"
  $rows = Invoke-RestMethod -Method Get -Uri $url -Headers $headers
  $candidate = $rows | Where-Object { $_.payload -and $_.payload.event -eq "signal" } | Select-Object -First 1
  if (-not $candidate) {
    throw "No latest signal payload found in webhook_event_ingress"
  }

  $payload = @{}
  $candidate.payload.psobject.Properties | ForEach-Object {
    $payload[$_.Name] = $_.Value
  }
  return $payload
}

function Normalize-SignalPayload([hashtable]$payload) {
  if (-not $payload["event"]) { $payload["event"] = "signal" }
  if (-not $payload["pair"] -and $payload["symbol"]) { $payload["pair"] = $payload["symbol"] }
  if (-not $payload["mode"] -and $payload["strategy"]) { $payload["mode"] = $payload["strategy"] }
  if (-not $payload["type"] -and $payload["action"]) { $payload["type"] = $payload["action"] }
  if (-not $payload["entry_target"] -and $payload["entry"]) { $payload["entry_target"] = $payload["entry"] }
  if (-not $payload["live_price"] -and $payload["price"]) { $payload["live_price"] = $payload["price"] }
  if (-not $payload["live_price"] -and $payload["entry_target"]) { $payload["live_price"] = $payload["entry_target"] }
  if (-not $payload["sl"] -and $payload["stop_loss"]) { $payload["sl"] = $payload["stop_loss"] }
  if (-not $payload["tp1"] -and $payload["take_profit_1"]) { $payload["tp1"] = $payload["take_profit_1"] }
  if (-not $payload["tp2"] -and $payload["take_profit_2"]) { $payload["tp2"] = $payload["take_profit_2"] }
  if (-not $payload["tp3"] -and $payload["take_profit_3"]) { $payload["tp3"] = $payload["take_profit_3"] }
  if (-not $payload["status"]) { $payload["status"] = "active" }
}

function Invoke-BrandWebhookHealth([string]$name, [string]$url, [string]$adminKey) {
  try {
    $resp = Invoke-RestMethod -Method Get -Uri $url -Headers @{ "x-admin-key" = $adminKey } -TimeoutSec 20
    if (-not $resp.ok) {
      return [pscustomobject]@{
        brand = $name
        ok = $false
        error = "ok=false"
      }
    }
    return [pscustomobject]@{
      brand = $name
      ok = $true
      activeSignals = $resp.data.active_signal_count
      latestSignalAt = $resp.data.latest_signal.updated_at
      latestPerformanceAt = $resp.data.latest_performance.created_at
      signalLagSeconds = $resp.data.signal_lag_seconds
    }
  }
  catch {
    return [pscustomobject]@{
      brand = $name
      ok = $false
      error = $_.Exception.Message
    }
  }
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$groupRoot = Split-Path $repoRoot -Parent

$hqEnvPath = Join-Path $repoRoot ".env.local"
$hqEnv = Read-EnvFile $hqEnvPath

$hqSupabaseUrl = Require-Value $hqEnv "HQ_SUPABASE_URL" "HQ Supabase URL"
$hqServiceKey = Require-Value $hqEnv "HQ_SUPABASE_SERVICE_ROLE_KEY" "HQ Supabase service key"
$hqWebhookSecret = Require-Value $hqEnv "HQ_WEBHOOK_SECRET" "HQ webhook secret"

$base = $BaseUrl.TrimEnd("/")
$statusUrl = "$base/api/hq/dispatch/status"
$webhookUrl = "$base/api/hq/webhooks/signal"

Step "HQ status before replay"
$statusBefore = Invoke-RestMethod -Method Get -Uri $statusUrl
Write-Host ("sent={0} failed={1} deadLetter={2} queued={3}" -f $statusBefore.counts.sent, $statusBefore.counts.failed, $statusBefore.counts.deadLetter, $statusBefore.counts.queued)

$replayEventId = $null
$replayIngressId = $null

if (-not $SkipReplay) {
  Step "Replay latest signal to HQ"
  $payload = Get-LatestSignalPayload -supabaseUrl $hqSupabaseUrl -serviceKey $hqServiceKey
  Normalize-SignalPayload -payload $payload

  $replayEventId = "manual-replay-signal-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payload["event_id"] = $replayEventId
  $payload["webhook_secret"] = $hqWebhookSecret

  $body = $payload | ConvertTo-Json -Depth 20
  $replay = Invoke-RestMethod -Method Post -Uri $webhookUrl -ContentType "application/json" -Body $body
  $replayIngressId = $replay.event.id

  Write-Host ("event_id={0} ok={1} mode={2} plannedJobs={3}" -f $replayEventId, $replay.ok, $replay.mode, $replay.plannedJobs)
  Start-Sleep -Seconds 4
}

Step "HQ status after replay"
$statusAfter = Invoke-RestMethod -Method Get -Uri $statusUrl
Write-Host ("sent={0} failed={1} deadLetter={2} queued={3}" -f $statusAfter.counts.sent, $statusAfter.counts.failed, $statusAfter.counts.deadLetter, $statusAfter.counts.queued)

if ($replayIngressId) {
  $ingress = $statusAfter.recentIngress | Where-Object { $_.id -eq $replayIngressId } | Select-Object -First 1
  if (-not $ingress) {
    throw "Replay ingress $replayIngressId not found in recent ingress."
  }
  Write-Host ("replay_ingress status={0} receivedAt={1}" -f $ingress.status, $ingress.receivedAt)

  $jobs = $statusAfter.recentJobs | Where-Object { $_.ingressId -eq $replayIngressId }
  if (($jobs | Measure-Object).Count -lt 4) {
    throw "Replay ingress jobs less than 4. Found: $((($jobs | Measure-Object).Count))"
  }
  $failedJobs = $jobs | Where-Object { $_.status -ne "sent" }
  if (($failedJobs | Measure-Object).Count -gt 0) {
    throw "Replay has non-sent jobs: $($failedJobs | ConvertTo-Json -Depth 6 -Compress)"
  }
}

Step "Per-brand webhook health"
$brandTargets = @(
  @{ name = "kafra"; env = (Join-Path $groupRoot "KAFRA SIGNAL\\.env.local"); url = "https://signal.kafra.ai/api/admin/webhook-health" },
  @{ name = "sarjan"; env = (Join-Path $groupRoot "SARJAN SIGNAL\\.env.local"); url = "https://sarjansignal.ezos.my/api/admin/webhook-health" },
  @{ name = "richjoker"; env = (Join-Path $groupRoot "RICH JOKER INDI\\.env.local"); url = "https://richjoker.ezos.my/api/admin/webhook-health" },
  @{ name = "shinobi"; env = (Join-Path $groupRoot "SHINOBI INDI\\.env.local"); url = "https://shinobi.ezos.my/api/admin/webhook-health" }
)

$results = @()
foreach ($target in $brandTargets) {
  $brandEnv = Read-EnvFile $target.env
  $adminKey = Require-Value $brandEnv "ADMIN_CRM_KEY" "$($target.name) admin key"
  $result = Invoke-BrandWebhookHealth -name $target.name -url $target.url -adminKey $adminKey
  $results += $result
}

$failed = $results | Where-Object { -not $_.ok }
foreach ($row in $results) {
  if ($row.ok) {
    Write-Host ("{0}: ok | active={1} | latest_signal={2} | lag_s={3} | latest_perf={4}" -f $row.brand, $row.activeSignals, $row.latestSignalAt, $row.signalLagSeconds, $row.latestPerformanceAt)
  }
  else {
    Write-Host ("{0}: FAIL | {1}" -f $row.brand, $row.error) -ForegroundColor Red
  }
}

if (($failed | Measure-Object).Count -gt 0) {
  throw "One or more brand health checks failed."
}

Step "PASS"
if ($replayEventId) {
  Write-Host "Replay + fanout + all brand checks passed. event_id=$replayEventId" -ForegroundColor Green
}
else {
  Write-Host "Status + all brand checks passed (replay skipped)." -ForegroundColor Green
}
