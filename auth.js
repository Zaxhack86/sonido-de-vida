// Sonido de Vida — módulo de cuenta (Firebase Auth + API de versículos guardados)
// Requiere cargar antes los SDK compat de Firebase (app + auth) en index.html.
//
// ⚠️ PENDIENTE: pega tu config real de Firebase (Project Settings → Tus apps → Web).
//    Mientras siga el placeholder "REEMPLAZAR", el módulo queda INERTE: no inicializa
//    Firebase ni toca la UI, así que la app sigue funcionando igual que hoy.

(function () {
    'use strict';

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyB_OBflka8ZVlAlF1NBWOMm7l5SryxTY7M",
        authDomain: "sonidodevida-7ebe7.firebaseapp.com",
        projectId: "sonidodevida-7ebe7",
        appId: "1:1078657988313:web:518e06df6ed2acb19c30c8",
    };

    // URL del API Worker (sonido-de-vida-api). Ajusta tras desplegarlo.
    const API_BASE = "https://sonido-de-vida-api.sonidodevida.workers.dev";

    const configured =
        !FIREBASE_CONFIG.apiKey.startsWith('REEMPLAZAR') &&
        typeof firebase !== 'undefined';

    const SDV = {
        enabled: configured,
        user: null,
        premium: false,
        _ready: false,
        on: {},               // hooks: SDV_Auth.on.change = (user) => {...}
    };
    window.SDV_Auth = SDV;

    if (!configured) {
        console.info('[SDV_Auth] inerte: falta config de Firebase (placeholder).');
        return;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    // Los correos de Firebase (enlace de acceso) llegan en español, no en inglés.
    auth.languageCode = 'es';

    // ── Token e API ──────────────────────────────────────────────────
    async function getToken() {
        if (!auth.currentUser) return null;
        return auth.currentUser.getIdToken();
    }

    async function api(path, opts = {}) {
        const token = await getToken();
        if (!token) throw new Error('no logueado');
        const res = await fetch(API_BASE + path, {
            ...opts,
            headers: {
                ...(opts.headers || {}),
                'Authorization': 'Bearer ' + token,
                ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    SDV.getToken = getToken;
    SDV.saveVerse = (libro, capitulo, versiculo, texto, coleccion) =>
        api('/api/verses', { method: 'POST', body: JSON.stringify({ libro, capitulo, versiculo, texto, coleccion }) });
    SDV.listVerses = () => api('/api/verses', { method: 'GET' });
    SDV.removeVerse = (id) => api('/api/verses/' + id, { method: 'DELETE' });

    // Biblioteca de descargas: lista sincronizada entre dispositivos (solo
    // libro+capítulo; el audio sigue en R2). Permite recuperarla tras borrar
    // los datos del navegador o al entrar desde otro equipo.
    SDV.listLibrary   = () => api('/api/library', { method: 'GET' });
    SDV.saveLibrary   = (libro, capitulo) => api('/api/library', { method: 'POST', body: JSON.stringify({ libro, capitulo }) });
    SDV.removeLibrary = (libro, capitulo) => api('/api/library', { method: 'DELETE', body: JSON.stringify({ libro, capitulo }) });

    // Descargas: el límite vive en el servidor (por uid), no en localStorage.
    SDV.getDownloads     = () => api('/api/downloads', { method: 'GET' });
    SDV.consumeDownload  = () => api('/api/downloads', { method: 'POST' });
    SDV.shareBonus       = () => api('/api/downloads/bonus', { method: 'POST' });

    // Listas de reproducción del Podcast (Fase 2): "me gusta" + playlists con
    // enlace público. Los episodios se referencian por content_id.
    SDV.likes          = () => api('/api/likes', { method: 'GET' });
    SDV.like           = (contentId) => api('/api/likes', { method: 'POST', body: JSON.stringify({ content_id: contentId }) });
    SDV.unlike         = (contentId) => api('/api/likes/' + contentId, { method: 'DELETE' });

    SDV.playlists      = () => api('/api/playlists', { method: 'GET' });
    SDV.createPlaylist = (nombre, contentId) => api('/api/playlists', { method: 'POST', body: JSON.stringify({ nombre, content_id: contentId }) });
    SDV.getPlaylist    = (id) => api('/api/playlists/' + id, { method: 'GET' });
    SDV.deletePlaylist = (id) => api('/api/playlists/' + id, { method: 'DELETE' });
    SDV.renamePlaylist = (id, nombre) => api('/api/playlists/' + id + '/rename', { method: 'POST', body: JSON.stringify({ nombre }) });
    SDV.setPlaylistPublic = (id, publica) => api('/api/playlists/' + id + '/public', { method: 'POST', body: JSON.stringify({ publica: !!publica }) });
    SDV.addToPlaylist  = (id, contentId) => api('/api/playlists/' + id + '/items', { method: 'POST', body: JSON.stringify({ content_id: contentId }) });
    SDV.removeFromPlaylist = (id, contentId) => api('/api/playlists/' + id + '/items/' + contentId, { method: 'DELETE' });

    // Vista pública de una lista compartida (SIN sesión): no usa token.
    SDV.publicPlaylist = async (id) => {
        const res = await fetch(API_BASE + '/api/public/playlist/' + id);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    };

    // Contenido premium (Modo Enfoque, etc.): descarga el archivo desde el
    // portero /api/content/:id usando el token y devuelve un objectURL para
    // <audio>. El binario nunca queda en una URL pública: el Worker solo lo
    // sirve si el uid es premium. Quien usa el objectURL debe revocarlo
    // (URL.revokeObjectURL) al terminar para liberar memoria.
    SDV.loadContentBlob = async (id) => {
        const token = await getToken();
        if (!token) throw new Error('no logueado');
        const res = await fetch(API_BASE + '/api/content/' + id, {
            headers: { 'Authorization': 'Bearer ' + token },
        });
        if (!res.ok) throw new Error('contenido no disponible (' + res.status + ')');
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    };

    // ── Login ────────────────────────────────────────────────────────
    SDV.signInGoogle = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        return auth.signInWithPopup(provider);
    };

    const EMAIL_KEY = 'sdv-emailForSignIn';
    // El enlace lo genera y envía nuestro Worker (correo de marca vía Brevo),
    // no el servicio integrado de Firebase. La parte de completar el login con
    // signInWithEmailLink (más abajo) no cambia.
    SDV.sendMagicLink = async (email) => {
        const res = await fetch(API_BASE + '/api/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, continueUrl: window.location.origin }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('No se pudo enviar el enlace (' + res.status + ')'));
        localStorage.setItem(EMAIL_KEY, email);
    };

    SDV.signOut = () => auth.signOut();

    // Completar magic link si la página se abrió desde el correo.
    if (auth.isSignInWithEmailLink(window.location.href)) {
        let email = localStorage.getItem(EMAIL_KEY);
        if (!email) email = window.prompt('Confirma tu correo para entrar:');
        if (email) {
            auth.signInWithEmailLink(email, window.location.href)
                .then(() => {
                    localStorage.removeItem(EMAIL_KEY);
                    history.replaceState(null, '', window.location.origin);
                })
                .catch((e) => console.warn('[SDV_Auth] magic link:', e.message));
        }
    }

    // ── Estado de sesión ─────────────────────────────────────────────
    auth.onAuthStateChanged(async (user) => {
        SDV.user = user;
        SDV._ready = true;
        if (user) {
            try {
                const r = await api('/api/me');
                SDV.premium = !!(r.ok && r.data.premium);
            } catch { SDV.premium = false; }
        } else {
            SDV.premium = false;
        }
        if (typeof SDV.on.change === 'function') SDV.on.change(user);
    });
})();
