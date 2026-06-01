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

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(env, request) });
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '');

        try {
            const user = await requireUser(request, env);

            if (path === '/api/me' && request.method === 'GET') {
                return json(env, request, { uid: user.uid, email: user.email, premium: await isPremium(env, user.uid), admin: isAdmin(env, user.uid) });
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

            return json(env, request, { error: 'no encontrado' }, 404);
        } catch (e) {
            if (e && e.status) return json(env, request, { error: e.msg }, e.status);
            return json(env, request, { error: 'error interno' }, 500);
        }
    },
};
