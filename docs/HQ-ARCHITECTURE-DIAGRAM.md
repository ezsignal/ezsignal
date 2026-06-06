# EZ SIGNAL HQ — Architecture & Flow Diagrams

> Render: buka fail ini dalam VSCode (Markdown preview) — diagram Mermaid akan papar automatik.

---

## 1) Gambaran Besar (High-Level Architecture)

```mermaid
flowchart TB
    subgraph SRC["📡 Sumber Signal"]
        TV["TradingView<br/>Alert"]
        MT5["MT5 / EA"]
        MANUAL["Manual / Replay<br/>(smoke test)"]
    end

    subgraph HQ["🧠 EZ SIGNAL HQ (control plane)"]
        WH["/api/hq/webhooks/signal<br/>(POST)"]
        RT["hqWebhookRuntime<br/>verify · dedup · resolveTargetBrands"]
        FAN["hqSignalDbFanout<br/>fanoutSignalToBrandsDb"]
        REG["registry.ts<br/>(single source of truth)"]
        DASH["Dashboard HQ<br/>/ · /brands · /performance · /signals"]
    end

    subgraph DB["🗄️ Shared Supabase (satu DB, brand_id-scoped + RLS)"]
        TSIG["signals"]
        TPERF["performance_logs"]
        TING["webhook_event_ingress"]
        TBR["brands / brand_publish_rules"]
    end

    subgraph BRANDS["🏷️ Brand Apps (white-label)"]
        KAFRA["KAFRA"]
        SARJAN["SARJAN"]
        KAPITAN["KAPITAN"]
        RJ["RICHJOKER"]
        SHINOBI["SHINOBI"]
        LIZA["💋 LIZA"]
    end

    TV --> WH
    MT5 --> WH
    MANUAL --> WH

    WH --> RT
    RT -->|guna senarai brand| REG
    RT --> FAN
    FAN -->|tulis row per brand_id| TSIG
    FAN --> TPERF
    WH --> TING

    REG --> DASH
    DASH -. baca metrik .-> DB

    TSIG -->|/api/signals + realtime| KAFRA
    TSIG --> SARJAN
    TSIG --> KAPITAN
    TSIG --> RJ
    TSIG --> SHINOBI
    TSIG --> LIZA

    TBR --- REG
```

---

## 2) Aliran Signal — Langkah demi Langkah (Sequence)

```mermaid
sequenceDiagram
    autonumber
    participant TV as TradingView/MT5
    participant WH as /webhooks/signal
    participant RT as hqWebhookRuntime
    participant REG as registry.ts
    participant FAN as hqSignalDbFanout
    participant DB as Supabase
    participant APP as Brand App (cth LIZA)

    TV->>WH: POST payload (event=signal, pair, sl, tp1..3, secret)
    WH->>RT: verifyWebhookSignature()
    WH->>RT: sanitizeInboundPayload()
    WH->>RT: registerIngressEvent() (dedup ikut event_id)
    RT->>REG: resolveTargetBrands()
    REG-->>RT: [kafra, sarjan, ... , liza]
    RT->>FAN: fanoutSignalToBrandsDb(payload, targetBrands)
    loop setiap brand
        FAN->>FAN: skala harga (price multiplier per brand)
        FAN->>DB: INSERT/UPDATE signals (brand_id=...)
    end
    FAN-->>WH: {ok, plannedJobs, sent}
    APP->>DB: GET /api/signals (scoped brand_id) + realtime
    DB-->>APP: row signal brand sendiri
```

---

## 3) Peta Frontend ↔ Backend ↔ Lib

```mermaid
flowchart LR
    subgraph FE["🖥️ Frontend Pages"]
        P1["/ Dashboard"]
        P2["/brands · /brands/[id]"]
        P3["/signals"]
        P4["/performance"]
        P5["/access-keys"]
        P6["/security"]
        P7["/ops · /webhook · /supabase"]
        P8["/login"]
    end

    subgraph API["⚙️ API Routes (/api/hq/*)"]
        A1["webhooks/signal"]
        A2["dispatch/{status,run,retry,replay}"]
        A3["performance + /audit"]
        A4["brands/[id]/{performance,scaling,telegram}"]
        A5["auth/{login,logout}"]
        A6["webhook-flags · trading-day · ops-alert-telegram"]
        A7["audit/tally"]
    end

    subgraph LIB["🧠 Lib (logik)"]
        L1["registry"]
        L2["hqWebhookRuntime"]
        L3["hqSignalDbFanout"]
        L4["hqOverview"]
        L5["hqOpsData"]
        L6["hqAdminAuth"]
        L7["hq*Settings"]
    end

    P1 --> L4
    P2 --> L1
    P3 --> L5
    P4 --> A3
    P5 --> L5
    P6 --> L5
    P7 --> A6
    P8 --> A5

    A1 --> L2 --> L3
    L2 --> L1
    A2 --> L2
    A3 --> L7
    A4 --> L7
    A5 --> L6
    A6 --> L7
    A7 --> L1
```

---

## 4) Kedudukan LIZA dalam ekosistem

```mermaid
flowchart TB
    HQ["EZ SIGNAL HQ"] -->|registry-driven, auto-include| LIZA["LIZA FX ACADEMY<br/>brand_id = liza<br/>liza.ezos.my"]
    HQ --> OTHERS["5 brand lain<br/>(kafra, sarjan, kapitan, richjoker, shinobi)"]
    LIZA -->|baca| DB[("signals / performance_logs<br/>WHERE brand_id = 'liza'")]
    OTHERS --> DB
```

---

## 5) Struktur Database (ER Diagram — shared Supabase)

> Semua table ada `brand_id` → `brands.id` (multi-tenant, RLS scoped). Hanya hubungan utama ditunjuk.

```mermaid
erDiagram
    brands ||--o{ subscribers : "ada"
    brands ||--o{ access_keys : "ada"
    brands ||--o{ signals : "ada"
    brands ||--o{ performance_logs : "ada"
    brands ||--o{ security_alerts : "ada"
    brands ||--o{ package_links : "ada"
    brands ||--o{ telegram_bots : "ada"
    brands ||--o| landing_settings : "1:1"
    brands ||--o| brand_settings : "1:1"
    brands ||--o| brand_publish_rules : "1:1"
    brands ||--o{ admin_memberships : "ada"

    admin_profiles ||--o{ admin_memberships : "milik"
    subscribers ||--o{ access_keys : "pegang"
    access_keys ||--o{ security_alerts : "cetus"
    signals ||--o{ performance_logs : "hasilkan"
    performance_logs ||--o{ performance_log_edits : "diaudit"
    package_links ||--o{ link_redemptions : "ditebus"
    subscribers ||--o{ link_redemptions : "tebus"

    webhook_event_ingress ||--o{ signal_dispatch_jobs : "jana"
    signal_dispatch_jobs ||--o{ webhook_delivery_attempts : "cuba hantar"
    brands ||--o{ signal_dispatch_jobs : "sasaran"

    brands {
        text id PK
        text display_name
        text domain UK
        text role "core | white_label"
        boolean is_active
    }
    signals {
        uuid id PK
        text brand_id FK
        text pair "XAUUSD"
        text mode "scalping | intraday"
        text action "buy | sell"
        numeric entry
        numeric live_price
        numeric stop_loss
        numeric take_profit_1
        numeric take_profit_2
        numeric take_profit_3
        text status "active | closed | cancelled"
    }
    performance_logs {
        uuid id PK
        text brand_id FK
        uuid signal_id FK
        text outcome "tp1|tp2|tp3|sl|be"
        numeric net_pips
        numeric peak_pips
    }
    subscribers {
        uuid id PK
        text brand_id FK
        text name
        text email
        text package_name
        text status
    }
    access_keys {
        uuid id PK
        text brand_id FK
        uuid subscriber_id FK
        text key_hash
        boolean is_active
        timestamptz expired_at
    }
    webhook_event_ingress {
        uuid id PK
        text event_key UK
        boolean signature_valid
        jsonb payload
        text status "received|queued|processed|failed|duplicate"
    }
    signal_dispatch_jobs {
        uuid id PK
        uuid ingress_id FK
        text brand_id FK
        text status "queued|sent|failed|dead_letter"
        integer attempts
    }
    brand_publish_rules {
        text brand_id PK
        boolean webhook_enabled
        boolean fanout_enabled
        text routing_mode "direct | transform"
    }
```

### Kumpulan table (ikut fungsi)

| Kumpulan | Table |
|---|---|
| **Tenant / pendaftaran** | `brands`, `brand_settings`, `landing_settings`, `brand_publish_rules` |
| **Pelanggan & akses** | `subscribers`, `access_keys`, `package_links`, `link_redemptions`, `security_alerts` |
| **Signal & prestasi** | `signals`, `performance_logs`, `performance_log_edits` |
| **Webhook / dispatch** | `webhook_event_ingress`, `signal_dispatch_jobs`, `webhook_delivery_attempts` |
| **Admin & audit** | `admin_profiles`, `admin_memberships`, `audit_logs`, `telegram_bots` |

---

## 6) Semua Brand — Fan-out Detail (registry-driven)

> Satu signal masuk → HQ fan-out ke SEMUA 6 brand serentak. Setiap brand ada domain, Supabase group, accent & price-distance multiplier sendiri.

```mermaid
flowchart TB
    SIG["📡 Signal masuk<br/>TradingView / MT5"] --> WH["/api/hq/webhooks/signal"]
    WH --> RT["resolveTargetBrands()<br/>(registry.ts → 6 brand)"]
    RT --> FAN["fanoutSignalToBrandsDb()<br/>skala harga per brand"]

    FAN --> K
    FAN --> SA
    FAN --> KA
    FAN --> RJ
    FAN --> SH
    FAN --> LZ

    subgraph ACCA["🗄️ Supabase account A"]
        K["KAFRA SIGNAL ⭐core<br/>signal.kafra.ai<br/>×1.0 | parity 100%"]
        SA["SARJAN SIGNAL<br/>sarjansignal.ezos.my<br/>×1.0 | parity 92%"]
        KA["KAPITAN SIGNAL<br/>kapitansignal.ezos.my<br/>×1.0 | parity 100%"]
    end

    subgraph ACCB["🗄️ Supabase account B"]
        RJ["RICH JOKER<br/>richjoker.ezos.my<br/>×0.5 | parity 78%"]
        SH["SHINOBI<br/>shinobi.ezos.my<br/>×0.5 | parity 88%"]
    end

    subgraph SHARED["🗄️ EZ SIGNAL HQ (shared DB)"]
        LZ["💋 LIZA FX ACADEMY<br/>liza.ezos.my<br/>×1.0 | parity 0% (draft)"]
    end

    K -.->|baca /api/signals| KAPP["KAFRA app"]
    SA -.-> SAAPP["SARJAN app"]
    KA -.-> KAAPP["KAPITAN app"]
    RJ -.-> RJAPP["RICH JOKER app"]
    SH -.-> SHAPP["SHINOBI app"]
    LZ -.-> LZAPP["LIZA app"]
```

### Jadual rujukan brand (dari `registry.ts`)

| Brand | Domain | Role | Supabase Group | Price ×dist | Accent | Status / Parity |
|---|---|---|---|---|---|---|
| **KAFRA SIGNAL** | signal.kafra.ai | Core ⭐ | Account A | 1.0 | `#5eead4` | core / 100% |
| **SARJAN SIGNAL** | sarjansignal.ezos.my | White label | Account A | 1.0 | `#60a5fa` | synced / 92% |
| **KAPITAN SIGNAL** | kapitansignal.ezos.my | White label | Account A | 1.0 | `#f5c542` | synced / 100% |
| **RICH JOKER** | richjoker.ezos.my | White label | Account B | **0.5** | `#f59e0b` | watch / 78% |
| **SHINOBI** | shinobi.ezos.my | White label | Account B | **0.5** | `#d4af37` | synced / 88% |
| **LIZA FX ACADEMY** | liza.ezos.my | White label | **Shared HQ** | 1.0 | `#f9a8d4` | draft / 0% |

> **Nota price multiplier:** RICH JOKER & SHINOBI guna ×0.5 (jarak harga entry/SL/TP dikecilkan separuh) — boleh override per brand via env `HQ_BRAND_<ID>_PRICE_DISTANCE_MULTIPLIER`. Brand lain default ×1.0.
