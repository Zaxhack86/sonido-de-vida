# Sonido de Vida — Guía para Claude (sesiones headless vía Telegram)

Este archivo existe para que las sesiones de Claude lanzadas sin contexto (bot de Telegram `@miclaudeiabot`) entiendan la arquitectura antes de tocar código.

---

## Qué es el proyecto

PWA de Biblia en audio en español. Dominio: **sonidodevida.com**  
Stack: HTML/CSS/JS puro (sin framework) + Cloudflare Workers + Cloudflare R2 + Cloudflare D1 + Firebase Auth + Vercel (frontend).

---

## Mapa de archivos críticos

| Archivo | Qué es |
|---|---|
| `index.html` | **Toda la app**. SPA de ~2 000 líneas. Contiene HTML, CSS en `<style>` y JS en `<script>`. |
| `sw.js` | Service Worker. Versión actual: `sdv-static-v37`. Hay que subirla en cada cambio a `index.html`. |
| `bible.js` | Datos de la Biblia RVA 1909 (versículos texto). |
| `bible_sbll.js` | Datos de la Biblia SBLL 2026 (versículos texto). |
| `worker_updated.js` | Cloudflare Worker de audio (se despliega en `sonido-de-vida-audio.*`). |
| `backend/api-worker.js` | Cloudflare Worker de API (auth, contenido premium, suscripciones). |
| `backend/wrangler-api.toml` | Config del worker de API (D1, KV, R2 premium). |
| `wrangler.toml` | Config del worker de audio (R2 de audio público). |
| `vercel.json` | Config de Vercel (SPA fallback a `index.html`). |

---

## Arquitectura de workers

### Worker de audio (`sonido-de-vida-audio.*`)
- Sirve MP3 desde R2 bucket `sonido-de-vida-audio`.
- Rutas: `/{libro}/{cap}`, `/sbll/{libro}/{cap}`, `/stream/{libro}/{cap}`, `/stream/sbll/{libro}/{cap}`
- Parámetro: `?modo=continuar` (default, resto del libro) | `?modo=full` (hasta Apocalipsis)
- Los streams concatenan múltiples objetos R2 en un `ReadableStream`.
- **No tiene autenticación**: es público.

### Worker de API (`sonido-de-vida-api.*`)
- Auth con Firebase (magic link vía Brevo).
- Gestión de suscripción premium (Cloudflare KV `PREMIUM`).
- Portero de contenido premium (R2 bucket `sdv-premium`).
- Base de datos: Cloudflare D1 `sonido-de-vida-db` (podcasts, contenido).
- **ADMIN_UIDS** en `wrangler-api.toml` → acceso premium permanente.

---

## Reglas críticas del Service Worker

1. **NUNCA cachear `/stream/`** — son streams dinámicos sin `Content-Length`. Si se cachean, `modo=full` devuelve respuesta de `modo=continuar` y la voz se para al cambiar de libro.
2. **NUNCA cachear peticiones con cabecera `Range`** — el navegador las necesita para reproducción en segundo plano (pantalla bloqueada).
3. **Siempre subir la versión** de `CACHE_STATIC` (`sdv-static-vXX`) en `sw.js` cuando cambias `index.html`, o los usuarios verán la versión vieja cacheada.
4. El worker de API (`sonido-de-vida-api.*`) nunca debe interceptarse: sus POST/DELETE deben ir siempre a la red.

---

## Variables de estado importantes en `index.html`

```js
let translationMode = 'sbll';     // 'rva' | 'sbll' — traducción activa
let playbackMode = null;          // null | 'continue' | 'full' — modo de reproducción
let focusNarration = false;       // true → modo Enfoque Con Voz activo (fuerza modo=full)
let focusSubMode = null;          // 'meditar' | 'voz' | null
let state = { book, chapter };    // libro y capítulo actualmente seleccionados
```

`effectiveMode()` devuelve `'full'` si `focusNarration` es `true` o `playbackMode === 'full'`.  
La URL del stream es `/stream/{libro}/{cap}?modo={effectiveMode()}`.

---

## Focus Mode (Modo Enfoque)

Dos submodos:
- **Meditación** (`focusSubMode = 'meditar'`): música ambiente + versículos curados rotativos cada 25 s. Sin narración bíblica.
- **Con voz** (`focusSubMode = 'voz'`): música ambiente + narración de la Biblia. Requiere que el usuario haya seleccionado un capítulo antes.

Funciones clave:
- `enter()` — abre el selector de submodo (verifica premium).
- `enterMeditar()` — activa submodo meditación.
- `enterVoz()` — activa submodo voz; redirige a pestaña Biblia si no hay capítulo cargado.
- `exit()` — cierra overlay, pausa narración solo si `focusSubMode === 'voz'`, siempre detiene música.
- `onNarration(playing)` — sincroniza música con narración (debounce 600 ms para transiciones entre libros).

Los 50 versículos curados de meditación están en el array `MEDIT_VERSES` (solo pasajes de aliento, no Eclesiastés ni contextos ambiguos).

### CSS del overlay
```css
[data-mode="meditar"] .voz-only  { display:none!important }
[data-mode]:not([data-mode="meditar"]) .meditar-only { display:none!important }
```
El atributo `data-mode` se pone en `#focusModeOverlay` con `_openOverlay('meditar'|'voz')`.

---

## Navegación (SPA)

```js
const TABS = ['inicio','explorar','biblia','buscar','yo'];
```
**Importante**: si agregas una pestaña nueva, añádela a este array o `showTab()` la ignorará silenciosamente.

Nav inferior: 5 ítems (Inicio, Explorar, Biblia, Buscar, Yo).

### Botón "atrás" (historial)
Hay un interceptor de `popstate` (IIFE justo después de `window.Pasajes = Pasajes;`) que hace que el botón atrás del móvil/navegador **cierre una capa a la vez** en vez de salir de la página. Usa un "guardia" en el historial y la función `appBack()`, que cierra en orden: menú móvil → modal `.modal-overlay.visible` → reproductor podcast → hub podcast → Pasajes (pantalla interna o cierre) → Modo Enfoque (`#focusOverlay.open`) → pestaña ≠ inicio. En Inicio sin nada abierto pide "pulsa atrás de nuevo para salir".
**Si agregas un overlay/modal nuevo a pantalla completa, añade su caso a `appBack()`** o el botón atrás lo ignorará.

---

## Procedimiento de despliegue

**Frontend (Vercel)** — se despliega automáticamente con `git push`:
```bash
cd /home/zax/Documentos/Claude/sonido-de-vida-main
git add -A && git commit -m "descripción"
git push
```

**Worker de audio** — cuando cambias `worker_updated.js`:
```bash
cd /home/zax/Documentos/Claude/sonido-de-vida-main
npx wrangler@3 deploy
```

**Worker de API** — cuando cambias `backend/api-worker.js`:
```bash
cd /home/zax/Documentos/Claude/sonido-de-vida-main/backend
npx wrangler@3 deploy -c wrangler-api.toml
```

**D1 (base de datos)** — migraciones o SQL directo:
```bash
npx wrangler@3 d1 execute sonido-de-vida-db --remote --command "SQL;"
```

**Regla**: tras cualquier cambio a `index.html`, siempre subir también la versión en `sw.js` y hacer `git push`. No preguntar, desplegar directamente.

---

## Gotchas frecuentes

- **Música se para al cambiar de libro en Modo Enfoque**: casi siempre es el SW cacheando `/stream/`. Verificar que la regla del SW esté intacta.
- **`modo=full` no funciona**: `effectiveMode()` depende de `focusNarration`. Si `focusNarration` no se pone a `true` en `enterVoz()`, el stream se hace con `modo=continuar`.
- **Versión vieja en producción**: el usuario tiene el SW viejo en caché. Solución: subir `CACHE_STATIC` un número más.
- **Pestaña nueva no funciona**: agregar al array `TABS`.
- **Audio no reproduce en segundo plano**: los range requests deben pasar siempre a la red, sin interceptar en el SW.
- **Bot de Telegram dice "desplegado" pero no funcionó**: el bot ejecuta Claude headless con `--permission-mode bypassPermissions`. Si el bug requiere verificación en navegador (SW, audio, UI), Claude headless lo puede analizar pero no puede confirmar que funcione visualmente. Sentarse en la PC y verificar.

---

## Contenido premium

- Podcasts: subidos con `/podcast Título | Descripción` en Telegram → R2 `sdv-premium/podcasts/` + D1.
- Contenido protegido: `GET /api/content/:id` verifica token Firebase y devuelve URL firmada de R2.
- Precios fundador: $4.99/mes → sube a $7.99 cuando haya suficientes suscriptores.

---

## Proyecto relacionado

Bot Telegram en `/home/zax/Documentos/Claude/telegram-bridge/bridge.js`.  
Servicio systemd: `systemctl --user {status,restart,stop} telegram-bridge`  
(Con `XDG_RUNTIME_DIR=/run/user/1000` si se invoca fuera de sesión gráfica.)
