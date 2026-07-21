const CACHE_STATIC = 'sdv-static-v166';
const CACHE_AUDIO  = 'sdv-audio-v2';

// La app (PWA) vive en la raíz ('/'). Ya no hay landing ni '/app'; '/app' y
// '/app/*' redirigen a '/' (ver vercel.json).
// Lazy-load: bible.js / bible_sbll.js YA NO se precachean en install (eran ~7.6MB
// impuestos a todos en la primera visita). Se cachean cacheFirst cuando el frontend
// los pide bajo demanda (ver regla más abajo).
// Desde v155 el CSS/JS de la app vive en /css/ y /js/ (index.html quedó en ~117KB).
// Se precachean aquí y se sirven cacheFirst: al subir la versión del SW se borra
// el caché entero, así que SIEMPRE sube la versión si cambias /css/ o /js/.
const STATIC_ASSETS = [
    '/', '/manifest.json',
    '/css/app.css', '/css/explorar.css', '/css/tema-oscuro.css', '/css/biblia.css',
    '/js/app.js', '/js/cuenta.js', '/js/biblioteca-buscar.js',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_STATIC).then(c => c.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_STATIC && k !== CACHE_AUDIO).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Solo el Worker de AUDIO se cachea. El Worker de API (sonido-de-vida-api.*)
    // NO debe interceptarse: sus POST/DELETE/GET deben ir siempre a la red.
    // (Antes 'workers.dev' atrapaba también la API y devolvía respuestas GET
    //  cacheadas para los POST → guardar parecía OK pero nunca llegaba al server.)
    if (url.hostname.startsWith('sonido-de-vida-audio.')) {
        // Los streams continuos (/stream/...) y CUALQUIER petición con Range no
        // se cachean ni se interceptan: son respuestas dinámicas sin
        // Content-Length/Accept-Ranges. Servirlas desde caché rompe los range
        // requests que el navegador necesita para la reproducción en segundo
        // plano (pantalla bloqueada) y, al ignorar el query, confundía
        // modo=full con modo=continuar (la voz se paraba al acabar un libro).
        // Dejándolas pasar a la red, el navegador maneja los rangos nativamente.
        if (url.pathname.startsWith('/stream/') || e.request.headers.has('range')) {
            return;
        }
        e.respondWith(handleAudio(e.request));
        return;
    }

    // Datos bíblicos (lazy-load): inmutables, cacheFirst. Incluye SBLL, que antes
    // NO se cacheaba (solo bible.js) pese a ser la traducción por defecto.
    if (url.pathname === '/bible.js' || url.pathname === '/bible_sbll.js') {
        e.respondWith(cacheFirst(e.request, CACHE_STATIC));
        return;
    }

    // CSS/JS de la app (extraídos de index.html en v155): cacheFirst. Frescura
    // garantizada porque cada subida de versión del SW borra este caché entero
    // y el install los vuelve a precachear.
    if (url.origin === location.origin && (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/'))) {
        e.respondWith(cacheFirst(e.request, CACHE_STATIC));
        return;
    }

    // Documento shell: la app vive en la raíz ('/') + manifest.
    // networkFirst para que un deploy nuevo se vea sin esperar, con caché de
    // respaldo si no hay conexión.
    if (url.pathname === '/' || url.pathname === '/manifest.json') {
        e.respondWith(networkFirst(e.request, CACHE_STATIC));
        return;
    }
});

async function handleAudio(request) {
    const cache = await caches.open(CACHE_AUDIO);
    const cacheKey = new Request(new URL(request.url).pathname, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(cacheKey, response.clone());
        return response;
    } catch {
        return new Response(JSON.stringify({ error: 'Sin conexión' }), { status: 503 });
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkFetch = fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); return r; });
    return cached || networkFetch;
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cache = await caches.open(cacheName);
        return (await cache.match(request)) || new Response('Sin conexión', { status: 503 });
    }
}

self.addEventListener('message', e => {
    if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
