// Sonido de Vida — API Worker (plataforma del usuario)
// Verifica el JWT de Firebase contra las llaves públicas de Google y expone
// endpoints scoped por uid sobre D1. El estado premium se lee de KV.
//
// Bindings (ver wrangler-api.toml):
//   DB                  -> D1 database
//   PREMIUM             -> KV namespace (key = uid, value = JSON {premium:true,...})
//   FIREBASE_PROJECT_ID -> var (tu projectId de Firebase)
//   ALLOWED_ORIGIN      -> var (origen del frontend, ej. https://sonidodevida.com)
//
// Endpoints:
//   GET    /api/me           -> { uid, email, premium }
//   GET    /api/verses       -> lista de versículos guardados del usuario
//   POST   /api/verses       -> guarda { libro, capitulo, versiculo, texto, coleccion? }
//   DELETE /api/verses/:id    -> elimina un guardado del usuario
//
// Capa gratis vs premium: guardar es gratis hasta FREE_VERSE_LIMIT.
// Usar `coleccion` (organizar por temas) y superar el límite requiere premium.

const FREE_VERSE_LIMIT = 25;

// Límite de descargas diario (anti-abuso, atado al uid en D1).
const DL_LIMIT_FREE    = 3;
const DL_LIMIT_PREMIUM = 20;
const DL_SHARE_BONUS   = 1;   // +1 por compartir, máximo una vez al día

// Día actual en UTC ('YYYY-MM-DD'). Una clave por usuario y día.
function todayUTC() { return new Date().toISOString().slice(0, 10); }

// ── Verificación del ID token de Firebase ────────────────────────────
let JWKS_CACHE = { keys: null, exp: 0 };

async function getFirebaseJWKs() {
    const now = Date.now();
    if (JWKS_CACHE.keys && now < JWKS_CACHE.exp) return JWKS_CACHE.keys;
    const res = await fetch(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    );
    const data = await res.json();
    const cc = res.headers.get('cache-control') || '';
    const m = cc.match(/max-age=(\d+)/);
    const ttl = (m ? parseInt(m[1], 10) : 3600) * 1000;
    JWKS_CACHE = { keys: data.keys, exp: now + ttl };
    return data.keys;
}

function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    s += '='.repeat(pad);
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
}

function b64urlToJSON(s) {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

// Devuelve el payload (con .sub = uid, .email) o lanza error si el token es inválido.
async function verifyFirebaseToken(token, projectId) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('formato inválido');

    const header = b64urlToJSON(parts[0]);
    const payload = b64urlToJSON(parts[1]);
    const now = Math.floor(Date.now() / 1000);

    if (payload.aud !== projectId) throw new Error('aud inválido');
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('iss inválido');
    if (!payload.sub) throw new Error('sin sub');
    if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('expirado');
    if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('iat inválido');

    const jwks = await getFirebaseJWKs();
    const jwk = jwks.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('kid desconocido');

    const key = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const ok = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5', key,
        b64urlToBytes(parts[2]),
        new TextEncoder().encode(parts[0] + '.' + parts[1])
    );
    if (!ok) throw new Error('firma inválida');
    return payload;
}

// ── Helpers HTTP ─────────────────────────────────────────────────────
// Orígenes permitidos: el apex y el www (el apex redirige a www en prod).
function allowedOrigins(env) {
    const base = env.ALLOWED_ORIGIN || 'https://sonidodevida.com';
    const set = new Set([base]);
    try {
        const u = new URL(base);
        const host = u.hostname.replace(/^www\./, '');
        set.add(`${u.protocol}//${host}`);
        set.add(`${u.protocol}//www.${host}`);
    } catch { /* base no es URL válida */ }
    return set;
}

function corsHeaders(env, request) {
    const origin = request && request.headers.get('Origin');
    const allowed = allowedOrigins(env);
    const allowOrigin = origin && allowed.has(origin) ? origin : (env.ALLOWED_ORIGIN || '*');
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function json(env, request, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(env, request), 'Content-Type': 'application/json' },
    });
}

async function requireUser(request, env) {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw { status: 401, msg: 'Falta el token' };
    try {
        const payload = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        return { uid: payload.sub, email: payload.email || null };
    } catch (e) {
        throw { status: 401, msg: 'Token inválido: ' + e.message };
    }
}

// UIDs con acceso total (admin): premium permanente, sin tope ni pago.
// Se configuran en env.ADMIN_UIDS como lista separada por comas.
function isAdmin(env, uid) {
    if (!uid || !env.ADMIN_UIDS) return false;
    return env.ADMIN_UIDS.split(',').map((s) => s.trim()).includes(uid);
}

async function isPremium(env, uid) {
    if (isAdmin(env, uid)) return true; // admin = premium siempre
    const raw = await env.PREMIUM.get(uid);
    if (!raw) return false;
    try {
        const v = JSON.parse(raw);
        if (v.premium !== true) return false;
        if (v.expira && Date.parse(v.expira) < Date.now()) return false;
        return true;
    } catch {
        return false;
    }
}

// Resuelve el uid de Firebase a partir del email (Identity Toolkit, requiere el
// service account con scope identitytoolkit). Devuelve null si la cuenta no existe.
async function lookupUidByEmail(env, email) {
    const accessToken = await getGoogleAccessToken(env);
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': env.FIREBASE_PROJECT_ID,
        },
        body: JSON.stringify({ email: [email] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: 502, msg: 'Firebase lookup: ' + ((data.error && data.error.message) || res.status) };
    const u = data.users && data.users[0];
    return u ? u.localId : null;
}

// Marca premium PERMANENTE (cortesía, sin pago) en KV. Sin campo `expira` => no
// caduca nunca. Vive fuera del flujo de Stripe: como el usuario no paga, ningún
// webhook lo sobrescribe.
async function grantPremiumComp(env, uid) {
    const record = {
        premium: true,
        status: 'comp',
        plan: 'comp',
        source: 'admin-grant',
        granted_at: new Date().toISOString(),
    };
    await env.PREMIUM.put(uid, JSON.stringify(record));
    return record;
}

// POST /api/admin/grant-premium  (público; autenticado por X-Admin-Secret, NO por
// token Firebase — para poder concederlo desde la terminal/script del dueño).
// Body: { email } o { uid }. Concede premium permanente sin pago.
async function handleAdminGrant(request, env) {
    const secret = request.headers.get('X-Admin-Secret') || '';
    if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) throw { status: 403, msg: 'no autorizado' };
    const body = await request.json().catch(() => ({}));
    let uid = (body.uid || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    if (!uid && email) uid = await lookupUidByEmail(env, email);
    if (!uid) throw { status: 404, msg: email ? 'esa cuenta aún no existe (debe iniciar sesión una vez)' : 'falta uid o email' };
    const record = await grantPremiumComp(env, uid);
    return json(env, request, { ok: true, uid, email: email || null, record });
}

// ── Stripe (suscripciones premium) ───────────────────────────────────
// El estado premium se sincroniza DESDE Stripe hacia KV PREMIUM vía webhook;
// la app nunca decide sola si alguien es premium tras pagar.
//
// Secretos (dashboard de Cloudflare, cifrados — NO en el .toml):
//   STRIPE_SECRET_KEY     -> sk_live_... (o sk_test_... para pruebas)
//   STRIPE_WEBHOOK_SECRET -> whsec_...   (del endpoint /api/stripe/webhook)
// Vars (wrangler-api.toml):
//   STRIPE_PRICE_MONTHLY  -> price_... del plan mensual ($2.99)
//   STRIPE_PRICE_ANNUAL   -> price_... del plan anual  ($24.99)
//   STRIPE_TRIAL_DAYS     -> días de prueba gratis (ej. "7")
//
// Mapeo uid <-> customer en KV (para que el webhook sepa de quién es la sub):
//   stripe:uid:<uid>          -> customerId
//   stripe:cus:<customerId>   -> uid

function stripeEnabled(env) { return !!env.STRIPE_SECRET_KEY; }

// Llama a la API REST de Stripe (cuerpo x-www-form-urlencoded). `params` admite
// claves anidadas tipo "subscription_data[metadata][uid]".
async function stripeCall(env, method, path, params) {
    const res = await fetch('https://api.stripe.com/v1/' + path, {
        method,
        headers: {
            'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params ? new URLSearchParams(params).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: 502, msg: 'Stripe: ' + ((data.error && data.error.message) || res.status) };
    return data;
}

// Reutiliza el customer de Stripe del usuario o lo crea la primera vez.
async function getOrCreateCustomer(env, uid, email) {
    const existing = await env.PREMIUM.get('stripe:uid:' + uid);
    if (existing) return existing;
    const cust = await stripeCall(env, 'POST', 'customers', {
        email: email || '',
        'metadata[uid]': uid,
    });
    await env.PREMIUM.put('stripe:uid:' + uid, cust.id);
    await env.PREMIUM.put('stripe:cus:' + cust.id, uid);
    return cust.id;
}

// POST /api/checkout {plan:'monthly'|'annual'} -> { url } de Stripe Checkout.
async function handleCheckout(request, env, user) {
    if (!stripeEnabled(env)) throw { status: 503, msg: 'Pagos no disponibles aún' };
    let body; try { body = await request.json(); } catch { body = {}; }
    const plan = body.plan === 'annual' ? 'annual' : 'monthly';
    const price = plan === 'annual' ? env.STRIPE_PRICE_ANNUAL : env.STRIPE_PRICE_MONTHLY;
    if (!price || price.indexOf('price_') !== 0) throw { status: 503, msg: 'Plan no configurado' };

    const customer = await getOrCreateCustomer(env, user.uid, user.email);
    const origin = env.ALLOWED_ORIGIN || 'https://sonidodevida.com';
    const trial = parseInt(env.STRIPE_TRIAL_DAYS || '0', 10);

    const params = {
        mode: 'subscription',
        customer,
        'line_items[0][price]': price,
        'line_items[0][quantity]': '1',
        client_reference_id: user.uid,
        'subscription_data[metadata][uid]': user.uid,
        allow_promotion_codes: 'true',
        locale: 'es',
        success_url: origin + '/?checkout=success',
        cancel_url: origin + '/?checkout=cancel',
    };
    if (trial > 0) params['subscription_data[trial_period_days]'] = String(trial);

    const session = await stripeCall(env, 'POST', 'checkout/sessions', params);
    return json(env, request, { url: session.url });
}

// POST /api/portal -> { url } del portal de facturación (cancelar / cambiar tarjeta).
async function handlePortal(request, env, user) {
    if (!stripeEnabled(env)) throw { status: 503, msg: 'Pagos no disponibles aún' };
    const customer = await env.PREMIUM.get('stripe:uid:' + user.uid);
    if (!customer) throw { status: 404, msg: 'No tienes una suscripción activa' };
    const origin = env.ALLOWED_ORIGIN || 'https://sonidodevida.com';
    const session = await stripeCall(env, 'POST', 'billing_portal/sessions', {
        customer,
        return_url: origin + '/?tab=yo',
    });
    return json(env, request, { url: session.url });
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return out === 0;
}

// Verifica la cabecera Stripe-Signature ("t=...,v1=...") con HMAC-SHA256.
async function verifyStripeSignature(rawBody, sigHeader, secret) {
    if (!sigHeader || !secret) return false;
    let t = null; const v1 = [];
    sigHeader.split(',').forEach((kv) => {
        const i = kv.indexOf('=');
        if (i < 0) return;
        const k = kv.slice(0, i), val = kv.slice(i + 1);
        if (k === 't') t = val; else if (k === 'v1') v1.push(val);
    });
    if (!t || !v1.length) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // tolerancia 5 min
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + rawBody));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return v1.some((sig) => timingSafeEqual(sig, hex));
}

// Refleja una suscripción de Stripe en KV PREMIUM (key = uid del usuario).
async function syncSubscription(env, sub) {
    if (!sub || !sub.id) return;
    let uid = sub.metadata && sub.metadata.uid;
    if (!uid && sub.customer) uid = await env.PREMIUM.get('stripe:cus:' + sub.customer);
    if (!uid) return;
    const active = sub.status === 'active' || sub.status === 'trialing';
    // +2 días de gracia sobre el fin de periodo para tolerar retrasos del webhook.
    const expira = active && sub.current_period_end
        ? new Date(sub.current_period_end * 1000 + 2 * 86400 * 1000).toISOString()
        : null;
    const interval = sub.items && sub.items.data && sub.items.data[0]
        && sub.items.data[0].price && sub.items.data[0].price.recurring
        && sub.items.data[0].price.recurring.interval;
    const record = {
        premium: active,
        status: sub.status,
        plan: interval === 'year' ? 'annual' : 'monthly',
        customer: sub.customer || null,
        subscription: sub.id,
        expira,
        actualizado: new Date().toISOString(),
    };
    await env.PREMIUM.put(uid, JSON.stringify(record));
    // Embudo: deja la conversión a premium una sola vez por uid (primera activación).
    if (active) await logEvent(env, 'premium', uid);
}

// POST /api/stripe/webhook (público; autenticado por firma, no por token Firebase).
async function handleStripeWebhook(request, env) {
    const raw = await request.text();
    const ok = await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return new Response('firma inválida', { status: 400 });

    let event; try { event = JSON.parse(raw); } catch { return new Response('json inválido', { status: 400 }); }
    const obj = (event.data && event.data.object) || {};

    try {
        if (event.type === 'checkout.session.completed') {
            const uid = obj.client_reference_id || (obj.metadata && obj.metadata.uid);
            if (uid && obj.customer) {
                await env.PREMIUM.put('stripe:uid:' + uid, obj.customer);
                await env.PREMIUM.put('stripe:cus:' + obj.customer, uid);
            }
            if (obj.subscription) {
                const sub = await stripeCall(env, 'GET', 'subscriptions/' + obj.subscription, null);
                await syncSubscription(env, sub);
            }
        } else if (event.type === 'customer.subscription.created' ||
                   event.type === 'customer.subscription.updated' ||
                   event.type === 'customer.subscription.deleted') {
            await syncSubscription(env, obj);
        }
    } catch (e) {
        // 200 igual: evita que Stripe reintente sin fin por un dato suelto.
        return new Response('ok (aviso: ' + (e.msg || 'error') + ')', { status: 200 });
    }
    return new Response('ok', { status: 200 });
}

// ── Endpoints ────────────────────────────────────────────────────────
async function getVerses(env, request, uid) {
    const { results } = await env.DB
        .prepare('SELECT id, libro, capitulo, versiculo, texto, coleccion, creado_en FROM user_saved_verses WHERE uid = ? ORDER BY creado_en DESC')
        .bind(uid)
        .all();
    return json(env, request, { verses: results || [] });
}

async function saveVerse(request, env, uid) {
    let body;
    try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }

    const libro = String(body.libro || '').trim();
    const capitulo = parseInt(body.capitulo, 10);
    const versiculo = parseInt(body.versiculo, 10);
    const texto = String(body.texto || '').trim();
    let coleccion = body.coleccion ? String(body.coleccion).trim() : null;

    if (!libro || !capitulo || !versiculo || !texto) {
        throw { status: 400, msg: 'Faltan datos del versículo' };
    }

    const premium = await isPremium(env, uid);

    // Las colecciones (organizar por temas) son premium.
    if (coleccion && !premium) coleccion = null;

    // Tope de la capa gratis.
    if (!premium) {
        const row = await env.DB
            .prepare('SELECT COUNT(*) AS n FROM user_saved_verses WHERE uid = ?')
            .bind(uid).first();
        if (row && row.n >= FREE_VERSE_LIMIT) {
            return json(env, request, { error: 'limite_gratis', limite: FREE_VERSE_LIMIT, premium: false }, 402);
        }
    }

    await env.DB
        .prepare('INSERT OR IGNORE INTO user_saved_verses (uid, libro, capitulo, versiculo, texto, coleccion) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(uid, libro, capitulo, versiculo, texto, coleccion)
        .run();

    return json(env, request, { ok: true, premium }, 201);
}

async function deleteVerse(env, request, uid, id) {
    const vid = parseInt(id, 10);
    if (!vid) throw { status: 400, msg: 'id inválido' };
    await env.DB
        .prepare('DELETE FROM user_saved_verses WHERE id = ? AND uid = ?')
        .bind(vid, uid)
        .run();
    return json(env, request, { ok: true });
}

// ── Biblioteca de descargas: lista sincronizada por uid ──────────────
// Guarda solo QUÉ capítulos descargó el usuario (libro+capítulo), no el audio
// (ese vive en R2). Sirve para reconstruir "Mis descargas" en otro dispositivo
// o tras borrar los datos del navegador. Gratis: la lista es diminuta.
async function getLibrary(env, request, uid) {
    const { results } = await env.DB
        .prepare('SELECT id, libro, capitulo, creado_en FROM user_downloads WHERE uid = ? ORDER BY creado_en DESC')
        .bind(uid)
        .all();
    return json(env, request, { items: results || [] });
}

async function addLibrary(request, env, uid) {
    let body;
    try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const libro = String(body.libro || '').trim();
    const capitulo = parseInt(body.capitulo, 10);
    if (!libro || !capitulo) throw { status: 400, msg: 'Faltan datos del capítulo' };
    await env.DB
        .prepare('INSERT OR IGNORE INTO user_downloads (uid, libro, capitulo) VALUES (?, ?, ?)')
        .bind(uid, libro, capitulo)
        .run();
    return json(env, request, { ok: true }, 201);
}

async function removeLibrary(request, env, uid) {
    let body;
    try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const libro = String(body.libro || '').trim();
    const capitulo = parseInt(body.capitulo, 10);
    if (!libro || !capitulo) throw { status: 400, msg: 'Faltan datos del capítulo' };
    await env.DB
        .prepare('DELETE FROM user_downloads WHERE uid = ? AND libro = ? AND capitulo = ?')
        .bind(uid, libro, capitulo)
        .run();
    return json(env, request, { ok: true });
}

// ── Descargas: contador diario por uid ───────────────────────────────
// Devuelve el estado del día sin modificar nada.
async function readDownloadState(env, uid, premium) {
    const dia = todayUTC();
    const row = await env.DB
        .prepare('SELECT descargas, bonus FROM user_download_counts WHERE uid = ? AND dia = ?')
        .bind(uid, dia).first();
    const usadas = row ? row.descargas : 0;
    const bonus  = row ? row.bonus : 0;
    const base   = premium ? DL_LIMIT_PREMIUM : DL_LIMIT_FREE;
    const limite = base + bonus;
    return { usadas, bonus, base, limite, restantes: Math.max(0, limite - usadas), premium };
}

async function getDownloads(env, request, uid) {
    const premium = await isPremium(env, uid);
    return json(env, request, await readDownloadState(env, uid, premium));
}

// Consume UNA descarga de forma segura ante carreras (UPDATE condicional).
async function consumeDownload(env, request, uid) {
    const premium = await isPremium(env, uid);
    const dia = todayUTC();
    await env.DB
        .prepare('INSERT OR IGNORE INTO user_download_counts (uid, dia, descargas, bonus) VALUES (?, ?, 0, 0)')
        .bind(uid, dia).run();

    const st = await readDownloadState(env, uid, premium);
    // El WHERE descargas < limite evita exceder el tope aunque lleguen
    // varias peticiones a la vez; si no afecta filas, ya estaba en el límite.
    const res = await env.DB
        .prepare('UPDATE user_download_counts SET descargas = descargas + 1 WHERE uid = ? AND dia = ? AND descargas < ?')
        .bind(uid, dia, st.limite).run();

    if (!res.meta || res.meta.changes === 0) {
        return json(env, request, { error: 'limite', ...st, restantes: 0 }, 402);
    }
    return json(env, request, { ok: true, ...(await readDownloadState(env, uid, premium)) });
}

// Otorga el bonus de compartir (+1) una sola vez al día.
async function grantShareBonus(env, request, uid) {
    const premium = await isPremium(env, uid);
    const dia = todayUTC();
    await env.DB
        .prepare('INSERT OR IGNORE INTO user_download_counts (uid, dia, descargas, bonus) VALUES (?, ?, 0, 0)')
        .bind(uid, dia).run();
    await env.DB
        .prepare('UPDATE user_download_counts SET bonus = ? WHERE uid = ? AND dia = ? AND bonus < ?')
        .bind(DL_SHARE_BONUS, uid, dia, DL_SHARE_BONUS).run();
    return json(env, request, { ok: true, ...(await readDownloadState(env, uid, premium)) });
}

// ── Fase 2: Listas de reproducción del Podcast ───────────────────────
// Likes (favoritos) + playlists con enlace público. Los episodios se
// referencian por content_id (el mismo entero de content_items / EPISODES).
const MAX_PLAYLISTS   = 30;    // listas por usuario (anti-abuso)
const MAX_ITEMS       = 200;   // episodios por lista
const PLAYLIST_ID_LEN = 12;    // token aleatorio = enlace público

// id no adivinable (base62) para usar como clave y enlace público.
function newPlaylistId() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(PLAYLIST_ID_LEN));
    let s = '';
    for (let i = 0; i < PLAYLIST_ID_LEN; i++) s += alphabet[bytes[i] % alphabet.length];
    return s;
}

function cid(v) {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

// — Likes —
async function getLikes(env, request, uid) {
    const { results } = await env.DB
        .prepare('SELECT content_id FROM user_liked_episodes WHERE uid = ? ORDER BY creado_en DESC')
        .bind(uid).all();
    return json(env, request, { content_ids: (results || []).map((r) => r.content_id) });
}

async function addLike(request, env, uid) {
    let body; try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const c = cid(body.content_id);
    if (!c) throw { status: 400, msg: 'content_id inválido' };
    await env.DB
        .prepare('INSERT OR IGNORE INTO user_liked_episodes (uid, content_id) VALUES (?, ?)')
        .bind(uid, c).run();
    return json(env, request, { ok: true, liked: true }, 201);
}

async function removeLike(env, request, uid, idStr) {
    const c = cid(idStr);
    if (!c) throw { status: 400, msg: 'content_id inválido' };
    await env.DB
        .prepare('DELETE FROM user_liked_episodes WHERE uid = ? AND content_id = ?')
        .bind(uid, c).run();
    return json(env, request, { ok: true, liked: false });
}

// — Playlists (dueño) —
// Devuelve los content_ids de un grupo de listas en un solo query.
async function itemsForPlaylists(env, ids) {
    const map = {};
    ids.forEach((id) => { map[id] = []; });
    if (!ids.length) return map;
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await env.DB
        .prepare(`SELECT playlist_id, content_id FROM user_playlist_items WHERE playlist_id IN (${placeholders}) ORDER BY orden ASC`)
        .bind(...ids).all();
    (results || []).forEach((r) => { (map[r.playlist_id] = map[r.playlist_id] || []).push(r.content_id); });
    return map;
}

async function getPlaylists(env, request, uid) {
    const { results } = await env.DB
        .prepare('SELECT id, nombre, publica, actualizado_en FROM user_playlists WHERE uid = ? ORDER BY actualizado_en DESC')
        .bind(uid).all();
    const lists = results || [];
    const items = await itemsForPlaylists(env, lists.map((l) => l.id));
    return json(env, request, {
        playlists: lists.map((l) => ({
            id: l.id, nombre: l.nombre, publica: !!l.publica,
            actualizado_en: l.actualizado_en, content_ids: items[l.id] || [],
        })),
    });
}

async function createPlaylist(request, env, uid) {
    let body; try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const nombre = String(body.nombre || '').trim().slice(0, 80);
    if (!nombre) throw { status: 400, msg: 'Falta el nombre de la lista' };

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_playlists WHERE uid = ?').bind(uid).first();
    if (row && row.n >= MAX_PLAYLISTS) {
        return json(env, request, { error: 'limite_listas', limite: MAX_PLAYLISTS }, 402);
    }

    const id = newPlaylistId();
    await env.DB
        .prepare('INSERT INTO user_playlists (id, uid, nombre) VALUES (?, ?, ?)')
        .bind(id, uid, nombre).run();

    // Si el cliente mandó un content_id inicial, lo añadimos (crear-y-añadir).
    const first = cid(body.content_id);
    if (first) {
        await env.DB
            .prepare('INSERT OR IGNORE INTO user_playlist_items (playlist_id, content_id, orden) VALUES (?, ?, 0)')
            .bind(id, first).run();
    }
    return json(env, request, { ok: true, id, nombre, content_ids: first ? [first] : [] }, 201);
}

// Confirma que la lista pertenece al usuario; lanza 404 si no.
async function ownedPlaylist(env, uid, id) {
    const pl = await env.DB
        .prepare('SELECT id, nombre, publica FROM user_playlists WHERE id = ? AND uid = ?')
        .bind(id, uid).first();
    if (!pl) throw { status: 404, msg: 'Lista no encontrada' };
    return pl;
}

async function getPlaylist(env, request, uid, id) {
    const pl = await ownedPlaylist(env, uid, id);
    const items = await itemsForPlaylists(env, [id]);
    return json(env, request, { id: pl.id, nombre: pl.nombre, publica: !!pl.publica, content_ids: items[id] || [] });
}

async function deletePlaylist(env, request, uid, id) {
    await ownedPlaylist(env, uid, id);
    await env.DB.prepare('DELETE FROM user_playlist_items WHERE playlist_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM user_playlists WHERE id = ? AND uid = ?').bind(id, uid).run();
    return json(env, request, { ok: true });
}

async function renamePlaylist(request, env, uid, id) {
    let body; try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const nombre = String(body.nombre || '').trim().slice(0, 80);
    if (!nombre) throw { status: 400, msg: 'Falta el nombre' };
    await ownedPlaylist(env, uid, id);
    await env.DB
        .prepare("UPDATE user_playlists SET nombre = ?, actualizado_en = datetime('now') WHERE id = ? AND uid = ?")
        .bind(nombre, id, uid).run();
    return json(env, request, { ok: true, nombre });
}

async function setPlaylistPublic(request, env, uid, id) {
    let body; try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const publica = body.publica ? 1 : 0;
    await ownedPlaylist(env, uid, id);
    await env.DB
        .prepare("UPDATE user_playlists SET publica = ?, actualizado_en = datetime('now') WHERE id = ? AND uid = ?")
        .bind(publica, id, uid).run();
    return json(env, request, { ok: true, publica: !!publica });
}

async function addPlaylistItem(request, env, uid, id) {
    let body; try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }
    const c = cid(body.content_id);
    if (!c) throw { status: 400, msg: 'content_id inválido' };
    await ownedPlaylist(env, uid, id);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_playlist_items WHERE playlist_id = ?').bind(id).first();
    if (count && count.n >= MAX_ITEMS) {
        return json(env, request, { error: 'limite_items', limite: MAX_ITEMS }, 402);
    }
    const mx = await env.DB.prepare('SELECT COALESCE(MAX(orden), -1) AS m FROM user_playlist_items WHERE playlist_id = ?').bind(id).first();
    const orden = (mx ? mx.m : -1) + 1;
    await env.DB
        .prepare('INSERT OR IGNORE INTO user_playlist_items (playlist_id, content_id, orden) VALUES (?, ?, ?)')
        .bind(id, c, orden).run();
    await env.DB.prepare("UPDATE user_playlists SET actualizado_en = datetime('now') WHERE id = ?").bind(id).run();
    return json(env, request, { ok: true }, 201);
}

async function removePlaylistItem(env, request, uid, id, cidStr) {
    const c = cid(cidStr);
    if (!c) throw { status: 400, msg: 'content_id inválido' };
    await ownedPlaylist(env, uid, id);
    await env.DB
        .prepare('DELETE FROM user_playlist_items WHERE playlist_id = ? AND content_id = ?')
        .bind(id, c).run();
    await env.DB.prepare("UPDATE user_playlists SET actualizado_en = datetime('now') WHERE id = ?").bind(id).run();
    return json(env, request, { ok: true });
}

// — Vista pública (SIN token) — solo si la lista es publica = 1.
// No revela el uid del dueño; solo el nombre y los content_ids (el frontend
// resuelve título/portada de cada episodio contra su catálogo local EPISODES).
async function getPublicPlaylist(env, request, id) {
    const pl = await env.DB
        .prepare('SELECT id, nombre, publica FROM user_playlists WHERE id = ?')
        .bind(id).first();
    if (!pl || !pl.publica) throw { status: 404, msg: 'Lista no encontrada o privada' };
    const items = await itemsForPlaylists(env, [id]);
    return json(env, request, { id: pl.id, nombre: pl.nombre, content_ids: items[id] || [] });
}

// ── Portero de contenido premium ─────────────────────────────────────
// Sirve un archivo desde un bucket R2 PRIVADO solo si el usuario es premium.
// Activación: añade el binding R2 `CONTENT` en wrangler-api.toml y registra
// filas en content_items. Sin binding responde 503 (queda inerte y seguro).
async function serveContent(env, request, uid, id) {
    if (!(await isPremium(env, uid))) throw { status: 403, msg: 'Contenido solo para miembros premium' };
    if (!env.CONTENT) throw { status: 503, msg: 'Almacén de contenido aún no configurado' };

    const item = await env.DB
        .prepare('SELECT r2_key, tipo FROM content_items WHERE id = ? AND es_premium = 1')
        .bind(parseInt(id, 10)).first();
    if (!item) throw { status: 404, msg: 'Contenido no encontrado' };

    const obj = await env.CONTENT.get(item.r2_key);
    if (!obj) throw { status: 404, msg: 'Archivo no disponible' };

    const headers = new Headers(corsHeaders(env, request));
    obj.writeHttpMetadata(headers);            // R2 exige un objeto Headers real
    headers.set('etag', obj.httpEtag);
    headers.set('Cache-Control', 'private, no-store');   // nunca cachear contenido premium
    if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg');
    return new Response(obj.body, { headers });
}

// ── Magic link propio (Brevo) ────────────────────────────────────────
// Endpoint PÚBLICO (sin token): genera el enlace de acceso con la API admin
// de Identity Toolkit (returnOobLink) y lo envía con correo de marca vía Brevo,
// desde @sonidodevida.com. Reemplaza el envío integrado de Firebase (sin marca
// y con bug de traducción). Secretos: BREVO_API_KEY y FIREBASE_SERVICE_ACCOUNT.

function bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToB64url(s) { return bytesToB64url(new TextEncoder().encode(s)); }

// Importa la private_key (PEM PKCS8) de la cuenta de servicio para firmar RS256.
async function importServiceKey(pem) {
    const der = b64urlToBytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
    return crypto.subtle.importKey(
        'pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
}

// Access token OAuth2 de Google a partir de la cuenta de servicio (cacheado ~1h).
let GTOKEN_CACHE = { token: null, exp: 0 };
async function getGoogleAccessToken(env) {
    const now = Date.now();
    if (GTOKEN_CACHE.token && now < GTOKEN_CACHE.exp) return GTOKEN_CACHE.token;
    if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error('falta FIREBASE_SERVICE_ACCOUNT');
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(now / 1000);
    const claim = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase',
        aud: tokenUri,
        iat,
        exp: iat + 3600,
    };
    const unsigned = strToB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + strToB64url(JSON.stringify(claim));
    const key = await importServiceKey(sa.private_key);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const jwt = unsigned + '.' + bytesToB64url(new Uint8Array(sig));

    const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw new Error('OAuth Google: ' + (data.error_description || data.error || res.status));
    }
    const ttl = (data.expires_in ? data.expires_in - 60 : 3000) * 1000;
    GTOKEN_CACHE = { token: data.access_token, exp: now + ttl };
    return GTOKEN_CACHE.token;
}

// Pide a Identity Toolkit el enlace de acceso (sin enviarlo) con returnOobLink.
async function generateSignInLink(env, email, continueUrl) {
    const accessToken = await getGoogleAccessToken(env);
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': env.FIREBASE_PROJECT_ID,
        },
        body: JSON.stringify({
            requestType: 'EMAIL_SIGNIN',
            email,
            continueUrl,
            canHandleCodeInApp: true,
            returnOobLink: true,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.oobLink) {
        throw new Error('Identity Toolkit: ' + ((data.error && data.error.message) || res.status));
    }
    return data.oobLink;
}

// Correo de marca (HTML + texto). Sin imágenes externas para mejor entrega.
function magicLinkEmail(link) {
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#0f0d0a;font-family:Arial,Helvetica,sans-serif;color:#e8e2d6">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <h1 style="font-size:22px;color:#d9b66b;margin:0 0 8px">Sonido de Vida</h1>
    <p style="font-size:15px;line-height:1.6;color:#e8e2d6;margin:18px 0">Hola:</p>
    <p style="font-size:15px;line-height:1.6;color:#e8e2d6;margin:0 0 24px">Recibimos una solicitud para entrar a tu cuenta. Haz clic en el botón para iniciar sesión:</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${link}" style="background:#d9b66b;color:#1a1610;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:10px;display:inline-block">Entrar a Sonido de Vida</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#9a9387;margin:24px 0 0">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
    <p style="font-size:12px;line-height:1.5;word-break:break-all;color:#7e9bd1;margin:6px 0 0">${link}</p>
    <hr style="border:none;border-top:1px solid #2a261f;margin:28px 0">
    <p style="font-size:12px;line-height:1.6;color:#7c766b;margin:0">Si no solicitaste este enlace, puedes ignorar este correo sin problema; tu cuenta sigue segura.</p>
    <p style="font-size:12px;line-height:1.6;color:#7c766b;margin:16px 0 0">Con cariño,<br>El equipo de Sonido de Vida</p>
  </div>
</body></html>`;
    const text = `Sonido de Vida\n\nRecibimos una solicitud para entrar a tu cuenta. Abre este enlace para iniciar sesión:\n\n${link}\n\nSi no solicitaste este enlace, puedes ignorarlo sin problema.\n\nEl equipo de Sonido de Vida`;
    return { html, text };
}

async function sendBrevoEmail(env, toEmail, link) {
    if (!env.BREVO_API_KEY) throw new Error('falta BREVO_API_KEY');
    const { html, text } = magicLinkEmail(link);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
            sender: { name: 'Sonido de Vida', email: env.SENDER_EMAIL || 'noreply@sonidodevida.com' },
            to: [{ email: toEmail }],
            subject: 'Tu enlace para entrar a Sonido de Vida',
            htmlContent: html,
            textContent: text,
        }),
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('Brevo: ' + res.status + ' ' + t.slice(0, 200));
    }
}

async function handleMagicLink(request, env) {
    let body;
    try { body = await request.json(); } catch { throw { status: 400, msg: 'JSON inválido' }; }

    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw { status: 400, msg: 'Correo inválido' };

    // El enlace solo puede volver a un origen propio (evita abuso / redirección abierta).
    let continueUrl = env.ALLOWED_ORIGIN || 'https://sonidodevida.com';
    if (body.continueUrl) {
        try {
            const u = new URL(body.continueUrl);
            if (allowedOrigins(env).has(u.origin)) continueUrl = u.origin;
        } catch { /* continueUrl inválido: usa el por defecto */ }
    }

    // Anti-spam: un enlace por correo cada 60s (protege la cuota de Brevo).
    const rateKey = 'mlrate:' + email;
    if (env.PREMIUM && await env.PREMIUM.get(rateKey)) {
        throw { status: 429, msg: 'Ya te enviamos un enlace hace poco. Revisa tu correo (y spam) o espera un minuto.' };
    }

    const link = await generateSignInLink(env, email, continueUrl);
    await sendBrevoEmail(env, email, link);

    if (env.PREMIUM) await env.PREMIUM.put(rateKey, String(Date.now()), { expirationTtl: 60 });
    return json(env, request, { ok: true });
}

// ── Métricas: analytics propio (visitas + embudo) y SEO ──────────────
// Todo best-effort: un fallo de métrica NUNCA debe romper la app del usuario.

// Clasifica de dónde viene una visita a partir del referrer y utm_source.
// Devuelve { source, medium, host }. medium ∈ social|organic|referral|direct|campaign.
function classifyTraffic(referrer, utmSource, selfHost) {
    const utm = String(utmSource || '').toLowerCase().trim().slice(0, 40);
    if (utm) {
        const social = ['instagram', 'facebook', 'fb', 'ig', 'tiktok', 'youtube', 'twitter', 'x', 'whatsapp', 'telegram'];
        return { source: utm, medium: social.includes(utm) ? 'social' : 'campaign', host: null };
    }
    let host = '';
    try { host = new URL(referrer).hostname.replace(/^www\./, '').toLowerCase(); } catch { host = ''; }
    if (!host || (selfHost && host.endsWith(selfHost))) return { source: 'directo', medium: 'direct', host: null };

    const map = [
        [/(^|\.)instagram\.com$|l\.instagram/, 'instagram', 'social'],
        [/(^|\.)facebook\.com$|^[a-z]{1,3}\.facebook\.com$|(^|\.)fb\.com$/, 'facebook', 'social'],
        [/(^|\.)t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'twitter', 'social'],
        [/(^|\.)tiktok\.com$/, 'tiktok', 'social'],
        [/(^|\.)youtube\.com$|youtu\.be/, 'youtube', 'social'],
        [/(^|\.)whatsapp\.com$|wa\.me/, 'whatsapp', 'social'],
        [/(^|\.)t\.me$|(^|\.)telegram\.(org|me)$/, 'telegram', 'social'],
        [/google\./, 'google', 'organic'],
        [/(^|\.)bing\.com$/, 'bing', 'organic'],
        [/duckduckgo\.com$/, 'duckduckgo', 'organic'],
        [/search\.yahoo|(^|\.)yahoo\.com$/, 'yahoo', 'organic'],
    ];
    for (const [re, source, medium] of map) if (re.test(host)) return { source, medium, host };
    return { source: host, medium: 'referral', host };
}

async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Hash anónimo del visitante que ROTA cada día (la fecha actúa de sal): permite
// contar únicos del día sin guardar la IP ni poder seguir a nadie entre días.
async function dailyVisitorHash(dia, ip, ua) {
    return (await sha256Hex(dia + '|' + (ip || '') + '|' + (ua || ''))).slice(0, 16);
}

// POST /api/track — beacon público y anónimo (sin token). Registra una visita.
async function handleTrack(request, env) {
    let body; try { body = await request.json(); } catch { body = {}; }
    const dia = todayUTC();
    const path = String(body.path || '/').replace(/[?#].*$/, '').slice(0, 200);
    const referrer = String(body.ref || '').slice(0, 400);
    const utm = String(body.utm || '').slice(0, 60);

    let selfHost = '';
    try { selfHost = new URL(env.ALLOWED_ORIGIN || 'https://sonidodevida.com').hostname.replace(/^www\./, ''); } catch { /* */ }
    const { source, medium, host } = classifyTraffic(referrer, utm, selfHost);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    const visitor = await dailyVisitorHash(dia, ip, ua);
    const country = request.headers.get('CF-IPCountry') || (request.cf && request.cf.country) || '';
    const device = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'mobile' : 'desktop';

    try {
        await env.DB.prepare(
            'INSERT INTO analytics_pageviews (dia, path, source, medium, referrer_host, visitor, country, device) VALUES (?,?,?,?,?,?,?,?)'
        ).bind(dia, path, source, medium, host, visitor, country, device).run();
    } catch { /* nunca romper por una métrica */ }
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

// Registra un evento de embudo UNA sola vez por uid ('registro' | 'premium').
async function logEvent(env, tipo, uid) {
    if (!uid) return;
    try {
        await env.DB.prepare('INSERT OR IGNORE INTO analytics_events (dia, tipo, uid) VALUES (?, ?, ?)')
            .bind(todayUTC(), tipo, uid).run();
    } catch { /* best-effort */ }
}

// GET /api/metrics — resumen agregado para el dashboard. Solo administradores.
async function handleMetrics(env, request, user) {
    if (!isAdmin(env, user.uid)) throw { status: 403, msg: 'Solo administradores' };
    const DB = env.DB;
    const many = (sql, ...b) => DB.prepare(sql).bind(...b).all().then((r) => r.results || []);
    const one = (sql, ...b) => DB.prepare(sql).bind(...b).first();
    const hoy = todayUTC();

    const [visHoy, vis7, vis30, regTot, preTot, reg30, pre30, seo30] = await Promise.all([
        one('SELECT COUNT(*) n, COUNT(DISTINCT visitor) u FROM analytics_pageviews WHERE dia = ?', hoy),
        one("SELECT COUNT(*) n, COUNT(DISTINCT visitor) u FROM analytics_pageviews WHERE dia >= date('now','-6 days')"),
        one("SELECT COUNT(*) n, COUNT(DISTINCT visitor) u FROM analytics_pageviews WHERE dia >= date('now','-29 days')"),
        one("SELECT COUNT(*) n FROM analytics_events WHERE tipo='registro'"),
        one("SELECT COUNT(*) n FROM analytics_events WHERE tipo='premium'"),
        one("SELECT COUNT(*) n FROM analytics_events WHERE tipo='registro' AND dia >= date('now','-29 days')"),
        one("SELECT COUNT(*) n FROM analytics_events WHERE tipo='premium' AND dia >= date('now','-29 days')"),
        one("SELECT COALESCE(SUM(impresiones),0) imp, COALESCE(SUM(clics),0) clk FROM seo_daily WHERE dia >= date('now','-29 days')"),
    ]);

    const [serie, fuentes, medios, paginas, paises, devices, seoSerie, seoQueries] = await Promise.all([
        many("SELECT dia, COUNT(*) visitas, COUNT(DISTINCT visitor) unicos FROM analytics_pageviews WHERE dia >= date('now','-29 days') GROUP BY dia ORDER BY dia"),
        many("SELECT source, medium, COUNT(*) n, COUNT(DISTINCT visitor) u FROM analytics_pageviews WHERE dia >= date('now','-29 days') GROUP BY source ORDER BY n DESC LIMIT 12"),
        many("SELECT medium, COUNT(*) n FROM analytics_pageviews WHERE dia >= date('now','-29 days') GROUP BY medium ORDER BY n DESC"),
        many("SELECT path, COUNT(*) n FROM analytics_pageviews WHERE dia >= date('now','-29 days') GROUP BY path ORDER BY n DESC LIMIT 10"),
        many("SELECT country, COUNT(*) n FROM analytics_pageviews WHERE dia >= date('now','-29 days') AND country <> '' GROUP BY country ORDER BY n DESC LIMIT 8"),
        many("SELECT device, COUNT(*) n FROM analytics_pageviews WHERE dia >= date('now','-29 days') GROUP BY device"),
        many("SELECT dia, impresiones, clics, ctr, posicion FROM seo_daily WHERE dia >= date('now','-29 days') ORDER BY dia"),
        many("SELECT query, impresiones, clics, posicion FROM seo_queries WHERE dia = (SELECT MAX(dia) FROM seo_queries) ORDER BY clics DESC, impresiones DESC LIMIT 15"),
    ]);

    return json(env, request, {
        generado: new Date().toISOString(),
        resumen: {
            visitas_hoy: visHoy?.n || 0, unicos_hoy: visHoy?.u || 0,
            visitas_7d: vis7?.n || 0, unicos_7d: vis7?.u || 0,
            visitas_30d: vis30?.n || 0, unicos_30d: vis30?.u || 0,
            registros_total: regTot?.n || 0, premium_total: preTot?.n || 0,
            registros_30d: reg30?.n || 0, premium_30d: pre30?.n || 0,
            seo_impresiones_30d: seo30?.imp || 0, seo_clics_30d: seo30?.clk || 0,
        },
        serie, fuentes, medios, paginas, paises, devices,
        embudo: { visitas: vis30?.u || 0, registros: reg30?.n || 0, premium: pre30?.n || 0 },
        seo: { serie: seoSerie, queries: seoQueries, configurado: !!env.SEARCH_CONSOLE_SITE },
    });
}

// ── SEO: sincronización con Search Console (cron nocturno) — Fase 2 ───
// Inerte hasta configurar SEARCH_CONSOLE_SITE (ej. 'sc-domain:sonidodevida.com')
// y dar acceso a la cuenta de servicio de FIREBASE_SERVICE_ACCOUNT en Search Console.
let SC_TOKEN_CACHE = { token: null, exp: 0 };
async function getSearchConsoleToken(env) {
    const now = Date.now();
    if (SC_TOKEN_CACHE.token && now < SC_TOKEN_CACHE.exp) return SC_TOKEN_CACHE.token;
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(now / 1000);
    const claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: tokenUri, iat, exp: iat + 3600 };
    const unsigned = strToB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + strToB64url(JSON.stringify(claim));
    const key = await importServiceKey(sa.private_key);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const jwt = unsigned + '.' + bytesToB64url(new Uint8Array(sig));
    const res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error('OAuth SC: ' + (data.error_description || data.error || res.status));
    SC_TOKEN_CACHE = { token: data.access_token, exp: now + (data.expires_in ? data.expires_in - 60 : 3000) * 1000 };
    return SC_TOKEN_CACHE.token;
}

async function scQuery(token, site, dims, startDate, endDate, rowLimit) {
    const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions: dims, rowLimit: rowLimit || 1000 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Search Console: ' + ((data.error && data.error.message) || res.status));
    return data.rows || [];
}

function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

async function runSeoSync(env) {
    const site = env.SEARCH_CONSOLE_SITE;
    if (!site || !env.FIREBASE_SERVICE_ACCOUNT) return; // Fase 2 sin configurar: inerte
    const token = await getSearchConsoleToken(env);
    const start = isoDaysAgo(10), end = isoDaysAgo(1); // Search Console va ~2-3 días atrasado

    const byDate = await scQuery(token, site, ['date'], start, end, 30);
    for (const r of byDate) {
        await env.DB.prepare(
            'INSERT INTO seo_daily (dia, impresiones, clics, ctr, posicion) VALUES (?,?,?,?,?) ' +
            'ON CONFLICT(dia) DO UPDATE SET impresiones=excluded.impresiones, clics=excluded.clics, ctr=excluded.ctr, posicion=excluded.posicion'
        ).bind(r.keys[0], r.impressions | 0, r.clicks | 0, r.ctr || 0, r.position || 0).run();
    }

    // Top búsquedas del corte (atribuidas al día final); se refresca cada noche.
    const byQuery = await scQuery(token, site, ['query'], start, end, 200);
    await env.DB.prepare('DELETE FROM seo_queries WHERE dia = ?').bind(end).run();
    for (const r of byQuery) {
        await env.DB.prepare('INSERT OR REPLACE INTO seo_queries (dia, query, impresiones, clics, posicion) VALUES (?,?,?,?,?)')
            .bind(end, String(r.keys[0]).slice(0, 120), r.impressions | 0, r.clicks | 0, r.position || 0).run();
    }
}

// Limpieza: las visitas crudas no se guardan para siempre (privacidad + tamaño).
async function pruneOldMetrics(env) {
    try {
        await env.DB.prepare("DELETE FROM analytics_pageviews WHERE dia < date('now','-180 days')").run();
        await env.DB.prepare("DELETE FROM seo_queries WHERE dia < date('now','-120 days')").run();
    } catch { /* */ }
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil((async () => {
            try { await runSeoSync(env); } catch (e) { console.warn('SEO sync:', e.message); }
            try { await pruneOldMetrics(env); } catch { /* */ }
        })());
    },

    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(env, request) });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '');

        try {
            // Endpoint público (sin token): envío del enlace de acceso por Brevo.
            if (path === '/api/magic-link' && request.method === 'POST') {
                return handleMagicLink(request, env);
            }
            // Endpoint público (sin token Firebase): webhook de Stripe.
            // Se autentica por firma (Stripe-Signature), por eso va antes de requireUser.
            if (path === '/api/stripe/webhook' && request.method === 'POST') {
                return handleStripeWebhook(request, env);
            }
            // Endpoint público (sin token): beacon de visitas (anónimo).
            if (path === '/api/track' && request.method === 'POST') {
                return await handleTrack(request, env);
            }
            // Endpoint admin (sin token Firebase; autenticado por X-Admin-Secret):
            // conceder premium permanente sin pago. `return await`: lanza { status }.
            if (path === '/api/admin/grant-premium' && request.method === 'POST') {
                return await handleAdminGrant(request, env);
            }
            // Endpoint público (sin token): ver una lista compartida (solo si es pública).
            const pub = path.match(/^\/api\/public\/playlist\/([A-Za-z0-9]+)$/);
            if (pub && request.method === 'GET') {
                // await: los handlers lanzan { status } y el try/catch solo atrapa
                // promesas esperadas, no las simplemente retornadas.
                return await getPublicPlaylist(env, request, pub[1]);
            }

            const user = await requireUser(request, env);

            if (path === '/api/me' && request.method === 'GET') {
                // Embudo: la primera vez que vemos este uid queda como 'registro'
                // (idempotente vía índice único). No bloquea la respuesta.
                if (ctx && ctx.waitUntil) ctx.waitUntil(logEvent(env, 'registro', user.uid));
                return json(env, request, { uid: user.uid, email: user.email, premium: await isPremium(env, user.uid), admin: isAdmin(env, user.uid) });
            }
            // Dashboard de métricas (solo admin). `return await`: lanza { status }.
            if (path === '/api/metrics' && request.method === 'GET') {
                return await handleMetrics(env, request, user);
            }
            // Suscripción premium (Stripe). `return await`: lanzan { status }.
            if (path === '/api/checkout' && request.method === 'POST') {
                return await handleCheckout(request, env, user);
            }
            if (path === '/api/portal' && request.method === 'POST') {
                return await handlePortal(request, env, user);
            }

            if (path === '/api/verses' && request.method === 'GET') {
                return getVerses(env, request, user.uid);
            }
            if (path === '/api/verses' && request.method === 'POST') {
                return saveVerse(request, env, user.uid);
            }
            const del = path.match(/^\/api\/verses\/(\d+)$/);
            if (del && request.method === 'DELETE') {
                return deleteVerse(env, request, user.uid, del[1]);
            }

            // Descargas (límite diario por uid)
            if (path === '/api/downloads' && request.method === 'GET') {
                return getDownloads(env, request, user.uid);
            }
            if (path === '/api/downloads' && request.method === 'POST') {
                return consumeDownload(env, request, user.uid);
            }
            if (path === '/api/downloads/bonus' && request.method === 'POST') {
                return grantShareBonus(env, request, user.uid);
            }

            // Biblioteca de descargas (lista sincronizada entre dispositivos)
            if (path === '/api/library' && request.method === 'GET') {
                return getLibrary(env, request, user.uid);
            }
            if (path === '/api/library' && request.method === 'POST') {
                return addLibrary(request, env, user.uid);
            }
            if (path === '/api/library' && request.method === 'DELETE') {
                return removeLibrary(request, env, user.uid);
            }

            // Likes (favoritos de episodios del podcast). Se usa `return await`
            // a propósito: estos handlers lanzan { status } y el try/catch solo
            // atrapa promesas esperadas, no las simplemente retornadas.
            if (path === '/api/likes' && request.method === 'GET') {
                return await getLikes(env, request, user.uid);
            }
            if (path === '/api/likes' && request.method === 'POST') {
                return await addLike(request, env, user.uid);
            }
            const unlike = path.match(/^\/api\/likes\/(\d+)$/);
            if (unlike && request.method === 'DELETE') {
                return await removeLike(env, request, user.uid, unlike[1]);
            }

            // Listas de reproducción (dueño)
            if (path === '/api/playlists' && request.method === 'GET') {
                return await getPlaylists(env, request, user.uid);
            }
            if (path === '/api/playlists' && request.method === 'POST') {
                return await createPlaylist(request, env, user.uid);
            }
            const plItem = path.match(/^\/api\/playlists\/([A-Za-z0-9]+)\/items\/(\d+)$/);
            if (plItem && request.method === 'DELETE') {
                return await removePlaylistItem(env, request, user.uid, plItem[1], plItem[2]);
            }
            const plItems = path.match(/^\/api\/playlists\/([A-Za-z0-9]+)\/items$/);
            if (plItems && request.method === 'POST') {
                return await addPlaylistItem(request, env, user.uid, plItems[1]);
            }
            const plRename = path.match(/^\/api\/playlists\/([A-Za-z0-9]+)\/rename$/);
            if (plRename && request.method === 'POST') {
                return await renamePlaylist(request, env, user.uid, plRename[1]);
            }
            const plPublic = path.match(/^\/api\/playlists\/([A-Za-z0-9]+)\/public$/);
            if (plPublic && request.method === 'POST') {
                return await setPlaylistPublic(request, env, user.uid, plPublic[1]);
            }
            const plOne = path.match(/^\/api\/playlists\/([A-Za-z0-9]+)$/);
            if (plOne && request.method === 'GET') {
                return await getPlaylist(env, request, user.uid, plOne[1]);
            }
            if (plOne && request.method === 'DELETE') {
                return await deletePlaylist(env, request, user.uid, plOne[1]);
            }

            // Portero de contenido premium
            const content = path.match(/^\/api\/content\/(\d+)$/);
            if (content && request.method === 'GET') {
                return serveContent(env, request, user.uid, content[1]);
            }

            return json(env, request, { error: 'no encontrado' }, 404);
        } catch (e) {
            if (e && e.status) return json(env, request, { error: e.msg }, e.status);
            return json(env, request, { error: 'error interno' }, 500);
        }
    },
};
