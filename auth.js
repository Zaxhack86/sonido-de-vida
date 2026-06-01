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

    // ── Login ────────────────────────────────────────────────────────
    SDV.signInGoogle = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        return auth.signInWithPopup(provider);
    };

    const EMAIL_KEY = 'sdv-emailForSignIn';
    SDV.sendMagicLink = (email) => {
        const settings = { url: window.location.origin, handleCodeInApp: true };
        return auth.sendSignInLinkToEmail(email, settings).then(() => {
            localStorage.setItem(EMAIL_KEY, email);
        });
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
