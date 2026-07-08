(function () {
        const Acc = {};
        window.SDV_Account = Acc;

        const $ = (id) => document.getElementById(id);
        function toast(m) { if (window.showToast) showToast(m); }

        Acc.open = function () {
            if (window.closeMenu) closeMenu();
            $('accountModal').classList.add('visible');
            if (window.SDV_Auth?.user) Acc.loadVerses();
        };
        Acc.close = function () { $('accountModal').classList.remove('visible'); };

        Acc.google = function () {
            SDV_Auth.signInGoogle().catch(e => toast('No se pudo entrar: ' + e.message));
        };
        Acc.magicLink = function () {
            const email = $('accountEmail').value.trim();
            if (!email) return toast('Escribe tu correo');
            const msg = $('accountMsg');
            msg.style.color = 'rgba(255,255,255,.7)';
            msg.textContent = 'Enviando...';
            SDV_Auth.sendMagicLink(email)
                .then(() => {
                    msg.style.color = '#7bd88f';
                    msg.textContent = '✉️ Te enviamos un enlace a ' + email + '. Ábrelo en este dispositivo (revisa también spam).';
                })
                .catch(e => {
                    msg.style.color = '#ff7b7b';
                    msg.textContent = 'Error (' + (e.code || 'desconocido') + '): ' + e.message;
                    console.error('[SDV magicLink]', e);
                });
        };
        Acc.signOut = function () {
            if (!confirm('¿Seguro que quieres cerrar sesión?')) return;
            SDV_Auth.signOut().then(() => Acc.close());
        };

        // Botón 🔖 en cada versículo (inyectado por el hook del render).
        Acc.decorateVerse = function (p, libro, capitulo, versiculo, texto) {
            if (!window.SDV_Auth?.enabled) return; // inerte hasta configurar Firebase
            const btn = document.createElement('button');
            btn.textContent = '🔖';
            btn.title = 'Guardar versículo';
            btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:.85rem;opacity:.45;margin-left:.4rem;vertical-align:middle';
            btn.onmouseenter = () => btn.style.opacity = '1';
            btn.onmouseleave = () => btn.style.opacity = '.45';
            btn.onclick = (e) => {
                e.stopPropagation();
                if (!SDV_Auth.user) { Acc.open(); return; }
                SDV_Auth.saveVerse(libro, capitulo, versiculo, texto).then(r => {
                    if (r.ok) { btn.textContent = '✅'; toast('Versículo guardado'); }
                    else if (r.status === 402) toast('Llegaste al límite gratis. Hazte premium para guardar más.');
                    else toast('No se pudo guardar');
                }).catch(() => toast('No se pudo guardar'));
            };
            p.appendChild(btn);
        };

        Acc.loadVerses = function () {
            const box = $('accountVerses');
            box.innerHTML = '<p style="color:rgba(255,255,255,.6);font-size:.85rem">Cargando…</p>';
            SDV_Auth.listVerses().then(r => {
                const list = (r.ok && r.data.verses) || [];
                if (!list.length) { box.innerHTML = '<p style="color:rgba(255,255,255,.6);font-size:.85rem">Aún no guardas versículos. Toca 🔖 junto a un versículo.</p>'; return; }
                box.innerHTML = '';
                list.forEach(v => {
                    const row = document.createElement('div');
                    row.style.cssText = 'border-left:3px solid var(--gold,#c9a84c);padding:.5rem .7rem;background:rgba(255,255,255,.05);border-radius:8px';
                    // textContent (no innerHTML): el texto viene de la API y no debe interpretarse como HTML.
                    const ref = document.createElement('div');
                    ref.style.cssText = 'font-size:.72rem;color:var(--gold-light,#e8d48b);font-weight:700';
                    ref.textContent = `${v.libro} ${v.capitulo}:${v.versiculo}`;
                    const txt = document.createElement('div');
                    txt.style.cssText = 'font-family:Lora,serif;font-size:.92rem;color:rgba(255,255,255,.9);line-height:1.5;margin-top:.15rem';
                    txt.textContent = v.texto;
                    row.appendChild(ref); row.appendChild(txt);
                    const del = document.createElement('button');
                    del.textContent = 'Quitar';
                    del.style.cssText = 'background:none;border:none;color:#ff7b7b;cursor:pointer;font-size:.75rem;margin-top:.3rem';
                    del.onclick = () => SDV_Auth.removeVerse(v.id).then(() => Acc.loadVerses());
                    row.appendChild(del);
                    box.appendChild(row);
                });
            });
        };

        // Rellena avatar + estadísticas reales de la tarjeta de perfil ("Yo").
        function fillYoProfile(user) {
            const av = $('yoAvatar');
            if (av) {
                const base = (user.displayName || user.email || 'SV').trim();
                const parts = base.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
                const ini = parts.length > 1 ? (parts[0][0] + parts[1][0]) : base.slice(0, 2);
                av.textContent = (ini || 'SV').toUpperCase();
            }
            const d = $('yoStatDays');
            if (d) {
                const since = user.metadata && user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
                d.textContent = (since && !isNaN(since)) ? Math.max(1, Math.floor((Date.now() - since.getTime()) / 86400000) + 1) : '—';
            }
            const dl = $('yoStatDl');
            if (dl) { try { dl.textContent = (getOfflineList() || []).length; } catch (e) { dl.textContent = '0'; } }
            const vv = $('yoStatVerses');
            if (vv) {
                vv.textContent = '…';
                if (SDV_Auth.listVerses) SDV_Auth.listVerses().then(r => { vv.textContent = (r && r.length) || 0; }).catch(() => { vv.textContent = '0'; });
                else vv.textContent = '0';
            }
        }

        function reflectSession(user) {
            // Ocultar la sección y el enlace de "crear cuenta" si ya inició sesión
            const promo = document.getElementById('cuenta');
            if (promo) promo.style.display = user ? 'none' : '';
            const crearItem = document.getElementById('navCrearCuentaItem');
            if (crearItem) crearItem.style.display = user ? 'none' : '';
            $('accountLoggedOut').style.display = user ? 'none' : '';
            $('accountLoggedIn').style.display = user ? '' : 'none';
            // Pestaña "Yo": tarjeta de cuenta según sesión
            const yoIn = $('yoLoggedIn'), yoOut = $('yoLoggedOut'), yoArea = $('yoMemberArea');
            if (yoIn) yoIn.style.display = user ? '' : 'none';
            if (yoOut) yoOut.style.display = user ? 'none' : '';
            // El panel de miembro (menú, listas, descargas) solo existe con sesión.
            if (yoArea) yoArea.style.display = user ? '' : 'none';
            if (user) {
                $('accountName').textContent = user.displayName || '👋';
                $('accountEmailShown').textContent = user.email || '';
                $('accountPlan').textContent = SDV_Auth.premium ? '⭐ Premium' : 'Plan gratis';
                $('accountPlan').style.color = SDV_Auth.premium ? 'var(--gold-light,#e8d48b)' : 'rgba(255,255,255,.6)';
                if ($('yoName')) $('yoName').textContent = user.displayName || '👋';
                if ($('yoMail')) $('yoMail').textContent = user.email || '';
                if ($('yoPlan')) $('yoPlan').textContent = SDV_Auth.premium ? '👑 Premium' : 'Cuenta gratuita';
                fillYoProfile(user);
                // Botones de Premium en "Yo": gestionar si ya es premium, o suscribirse si no.
                if ($('yoUpgradeBtn')) $('yoUpgradeBtn').style.display = SDV_Auth.premium ? 'none' : '';
                if ($('yoManageBtn'))  $('yoManageBtn').style.display  = SDV_Auth.premium ? '' : 'none';
                if ($('accountModal').classList.contains('visible')) Acc.loadVerses();
            }
            // Si el usuario venía a pagar y acaba de entrar, reanuda el checkout.
            if (user && window.Premium) Premium.resumeIfPending();
            // Sincronizar cupo de descargas desde el servidor (por uid).
            // Sin sesión = bloqueado; logueado = trae usadas/restantes/límite reales.
            if (window.refreshDownloads) window.refreshDownloads();
            else if (window.updateDownloadBtn) window.updateDownloadBtn();
            // Sincronizar la biblioteca de descargas entre dispositivos.
            if (user && window.syncLibraryFromCloud) window.syncLibraryFromCloud();
            // Reflejar premium en la entrada del Modo Enfoque.
            if (window.Focus) Focus.refreshGate();
            // Cargar/limpiar likes y listas de reproducción (Fase 2).
            if (window.Listas) Listas.refresh();
            // Reevaluar anuncios: premium los quita.
            if (window.Ads) Ads.refresh();
        }

        // Esperar a que auth.js esté listo. Si Firebase no está configurado, no mostramos nada.
        function init() {
            if (!window.SDV_Auth) return setTimeout(init, 200);
            if (!SDV_Auth.enabled) return; // inerte: app intacta
            SDV_Auth.on.change = reflectSession;
            reflectSession(SDV_Auth.user);
        }
        init();
    })();
