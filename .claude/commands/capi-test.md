---
description: Dispara un evento de conversión (CAPI) de prueba contra /api/tiktok-capi
argument-hint: [ViewContent|Contact|CompleteRegistration|Schedule]
allowed-tools: Bash
---

Dispara un evento CAPI de prueba contra el servidor local de wrangler (`http://localhost:8788`). Debe estar corriendo `pnpm run pages:dev`.

Evento a enviar: **$ARGUMENTS** (si está vacío, usa `CompleteRegistration`).

```sh
EVT="${ARGUMENTS:-CompleteRegistration}"
curl -s http://localhost:8788/api/tiktok-capi -H "Content-Type: application/json" \
  --data "{\"event_name\":\"$EVT\",\"event_id\":\"test_$RANDOM\",\"email\":\"lead@ejemplo.com\",\"phone\":\"+593999999999\",\"content_name\":\"Asesoria LLC\"}"
```

Interpreta el `results` de la respuesta:
- `skipped:true` → faltan credenciales de esa plataforma (no se envió).
- `ok:true` → la plataforma aceptó el evento.
- `ok:false` con `status`/`error` → revisa el motivo.

Para verlo en TikTok Events Manager → Test Events, define `TIKTOK_TEST_EVENT_CODE` en `.dev.vars`.
