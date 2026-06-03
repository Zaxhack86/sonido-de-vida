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

    const headers = corsHeaders(env, request);
    obj.writeHttpMetadata(headers);
    headers['etag'] = obj.httpEtag;
    headers['Cache-Control'] = 'private, no-store';   // nunca cachear contenido premium
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

export default {
    async fetch(request, env) {
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
