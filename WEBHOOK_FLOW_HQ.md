# EZ SIGNAL HQ Webhook Fanout Flow

```mermaid
flowchart TD
  TV[TradingView Alerts]
  HQ[EZ SIGNAL HQ Webhook Endpoint]
  VALIDATE[Validate secret, event, pair, mode, type]
  RULES[Load HQ brand rules and routing config]
  ROUTE{Which brands should receive this signal?}
  KAFRA[KAFRA SIGNAL]
  SARJAN[SARJAN]
  RJ[RICH JOKER]
  SHINOBI[SHINOBI]
  KAPITAN[KAPITAN]
  DBFANOUT[DB fanout / queue write]
  HTTPFANOUT[HTTP fanout to brand webhook URLs]
  BRANDWEB[Brand webhook / brand signal route]
  SIG[signals table]
  PERF[performance_logs table]
  UI[Brand access / performance UI]
  HQMON[HQ monitor / retry / status]

  TV --> HQ --> VALIDATE --> RULES --> ROUTE
  ROUTE --> KAFRA
  ROUTE --> SARJAN
  ROUTE --> RJ
  ROUTE --> SHINOBI
  ROUTE --> KAPITAN

  ROUTE --> DBFANOUT --> HQMON
  ROUTE --> HTTPFANOUT --> BRANDWEB

  BRANDWEB --> SIG --> PERF --> UI
  BRANDWEB --> HQMON
```

## Flow Summary

1. TradingView sends one alert to EZ SIGNAL HQ.
2. HQ validates the payload and loads brand routing rules.
3. HQ decides which brands should receive the signal.
4. HQ fans out to the selected brands using HTTP, DB, or both.
5. Each brand stores the signal, updates live state, and later writes performance history.
6. HQ keeps the dispatch status so failed jobs can be retried.

## Practical Rule

- `signal` event starts a live signal.
- `price_update` keeps live signals moving.
- `TP1` and `TP2` remain active.
- `TP3` or `SL` ends the signal.
- `performance_logs` stores the final history.

