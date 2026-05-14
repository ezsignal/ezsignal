# HQ TradingView Alert Templates

Endpoint:

`https://signal.ezos.my/api/hq/webhooks/signal`

## 1) HQ SCALPING HEARBEAT

```json
{"secret":"ayamgorengenak","event":"price_update","pair":"XAUUSD","mode":"scalping","live_price":"{{close}}","brands":["kafra","sarjan","richjoker","shinobi"]}
```

## 2) HQ INTRADAY HEARBEAT

```json
{"secret":"ayamgorengenak","event":"price_update","pair":"XAUUSD","mode":"intraday","live_price":"{{close}}","brands":["kafra","sarjan","richjoker","shinobi"]}
```

## 3) HQ SCALPING SIGNAL

```json
{"secret":"ayamgorengenak","event":"signal","pair":"XAUUSD","mode":"scalping","type":"sell","entry_target":{{close}},"live_price":{{close}},"sl":{{plot_0}},"tp1":{{plot_1}},"tp2":{{plot_2}},"tp3":{{plot_3}},"status":"active","brands":["kafra","sarjan","richjoker","shinobi"]}
```

## 4) HQ INTRADAY SIGNAL

```json
{"secret":"ayamgorengenak","event":"signal","pair":"XAUUSD","mode":"intraday","type":"sell","entry_target":{{close}},"live_price":{{close}},"sl":{{plot_0}},"tp1":{{plot_1}},"tp2":{{plot_2}},"tp3":{{plot_3}},"status":"active","brands":["kafra","sarjan","richjoker","shinobi"]}
```
