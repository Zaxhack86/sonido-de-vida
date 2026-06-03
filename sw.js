const CACHE_STATIC = 'sdv-static-v12';
const CACHE_AUDIO  = 'sdv-audio-v1';

const STATIC_ASSETS = ['/', '/index.html', '/bible.js', '/manifest.json'];

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
        e.respondWith(handleAudio(e.request));
        return;
    }

    if (url.pathname === '/bible.js') {
        e.respondWith(cacheFirst(e.request, CACHE_STATIC));
        return;
    }

    if (STATIC_ASSETS.includes(url.pathname)) {
        e.respondWith(staleWhileRevalidate(e.request, CACHE_STATIC));
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

self.addEventListener('message', e => {
    if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
