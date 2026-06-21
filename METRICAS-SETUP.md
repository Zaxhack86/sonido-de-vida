# Métricas de Sonido de Vida — puesta en marcha

Dashboard propio (gratis, sobre tu Cloudflare) que reúne en **una sola pantalla**:
visitas, de dónde llegan (redes / Google / directo), embudo de registro → premium
y SEO de Google. Se ve en **https://sonidodevida.com/metricas** (solo admin).

Piezas añadidas:

| Archivo | Qué hace |
|---|---|
| `backend/schema-metrics.sql` | Tablas nuevas en D1 (no tocan las `user_*`). |
| `backend/api-worker.js` | `POST /api/track` (beacon), `GET /api/metrics` (admin), eventos de embudo y cron SEO. |
| `backend/wrangler-api.toml` | Cron nocturno + variable `SEARCH_CONSOLE_SITE` (comentada). |
| `metricas.html` | El dashboard (tu identidad visual + Chart.js). |
| `index.html` | Beacon anónimo de visita (tras `auth.js`). SW subido a `v88`. |

---

## ✅ FASE 1 — visitas, fuentes y embudo (sin depender de nadie)

Desde `sonido-de-vida-main/`. Tres comandos:

```bash
# 1) Crear las tablas de métricas en D1 (producción)
npx wrangler@3 d1 execute sonido-de-vida-db --remote --file backend/schema-metrics.sql

# 2) Desplegar el Worker de API (beacon + /api/metrics + cron)
cd backend && npx wrangler@3 deploy -c wrangler-api.toml && cd ..

# 3) Desplegar el frontend (beacon en index.html + página /metricas)
#    OJO: tu árbol tiene ~100 archivos marcados como "modificados" que en
#    realidad solo cambiaron de PERMISOS (todo quedó 777). Por eso NO uses
#    `git add -A`: commitea solo los archivos reales de esta función.
git add metricas.html index.html sw.js METRICAS-SETUP.md \
        backend/api-worker.js backend/wrangler-api.toml backend/schema-metrics.sql
git commit -m "feat: dashboard de métricas propio (visitas, fuentes, embudo, SEO)"
git push
```

> Si te molesta ese ruido de permisos a futuro:
> `git config core.filemode false` (deja de rastrear el bit de permisos).

Listo. Entra a **https://sonidodevida.com/metricas** con tu correo de admin
(tu UID `h1u8iq53w8T7oBcVfN1167zEsC22` ya está en `ADMIN_UIDS`). Los números
empiezan a llenarse con la primera visita real.

> **Primer login en `/metricas`:** el enlace del correo te devuelve a la raíz del
> sitio. Tras entrar ahí, vuelve a `/metricas` (la sesión se comparte). Si ya
> sueles entrar a la app, el panel te reconoce directo.

### Qué mide cada cosa
- **Visitas / únicos**: el beacon de `index.html` registra cada carga. El “único”
  es un hash que **rota cada día** — sin IP, sin cookies (encaja con tu privacidad).
- **Fuentes**: clasifica el `referrer`. Para distinguir bien las redes, publica
  con enlaces etiquetados, p. ej. `https://sonidodevida.com/?utm_source=instagram`.
- **Embudo**: `registro` se marca la 1.ª vez que un usuario llama a `/api/me`;
  `premium`, en su 1.ª suscripción activa (webhook de Stripe). Cuenta único por uid.

---

## 🟡 FASE 2 — SEO de Google (Search Console)

Esto responde “¿funciona mi SEO?”. Es un **trámite de una sola vez**. Mientras no
se haga, el panel muestra “Fase 2 · por activar” y el resto sigue funcionando.

### A. Verificar el dominio en Search Console
1. Entra a https://search.google.com/search-console → **Agregar propiedad** →
   tipo **Dominio** → `sonidodevida.com`.
2. Te dará un registro **TXT** para el DNS. Añádelo en Cloudflare
   (DNS → Records → TXT) y pulsa **Verificar**.

### B. Dar acceso a la cuenta de servicio (reutilizas la de Firebase)
El Worker ya tiene `FIREBASE_SERVICE_ACCOUNT` (secreto). Esa cuenta tiene un
`client_email` tipo `...@sonidodevida-7ebe7.iam.gserviceaccount.com`.

1. En Search Console → **Configuración** → **Usuarios y permisos** → **Agregar usuario**.
2. Pega ese `client_email` con permiso **Restringido** (lectura). Suficiente.
3. Habilita la API una vez: en https://console.cloud.google.com → APIs y servicios
   → **Search Console API** → *Habilitar* (en el proyecto de la cuenta de servicio).

### C. Activar la variable y redesplegar
En `backend/wrangler-api.toml`, descomenta:

```toml
SEARCH_CONSOLE_SITE = "sc-domain:sonidodevida.com"
```

```bash
cd backend && npx wrangler@3 deploy -c wrangler-api.toml && cd ..
```

El cron corre a las **07:00 UTC** cada día y rellena el bloque SEO (Search Console
trae los datos con ~2-3 días de retraso, es normal). Para no esperar, puedes
forzar una corrida desde el panel de Cloudflare (Worker → Triggers → *Cron* →
“Trigger”), o simplemente esperar a mañana.

---

## Notas
- **Coste:** $0. Todo vive en tu D1/Worker actuales. Las visitas crudas se podan
  solas a los 180 días.
- **Privacidad:** no se guarda ninguna IP; el visitante es un hash diario. No
  requiere banner de cookies.
- **Si cambias `index.html`** en el futuro, recuerda subir `CACHE_STATIC` en
  `sw.js` (regla del proyecto).
