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
| `index.html` (raíz) | **El HTML de la app** (PWA, ~117 KB). Desde el SW v155 (2026-07-07) el CSS y el JS viven FUERA, en `/css/` y `/js/` (ver filas siguientes). Se sirve en **`/`** (sonidodevida.com). **NO existe `/app` ni landing**: `/app` y `/app/*` redirigen 308 a `/` (ver `vercel.json`). NO reintroducir una landing separada ni mover la app a `/app`. |
| `css/` | Estilos extraídos de `index.html`, enlazados en el MISMO orden que los `<style>` originales (el orden importa para la cascada): `app.css` (base, ~164 KB), `explorar.css`, `tema-oscuro.css` (`<link id="sdv-premium-dark">` — quitar ese link revierte al tema claro), `biblia.css` (`<link id="bib-redesign">`). |
| `js/` | Scripts extraídos de `index.html`, cargados en las MISMAS posiciones que los `<script>` inline originales (clásicos, sin defer — el orden de ejecución importa): `app.js` (toda la lógica, ~564 KB), `cuenta.js` (`window.SDV_Account`), `biblioteca-buscar.js` (metadatos de libros + buscador). El beacon de `/api/track` sigue inline en `index.html` (diminuto, corre temprano). |
| `sw.js` | Service Worker (`sdv-static-vXX`). **Subir la versión en CADA cambio a `index.html`, `/css/` o `/js/`** (el caché estático se borra entero al activar la versión nueva y se re-precachea). Precachea `/`, `/manifest.json` y los archivos de `/css/` y `/js/`. |
| `bible.js` | Datos de la Biblia RVA 1909 (`window.BIBLE`). **Lazy-load** (ver abajo). |
| `bible_sbll.js` | Datos de la Biblia SBLL 2026 (`window.BIBLE_SBLL`). **Lazy-load** (ver abajo). |
| `worker_updated.js` | Cloudflare Worker de audio (se despliega en `sonido-de-vida-audio.*`). |
| `backend/api-worker.js` | Cloudflare Worker de API (auth, contenido premium, suscripciones). |
| `backend/wrangler-api.toml` | Config del worker de API (D1, KV, R2 premium). |
| `wrangler.toml` | Config del worker de audio (R2 de audio público). |
| `vercel.json` | Config de Vercel. `cleanUrls` + redirects `/app`→`/` y `/app/*`→`/` + fallback SPA (`/(.*)`→`/`). **No usar reescrituras `dest` a rutas `.html`** (rompen con `cleanUrls` → 404). |

---

## Carga diferida de la Escritura (lazy-load)

`bible.js` (~4MB, RVA) y `bible_sbll.js` (~3.6MB, SBLL) **ya NO se bajan en el
arranque**. Antes eran `<script defer>` que imponían ~7.6MB a todos los usuarios.
Ahora se inyectan bajo demanda con `ensureBible(mode)`:

- `ensureBible(mode)` → inyecta el `.js` una sola vez (reutiliza la promesa en
  vuelo). `mode` = `'real'` (default) | `'rva'` | `'sbll'`. Solo carga la traducción activa.
  `'real'` y `'rva'` comparten el MISMO texto RVA 1909 (`bible.js`/`window.BIBLE`);
  solo difieren en el audio. `'sbll'` usa `bible_sbll.js`/`window.BIBLE_SBLL`.
- `prepareBibleUI()` → llamada desde `showTab('biblia'|'buscar')`; carga la
  Escritura y llena el selector de libros (`populateBooks`) la primera vez.
- **RVA** (`bible.js`) solo se baja al togglear a RVA (`setTranslation('rva')`) o
  como fallback de texto en `loadChapter` cuando SBLL no tiene ese capítulo.
- Los lectores de datos son `async` y hacen `await ensureBible()` antes de leer
  `getActiveBible()`: `loadChapter`, `runSearch`, `getRandomVerse`,
  `resumeListening`, `checkChapterLink`, `setTranslation` y el botón "escuchar"
  del devocional. **Si añades un punto que lea versículos, antepón
  `await ensureBible()`** o tocará `getActiveBible()` cuando aún es `undefined`.
- ⚠️ NO reintroduzcas la guardia `if (!window.BIBLE) return;` en
  `DOMContentLoaded`: abortaría toda la init porque la Biblia ya no está cargada
  en el arranque.
- **SW**: `bible.js`/`bible_sbll.js` ya NO están en `STATIC_ASSETS` (no se
  precachean en `install`); se sirven `cacheFirst` cuando el frontend los pide.

---

## Arquitectura de workers

### Worker de audio (`sonido-de-vida-audio.*`)
- Sirve MP3 desde R2 bucket `sonido-de-vida-audio`. Tres voces, cada una con su prefijo R2:
  `rva`→`audio/` (TTS), `sbll`→`audio_sbll/` (TTS), `real`→`audio_real/` (narración HUMANA, voz principal).
- Rutas: `/{libro}/{cap}`, `/sbll/{libro}/{cap}`, `/real/{libro}/{cap}`, `/stream/{libro}/{cap}`, `/stream/sbll/{libro}/{cap}`, `/stream/real/{libro}/{cap}`
- El audio `real` es la grabación humana RVA 1909 de archive.org (BibliaEnAudioRVA1909), 1189 capítulos completos.
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
let translationMode = 'real';     // 'real' (voz humana, default) | 'rva' (TTS) | 'sbll' (TTS)
let playbackMode = null;          // null | 'continue' | 'full' — modo de reproducción
let focusNarration = false;       // true → modo Enfoque Con Voz activo (fuerza modo=full)
let focusSubMode = null;          // 'meditar' | 'voz' | null
let state = { book, chapter };    // libro y capítulo actualmente seleccionados
```

`effectiveMode()` devuelve `'full'` si `focusNarration` es `true` o `playbackMode === 'full'`.  
La URL del stream lleva el prefijo de la voz activa: `/stream/{real|sbll|}/{libro}/{cap}?modo={effectiveMode()}` (la voz `rva` no lleva prefijo). La construye `audioUrl()`.

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

**Regla**: tras cualquier cambio a `index.html`, `/css/` o `/js/`, siempre subir también la versión en `sw.js` y hacer `git push`. No preguntar, desplegar directamente.

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

## Listas de reproducción del Podcast (Fase 2)

"Me gusta" + listas compartibles de episodios. Un episodio se referencia por su
`content_id` (= `content_items.id` = `EPISODES[].contentId` en el frontend, 69-78).

- **Tablas D1**: `user_liked_episodes`, `user_playlists` (el `id` es un token
  aleatorio que sirve de enlace público), `user_playlist_items`. Ver `backend/schema.sql`.
- **Endpoints** (`api-worker.js`): `GET/POST /api/likes`, `DELETE /api/likes/:cid`;
  `GET/POST /api/playlists`, `GET/DELETE /api/playlists/:id`,
  `POST /api/playlists/:id/{rename,public}`, `POST /api/playlists/:id/items`,
  `DELETE /api/playlists/:id/items/:cid`; y el **público sin token**
  `GET /api/public/playlist/:id` (solo si `publica = 1`).
- **Frontend**: módulo `window.Listas` en `index.html` (chips ❤️/➕ en el
  reproductor, sección "Mis listas" en la pestaña Yo, overlay `#playlistOverlay`).
  Helpers de red en `auth.js` (`SDV.like`, `SDV.createPlaylist`, `SDV.publicPlaylist`…).
- **Enlace compartido**: `https://sonidodevida.com/?lista=<id>`. Al cargar,
  `Listas.checkSharedLink()` abre la lista en modo solo-lectura. Reproducir sigue
  requiriendo cuenta + premium (el portero `/api/content/:id` no cambia).
- ⚠️ **Gotcha del router**: los handlers lanzan `{ status }`; el `try/catch` del
  Worker **solo** atrapa promesas *esperadas*. Por eso las rutas de listas usan
  `return await handler(...)` (un `return handler(...)` sin `await` deja escapar el
  throw → 500). Si añades rutas que puedan lanzar, usa `return await`.

## Proyecto relacionado

Bot Telegram en `/home/zax/Documentos/Claude/telegram-bridge/bridge.js`.  
Servicio systemd: `systemctl --user {status,restart,stop} telegram-bridge`  
(Con `XDG_RUNTIME_DIR=/run/user/1000` si se invoca fuera de sesión gráfica.)
