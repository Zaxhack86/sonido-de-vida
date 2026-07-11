// ══════════════════════════════════════════════════════════════
    // CAMBIA ESTA URL después de hacer deploy del Worker de Cloudflare
    // Ejemplo: 'https://sonido-de-vida-audio.zax.workers.dev'
    // ══════════════════════════════════════════════════════════════
    const AUDIO_BASE = 'https://sonido-de-vida-audio.sonidodevida.workers.dev';

    // ── Voz/traducción activa ──────────────────────────────────────────
    //   'real' (RVA 1909, narración HUMANA · principal) | 'rva' (RVA 1909 TTS) | 'sbll' (SBLL 2026 TTS)
    //   'real' y 'rva' comparten el MISMO texto (RVA 1909 → window.BIBLE); solo
    //   cambia el audio. 'sbll' usa su propio texto (window.BIBLE_SBLL).
    let translationMode = 'real';

    function getActiveBible() {
        return (translationMode === 'sbll' && window.BIBLE_SBLL) ? window.BIBLE_SBLL : window.BIBLE;
    }
    function getTranslationLabel() {
        if (translationMode === 'sbll') return 'SBLL 2026';
        if (translationMode === 'real') return 'RVA 1909 · Voz Real';
        return 'RVA 1909';
    }
    // ── Carga diferida de los datos bíblicos (lazy-load) ──────────────
    // Cada traducción es un .js que define window.BIBLE (RVA) / window.BIBLE_SBLL
    // (SBLL). Se inyectan bajo demanda, una sola vez, y se reutiliza la promesa
    // en vuelo si llegan varias peticiones a la vez.
    // 'real' reutiliza el texto RVA (mismo .js / mismo global que 'rva').
    const BIBLE_SRC    = { rva: '/bible.js',  sbll: '/bible_sbll.js', real: '/bible.js' };
    const BIBLE_GLOBAL = { rva: 'BIBLE',      sbll: 'BIBLE_SBLL',     real: 'BIBLE' };
    const _bibleLoading = {};   // mode -> Promise en vuelo
    function bibleLoaded(mode) { return !!window[BIBLE_GLOBAL[mode]]; }
    function ensureBible(mode = translationMode) {
        if (bibleLoaded(mode)) return Promise.resolve();
        if (_bibleLoading[mode]) return _bibleLoading[mode];
        _bibleLoading[mode] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = BIBLE_SRC[mode];
            s.async = true;
            s.onload  = () => resolve();
            s.onerror = () => { delete _bibleLoading[mode]; reject(new Error('No se pudo cargar ' + BIBLE_SRC[mode])); };
            document.head.appendChild(s);
        });
        return _bibleLoading[mode];
    }

    // Prepara la UI de la Biblia (selector de libros) la primera vez que el
    // usuario la necesita. Idempotente. Antes esto corría en DOMContentLoaded
    // forzando la descarga de los datos en el arranque.
    let _booksPopulated = false;
    let _bibleUILoading = false;
    async function prepareBibleUI() {
        if (_booksPopulated || _bibleUILoading) return;
        _bibleUILoading = true;
        const sel = document.getElementById('bookSelect');
        if (sel) sel.innerHTML = '<option value="">Cargando la Biblia…</option>';
        try {
            await ensureBible();
            populateBooks();
            _booksPopulated = true;
        } catch (e) {
            if (sel) sel.innerHTML = '<option value="">Error al cargar</option>';
            showToast('⚠️ No se pudo cargar la Biblia. Revisa tu conexión.');
        } finally {
            _bibleUILoading = false;
        }
    }

    async function setTranslation(mode) {
        if (translationMode === mode) return;
        // Asegurar que la traducción destino esté cargada antes de cambiar
        try { await ensureBible(mode); }
        catch (e) { showToast('⚠️ No se pudo cargar esa traducción'); return; }
        translationMode = mode;
        // Actualizar botones del toggle
        document.getElementById('tt-real').classList.toggle('active', mode === 'real');
        document.getElementById('tt-rva').classList.toggle('active', mode === 'rva');
        document.getElementById('tt-sbll').classList.toggle('active', mode === 'sbll');
        updateReadSpeedAvail();
        // Si hay capítulo cargado, recargarlo con la nueva traducción.
        // Si estaba sonando, retomar por donde iba (no reiniciar el capítulo):
        // se guarda el segundo actual y se reanuda en esa posición con la voz nueva.
        if (state.book && state.chapter) {
            const wasPlaying = !audio.paused && !!audio.src;
            const resumeAt = (wasPlaying && isFinite(audio.currentTime)) ? audio.currentTime : 0;
            loadChapter({ book: state.book, chapter: state.chapter, autoplay: wasPlaying, silent: true, resumeAt });
        }
        // Actualizar subtítulo del player si está activo
        const sub = document.getElementById('playerSub');
        if (sub) sub.textContent = `${getTranslationLabel()} · Sonido de Vida`;
        showToast(`Traducción: ${getTranslationLabel()}`);
        if (window.Focus) Focus.syncBibleSelector(mode);
    }

    // Mapeo: nombre del libro en BIBLE → clave normalizada en R2
    const BOOK_KEY = {
        'Genesis':'genesis','Exodo':'exodo','Levitico':'levitico',
        'Numeros':'numeros','Deuteronomio':'deuteronomio','Josue':'josue',
        'Jueces':'jueces','Rut':'rut','1 Samuel':'1-samuel','2 Samuel':'2-samuel',
        '1 Reyes':'1-reyes','2 Reyes':'2-reyes','1 Cronicas':'1-cronicas',
        '2 Cronicas':'2-cronicas','Esdras':'esdras','Nehemias':'nehemias',
        'Ester':'ester','Job':'job','Salmos':'salmos','Proverbios':'proverbios',
        'Eclesiastes':'eclesiastes','Cantares':'cantares','Isaias':'isaias',
        'Jeremias':'jeremias','Lamentaciones':'lamentaciones','Ezequiel':'ezequiel',
        'Daniel':'daniel','Oseas':'oseas','Joel':'joel','Amos':'amos',
        'Abdias':'abdias','Jonas':'jonas','Miqueas':'miqueas','Nahum':'nahum',
        'Habacuc':'habacuc','Sofonias':'sofonias','Hageo':'hageo',
        'Zacarias':'zacarias','Malaquias':'malaquias',
        'Mateo':'mateo','Marcos':'marcos','Lucas':'lucas','Juan':'juan',
        'Hechos':'hechos','Romanos':'romanos','1 Corintios':'1-corintios',
        '2 Corintios':'2-corintios','Galatas':'galatas','Efesios':'efesios',
        'Filipenses':'filipenses','Colosenses':'colosenses',
        '1 Tesalonicenses':'1-tesalonicenses','2 Tesalonicenses':'2-tesalonicenses',
        '1 Timoteo':'1-timoteo','2 Timoteo':'2-timoteo','Tito':'tito',
        'Filemon':'filemon','Hebreos':'hebreos','Santiago':'santiago',
        '1 Pedro':'1-pedro','2 Pedro':'2-pedro','1 Juan':'1-juan',
        '2 Juan':'2-juan','3 Juan':'3-juan','Judas':'judas','Apocalipsis':'apocalipsis',
    };

    const BIBLE_ORDER = Object.keys(BOOK_KEY);
    const state = { book: '', chapter: 0, verses: [] };

    // ⚡ Plan C: dos elementos <audio> con pre-carga para transiciones sin gap.
    // El próximo capítulo se descarga en `audioPreload` mientras `audio` reproduce
    // el actual. Al final, se intercambian (swap) y el siguiente arranca sin
    // delay de red, manteniendo la sesión de audio del OS viva en pantalla bloqueada.
    const audioA = document.getElementById('mainAudio');
    audioA.preload = 'auto';
    const audioB = document.createElement('audio');
    audioB.id = 'mainAudioB';
    audioB.preload = 'auto';
    audioB.setAttribute('playsinline', '');
    audioA.parentNode.insertBefore(audioB, audioA.nextSibling);
    let audio = audioA;          // elemento activo (reproduce)
    let audioPreload = audioB;   // elemento en stand-by (precarga el próximo)
    let focusNarration = false;
    let playbackSpeed = 1;       // velocidad de la voz (Modo Enfoque); cambiar src la resetea, se reaplica al reproducir
    let preloadedFor = null;     // {book, chapter} ya cargado en audioPreload

    // Modo de reproducción efectivo.
    // En Modo Enfoque siempre usamos 'full': el stream cubre todos los libros
    // desde el capítulo actual hasta el Apocalipsis en una sola conexión HTTP.
    // Así el evento 'ended' solo ocurre al terminar toda la Biblia — nunca al
    // cambiar de libro — y la pantalla bloqueada no interrumpe la sesión de audio.
    function effectiveMode() {
        if (focusNarration) return 'full';
        return playbackMode || 'single';
    }

    // ════════════════════════════════════════════════════════════════
    // Modos de reproducción
    // ════════════════════════════════════════════════════════════════
    const PLAYBACK_MODES = {
        single:   { label: 'Solo capítulo', short: 'Capítulo único' },
        continue: { label: 'Continuar',     short: 'Continuar' },
        full:     { label: 'Libro completo',short: 'Libro completo' },
    };
    const MODE_KEY = 'sdv-playback-mode';
    let playbackMode = localStorage.getItem(MODE_KEY) || null;  // null = no se ha elegido aún
    let pendingPlayAction = null;  // función a ejecutar tras elegir modo

    /* ════════ Devocional de Hoy (rota cada día) ════════ */
    const DAILY_DEVOS = [
        {
            slug: 'salmos-23', libro: 'Salmos', cap: 23,
            ref: 'Salmos 23:1',
            verse: 'Jehová es mi pastor; nada me faltará.',
            title: 'El Pastor que va delante de ti',
            body: [
                'David escribió estas palabras siendo rey, pero las entendió siendo pastor adolescente en los campos de Belén. Sabía que la oveja no encuentra el agua sola; depende por completo de quien la guía. <strong>Nada me faltará</strong> no promete abundancia ilimitada, sino suficiencia: lo que necesites para hoy estará a su tiempo.',
                'Quizás hoy no sabes hacia dónde caminar. El salmo no te pide ver el camino completo — solo confiar en Quien ya lo recorrió delante de ti.'
            ],
            prayer: 'Señor, hoy descanso en que tú eres mi pastor, no mi propio esfuerzo. Guíame aunque no vea el camino. Amén.'
        },
        {
            slug: 'isaias-40-31', libro: 'Isaias', cap: 40,
            ref: 'Isaías 40:31',
            verse: 'Los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas.',
            title: 'La fuerza que nace en la espera',
            body: [
                'Isaías habló a un pueblo cansado, al borde del exilio. La palabra hebrea para esperar, <strong>qavah</strong>, no significa cruzarse de brazos: es la imagen de una cuerda que se trenza, hilo sobre hilo, hasta volverse irrompible. Esperar en Dios es entrelazar tu vida con la suya hasta que su fuerza sea la tuya.',
                'El águila no aletea contra la tormenta: abre las alas y deja que la corriente la levante. Hoy, deja de pelear con tus fuerzas y descansa en las de Él.'
            ],
            prayer: 'Padre, estoy cansado. Enséñame a esperar en ti hasta que tus fuerzas renueven las mías. Amén.'
        },
        {
            slug: 'filipenses-4-13', libro: 'Filipenses', cap: 4,
            ref: 'Filipenses 4:13',
            verse: 'Todo lo puedo en Cristo que me fortalece.',
            title: 'El secreto de un hombre preso',
            body: [
                'Pablo escribió esto encadenado en una cárcel romana, sin saber si viviría. No es un grito de éxito, sino de contentamiento: aprendió a vivir tanto con abundancia como con escasez. <strong>Todo lo puedo</strong> no significa lograrlo todo, sino sostenerme en todo — porque la fuerza no viene de mí.',
                'Hoy no necesitas más capacidad. Necesitas más de Cristo en medio de lo que ya cargas.'
            ],
            prayer: 'Cristo, no te pido cambiar mi circunstancia primero, sino fortalecer mi corazón dentro de ella. Amén.'
        },
        {
            slug: 'jeremias-29-11', libro: 'Jeremias', cap: 29,
            ref: 'Jeremías 29:11',
            verse: 'Yo sé los pensamientos que tengo acerca de vosotros, pensamientos de paz, y no de mal.',
            title: 'Una promesa escrita en el exilio',
            body: [
                'Esta promesa no se dio en un día de victoria, sino a un pueblo deportado a Babilonia, lejos de casa por setenta años. Dios no prometió sacarlos pronto; les pidió plantar huertos y vivir donde estaban. La palabra para paz es <strong>shalom</strong>: no ausencia de problemas, sino integridad, vida completa bajo su cuidado.',
                'Si hoy estás en una "Babilonia" que no elegiste, recuerda: Dios obra su bien incluso en el lugar donde no querías estar.'
            ],
            prayer: 'Señor, confío en que tus planes son buenos aun cuando no entiendo el presente. Dame paz para esperar. Amén.'
        },
        {
            slug: 'proverbios-3-5', libro: 'Proverbios', cap: 3,
            ref: 'Proverbios 3:5',
            verse: 'Fíate de Jehová de todo tu corazón, y no estribes en tu propia prudencia.',
            title: 'Cuando entender no es lo más importante',
            body: [
                'El verbo hebreo para confiar es <strong>batach</strong>: dejarse caer con todo el peso, como quien se recuesta sin reservas. No dice que tu razonamiento sea malo — dice que no apoyes tu vida solo en él. La mente humana ve un tramo; Dios ve el camino entero.',
                'Hoy hay algo que no logras entender. La fe no te pide entenderlo, sino soltarlo en las manos de Aquel que sí lo entiende.'
            ],
            prayer: 'Padre, dejo de apoyarme solo en lo que comprendo. Me recuesto en ti con todo mi corazón. Amén.'
        },
        {
            slug: 'mateo-6-33', libro: 'Mateo', cap: 6,
            ref: 'Mateo 6:33',
            verse: 'Buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.',
            title: 'El orden que lo cambia todo',
            body: [
                'Jesús hablaba a campesinos que vivían al día, preocupados por comida y ropa. No despreció esas necesidades — las puso en su lugar. <strong>Primeramente</strong> no es cuestión de tiempo, sino de prioridad: lo que ocupa el centro de tu corazón ordena todo lo demás.',
                'Hoy tus afanes gritan más fuerte que tu fe. Jesús no te pide ignorarlos, sino dejar que Dios, y no la ansiedad, ocupe el primer lugar.'
            ],
            prayer: 'Señor, ordena mis prioridades. Que buscarte a ti sea lo primero, y lo demás caiga en su sitio. Amén.'
        },
        {
            slug: 'romanos-8-28', libro: 'Romanos', cap: 8,
            ref: 'Romanos 8:28',
            verse: 'A los que aman a Dios, todas las cosas les ayudan a bien.',
            title: 'El bien que aún no se ve',
            body: [
                'Pablo no dice que todo sea bueno, sino que todo <strong>coopera</strong> para bien — la palabra griega es <strong>synergéō</strong>, de donde viene "sinergia". Como ingredientes amargos que solos no se comen, pero juntos en las manos del Maestro se vuelven pan.',
                'Hoy hay un hilo en tu vida que parece no tener sentido. No estás viendo la tela terminada; Dios sí, y está tejiendo bien incluso con ese hilo oscuro.'
            ],
            prayer: 'Dios, confío en que estás obrando bien aun en lo que hoy me duele. Dame fe para esperar el desenlace. Amén.'
        },
        {
            slug: 'juan-3-16', libro: 'Juan', cap: 3,
            ref: 'Juan 3:16',
            verse: 'De tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.',
            title: 'La medida de un amor sin medida',
            body: [
                'Jesús dijo esto de noche, a un religioso llamado Nicodemo que lo buscó a escondidas. <strong>De tal manera</strong> no mide cantidad, sino forma: así, de esta manera concreta, amó Dios — entregando lo más amado. El amor que solo se siente es sentimiento; el amor que se entrega es el de la cruz.',
                'Hoy no tienes que ganarte ese amor. Ya fue dado, antes de que lo merecieras, mientras todavía estabas lejos.'
            ],
            prayer: 'Padre, gracias porque me amaste primero, no por lo que hice, sino por quién eres. Amén.'
        },
        {
            slug: 'salmos-91', libro: 'Salmos', cap: 91,
            ref: 'Salmos 91:1',
            verse: 'El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente.',
            title: 'Habitar, no solo visitar',
            body: [
                'El salmo distingue dos verbos: <strong>habitar</strong> y <strong>morar</strong>. No habla de quien visita a Dios en la emergencia, sino de quien vive en su presencia como en casa. La "sombra" evoca la tienda del desierto: refugio del sol abrasador para el que se queda dentro.',
                'Hoy puedes correr a Dios solo en la crisis, o hacer de su presencia tu morada diaria. El refugio es para los que habitan, no para los que pasan de visita.'
            ],
            prayer: 'Señor, no quiero buscarte solo en la tormenta. Enséñame a habitar en ti cada día. Amén.'
        },
        {
            slug: 'romanos-8-1', libro: 'Romanos', cap: 8,
            ref: 'Romanos 8:1',
            verse: 'Ninguna condenación hay para los que están en Cristo Jesús.',
            title: 'El veredicto que ya fue dado',
            body: [
                'Pablo usa una palabra de tribunal: <strong>katákrima</strong>, la sentencia condenatoria del juez. Y declara que para quien está en Cristo esa sentencia ya no existe — no "menos condenación", sino <strong>ninguna</strong>. El caso fue cerrado en la cruz.',
                'Hoy tu conciencia quizás te acusa de lo mismo de siempre. Pero la voz de la culpa no es la voz final: el juez ya dictó su veredicto, y dice "libre".'
            ],
            prayer: 'Cristo, gracias porque en ti no hay condenación. Acallo la voz de la culpa y escucho tu gracia. Amén.'
        }
    ];

    function devoOfToday() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const day = Math.floor((now - start) / 86400000);
        return DAILY_DEVOS[day % DAILY_DEVOS.length];
    }

    function renderDevoHoy() {
        const card = document.getElementById('devoHoyCard');
        if (!card) return;
        document.querySelectorAll('#devocional-hoy .reveal').forEach(el => el.classList.add('visible'));
        const d = devoOfToday();
        const dateEl = document.getElementById('devoHoyDate');
        try {
            dateEl.textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
        } catch (e) { dateEl.textContent = ''; }
        document.getElementById('devoHoyRef').textContent = d.ref;
        document.getElementById('devoHoyVerse').textContent = d.verse;
        document.getElementById('devoHoyTitle').textContent = d.title;
        document.getElementById('devoHoyBody').innerHTML = d.body.map(p => `<p>${p}</p>`).join('');
        document.getElementById('devoHoyPrayer').innerHTML = `<b>Oración</b>${d.prayer}`;
        const more = document.getElementById('devoHoyMore');
        more.href = `/devocional/${d.slug}`;
        const listen = document.getElementById('devoHoyListen');
        listen.onclick = async () => {
            showTab('biblia');
            try { await ensureBible(); } catch (e) { return showToast('No se pudo cargar el capítulo'); }
            if (getActiveBible()[d.libro]) {
                loadChapter({ book: d.libro, chapter: d.cap, autoplay: true });
            } else {
                showToast('No se pudo cargar el capítulo');
            }
        };
    }

    // Enlace profundo a un capítulo: /?libro=Salmos&cap=91 (CTA de audio de los
    // devocionales). Cambia a la pestaña Biblia y reproduce. Los nombres de libro
    // van sin acento, igual que las claves de getActiveBible()/BOOK_KEY.
    async function checkChapterLink() {
        try {
            const params = new URLSearchParams(window.location.search);
            const libro = params.get('libro');
            const cap = parseInt(params.get('cap'), 10);
            if (!libro || !cap) return;
            try { await ensureBible(); } catch (e) { showToast('No se pudo cargar el capítulo'); return; }
            if (!getActiveBible()[libro]) {
                showToast('No se pudo cargar el capítulo');
                return;
            }
            showTab('biblia');
            loadChapter({ book: libro, chapter: cap, autoplay: true });
        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Los datos bíblicos ya NO se cargan aquí (lazy-load). El selector de
        // libros se llena vía prepareBibleUI() al entrar a Biblia/Buscar.
        document.getElementById('playerSub').textContent = `${getTranslationLabel()} · Sonido de Vida`;
        createParticles();
        initScrollAnimations();
        initTabLinks();
        initNavbar();
        initVerseTicker();
        initShowcaseWave();
        initAudioEvents();
        registerSW();
        initPWA();
        updateNavModeIndicator();
        updateDownloadBtn();
        renderDevoHoy();
        // Visualizadores de audio (barras) del Inicio premium (héroe + Modo Enfoque)
        [['heroEq',40],['focusEq',22]].forEach(function (pair) {
            var el = document.getElementById(pair[0]);
            if (!el || el.children.length) return;
            for (var i = 0; i < pair[1]; i++) {
                var b = document.createElement('span');
                b.className = 'eqb';
                b.style.setProperty('--h', (Math.random() * 28 + 8) + 'px');
                b.style.setProperty('--d', (0.5 + Math.random() * 0.9) + 's');
                b.style.setProperty('--dl', (Math.random() * 0.6) + 's');
                el.appendChild(b);
            }
        });
        // Pestaña inicial según el hash de la URL (/app#explorar, /app#biblia…),
        // útil al recargar o al abrir un enlace directo a una sección. Solo si no
        // hay query (los enlaces con ?libro=/?lista= mandan a Biblia más abajo).
        (function () {
            const h = (location.hash || '').replace('#', '');
            if (h && TABS.includes(h) && !location.search) showTab(h, { scroll: false });
            // Enlace directo al Modo Enfoque desde la landing (/app/#enfoque):
            // abre el selector si es premium, o el teaser de venta si no lo es.
            if (h === 'enfoque' && window.Focus) {
                history.replaceState(null, '', location.pathname + location.search);
                setTimeout(() => Focus.enter(), 350);
            }
        })();
        // Si entraron por un enlace de capítulo (/?libro=Salmos&cap=91), por
        // ejemplo desde el CTA "Escuchar en audio" de un devocional.
        checkChapterLink();
        // Si entraron por un enlace de lista compartida (/?lista=ID), ábrela.
        if (window.Listas) Listas.checkSharedLink();
        // Si entraron por un enlace de episodio compartido (/?ep=contentId).
        if (window.Podcast) Podcast.checkSharedEpisode();
        // Si vuelven de Stripe (?checkout=success|cancel): avisar y refrescar premium.
        if (window.Premium) Premium.checkReturn();
        // Evaluar el banner de anuncios según la pestaña inicial / sesión.
        if (window.Ads) Ads.refresh();
    });

    let swReg = null;
    function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js').then(reg => {
            swReg = reg;
            reg.update();   // fuerza comprobación de versión nueva al abrir la app
            reg.addEventListener('updatefound', () => {
                const nw = reg.installing;
                if (!nw) return;
                nw.addEventListener('statechange', () => {
                    if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
                });
            });
        }).catch(() => {});

        // Vuelve a comprobar si hay versión nueva cada vez que el usuario regresa a la pestaña.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && swReg) { try { swReg.update(); } catch (e) {} }
        });

        // Auto-recarga cuando se activa una versión nueva. PERO sin cortar la
        // reproducción: si hay audio sonando, espera a que el usuario pause o
        // termine el capítulo para no interrumpir la Palabra.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            const doReload = () => window.location.reload();
            if (typeof audio !== 'undefined' && audio && audio.src && !audio.paused) {
                audio.addEventListener('pause', doReload, { once: true });
                audio.addEventListener('ended', doReload, { once: true });
            } else {
                doReload();
            }
        });
    }

    function showUpdateBanner(worker) {
        if (document.getElementById('sdvUpdateBanner')) return;
        const b = document.createElement('div');
        b.id = 'sdvUpdateBanner';
        b.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:9999;background:var(--gold,#c9a84c);color:#1a1a1a;font-family:Inter,sans-serif;font-weight:600;font-size:.9rem;padding:.7rem 1.1rem;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.25);cursor:pointer';
        b.textContent = '✨ Nueva versión disponible — Actualizar';
        b.onclick = () => { b.textContent = 'Actualizando…'; worker.postMessage({ type: 'SKIP_WAITING' }); };
        document.body.appendChild(b);
    }

    function populateBooks() {
        const sel = document.getElementById('bookSelect');
        sel.innerHTML = '<option value="">Selecciona un libro...</option>';
        const available = Object.keys(getActiveBible());
        const books = BIBLE_ORDER.filter(b => available.includes(b))
                      .concat(available.filter(b => !BIBLE_ORDER.includes(b)).sort());
        books.forEach(book => {
            const o = document.createElement('option'); o.value = book; o.textContent = book; sel.appendChild(o);
        });
        sel.addEventListener('change', () => {
            const book = sel.value;
            const cs = document.getElementById('chapterSelect');
            if (book && getActiveBible()[book]) { populateChapters(getActiveBible()[book].length); cs.disabled = false; }
            else { cs.innerHTML = '<option value="">Cap.</option>'; cs.disabled = true; }
        });
        if (window.BibleUI) BibleUI.render();
    }

    function populateChapters(count) {
        const sel = document.getElementById('chapterSelect');
        sel.innerHTML = '<option value="">Cap.</option>';
        for (let i = 1; i <= count; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; sel.appendChild(o); }
    }

    async function loadChapter(opts = {}) {
        const book    = opts.book    ?? document.getElementById('bookSelect').value;
        const chapter = opts.chapter ?? parseInt(document.getElementById('chapterSelect').value);
        if (!book || !chapter) return showToast('Selecciona un libro y capítulo');
        // Lazy-load: asegurar la traducción activa antes de leer versículos.
        try { await ensureBible(); }
        catch (e) { return showToast('⚠️ No se pudo cargar la Biblia'); }
        let verses = getActiveBible()[book]?.[chapter - 1];
        let textFallback = false;
        // Fallback: si SBLL no tiene texto para este capítulo, usar RVA 1909.
        // Carga bible.js (RVA) bajo demanda solo en este caso.
        if (translationMode === 'sbll' && (!verses || verses.length === 0)) {
            try { await ensureBible('rva'); } catch (e) {}
            verses = window.BIBLE?.[book]?.[chapter - 1];
            if (verses) textFallback = true;
        }
        if (!verses) return showToast('⚠️ Capítulo no disponible en la base de datos');

        if (!opts.autoplay && !opts.skipAudio) {
            audio.pause(); audio.removeAttribute('src'); audio.load();
            updatePlayUI(false);
        }
        state.book = book; state.chapter = chapter; state.verses = verses;
        try { localStorage.setItem('sdv:last', JSON.stringify({ book, chapter })); } catch (e) {}

        // Sincronizar selectores con el capítulo actual
        const bookSel = document.getElementById('bookSelect');
        const chapSel = document.getElementById('chapterSelect');
        if (bookSel.value !== book) {
            bookSel.value = book;
            populateChapters(getActiveBible()[book].length);
            chapSel.disabled = false;
        }
        chapSel.value = chapter;

        document.getElementById('chapterRef').textContent = `${book} — Capítulo ${chapter}`;
        document.getElementById('chapterVerseCount').textContent = `${verses.length} versículos`;

        const container = document.getElementById('chapterVerses');
        container.innerHTML = '';
        if (textFallback) {
            const note = document.createElement('p');
            note.style.cssText = 'font-size:.75rem;color:rgba(255,255,255,.35);font-style:italic;margin-bottom:.8rem;padding:.4rem .6rem;border-left:2px solid rgba(201,168,76,.2)';
            note.textContent = '· Texto no disponible en SBLL · Mostrando RVA 1909';
            container.appendChild(note);
        }
        verses.forEach((text, i) => {
            const p = document.createElement('p'); p.className = 'verse-line';
            p.innerHTML = `<span class="verse-number">${i + 1}</span>${text}`;
            if (window.SDV_Account?.decorateVerse) window.SDV_Account.decorateVerse(p, book, chapter, i + 1, text);
            container.appendChild(p);
        });

        const pb = document.getElementById('playBtn');
        pb.disabled = false; pb.classList.remove('playing'); pb.innerHTML = '🔊 Escuchar';
        document.getElementById('downloadBtn').disabled = false;
        updateDownloadBtn();
        document.getElementById('chapterResult').classList.add('visible');
        if (window.BibleUI) BibleUI.syncFromState();

        updateChapterNavButtons();
        updateNavModeIndicator();
        updatePlayerNextHint();
        if (window.Focus) Focus.syncVerse();

        if (!opts.silent) {
            document.getElementById('chapterResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        if (opts.autoplay && !opts.skipAudio) {
            if (opts.resumeAt > 0) startPlayingAt(opts.resumeAt);
            else startPlaying();
        }
        // Actualizar metadatos de pantalla de bloqueo aunque no haya play nuevo
        if ('mediaSession' in navigator && state.book) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: state.book,
                artist: 'Sonido de Vida',
                album: getTranslationLabel(),
                artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
            });
        }
    }

    function audioUrl(book, chapter, single = false) {
        const key = BOOK_KEY[book] || book.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'-');
        // Prefijo de ruta del Worker por voz: real→/real, sbll→/sbll, rva→(raíz)
        const prefix = translationMode === 'real' ? 'real/' : (translationMode === 'sbll' ? 'sbll/' : '');
        // Stream continuo del servidor: concatena todos los MP3 desde este capítulo
        // en una sola respuesta HTTP. Esto evita el evento 'ended' entre capítulos,
        // lo que es esencial para reproducción confiable con pantalla bloqueada en
        // iOS/Android. Se usa tanto en modo normal como en Modo Enfoque (effectiveMode).
        // single=true fuerza URL de capítulo individual (p.ej. descarga).
        const eMode = effectiveMode();
        if (!single && (eMode === 'continue' || eMode === 'full')) {
            const m = eMode === 'full' ? 'full' : 'continuar';
            return `${AUDIO_BASE}/stream/${prefix}${key}/${chapter}?modo=${m}`;
        }
        return `${AUDIO_BASE}/${prefix}${key}/${chapter}`;
    }

    async function startPlaying() {
        if (!state.book || !state.chapter) return;
        const pb = document.getElementById('playBtn');
        pb.disabled = true;
        pb.innerHTML = '<span class="loading-spinner"></span> Cargando...';
        document.getElementById('playerLoading').classList.add('active');
        showPlayerBar();
        // Asignar src y llamar play() sin audio.load() intermedio
        // para conservar el "user gesture" en iOS/Android
        audio.src = audioUrl(state.book, state.chapter);
        try { await audio.play(); }
        catch (e) {
            // AbortError ocurre cuando el navegador cancela internamente la carga;
            // no es un error real y el audio suele retomarse solo → ignorar.
            if (e.name === 'AbortError') return;
            showToast('⚠️ ' + (e.message || 'Error de audio'));
            hidePlayerBar(); pb.disabled = false; pb.innerHTML = '🔊 Escuchar';
        }
    }

    // Reanuda el capítulo actual en un segundo concreto (p.ej. al cambiar de voz
    // sin reiniciar). Usa el archivo de capítulo individual, que SÍ admite seek
    // (el /stream/ concatenado no es buscable). Al terminar el capítulo, el
    // auto-avance normal retoma la continuidad (en Enfoque, el siguiente vía stream).
    async function startPlayingAt(seconds) {
        if (!state.book || !state.chapter) return;
        showPlayerBar();
        document.getElementById('playerLoading').classList.add('active');
        audio.src = audioUrl(state.book, state.chapter, true);  // single=true → buscable
        const seek = () => {
            try { audio.currentTime = Math.min(seconds, (audio.duration && isFinite(audio.duration)) ? audio.duration - 0.3 : seconds); } catch (e) {}
            audio.removeEventListener('loadedmetadata', seek);
        };
        audio.addEventListener('loadedmetadata', seek);
        try { await audio.play(); }
        catch (e) {
            if (e.name === 'AbortError') return;
            startPlaying();
        }
    }

    function togglePlay() {
        if (!state.book) return showToast('Primero selecciona un capítulo');

        // En Modo Enfoque nunca mostrar el modal (está tapado por el overlay z-4000).
        // Siempre reproducción continua: el usuario quiere orar/meditar sin interrupciones.
        if (focusNarration && !playbackMode) {
            playbackMode = 'continue';
            updateNavModeIndicator();
        }

        // Primera reproducción fuera del Modo Enfoque: preguntar qué modo prefiere
        if (!playbackMode && (!audio.src || audio.ended || audio.paused) && audio.currentTime === 0) {
            pendingPlayAction = () => {
                if (!audio.src || audio.ended) startPlaying();
                else if (audio.paused) audio.play().catch(() => startPlaying());
            };
            openPlaybackModeModal(false);
            return;
        }

        if (!audio.src || audio.ended) startPlaying();
        else if (audio.paused) audio.play().catch(() => startPlaying());
        else audio.pause();
    }

    let chapterTransitioning = false;

    // Pre-carga el siguiente capítulo en el elemento <audio> en stand-by.
    function preloadNextChapter() {
        const eMode = effectiveMode();
        if (eMode === 'single') return;
        if (!state.book) return;
        // Con streaming el servidor ya concatena los capítulos: no precargar
        if (audio.src && audio.src.includes('/stream/')) return;
        const next = getNextChapterInfo(eMode);
        if (!next) { preloadedFor = null; return; }
        if (preloadedFor && preloadedFor.book === next.book && preloadedFor.chapter === next.chapter) return;
        const url = audioUrl(next.book, next.chapter);
        try {
            audioPreload.src = url;
            audioPreload.load();
            preloadedFor = { book: next.book, chapter: next.chapter };
        } catch(e) {}
    }

    // Intercambia roles: el que estaba precargando pasa a ser el activo.
    function swapAudioElements() {
        const t = audio;
        audio = audioPreload;
        audioPreload = t;
        // Resetear el ahora-stand-by para liberar memoria
        try { audioPreload.pause(); audioPreload.removeAttribute('src'); audioPreload.load(); } catch(e) {}
        preloadedFor = null;
    }

    function initAudioEvents() {
        // Bindear handlers a AMBOS elementos. Cada handler ignora eventos
        // que no provengan del elemento activo (`this !== audio`).
        [audioA, audioB].forEach(el => {
            el.addEventListener('play', function() {
                // Si arranca la Biblia, callar el podcast (un solo audio a la vez)
                try { document.getElementById('podcastAudio').pause(); } catch (e) {}
                if (this !== audio) return;
                this.playbackRate = playbackSpeed;   // src nuevo resetea playbackRate → reaplicar
                chapterTransitioning = false;
                updatePlayUI(true);
                setupMediaSession();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                // Iniciar pre-carga del próximo capítulo en cuanto este arranca
                preloadNextChapter();
                if (window.Focus) {
                    Focus.onNarration(true);
                    // Arrancar tracker de display si estamos en modo streaming + Enfoque
                    if (focusNarration && audio.src && audio.src.includes('/stream/')) {
                        Focus.startStreamTrack();
                    }
                }
            });
            el.addEventListener('pause', function() {
                if (this !== audio) return;
                updatePlayUI(false);
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                if (window.Focus) Focus.onNarration(false);
            });
            el.addEventListener('ended', function() {
                if (this !== audio) return;
                if (chapterTransitioning) { chapterTransitioning = false; return; }
                updatePlayUI(false);
                handleChapterEnded();
            });
            el.addEventListener('timeupdate', function() {
                if (this !== audio) return;
                if (!audio.duration) return;
                document.getElementById('playerProgressFill').style.width = (audio.currentTime / audio.duration * 100) + '%';
                document.getElementById('playerTime').textContent = formatTime(audio.currentTime);
                const _bf = document.getElementById('bibProgFill'); if (_bf) _bf.style.width = (audio.currentTime / audio.duration * 100) + '%';
                const _bc = document.getElementById('bibCur'); if (_bc) _bc.textContent = formatTime(audio.currentTime);
                const _bt = document.getElementById('bibTot'); if (_bt) _bt.textContent = isFinite(audio.duration) ? formatTime(audio.duration) : 'EN VIVO';
                // Transición preventiva 0.4s antes del final (solo para capítulos individuales)
                if (!chapterTransitioning && effectiveMode() !== 'single' && !audio.src?.includes('/stream/')) {
                    const remaining = audio.duration - audio.currentTime;
                    if (remaining > 0 && remaining < 0.4) {
                        chapterTransitioning = true;
                        handleChapterEnded();
                    }
                }
                // Tracker de capítulo en display para Modo Enfoque con streaming
                if (focusNarration && window.Focus) Focus.tickStreamTrack(audio.currentTime);
            });
            el.addEventListener('canplay', function() {
                if (this !== audio) return;
                document.getElementById('playerLoading').classList.remove('active');
            });
            el.addEventListener('error', function() {
                if (this !== audio) return;
                if (chapterTransitioning) return;
                showToast('⚠️ No se pudo cargar el audio de este capítulo');
                hidePlayerBar(); updatePlayUI(false);
                const pb = document.getElementById('playBtn'); if(pb){pb.disabled=false;pb.innerHTML='🔊 Escuchar';}
            });
        });
    }

    // ════════════════════════════════════════════════════════════════
    // Lógica de auto-avance
    // ════════════════════════════════════════════════════════════════
    function handleChapterEnded() {
        const mode = effectiveMode();
        if (mode === 'single') {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            hidePlayerBar();
            return;
        }
        // Cuando se usa streaming, el evento 'ended' significa que el libro (o
        // toda la Biblia en modo 'full') terminó — no avanzar capítulos: el stream
        // ya los incluyó todos. En Modo Enfoque la música ambiente sigue sonando.
        if (audio.src && audio.src.includes('/stream/')) {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            const msg = mode === 'full' ? '🎉 ¡Has terminado toda la Biblia!' : '🎉 ¡Has terminado el libro completo!';
            showToast(msg);
            if (!focusNarration) hidePlayerBar();
            return;
        }
        const next = getNextChapterInfo(mode);
        if (!next) {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            showToast('🎉 ¡Has terminado el libro completo!');
            hidePlayerBar();
            return;
        }
        // Mantener playbackState='playing' y actualizar metadata ANTES de la
        // transición para que el OS no cierre la sesión de audio.
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: next.book,
                    artist: 'Sonido de Vida',
                    album: getTranslationLabel(),
                    artwork: [
                        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
                    ],
                });
            } catch(e) {}
        }
        // Si el próximo capítulo ya está precargado en audioPreload → swap y
        // play() instantáneo (sin esperar red). Esto es lo que mantiene viva
        // la sesión de audio en iOS/Android con pantalla bloqueada.
        const useSwap = preloadedFor && preloadedFor.book === next.book && preloadedFor.chapter === next.chapter && audioPreload.readyState >= 2;
        if (useSwap) {
            swapAudioElements();
            try { audio.currentTime = 0; } catch(e) {}
            const p = audio.play();
            if (p) p.catch(e => {
                if (e.name !== 'AbortError') return;
                audio.play().catch(() => {});
            });
        } else {
            // Fallback: precarga no lista — cargar src en el activo
            audio.src = audioUrl(next.book, next.chapter);
            const p = audio.play();
            if (p) p.catch(e => {
                if (e.name !== 'AbortError') return;
                audio.play().catch(() => {});
            });
        }
        // Actualizar DOM y estado (sin tocar el audio)
        loadChapter({ book: next.book, chapter: next.chapter, skipAudio: true, silent: true });
    }

    // Devuelve { book, chapter } o null si no hay siguiente según el modo
    function getNextChapterInfo(mode) {
        if (!state.book) return null;
        const totalChapters = getActiveBible()[state.book]?.length || 0;
        // Si hay siguiente capítulo en este libro → siempre lo damos
        if (state.chapter < totalChapters) {
            return { book: state.book, chapter: state.chapter + 1 };
        }
        // Estamos en el último capítulo del libro:
        if (mode === 'full') {
            // Saltar al primer capítulo del siguiente libro disponible
            const available = Object.keys(getActiveBible());
            const ordered = BIBLE_ORDER.filter(b => available.includes(b))
                            .concat(available.filter(b => !BIBLE_ORDER.includes(b)).sort());
            const idx = ordered.indexOf(state.book);
            if (idx >= 0 && idx < ordered.length - 1) {
                return { book: ordered[idx + 1], chapter: 1 };
            }
        }
        // 'continue' al terminar un libro se detiene; 'single' nunca llega aquí
        return null;
    }

    // Devuelve { book, chapter } o null. Solo retrocede dentro del libro actual.
    function getPrevChapterInfo() {
        if (!state.book) return null;
        if (state.chapter > 1) {
            return { book: state.book, chapter: state.chapter - 1 };
        }
        // Primer capítulo: ofrecer último capítulo del libro anterior
        const available = Object.keys(getActiveBible());
        const ordered = BIBLE_ORDER.filter(b => available.includes(b))
                        .concat(available.filter(b => !BIBLE_ORDER.includes(b)).sort());
        const idx = ordered.indexOf(state.book);
        if (idx > 0) {
            const prevBook = ordered[idx - 1];
            return { book: prevBook, chapter: getActiveBible()[prevBook].length };
        }
        return null;
    }

    function goNextChapter() {
        const next = getNextChapterInfo(playbackMode || 'continue');
        if (!next) return showToast('Estás en el último capítulo');
        const wasPlaying = !audio.paused && audio.src;
        loadChapter({ book: next.book, chapter: next.chapter, autoplay: wasPlaying, silent: true });
    }

    function goPrevChapter() {
        const prev = getPrevChapterInfo();
        if (!prev) return showToast('Estás en el primer capítulo');
        const wasPlaying = !audio.paused && audio.src;
        loadChapter({ book: prev.book, chapter: prev.chapter, autoplay: wasPlaying, silent: true });
    }

    function updateChapterNavButtons() {
        const prevBtn = document.getElementById('prevChapterBtn');
        const nextBtn = document.getElementById('nextChapterBtn');
        const pPrevBtn = document.getElementById('playerPrevBtn');
        const pNextBtn = document.getElementById('playerNextBtn');
        const hasPrev = !!getPrevChapterInfo();
        const hasNext = !!getNextChapterInfo('full');  // mostrar como disponible si existe en absoluto
        if (prevBtn)  prevBtn.disabled  = !hasPrev;
        if (nextBtn)  nextBtn.disabled  = !hasNext;
        if (pPrevBtn) pPrevBtn.disabled = !hasPrev;
        if (pNextBtn) pNextBtn.disabled = !hasNext;
    }

    function updateNavModeIndicator() {
        const label = document.getElementById('navModeText');
        if (!label) return;
        if (!playbackMode) {
            label.textContent = 'Sin elegir';
        } else {
            label.textContent = PLAYBACK_MODES[playbackMode].short;
        }
    }

    function updatePlayerNextHint() {
        const el = document.getElementById('playerNextHint');
        if (!el) return;
        const mode = playbackMode || 'single';
        if (mode === 'single') { el.textContent = ''; return; }
        const next = getNextChapterInfo(mode);
        el.textContent = next ? `▸ Próximo: ${next.book} ${next.chapter}` : '';
    }

    function updatePlayUI(isPlaying) {
        document.getElementById('playIcon').style.display  = isPlaying ? 'none'  : 'block';
        document.getElementById('pauseIcon').style.display = isPlaying ? 'block' : 'none';
        document.getElementById('playerWave').classList.toggle('paused', !isPlaying);
        const pb = document.getElementById('playBtn');
        if (pb) { pb.disabled = false; pb.classList.toggle('playing', isPlaying); pb.innerHTML = isPlaying ? '⏸ Pausar' : '🔊 Escuchar'; }
        const _bpi = document.getElementById('bibPlayIcon'), _bpp = document.getElementById('bibPauseIcon');
        if (_bpi && _bpp) { _bpi.style.display = isPlaying ? 'none' : 'block'; _bpp.style.display = isPlaying ? 'block' : 'none'; }
    }

    function setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: state.book || 'Sonido de Vida',
            artist: 'Sonido de Vida',
            album: getTranslationLabel(),
            artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
        });
        navigator.mediaSession.setActionHandler('play',         () => audio.play());
        navigator.mediaSession.setActionHandler('pause',        () => audio.pause());
        navigator.mediaSession.setActionHandler('stop',         () => { audio.pause(); audio.currentTime = 0; });
        navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
        navigator.mediaSession.setActionHandler('seekforward',  () => { audio.currentTime = Math.min(audio.duration||0, audio.currentTime + 15); });
        // Navegar entre capítulos desde lockscreen / auriculares
        try { navigator.mediaSession.setActionHandler('previoustrack', () => goPrevChapter()); } catch(e){}
        try { navigator.mediaSession.setActionHandler('nexttrack',     () => goNextChapter()); } catch(e){}
    }

    function showPlayerBar() {
        document.getElementById('playerRef').textContent = `${state.book} — Capítulo ${state.chapter}`;
        document.getElementById('playerSub').textContent = `${getTranslationLabel()} · Sonido de Vida`;
        document.getElementById('audioPlayerBar').classList.add('visible');
        updatePlayerNextHint();
        updateChapterNavButtons();
    }
    function hidePlayerBar() {
        document.getElementById('audioPlayerBar').classList.remove('visible');
        document.getElementById('playerProgressFill').style.width = '0%';
        document.getElementById('playerTime').textContent = '0:00';
        const _bf = document.getElementById('bibProgFill'); if (_bf) _bf.style.width = '0%';
        const _bc = document.getElementById('bibCur'); if (_bc) _bc.textContent = '0:00';
        const _bt = document.getElementById('bibTot'); if (_bt) _bt.textContent = '0:00';
    }
    function closePlayer() { audio.pause(); audio.removeAttribute('src'); audio.load(); updatePlayUI(false); hidePlayerBar(); }
    function seekAudio(e) {
        if (!audio.duration) return;
        const r = document.getElementById('playerProgress').getBoundingClientRect();
        audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
    }

    // ════════════════════════════════════════════════════════════════
    // Fondo del Modo Enfoque: DESACTIVADO el motor de "motas/luciérnagas".
    // Saturaban el fondo y tapaban el entorno visual (estrellas/lluvia/nubes).
    // Ahora el fondo es solo gradiente + aura suave + el entorno de FocusEnv.
    // Se deja el módulo como no-op para no tocar sus llamadas (start/stop/…).
    // ════════════════════════════════════════════════════════════════
    const FocusFX = (function () {
        const _mc = document.getElementById('focusMotes');
        if (_mc) _mc.remove();
        return { start(){}, stop(){}, retint(){}, theme(){} };
    })();
    const _FocusFX_dead = (function () {
        const canvas  = document.getElementById('focusMotes');
        const overlay = document.getElementById('focusOverlay');
        if (!canvas || !overlay) return { start(){}, stop(){}, retint(){}, theme(){} };
        const ctx = canvas.getContext('2d');
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let motes = [], W = 0, H = 0, raf = 0, running = false, t = 0, rgb = '201,168,76';
        const pointer = { x: .5, y: .5, active: false };
        // Cada fondo visual define un "movimiento" de partículas distinto:
        //  rise = motas que suben (aurora/amanecer), twinkle = estrellas que titilan
        //  en su sitio (noche), embers = brasas lentas y grandes, pocas (vela).
        const BG_FX = {
            aurora:   { motion:'rise',    density:1,   rMul:1   },
            noche:    { motion:'twinkle', density:1.3, rMul:1   },
            amanecer: { motion:'rise',    density:1,   rMul:1   },
            vela:     { motion:'embers',  density:.5,  rMul:1.8 },
        };
        let motion = 'rise', dens = 1, rMul = 1;
        function readColor() { rgb = (getComputedStyle(overlay).getPropertyValue('--f-mote').trim()) || '201,168,76'; }
        function applyTheme() {
            const cfg = BG_FX[overlay.dataset.bg] || BG_FX.aurora;
            motion = cfg.motion; dens = cfg.density; rMul = cfg.rMul;
            readColor();
        }
        function resize() {
            const dpr = Math.min(devicePixelRatio || 1, 2);
            W = canvas.width = innerWidth * dpr; H = canvas.height = innerHeight * dpr;
            canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        const rnd = (a, b) => a + Math.random() * (b - a);
        function spawn(initial, anyY) {
            return { x: rnd(0, innerWidth), y: (initial || anyY) ? rnd(0, innerHeight) : innerHeight + 10,
                r: rnd(.8, 2.6), sp: rnd(.15, .55), sway: rnd(.3, 1.1), phase: rnd(0, Math.PI * 2), a: rnd(.25, .8) };
        }
        function seed() {
            const count = Math.round(Math.min(innerWidth, 520) / 9 * dens);
            // En "twinkle" las estrellas no suben: se reparten por toda la pantalla.
            motes = []; for (let i = 0; i < count; i++) motes.push(spawn(true, motion === 'twinkle'));
        }
        function dot(x, y, r, alpha) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
            g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
        }
        function frame() {
            if (!running) return;
            t += 0.016;
            ctx.clearRect(0, 0, innerWidth, innerHeight);
            for (const m of motes) {
                if (motion === 'twinkle') {
                    // Estrellas: quietas en su sitio, parpadeo amplio.
                    m.phase += 0.02;
                    const tw = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.6 + m.phase));
                    dot(m.x, m.y, m.r * rMul, m.a * tw);
                    continue;
                }
                m.y -= (motion === 'embers' ? m.sp * 0.45 : m.sp); m.phase += 0.01;
                let x = m.x + Math.sin(m.phase) * m.sway * 8;
                if (pointer.active) {
                    const dx = pointer.x * innerWidth - x, dy = pointer.y * innerHeight - m.y, d = Math.hypot(dx, dy);
                    if (d < 160) x += dx / d * (160 - d) * 0.02;
                }
                const flick = 0.7 + Math.sin(t * 2 + m.phase) * 0.3;
                dot(x, m.y, m.r * rMul, m.a * flick);
                if (m.y < -10) Object.assign(m, spawn(false));
            }
            raf = requestAnimationFrame(frame);
        }
        function onMove(e) { pointer.x = e.clientX / innerWidth; pointer.y = e.clientY / innerHeight; pointer.active = true; }
        function onLeave() { pointer.active = false; }
        function onVisibility() { if (document.hidden) stop(true); else if (overlay.classList.contains('open')) start(); }

        function start() {
            applyTheme();
            if (running) return;
            resize(); seed();
            if (reduce) {   // estático: una sola pasada, sin loop
                ctx.clearRect(0, 0, innerWidth, innerHeight);
                for (const m of motes) { ctx.fillStyle = `rgba(${rgb},${m.a})`; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * rMul, 0, Math.PI * 2); ctx.fill(); }
                return;
            }
            running = true;
            addEventListener('resize', resize); addEventListener('pointermove', onMove); addEventListener('pointerleave', onLeave);
            document.addEventListener('visibilitychange', onVisibility);
            raf = requestAnimationFrame(frame);
        }
        function stop(soft) {
            running = false; cancelAnimationFrame(raf);
            removeEventListener('resize', resize); removeEventListener('pointermove', onMove); removeEventListener('pointerleave', onLeave);
            if (!soft) document.removeEventListener('visibilitychange', onVisibility);
            ctx.clearRect(0, 0, innerWidth, innerHeight);
        }
        function retint() { readColor(); }
        // Re-aplica el tema visual elegido (color + movimiento + densidad) en
        // caliente, resembrando las partículas. Si el overlay está cerrado, nada.
        function theme() {
            applyTheme();
            if (!overlay.classList.contains('open')) return;
            resize(); seed();
            if (!running) {   // prefers-reduced-motion: redibujo estático
                ctx.clearRect(0, 0, innerWidth, innerHeight);
                for (const m of motes) { ctx.fillStyle = `rgba(${rgb},${m.a})`; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * rMul, 0, Math.PI * 2); ctx.fill(); }
            }
        }
        return { start, stop, retint, theme };
    })();

    // ════════════════════════════════════════════════════════════════
    // Racha diaria del Modo Enfoque (retención). Cuenta días CONSECUTIVOS
    // en que el usuario inicia una sesión. 100% local (localStorage), sin
    // backend: es un detalle ligero, no dato crítico. Fecha en hora local.
    // ════════════════════════════════════════════════════════════════
    const FocusStreak = (function () {
        const KEY = 'sdv-focus-streak';
        const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000);
        function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
        function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
        function render(s) {
            const el = document.getElementById('focusStreak');
            if (!el) return;
            const c = s.count || 0;
            if (c <= 0) { el.hidden = true; return; }
            el.hidden = false;
            el.innerHTML = `🔥 ${c} ${c === 1 ? 'día' : 'días'} seguidos` + (s.best && s.best > c ? ` <small>· récord ${s.best}</small>` : '');
        }
        // Marca el día de hoy. Devuelve {count,best,sameDay,advanced,restarted}.
        function mark() {
            const s = load(), t = today(), prev = s.count || 0;
            const out = { count: prev, best: s.best || 0, sameDay: false, advanced: false, restarted: false };
            if (s.last === t) { out.sameDay = true; render(s); return out; }
            if (s.last && dayDiff(s.last, t) === 1) { s.count = prev + 1; out.advanced = true; }
            else { s.count = 1; out.restarted = prev > 1; }
            s.best = Math.max(s.best || 0, s.count); s.last = t; save(s);
            render(s); return Object.assign(out, { count: s.count, best: s.best });
        }
        function refresh() { render(load()); }
        return { mark, refresh, get: load };
    })();

    // ════════════════════════════════════════════════════════════════
    // Premium: suscripción con Stripe ($2.99/mes · $24.99/año · 7 días gratis)
    // ════════════════════════════════════════════════════════════════
    window.Premium = (function () {
        let plan = 'annual';   // plan seleccionado en el muro (anual por defecto)
        let busy = false;
        let pending = false;   // el usuario quería pagar pero aún no tenía sesión

        // Selector mensual/anual en los muros (#focusPlanToggle, #podPlanToggle).
        function selectPlan(p, btn) {
            plan = (p === 'monthly') ? 'monthly' : 'annual';
            if (btn && btn.parentElement) {
                btn.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
            }
        }

        function logged() { return !!(window.SDV_Auth && SDV_Auth.user); }

        // Inicia el checkout de Stripe. Si no hay sesión, abre el alta de cuenta.
        async function checkout(p) {
            if (p) plan = (p === 'monthly') ? 'monthly' : 'annual';
            if (!logged()) {
                pending = true;   // reanudar el pago en cuanto inicie sesión
                if (window.SDV_Account) SDV_Account.open();
                return;
            }
            if (busy) return;
            busy = true;
            if (window.showToast) showToast('Abriendo pago seguro…');
            try {
                const r = await SDV_Auth.checkout(plan);
                if (r.ok && r.data && r.data.url) { window.location.href = r.data.url; return; }
                if (r.status === 503) showToast('Los pagos se activan muy pronto. ¡Gracias por tu paciencia! 🙏');
                else showToast('No se pudo abrir el pago. Intenta de nuevo en un momento. 🙏');
            } catch (e) {
                if (window.showToast) showToast('No se pudo abrir el pago. Revisa tu conexión.');
            } finally { busy = false; }
        }

        // Portal de Stripe: cancelar, cambiar tarjeta o plan.
        async function manage() {
            if (!logged()) { if (window.SDV_Account) SDV_Account.open(); return; }
            if (window.showToast) showToast('Abriendo tu suscripción…');
            try {
                const r = await SDV_Auth.portal();
                if (r.ok && r.data && r.data.url) { window.location.href = r.data.url; return; }
                showToast(r.status === 404 ? 'No encontramos una suscripción activa.' : 'No se pudo abrir la gestión.');
            } catch (e) { if (window.showToast) showToast('No se pudo abrir la gestión.'); }
        }

        // Al volver de Stripe (?checkout=success|cancel): avisa y refresca premium.
        function checkReturn() {
            let c;
            try { c = new URLSearchParams(window.location.search).get('checkout'); } catch (e) { return; }
            if (!c) return;
            try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
            if (c === 'success') {
                if (window.showToast) showToast('🎉 ¡Bienvenido a Premium! Tu prueba de 7 días ya está activa.');
                // El webhook puede tardar unos segundos: reintenta refrescar el estado.
                let tries = 0;
                const tick = () => {
                    if (window.SDV_Auth && SDV_Auth.refresh) {
                        SDV_Auth.refresh().then((isPrem) => {
                            if (!isPrem && ++tries < 5) setTimeout(tick, 2000);
                        });
                    } else if (++tries < 5) setTimeout(tick, 2000);
                };
                setTimeout(tick, 1500);
            } else if (c === 'cancel') {
                if (window.showToast) showToast('Pago cancelado. Puedes intentarlo cuando quieras. 💛');
            }
        }

        // Tras iniciar sesión, si el usuario venía a pagar, reanuda el checkout.
        function resumeIfPending() {
            if (pending && logged()) { pending = false; checkout(); }
        }

        // ── Cupón de regalo (Modo Enfoque gratis, sin Stripe) ────────────
        // Muestra/oculta el campo del código dentro del teaser.
        function toggleCoupon() {
            const box = document.getElementById('focusCouponBox');
            if (!box) return;
            box.hidden = !box.hidden;
            if (!box.hidden) { const i = document.getElementById('focusCouponInput'); if (i) i.focus(); }
        }

        // Canjea el código: exige cuenta (el cupón se ata al uid), concede el
        // mes gratis en el servidor y abre el Modo Enfoque al terminar.
        async function redeem() {
            const input = document.getElementById('focusCouponInput');
            const code = ((input && input.value) || '').trim();
            if (!code) { if (window.showToast) showToast('Escribe tu código 🎁'); return; }
            if (!logged()) {
                if (window.showToast) showToast('Crea tu cuenta o entra para activar tu código 👤');
                if (window.SDV_Account) SDV_Account.open();
                return;
            }
            if (busy) return;
            busy = true;
            const btn = document.getElementById('focusCouponBtn');
            if (btn) { btn.disabled = true; btn.textContent = 'Canjeando…'; }
            try {
                const r = await SDV_Auth.redeemCoupon(code);
                if (r.ok && r.data && (r.data.premium || r.data.already_premium)) {
                    if (window.SDV_Auth && SDV_Auth.refresh) await SDV_Auth.refresh();
                    if (window.Focus) { Focus.closeTeaser(); if (Focus.refreshGate) Focus.refreshGate(); }
                    if (input) input.value = '';
                    if (r.data.already_premium) {
                        if (window.showToast) showToast('💛 Ya tienes Premium activo');
                    } else {
                        if (window.showToast) showToast('🎉 ¡Código activado! Un mes de Modo Enfoque gratis.');
                        if (window.Focus && Focus.enter) setTimeout(() => Focus.enter(), 500);
                    }
                } else {
                    const msg = (r.data && (r.data.error || r.data.msg)) || 'Ese código no es válido';
                    if (window.showToast) showToast('😕 ' + msg);
                }
            } catch (e) {
                if (window.showToast) showToast('No se pudo canjear. Revisa tu conexión.');
            } finally {
                busy = false;
                if (btn) { btn.disabled = false; btn.textContent = 'Canjear'; }
            }
        }

        return { selectPlan, checkout, manage, checkReturn, resumeIfPending, toggleCoupon, redeem };
    })();

    // ════════════════════════════════════════════════════════════════
    // Modo Enfoque (premium): música ambiente bajo la narración + mezclador
    // ════════════════════════════════════════════════════════════════
    const Focus = (function () {
        const overlay   = document.getElementById('focusOverlay');
        const ambientEl = document.getElementById('ambientAudio');
        // Catálogo de ambientes. `contentId` = id en content_items (D1) servido
        // por el portero premium (/api/content/:id). Si es null, el chip sale
        // como "pronto". Los archivos viven en el bucket privado sdv-premium.
        // Cada "ambiente" es un mood con 2+ variantes (ids de content_items).
        // Al elegirlo se barajan y van rotando con un fundido suave, para que
        // nunca suene "una sola canción" en bucle.
        const ambients = [
            { id:'cuerdas-terciopelo', cat:'cuerdas',  label:'Cuerdas Suaves',      emoji:'🎻', ids:[43,40,41,42] },
            { id:'orquesta-niebla',    cat:'cuerdas',  label:'Cuerdas Celestiales', emoji:'🎶', ids:[58,57] },
            { id:'calma',              cat:'paz',      label:'Paz y Quietud',        emoji:'🕊️', ids:[37,36,9] },
            { id:'paz-abraza',         cat:'paz',      label:'Paz que Abraza',       emoji:'🤍', ids:[11,59] },
            { id:'paz-suspiros',       cat:'paz',      label:'Aliento de Paz',       emoji:'🌬️', ids:[62,61,60] },
            { id:'seda-suave',         cat:'paz',      label:'Calma Profunda',       emoji:'🌾', ids:[66,65] },
            { id:'aliento-agua',       cat:'paz',      label:'Aguas Tranquilas',     emoji:'💧', ids:[34,33] },
            { id:'corrientes-calidas', cat:'paz',      label:'Aguas Cálidas',        emoji:'🌊', ids:[39,38] },
            { id:'luz-violeta',        cat:'paz',      label:'Luz del Alba',         emoji:'🌅', ids:[47,46] },
            { id:'corazon-calma',      cat:'paz',      label:'Corazón en Calma',     emoji:'💗', ids:[99,100] },
            { id:'salmos-reposo',      cat:'salmos',   label:'Salmos de Reposo',     emoji:'📜', ids:[79,80,81,82] },
            { id:'salmo-oracion',      cat:'salmos',   label:'Salmo en Oración',     emoji:'🙏', ids:[83,84] },
            { id:'salmo-luz',          cat:'salmos',   label:'Salmo de Luz',         emoji:'✨', ids:[85,86] },
            { id:'salmos-oceano',      cat:'salmos',   label:'Salmos en Calma',      emoji:'📜', ids:[12,32] },
            { id:'meditacion',         cat:'reposo',   label:'Reposo del Alma',      emoji:'🕊️', ids:[52,51] },
            { id:'relajacion',         cat:'reposo',   label:'Descanso',             emoji:'🍃', ids:[63,64] },
            { id:'medianoche-agua',    cat:'reposo',   label:'Noche Serena',         emoji:'🌙', ids:[50,49,35] },
            { id:'deriva-umbral',      cat:'reposo',   label:'Niebla Suave',         emoji:'🌫️', ids:[45,44] },
            { id:'compas-agua',        cat:'reposo',   label:'Compás del Agua',      emoji:'💧', ids:[91,92] },
            { id:'corriente-seda',     cat:'reposo',   label:'Corriente de Seda',    emoji:'🌊', ids:[101,102] },
            { id:'nube-segura',        cat:'adoracion',label:'Bajo Sus Alas',        emoji:'☁️', ids:[54,53] },
            { id:'oceano-altares',     cat:'adoracion',label:'Santuario',            emoji:'✝️', ids:[56,55] },
            { id:'incienso',           cat:'incienso', label:'Incienso',             emoji:'🕯️', ids:[93,94] },
            { id:'incienso-sagrado',   cat:'incienso', label:'Incienso Sagrado',     emoji:'🪔', ids:[95,96] },
            { id:'luz-oracion',        cat:'incienso', label:'Luz de Oración',       emoji:'💛', ids:[97,98] },
            { id:'cancion-cuna',       cat:'incienso', label:'Canción de Cuna',      emoji:'🌙', ids:[87,88] },
            { id:'flauta-serena',      cat:'incienso', label:'Flauta Serena',        emoji:'🎐', ids:[89,90] },
        ];
        const CAT_LABELS = { cuerdas:'🎻 Cuerdas', paz:'🕊️ Paz y Quietud', salmos:'📜 Salmos', reposo:'🌙 Reposo', adoracion:'✨ Adoración', incienso:'🪔 Incienso' };
        const CAT_ORDER  = ['cuerdas', 'paz', 'salmos', 'reposo', 'adoracion', 'incienso'];

        // Segundo elemento de audio para fundir entre variantes/ambientes sin silencio.
        const ambientElB = document.createElement('audio');
        ambientElB.setAttribute('playsinline', '');
        ambientEl.parentNode.insertBefore(ambientElB, ambientEl.nextSibling);

        let vozVol = 1, musicaVol = 0.55;
        let currentAmbient = null, timerId = null, loading = false;
        // Fundido de sueño: multiplicador maestro (1 = normal, 0 = silencio) que
        // baja en los últimos minutos del temporizador. Va dentro de musicTarget()
        // y applyVolumes() para que los crossfades de rotación respeten el fundido
        // en vez de pelearse con él. SLEEP_FADE_MS = duración del fundido final.
        let sleepGain = 1, sleepFadeTimer = null, sleepFadeInt = null;
        const SLEEP_FADE_MS = 180000;   // 3 min
        // Motor de ambiente: elemento activo + en espera, lista barajada de variantes,
        // caché de blobs (para no re-descargar al rotar) y guardas de fundido.
        let ambCur = ambientEl, ambNext = ambientElB;
        let ambPlaylist = [], ambPos = 0, ambToken = 0;
        let crossing = false;
        let shuffleAuto = false;
        let pendingHopId = null;   // id del próximo ambiente al azar ya precargado (salto sin silencio)
        // Historial de los últimos ambientes usados: se excluyen al elegir al azar
        // para que NUNCA empiece igual y la variedad se note de verdad entre sesiones.
        const AMBIENT_HISTORY = 8;
        let recentAmbients = (() => { try { return JSON.parse(localStorage.getItem('sdv-focus-recent')) || []; } catch (e) { return []; } })();
        function rememberAmbient(id) {
            recentAmbients = recentAmbients.filter(x => x !== id);
            recentAmbients.push(id);
            recentAmbients = recentAmbients.slice(-AMBIENT_HISTORY);
            try { localStorage.setItem('sdv-focus-recent', JSON.stringify(recentAmbients)); } catch (e) {}
        }
        let _pauseTimer = null;   // debounce: ignora micro-pauses del stream entre libros
        const blobCache = new Map();   // contentId -> objectURL
        const CROSSFADE_MS = 1400;

        function premiumReady() {
            return !!(window.SDV_Auth && SDV_Auth.enabled && SDV_Auth.user && SDV_Auth.premium);
        }
        // El oído percibe el volumen de forma logarítmica: un control lineal
        // "no hace nada" hasta el final. Curva de audio (taper) para que el
        // deslizador cambie el volumen de forma pareja en todo su recorrido.
        const taper = x => x * x;
        const musicTarget = () => taper(musicaVol) * sleepGain;
        let rotating = false;
        function applyVolumes() {
            audioA.volume = taper(vozVol) * sleepGain; audioB.volume = taper(vozVol) * sleepGain;
            if (!crossing) ambCur.volume = musicTarget();   // en pleno fundido se controla a mano
        }
        function shuffle(arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
            return a;
        }

        function renderAmbients() {
            const box = document.getElementById('focusAmbients');
            if (!box) return;   // lista avanzada retirada del diseño; categorías + aleatorio la sustituyen
            box.innerHTML = '';
            const shuf = document.createElement('button');
            shuf.className = 'focus-shuffle' + (shuffleAuto ? ' active' : '');
            shuf.innerHTML = shuffleAuto
                ? '🔀 Aleatorio automático · activado'
                : '🔀 Ambiente al azar · todas las categorías';
            shuf.onclick = shuffleAll;
            box.appendChild(shuf);
            CAT_ORDER.forEach(cat => {
                const items = ambients.filter(a => a.cat === cat);
                if (!items.length) return;
                const group = document.createElement('div');
                group.className = 'focus-cat';
                const h = document.createElement('div');
                h.className = 'focus-cat-label';
                h.textContent = CAT_LABELS[cat] || cat;
                group.appendChild(h);
                const row = document.createElement('div');
                row.className = 'focus-cat-row';
                items.forEach(a => {
                    const b = document.createElement('button');
                    b.className = 'focus-chip' + (currentAmbient === a.id ? ' active' : '');
                    b.dataset.ambient = a.id;
                    b.innerHTML = `<span>${a.emoji}</span> ${a.label}`;
                    b.onclick = () => selectAmbient(a.id);
                    row.appendChild(b);
                });
                group.appendChild(row);
                box.appendChild(group);
            });
        }
        function markChips() {
            document.querySelectorAll('#focusAmbients .focus-chip').forEach(c => {
                c.classList.toggle('active', c.dataset.ambient === currentAmbient);
                c.classList.toggle('loading', loading && c.dataset.ambient === currentAmbient);
            });
            if (window.FocusCats) FocusCats.refresh();
        }

        // Descarga (con caché en sesión) el blob de una variante premium.
        async function loadBlob(contentId) {
            if (blobCache.has(contentId)) return blobCache.get(contentId);
            const url = await SDV_Auth.loadContentBlob(contentId);
            blobCache.set(contentId, url);
            return url;
        }
        // Funde el volumen de un elemento de `from` a `to` en `ms`.
        // IMPORTANTE: usa setInterval, NO requestAnimationFrame. Con la pantalla
        // bloqueada el navegador CONGELA rAF → el fundido se quedaba a medias,
        // `crossing` nunca volvía a false y la música ambiente enmudecía hasta
        // reabrir la app. setInterval sí corre en segundo plano (limitado a ~1s),
        // y como medimos el progreso con el reloj real, el fundido SIEMPRE termina.
        function fade(el, from, to, ms) {
            return new Promise(resolve => {
                from = Math.max(0, Math.min(1, from));
                to   = Math.max(0, Math.min(1, to));
                try { el.volume = from; } catch (e) {}
                const t0 = performance.now();
                const id = setInterval(() => {
                    const k = Math.min(1, (performance.now() - t0) / ms);
                    try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
                    if (k >= 1) { clearInterval(id); resolve(); }
                }, 50);
            });
        }
        // Pone `url` en el elemento en espera y lo funde con el activo: nunca hay silencio.
        async function crossfadeTo(url) {
            const incoming = ambNext;
            incoming.src = url;
            incoming.loop = (ambPlaylist.length === 1);
            incoming.playbackRate = 1;
            incoming.volume = 0;
            try { await incoming.play(); } catch (e) {}
            const outgoing = ambCur;
            ambCur = incoming; ambNext = outgoing;   // el entrante ya es el activo
            crossing = true;
            const tgt = musicTarget();
            const fadeOut = (outgoing.src && !outgoing.paused) ? fade(outgoing, outgoing.volume, 0, CROSSFADE_MS) : Promise.resolve();
            await Promise.all([fade(incoming, 0, tgt, CROSSFADE_MS), fadeOut]);
            try { outgoing.pause(); outgoing.removeAttribute('src'); outgoing.load(); } catch (e) {}
            crossing = false;
            incoming.volume = tgt;
        }
        // Elige un id de ambiente al azar, evitando el actual y el último usado
        // (para que nunca "empiece siempre por lo mismo" ni se repita al saltar).
        function randomAmbientId() {
            const blocked = new Set(recentAmbients);
            blocked.add(currentAmbient);
            let pool = ambients.filter(a => !blocked.has(a.id));
            if (!pool.length) pool = ambients.filter(a => a.id !== currentAmbient);
            if (!pool.length) pool = ambients.slice();
            const pick = pool[Math.floor(Math.random() * pool.length)];
            return pick ? pick.id : null;
        }
        function preloadNextVariant() {
            if (ambPlaylist.length <= 1) return;
            const n = (ambPos + 1) % ambPlaylist.length;
            // Si toca saltar a otro ambiente (shuffleAuto al cerrar la lista),
            // precarga su PRIMERA pista para que el salto sea sin silencio.
            if (shuffleAuto && n === 0) {
                pendingHopId = randomAmbientId();
                const a = ambients.find(x => x.id === pendingHopId);
                if (a) loadBlob(a.ids[0]).catch(() => {});
                return;
            }
            pendingHopId = null;
            loadBlob(ambPlaylist[n]).catch(() => {});
        }
        // Rota a la siguiente variante del mismo ambiente (con fundido).
        // Si shuffleAuto está activo y la lista de variantes se termina, salta a
        // un ambiente completamente distinto (ya precargado) sin silencio.
        async function rotateNext() {
            if (rotating || crossing || loading || ambPlaylist.length <= 1) return;
            rotating = true;
            try {
                const nextPos = (ambPos + 1) % ambPlaylist.length;
                if (shuffleAuto && nextPos === 0) {
                    // OJO: NO soltamos `rotating` aquí. Si lo hiciéramos, la pista
                    // actual terminaría (evento 'ended') durante la descarga del
                    // salto y dispararía otro rotateNext → dos fundidos a la vez →
                    // la música se traba y enmudece. La guarda se mantiene hasta
                    // que el nuevo ambiente está sonando.
                    await hopRandomAmbient();
                    return;
                }
                ambPos = nextPos;
                const url = await loadBlob(ambPlaylist[ambPos]);
                await crossfadeTo(url);
                preloadNextVariant();
            } catch (e) {} finally { rotating = false; }
        }
        // Salta a un ambiente al azar empezando por la pista ya precargada
        // (caché → instantáneo → sin silencio). Pensado para llamarse DENTRO de
        // rotateNext, con la guarda `rotating` aún puesta.
        async function hopRandomAmbient() {
            const id = pendingHopId || randomAmbientId();
            pendingHopId = null;
            const a = ambients.find(x => x.id === id);
            if (!a) return;
            const my = ++ambToken;
            currentAmbient = id;
            rememberAmbient(id);
            setEmblem(a);
            markChips();
            // Empezar por la pista precargada; el resto, barajado.
            const first = a.ids[0];
            ambPlaylist = [first, ...shuffle(a.ids.filter(x => x !== first))];
            ambPos = 0;
            const url = await loadBlob(ambPlaylist[0]);
            if (my !== ambToken) return;
            await crossfadeTo(url);
            preloadNextVariant();
        }

        async function selectAmbient(id) {
            const a = ambients.find(x => x.id === id);
            if (!a || !a.ids || !a.ids.length) return;
            if (currentAmbient === id) { stopAmbient(); return; }   // tocar de nuevo = apagar
            const my = ++ambToken;
            currentAmbient = id;
            rememberAmbient(id);
            setEmblem(a);
            const visibleIds = a.ids.slice();
            if (!visibleIds.length) {
                currentAmbient = null;
                showToast('⚠️ Todos los tracks de este ambiente están ocultos');
                loading = false; markChips(); return;
            }
            ambPlaylist = shuffle(visibleIds);
            ambPos = 0;
            loading = true; markChips();
            try {
                const url = await loadBlob(ambPlaylist[0]);
                if (my !== ambToken) return;   // el usuario cambió de ambiente mientras descargaba
                await crossfadeTo(url);
                // Si la narración ya estaba corriendo cuando cargó el blob (inicio en Con voz),
                // aseguramos que el ambiente siga sonando y cancelamos cualquier debounce de pausa.
                if (focusNarration && !audio.paused && overlay.classList.contains('open')) {
                    if (_pauseTimer) { clearTimeout(_pauseTimer); _pauseTimer = null; }
                    ambCur.play().catch(() => {});
                }
                preloadNextVariant();
            } catch (e) {
                if (my === ambToken) { currentAmbient = null; showToast('No se pudo cargar el ambiente'); }
            } finally {
                if (my === ambToken) { loading = false; markChips(); }
            }
        }
        // Elige un ambiente al azar de cualquier categoría (distinto del actual).
        function pickRandomAmbient() {
            const id = randomAmbientId();
            if (id) selectAmbient(id);
        }
        // Activa/desactiva el modo aleatorio automático: al activar elige un
        // ambiente al azar; al terminar la lista de variantes elige otro distinto.
        function shuffleAll() {
            shuffleAuto = !shuffleAuto;
            updateShuffleBtn();
            if (shuffleAuto) pickRandomAmbient();
        }
        // Alias público para el botón de aleatorio que ahora vive junto a la
        // música. Alterna el modo aleatorio automático (empieza siempre distinto).
        function toggleShuffleAuto() { shuffleAll(); }
        function updateShuffleBtn() {
            const btn = document.getElementById('fxShuffleBtn');
            if (!btn) return;
            btn.classList.toggle('active', shuffleAuto);
            btn.innerHTML = shuffleAuto
                ? '🔀 Aleatorio automático · activado'
                : '🔀 Aleatorio · empieza siempre distinto';
        }
        function stopAmbient() {
            ambToken++;                 // cancela cargas en vuelo
            if (_pauseTimer) { clearTimeout(_pauseTimer); _pauseTimer = null; }
            crossing = false; rotating = false;
            [ambientEl, ambientElB].forEach(el => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} });
            ambCur = ambientEl; ambNext = ambientElB;
            blobCache.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
            blobCache.clear();
            ambPlaylist = []; ambPos = 0;
            pendingHopId = null;
            currentAmbient = null;
            shuffleAuto = false;
            setEmblem(null);
            markChips();
            updateShuffleBtn();
        }
        // Refleja en la UI si hay música sonando: mueve el ecualizador de
        // "Reproduciendo ahora" y cambia el icono del botón de música (meditación).
        function _setMusicPlaying(on) {
            const now = document.getElementById('fxNow');
            if (now) now.classList.toggle('playing', !!on);
            const pi = document.getElementById('focusMusicPlayIcon');
            const pa = document.getElementById('focusMusicPauseIcon');
            if (pi) pi.style.display = on ? 'none'  : 'block';
            if (pa) pa.style.display = on ? 'block' : 'none';
        }
        // Pausa/reanuda la música (botón del modo Meditación). Si aún no hay
        // ambiente, arranca uno al azar.
        function toggleMusic() {
            if (!currentAmbient) { pickRandomAmbient(); return; }
            if (ambCur.paused) { ambCur.play().catch(() => {}); }
            else { try { ambientEl.pause(); ambientElB.pause(); } catch (e) {} }
        }
        // El estado real de reproducción manda sobre la UI: escuchamos play/pause
        // de ambos elementos de audio (cubre selección, crossfade, sueño y voz).
        [ambientEl, ambientElB].forEach(el => {
            el.addEventListener('play',  () => _setMusicPlaying(true));
            el.addEventListener('pause', () => { if (ambientEl.paused && ambientElB.paused) _setMusicPlaying(false); });
        });

        // Rotación automática entre variantes: fundir justo antes de que termine
        // la pista; si igual llega al final, saltar en seco como respaldo.
        [ambientEl, ambientElB].forEach(el => {
            el.addEventListener('timeupdate', () => {
                if (el !== ambCur || crossing || rotating || loading || ambPlaylist.length <= 1 || !el.duration) return;
                if (el.duration - el.currentTime < (CROSSFADE_MS / 1000 + 0.3)) rotateNext();
            });
            el.addEventListener('ended', () => {
                if (el !== ambCur) return;
                if (ambPlaylist.length <= 1) { try { el.currentTime = 0; el.play().catch(() => {}); } catch (e) {} return; }
                if (!crossing && !rotating && !loading) rotateNext();
            });
        });

        // Muestra la referencia (Libro Capítulo) sobre el emblema.
        function syncVerse() {
            const ref = document.getElementById('focusRef');
            if (!ref) return;
            ref.textContent = (state.book && state.chapter) ? `${state.book} ${state.chapter}` : 'Modo Enfoque';
        }

        // Emblema animado: reemplaza el texto que pasaba con el audio. Cambia de
        // icono según el ambiente y de color de brillo según su categoría.
        function setEmblem(ambient) {
            const icon = document.getElementById('focusEmblemIcon');
            const cap  = document.getElementById('focusEmblemCaption');
            const box  = document.getElementById('focusEmblem');
            if (!icon || !box) return;
            if (ambient) {
                icon.textContent = ambient.emoji || '🕊️';
                box.dataset.cat = ambient.cat || '';
                overlay.dataset.cat = ambient.cat || '';
                if (cap) cap.textContent = ambient.label;
            } else {
                icon.textContent = '🕊️';
                box.removeAttribute('data-cat');
                overlay.removeAttribute('data-cat');
                if (cap) cap.textContent = state.book ? 'Reposa en la Palabra' : 'Elige un ambiente y reposa en la Palabra';
            }
            FocusFX.retint();
        }

        function setVoz(v)    { vozVol = Math.max(0, Math.min(1, v / 100)); applyVolumes(); }
        function setMusica(v) { musicaVol = Math.max(0, Math.min(1, v / 100)); applyVolumes(); }

        // Velocidad de la voz. Acotada a [0.9, 1.25] para que nunca distorsione
        // ni "se escuche mal" por llevarla demasiado lejos.
        // La cámara lenta (<1×) solo se permite con la voz SBLL 2026: la RVA 1909
        // pierde calidad al ralentizarla, así que con esa voz se ofrece cambiar.
        function setSpeed(rate, btn) {
            // Cámara lenta: un solo clic basta. Si la voz no es SBLL 2026, cambiamos
            // a ella automáticamente (la RVA 1909 pierde calidad ralentizada) y
            // aplicamos la velocidad en el mismo gesto. playbackSpeed se fija antes
            // de recargar para que el handler 'play' del audio nuevo lo reaplique.
            if (rate < 1 && translationMode !== 'sbll') {
                playbackSpeed = Math.max(0.9, Math.min(1.2, rate));
                if (window.setTranslation) setTranslation('sbll');   // async: recarga con la velocidad ya fijada
                updateSpeedAvailability();
                showToast('🎧 Voz SBLL 2026 + cámara lenta activadas');
                document.querySelectorAll('#focusSpeedOpts button').forEach(b => b.classList.remove('active'));
                if (btn) btn.classList.add('active');
                return;
            }
            playbackSpeed = Math.max(0.9, Math.min(1.2, rate));
            try { audioA.playbackRate = playbackSpeed; audioB.playbackRate = playbackSpeed; } catch (e) {}
            document.querySelectorAll('#focusSpeedOpts button').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }
        // Oculta los botones de cámara lenta (0.9×) salvo con la voz SBLL 2026.
        function updateSpeedAvailability() {
            // La cámara lenta solo existe con la voz TTS SBLL 2026.
            const noSlow = (translationMode !== 'sbll');
            document.querySelectorAll('#focusSpeedOpts button').forEach(b => {
                if (parseFloat(b.dataset.rate) < 1) b.style.display = noSlow ? 'none' : '';
            });
            const hint = document.getElementById('focusSpeedHint');
            if (hint) hint.classList.toggle('show', noSlow);
            // Si la voz ya no permite ir lento y estábamos a 0.9×, normalizar a 1×.
            if (noSlow && playbackSpeed < 1) setSpeed(1, document.querySelector('#focusSpeedOpts button[data-rate="1"]'));
        }
        // Cambia a la voz SBLL 2026 desde el Modo Enfoque (para usar la cámara lenta).
        function useSbllVoice() {
            if (window.setTranslation) setTranslation('sbll');
            updateSpeedAvailability();
            showToast('🎧 Voz SBLL 2026 activada · suena mejor en cámara lenta');
        }

        // Cancela cualquier temporizador/fundido de sueño en curso y restaura el
        // volumen pleno (sleepGain = 1). Idempotente: seguro llamarlo siempre.
        function _cancelSleep() {
            if (timerId)         { clearTimeout(timerId); timerId = null; }
            if (sleepFadeTimer)  { clearTimeout(sleepFadeTimer); sleepFadeTimer = null; }
            if (sleepFadeInt)    { clearInterval(sleepFadeInt); sleepFadeInt = null; }
            sleepGain = 1; applyVolumes();
        }

        function setTimer(min, btn) {
            _cancelSleep();
            document.querySelectorAll('#focusTimerOpts button').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            if (min <= 0) return;
            const total  = min * 60000;
            const fadeMs = Math.min(SLEEP_FADE_MS, total * 0.5);   // no fundir más de la mitad
            // Espera hasta los últimos `fadeMs` y entonces baja el sonido a 0 sin
            // cortes. Usa setInterval con reloj real (como fade()): sigue corriendo
            // con la pantalla bloqueada, así el fundido SIEMPRE termina.
            timerId = setTimeout(() => {
                timerId = null;
                const t0 = performance.now();
                sleepFadeInt = setInterval(() => {
                    const k = Math.min(1, (performance.now() - t0) / fadeMs);
                    sleepGain = 1 - k;
                    applyVolumes();
                    if (k >= 1) {
                        clearInterval(sleepFadeInt); sleepFadeInt = null;
                        try { audio.pause(); } catch (e) {}
                        stopAmbient();
                        sleepGain = 1;   // restaura para la próxima reproducción
                        document.querySelectorAll('#focusTimerOpts button').forEach(b => b.classList.remove('active'));
                        document.querySelector('#focusTimerOpts button[data-min="0"]')?.classList.add('active');
                        showToast('😴 Buenas noches — la reproducción se detuvo suavemente');
                    }
                }, 200);
            }, total - fadeMs);
        }

        function onNarration(playing) {
            document.getElementById('focusPlayIcon').style.display  = playing ? 'none'  : 'block';
            document.getElementById('focusPauseIcon').style.display = playing ? 'block' : 'none';
            if (!overlay.classList.contains('open')) return;
            if (!currentAmbient || !ambCur.src) return;
            if (playing) {
                if (_pauseTimer) { clearTimeout(_pauseTimer); _pauseTimer = null; }
                ambCur.play().catch(() => {});
            } else {
                // En meditación la música corre independiente de la narración.
                // En modo voz: debounce 600ms para ignorar micro-pauses del stream.
                if (focusSubMode !== 'voz') return;
                _pauseTimer = setTimeout(() => {
                    _pauseTimer = null;
                    try { ambientEl.pause(); ambientElB.pause(); } catch (e) {}
                }, 1200);
            }
        }

        // ── Submodo activo: null | 'meditar' | 'voz' ──────────────────────────
        let focusSubMode = null;

        // ── Selector de modo ───────────────────────────────────────────────────
        function openSelector() {
            const m = document.getElementById('focusModeSelector');
            if (m) { m.classList.add('visible'); m.setAttribute('aria-hidden', 'false'); }
        }
        function closeSelector() {
            const m = document.getElementById('focusModeSelector');
            if (m) { m.classList.remove('visible'); m.setAttribute('aria-hidden', 'true'); }
        }

        // ── Apertura del overlay (común a los dos modos) ───────────────────────
        // Fondos visuales elegibles. La preferencia vive en localStorage.
        const BG_THEMES = ['aurora', 'noche', 'amanecer', 'vela'];
        function savedBg() { try { return localStorage.getItem('sdv-focus-bg') || 'aurora'; } catch (e) { return 'aurora'; } }
        function _reflectBgBtns(name) {
            document.querySelectorAll('#focusBgOpts button').forEach(b => b.classList.toggle('active', b.dataset.bg === name));
        }
        // Cambia el fondo visual en caliente y lo recuerda.
        function setBg(name, btn) {
            if (!BG_THEMES.includes(name)) name = 'aurora';
            overlay.dataset.bg = name;
            try { localStorage.setItem('sdv-focus-bg', name); } catch (e) {}
            _reflectBgBtns(name);
            FocusFX.theme();
        }

        // ── Presets favoritos de mezcla ────────────────────────────────────────
        // Guardan TODA la receta de la sesión (ambiente, volúmenes, velocidad,
        // fondo visual, temporizador) y la reaplican de un toque. 100% local.
        function loadPresets()  { try { return JSON.parse(localStorage.getItem('sdv-focus-presets')) || []; } catch (e) { return []; } }
        function storePresets(l){ try { localStorage.setItem('sdv-focus-presets', JSON.stringify(l)); } catch (e) {} }
        function _activeTimerMin() {
            const b = document.querySelector('#focusTimerOpts button.active');
            return b ? parseInt(b.dataset.min, 10) || 0 : 0;
        }
        function savePreset() {
            const name = (prompt('Nombre para esta mezcla:', 'Mi mezcla') || '').trim();
            if (!name) return;
            const preset = {
                nombre: name.slice(0, 28),
                ambiente: currentAmbient || null,
                musica: Math.round(musicaVol * 100),
                voz: Math.round(vozVol * 100),
                velocidad: playbackSpeed,
                fondo: overlay.dataset.bg || 'aurora',
                timer: _activeTimerMin(),
            };
            const list = loadPresets().filter(p => p.nombre !== preset.nombre);
            list.push(preset);
            storePresets(list.slice(-12));   // tope: 12 presets
            renderPresets();
            showToast(`⭐ Mezcla "${preset.nombre}" guardada`);
        }
        // Mezclas de fábrica: vienen cargadas para que el usuario vea ejemplos
        // listos en vez de una sección vacía. Un toque aplica toda la combinación.
        const FACTORY_PRESETS = [
            { id:'f-dormir',  nombre:'Para dormir',      emoji:'🌙', ambiente:'medianoche-agua',  musica:45, voz:70,  velocidad:0.9, fondo:'noche',  timer:30 },
            { id:'f-orar',    nombre:'Para orar',        emoji:'🙏', ambiente:'salmo-oracion',     musica:40, voz:100, velocidad:0.9, fondo:'vela',   timer:0  },
            { id:'f-enfocar', nombre:'Para concentrarte',emoji:'🎻', ambiente:'cuerdas-terciopelo',musica:60, voz:100, velocidad:1,   fondo:'aurora', timer:0  },
        ];
        function _applyPresetObj(p) {
            if (!p) return;
            if (p.ambiente) selectAmbient(p.ambiente);
            const vm = document.getElementById('volMusica'); if (vm) vm.value = p.musica; setMusica(p.musica);
            const vv = document.getElementById('volVoz');    if (vv) vv.value = p.voz;     setVoz(p.voz);
            setSpeed(p.velocidad, document.querySelector(`#focusSpeedOpts button[data-rate="${p.velocidad}"]`));
            setBg(p.fondo, null);
            setTimer(p.timer || 0, document.querySelector(`#focusTimerOpts button[data-min="${p.timer || 0}"]`));
            showToast(`⭐ Mezcla "${p.nombre}" aplicada`);
        }
        function applyPreset(name) { _applyPresetObj(loadPresets().find(x => x.nombre === name)); }
        function applyFactory(id)  { _applyPresetObj(FACTORY_PRESETS.find(x => x.id === id)); }
        function deletePreset(name) {
            storePresets(loadPresets().filter(p => p.nombre !== name));
            renderPresets();
        }
        function renderPresets() {
            const box = document.getElementById('focusPresets');
            if (!box) return;
            box.innerHTML = '';
            FACTORY_PRESETS.forEach(p => {
                const chip = document.createElement('span');
                chip.className = 'focus-preset-chip factory';
                const apply = document.createElement('button');
                apply.className = 'fp-apply'; apply.textContent = p.emoji + ' ' + p.nombre;
                apply.onclick = () => applyFactory(p.id);
                chip.appendChild(apply);
                box.appendChild(chip);
            });
            loadPresets().forEach(p => {
                const chip = document.createElement('span');
                chip.className = 'focus-preset-chip';
                const apply = document.createElement('button');
                apply.className = 'fp-apply'; apply.textContent = '⭐ ' + p.nombre;
                apply.onclick = () => applyPreset(p.nombre);
                const del = document.createElement('button');
                del.className = 'fp-del'; del.textContent = '✕'; del.setAttribute('aria-label', 'Borrar mezcla');
                del.onclick = (e) => { e.stopPropagation(); deletePreset(p.nombre); };
                chip.appendChild(apply); chip.appendChild(del);
                box.appendChild(chip);
            });
            const add = document.createElement('button');
            add.className = 'focus-preset-add'; add.textContent = '＋ Guardar mezcla';
            add.onclick = savePreset;
            box.appendChild(add);
        }

        function _openOverlay(mode) {
            // iOS Safari: desbloquear los elementos de audio ambiente en el contexto
            // de gesto de usuario (el click que abre el overlay). Sin esto, el blob
            // llega después del gesto y .play() queda bloqueado por autoplay policy.
            try { ambientEl.play().catch(() => {}); ambientEl.pause(); } catch(e) {}
            try { ambientElB.play().catch(() => {}); ambientElB.pause(); } catch(e) {}

            overlay.dataset.mode = mode;
            overlay.dataset.bg = savedBg();
            _reflectBgBtns(overlay.dataset.bg);
            focusSubMode = mode;
            renderAmbients();
            renderPresets();
            syncVerse();
            setEmblem(currentAmbient ? ambients.find(a => a.id === currentAmbient) : null);
            if (window.FocusCats)  FocusCats.render();
            if (window.FocusEnv)   FocusEnv.init();
            if (window.FocusTimer) FocusTimer.reset();
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            FocusFX.start();
            if (window.Ads) Ads.refresh();
            document.getElementById('playerFocusBtn')?.classList.add('active');
            applyVolumes();
            if (!currentAmbient) { shuffleAuto = true; updateShuffleBtn(); pickRandomAmbient(); }
            syncBibleSelector(translationMode || 'real');
            // Racha diaria: cuenta la sesión de hoy y celebra con un aviso suave.
            const st = FocusStreak.mark();
            if (!st.sameDay) {
                if (st.advanced)        showToast(`🔥 ¡${st.count} días seguidos en la Palabra!`);
                else if (st.restarted)  showToast('🔥 Bienvenido de nuevo · empiezas una nueva racha');
            }
        }

        // ── Modo Meditación — versículos curados de aliento ────────────────────
        // Solo versículos positivos y completos: se leen bien sin contexto.
        const MEDIT_VERSES = [
            { ref:'Filipenses 4:13',      text:'Todo lo puedo en Cristo que me fortalece.' },
            { ref:'Isaías 41:10',         text:'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.' },
            { ref:'Isaías 40:31',         text:'Los que esperan en Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.' },
            { ref:'Salmos 23:1',          text:'Jehová es mi pastor; nada me faltará.' },
            { ref:'Jeremías 29:11',       text:'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.' },
            { ref:'Romanos 8:28',         text:'A los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.' },
            { ref:'Juan 14:27',           text:'La paz os dejo, mi paz os doy; yo no os la doy como el mundo la da. No se turbe vuestro corazón, ni tenga miedo.' },
            { ref:'Salmos 46:1',          text:'Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.' },
            { ref:'Mateo 11:28-29',       text:'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar. Llevad mi yugo sobre vosotros, y aprended de mí, que soy manso y humilde de corazón; y hallaréis descanso para vuestras almas.' },
            { ref:'1 Pedro 5:7',          text:'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.' },
            { ref:'Salmos 27:1',          text:'Jehová es mi luz y mi salvación; ¿a quién temeré? Jehová es la fortaleza de mi vida; ¿de quién me he de atemorizar?' },
            { ref:'Filipenses 4:6-7',     text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias. Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.' },
            { ref:'Lamentaciones 3:22-23',text:'Por la misericordia de Jehová no hemos sido consumidos, porque nunca decayeron sus misericordias. Nuevas son cada mañana; grande es tu fidelidad.' },
            { ref:'Josué 1:9',            text:'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.' },
            { ref:'Proverbios 3:5-6',     text:'Fíate de Jehová de todo tu corazón, y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, y él enderezará tus veredas.' },
            { ref:'Salmos 34:18',         text:'Cercano está Jehová a los quebrantados de corazón; y salva a los contritos de espíritu.' },
            { ref:'2 Timoteo 1:7',        text:'Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio.' },
            { ref:'Salmos 91:1-2',        text:'El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente. Diré yo a Jehová: Esperanza mía, y castillo mío; mi Dios, en quien confiaré.' },
            { ref:'Isaías 43:1',          text:'No temas, porque yo te redimí; te puse nombre, mío eres tú.' },
            { ref:'Salmos 121:1-2',       text:'Alzaré mis ojos a los montes; ¿de dónde vendrá mi socorro? Mi socorro viene de Jehová, que hizo los cielos y la tierra.' },
            { ref:'Romanos 8:38-39',      text:'Nada nos podrá separar del amor de Dios, que es en Cristo Jesús Señor nuestro.' },
            { ref:'Apocalipsis 21:4',     text:'Enjugará Dios toda lágrima de los ojos de ellos; y ya no habrá muerte, ni habrá más llanto, ni clamor, ni dolor.' },
            { ref:'Salmos 139:14',        text:'Te alabaré; porque formidables, maravillosas son tus obras; estoy maravillado, y mi alma lo sabe muy bien.' },
            { ref:'Juan 3:16',            text:'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.' },
            { ref:'Salmos 103:12',        text:'Cuanto está lejos el oriente del occidente, hizo alejar de nosotros nuestras rebeliones.' },
            { ref:'Isaías 26:3',          text:'Tú guardarás en completa paz a aquel cuyo pensamiento en ti persevera; porque en ti ha confiado.' },
            { ref:'Efesios 2:10',         text:'Somos hechura suya, creados en Cristo Jesús para buenas obras, las cuales Dios preparó de antemano para que anduviésemos en ellas.' },
            { ref:'Filipenses 4:19',      text:'Mi Dios, pues, suplirá todo lo que os falta conforme a sus riquezas en gloria en Cristo Jesús.' },
            { ref:'Salmos 55:22',         text:'Echa sobre Jehová tu carga, y él te sustentará; no dejará para siempre caído al justo.' },
            { ref:'1 Juan 4:18',          text:'El perfecto amor echa fuera el temor; porque el temor lleva en sí castigo. De donde el que teme, no ha sido perfeccionado en el amor.' },
            { ref:'Salmos 30:5',          text:'Por la noche durará el lloro, y a la mañana vendrá la alegría.' },
            { ref:'Salmos 16:11',         text:'Me mostrarás la senda de la vida; en tu presencia hay plenitud de gozo; delicias a tu diestra para siempre.' },
            { ref:'Nahúm 1:7',            text:'Jehová es bueno, fortaleza en el día de la angustia; y conoce a los que en él confían.' },
            { ref:'Salmos 62:5',          text:'Alma mía, en Dios solamente reposa, porque de él es mi esperanza.' },
            { ref:'Gálatas 6:9',          text:'No nos cansemos, pues, de hacer bien; porque a su tiempo segaremos, si no desmayamos.' },
            { ref:'Hebreos 11:1',         text:'La fe es la certeza de lo que se espera, la convicción de lo que no se ve.' },
            { ref:'Salmos 73:26',         text:'Mi carne y mi corazón desfallecen; mas la roca de mi corazón y mi porción es Dios para siempre.' },
            { ref:'Apocalipsis 3:20',     text:'He aquí, yo estoy a la puerta y llamo; si alguno oye mi voz y abre la puerta, entraré a él, y cenaré con él, y él conmigo.' },
            { ref:'Proverbios 16:3',      text:'Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.' },
            { ref:'Zacarías 4:6',         text:'No con ejército, ni con fuerza, sino con mi Espíritu, ha dicho Jehová de los ejércitos.' },
            { ref:'Salmos 37:4',          text:'Deléitate asimismo en Jehová, y él te concederá las peticiones de tu corazón.' },
            { ref:'Juan 16:33',           text:'En el mundo tendréis aflicción; pero confiad, yo he vencido al mundo.' },
            { ref:'Romanos 15:13',        text:'El Dios de esperanza os llene de todo gozo y paz en el creer, para que abundéis en esperanza por el poder del Espíritu Santo.' },
            { ref:'Salmos 3:5',           text:'Yo me acosté y dormí, y desperté, porque Jehová me sustentaba.' },
            { ref:'Efesios 3:20',         text:'A Aquel que es poderoso para hacer todas las cosas mucho más abundantemente de lo que pedimos o entendemos, según el poder que actúa en nosotros, a él sea gloria.' },
            { ref:'Habacuc 3:19',         text:'Jehová el Señor es mi fortaleza, el cual hace mis pies como de ciervas, y en mis alturas me hace andar.' },
            { ref:'Salmos 31:24',         text:'Esforzaos todos vosotros los que esperáis en Jehová, y tome aliento vuestro corazón.' },
            { ref:'Isaías 55:11',         text:'Así será mi palabra que sale de mi boca; no volverá a mí vacía, sino que hará lo que yo quiero, y será prosperada en aquello para que la envié.' },
            { ref:'Salmos 34:8',          text:'Gustad, y ved que es bueno Jehová; dichoso el hombre que confía en él.' },
            { ref:'2 Crónicas 20:15',     text:'No temáis ni os amedrentéis delante de esta gran multitud, porque no es vuestra la guerra, sino de Dios.' },
            { ref:'Salmos 145:18',        text:'Cercano está Jehová a todos los que le invocan, a todos los que le invocan de veras.' },
            { ref:'Isaías 43:2',          text:'Cuando pases por las aguas, yo estaré contigo; y si por los ríos, no te anegarán. Cuando pases por el fuego, no te quemarás, ni la llama arderá en ti.' },
        ];

        // ── Packs de versículos por tema ────────────────────────────────────
        // No tocan el texto bíblico: cada pack lista REFERENCIAS de MEDIT_VERSES.
        // "Todos" (sin refs) usa la lista completa. Solo pasajes de aliento;
        // cada tema tiene ≥3 versículos. La preferencia vive en localStorage.
        const MEDIT_PACKS = [
            { id:'todos',     label:'Todos',     emoji:'📖' },
            { id:'paz',       label:'Paz',       emoji:'🕊️', refs:['Salmos 23:1','Jeremías 29:11','Juan 14:27','Filipenses 4:6-7','Salmos 34:18','Salmos 91:1-2','Isaías 26:3','1 Juan 4:18','Salmos 62:5','Juan 16:33','Romanos 15:13','Salmos 145:18','Isaías 43:2'] },
            { id:'ansiedad',  label:'Ansiedad',  emoji:'🌧️', refs:['Isaías 41:10','Juan 14:27','Salmos 46:1','Mateo 11:28-29','1 Pedro 5:7','Filipenses 4:6-7','Salmos 34:18','2 Timoteo 1:7','Salmos 55:22','1 Juan 4:18','2 Crónicas 20:15'] },
            { id:'descanso',  label:'Descanso',  emoji:'😴', refs:['Salmos 23:1','Mateo 11:28-29','Salmos 91:1-2','Apocalipsis 21:4','Salmos 55:22','Salmos 30:5','Salmos 62:5','Salmos 3:5'] },
            { id:'gracia',    label:'Perdón',    emoji:'🤍', refs:['Lamentaciones 3:22-23','Isaías 43:1','Romanos 8:38-39','Juan 3:16','Salmos 103:12','Apocalipsis 3:20'] },
            { id:'gratitud',  label:'Gratitud',  emoji:'🙏', refs:['Lamentaciones 3:22-23','Salmos 139:14','Juan 3:16','Filipenses 4:19','Salmos 16:11','Salmos 37:4','Romanos 15:13','Salmos 34:8'] },
            { id:'fuerza',    label:'Fuerza',    emoji:'💪', refs:['Filipenses 4:13','Isaías 41:10','Isaías 40:31','Salmos 46:1','Salmos 27:1','Josué 1:9','2 Timoteo 1:7','Salmos 121:1-2','Nahúm 1:7','Gálatas 6:9','Salmos 73:26','Zacarías 4:6','Juan 16:33','Efesios 3:20','Habacuc 3:19','Salmos 31:24','2 Crónicas 20:15','Isaías 43:2'] },
            { id:'esperanza', label:'Esperanza', emoji:'✨', refs:['Isaías 40:31','Jeremías 29:11','Romanos 8:28','Lamentaciones 3:22-23','Romanos 8:38-39','Apocalipsis 21:4','Efesios 2:10','Salmos 30:5','Salmos 16:11','Salmos 62:5','Gálatas 6:9','Hebreos 11:1','Juan 16:33','Romanos 15:13','Efesios 3:20','Salmos 31:24'] },
        ];
        let meditIdx    = 0;
        let meditTimer  = null;
        let meditList   = MEDIT_VERSES.slice();   // pool activo (filtrado por pack + barajado)
        let currentPack = 'todos';
        const MEDIT_MS  = 25000;

        // ── Versículos que respiran: guía de respiración 4s inhala / 6s exhala ──
        let breathOn = false, breathRAF = null, breathStart = 0, breathCycles = 0;
        const BREATH_IN = 4000, BREATH_OUT = 6000, BREATH_CYCLE = BREATH_IN + BREATH_OUT;
        const _ease = k => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));
        function _breathFrame(now) {
            if (!breathOn) return;
            const t = (now - breathStart) % BREATH_CYCLE;
            let scale, word, secsLeft;
            if (t < BREATH_IN) { scale = 0.55 + 0.45 * _ease(t / BREATH_IN); word = 'Inhala'; secsLeft = Math.ceil((BREATH_IN - t) / 1000); }
            else               { scale = 1.00 - 0.45 * _ease((t - BREATH_IN) / BREATH_OUT); word = 'Exhala'; secsLeft = Math.ceil((BREATH_CYCLE - t) / 1000); }
            const ring = document.getElementById('fxBreathRing'); if (ring) ring.style.transform = 'scale(' + scale.toFixed(3) + ')';
            const w = document.getElementById('fxBreathWord'); if (w && w.textContent !== word) w.textContent = word;
            // Cuenta atrás visible (4s inhala · 6s exhala) para llevar el ritmo.
            const c = document.getElementById('fxBreathCount'); const cs = String(Math.max(1, secsLeft)); if (c && c.textContent !== cs) c.textContent = cs;
            const cyc = Math.floor((now - breathStart) / BREATH_CYCLE);
            if (cyc !== breathCycles) { breathCycles = cyc; if (cyc % 2 === 0) meditNext(); }   // avanza cada 2 ciclos (~20s)
            breathRAF = requestAnimationFrame(_breathFrame);
        }
        function toggleBreath() {
            breathOn = !breathOn;
            document.getElementById('fxBreathToggle')?.classList.toggle('active', breathOn);
            document.getElementById('focusVerseWrap')?.classList.toggle('breathing-on', breathOn);
            const wrap = document.getElementById('fxBreath');
            if (wrap) { wrap.classList.toggle('breath-inactive', !breathOn); wrap.setAttribute('aria-hidden', String(!breathOn)); }
            if (breathOn) {
                breathStart = performance.now(); breathCycles = 0;
                if (meditTimer) { clearTimeout(meditTimer); meditTimer = null; }
                breathRAF = requestAnimationFrame(_breathFrame);
                try { localStorage.setItem('sdv-focus-breath', '1'); } catch (e) {}
            } else {
                if (breathRAF) { cancelAnimationFrame(breathRAF); breathRAF = null; }
                const ring = document.getElementById('fxBreathRing'); if (ring) ring.style.transform = '';
                _meditResetTimer();   // vuelve al ciclo normal de 25s
                try { localStorage.removeItem('sdv-focus-breath'); } catch (e) {}
            }
        }

        function _savedPack() { try { return localStorage.getItem('sdv-focus-pack') || 'todos'; } catch (e) { return 'todos'; } }
        // Reconstruye el pool de versículos según el pack activo (filtra + baraja).
        function buildPool() {
            const p = MEDIT_PACKS.find(x => x.id === currentPack);
            let arr = (!p || !p.refs) ? MEDIT_VERSES.slice() : MEDIT_VERSES.filter(v => p.refs.includes(v.ref));
            if (!arr.length) arr = MEDIT_VERSES.slice();
            meditList = shuffle(arr);
            meditIdx = 0;
        }
        function renderPacks() {
            const box = document.getElementById('focusPacks');
            if (!box) return;
            box.innerHTML = '';
            MEDIT_PACKS.forEach(p => {
                const b = document.createElement('button');
                b.className = 'focus-pack-chip' + (p.id === currentPack ? ' active' : '');
                b.textContent = `${p.emoji} ${p.label}`;
                b.onclick = () => setPack(p.id);
                box.appendChild(b);
            });
        }
        function setPack(id) {
            if (!MEDIT_PACKS.some(p => p.id === id)) id = 'todos';
            currentPack = id;
            try { localStorage.setItem('sdv-focus-pack', id); } catch (e) {}
            renderPacks();
            buildPool();
            meditShow(0);
            _meditResetTimer();
        }

        function meditShow(idx) {
            const v = meditList[idx];
            if (!v) return;
            meditIdx = idx;
            const ref = document.getElementById('focusRef');
            if (ref) ref.textContent = v.ref;
            const body = document.getElementById('focusVerseBody');
            if (!body) return;
            body.classList.add('fading');
            setTimeout(() => { body.textContent = v.text; body.classList.remove('fading'); }, 400);
        }
        function _meditResetTimer() {
            if (meditTimer) clearTimeout(meditTimer);
            if (breathOn) { meditTimer = null; return; }   // en respiración el avance lo lleva el ciclo
            meditTimer = setTimeout(() => { meditNext(); }, MEDIT_MS);
        }
        function meditNext()    { meditShow((meditIdx + 1) % meditList.length); _meditResetTimer(); }
        function meditPrev()    { meditShow((meditIdx - 1 + meditList.length) % meditList.length); _meditResetTimer(); }
        function meditShuffle() { buildPool(); meditShow(0); _meditResetTimer(); }

        function _startMeditation() {
            currentPack = 'todos';   // los packs de temas se retiraron del diseño
            renderPacks();
            buildPool();           // baraja el pool del pack guardado
            meditShow(0);          // ya viene barajado → empieza fresco
            _meditResetTimer();
            let wantBreath = false; try { wantBreath = localStorage.getItem('sdv-focus-breath') === '1'; } catch (e) {}
            if (wantBreath && !breathOn) toggleBreath();   // restaura la guía de respiración
        }
        function _stopMeditation() {
            if (meditTimer) { clearTimeout(meditTimer); meditTimer = null; }
            if (breathRAF) { cancelAnimationFrame(breathRAF); breathRAF = null; }
            breathOn = false;
            const wrap = document.getElementById('fxBreath'); if (wrap) { wrap.classList.add('breath-inactive'); wrap.setAttribute('aria-hidden', 'true'); }
            document.getElementById('fxBreathToggle')?.classList.remove('active');
            document.getElementById('focusVerseWrap')?.classList.remove('breathing-on');
        }

        function enterMeditar() {
            closeSelector();
            if (!premiumReady()) { openTeaser(); return; }
            _openOverlay('meditar');
            _reflectModeSwitch('meditar');
            _startMeditation();
        }

        // ── Modo Con voz ───────────────────────────────────────────────────────
        // Arranca (o adjunta) la narración bíblica. Reutilizable desde enterVoz y
        // desde el cambio de modo en caliente (switchMode), sin reabrir el overlay.
        function _startVozNarration() {
            focusNarration = true;
            updateSpeedAvailability();

            const wasPlaying   = !audio.paused && !!audio.src;
            const isStream     = wasPlaying && audio.src.includes('/stream/');
            const isFullStream = isStream && audio.src.includes('modo=full');

            if (isFullStream) {
                // Ya está en stream full → no interrumpir, solo adjuntar música
                onNarration(true);
                startStreamTrack();
            } else {
                // Capítulo cargado (playing o paused) → (re)arrancar como stream full
                if (!playbackMode) { playbackMode = 'continue'; updateNavModeIndicator(); }
                audio.src = audioUrl(state.book, state.chapter);
                audio.play().catch(() => {});
                onNarration(true);
                startStreamTrack();
            }
        }

        function enterVoz() {
            closeSelector();
            if (!premiumReady()) { openTeaser(); return; }

            // Sin capítulo seleccionado no hay nada que narrar → llevar a Biblia
            if (!state.book) {
                showToast('📖 Primero elige un capítulo en la pestaña Biblia');
                showTab('biblia');
                return;
            }

            _openOverlay('voz');
            _reflectModeSwitch('voz');
            _startVozNarration();
        }

        // ── Cambio de modo SIN salir del overlay (Solo música ↔ Voz y música) ──
        function switchMode(mode) {
            if (mode !== 'voz' && mode !== 'meditar') return;
            if (focusSubMode === mode) return;
            if (mode === 'voz') {
                // Para narrar hace falta un capítulo. Si no hay, avisar y no cambiar.
                if (!state.book) {
                    showToast('📖 Elige primero un capítulo en la pestaña Biblia para la voz');
                    return;
                }
                _stopMeditation();
                overlay.dataset.mode = 'voz';
                focusSubMode = 'voz';
                _reflectModeSwitch('voz');
                syncVerse();
                _startVozNarration();
            } else {
                // Volver a solo música: detener la narración, conservar la música.
                focusNarration = false;
                try { audio.pause(); } catch (e) {}
                overlay.dataset.mode = 'meditar';
                focusSubMode = 'meditar';
                _reflectModeSwitch('meditar');
                _startMeditation();
            }
        }
        // Refleja el modo activo en el toggle superior.
        function _reflectModeSwitch(mode) {
            document.querySelectorAll('#fxModeSwitch button').forEach(b =>
                b.classList.toggle('active', b.dataset.sub === mode));
        }

        // ── Entrada desde hub Explorar: muestra el selector ────────────────────
        function enter() {
            if (!premiumReady()) { openTeaser(); return; }
            openSelector();
        }

        // ── Salida ─────────────────────────────────────────────────────────────
        function exit() {
            stActive = false; stBusy = false;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            overlay.removeAttribute('data-mode');
            overlay.removeAttribute('data-cat');
            FocusFX.stop();
            if (window.Ads) Ads.refresh();
            document.body.style.overflow = '';
            _stopMeditation();
            if (focusSubMode === 'voz') {
                focusNarration = false;
                try { audio.pause(); } catch (e) {}
            }
            focusSubMode = null;
            stopAmbient();
            _cancelSleep();
            vozVol = 1; audioA.volume = 1; audioB.volume = 1;
            setSpeed(1, document.querySelector('#focusSpeedOpts button[data-rate="1"]'));
            if (window.FocusTimer) FocusTimer.stop();
            document.getElementById('playerFocusBtn')?.classList.remove('active');
        }

        // Teaser de venta para usuarios gratis: vende el Modo Enfoque sin abrirlo.
        function openTeaser() {
            const m = document.getElementById('focusTeaser');
            if (!m) { showToast('🌿 El Modo Enfoque es Premium ✨'); return; }
            const logged = !!(window.SDV_Auth && SDV_Auth.user);
            const cta = document.getElementById('focusTeaserCta');
            if (cta) {
                cta.textContent = logged ? '✨ Empezar prueba de 7 días gratis' : '👤 Crear cuenta y empezar gratis';
                cta.onclick = () => { closeTeaser(); Premium.checkout(); };
            }
            m.classList.add('visible');
            m.setAttribute('aria-hidden', 'false');
        }
        function closeTeaser() {
            const m = document.getElementById('focusTeaser');
            if (!m) return;
            m.classList.remove('visible');
            m.setAttribute('aria-hidden', 'true');
        }

        // Refleja el estado premium en la entrada del menú "Yo".
        function refreshGate() {
            const badge = document.getElementById('focusBadge');
            if (!badge) return;
            if (premiumReady()) { badge.textContent = '⭐ Activo'; }
            else { badge.textContent = '✨ Premium'; }
        }

        // Auto-recuperación al volver del segundo plano: con la pantalla bloqueada
        // el navegador puede pausar la música ambiente o dejar un fundido a medias.
        // Al reabrir la app reanudamos la pista activa y restauramos su volumen.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) return;
            if (!overlay.classList.contains('open') || !currentAmbient) return;
            crossing = false;
            applyVolumes();
            if (ambCur && ambCur.src && ambCur.paused && !audio.paused) {
                ambCur.play().catch(() => {});
            }
        });

        // ── Tracker de display en streaming ─────────────────────────────
        // Sigue el currentTime del stream para detectar límites de capítulo
        // y actualizar el texto sin interrumpir el audio. Obtiene la duración
        // de cada capítulo con preload='metadata' (solo unos KB por petición).
        let stActive = false, stBusy = false;
        let stBook = null, stChapter = null, stCStart = 0, stCDur = null;

        function fetchChapterDur(book, ch) {
            return new Promise(resolve => {
                const a = new Audio();
                a.preload = 'metadata';
                a.src = audioUrl(book, ch, true);
                const done = v => { try { a.src = ''; } catch(e){} resolve(v); };
                a.addEventListener('loadedmetadata', () => done(isFinite(a.duration) && a.duration > 0 ? a.duration : null), { once: true });
                a.addEventListener('error', () => done(null), { once: true });
                setTimeout(() => done(null), 10000);
            });
        }

        async function startStreamTrack() {
            if (stBusy) return;
            stActive = false; stBusy = true;
            stBook = state.book; stChapter = state.chapter;
            stCStart = audio.currentTime; stCDur = null;
            const dur = await fetchChapterDur(stBook, stChapter);
            if (stBook === state.book) { stCDur = dur; stActive = !!dur; }
            stBusy = false;
        }

        async function tickStreamTrack(ct) {
            if (!stActive || stBusy || stCDur == null) return;
            if (ct - stCStart < stCDur - 0.5) return;

            stBusy = true; stActive = false;

            const bible = getActiveBible();
            const total = bible[stBook]?.length || 0;
            let nextBook = stBook, nextCh = stChapter + 1;
            if (nextCh > total) {
                if (effectiveMode() === 'full') {
                    const ordered = BIBLE_ORDER.filter(b => Object.keys(bible).includes(b));
                    const idx = ordered.indexOf(stBook);
                    if (idx >= 0 && idx < ordered.length - 1) { nextBook = ordered[idx + 1]; nextCh = 1; }
                    else { stBusy = false; return; }
                } else { stBusy = false; return; }
            }

            loadChapter({ book: nextBook, chapter: nextCh, skipAudio: true, silent: true });

            const nextStart = stCStart + stCDur;
            stBook = nextBook; stChapter = nextCh;
            stCStart = nextStart; stCDur = null;

            const dur = await fetchChapterDur(nextBook, nextCh);
            if (stBook === nextBook && stChapter === nextCh) {
                stCDur = dur; stActive = !!dur;
            }
            stBusy = false;
        }

        // Para el FocusTimer: detiene narración + ambiente sin cerrar el overlay.
        function stopAudio() {
            try { audio.pause(); } catch(e) {}
            stopAmbient();
            _cancelSleep();
        }

        // Fundido de salida suave al terminar una sesión del temporizador circular.
        // Reutiliza el motor `sleepGain` (mismo que el sleep timer): baja narración
        // Y música a 0 con reloj real (sigue con la pantalla bloqueada) y al final
        // pausa todo. Si no hay nada sonando, corta sin más.
        function fadeOutAndStop(ms) {
            ms = ms || 8000;
            if (sleepFadeTimer) { clearTimeout(sleepFadeTimer); sleepFadeTimer = null; }
            if (sleepFadeInt)   { clearInterval(sleepFadeInt); sleepFadeInt = null; }
            const sonando = (audio && !audio.paused) || sleepGain < 1 || ambCur?.src;
            if (!sonando) { stopAudio(); return; }
            const t0 = performance.now();
            sleepFadeInt = setInterval(() => {
                const k = Math.min(1, (performance.now() - t0) / ms);
                sleepGain = 1 - k; applyVolumes();
                if (k >= 1) {
                    clearInterval(sleepFadeInt); sleepFadeInt = null;
                    try { audio.pause(); } catch (e) {}
                    stopAmbient();
                    sleepGain = 1; applyVolumes();   // restaura para la próxima sesión
                }
            }, 100);
        }

        function syncBibleSelector(mode) {
            document.getElementById('fxBibleReal')?.classList.toggle('active', mode === 'real');
            document.getElementById('fxBibleRva')?.classList.toggle('active',  mode === 'rva');
            document.getElementById('fxBibleSbll')?.classList.toggle('active', mode === 'sbll');
        }

        return { enter, exit, enterVoz, enterMeditar, switchMode, toggleShuffleAuto, selectAmbient, toggleMusic, setVoz, setMusica, setSpeed, setTimer, setBg, onNarration, syncVerse, refreshGate, openTeaser, closeTeaser, closeSelector, useSbllVoice, startStreamTrack, tickStreamTrack, ambients, meditNext, meditPrev, meditShuffle, stopAudio, fadeOutAndStop, toggleBreath, syncBibleSelector };
    })();
    window.Focus = Focus;

    // ════════ Modo Enfoque — rediseño 2026: capas de UI (sobre el motor Focus) ════════
    // Estos módulos son SOLO presentación: delegan el audio en Focus.* (probado).

    // ── Grid de categorías de "Música de Fondo": cada categoría agrupa ambientes
    //    reales del catálogo de Focus; al tocarla se elige uno al azar del grupo. ──
    const FocusCats = (function () {
        const CATS = [
            { id:'cuerdas',   emoji:'🎻', name:'Cuerdas',       ids:['cuerdas-terciopelo','orquesta-niebla'] },
            { id:'paz',       emoji:'🕊️', name:'Paz y Quietud', ids:['calma','paz-abraza','paz-suspiros','seda-suave','aliento-agua','corrientes-calidas','luz-violeta','corazon-calma'] },
            { id:'salmos',    emoji:'📜', name:'Salmos',        ids:['salmos-reposo','salmo-oracion','salmo-luz','salmos-oceano'] },
            { id:'reposo',    emoji:'🌙', name:'Reposo',        ids:['meditacion','relajacion','medianoche-agua','deriva-umbral','compas-agua','corriente-seda'] },
            { id:'adoracion', emoji:'✨', name:'Adoración',     ids:['nube-segura','oceano-altares'] },
            { id:'incienso',  emoji:'🪔', name:'Incienso',      ids:['incienso','incienso-sagrado','luz-oracion','cancion-cuna','flauta-serena'] },
        ];
        const grid = () => document.getElementById('fxCatGrid');
        function currentAmbient() {
            return document.querySelector('#focusAmbients .focus-chip.active')?.dataset.ambient || null;
        }
        function catOf(ambientId) {
            return CATS.find(c => c.ids.includes(ambientId)) || null;
        }
        function pick(cat) {
            const cur = currentAmbient();
            let pool = cat.ids.filter(id => id !== cur);
            if (!pool.length) pool = cat.ids.slice();
            return pool[Math.floor(Math.random() * pool.length)];
        }
        function select(catId) {
            const cat = CATS.find(c => c.id === catId);
            if (!cat || !window.Focus) return;
            Focus.selectAmbient(pick(cat));
        }
        function render() {
            const box = grid();
            if (!box) return;
            box.innerHTML = '';
            CATS.forEach(c => {
                const b = document.createElement('button');
                b.className = 'fx-cat';
                b.dataset.cat = c.id;
                b.innerHTML = `<span class="fx-cat-emoji">${c.emoji}</span><span class="fx-cat-name">${c.name}</span>`;
                b.onclick = () => select(c.id);
                box.appendChild(b);
            });
            refresh();
        }
        function refresh() {
            const cur = currentAmbient();
            const cat = cur ? catOf(cur) : null;
            document.querySelectorAll('#fxCatGrid .fx-cat').forEach(b => {
                b.classList.toggle('active', !!cat && b.dataset.cat === cat.id);
            });
        }
        return { render, refresh };
    })();
    window.FocusCats = FocusCats;

    // ── Entorno visual: estrellas (con halo) / lluvia / nubes ──
    const FocusEnv = (function () {
        const overlay = () => document.getElementById('focusOverlay');
        function createGlowStars() {
            const c = document.getElementById('fxStarGlow'); if (!c) return;
            c.innerHTML = '';
            for (let i = 0; i < 16; i++) {
                const s = document.createElement('div'); s.className = 'fx-glow-star';
                const size = 2 + Math.random() * 2.8;
                const tint = Math.random() < 0.3 ? '255,248,228' : '255,255,255';
                s.style.cssText = `width:${size}px;height:${size}px;left:${2 + Math.random()*95}%;top:${Math.random()*72}%;background:rgba(${tint},1);box-shadow:0 0 ${(5+size*3.2).toFixed(0)}px rgba(${tint},0.9);animation-duration:${(2.4+Math.random()*3.2).toFixed(2)}s;animation-delay:${(-Math.random()*4).toFixed(2)}s`;
                c.appendChild(s);
            }
            // Meteoritos ocasionales (2, con ciclos largos y distintos → cruzan de vez en cuando).
            [{ dur: 13, delay: 3 }, { dur: 19, delay: 10 }].forEach(m => {
                const me = document.createElement('div'); me.className = 'fx-meteor';
                me.style.cssText = `left:${5 + Math.random()*45}%;top:${2 + Math.random()*30}%;animation-duration:${m.dur}s;animation-delay:${m.delay}s`;
                c.appendChild(me);
            });
        }
        function createRain() {
            const c = document.getElementById('fxRain'); if (!c) return;
            c.innerHTML = '';
            for (let i = 0; i < 90; i++) {
                const d = document.createElement('div'); d.className = 'fx-rain-drop';
                d.style.cssText = `left:${Math.random()*100}%;height:${15+Math.random()*25}px;animation-duration:${(0.6+Math.random()*0.6).toFixed(2)}s;animation-delay:${(Math.random()*2).toFixed(2)}s`;
                c.appendChild(d);
            }
        }
        function createClouds() {
            const c = document.getElementById('fxClouds'); if (!c) return;
            c.innerHTML = '';
            for (let i = 0; i < 5; i++) {
                const cl = document.createElement('div'); cl.className = 'fx-cloud';
                cl.style.setProperty('--s', (0.7 + Math.random()*0.9).toFixed(2));
                cl.style.top = (Math.random()*60) + '%';
                cl.style.animationDuration = (38 + Math.random()*42).toFixed(0) + 's';
                cl.style.animationDelay = (-Math.random()*60).toFixed(0) + 's';
                c.appendChild(cl);
            }
        }
        function set(env, btn) {
            const ov = overlay(); if (!ov) return;
            ov.dataset.env = env;
            document.querySelectorAll('#fxEnv button').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            else document.querySelector(`#fxEnv button[data-env="${env}"]`)?.classList.add('active');
            ['fxStarGlow','fxRain','fxClouds'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
            if (env === 'stars') createGlowStars();
            else if (env === 'rain') createRain();
            else if (env === 'clouds') createClouds();
            try { localStorage.setItem('sdv-focus-env', env); } catch (e) {}
        }
        function init() {
            let env = 'stars';
            try { env = localStorage.getItem('sdv-focus-env') || 'stars'; } catch (e) {}
            set(env, null);
        }
        return { set, init };
    })();
    window.FocusEnv = FocusEnv;

    // ── Temporizador de sesión (círculo). UI pura: cuenta atrás + pantalla final. ──
    const FocusTimer = (function () {
        const CIRC = 553;
        let duration = 15 * 60, remaining = duration, iv = null, running = false;
        const $ = id => document.getElementById(id);
        function draw() {
            const d = $('fxTimerDisplay'); if (d) d.textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
            const ring = $('fxTimerRing'); if (ring) ring.style.strokeDashoffset = CIRC * (1 - remaining / duration);
        }
        function setLabel(t) { const l = $('fxTimerLabel'); if (l) l.textContent = t; }
        function setIcon(play) {
            const i = $('fxTimerBtnIcon'); if (!i) return;
            i.innerHTML = play
                ? '<polygon points="6 4 20 12 6 20 6 4"></polygon>'
                : '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        }
        function set(min, btn) {
            stop();
            duration = min * 60; remaining = duration;
            document.querySelectorAll('#fxTimerPresets button').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            else document.querySelector(`#fxTimerPresets button[data-min="${min}"]`)?.classList.add('active');
            draw(); setLabel('Listo para empezar'); setIcon(true);
        }
        function start() {
            if (remaining <= 0) remaining = duration;
            running = true; setLabel('En enfoque…'); setIcon(false);
            document.querySelector('.fx-timer')?.classList.add('running');
            iv = setInterval(() => {
                if (remaining > 0) { remaining--; draw(); }
                else complete();
            }, 1000);
        }
        function pause() {
            running = false; if (iv) { clearInterval(iv); iv = null; }
            setLabel('Pausado'); setIcon(true);
            document.querySelector('.fx-timer')?.classList.remove('running');
        }
        function toggle() { running ? pause() : start(); }
        function stop() {
            running = false; if (iv) { clearInterval(iv); iv = null; }
            document.querySelector('.fx-timer')?.classList.remove('running');
        }
        function reset() {
            stop(); remaining = duration; draw(); setLabel('Listo para empezar'); setIcon(true);
        }
        function complete(fadeMs) {
            stop(); remaining = 0; draw(); setIcon(true); setLabel('¡Sesión completada!');
            if (window.Focus) { Focus.fadeOutAndStop ? Focus.fadeOutAndStop(fadeMs) : Focus.stopAudio(); }
            const o = $('fxDone'); if (o) { o.classList.add('show'); o.setAttribute('aria-hidden', 'false'); }
        }
        function skip() { complete(2500); }   // "Finalizar": fundido corto, no corte seco
        function closeDone() { const o = $('fxDone'); if (o) { o.classList.remove('show'); o.setAttribute('aria-hidden', 'true'); } }
        return { set, toggle, start, pause, reset, skip, stop, closeDone };
    })();
    window.FocusTimer = FocusTimer;

    // Lectura numérica de los sliders de mezcla (Música / Voz).
    (function initFocusMixerVals(){
        const sync = (slider, out) => { const s = document.getElementById(slider), o = document.getElementById(out); if (s && o) { o.textContent = s.value; s.addEventListener('input', () => { o.textContent = s.value; }); } };
        sync('volMusica', 'volMusicaVal'); sync('volVoz', 'volVozVal');
    })();

    function formatTime(s) { return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }

    async function downloadChapter() {
        if (!state.book || !state.chapter) return;
        // Cuenta obligatoria para descargar (escuchar sigue siendo libre y sin registro)
        if (serverDL() && !window.SDV_Auth.user) {
            if (window.SDV_Account) SDV_Account.open();
            showToast('🔒 Crea tu cuenta gratis para descargar');
            return;
        }
        // Atajo: si ya sabemos que no quedan, abrir el modal sin bajar nada.
        if (getRemainingDL() <= 0 && (serverDL() ? !!dlState : true)) { openDownloadLimitModal(); return; }

        const btn = document.getElementById('downloadBtn');
        btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Descargando...';
        try {
            // 1) Bajar el archivo primero (si falla la red, no se gasta descarga).
            const res = await fetch(audioUrl(state.book, state.chapter, true));
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const blob = await res.blob();

            // 2) Consumir un crédito en el servidor (anti-abuso real por uid).
            if (serverDL()) {
                let c;
                try { c = await SDV_Auth.consumeDownload(); }
                catch { showToast('⚠️ Sin conexión. Intenta de nuevo.'); return; }
                if (c.status === 402) { dlState = c.data; openDownloadLimitModal(); return; }
                if (!c.ok) { showToast('⚠️ No se pudo registrar la descarga.'); return; }
                dlState = c.data;
            } else {
                incrementDLLocal();
            }

            // 3) Entregar el archivo.
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const ext = translationMode === 'sbll' ? 'm4a' : 'mp3';
            a.download = `${state.book.replace(/\s+/g,'_')}_Capitulo${state.chapter}_${getTranslationLabel().replace(/\s/g,'')}.${ext}`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);

            // 4) Guardar también dentro de la app (offline real): el mismo blob se
            //    cachea bajo la ruta que lee el service worker, y se registra en la
            //    biblioteca "Mis descargas".
            try {
                const path = new URL(audioUrl(state.book, state.chapter, true)).pathname;
                const cache = await caches.open(OFFLINE_CACHE);
                await cache.put(new Request(path, { method: 'GET' }), new Response(blob));
                recordOffline({ book: state.book, chapter: state.chapter, size: blob.size, ts: Date.now() });
            } catch (e) {}

            showToast('✅ ¡Capítulo descargado!');
        } catch (e) { showToast('⚠️ Error al descargar: ' + e.message); }
        finally { btn.disabled = false; updateDownloadBtn(); }
    }

    async function copyChapter() {
        if (!state.verses.length) return;
        const txt = `${state.book} ${state.chapter}\n\n` + state.verses.map((v,i)=>`${i+1} ${v}`).join('\n');
        try { await navigator.clipboard.writeText(txt); }
        catch { const t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
        showToast('¡Texto del capítulo copiado!');
    }

    async function getRandomVerse() {
        try { await ensureBible(); }
        catch (e) { return showToast('⚠️ No se pudo cargar la Biblia'); }
        try {
            const books = Object.keys(getActiveBible());
            const book  = books[Math.floor(Math.random() * books.length)];
            const chap  = Math.floor(Math.random() * getActiveBible()[book].length) + 1;
            const vers  = getActiveBible()[book][chap - 1];
            const vIdx  = Math.floor(Math.random() * vers.length);
            document.getElementById('randomRef').textContent  = `${book} ${chap}:${vIdx + 1}`;
            document.getElementById('randomText').textContent = vers[vIdx];
            document.getElementById('randomResult').classList.add('visible');
        } catch { showToast('⚠️ Error al obtener versículo'); }
    }

    async function copyRandomVerse() {
        const ref  = document.getElementById('randomRef').textContent;
        const text = document.getElementById('randomText').textContent;
        if (!ref) return;
        try { await navigator.clipboard.writeText(`${ref}\n\n"${text}"`); }
        catch { const t=document.createElement('textarea'); t.value=`${ref}\n\n"${text}"`; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
        showToast('¡Versículo copiado!');
    }

    // ════════════════════════════════════════════════════════════════
    // Modal de modo de reproducción
    // ════════════════════════════════════════════════════════════════
    function openPlaybackModeModal(fromIndicator) {
        const modal = document.getElementById('playbackModeModal');
        modal.classList.add('visible');
        if (fromIndicator) pendingPlayAction = null;
    }

    function closePlaybackModal() {
        document.getElementById('playbackModeModal').classList.remove('visible');
    }

    function selectPlaybackMode(mode) {
        if (!PLAYBACK_MODES[mode]) return;
        playbackMode = mode;
        const remember = document.getElementById('modalRemember')?.checked;
        if (remember) localStorage.setItem(MODE_KEY, mode);
        else localStorage.removeItem(MODE_KEY);
        closePlaybackModal();
        updateNavModeIndicator();
        updatePlayerNextHint();
        updateChapterNavButtons();
        if (pendingPlayAction) {
            const fn = pendingPlayAction; pendingPlayAction = null;
            fn();
        } else {
            showToast(`Modo: ${PLAYBACK_MODES[mode].label}`);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // Límite diario de descargas
    // ════════════════════════════════════════════════════════════════
    // Fuente de verdad: el servidor (contador por uid en D1). localStorage solo
    // es respaldo en modo inerte (sin Firebase configurado, p.ej. dev local).
    const DL_LIMIT_FREE = 3;   // se usa solo en el respaldo local
    const DL_KEY_COUNT  = 'sdv-dl-count';
    const DL_KEY_DATE   = 'sdv-dl-date';
    const DL_KEY_SHARED = 'sdv-dl-shared';

    // ¿Hay backend de cuentas activo? Entonces el servidor manda.
    const serverDL = () => !!(window.SDV_Auth && window.SDV_Auth.enabled);

    // Estado devuelto por el servidor: {usadas, limite, bonus, restantes, premium}
    let dlState = null;

    function todayStr() { return new Date().toISOString().slice(0, 10); }

    // ── Respaldo local (solo modo inerte sin Firebase) ──
    function getDLCountLocal() {
        if (localStorage.getItem(DL_KEY_DATE) !== todayStr()) {
            localStorage.setItem(DL_KEY_DATE, todayStr());
            localStorage.setItem(DL_KEY_COUNT, '0');
            return 0;
        }
        return parseInt(localStorage.getItem(DL_KEY_COUNT) || '0');
    }
    function incrementDLLocal() {
        localStorage.setItem(DL_KEY_DATE, todayStr());
        localStorage.setItem(DL_KEY_COUNT, String(getDLCountLocal() + 1));
    }

    function dlLimit() {
        if (serverDL()) return dlState ? dlState.limite : DL_LIMIT_FREE;
        return DL_LIMIT_FREE;
    }
    function getRemainingDL() {
        if (serverDL()) return dlState ? dlState.restantes : 0;
        return Math.max(0, DL_LIMIT_FREE - getDLCountLocal());
    }

    // Sincroniza el estado de descargas desde el servidor (al loguearse, etc.).
    async function refreshDownloads() {
        if (serverDL()) {
            if (!window.SDV_Auth.user) { dlState = null; updateDownloadBtn(); return; }
            try {
                const r = await SDV_Auth.getDownloads();
                if (r.ok) dlState = r.data;
            } catch { /* sin conexión: conservamos el último estado conocido */ }
        }
        updateDownloadBtn();
    }
    window.refreshDownloads = refreshDownloads;

    function updateDownloadBtn() {
        const btn = document.getElementById('downloadBtn');
        if (!btn || btn.disabled) return;
        // Sin sesión: invitar a crear cuenta (escuchar sigue libre)
        if (serverDL() && !window.SDV_Auth.user) {
            btn.innerHTML = '🔒 Inicia sesión para descargar';
            btn.classList.remove('limit-reached');
            return;
        }
        // Logueado pero aún sin datos del servidor: estado neutro.
        if (serverDL() && !dlState) {
            btn.innerHTML = '💾 Descargar MP3';
            btn.classList.remove('limit-reached');
            return;
        }
        const rem = getRemainingDL();
        const lim = dlLimit();
        if (rem <= 0) {
            btn.innerHTML = `🔒 Límite alcanzado (0/${lim})`;
            btn.classList.add('limit-reached');
        } else {
            btn.innerHTML = `💾 Descargar MP3 · ${rem}/${lim}`;
            btn.classList.remove('limit-reached');
        }
    }

    function openDownloadLimitModal() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);
        const diffH = Math.ceil((midnight - now) / 3600000);
        const resetEl = document.getElementById('dlResetTime');
        if (resetEl) resetEl.textContent = diffH <= 1 ? 'en menos de 1 hora' : `en ${diffH} horas`;
        const shareBtn = document.getElementById('shareBonusBtn');
        if (shareBtn) {
            const alreadyShared = serverDL()
                ? !!(dlState && dlState.bonus >= 1)
                : localStorage.getItem(DL_KEY_SHARED) === todayStr();
            shareBtn.disabled = alreadyShared;
            shareBtn.innerHTML = alreadyShared
                ? '✅ Bonus de compartir ya usado hoy'
                : '📤 Compartir Sonido de Vida · +1 descarga gratis';
        }
        // Textos según el plan del usuario
        const isPremium = !!(window.SDV_Auth && window.SDV_Auth.premium);
        const sub = document.getElementById('dlModalSubtitle');
        if (sub) sub.textContent = `Usaste tus ${dlLimit()} descargas de hoy`;
        const upBtn = document.getElementById('dlUpgradeBtn');
        const foot = document.getElementById('dlModalFooter');
        if (upBtn) upBtn.style.display = isPremium ? 'none' : '';
        if (foot && isPremium) foot.innerHTML = 'Eres Premium · vuelve mañana para más descargas 💛';
        document.getElementById('downloadLimitModal').classList.add('visible');
    }

    function closeDownloadLimitModal() {
        document.getElementById('downloadLimitModal').classList.remove('visible');
    }

    async function useShareBonusAction() {
        const msg = encodeURIComponent('Escucha la Biblia completa en audio gratis 🎧✝ → sonidodevida.com');
        window.open(`https://wa.me/?text=${msg}`, '_blank');
        if (serverDL()) {
            try { const r = await SDV_Auth.shareBonus(); if (r.ok) dlState = r.data; } catch {}
        } else {
            if (localStorage.getItem(DL_KEY_SHARED) === todayStr()) return;
            localStorage.setItem(DL_KEY_SHARED, todayStr());
            localStorage.setItem(DL_KEY_COUNT, String(Math.max(0, getDLCountLocal() - 1)));
        }
        showToast('🎉 ¡+1 descarga desbloqueada! Gracias por compartir.');
        closeDownloadLimitModal();
        updateDownloadBtn();
    }

    function showUpgradeInterest() {
        closeDownloadLimitModal();
        showToast('¡Gracias por tu interés! Te avisaremos cuando esté disponible.');
    }

    const APP_URL = 'https://sonidodevida.com';
    const APP_SHARE_TEXT = 'Escucha la Biblia completa en audio gratis 🎧✝ → sonidodevida.com';

    function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
    function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function isIOSSafari() { return isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent); }

    const INSTALL_DONE_KEY = 'sdv-installed';
    const INSTALL_DISMISS_KEY = 'sdv-install-dismissed';
    const DISMISS_DAYS = 14; // tras cerrar la ventana, no volver a insistir por 2 semanas

    function alreadyInstalled() {
        try { if (localStorage.getItem(INSTALL_DONE_KEY) === '1') return true; } catch {}
        return isStandalone();
    }
    function recentlyDismissed() {
        try {
            const t = parseInt(localStorage.getItem(INSTALL_DISMISS_KEY) || '0', 10);
            return t > 0 && (Date.now() - t) < DISMISS_DAYS * 864e5;
        } catch { return false; }
    }
    function isMobile() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer:coarse)').matches; }
    // Solo ofrecer si: no está instalada, no se descartó hace poco, y es móvil
    // (en escritorio no auto-aparece; queda en el menú "Instalar app").
    function shouldOfferInstall() { return !alreadyInstalled() && !recentlyDismissed() && isMobile(); }

    let deferredPrompt;
    let welcomeShown = false;
    function maybeShowWelcome() {
        if (welcomeShown || !shouldOfferInstall()) return;
        welcomeShown = true;
        openWelcomeInstall();
    }
    function initPWA() {
        if (alreadyInstalled()) return; // ya instalada: nunca molestar
        // Android / Chrome / Edge (incluido escritorio): el navegador avisa que SÍ se puede instalar.
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; maybeShowWelcome(); });
        // Al instalar: recordar para no volver a pedirlo en este navegador.
        window.addEventListener('appinstalled', () => {
            try { localStorage.setItem(INSTALL_DONE_KEY, '1'); } catch {}
            closeWelcomeInstall(); deferredPrompt = null;
        });
        // iOS Safari no dispara beforeinstallprompt: ahí sí ofrecemos manualmente.
        if (isIOSSafari()) setTimeout(maybeShowWelcome, 1800);
        // En navegadores que NO soportan instalación (ej. Firefox de escritorio) no se
        // dispara beforeinstallprompt ni es iOS → no aparece nada (no se puede instalar).
    }
    function openWelcomeInstall() { closeMenu(); document.getElementById('welcomeInstallModal').classList.add('visible'); }
    function closeWelcomeInstall() {
        document.getElementById('welcomeInstallModal').classList.remove('visible');
        try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch {}
    }
    // CTA principal: instalar (adaptado a la plataforma)
    function triggerInstall() {
        if (deferredPrompt) { // Android / navegadores compatibles: prompt nativo
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; closeWelcomeInstall(); });
            return;
        }
        if (isIOS()) { closeWelcomeInstall(); openIosInstall(); return; }
        showToast('Abre el menú de tu navegador y elige "Instalar app"');
    }

    // Punto de entrada del menú "Instalar app"
    function openInstall(e) {
        if (e) e.preventDefault();
        closeMenu();
        if (alreadyInstalled()) { showToast('✅ Ya tienes la app instalada'); return; }
        openWelcomeInstall();
    }
    function openIosInstall() {
        closeWelcomeInstall();
        const note = document.getElementById('iosSafariNote');
        note.textContent = isIOSSafari() ? '' : '⚠️ Abre sonidodevida.com en Safari para poder instalarla.';
        document.getElementById('iosInstallModal').classList.add('visible');
    }
    function closeIosInstall() {
        document.getElementById('iosInstallModal').classList.remove('visible');
        if (isIOSSafari()) {
            const arrow = document.getElementById('iosArrow');
            arrow.classList.add('visible');
            setTimeout(() => arrow.classList.remove('visible'), 6000);
        }
    }

    // Compartir / QR
    let qrRendered = false;
    function openShareModal() {
        closeMenu();
        document.getElementById('shareModal').classList.add('visible');
        if (!qrRendered) renderQR();
    }
    function closeShareModal() { document.getElementById('shareModal').classList.remove('visible'); }
    function renderQR() {
        const box = document.getElementById('qrBox');
        const fallback = () => { box.innerHTML = '<img alt="Código QR de sonidodevida.com" src="https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=' + encodeURIComponent(APP_URL) + '">'; qrRendered = true; };
        const draw = () => { box.innerHTML = ''; new QRCode(box, { text: APP_URL, width: 320, height: 320, colorDark: '#0d0d1a', colorLight: '#ffffff' }); qrRendered = true; };
        if (window.QRCode) { draw(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = draw; s.onerror = fallback;
        document.head.appendChild(s);
    }
    function shareApp(how) {
        if (how === 'whatsapp') {
            window.open('https://wa.me/?text=' + encodeURIComponent(APP_SHARE_TEXT), '_blank');
        } else if (how === 'native') {
            if (navigator.share) { navigator.share({ title: 'Sonido de Vida', text: 'Escucha la Biblia completa en audio gratis 🎧✝', url: APP_URL }).catch(()=>{}); }
            else { shareApp('copy'); }
        } else if (how === 'copy') {
            navigator.clipboard.writeText(APP_URL).then(()=>showToast('🔗 Enlace copiado')).catch(()=>showToast(APP_URL));
        }
    }

    let toastTimer;
    function showToast(msg) {
        const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('visible');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
    }

    function createParticles() {
        const c = document.getElementById('particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div'); p.className = 'particle';
            p.style.left = Math.random()*100+'%';
            p.style.animationDuration = (Math.random()*8+5)+'s';
            p.style.animationDelay = (Math.random()*5)+'s';
            const s = (Math.random()*4+2)+'px'; p.style.width = p.style.height = s;
            c.appendChild(p);
        }
    }

    function initScrollAnimations() {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    function initNavbar() {
        window.addEventListener('scroll', () => document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50));
    }

    // Tira de versículos en movimiento (se duplica para un bucle continuo)
    function initVerseTicker() {
        const track = document.getElementById('verseTickerTrack');
        if (!track) return;
        const verses = [
            { t: 'El Señor es mi pastor, nada me faltará', r: 'Salmo 23:1' },
            { t: 'La fe es la certeza de lo que se espera', r: 'Hebreos 11:1' },
            { t: 'Porque de tal manera amó Dios al mundo', r: 'Juan 3:16' },
            { t: 'Yo soy el camino, la verdad y la vida', r: 'Juan 14:6' },
            { t: 'No temas, porque yo estoy contigo', r: 'Isaías 41:10' },
            { t: 'La palabra de Dios es viva y eficaz', r: 'Hebreos 4:12' },
            { t: 'Todo lo puedo en Cristo que me fortalece', r: 'Filipenses 4:13' },
            { t: 'Confía en Jehová con todo tu corazón', r: 'Proverbios 3:5' },
            { t: 'Conoceréis la verdad, y la verdad os libertará', r: 'Juan 8:32' },
            { t: 'Deléitate asimismo en Jehová', r: 'Salmo 37:4' }
        ];
        let html = '';
        for (let dup = 0; dup < 2; dup++) {
            verses.forEach(v => {
                html += '<span class="ticker-item"><span class="tk-sep">✦</span>“' + v.t + '”<span class="tk-ref">' + v.r + '</span></span>';
            });
        }
        track.innerHTML = html;
    }

    // Onda de muestra del reproductor del Inicio (decorativa)
    function faqToggle(card) {
        const isOpen = card.classList.contains('open');
        document.querySelectorAll('#faqGrid .faq-card.open').forEach(c => c.classList.remove('open'));
        if (!isOpen) card.classList.add('open');
    }

    function initShowcaseWave() {
        const c = document.getElementById('shwWaveBars');
        if (!c) return;
        const n = 90, prog = 0.35;
        for (let i = 0; i < n; i++) {
            const seed = Math.abs(Math.sin(i * 0.3) * 0.5 + Math.sin(i * 0.7) * 0.3 + Math.sin(i * 1.3) * 0.2);
            const ratio = i / (n - 1);
            const wb = document.createElement('div');
            wb.className = 'shw-wb ' + (ratio < prog ? 'on' : (Math.abs(ratio - prog) < 0.012 ? 'cur' : 'off'));
            wb.style.height = Math.max(4, seed * 48) + 'px';
            c.appendChild(wb);
        }
    }

    function toggleMobileMenu() {
        const b = document.getElementById('mobileMenuBtn'); if (b) b.classList.toggle('active');
        const l = document.getElementById('navLinks'); if (l) l.classList.toggle('open');
    }
    function closeMenu() {
        const b = document.getElementById('mobileMenuBtn'); if (b) b.classList.remove('active');
        const l = document.getElementById('navLinks'); if (l) l.classList.remove('open');
    }

    // ════════════════════════════════════════════════════════════════
    // Hub Podcast de Vida: enseñanzas en audio + resumen PDF (premium).
    // Los audios/PDF se sirven por el portero premium (/api/content/:id).
    // Para publicar un episodio: subir el audio a R2, registrarlo en
    // content_items (D1) y añadir aquí su { contentId } (y pdfId si hay PDF).
    // Mientras EPISODES esté vacío, el hub muestra el estado "Muy pronto".
    // ════════════════════════════════════════════════════════════════
    const Podcast = (function () {
        const overlay = document.getElementById('podcastOverlay');
        const listEl  = document.getElementById('podcastList');
        const emptyEl = document.getElementById('podcastEmpty');

        // Catálogo de episodios. Cada uno: audio (contentId) + lectura PDF (pdfId),
        // servidos por el portero premium (/api/content/:id). `image` = URL de la
        // portada (PNG/JPG de Canva); si falta, se usa el degradado `cover`.
        // Contenido reconstruido desde cero (2026-06-09). El episodio "Juan 1"
        // anterior se retiró (era una prueba); los nuevos audios premium se
        // graban con VozEdge a partir de /podcast-guiones/*.txt y se publican
        // sin PDF (solo audio). Para publicar: subir audio a R2 privado,
        // registrar en content_items (D1) y añadir aquí { title, ref, contentId }.
        const EPISODES = [
            { title:'En el principio era el Verbo',            ref:'Juan 1',       dur:'7 min', contentId:69, image:'covers/01-juan-1.jpg?v=4',          cover:'linear-gradient(150deg,#1b2c50,#0a1326 58%,#05070f)' },
            { title:'Lo que David sabía de las ovejas',        ref:'Salmo 23',     dur:'7 min', contentId:70, image:'covers/02-salmo-23.jpg?v=4',        cover:'linear-gradient(150deg,#1f3d2e,#10241b 58%,#060f0a)' },
            { title:'La palabra que Jesús casi inventó',       ref:'Mateo 6',      dur:'7 min', contentId:71, image:'covers/03-padre-nuestro.jpg?v=4',   cover:'linear-gradient(150deg,#3a2a18,#1d160c 58%,#0a0805)' },
            { title:'Laodicea y el agua tibia',                ref:'Apocalipsis 3',dur:'7 min', contentId:72, image:'covers/04-laodicea.jpg?v=4',        cover:'linear-gradient(150deg,#173f47,#0c2329 58%,#051013)' },
            { title:'El padre que corrió',                     ref:'Lucas 15',     dur:'8 min', contentId:73, image:'covers/05-hijo-prodigo.jpg?v=4',    cover:'linear-gradient(150deg,#5a2f1c,#2c1610 58%,#0f0805)' },
            { title:'Jonás no se trata del pez',               ref:'Jonás',        dur:'8 min', contentId:74, image:'covers/06-jonas.jpg?v=4',           cover:'linear-gradient(150deg,#16323f,#0b1c25 58%,#050d11)' },
            { title:'El camino de sangre',                     ref:'Lucas 10',     dur:'9 min', contentId:75, image:'covers/07-buen-samaritano.jpg?v=4', cover:'linear-gradient(150deg,#4a3a1e,#241c10 58%,#0d0a05)' },
            { title:'El secreto escrito en una cárcel',        ref:'Filipenses 4', dur:'8 min', contentId:76, image:'covers/08-filipenses-4.jpg?v=4',    cover:'linear-gradient(150deg,#2a2540,#161325 58%,#080610)' },
            { title:'Esperar es trenzar',                      ref:'Isaías 40',    dur:'8 min', contentId:77, image:'covers/09-isaias-40.jpg?v=4',       cover:'linear-gradient(150deg,#1d3550,#0f2030 58%,#060d14)' },
            { title:'La cita de las doce del mediodía',        ref:'Juan 4',       dur:'10 min',contentId:78, image:'covers/10-mujer-pozo.jpg?v=4',      cover:'linear-gradient(150deg,#3f2d1a,#231a0f 58%,#0d0905)' },
        ];
        // Índice del episodio destacado (tarjeta grande arriba).
        const FEATURED = 0;
        // Secciones apiladas estilo Dwell. Cada `items` lista índices de EPISODES
        // (pueden repetirse entre secciones, como en Dwell).
        const SECTIONS = [
            { title:'Recién llegados',           sub:'Las primeras enseñanzas en audio',                 items:[0,1,2,3,4,5,6,7,8,9] },
            { title:'Historias de Jesús',        sub:'Parábolas que esconden más de lo que parece',      items:[4,6,9] },
            { title:'Para encontrar paz',        sub:'Cuando el alma necesita descanso',                 items:[1,7,8,2] },
            { title:'Revelaciones que sorprenden', sub:'Detalles del texto original que lo cambian todo', items:[3,0,5,2] },
        ];

        // ── Reproductor de episodio independiente (audio propio) ──────────────
        const pAudio   = document.getElementById('podcastAudio');
        const player   = document.getElementById('podcastPlayer');
        const SPEEDS   = [1, 1.25, 1.5, 2, 0.75];
        let curIdx     = -1;   // episodio que se está viendo
        let loadedIdx  = -1;   // episodio ya cargado en pAudio (evita recargar)
        let curSpeed   = 1;

        function fmt(s) {
            if (!isFinite(s) || s < 0) s = 0;
            const m = Math.floor(s / 60), ss = Math.floor(s % 60);
            return m + ':' + String(ss).padStart(2, '0');
        }

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"]/g,
                c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
        }
        function coverStyle(ep) {
            return ep.image
                ? 'background-image:url(' + ep.image + ')'
                : '--cover:' + (ep.cover || 'linear-gradient(150deg,#1b2c50,#0a1326 58%,#05070f)');
        }
        // Click en cualquier tarjeta. Si el episodio aún no tiene audio
        // (contentId null) muestra "Próximamente" en vez de abrir vacío.
        function epClick(i) {
            const ep = EPISODES[i];
            if (!ep) return;
            if (!ep.contentId) {
                if (window.showToast) showToast('🎧 Próximamente — estamos grabando este episodio');
                return;
            }
            openEpisode(i);
        }

        function railCard(i) {
            const ep = EPISODES[i];
            return '<div class="pod-rail-card" data-ep="' + i + '">' +
                '<div class="prc-cover" style="' + coverStyle(ep) + '">' +
                    (ep.dur ? '<span class="prc-badge">' + esc(ep.dur) + '</span>' : '') +
                    '<span class="prc-play">▶</span>' +
                '</div>' +
                '<div class="prc-ref">' + esc((ep.ref || '').toUpperCase()) + '</div>' +
                '<h4 class="prc-title">' + esc(ep.title) + '</h4>' +
            '</div>';
        }

        function render() {
            if (!EPISODES.length) {
                listEl.innerHTML = ''; listEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }
            emptyEl.style.display = 'none';
            listEl.style.display = 'flex';
            let html = '';

            // Tarjeta destacada
            const f = EPISODES[FEATURED];
            if (f) {
                html += '<div class="pod-featured" data-ep="' + FEATURED + '">' +
                    '<div class="pf-cover" style="' + coverStyle(f) + '"></div>' +
                    '<div class="pf-body">' +
                        '<span class="pf-badge">Destacado</span>' +
                        '<span class="pf-ref">' + esc((f.ref || '').toUpperCase()) + '</span>' +
                        '<h3 class="pf-title">' + esc(f.title) + '</h3>' +
                        '<div class="pf-foot"><span class="pf-play">▶</span><span>' +
                            (f.dur ? esc(f.dur) + ' · ' : '') + 'Escuchar</span></div>' +
                    '</div></div>';
            }

            // Secciones con riel horizontal
            SECTIONS.forEach(sec => {
                const cards = sec.items.filter(i => EPISODES[i]).map(railCard).join('');
                if (!cards) return;
                html += '<div class="pod-section">' +
                    '<div class="pod-section-head"><div><h3>' + esc(sec.title) + '</h3>' +
                        (sec.sub ? '<span class="pod-section-sub">' + esc(sec.sub) + '</span>' : '') +
                    '</div></div>' +
                    '<div class="pod-rail">' + cards + '</div></div>';
            });

            listEl.innerHTML = html;
            listEl.querySelectorAll('[data-ep]').forEach(el => {
                el.addEventListener('click', () => epClick(+el.getAttribute('data-ep')));
            });
        }

        // Pinta la pantalla del episodio (cover, títulos) sin tocar el audio.
        function paintPlayer(ep) {
            const cover = document.getElementById('ppCover');
            if (ep.image) {
                cover.classList.add('has-img');
                cover.style.backgroundImage = 'url(' + ep.image + ')';
                cover.style.removeProperty('--cover');
            } else {
                cover.classList.remove('has-img');
                cover.style.backgroundImage = '';
                cover.style.setProperty('--cover', ep.cover || '');
            }
            document.getElementById('ppCoverRef').textContent = (ep.ref || '').toUpperCase();
            document.getElementById('ppCoverTitle').textContent = ep.title || 'Episodio';
            document.getElementById('ppTitle').textContent = ep.title || 'Episodio';
            document.getElementById('ppEyebrow').textContent = ep.ref ? 'Podcast de Vida · ' + ep.ref : 'Podcast de Vida';
            document.getElementById('ppRead').style.display = ep.pdfId ? '' : 'none';
        }

        // ¿El usuario tiene Premium activo? (todo el Podcast es premium).
        function isPremiumUser() {
            return !!(window.SDV_Auth && SDV_Auth.enabled && SDV_Auth.user && SDV_Auth.premium);
        }

        // Abre la pantalla del episodio (pinta + muestra el reproductor). NO
        // reproduce: la reproducción la dispara `startPlayback` (botón ▶), que
        // pasa por el portón premium. `opts.landing` = llegada por enlace
        // compartido (/?ep=ID): se queda en la portada esperando el gesto.
        async function openEpisode(i, opts) {
            opts = opts || {};
            const ep = EPISODES[i];
            if (!ep) return;
            curIdx = i;
            // Pausar la Biblia para no solapar dos audios a la vez
            try { document.getElementById('mainAudio').pause(); } catch (e) {}
            try { document.getElementById('mainAudioB').pause(); } catch (e) {}
            paintPlayer(ep);
            if (window.Listas) Listas.reflectLike(ep.contentId);
            player.classList.add('open');
            player.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';

            // Mismo episodio ya cargado → reanudar (no recargar ni reiniciar)
            if (loadedIdx === i && pAudio.src) {
                if (opts.landing) return;            // landing: no autoreproducir
                pAudio.playbackRate = curSpeed;
                pAudio.play().catch(() => {});
                setSession(ep);
                return;
            }
            // Episodio nuevo → cortar el audio del anterior ANTES de cargar el
            // nuevo (si no, el viejo sigue sonando durante el await de la red, y
            // hasta detrás del popup premium) y resetear la UI.
            try { pAudio.pause(); } catch (e) {}
            document.getElementById('ppSeekFill').style.width = '0%';
            document.getElementById('ppCur').textContent = '0:00';
            document.getElementById('ppDur').textContent = '--:--';
            updatePlayIcon(false);
            if (!ep.contentId) return;
            if (opts.landing) return;                // landing: espera el gesto ▶
            startPlayback(i);
        }

        // Reproduce realmente el episodio. Portón premium: si no es Premium,
        // muestra el popup (no intenta descargar el audio protegido).
        async function startPlayback(i) {
            const ep = EPISODES[i];
            if (!ep || !ep.contentId) return;
            if (!isPremiumUser()) { openPremium(); return; }
            // Cortar el audio del episodio anterior antes de cargar el nuevo.
            try { pAudio.pause(); } catch (e) {}
            try {
                const url = await SDV_Auth.loadContentBlob(ep.contentId);
                if (curIdx !== i) return;   // el usuario cambió mientras cargaba
                pAudio.src = url;
                loadedIdx = i;
                pAudio.playbackRate = curSpeed;
                pAudio.play().catch(() => {});
                setSession(ep);
            } catch (e) {
                // SOLO un 403 del portero significa "no eres premium". Cualquier
                // otro fallo (red, 404, token refrescándose) NO debe mostrar el
                // portón a quien SÍ es premium: sería el bug del popup fantasma.
                if (/\b403\b/.test(String(e && e.message))) {
                    openPremium();
                } else if (window.showToast) {
                    showToast('No se pudo cargar el episodio. Revisa tu conexión.');
                }
            }
        }

        // ── Compartir el episodio actual (enlace /?ep=contentId) ──────────
        async function shareCurrent() {
            const ep = EPISODES[curIdx];
            if (!ep || !ep.contentId) return;
            const url = APP_URL + '/?ep=' + ep.contentId;
            const texto = '🎧 Escucha «' + ep.title + '» en el Podcast de Vida';
            if (navigator.share) {
                try { await navigator.share({ title: ep.title, text: texto, url: url }); return; }
                catch (e) { if (e && e.name === 'AbortError') return; }
            }
            try { await navigator.clipboard.writeText(url); if (window.showToast) showToast('🔗 Enlace del episodio copiado'); }
            catch (e) { window.prompt('Copia el enlace del episodio:', url); }
        }

        // ── Popup "Podcast es Premium" (al reproducir sin Premium) ────────
        function openPremium() {
            const m = document.getElementById('podcastPremiumModal');
            if (!m) { if (window.showToast) showToast('🎧 El Podcast de Vida es Premium ✨'); return; }
            const logged = !!(window.SDV_Auth && SDV_Auth.user);
            const cta = document.getElementById('podPremCta');
            const second = document.getElementById('podPremSecond');
            if (cta) {
                cta.textContent = logged ? '✨ Empezar prueba de 7 días gratis' : '👤 Crear cuenta y empezar gratis';
                cta.onclick = () => { closePremium(); Premium.checkout(); };
            }
            // Si no hay sesión, ofrece crear cuenta gratis (para poder guardar).
            if (second) second.style.display = logged ? 'none' : '';
            m.classList.add('visible');
            m.setAttribute('aria-hidden', 'false');
        }
        function closePremium() {
            const m = document.getElementById('podcastPremiumModal');
            if (!m) return;
            m.classList.remove('visible');
            m.setAttribute('aria-hidden', 'true');
        }

        // Llegada por enlace compartido (/?ep=contentId): abre el hub del
        // Podcast y deja el episodio en portada (sin reproducir). Reproducir y
        // guardar siguen pasando por sus portones (premium / cuenta).
        function checkSharedEpisode() {
            try {
                const raw = new URLSearchParams(window.location.search).get('ep');
                if (!raw || !/^\d+$/.test(raw)) return;
                const cid = parseInt(raw, 10);
                const i = EPISODES.findIndex(function (e) { return e.contentId === cid; });
                if (i < 0) return;
                open();                              // hub detrás (atrás → Podcast)
                openEpisode(i, { landing: true });   // portada del episodio
            } catch (e) {}
        }

        function closePlayer() {
            try { pAudio.pause(); } catch (e) {}
            player.classList.remove('open');
            player.setAttribute('aria-hidden', 'true');
            // Si el hub (lista) sigue abierto, mantener el scroll bloqueado
            if (!overlay.classList.contains('open')) document.body.style.overflow = '';
        }

        function toggle() {
            if (!pAudio.src) { if (curIdx >= 0) startPlayback(curIdx); return; }
            if (pAudio.paused) pAudio.play().catch(() => {}); else pAudio.pause();
        }
        function skip(sec) {
            if (!pAudio.duration) return;
            pAudio.currentTime = Math.min(pAudio.duration, Math.max(0, pAudio.currentTime + sec));
        }
        function seek(e) {
            if (!pAudio.duration) return;
            const r = e.currentTarget.getBoundingClientRect();
            pAudio.currentTime = ((e.clientX - r.left) / r.width) * pAudio.duration;
        }
        function cycleSpeed() {
            curSpeed = SPEEDS[(SPEEDS.indexOf(curSpeed) + 1) % SPEEDS.length];
            pAudio.playbackRate = curSpeed;
            document.getElementById('ppSpeed').textContent = curSpeed + '×';
        }
        // Abre la pestaña ANTES del await para no perder el gesto (anti pop-up).
        function readCurrent() {
            const ep = EPISODES[curIdx];
            if (!ep || !ep.pdfId) return;
            const w = window.open('', '_blank');
            SDV_Auth.loadContentBlob(ep.pdfId).then(url => {
                if (w) w.location = url; else window.location.href = url;
            }).catch(() => {
                if (w) w.close();
                alert('Esta lectura es para miembros. Inicia sesión o hazte Premium para leerla.');
            });
        }

        function updatePlayIcon(playing) {
            document.getElementById('ppPlayIcon').style.display  = playing ? 'none' : '';
            document.getElementById('ppPauseIcon').style.display = playing ? '' : 'none';
        }

        function setSession(ep) {
            if (!('mediaSession' in navigator)) return;
            try {
                // La portada (incrustada con el título) aparece en la pantalla
                // bloqueada — el efecto "Dwell". Si no hay imagen, iconos genéricos.
                const art = ep.image
                    ? [{ src: ep.image, sizes: '896x1280', type: 'image/jpeg' }]
                    : [
                        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
                      ];
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: ep.title || 'Podcast de Vida',
                    artist: 'Sonido de Vida',
                    album: ep.ref ? 'Podcast de Vida · ' + ep.ref : 'Podcast de Vida',
                    artwork: art,
                });
                navigator.mediaSession.setActionHandler('play',         () => pAudio.play());
                navigator.mediaSession.setActionHandler('pause',        () => pAudio.pause());
                navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
                navigator.mediaSession.setActionHandler('seekforward',  () => skip(15));
            } catch (e) {}
        }

        // Eventos del audio del podcast (independientes del motor bíblico)
        pAudio.addEventListener('play',  () => { updatePlayIcon(true);  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
        pAudio.addEventListener('pause', () => { updatePlayIcon(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
        pAudio.addEventListener('ended', () => updatePlayIcon(false));
        pAudio.addEventListener('loadedmetadata', () => { document.getElementById('ppDur').textContent = fmt(pAudio.duration); });
        pAudio.addEventListener('timeupdate', () => {
            if (!pAudio.duration) return;
            document.getElementById('ppSeekFill').style.width = (pAudio.currentTime / pAudio.duration * 100) + '%';
            document.getElementById('ppCur').textContent = fmt(pAudio.currentTime);
        });

        function open() {
            render();
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
        function close() {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            if (!player.classList.contains('open')) document.body.style.overflow = '';
        }
        return {
            open, close, openEpisode, closePlayer, toggle, skip, seek, cycleSpeed, readCurrent,
            shareCurrent, openPremium, closePremium, checkSharedEpisode,
            episodes: function () { return EPISODES; },
            playEpisode: function (i) { open(); epClick(i); },
            // Helpers para Listas (Fase 2): mapear por content_id y saber el actual.
            currentContentId: function () { return EPISODES[curIdx] ? EPISODES[curIdx].contentId : null; },
            indexByContentId: function (c) { return EPISODES.findIndex(function (e) { return e.contentId === c; }); },
            episodeByContentId: function (c) { return EPISODES.find(function (e) { return e.contentId === c; }) || null; },
            // Abre el reproductor de un episodio por content_id, sin abrir el hub
            // (lo usa la vista pública de una lista compartida).
            playByContentId: function (c) { var i = EPISODES.findIndex(function (e) { return e.contentId === c; }); if (i >= 0) openEpisode(i); },
        };
    })();
    window.Podcast = Podcast;

    /* ════════ Música para tu día (puro sonido por actividad, SIN voz) ════════
       Playlists instrumentales pensadas para acompañar momentos (ejercicio,
       concentración, oración, dormir…). Mixto: unas gratis (gancho) y otras
       premium (reúsan el popup premium del Podcast). FASE 1: andamiaje + estado
       "Próximamente" (igual que arrancó el Podcast). FASE 2 (cuando haya MP3):
       reproductor con bucle + mezcla suave + fade-out de sueño + portón premium.
       Para activar una playlist: subir las pistas a R2 y poner sus URLs/contentId
       en `tracks` (gratis → URL pública del worker de audio; premium → contentId
       del portero /api/content/:id). Mientras `tracks` esté vacío, sale "Próximamente".
       ═══════════════════════════════════════════════════════════════════════ */
    const Musica = (function () {
        // free:true  → la pista se sirve por URL pública (gancho, sin login).
        // free:false → premium: se sirve por el portero /api/content/:id.
        // Categorías = las actividades de MÚSICA FUNCIONAL más buscadas (datos de
        // streaming 2025): estudiar, ejercicio, enfoque/productividad y dormir son
        // el top; "empezar el día" y "calma" completan. Free = los 3 imanes de
        // mayor búsqueda (gancho); Premium = los rituales diarios "pegajosos".
        // Para cambiar el acceso de cualquiera: voltear su `free`.
        const PLAYLISTS = [
            { id:'ejercicio', nombre:'Ejercicio',      sub:'Energía para entrenar',         icon:'🏋️', free:true,  cover:'linear-gradient(150deg,#5a2f1c,#2c1610 58%,#0f0805)', tracks:[] },
            { id:'estudiar',  nombre:'Estudiar',       sub:'Concentración sin distracción', icon:'📚', free:true,  cover:'linear-gradient(150deg,#1d3550,#0f2030 58%,#060d14)', tracks:[] },
            { id:'enfoque',   nombre:'Enfoque',        sub:'Para trabajar y producir',      icon:'💻', free:true,  cover:'linear-gradient(150deg,#173f47,#0c2329 58%,#051013)', tracks:[] },
            { id:'manana',    nombre:'Empezar el día', sub:'Despierta con calma',           icon:'☀️', free:false, cover:'linear-gradient(150deg,#5a4a1e,#2c2410 58%,#0f0c05)', tracks:[] },
            { id:'dormir',    nombre:'Dormir',         sub:'Para descansar de verdad',      icon:'😴', free:false, cover:'linear-gradient(150deg,#16323f,#0b1c25 58%,#050d11)', tracks:[] },
            { id:'calma',     nombre:'Calma',          sub:'Respira y suelta el estrés',    icon:'🧘', free:false, cover:'linear-gradient(150deg,#1f3d2e,#10241b 58%,#060f0a)', tracks:[] },
        ];

        function openPlaylist(i) {
            const pl = PLAYLISTS[i];
            if (!pl) return;
            // FASE 1: sin pistas todavía → "Próximamente" (como el Podcast).
            if (!pl.tracks || !pl.tracks.length) {
                if (window.showToast) showToast('🎶 Próximamente — estamos preparando esta música');
                return;
            }
            // FASE 2 (pendiente): abrir el reproductor de música.
            // if (!pl.free && !(window.SDV_Auth && SDV_Auth.user && SDV_Auth.premium)) { Podcast.openPremium(); return; }
            // … reproductor con bucle + fade-out de sueño …
        }

        return {
            playlists: function () { return PLAYLISTS; },
            openPlaylist,
        };
    })();
    window.Musica = Musica;

    /* ════════ Explorar: feed por escalones (reusa Podcast + Pasajes) ════════ */
    const Explore = (function () {
        function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);}); }
        // Tarjeta uniforme: imagen 3/4 con la info ENCIMA (blanco sobre foto oscura
        // = legible sobre el fondo crema del tema). Mismo molde para episodios y colecciones.
        // Portada limpia (sin texto horneado) + título HTML blanco encima, igual que
        // Pasajes: el blanco sobre la foto oscura se lee siempre, sin esfuerzo.
        function cardEp(i, ep){
            return '<div class="ex-card" role="button" tabindex="0" data-ex="ep:'+i+'">'+
                '<div class="ex-card-cover" style="background-image:url(\''+esc(ep.image||'')+'\')">'+
                    '<span class="ex-card-lock">✨ Premium</span>'+
                    (ep.dur?'<span class="ex-card-dur">'+esc(ep.dur)+'</span>':'')+
                    '<span class="ex-card-play">▶</span>'+
                    '<div class="ex-card-meta"><p class="ex-card-ref">'+esc((ep.ref||'').toUpperCase())+'</p>'+
                    '<p class="ex-card-title">'+esc(ep.title)+'</p></div>'+
                '</div></div>';
        }
        // Devocionales destacados para el riel de Explorar. Portada tipográfica
        // (degradado de marca, igual que la página /devocionales) → uniforme con
        // el resto de tarjetas sin depender de fotos. Enlaza a /devocional/{slug}.
        const DEVOS = [
            { slug:'lucas-15',       ref:'Lucas 15:20',    title:'El padre que corrió',        grad:'linear-gradient(155deg,#4a3a1a,#28200f 60%,#0f0c05)' },
            { slug:'1-corintios-13', ref:'1 Corintios 13', title:'El amor que no sentimos',    grad:'linear-gradient(155deg,#46203a,#260f20 60%,#100610)' },
            { slug:'josue-1-9',      ref:'Josué 1:9',      title:'Esfuérzate y sé valiente',   grad:'linear-gradient(155deg,#4a2418,#28140d 60%,#0f0705)' },
            { slug:'mateo-11-28',    ref:'Mateo 11:28',    title:'Venid a mí, los cansados',   grad:'linear-gradient(155deg,#26331c,#141d0f 60%,#080d05)' },
            { slug:'salmos-46-10',   ref:'Salmos 46:10',   title:'Estad quietos',              grad:'linear-gradient(155deg,#14384a,#0a2230 60%,#050f15)' },
            { slug:'hebreos-7',      ref:'Hebreos 7:3',    title:'Melquisedec, el más misterioso', grad:'linear-gradient(155deg,#3a2147,#201230 60%,#0c0612)' },
            { slug:'apocalipsis-3',  ref:'Apocalipsis 3',  title:'Ni frío ni caliente',        grad:'linear-gradient(155deg,#4a3320,#281a0f 60%,#0f0805)' },
            { slug:'juan-4',         ref:'Juan 4',         title:'La mujer junto al pozo',     grad:'linear-gradient(155deg,#15364a,#0b2030 60%,#050d14)' },
            { slug:'salmos-23',      ref:'Salmos 23',      title:'El Señor es mi pastor',      grad:'linear-gradient(155deg,#1f3d2e,#10241b 60%,#060f0a)' },
            { slug:'isaias-40-31',   ref:'Isaías 40:31',   title:'Nuevas fuerzas',             grad:'linear-gradient(155deg,#1d3550,#0f2030 60%,#060d14)' },
            { slug:'jeremias-29-11', ref:'Jeremías 29:11', title:'Pensamientos de paz',        grad:'linear-gradient(155deg,#2a2540,#161325 60%,#080610)' },
            { slug:'filipenses-4-13',ref:'Filipenses 4:13',title:'Todo lo puedo en Cristo',    grad:'linear-gradient(155deg,#3a2a18,#1d160c 60%,#0a0805)' },
            { slug:'salmos-91',      ref:'Salmos 91',      title:'Al abrigo del Altísimo',     grad:'linear-gradient(155deg,#173f47,#0c2329 60%,#051013)' },
            { slug:'romanos-8-28',   ref:'Romanos 8:28',   title:'Todo ayuda a bien',          grad:'linear-gradient(155deg,#5a2f1c,#2c1610 60%,#0f0805)' },
            { slug:'romanos-8-1',    ref:'Romanos 8:1',    title:'Ninguna condenación',        grad:'linear-gradient(155deg,#3a1a1a,#241010 60%,#0d0505)' },
            { slug:'proverbios-3-5', ref:'Proverbios 3:5', title:'Confía con todo el corazón', grad:'linear-gradient(155deg,#1b2c50,#0a1326 60%,#05070f)' },
            { slug:'juan-3-16',      ref:'Juan 3:16',      title:'De tal manera amó Dios',     grad:'linear-gradient(155deg,#3f2d1a,#231a0f 60%,#0d0905)' },
            { slug:'mateo-6-33',     ref:'Mateo 6:33',     title:'Busca primero el reino',     grad:'linear-gradient(155deg,#16323f,#0b1c25 60%,#050d11)' },
            { slug:'genesis-1-1',    ref:'Génesis 1:1',    title:'En el principio',            grad:'linear-gradient(155deg,#1a1a3e,#2d1b69 60%,#0d0d1a)' },
        ];
        // Portada al óleo limpia (covers/devo-{slug}.jpg) + ref y título HTML blanco
        // encima, igual que Pasajes. El degradado va de respaldo mientras carga.
        function cardDevo(d){
            return '<a class="ex-card ex-card-devo" href="/devocional/'+esc(d.slug)+'" aria-label="Devocional: '+esc(d.title)+'">'+
                '<div class="ex-card-cover" style="background-image:url(\'covers/devo-'+esc(d.slug)+'.jpg?v=3\'),'+d.grad+'">'+
                    '<span class="ex-card-read">Leer ›</span>'+
                    '<div class="ex-card-meta"><p class="ex-card-ref">'+esc((d.ref||'').toUpperCase())+'</p>'+
                    '<p class="ex-card-title">'+esc(d.title)+'</p></div>'+
                '</div></a>';
        }
        function cardCol(i, col){
            return '<div class="ex-card" role="button" tabindex="0" data-ex="col:'+i+'">'+
                '<div class="ex-card-cover" style="background-image:url(\''+esc(col.cover)+'\')">'+
                    '<span class="ex-card-play">▶</span>'+
                    '<div class="ex-card-meta"><p class="ex-card-ref">'+col.tracks.length+' pasajes</p>'+
                    '<p class="ex-card-title">'+esc(col.titulo)+'</p></div>'+
                '</div></div>';
        }
        // Música por actividad (puro sonido). Portada por degradado (aún sin foto);
        // badge Premium si no es gratis. El ▶ es 🎶 mientras no haya pistas.
        function cardMix(i, pl){
            var hasAudio = !!(pl.tracks && pl.tracks.length);
            return '<div class="ex-card" role="button" tabindex="0" data-mix="'+i+'">'+
                '<div class="ex-card-cover" style="background:'+esc(pl.cover)+'">'+
                    (pl.free ? '' : '<span class="ex-card-lock">✨ Premium</span>')+
                    '<span class="ex-card-play">'+(hasAudio?'▶':'🎶')+'</span>'+
                    '<div class="ex-card-meta"><p class="ex-card-ref">'+esc(pl.icon+' '+(pl.free?'GRATIS':'PREMIUM'))+'</p>'+
                    '<p class="ex-card-title">'+esc(pl.nombre)+'</p></div>'+
                '</div></div>';
        }
        function render(){
            // No poblar escalones ocultos (recorte 2026): evita cargar portadas/red inútil.
            var hidden=function(el){ var t=el&&el.closest('.ex-tier'); return !!(t && t.style.display==='none'); };
            var rp=document.getElementById('exRailPodcast');
            var rc=document.getElementById('exRailPasajes');
            if(rp && !hidden(rp) && window.Podcast && Podcast.episodes){
                rp.innerHTML = Podcast.episodes().map(function(ep,i){return cardEp(i,ep);}).join('');
            }
            if(rc && !hidden(rc) && window.Pasajes && Pasajes.collections){
                rc.innerHTML = Pasajes.collections().map(function(col,i){return cardCol(i,col);}).join('');
            }
            var rd=document.getElementById('exRailDevos');
            if(rd){ rd.innerHTML = DEVOS.map(cardDevo).join(''); }
            var rm=document.getElementById('exRailMusica');
            if(rm && !hidden(rm) && window.Musica && Musica.playlists){
                rm.innerHTML = Musica.playlists().map(function(pl,i){return cardMix(i,pl);}).join('');
            }
            document.querySelectorAll('#exRailPodcast .ex-card, #exRailPasajes .ex-card').forEach(function(el){
                var go=function(){ var p=el.getAttribute('data-ex').split(':'); var i=+p[1];
                    if(p[0]==='ep' && window.Podcast) Podcast.playEpisode(i);
                    else if(p[0]==='col' && window.Pasajes) Pasajes.openAt(i); };
                el.addEventListener('click', go);
                el.addEventListener('keydown', function(e){ if(e.key==='Enter') go(); });
            });
            document.querySelectorAll('#exRailMusica .ex-card').forEach(function(el){
                var go=function(){ if(window.Musica) Musica.openPlaylist(+el.getAttribute('data-mix')); };
                el.addEventListener('click', go);
                el.addEventListener('keydown', function(e){ if(e.key==='Enter') go(); });
            });
            setupAutoScroll();
        }
        // Auto-scroll suave (ping-pong) que da "vida" a los rieles sin impedir el
        // deslizamiento manual. OPTIMIZADO (2026-06-21): un solo bucle rAF que
        //  · SOLO corre mientras Explorar está activa y la pestaña visible (antes
        //    corría siempre, en todas las pestañas, saturando el render);
        //  · cachea scrollWidth/clientWidth (recalculado en resize/kick) para no
        //    forzar reflow sincrónico en cada frame.
        // Se pausa al tocar/pasar el ratón. Respeta prefers-reduced-motion.
        var _autoRails = [], _autoRaf = null;
        function _autoMax(rail){ rail._max = rail.scrollWidth - rail.clientWidth; }
        function _autoTick(){
            _autoRaf = null;
            if (document.hidden || document.body.getAttribute('data-tab-active') !== 'explorar') return;
            for (var i = 0; i < _autoRails.length; i++){
                var rail = _autoRails[i];
                if (rail._paused) continue;
                var max = rail._max || 0;
                if (max > 4){
                    rail.scrollLeft += rail._dir * 0.35;
                    if (rail.scrollLeft >= max - 0.5) rail._dir = -1;
                    else if (rail.scrollLeft <= 0.5) rail._dir = 1;
                }
            }
            _autoRaf = requestAnimationFrame(_autoTick);
        }
        function kickAutoScroll(){
            if (_autoRaf == null && !document.hidden && _autoRails.length &&
                document.body.getAttribute('data-tab-active') === 'explorar'){
                _autoRails.forEach(_autoMax);
                _autoRaf = requestAnimationFrame(_autoTick);
            }
        }
        window.kickAutoScroll = kickAutoScroll;
        function setupAutoScroll(){
            if (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return;
            _autoRails = Array.prototype.slice.call(document.querySelectorAll('.ex-rail[data-auto], .fx-rail[data-auto]'));
            _autoRails.forEach(function(rail){
                _autoMax(rail);
                if (rail._autoInit) return; rail._autoInit = true;
                rail._dir = 1; rail._paused = false;
                var pause = function(){ rail._paused = true; clearTimeout(rail._idle);
                    rail._idle = setTimeout(function(){ rail._paused = false; kickAutoScroll(); }, 2600); };
                ['pointerdown','touchstart','wheel','mouseenter'].forEach(function(ev){ rail.addEventListener(ev, pause, {passive:true}); });
            });
            if (!window._autoGlobInit){
                window._autoGlobInit = true;
                window.addEventListener('resize', function(){ _autoRails.forEach(_autoMax); }, {passive:true});
                document.addEventListener('visibilitychange', kickAutoScroll);
            }
            kickAutoScroll();
        }
        return { render };
    })();
    window.Explore = Explore;
    if(document.readyState!=='loading') Explore.render();
    else document.addEventListener('DOMContentLoaded', Explore.render);

    /* ════════ Pasajes de Vida (colecciones curadas) ════════ */
    /* ════════ Pasajes de Vida (colecciones curadas) ════════ */
    const Pasajes = (function () {
        const COLLECTIONS = [
            {
                id: 'ansiedad', titulo: 'Para la Ansiedad', subtitulo: 'Ancla tu corazón en su paz',
                cover: '/covers/col-ansiedad.jpg',
                tracks: [
                    { libro: 'Filipenses', cap: 4,  hint: 'Todo lo puedo en Cristo' },
                    { libro: 'Juan',       cap: 14, hint: 'No se turbe vuestro corazón' },
                    { libro: 'Salmos',     cap: 23, hint: 'El Señor es mi pastor' },
                    { libro: 'Salmos',     cap: 46, hint: 'Dios es nuestro refugio' },
                    { libro: 'Isaias',     cap: 41, hint: 'No temas, yo estoy contigo' },
                    { libro: '1 Pedro',    cap: 5,  hint: 'Echad vuestra ansiedad sobre él' },
                    { libro: 'Mateo',      cap: 6,  hint: 'No os afanéis por el mañana' },
                ],
            },
            {
                id: 'descanso', titulo: 'Para Dormir', subtitulo: 'Reposa bajo la sombra del Altísimo',
                cover: '/covers/col-descanso.jpg',
                tracks: [
                    { libro: 'Salmos', cap: 91,  hint: 'Al abrigo del Altísimo' },
                    { libro: 'Salmos', cap: 23,  hint: 'Me hará descansar' },
                    { libro: 'Mateo',  cap: 11,  hint: 'Venid a mí y descansad' },
                    { libro: 'Salmos', cap: 4,   hint: 'En paz me acostaré' },
                    { libro: 'Salmos', cap: 131, hint: 'Como un niño destetado' },
                    { libro: 'Salmos', cap: 127, hint: 'A su amado dará el sueño' },
                    { libro: 'Salmos', cap: 3,   hint: 'Yo me acosté y dormí' },
                ],
            },
            {
                id: 'consuelo', titulo: 'Consuelo en el Dolor', subtitulo: 'Cerca del Dios que sana el corazón',
                cover: '/covers/col-consuelo.jpg',
                tracks: [
                    { libro: 'Salmos',      cap: 34,  hint: 'Cerca de los quebrantados' },
                    { libro: 'Salmos',      cap: 42,  hint: '¿Por qué te abates, alma mía?' },
                    { libro: '2 Corintios', cap: 1,   hint: 'El Padre de toda consolación' },
                    { libro: 'Mateo',       cap: 5,   hint: 'Bienaventurados los que lloran' },
                    { libro: 'Apocalipsis', cap: 21,  hint: 'Enjugará toda lágrima' },
                    { libro: 'Salmos',      cap: 147, hint: 'Sana a los quebrantados de corazón' },
                ],
            },
            { id:'gratitud', titulo:'Para dar Gracias', subtitulo:'Cuenta de nuevo sus bendiciones', cover:'/covers/col-gratitud.jpg', tracks:[
                { libro:'Salmos', cap:100, hint:'Servid a Jehová con alegría' },
                { libro:'Salmos', cap:103, hint:'Bendice, alma mía, a Jehová' },
                { libro:'Salmos', cap:136, hint:'Para siempre es su misericordia' },
                { libro:'Salmos', cap:138, hint:'Te alabaré con todo mi corazón' },
                { libro:'Filipenses', cap:4, hint:'Con acción de gracias' },
                { libro:'Colosenses', cap:3, hint:'Y sed agradecidos' },
                { libro:'1 Tesalonicenses', cap:5, hint:'Dad gracias en todo' },
            ]},
            { id:'esperanza', titulo:'Para la Esperanza', subtitulo:'Levanta los ojos al que viene', cover:'/covers/col-esperanza.jpg', tracks:[
                { libro:'Isaias', cap:40, hint:'Tendrán nuevas fuerzas' },
                { libro:'Romanos', cap:8, hint:'Nada nos separará de su amor' },
                { libro:'Lamentaciones', cap:3, hint:'Nuevas son cada mañana' },
                { libro:'Salmos', cap:42, hint:'Espera en Dios' },
                { libro:'Jeremias', cap:29, hint:'Pensamientos de paz' },
                { libro:'Hebreos', cap:11, hint:'La certeza de lo que se espera' },
                { libro:'Apocalipsis', cap:21, hint:'Enjugará toda lágrima' },
            ]},
            { id:'confianza', titulo:'Para Confiar', subtitulo:'Descansa en sus manos', cover:'/covers/col-confianza.jpg', tracks:[
                { libro:'Proverbios', cap:3, hint:'Fíate de Jehová de todo tu corazón' },
                { libro:'Salmos', cap:27, hint:'Jehová es mi luz y mi salvación' },
                { libro:'Salmos', cap:37, hint:'Encomienda a Jehová tu camino' },
                { libro:'Salmos', cap:91, hint:'Al abrigo del Altísimo' },
                { libro:'Isaias', cap:41, hint:'No temas, yo estoy contigo' },
                { libro:'Josue', cap:1, hint:'Esfuérzate y sé valiente' },
                { libro:'Mateo', cap:6, hint:'Buscad primeramente su reino' },
            ]},
            { id:'perdon', titulo:'Para el Perdón', subtitulo:'Lavado y restaurado', cover:'/covers/col-perdon.jpg', tracks:[
                { libro:'Salmos', cap:32, hint:'Bienaventurado el perdonado' },
                { libro:'Salmos', cap:51, hint:'Crea en mí un corazón limpio' },
                { libro:'Salmos', cap:103, hint:'No conforme a nuestras iniquidades' },
                { libro:'Isaias', cap:1, hint:'Como la nieve serán emblanquecidos' },
                { libro:'Lucas', cap:15, hint:'Se había perdido, y es hallado' },
                { libro:'Efesios', cap:1, hint:'El perdón de pecados' },
                { libro:'1 Juan', cap:1, hint:'Fiel y justo para perdonar' },
            ]},
            { id:'amor', titulo:'El Amor de Dios', subtitulo:'Cuánto te ama el Padre', cover:'/covers/col-amor.jpg', tracks:[
                { libro:'Juan', cap:3, hint:'De tal manera amó Dios' },
                { libro:'Romanos', cap:8, hint:'Más que vencedores' },
                { libro:'1 Juan', cap:4, hint:'Dios es amor' },
                { libro:'Efesios', cap:3, hint:'El amor que excede todo conocimiento' },
                { libro:'1 Corintios', cap:13, hint:'El amor es sufrido, es benigno' },
                { libro:'Salmos', cap:136, hint:'Para siempre es su misericordia' },
                { libro:'Lucas', cap:15, hint:'El padre que corrió' },
            ]},
            { id:'miedo', titulo:'Para el Miedo', subtitulo:'No temas, Él está contigo', cover:'/covers/col-miedo.jpg', tracks:[
                { libro:'Josue', cap:1, hint:'Esfuérzate y sé valiente' },
                { libro:'Isaias', cap:41, hint:'No temas, yo estoy contigo' },
                { libro:'Salmos', cap:27, hint:'Jehová es mi luz, ¿de quién temeré?' },
                { libro:'2 Timoteo', cap:1, hint:'No espíritu de cobardía' },
                { libro:'Salmos', cap:56, hint:'En Dios confío, no temeré' },
                { libro:'Salmos', cap:91, hint:'No temerás el terror nocturno' },
                { libro:'Mateo', cap:8, hint:'¿Por qué teméis?' },
            ]},
            { id:'fuerzas', titulo:'Para las Fuerzas', subtitulo:'Nuevas fuerzas cuando estás cansado', cover:'/covers/col-fuerzas.jpg', tracks:[
                { libro:'Isaias', cap:40, hint:'Tendrán nuevas fuerzas' },
                { libro:'Mateo', cap:11, hint:'Venid a mí los cansados' },
                { libro:'Salmos', cap:121, hint:'Mi socorro viene de Jehová' },
                { libro:'2 Corintios', cap:12, hint:'Mi poder en la debilidad' },
                { libro:'Filipenses', cap:4, hint:'Todo lo puedo en Cristo' },
                { libro:'Salmos', cap:73, hint:'La roca de mi corazón' },
                { libro:'Habacuc', cap:3, hint:'Jehová es mi fortaleza' },
            ]},
            { id:'soledad', titulo:'Para la Soledad', subtitulo:'Nunca estás solo', cover:'/covers/col-soledad.jpg', tracks:[
                { libro:'Salmos', cap:139, hint:'¿A dónde me iré de tu Espíritu?' },
                { libro:'Deuteronomio', cap:31, hint:'No te dejaré ni desampararé' },
                { libro:'Hebreos', cap:13, hint:'No te desampararé' },
                { libro:'Salmos', cap:25, hint:'Mírame, estoy solo y afligido' },
                { libro:'Isaias', cap:43, hint:'Yo estaré contigo' },
                { libro:'Juan', cap:14, hint:'No os dejaré huérfanos' },
                { libro:'Salmos', cap:68, hint:'Hace habitar en familia al solo' },
            ]},
            { id:'sanidad', titulo:'Para la Sanidad', subtitulo:'El Dios que sana tus dolencias', cover:'/covers/col-sanidad.jpg', tracks:[
                { libro:'Salmos', cap:103, hint:'Sana todas tus dolencias' },
                { libro:'Santiago', cap:5, hint:'La oración de fe sanará' },
                { libro:'Salmos', cap:41, hint:'Jehová lo sostendrá en el lecho' },
                { libro:'Isaias', cap:53, hint:'Por su llaga fuimos sanados' },
                { libro:'Salmos', cap:30, hint:'Clamé, y me sanaste' },
                { libro:'Salmos', cap:147, hint:'Sana a los quebrantados' },
                { libro:'Jeremias', cap:17, hint:'Sáname, y seré sano' },
            ]},
            { id:'provision', titulo:'Para la Provisión', subtitulo:'Tu Padre sabe lo que necesitas', cover:'/covers/col-provision.jpg', tracks:[
                { libro:'Mateo', cap:6, hint:'No os afanéis, buscad su reino' },
                { libro:'Filipenses', cap:4, hint:'Mi Dios suplirá todo' },
                { libro:'Salmos', cap:23, hint:'Nada me faltará' },
                { libro:'Proverbios', cap:3, hint:'Honra a Jehová con tus bienes' },
                { libro:'Salmos', cap:37, hint:'No vi al justo desamparado' },
                { libro:'Lucas', cap:12, hint:'Mirad las aves del cielo' },
                { libro:'Salmos', cap:34, hint:'Nada falta a los que le buscan' },
            ]},
            { id:'direccion', titulo:'Para Decidir', subtitulo:'Él dirige tus pasos', cover:'/covers/col-direccion.jpg', tracks:[
                { libro:'Proverbios', cap:3, hint:'Él enderezará tus veredas' },
                { libro:'Salmos', cap:32, hint:'Te haré entender el camino' },
                { libro:'Santiago', cap:1, hint:'Pedid sabiduría a Dios' },
                { libro:'Salmos', cap:25, hint:'Encamíname en tu verdad' },
                { libro:'Proverbios', cap:16, hint:'Jehová endereza sus pasos' },
                { libro:'Isaias', cap:30, hint:'Este es el camino, andad por él' },
                { libro:'Jeremias', cap:29, hint:'Pensamientos de paz' },
            ]},
        ];

        const overlay    = document.getElementById('pasajesOverlay');
        const navBack    = document.getElementById('pjNavBack');
        const navTitle   = document.getElementById('pjNavTitle');
        const scCols     = document.getElementById('pjScreenCols');
        const scTrks     = document.getElementById('pjScreenTrks');
        const colsGrid   = document.getElementById('pjColsGrid');
        const trkCover   = document.getElementById('pjTrkCover');
        const trkName    = document.getElementById('pjTrkName');
        const trkSub     = document.getElementById('pjTrkSub');
        const trkList    = document.getElementById('pjTrkList');
        const playerBar  = document.getElementById('pjPlayerBar');
        const playerFill = document.getElementById('pjPlayerFill');
        const playerRef  = document.getElementById('pjPlayerRef');
        const playerHint = document.getElementById('pjPlayerHint');
        const playerThumb = document.getElementById('pjPlayerThumb');
        const playIco    = document.getElementById('pjPlayIco');
        const pauseIco   = document.getElementById('pjPauseIco');
        const pAudio     = document.getElementById('pasajesAudio');

        let activeCol     = -1;
        let activeTrack   = -1;
        let isPlaying     = false;
        let prefetchUrl   = null;   // URL de la siguiente pista ya precargada
        let prefetchedFor = -1;     // índice de pista para el que ya se precargó

        pAudio.preload = 'auto';    // bufferiza apenas se asigna el src

        // ── Grid de colecciones ──────────────────────────────────────────────
        function renderCols() {
            colsGrid.innerHTML = '';
            COLLECTIONS.forEach(function (col, i) {
                const card = document.createElement('div');
                card.className = 'pj-col-card';
                card.onclick = function () { openCol(i); };
                const img = document.createElement('img');
                img.className = 'pj-col-img'; img.src = col.cover; img.alt = col.titulo; img.loading = 'lazy';
                const ov = document.createElement('div'); ov.className = 'pj-col-overlay';
                const info = document.createElement('div'); info.className = 'pj-col-info';
                const np = document.createElement('p'); np.className = 'pj-col-name'; np.textContent = col.titulo;
                const cp = document.createElement('p'); cp.className = 'pj-col-count'; cp.textContent = col.tracks.length + ' pasajes';
                info.appendChild(np); info.appendChild(cp);
                card.appendChild(img); card.appendChild(ov); card.appendChild(info);
                colsGrid.appendChild(card);
            });
        }

        // ── Abrir colección (push pantalla 2) ────────────────────────────────
        function openCol(i) {
            activeCol = i;
            const col = COLLECTIONS[i];
            trkCover.src = col.cover; trkCover.alt = col.titulo;
            trkName.textContent = col.titulo;
            trkSub.textContent  = col.subtitulo;
            renderTrkList(col);
            scCols.classList.remove('active'); scCols.classList.add('behind');
            scTrks.classList.add('active'); scTrks.scrollTop = 0;
            navBack.classList.add('visible');
            navTitle.textContent = col.titulo;
        }

        // ── Lista de pistas ──────────────────────────────────────────────────
        function renderTrkList(col) {
            trkList.innerHTML = '';
            col.tracks.forEach(function (t, j) {
                const isActive = (j === activeTrack && activeCol === COLLECTIONS.indexOf(col));
                const row = document.createElement('div');
                row.className = 'pj-trk-row' + (isActive ? ' playing' : '');
                row.id = 'pjRow' + j;
                row.onclick = function () { playTrack(j); };
                row.innerHTML =
                    '<span class="pj-trk-n">' + (j + 1) + '</span>' +
                    '<span class="pj-trk-bars"><div class="pj-bars' + (isActive && isPlaying ? '' : ' paused') + '"><b></b><b></b><b></b></div></span>' +
                    '<div class="pj-trk-body"><p class="pj-trk-ref"></p><p class="pj-trk-hint"></p></div>';
                row.querySelector('.pj-trk-ref').textContent  = t.libro + ' ' + t.cap;
                row.querySelector('.pj-trk-hint').textContent = t.hint;
                trkList.appendChild(row);
            });
        }

        // ── Reproducción ─────────────────────────────────────────────────────
        function playTrack(j) {
            const col = COLLECTIONS[activeCol];
            if (!col) return;
            activeTrack = j;
            prefetchedFor = -1;     // nueva pista → habilita precargar la siguiente
            const t = col.tracks[j];
            document.querySelectorAll('.pj-trk-row').forEach(function (r, idx) {
                r.classList.toggle('playing', idx === j);
                var bars = r.querySelector('.pj-bars');
                if (bars) bars.classList.toggle('paused', idx !== j);
            });
            playerRef.textContent   = t.libro + ' ' + t.cap;
            playerHint.textContent  = t.hint;
            playerThumb.src         = col.cover;
            playerBar.classList.add('show');
            // No solapar con la Biblia ni con el Podcast.
            try { document.getElementById('mainAudio').pause(); } catch (e) {}
            try { document.getElementById('mainAudioB').pause(); } catch (e) {}
            try { document.getElementById('podcastAudio').pause(); } catch (e) {}
            pAudio.src = audioUrl(t.libro, t.cap, true);
            pAudio.play().catch(function () {});
            setSession(col, t);
        }

        // MediaSession: imprescindible para que la pantalla bloqueada muestre
        // controles y, sobre todo, para que el navegador NO suspenda la página
        // en segundo plano. Sin esto, el evento 'ended' no llega a disparar el
        // play() de la siguiente pista y la lista "no pasa" con la pantalla
        // apagada. Cada pasaje es un archivo suelto (capítulos no contiguos), así
        // que no se puede usar el stream continuo de la Biblia: la sesión de
        // medios es lo que mantiene viva la reproducción encadenada.
        function setSession(col, t) {
            if (!('mediaSession' in navigator)) return;
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title:  t.libro + ' ' + t.cap,
                    artist: 'Sonido de Vida · ' + col.titulo,
                    album:  col.titulo,
                    artwork: [{ src: col.cover, sizes: '512x512', type: 'image/jpeg' }],
                });
                navigator.mediaSession.setActionHandler('play',          function () { pAudio.play().catch(function(){}); });
                navigator.mediaSession.setActionHandler('pause',         function () { pAudio.pause(); });
                navigator.mediaSession.setActionHandler('previoustrack', function () { prev(); });
                navigator.mediaSession.setActionHandler('nexttrack',     function () { next(); });
                navigator.mediaSession.setActionHandler('seekbackward',  function () { pAudio.currentTime = Math.max(0, pAudio.currentTime - 15); });
                navigator.mediaSession.setActionHandler('seekforward',   function () { pAudio.currentTime = Math.min(pAudio.duration || 0, pAudio.currentTime + 15); });
            } catch (e) {}
        }

        // Precarga la siguiente pista en la caché del navegador. Así, cuando
        // termina la actual (con la pantalla bloqueada), el play() del siguiente
        // pasaje arranca desde caché SIN esperar a la red — que es justo lo que
        // iOS suele cortar al tener la página en segundo plano. No reproduce: solo
        // calienta la caché con un fetch del archivo del capítulo (es público).
        function prefetchNext() {
            const col = COLLECTIONS[activeCol];
            if (!col) return;
            const nj = activeTrack < col.tracks.length - 1 ? activeTrack + 1 : 0;
            const t = col.tracks[nj];
            const url = audioUrl(t.libro, t.cap, true);
            if (url === prefetchUrl) return;   // ya precargada
            prefetchUrl = url;
            try { fetch(url).catch(function () {}); } catch (e) {}
        }

        function setPlaying(v) {
            isPlaying = v;
            playIco.style.display  = v ? 'none' : '';
            pauseIco.style.display = v ? ''     : 'none';
            document.querySelectorAll('.pj-bars').forEach(function (b) {
                b.classList.toggle('paused', !v);
            });
        }

        function toggle() {
            if (pAudio.paused) { pAudio.play().catch(function () {}); }
            else               { pAudio.pause(); }
        }

        function prev() {
            const col = COLLECTIONS[activeCol];
            if (!col) return;
            playTrack(activeTrack > 0 ? activeTrack - 1 : col.tracks.length - 1);
        }

        function next() {
            const col = COLLECTIONS[activeCol];
            if (!col) return;
            playTrack(activeTrack < col.tracks.length - 1 ? activeTrack + 1 : 0);
        }

        function seek(e) {
            if (!isFinite(pAudio.duration)) return;
            var r = e.currentTarget.getBoundingClientRect();
            pAudio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * pAudio.duration;
        }

        pAudio.addEventListener('play',       function () { setPlaying(true);  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
        pAudio.addEventListener('pause',      function () { setPlaying(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
        pAudio.addEventListener('ended',      function () { next(); });
        pAudio.addEventListener('timeupdate', function () {
            if (pAudio.duration) playerFill.style.width = (pAudio.currentTime / pAudio.duration * 100) + '%';
            // Una vez la pista actual lleva unos segundos sonando (ya bufferizada),
            // precarga la siguiente para que el avance encadenado sea instantáneo.
            if (prefetchedFor !== activeTrack && pAudio.currentTime > 5) {
                prefetchedFor = activeTrack;
                prefetchNext();
            }
        });

        // ── Navegación ───────────────────────────────────────────────────────
        function back() {
            if (scTrks.classList.contains('active')) {
                scTrks.classList.remove('active'); scTrks.classList.add('slide-out');
                scCols.classList.remove('behind'); scCols.classList.add('active');
                navBack.classList.remove('visible');
                navTitle.textContent = 'Pasajes de Vida';
                setTimeout(function () { scTrks.classList.remove('slide-out'); }, 380);
            } else {
                close();
            }
        }

        function open() {
            renderCols();
            scTrks.classList.remove('active', 'slide-out');
            scCols.classList.remove('behind'); scCols.classList.add('active');
            navBack.classList.remove('visible');
            navTitle.textContent = 'Pasajes de Vida';
            overlay.setAttribute('aria-hidden', 'false');
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function close() {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            pAudio.pause();
        }

        return {
            open, close, back, toggle, prev, next, seek,
            collections: function () { return COLLECTIONS; },
            openAt: function (i) { open(); openCol(i); },
        };
    })();

    window.Pasajes = Pasajes;

    /* ════════════════════════════════════════════════════════════════
       Fase 2: Listas de reproducción del Podcast (me gusta + playlists)
       Los episodios se referencian por content_id. Backend: /api/likes y
       /api/playlists (auth.js → SDV_Auth). Una lista pública se comparte con
       /?lista=<id> y se ve sin sesión (reproducir sigue requiriendo cuenta).
       ════════════════════════════════════════════════════════════════ */
    const Listas = (function () {
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
        function toast(m) { if (window.showToast) showToast(m); }
        function logged() { return !!(window.SDV_Auth && SDV_Auth.user); }
        function needAccount() { if (window.SDV_Account) SDV_Account.open(); }

        let likesSet = new Set();   // content_ids con "me gusta"
        let lists    = [];          // cache de listas del usuario [{id,nombre,publica,content_ids}]
        let addCid   = null;        // episodio en proceso de "añadir a lista"
        let curList  = null;        // lista abierta en el overlay {id,nombre,content_ids,publica,owner,likes}

        const overlay = function () { return document.getElementById('playlistOverlay'); };

        // ── Carga inicial / refresco tras login ──────────────────────────
        async function refresh() {
            if (!logged()) { likesSet = new Set(); lists = []; renderYo(); return; }
            try {
                const [lk, pl] = await Promise.all([SDV_Auth.likes(), SDV_Auth.playlists()]);
                if (lk && lk.ok) likesSet = new Set(lk.data.content_ids || []);
                if (pl && pl.ok) lists = pl.data.playlists || [];
            } catch (e) { /* red caída: deja la cache previa */ }
            renderYo();
            const cc = window.Podcast && Podcast.currentContentId && Podcast.currentContentId();
            if (cc) reflectLike(cc);
        }

        // ── Me gusta ─────────────────────────────────────────────────────
        function reflectLike(cid) {
            const btn = document.getElementById('ppLike');
            if (!btn) return;
            const on = likesSet.has(cid);
            btn.classList.toggle('liked', on);
            btn.innerHTML = on ? '❤️ Te gusta' : '🤍 Me gusta';
        }

        async function toggleLikeCurrent() {
            if (!logged()) return needAccount();
            const cid = window.Podcast && Podcast.currentContentId();
            if (!cid) return;
            const on = likesSet.has(cid);
            // Optimista: refleja ya y revierte si falla.
            if (on) likesSet.delete(cid); else likesSet.add(cid);
            reflectLike(cid);
            try {
                const r = on ? await SDV_Auth.unlike(cid) : await SDV_Auth.like(cid);
                if (!(r && r.ok)) throw 0;
                toast(on ? 'Quitado de Me gusta' : '❤️ Añadido a Me gusta');
            } catch (e) {
                if (on) likesSet.add(cid); else likesSet.delete(cid);
                reflectLike(cid);
                toast('No se pudo actualizar');
            }
            renderYo();
            if (curList && curList.likes) renderOverlay();  // si está abierta la lista de favoritos
        }

        // ── Modal "añadir a lista" ───────────────────────────────────────
        function openAddCurrent() {
            if (!logged()) return needAccount();
            addCid = window.Podcast && Podcast.currentContentId();
            if (!addCid) return;
            renderAddLists();
            document.getElementById('addListModal').classList.add('visible');
        }
        function closeAdd() {
            document.getElementById('addListModal').classList.remove('visible');
            const inp = document.getElementById('almNewName'); if (inp) inp.value = '';
        }
        function renderAddLists() {
            const box = document.getElementById('almLists');
            if (!lists.length) {
                box.innerHTML = '<p style="color:rgba(255,255,255,.55);font-size:.85rem;font-style:italic;margin:.4rem 0">Aún no tienes listas. Crea la primera abajo 👇</p>';
                return;
            }
            box.innerHTML = lists.map(function (l) {
                const has = (l.content_ids || []).indexOf(addCid) >= 0;
                return '<button class="alm-row" data-id="' + esc(l.id) + '">' +
                    '<span class="alm-row-name">' + esc(l.nombre) + '</span>' +
                    '<span class="alm-row-state">' + (has ? '✓' : '＋') + '</span></button>';
            }).join('');
            box.querySelectorAll('.alm-row').forEach(function (el) {
                el.addEventListener('click', function () { addToList(el.getAttribute('data-id')); });
            });
        }
        async function addToList(id) {
            const l = lists.find(function (x) { return x.id === id; });
            if (!l) return;
            const has = (l.content_ids || []).indexOf(addCid) >= 0;
            try {
                if (has) {
                    const r = await SDV_Auth.removeFromPlaylist(id, addCid);
                    if (r && r.ok) { l.content_ids = (l.content_ids || []).filter(function (c) { return c !== addCid; }); toast('Quitado de «' + l.nombre + '»'); }
                } else {
                    const r = await SDV_Auth.addToPlaylist(id, addCid);
                    if (r && r.ok) { l.content_ids = (l.content_ids || []).concat([addCid]); toast('Añadido a «' + l.nombre + '»'); }
                    else if (r && r.status === 402) toast('Esa lista llegó al máximo de episodios');
                }
            } catch (e) { toast('No se pudo actualizar la lista'); }
            renderAddLists();
            renderYo();
            if (curList && curList.id === id) { curList.content_ids = l.content_ids; renderOverlay(); }
        }
        async function createFromAdd() {
            const inp = document.getElementById('almNewName');
            const nombre = (inp.value || '').trim();
            if (!nombre) return toast('Escribe un nombre para la lista');
            try {
                const r = await SDV_Auth.createPlaylist(nombre, addCid);
                if (r && r.ok) {
                    lists.unshift({ id: r.data.id, nombre: nombre, publica: false, content_ids: r.data.content_ids || (addCid ? [addCid] : []) });
                    toast('Lista «' + nombre + '» creada');
                    inp.value = '';
                    renderAddLists(); renderYo();
                } else if (r && r.status === 402) {
                    toast('Llegaste al máximo de listas');
                } else { toast('No se pudo crear la lista'); }
            } catch (e) { toast('No se pudo crear la lista'); }
        }

        // ── Sección "Mis listas" en la pestaña Yo ────────────────────────
        function renderYo() {
            const wrap = document.getElementById('yoListasWrap');
            if (!wrap) return;
            // OCULTO (recorte 2026): "Mis listas" (Me gusta + playlists) es feature del
            // Podcast, que está oculto. Quitar este return para reactivarlo.
            wrap.style.display = 'none'; wrap.innerHTML = ''; return;
            if (!logged()) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
            wrap.style.display = '';
            let html = '<div class="yo-listas-head"><h3>🎵 Mis listas</h3>' +
                '<button class="yo-listas-new" onclick="Listas.createNew()">+ Nueva</button></div>';
            // Tarjeta de "Me gusta" (lista virtual)
            const nLikes = likesSet.size;
            html += '<div class="yo-list-card" onclick="Listas.openLikes()">' +
                '<div class="yo-list-ico likes">❤️</div>' +
                '<div class="yo-list-meta"><p class="yo-list-name">Me gusta</p>' +
                '<p class="yo-list-sub">' + (nLikes ? nLikes + (nLikes === 1 ? ' episodio' : ' episodios') : 'Toca 🤍 en un episodio') + '</p></div>' +
                '<span class="yo-list-arrow">›</span></div>';
            // Listas del usuario
            lists.forEach(function (l) {
                const n = (l.content_ids || []).length;
                html += '<div class="yo-list-card" onclick="Listas.openList(\'' + esc(l.id) + '\')">' +
                    '<div class="yo-list-ico">' + (l.publica ? '🔗' : '🎶') + '</div>' +
                    '<div class="yo-list-meta"><p class="yo-list-name">' + esc(l.nombre) + '</p>' +
                    '<p class="yo-list-sub">' + n + (n === 1 ? ' episodio' : ' episodios') + (l.publica ? ' · compartida' : '') + '</p></div>' +
                    '<span class="yo-list-arrow">›</span></div>';
            });
            wrap.innerHTML = html;
        }

        async function createNew() {
            if (!logged()) return needAccount();
            const nombre = (window.prompt('Nombre de la nueva lista:') || '').trim();
            if (!nombre) return;
            try {
                const r = await SDV_Auth.createPlaylist(nombre);
                if (r && r.ok) { lists.unshift({ id: r.data.id, nombre: nombre, publica: false, content_ids: [] }); renderYo(); toast('Lista «' + nombre + '» creada'); }
                else if (r && r.status === 402) toast('Llegaste al máximo de listas');
                else toast('No se pudo crear la lista');
            } catch (e) { toast('No se pudo crear la lista'); }
        }

        // ── Overlay de una lista ─────────────────────────────────────────
        function openLikes() {
            curList = { id: null, nombre: 'Me gusta', content_ids: Array.from(likesSet), publica: false, owner: true, likes: true };
            showOverlay();
        }
        async function openList(id) {
            const cached = lists.find(function (x) { return x.id === id; });
            curList = { id: id, nombre: cached ? cached.nombre : 'Lista', content_ids: cached ? (cached.content_ids || []) : [], publica: cached ? cached.publica : false, owner: true, likes: false };
            showOverlay();
            // Refresca desde el servidor (orden/estado público al día).
            try {
                const r = await SDV_Auth.getPlaylist(id);
                if (r && r.ok && curList && curList.id === id) {
                    curList.nombre = r.data.nombre; curList.content_ids = r.data.content_ids || []; curList.publica = !!r.data.publica;
                    if (cached) { cached.nombre = curList.nombre; cached.content_ids = curList.content_ids; cached.publica = curList.publica; }
                    renderOverlay();
                }
            } catch (e) {}
        }
        // Vista pública (sin sesión) de una lista compartida.
        async function openPublic(id) {
            curList = { id: id, nombre: 'Lista', content_ids: [], publica: true, owner: false, likes: false };
            showOverlay();
            renderOverlay('<p class="ls-empty">Cargando lista…</p>');
            try {
                const r = await SDV_Auth.publicPlaylist(id);
                if (r && r.ok && curList && curList.id === id) {
                    curList.nombre = r.data.nombre; curList.content_ids = r.data.content_ids || [];
                    renderOverlay();
                } else {
                    renderOverlay('<p class="ls-empty">Esta lista no existe o ya no es pública.</p>');
                }
            } catch (e) {
                renderOverlay('<p class="ls-empty">No se pudo cargar la lista.</p>');
            }
        }
        function showOverlay() {
            renderOverlay();
            const ov = overlay();
            ov.classList.add('open');
            ov.setAttribute('aria-hidden', 'false');
            ov.scrollTop = 0;
            document.body.style.overflow = 'hidden';
        }
        function closeOverlay() {
            const ov = overlay();
            ov.classList.remove('open');
            ov.setAttribute('aria-hidden', 'true');
            curList = null;
            // Si quedó el reproductor de episodio abierto, mantener bloqueo de scroll.
            const pp = document.getElementById('podcastPlayer');
            if (!(pp && pp.classList.contains('open'))) document.body.style.overflow = '';
        }

        function renderOverlay(bodyOverride) {
            if (!curList) return;
            document.getElementById('lsNavTitle').textContent = curList.nombre || 'Lista';
            const body = document.getElementById('lsBody');
            const eps = (curList.content_ids || []).map(function (c) { return window.Podcast ? Podcast.episodeByContentId(c) : null; }).filter(Boolean);

            // Carátula compuesta (hasta 4 portadas).
            const covers = eps.map(function (e) { return e.image; }).filter(Boolean).slice(0, 4);
            let art = '';
            if (covers.length) {
                art = '<div class="ls-hero-art' + (covers.length === 1 ? ' solo' : '') + '">' +
                    (covers.length === 1 ? covers : [covers[0], covers[1] || covers[0], covers[2] || covers[0], covers[3] || covers[1] || covers[0]])
                        .map(function (u) { return '<span style="background-image:url(\'' + esc(u) + '\')"></span>'; }).join('') + '</div>';
            } else {
                art = '<div class="ls-hero-art solo"><span style="background:linear-gradient(135deg,#2a2540,#161325)"></span></div>';
            }

            const n = eps.length;
            const badge = curList.likes ? '❤️ Tus favoritos' : (curList.owner ? 'Tu lista' : 'Lista compartida');
            const meta = (curList.publica && !curList.likes ? '<span class="ls-pub-dot"></span>Compartida · ' : '') + n + (n === 1 ? ' episodio' : ' episodios');

            let html = '<div class="ls-hero">' +
                '<span class="ls-hero-badge">' + badge + '</span>' +
                art +
                '<h2>' + esc(curList.nombre) + '</h2>' +
                '<div class="ls-hero-meta">' + meta + '</div></div>';

            // Acciones
            html += '<div class="ls-actions">';
            if (n) html += '<button class="ls-act gold" onclick="Listas.playFirst()">▶ Reproducir</button>';
            if (curList.owner && !curList.likes) {
                html += '<button class="ls-act" onclick="Listas.share()">🔗 Compartir</button>';
                html += '<button class="ls-act" onclick="Listas.renameCur()">✏️ Renombrar</button>';
                html += '<button class="ls-act danger" onclick="Listas.deleteCur()">🗑️ Eliminar</button>';
            } else if (!curList.owner) {
                html += '<button class="ls-act" onclick="Listas.share()">🔗 Compartir</button>';
            }
            html += '</div>';

            if (bodyOverride) { body.innerHTML = html + bodyOverride; return; }

            if (!n) {
                body.innerHTML = html + '<p class="ls-empty">' + (curList.likes
                    ? 'Aún no marcas episodios con 🤍. Toca el corazón en cualquier episodio del Podcast.'
                    : (curList.owner ? 'Esta lista está vacía. Abre un episodio y pulsa «➕ Añadir a lista».' : 'Esta lista no tiene episodios.')) + '</p>';
                attachRows();
                return;
            }

            html += '<div class="ls-list">';
            eps.forEach(function (e) {
                html += '<div class="ls-row" data-cid="' + e.contentId + '">' +
                    '<div class="ls-row-cover" style="background-image:url(\'' + esc(e.image || '') + '\')"><span class="ls-play">▶</span></div>' +
                    '<div class="ls-row-body"><p class="ls-row-ref">' + esc((e.ref || '').toUpperCase()) + '</p>' +
                    '<p class="ls-row-title">' + esc(e.title) + '</p></div>' +
                    ((curList.owner) ? '<button class="ls-row-rm" data-rm="' + e.contentId + '" aria-label="Quitar">✕</button>' : '') +
                    '</div>';
            });
            html += '</div>';

            // CTA para visitantes de un enlace público (sin sesión).
            if (!curList.owner && !logged()) {
                html += '<div class="ls-cta"><p>Crea tu cuenta gratis para guardar tus propias listas y escuchar el Podcast de Vida.</p>' +
                    '<button class="ls-act gold" onclick="SDV_Account.open()">✦ Crear mi cuenta gratis</button></div>';
            }

            body.innerHTML = html;
            attachRows();
        }
        function attachRows() {
            const body = document.getElementById('lsBody');
            body.querySelectorAll('.ls-row').forEach(function (row) {
                row.addEventListener('click', function (ev) {
                    if (ev.target.closest('[data-rm]')) return;
                    playItem(parseInt(row.getAttribute('data-cid'), 10));
                });
            });
            body.querySelectorAll('[data-rm]').forEach(function (b) {
                b.addEventListener('click', function (ev) { ev.stopPropagation(); removeItem(parseInt(b.getAttribute('data-rm'), 10)); });
            });
        }

        function playItem(cid) {
            if (!window.Podcast) return;
            // El reproductor (z 4200) se abre por encima del overlay de lista.
            Podcast.playByContentId(cid);
        }
        function playFirst() {
            const first = (curList && curList.content_ids || []).find(function (c) { return window.Podcast && Podcast.episodeByContentId(c); });
            if (first != null) playItem(first);
        }

        async function removeItem(cid) {
            if (!curList || !curList.owner) return;
            if (curList.likes) {
                likesSet.delete(cid);
                curList.content_ids = Array.from(likesSet);
                renderOverlay(); renderYo();
                try { await SDV_Auth.unlike(cid); } catch (e) {}
                const cc = window.Podcast && Podcast.currentContentId(); if (cc) reflectLike(cc);
                return;
            }
            curList.content_ids = (curList.content_ids || []).filter(function (c) { return c !== cid; });
            renderOverlay();
            const cached = lists.find(function (x) { return x.id === curList.id; });
            if (cached) cached.content_ids = curList.content_ids;
            renderYo();
            try { await SDV_Auth.removeFromPlaylist(curList.id, cid); } catch (e) { toast('No se pudo quitar'); }
        }

        async function renameCur() {
            if (!curList || !curList.owner || curList.likes) return;
            const nombre = (window.prompt('Nuevo nombre de la lista:', curList.nombre) || '').trim();
            if (!nombre || nombre === curList.nombre) return;
            curList.nombre = nombre; renderOverlay();
            const cached = lists.find(function (x) { return x.id === curList.id; });
            if (cached) cached.nombre = nombre;
            renderYo();
            try { await SDV_Auth.renamePlaylist(curList.id, nombre); } catch (e) { toast('No se pudo renombrar'); }
        }

        async function deleteCur() {
            if (!curList || !curList.owner || curList.likes) return;
            if (!confirm('¿Eliminar la lista «' + curList.nombre + '»? Esto no borra los episodios, solo la lista.')) return;
            const id = curList.id;
            try { await SDV_Auth.deletePlaylist(id); } catch (e) { toast('No se pudo eliminar'); return; }
            lists = lists.filter(function (x) { return x.id !== id; });
            toast('Lista eliminada');
            closeOverlay(); renderYo();
        }

        async function share() {
            if (!curList) return;
            const id = curList.id;
            // Activar enlace público si soy el dueño y aún es privada.
            if (curList.owner && !curList.publica) {
                try {
                    const r = await SDV_Auth.setPlaylistPublic(id, true);
                    if (r && r.ok) {
                        curList.publica = true;
                        const cached = lists.find(function (x) { return x.id === id; });
                        if (cached) cached.publica = true;
                        renderOverlay(); renderYo();
                    } else { toast('No se pudo activar el enlace'); return; }
                } catch (e) { toast('No se pudo activar el enlace'); return; }
            }
            const url = APP_URL + '/?lista=' + id;
            const texto = '🎧 Escucha mi lista «' + curList.nombre + '» en Sonido de Vida';
            if (navigator.share) {
                try { await navigator.share({ title: curList.nombre, text: texto, url: url }); return; }
                catch (e) { if (e && e.name === 'AbortError') return; }
            }
            try { await navigator.clipboard.writeText(url); toast('🔗 Enlace copiado al portapapeles'); }
            catch (e) { window.prompt('Copia el enlace de tu lista:', url); }
        }

        // Al cargar la página: si la URL trae ?lista=<id>, abre la vista pública.
        function checkSharedLink() {
            try {
                const id = new URLSearchParams(window.location.search).get('lista');
                if (id && /^[A-Za-z0-9]+$/.test(id)) {
                    openPublic(id);
                    // Deja el parámetro en la URL para que el enlace siga siendo compartible.
                }
            } catch (e) {}
        }

        return {
            refresh, reflectLike, toggleLikeCurrent,
            openAddCurrent, closeAdd, createFromAdd, addToList,
            renderYo, createNew, openLikes, openList, openPublic,
            closeOverlay, playFirst, renameCur, deleteCur, share, checkSharedLink,
            isOverlayOpen: function () { var o = overlay(); return o && o.classList.contains('open'); },
        };
    })();
    window.Listas = Listas;

    /* ════════ Botón "ATRÁS" del navegador / móvil ════════
       La app es una sola página (SPA). Sin esto, el botón atrás del
       teléfono o del navegador SALE de la página en vez de cerrar el
       menú u overlay que está abierto. Solución: dejamos un "guardia"
       en el historial; cada vez que el usuario pulsa atrás cerramos UNA
       capa abierta (de la más interna a la más externa) y rearmamos el
       guardia. Si no hay nada abierto y está en Inicio, pide confirmación
       ("pulsa atrás de nuevo para salir"), el patrón típico de Android. */
    (function () {
        function topModal() {
            var ms = document.querySelectorAll('.modal-overlay.visible');
            return ms.length ? ms[ms.length - 1] : null;
        }
        // Cierra la capa superior abierta. Devuelve true si cerró algo.
        function appBack() {
            // 1. Menú móvil desplegable
            var nav = document.getElementById('navLinks');
            if (nav && nav.classList.contains('open')) { closeMenu(); return true; }
            // 1b. Panel de Estudio Profundo (Buscar premium)
            var sp = document.getElementById('studyPanel');
            if (sp && sp.classList.contains('open') && window.closeStudy) { closeStudy(); return true; }
            // 2. Modal / ventana emergente
            var m = topModal();
            if (m) { m.classList.remove('visible'); document.body.style.overflow = ''; return true; }
            // 3. Reproductor de podcast (pantalla del episodio)
            var pp = document.getElementById('podcastPlayer');
            if (pp && pp.classList.contains('open') && window.Podcast) { Podcast.closePlayer(); return true; }
            // 3b. Overlay de una lista de reproducción (Fase 2)
            if (window.Listas && Listas.isOverlayOpen()) { Listas.closeOverlay(); return true; }
            // 4. Hub de podcast
            var po = document.getElementById('podcastOverlay');
            if (po && po.classList.contains('open') && window.Podcast) { Podcast.close(); return true; }
            // 5. Pasajes de Vida (si está en la pantalla interna, retrocede a la lista)
            var pj = document.getElementById('pasajesOverlay');
            if (pj && pj.classList.contains('open') && window.Pasajes) {
                var deep = document.getElementById('pjScreenTrks');
                if (deep && deep.classList.contains('active')) Pasajes.back();
                else Pasajes.close();
                return true;
            }
            // 6. Modo Enfoque
            var fo = document.getElementById('focusOverlay');
            if (fo && fo.classList.contains('open') && window.Focus) { Focus.exit(); return true; }
            // 7. Pestaña distinta de Inicio → volver a Inicio
            var tab = document.body.getAttribute('data-tab-active');
            if (tab && tab !== 'inicio') { showTab('inicio'); return true; }
            return false;
        }

        function arm() { try { history.pushState({ sdv: 'guard' }, ''); } catch (e) {} }

        // Guardia inicial
        try { history.replaceState({ sdv: 'home' }, ''); } catch (e) {}
        arm();

        var exitArmed = false, exitTimer = null;
        window.addEventListener('popstate', function () {
            if (appBack()) {
                exitArmed = false;
                arm();                       // rearma para el siguiente "atrás"
                return;
            }
            // Nada abierto y estamos en Inicio
            if (exitArmed) { try { history.back(); } catch (e) {} return; }  // segundo atrás → salir
            exitArmed = true;
            if (window.showToast) showToast('Pulsa atrás de nuevo para salir');
            arm();
            clearTimeout(exitTimer);
            exitTimer = setTimeout(function () { exitArmed = false; }, 2500);
        });
    })();

    /* ════════ Router de pestañas (app-shell) ════════ */
    const TABS = ['inicio','explorar','biblia','buscar','yo'];
    // ════════════════════════════════════════════════════════════════
    // Anuncios (Google AdSense) — andamiaje.
    // PARA ACTIVAR cuando tengas la cuenta AdSense aprobada:
    //   1) pon `client` = tu ID de editor 'ca-pub-XXXXXXXXXXXXXXXX'
    //   2) pon `slot`   = el ID del bloque de anuncio (display/banner)
    //   3) pon `enabled: true` y `test: false`
    // El banner solo aparece en las pestañas de `tabs`, NUNCA para premium
    // (SDV_Auth.premium) ni con el Modo Enfoque abierto. Mientras `test` sea
    // true se muestra un placeholder en vez de un anuncio real.
    // ════════════════════════════════════════════════════════════════
    const SDV_ADS = { client: 'ca-pub-1847146837046506', slot: '', enabled: true, test: false, tabs: ['biblia', 'explorar'] };
    const Ads = (function () {
        let injected = false;
        const premium   = () => !!(window.SDV_Auth && SDV_Auth.premium);
        const focusOpen = () => { const o = document.getElementById('focusOverlay'); return !!(o && o.classList.contains('open')); };
        const activeTab = () => document.body.getAttribute('data-tab-active');
        function shouldShow() {
            if (premium() || focusOpen()) return false;
            if (SDV_ADS.tabs.indexOf(activeTab()) === -1) return false;
            return SDV_ADS.enabled || SDV_ADS.test;
        }
        function injectScript() {
            if (injected || !SDV_ADS.enabled || !SDV_ADS.client) return;
            const s = document.createElement('script');
            s.async = true; s.crossOrigin = 'anonymous';
            s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + SDV_ADS.client;
            document.head.appendChild(s);
            injected = true;
        }
        function build() {
            const box = document.getElementById('adSlot');
            if (!box) return;
            if (SDV_ADS.enabled && SDV_ADS.client && SDV_ADS.slot) {
                if (!box.querySelector('.adsbygoogle')) {
                    box.innerHTML = '<ins class="adsbygoogle" data-ad-client="' + SDV_ADS.client +
                        '" data-ad-slot="' + SDV_ADS.slot + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
                    injectScript();
                    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
                }
            } else if (SDV_ADS.test && !box.querySelector('.ad-ph')) {
                box.innerHTML = '<div class="ad-ph">Espacio publicitario<small>Sin anuncios con Premium ✨</small></div>';
            }
        }
        function refresh() {
            const show = shouldShow();
            document.body.classList.toggle('ads-on', show);
            if (show) build();
        }
        return { refresh, cfg: SDV_ADS };
    })();
    window.Ads = Ads;

    function showTab(name, opts) {
        if (!TABS.includes(name)) name = 'inicio';
        // Lazy-load: la Escritura solo se descarga al entrar a Biblia o Buscar.
        if (name === 'biblia' || name === 'buscar') prepareBibleUI();
        document.body.setAttribute('data-tab-active', name);
        // Resaltar el botón activo de la barra inferior
        document.querySelectorAll('.bottom-nav .bn-item').forEach(b => {
            b.classList.toggle('active', b.dataset.bn === name);
        });
        // Resaltar el enlace activo del navbar superior (navegación de la web)
        document.querySelectorAll('#navLinks a[data-navtab]').forEach(a => {
            a.classList.toggle('active', a.dataset.navtab === name);
        });
        // Forzar la aparición de los elementos .reveal de la pestaña (no esperan al scroll)
        document.querySelectorAll('[data-tab="' + name + '"] .reveal').forEach(el => el.classList.add('visible'));
        // Animación de entrada: reaplica .sdv-tab-in a las secciones de la pestaña activa
        document.querySelectorAll('[data-tab="' + name + '"]').forEach(el => {
            el.classList.remove('sdv-tab-in'); void el.offsetWidth; el.classList.add('sdv-tab-in');
        });
        // Reflejar la pestaña en la URL (#explorar, #biblia…) sin crear entradas de
        // historial: usamos replaceState para no interferir con el guardia del botón atrás.
        try {
            history.replaceState(history.state, '', location.pathname + (name === 'inicio' ? '' : '#' + name));
        } catch (e) {}
        closeMenu();
        if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
        if (window.Ads) Ads.refresh();
        // Reanuda el auto-scroll de los rieles solo al entrar a Explorar (el bucle
        // se detiene solo en las demás pestañas para no saturar el render).
        if (name === 'explorar' && window.kickAutoScroll) window.kickAutoScroll();
    }

    // Retomar la escucha donde se quedó (último capítulo cargado)
    async function resumeListening() {
        showTab('biblia');
        let last = null;
        try { last = JSON.parse(localStorage.getItem('sdv:last') || 'null'); } catch (e) {}
        try { await ensureBible(); } catch (e) { return showToast('⚠️ No se pudo cargar la Biblia'); }
        if (last && last.book && last.chapter && getActiveBible()[last.book]) {
            loadChapter({ book: last.book, chapter: last.chapter });
        } else {
            showToast('Aún no has escuchado ningún capítulo. ¡Elige uno para empezar!');
        }
    }

    /* ════════ Mis descargas (offline real) ════════ */
    const OFFLINE_KEY = 'sdv:offline';
    const OFFLINE_CACHE = 'sdv-audio-v1';

    function getOfflineList() {
        try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch (e) { return []; }
    }
    function saveOfflineList(list) {
        try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function fmtSize(bytes) {
        if (!bytes) return '';
        const mb = bytes / 1048576;
        return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }
    // Empuja la entrada a la nube (best-effort). Si no hay sesión o el endpoint
    // no responde, la lista local sigue funcionando igual.
    function pushLibrary(book, chapter) {
        if (window.SDV_Auth && SDV_Auth.user && SDV_Auth.saveLibrary) {
            SDV_Auth.saveLibrary(book, chapter).catch(() => {});
        }
    }
    function recordOffline(entry) {
        const list = getOfflineList();
        const ex = list.find(x => x.book === entry.book && x.chapter === entry.chapter);
        if (ex) { ex.size = entry.size || ex.size; ex.cloud = false; saveOfflineList(list); }
        else { list.unshift(entry); saveOfflineList(list); }
        pushLibrary(entry.book, entry.chapter);
        if (document.getElementById('offlinePanel').style.display !== 'none') renderOfflineList();
    }
    async function removeOffline(book, chapter) {
        const list = getOfflineList().filter(x => !(x.book === book && x.chapter === chapter));
        saveOfflineList(list);
        try {
            const cache = await caches.open(OFFLINE_CACHE);
            const path = new URL(audioUrl(book, chapter, true)).pathname;
            await cache.delete(new Request(path, { method: 'GET' }));
        } catch (e) {}
        if (window.SDV_Auth && SDV_Auth.user && SDV_Auth.removeLibrary) {
            SDV_Auth.removeLibrary(book, chapter).catch(() => {});
        }
        renderOfflineList();
    }
    function playOffline(book, chapter) {
        showTab('biblia');
        loadChapter({ book, chapter });
    }
    // Capítulo que está en la nube pero cuyo audio no vive en este equipo:
    // lo baja desde R2 y lo cachea (no gasta crédito diario: ya es tuyo).
    async function downloadToDevice(book, chapter) {
        showToast('⬇️ Guardando en este equipo…');
        try {
            const url = audioUrl(book, chapter, true);
            const path = new URL(url).pathname;
            const cache = await caches.open(OFFLINE_CACHE);
            let res = await cache.match(new Request(path, { method: 'GET' }));
            if (!res) {
                res = await fetch(url);
                if (!res.ok) throw new Error('Error ' + res.status);
                await cache.put(new Request(path, { method: 'GET' }), res.clone());
            }
            const blob = await res.blob();
            const list = getOfflineList();
            const it = list.find(x => x.book === book && x.chapter === chapter);
            if (it) { it.size = blob.size; it.cloud = false; saveOfflineList(list); }
            renderOfflineList();
            showToast('✅ Guardado para escuchar sin conexión');
        } catch (e) {
            showToast('⚠️ No se pudo guardar: ' + e.message);
        }
    }
    function toggleOfflinePanel() {
        showTab('yo');
        const panel = document.getElementById('offlinePanel');
        const show = panel.style.display === 'none';
        panel.style.display = show ? '' : 'none';
        if (show) { renderOfflineList(); syncLibraryFromCloud(); panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    // Une la lista de la nube con la local: trae los que faltan (como "en la
    // nube", listos para guardar en este equipo) y sube los locales que aún no
    // estén sincronizados. Best-effort; sin sesión no hace nada.
    async function syncLibraryFromCloud() {
        if (!(window.SDV_Auth && SDV_Auth.user && SDV_Auth.listLibrary)) return;
        let r;
        try { r = await SDV_Auth.listLibrary(); } catch (e) { return; }
        if (!r || !r.ok) return;
        const cloud = r.data.items || [];
        const list = getOfflineList();
        let changed = false;
        for (const c of cloud) {
            if (!list.some(x => x.book === c.libro && x.chapter === c.capitulo)) {
                list.push({ book: c.libro, chapter: c.capitulo, size: 0, ts: Date.parse(c.creado_en) || Date.now(), cloud: true });
                changed = true;
            }
        }
        for (const x of list) {
            if (!cloud.some(c => c.libro === x.book && c.capitulo === x.chapter)) {
                if (SDV_Auth.saveLibrary) SDV_Auth.saveLibrary(x.book, x.chapter).catch(() => {});
            }
        }
        if (changed) saveOfflineList(list);
        const panel = document.getElementById('offlinePanel');
        if (panel && panel.style.display !== 'none') renderOfflineList();
    }
    function renderOfflineList() {
        const list = getOfflineList();
        const box = document.getElementById('offlineListItems');
        const total = document.getElementById('offlineTotal');
        if (!box) return;
        const note = document.getElementById('offlineNote');
        if (note) {
            note.textContent = (window.SDV_Auth && SDV_Auth.user)
                ? '☁️ Tu lista se guarda en tu cuenta: aunque borres los datos del navegador o cambies de equipo, podrás volver a descargar tus capítulos.'
                : '📌 Se guardan en este dispositivo para escuchar sin conexión. Si borras los datos del navegador, se pierden. Crea una cuenta gratis para sincronizarlos.';
        }
        if (!list.length) {
            box.innerHTML = '<div class="offline-empty">Aún no has descargado capítulos.<br>Descarga uno desde el reproductor con 💾.</div>';
            total.textContent = '';
            return;
        }
        const bytes = list.reduce((s, x) => s + (x.size || 0), 0);
        total.textContent = list.length + (list.length === 1 ? ' capítulo' : ' capítulos') + (bytes ? ' · ' + fmtSize(bytes) : '');
        box.innerHTML = list.map(x => {
            const b = x.book.replace(/"/g, '&quot;');
            const cached = !!x.size;
            const main = cached
                ? '<button class="offline-play" onclick="playOffline(&quot;' + b + '&quot;,' + x.chapter + ')">' +
                      '<span class="offline-ico">🎧</span>' +
                      '<span class="offline-meta"><strong>' + x.book + ' ' + x.chapter + '</strong><small>' + fmtSize(x.size) + '</small></span>' +
                  '</button>'
                : '<button class="offline-play" onclick="downloadToDevice(&quot;' + b + '&quot;,' + x.chapter + ')">' +
                      '<span class="offline-ico">☁️</span>' +
                      '<span class="offline-meta"><strong>' + x.book + ' ' + x.chapter + '</strong><small>Toca para guardar en este equipo</small></span>' +
                  '</button>';
            return '<div class="offline-item">' + main +
                '<button class="offline-del" title="Quitar descarga" onclick="removeOffline(&quot;' + b + '&quot;,' + x.chapter + ')">🗑️</button>' +
            '</div>';
        }).join('');
    }

    // Mapear los enlaces internos (#listen, #features...) a sus pestañas
    const HASH_TAB = { '#features':'explorar', '#listen':'biblia', '#random':'inicio', '#cuenta':'explorar', '#devocionales':'explorar' };
    function initTabLinks() {
        document.addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const tab = HASH_TAB[a.getAttribute('href')];
            if (!tab) return;
            e.preventDefault();
            showTab(tab);
        });
    }

    /* ════════ Búsqueda en la Biblia ════════ */
    // Quita tildes/acentos para comparación insensible: “fiate” == “fíate”, “jehova” == “Jehová”
    function _sAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

    async function runSearch() {
        const input = document.getElementById('searchInput');
        const box   = document.getElementById('searchResults');
        const q = (input.value || '').trim();
        const area = document.getElementById('sbResultsArea');
        if (area) area.style.display = '';
        if (typeof sbSyncVersion === 'function') sbSyncVersion();
        const countEl = document.getElementById('searchCount');
        if (q.length < 2) { if(countEl) countEl.textContent=''; box.innerHTML = '<div class="search-empty">Escribe al menos 2 letras para buscar.</div>'; return; }

        if (countEl) countEl.textContent = '';
        box.innerHTML = '<div class="search-empty">Buscando…</div>';
        try { await ensureBible(); } catch (e) {}
        const bible = getActiveBible();
        if (!bible) { box.innerHTML = '<div class="search-empty">No se pudo cargar el texto bíblico.</div>'; return; }

        // Palabras clave: normaliza, filtra stopwords y palabras <2 chars.
        // “fiate de jehova con todo tu corazon” → [“fiate”,”jehova”,”corazon”]
        const STOP = new Set(['de','la','el','en','y','a','lo','le','se','su','un','no','ni','mi','me','te','si','al','del','los','las','con','por','que','mas','pero','como','es','son','fue','ha','he']);
        const qNorm = _sAccents(q).toLowerCase();
        let keywords = qNorm.split(/\s+/).filter(w => w.length >= 2 && !STOP.has(w));
        if (!keywords.length) keywords = [qNorm]; // fallback: frase completa

        // Resalta keywords en texto original usando índices del texto normalizado
        // (NFC→NFD→strip conserva la longitud original, los índices coinciden)
        function highlight(text) {
            const norm = _sAccents(text).toLowerCase();
            const marks = [];
            for (const kw of keywords) {
                let pos = 0;
                while (true) {
                    const idx = norm.indexOf(kw, pos);
                    if (idx === -1) break;
                    marks.push({ s: idx, e: idx + kw.length });
                    pos = idx + 1;
                }
            }
            if (!marks.length) return text.replace(/</g, '&lt;');
            marks.sort((a, b) => a.s - b.s);
            const merged = [];
            for (const m of marks) {
                if (merged.length && m.s <= merged[merged.length - 1].e)
                    merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, m.e);
                else merged.push({ ...m });
            }
            let out = '', prev = 0;
            for (const { s, e } of merged) {
                out += text.slice(prev, s).replace(/</g, '&lt;');
                out += '<mark>' + text.slice(s, e).replace(/</g, '&lt;') + '</mark>';
                prev = e;
            }
            return out + text.slice(prev).replace(/</g, '&lt;');
        }

        let results = [];
        const MAX = 60;
        let truncated = false;
        outer:
        for (const book of Object.keys(bible)) {
            const chapters = bible[book];
            if (!chapters) continue;
            for (let c = 0; c < chapters.length; c++) {
                const verses = chapters[c];
                if (!verses) continue;
                for (let v = 0; v < verses.length; v++) {
                    const text = verses[v];
                    if (!text) continue;
                    const norm = _sAccents(text).toLowerCase();
                    // AND: el versículo debe contener TODAS las palabras clave
                    if (keywords.every(kw => norm.includes(kw))) {
                        results.push({ book, chapter: c + 1, verse: v + 1, text });
                        if (results.length >= MAX) { truncated = true; break outer; }
                    }
                }
            }
        }

        // Filtro por Testamento / clasificación espiritual (chips de la barra)
        let filteredResults = results;
        const _flt = (typeof sbCurrentFilter !== 'undefined') ? sbCurrentFilter : 'all';
        if (_flt === 'at' || _flt === 'nt') {
            filteredResults = results.filter(r => (NT_BOOKS.has(r.book) ? 'nt' : 'at') === _flt);
        } else if (_flt === 'promesa' || _flt === 'consuelo' || _flt === 'instruccion') {
            filteredResults = results.filter(r => {
                const cur = CURATED[_sAccents(r.book + ' ' + r.chapter + ':' + r.verse).toLowerCase()];
                return cur && cur.tags.some(t => _sAccents(t).toLowerCase() === _flt);
            });
        }
        results = filteredResults;

        // Si no hay resultados en la traducción activa, buscar en la otra automáticamente
        let altResults = [];
        let altLabel = '';
        if (!results.length && _flt === 'all') {
            const altMode = translationMode === 'sbll' ? 'rva' : 'sbll';
            try { await ensureBible(altMode); } catch (e) {}
            const altBible = window[BIBLE_GLOBAL[altMode]];
            if (altBible) {
                altLabel = altMode === 'rva' ? 'RVA 1909' : 'SBLL 2026';
                outer2:
                for (const book of Object.keys(altBible)) {
                    const chapters = altBible[book];
                    if (!chapters) continue;
                    for (let c = 0; c < chapters.length; c++) {
                        const verses = chapters[c];
                        if (!verses) continue;
                        for (let v = 0; v < verses.length; v++) {
                            const text = verses[v];
                            if (!text) continue;
                            const norm = _sAccents(text).toLowerCase();
                            if (keywords.every(kw => norm.includes(kw))) {
                                altResults.push({ book, chapter: c + 1, verse: v + 1, text });
                                if (altResults.length >= MAX) break outer2;
                            }
                        }
                    }
                }
            }
        }

        if (!results.length && !altResults.length) {
            const filterNote = (_flt === 'promesa' || _flt === 'consuelo' || _flt === 'instruccion')
                ? '<br><span style="font-size:.85rem">Este filtro muestra solo versículos con estudio profundo curado. Quita el filtro o prueba <em>Toda</em>.</span>'
                : '<br>Prueba con menos palabras, por ejemplo solo <em>"' + (keywords[0] || q).replace(/</g,'&lt;') + '"</em>.';
            if (countEl) countEl.textContent = 'Sin resultados';
            box.innerHTML = '<div class="search-empty">Sin resultados para <em>"' + q.replace(/</g,'&lt;') + '"</em>.' + filterNote + '</div>';
            return;
        }

        const SR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
        function buildCards(list) {
            const frag = document.createDocumentFragment();
            list.forEach(r => {
                const ref = r.book + ' ' + r.chapter + ':' + r.verse;
                const isNT = NT_BOOKS.has(r.book);
                const cur = CURATED[_sAccents(ref).toLowerCase()];
                const btn = document.createElement('button');
                btn.className = 'search-result';
                btn.onclick = () => openStudy(r.book, r.chapter, r.verse, r.text);
                let tags = '';
                if (cur) tags = cur.tags.slice(0,3).map(t =>
                    '<span class="sr-tag tag-' + _sAccents(t).toLowerCase() + '">' + t + '</span>').join('');
                btn.innerHTML =
                    '<div class="sr-meta">' +
                        '<span class="sr-badge ' + (isNT?'nt':'at') + '">' + (isNT?'N.T.':'A.T.') + '</span>' +
                        '<span class="search-result-ref" style="margin:0">' + ref + '</span>' + tags +
                    '</div>' +
                    '<div class="search-result-text">' + highlight(r.text) + '</div>' +
                    '<div class="sr-study">' + SR_SVG + ' Estudio bíblico</div>';
                frag.appendChild(btn);
            });
            return frag;
        }

        // ── Surfacing curado: versículos con estudio completo que coincidan por tag ──
        const curatedHits = [];
        const curatedKeySet = new Set();
        const activeBible = getActiveBible();
        if (activeBible) {
            Object.entries(CURATED).forEach(([key, data]) => {
                if (!data.tags) return;
                const tagMatch = data.tags.some(t => keywords.some(kw => _sAccents(t).toLowerCase().includes(kw)));
                if (!tagMatch) return;
                const m = key.match(/^(.+)\s(\d+):(\d+)$/);
                if (!m) return;
                const bookNorm = m[1], ch = parseInt(m[2]), vs = parseInt(m[3]);
                for (const bk of Object.keys(activeBible)) {
                    if (_sAccents(bk).toLowerCase() === bookNorm) {
                        const chapters = activeBible[bk];
                        if (chapters && chapters[ch-1] && chapters[ch-1][vs-1]) {
                            curatedHits.push({ book: bk, chapter: ch, verse: vs, text: chapters[ch-1][vs-1], _key: key });
                            curatedKeySet.add(key);
                            break;
                        }
                    }
                }
            });
        }
        // Dedup: quitar de resultados normales los que ya salen en curated
        const mainResults = results.filter(r =>
            !curatedKeySet.has(_sAccents(r.book + ' ' + r.chapter + ':' + r.verse).toLowerCase()));

        const total = curatedHits.length + mainResults.length;
        if (countEl) countEl.textContent = total + (truncated?'+':'') + ' resultado' + (total!==1?'s':'');
        box.innerHTML = '';

        if (curatedHits.length) {
            const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
            const sect = document.createElement('div');
            sect.className = 'sb-curated-section';
            const lbl = document.createElement('div');
            lbl.className = 'sb-curated-label';
            lbl.innerHTML = STAR_SVG + ' Estudio completo disponible';
            sect.appendChild(lbl);
            curatedHits.forEach(r => {
                const ref = r.book + ' ' + r.chapter + ':' + r.verse;
                const isNT = NT_BOOKS.has(r.book);
                const data = CURATED[r._key];
                const btn = document.createElement('button');
                btn.className = 'search-result curated';
                btn.onclick = () => openStudy(r.book, r.chapter, r.verse, r.text);
                const tags = data.tags.slice(0,3).map(t =>
                    '<span class="sr-tag tag-' + _sAccents(t).toLowerCase() + '">' + t + '</span>').join('');
                btn.innerHTML =
                    '<div class="sr-meta">' +
                        '<span class="sr-badge ' + (isNT?'nt':'at') + '">' + (isNT?'N.T.':'A.T.') + '</span>' +
                        '<span class="search-result-ref" style="margin:0">' + ref + '</span>' + tags +
                    '</div>' +
                    '<div class="search-result-text">' + highlight(r.text) + '</div>' +
                    '<div class="sr-study">' + SR_SVG + ' Autor · Origen · Hebreo/Griego · Preguntas</div>';
                sect.appendChild(btn);
            });
            box.appendChild(sect);
            if (mainResults.length) {
                const sep = document.createElement('div');
                sep.className = 'sb-sep';
                sep.textContent = 'Más resultados';
                box.appendChild(sep);
            }
        }
        box.appendChild(buildCards(mainResults));
        if (truncated) {
            const d = document.createElement('div');
            d.className = 'search-empty';
            d.textContent = 'Mostrando los primeros ' + MAX + ' resultados. Afina tu búsqueda.';
            box.appendChild(d);
        }
        if (altResults.length) {
            const sep = document.createElement('div');
            sep.className = 'search-empty';
            sep.style.cssText = 'margin-top:1rem;border-top:1px solid rgba(255,255,255,.1);padding-top:.8rem';
            sep.innerHTML = 'También encontrado en <strong>' + altLabel + '</strong>:';
            box.appendChild(sep);
            box.appendChild(buildCards(altResults));
        }
    }
    function openSearchResult(book, chapter) {
        showTab('biblia');
        loadChapter({ book, chapter });
    }

    /* ════════════════════════════════════════════════════════════════
       BUSCAR · Estudio Bíblico Profundo
       Búsqueda real sobre toda la Biblia (gratis) + panel de estudio
       profundo (premium). El estudio rico está curado por versículo;
       para el resto se muestran las versiones reales (RVA/SBLL),
       reflexión y "próximamente" en las pestañas que requieren curaduría.
    ════════════════════════════════════════════════════════════════ */

    // Libros del Nuevo Testamento (claves tal como aparecen en window.BIBLE)
    const NT_BOOKS = new Set(['Mateo','Marcos','Lucas','Juan','Hechos','Romanos',
        '1 Corintios','2 Corintios','Galatas','Efesios','Filipenses','Colosenses',
        '1 Tesalonicenses','2 Tesalonicenses','1 Timoteo','2 Timoteo','Tito','Filemon',
        'Hebreos','Santiago','1 Pedro','2 Pedro','1 Juan','2 Juan','3 Juan','Judas','Apocalipsis']);
    const APP_BOOKS = (typeof BOOK_KEY !== 'undefined') ? Object.keys(BOOK_KEY) : [];
    function sbResolveBook(name){
        const n = _sAccents(String(name||'').trim()).toLowerCase();
        return APP_BOOKS.find(b => _sAccents(b).toLowerCase() === n) || null;
    }

    // Estudio profundo curado (claves normalizadas: sin acentos, minúsculas).
    // Se irá ampliando con el tiempo. Para versículos sin curaduría se usa
    // el modo "próximamente" + versiones reales + reflexión.
    const CURATED = {
        'juan 3:16':{bigIdea:'El amor de Dios no es un sentimiento distante: se demostró en la entrega concreta de su Hijo, para que cualquiera que crea tenga vida que la muerte no puede tocar.',exposition:['Se ha llamado a este versículo "el evangelio en miniatura", y con razón: en una sola frase Jesús condensa el corazón entero de Dios. Lo dice de noche, a Nicodemo, un hombre religioso que sabía mucho de Dios pero no lo conocía. Y empieza por lo único que lo explica todo: "De tal manera amó Dios". No dice cuánto, dice de qué manera. El amor de Dios no se mide en cantidad, sino en la forma que tomó: la entrega de su propio Hijo.',
        'Fíjate en el objeto de ese amor: "al mundo". No a los buenos, no a los que lo buscaban, sino al mundo entero en su rebeldía —el mismo mundo que lo rechazaría. Ahí está la ofensa gloriosa del evangelio: Dios amó primero, cuando nada en nosotros lo merecía. El amor humano busca lo amable; el amor de Dios crea valor donde no lo había.',
        '"Que ha dado a su Hijo unigénito." El verbo es "dar", y apunta a la cruz. Pero recuerda: aquel Hijo entregado no quedó en la tumba. Al tercer día resucitó, y por eso esta promesa tiene poder hoy —no adoramos a un mártir, sino a un Salvador vivo. La vida eterna que ofrece no es una teoría: brota de un sepulcro vacío.',
        'Y la puerta es sorprendentemente ancha: "todo aquel que en él cree". No dice el que lo merezca, el que sea digno o el que cumpla. Dice el que cree —el que deja de confiar en sí mismo y se apoya por completo en Cristo. Frente a esa fe, Dios pone dos destinos: "no se pierda, mas tenga vida eterna". No hay tercera opción, y no hay excepciones para quien cree.'],application:['Nicodemo tenía religión, pero le faltaba vida. Pregúntate con honestidad si tu fe es información sobre Dios o confianza en Dios. Creer, en el sentido de este versículo, es descansar el peso entero de tu vida sobre Cristo.',
        'Cuando dudes de que Dios te ama, no mires tus sentimientos ni tus circunstancias: mira la cruz y la tumba vacía. Ahí quedó demostrado, de una vez para siempre, "de tal manera".'],prayer:'Padre, gracias porque me amaste cuando yo aún no te buscaba, y entregaste a tu Hijo para darme vida. Ayúdame a no solo saber de ti, sino a confiar en ti de verdad. En el nombre de Jesús resucitado, amén.',tags:['promesa','amor','salvación'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Cristianos de Éfeso',location:'Éfeso',occasion:'Jesús hablando con Nicodemo, un fariseo que vino de noche. Este versículo resume todo el evangelio en una sola frase.',background:'Nicodemo era un líder religioso que reconocía que Jesús venía de Dios pero no entendía el nuevo nacimiento. Jesús le explica la necesidad del nacimiento espiritual y la magnitud del amor de Dios.',geo:'Jerusalén, en una casa donde Jesús se reunía con Nicodemo en secreto.',connections:[{ref:'Juan 1:12',text:'Mas a todos los que le recibieron, a los que creen en su nombre, les dio potestad de ser hechos hijos de Dios.'},{ref:'Romanos 5:8',text:'Mas Dios muestra su amor para con nosotros, en que siendo aún pecadores, Cristo murió por nosotros.'},{ref:'1 Juan 4:9',text:'En esto se mostró el amor de Dios para con nosotros, en que Dios envió a su Hijo unigénito al mundo, para que vivamos por él.'},{ref:'Romanos 6:23',text:'Porque la paga del pecado es muerte, mas la dádiva de Dios es vida eterna en Cristo Jesús Señor nuestro.'}],words:[{es:'amó',or:'ἀγαπάω (agapaō)',meaning:'Amor incondicional, sacrificial, de elección. No es amor emocional sino de voluntad. Es el amor más profundo del griego.',strong:'G25'},{es:'mundo',or:'κόσμος (kosmos)',meaning:'No solo el planeta sino el sistema humano caído, la humanidad en su estado de rebelión. Dios amó incluso a los que le rechazaban.',strong:'G2889'},{es:'unigénito',or:'μονογενής (monogenēs)',meaning:'Único de su clase. Indica una relación especial y exclusiva. No significa "único nacido" sino "único en su género".',strong:'G3439'}],questions:['¿Qué significa para ti que Dios amó "al mundo" entero, incluyendo a personas que podrían considerarse indignas?','Si creer en Jesús es la condición para la vida eterna, ¿qué significa realmente "creer" en tu vida diaria?','Jesús dijo esto a alguien con conocimiento religioso pero al que le faltaba algo esencial. ¿Puede el conocimiento religioso ser un obstáculo para la fe verdadera?']},
        'salmos 23:1':{bigIdea:"Si el Señor es tu pastor, tu vida no se define por lo que te falta, sino por Quién te cuida.",exposition:["David no dice \"el Señor es un pastor\", sino \"mi pastor\". Toda la fuerza del salmo cabe en ese pronombre. No habla de una idea teológica lejana, sino de una relación personal probada en los campos de Judea, donde él mismo había guiado, defendido y buscado ovejas perdidas. Ahora invierte los papeles: el pastor es pastoreado por Dios.", "En el mundo antiguo, la oveja era el animal más indefenso: sin garras, sin velocidad, sin sentido de orientación. Sobrevive solo por el pastor. Al llamarse oveja, David confiesa su total dependencia. No es debilidad avergonzada, es descanso: reconocer que Otro más sabio y más fuerte lleva la responsabilidad de mi vida.", "\"Nada me faltará\" no promete lujo, promete suficiencia. No dice que tendré todo lo que deseo, sino que no me faltará nada de lo que verdaderamente necesito. El pastor no siempre lleva a la oveja donde ella quiere, pero siempre la lleva donde ella florece: pastos delicados, aguas de reposo, sendas de justicia.", "Detrás de esta confianza hay una convicción sobre el carácter de Dios: Él no es un amo distante que usa, sino un pastor que provee, protege y guía por amor a su nombre. Descansar bajo su cuidado es la forma más alta de fe."],application:["Haz hoy el ejercicio de David: pasa de \"el Señor\" a \"mi Señor\". ¿En qué área concreta necesitas confiar que tu Pastor no te dejará faltar?", "Cuando la ansiedad te diga \"no tendrás suficiente\", responde con este versículo. La paz no viene de tener más, sino de saber de Quién dependes."],prayer:"Señor, sé mi Pastor y no solo mi Dios lejano. Enséñame a descansar en tu cuidado, a confiar cuando me guías por donde no entiendo, y a creer que a tu lado nada esencial me faltará. Amén.",tags:['promesa','consuelo','confianza'],author:'Rey David',date:'c. 1000 a.C.',audience:'Congregación de Israel / devoción personal',location:'Judea',occasion:'David reflexiona sobre su experiencia como pastor de ovejas y aplica esa relación a Dios. Probablemente escrito en sus últimos años, mirando atrás a toda una vida de provisión divina.',background:'David conocía íntimamente el oficio del pastor: guiar a las ovejas a pastos verdes, protegerlas de depredadores, buscar las perdidas. Usa esta metáfora poderosa para describir el cuidado total de Dios.',geo:'Los campos de Judea, donde David pastoreaba las ovejas de su padre Isaí.',connections:[{ref:'Juan 10:11',text:'Yo soy el buen pastor; el buen pastor su vida da por las ovejas.'},{ref:'Isaias 40:11',text:'Como pastor apacentará su rebaño; en su brazo llevará los corderos, y en su seno los llevará.'},{ref:'Salmos 34:10',text:'Los leoncillos necesitan, y tienen hambre; pero los que buscan a Jehová no tendrán falta de ningún bien.'},{ref:'Filipenses 4:19',text:'Mi Dios, pues, suplirá todo lo que os falta conforme a sus riquezas en gloria en Cristo Jesús.'}],words:[{es:'Jehová',or:'יהוה (YHWH)',meaning:'El nombre personal de Dios, el nombre del pacto. Significa "YO SOY EL QUE SOY". Es el Dios que se relaciona personalmente con su pueblo.',strong:'H3068'},{es:'pastor',or:'רֹעִי (roʿi)',meaning:'El que pastorea, cuida y guía. Implica provisión total: alimento, protección, dirección, corrección. Es una relación íntima y personal.',strong:'H7462'},{es:'faltará',or:'חָסֵר (chaser)',meaning:'Faltar, carecer, disminuir. La negación absoluta "nada me faltará" es una declaración radical de confianza total en la provisión de Dios.',strong:'H2637'}],questions:['David dice "mi" pastor, no "el" pastor. ¿Cómo cambia tu perspectiva pasar de conocer a Dios como "el Señor" a conocerlo como "mi Señor"?','¿Hay áreas en tu vida donde sientes que te "falta" algo? ¿Qué afirma este versículo sobre esas áreas?','David escribió esto desde su experiencia como pastor. ¿Qué "trabajo de pastor" reconoces que Dios ha hecho en tu vida?']},
        'isaias 41:10':{bigIdea:"El antídoto de Dios contra el miedo no es un cambio de circunstancias, sino su presencia: \"estoy contigo\".",exposition:["Dios habla a un pueblo aterrorizado ante el poder de Babilonia. No minimiza la amenaza ni promete que el peligro desaparecerá; hace algo mejor: se pone en medio. \"No temas, porque yo estoy contigo\". La razón para no temer nunca es que el problema sea pequeño, sino que Dios es grande y está presente.", "El versículo avanza como una escalera de consuelo: \"estoy contigo\" (presencia), \"soy tu Dios\" (pacto), \"te esforzaré\" (fuerza), \"te ayudaré\" (auxilio), \"te sustentaré\" (sostén). A cada temor humano, Dios opone una acción suya. El miedo enumera peligros; Dios enumera promesas.", "\"La diestra de mi justicia\" es una imagen de poder respaldado por carácter. No es fuerza bruta, es fuerza fiel. La misma mano que sostiene el universo se cierra alrededor de la tuya. No estás colgando de tu propia fe: estás sostenido por su fidelidad.", "Dios no dice \"no sentirás miedo\", dice \"no temas\": una orden que se apoya en Él, no en tus emociones. Puedes sentir el temblor y aun así no ser gobernado por el temor, porque tu ancla no está en tu valentía sino en su compañía."],application:["Nombra hoy el miedo concreto que te paraliza. Luego léelo a la luz de las cinco promesas del versículo: ¿cuál necesitas creer ahora mismo?", "Repite durante el día la frase más corta y más poderosa: \"estoy contigo\". No es un deseo, es la declaración de Dios sobre tu situación."],prayer:"Padre, cuando el miedo me quiera paralizar, recuérdame que Tú estás conmigo. Sostenme con la diestra de tu justicia y dame fuerzas que no vienen de mí. Confío en tu presencia más que en mis fuerzas. Amén.",tags:['consuelo','temor','fuerza'],author:'Profeta Isaías',date:'c. 700 a.C.',audience:'Israel ante el exilio en Babilonia',location:'Jerusalén / Babilonia',occasion:'Dios habla a Israel que enfrenta el exilio babilónico. El pueblo está aterrorizado ante las naciones poderosas. Dios les recuerda que Él está con ellos y es más poderoso que cualquier imperio.',background:'Isaías profetiza antes del exilio, preparando al pueblo para la crisis que viene. Este versículo es parte de un discurso de consolación donde Dios repite "no temas" múltiples veces.',geo:'Desde Jerusalén, mirando hacia el futuro exilio en Babilonia (actual Irak).',connections:[{ref:'Deuteronomio 31:6',text:'Esforzaos y cobrad ánimo; no temáis, ni tengáis miedo de ellos, porque Jehová tu Dios es el que va contigo.'},{ref:'Josue 1:9',text:'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo dondequiera que vayas.'},{ref:'Mateo 28:20',text:'Yo estoy con vosotros todos los días, hasta el fin del mundo.'},{ref:'Hebreos 13:5',text:'No te desampararé, ni te dejaré.'}],words:[{es:'temas',or:'יָרֵא (yare)',meaning:'Temer, estar aterrorizado. Aquí es miedo paralizante, no reverencia. Dios ordena dejar de estar aterrorizado.',strong:'H3372'},{es:'estoy contigo',or:'עִמָּךְ (ʿimmak)',meaning:'Literalmente "contigo". Es la presencia personal de Dios. No está lejos observando: está al lado, en la trinchera.',strong:'H5973'},{es:'diestra',or:'יָמִין (yamin)',meaning:'La mano derecha, símbolo de poder, honor y fidelidad. La "diestra de justicia" significa que su poder está respaldado por su carácter justo.',strong:'H3225'}],questions:['Dios dice "no temas" y luego da razones. ¿Cuál de esas razones resuena más con tu situación actual?','¿Qué diferencia hay entre "no sentir miedo" y "no temer"? ¿Es posible no temer y aun así sentir miedo?','La frase "siempre te ayudaré": ¿puedes identificar momentos pasados donde ahora reconoces que Dios te sostuvo?']},
        'romanos 8:28':{bigIdea:"Dios no promete que todo sea bueno, sino que en todas las cosas Él obra para bien de los que le aman.",exposition:["Este versículo es de los más amados y de los más malentendidos. Pablo no dice que todo lo que ocurre sea bueno: la enfermedad, la traición y la pérdida no son buenas. Dice algo más profundo: que Dios obra EN todas ellas para un bien mayor. El verbo clave es \"obra\": Dios trabaja activamente, como un artesano, incluso con el material más doloroso.", "Fíjate en la certeza: \"sabemos\". No es \"esperamos\" ni \"nos gustaría creer\". Es conocimiento firme, no basado en lo que vemos, sino en Quién es Dios. Pablo lo escribe en una carta que también habla de sufrimiento, persecución y gemidos. La confianza no niega el dolor; lo atraviesa.", "La promesa tiene destinatarios: \"los que aman a Dios, los que conforme a su propósito son llamados\". No es un amuleto universal, es la herencia de los hijos. Para quien pertenece a Dios, ni siquiera el mal que sufre queda fuera del alcance redentor de sus manos.", "El bien al que Dios apunta se define en el versículo siguiente: ser conformados a la imagen de su Hijo. A veces el \"bien\" no es una circunstancia más cómoda, sino un corazón más parecido a Cristo. Dios está más comprometido con tu carácter que con tu comodidad."],application:["¿Hay una situación que hoy no entiendes? No te pide fingir que es buena; te invita a confiar que Dios está obrando algo bueno a través de ella.", "Mira hacia atrás: identifica un dolor pasado que hoy ves que Dios usó. Deja que ese recuerdo alimente tu confianza en el dolor presente."],prayer:"Señor, cuando no entiendo lo que vivo, ayúdame a confiar en que Tú obras para bien. No siempre veo el diseño, pero conozco al Diseñador. Moldéame a la imagen de tu Hijo aun a través de lo difícil. Amén.",tags:['promesa','consuelo','fe'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Cristianos en Roma',location:'Corinto (escrito desde ahí)',occasion:'Pablo escribe a una iglesia con tensiones entre judíos y gentiles, y posible persecución. Este versículo es el clímax de una sección sobre el sufrimiento y la esperanza.',background:'Pablo no dice que "todas las cosas son buenas" sino que Dios obra EN todas las cosas para bien. Incluso el sufrimiento, la persecución y las dificultades son instrumentos en sus manos.',geo:'Escrito desde Corinto, enviado a Roma.',connections:[{ref:'Genesis 50:20',text:'Vosotros pensasteis mal contra mí, mas Dios lo encaminó a bien.'},{ref:'Jeremias 29:11',text:'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz.'},{ref:'Filipenses 1:6',text:'El que comenzó en vosotros la buena obra, la perfeccionará hasta el día de Jesucristo.'},{ref:'2 Corintios 4:17',text:'Porque esta leve tribulación momentánea produce en nosotros un cada vez más excelente y eterno peso de gloria.'}],words:[{es:'sabemos',or:'οἴδαμεν (oidamen)',meaning:'No es "creemos" sino "sabemos". Es certeza, no esperanza. Pablo habla de una convicción firme basada en el carácter de Dios.',strong:'G1492'},{es:'todas las cosas',or:'πάντα (panta)',meaning:'Literalmente TODO. No solo lo bueno, también el dolor, la pérdida, la enfermedad. Nada queda fuera del alcance soberano de Dios.',strong:'G3956'},{es:'propósito',or:'πρόθεσις (prothesis)',meaning:'Plan determinado de antemano. No es improvisado sino un propósito eterno que Dios diseñó antes de la fundación del mundo.',strong:'G4286'}],questions:['¿Te cuesta creer que "todas las cosas" incluyen las experiencias dolorosas? ¿Qué te ayuda a confiar en eso?','Pablo dice "a los que aman a Dios". ¿Es una condición o una descripción?','¿Recuerdas una situación difícil que, mirando atrás, ves que Dios usó para bien?']},
        'filipenses 4:13':{bigIdea:"\"Todo lo puedo\" no es un lema de éxito, sino el secreto del contentamiento en la abundancia y en la escasez.",exposition:["Pablo escribe estas palabras desde una prisión, no desde un podio de victoria. El versículo anterior es la clave: \"sé vivir humildemente, y sé tener abundancia... así para estar saciado como para tener hambre\". El \"todo\" que puede no es lograr cualquier sueño, sino soportar cualquier circunstancia.", "El contentamiento del que habla no es natural: es aprendido. \"He aprendido\", dice. Nadie nace sabiendo estar en paz tanto en la carencia como en la sobra. Se aprende en la escuela de la vida real, con Cristo como maestro, quitando poco a poco la dependencia de las circunstancias.", "\"En Cristo que me fortalece\": el verbo griego significa literalmente \"poner poder dentro\". La fuerza no se le pide a Pablo desde afuera; Cristo la infunde por dentro. No es autoayuda, es una vida sostenida por Otro. La debilidad de Pablo se vuelve el escenario del poder de Cristo.", "Por eso este versículo consuela tanto al que triunfa como al que apenas resiste. Cristo no promete quitarte la prueba, sino habitarla contigo y darte fuerza suficiente para el día de hoy."],application:["Antes de usar este versículo para tus metas, úsalo para tus cargas: ¿qué necesitas soportar hoy con la fuerza de Cristo, no con la tuya?", "Practica el contentamiento aprendido: agradece lo que tienes hoy en vez de esperar a otra circunstancia para estar en paz."],prayer:"Cristo, enséñame a estar contento tanto en la abundancia como en la necesidad. No confío en mis fuerzas sino en las tuyas puestas dentro de mí. Sostenme hoy, un día a la vez. Amén.",tags:['promesa','fuerza','fe'],author:'Apóstol Pablo',date:'c. 61 d.C.',audience:'Iglesia en Filipos',location:'Prisión en Roma',occasion:'Pablo escribe desde la cárcel, no sobre prosperidad sino sobre contentamiento en toda circunstancia. El versículo anterior dice "sé vivir humildemente y tener abundancia".',background:'Uno de los versículos más malinterpretados. No es un mantra de superación personal. Pablo habla de soportar hambre, necesidad y prisión. "Todo lo puedo" significa "puedo soportar cualquier cosa" en Cristo.',geo:'Desde una prisión romana, posiblemente bajo custodia militar.',connections:[{ref:'2 Corintios 12:9',text:'Bástate mi gracia; porque mi poder se perfecciona en la debilidad.'},{ref:'Juan 15:5',text:'Porque separados de mí nada podéis hacer.'},{ref:'Salmos 46:1',text:'Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.'},{ref:'Isaias 40:29',text:'Da esfuerzo al cansado, y multiplica las fuerzas al que no tiene ningunas.'}],words:[{es:'puedo',or:'ἰσχύω (ischuō)',meaning:'Tener fuerza, ser capaz. No es capacidad humana sino poder disponible. La fuerza no viene de Pablo sino de Cristo actuando en él.',strong:'G2480'},{es:'fortalece',or:'ἐνδυναμόω (endunamoō)',meaning:'Literalmente "poner poder dentro". Es la raíz de "dinamita". Cristo infunde su poder en la debilidad humana.',strong:'G1743'}],questions:['Si Pablo escribió esto desde una prisión, ¿cambia el significado que le habías dado antes?','¿Qué significa en tu día a día que la fortaleza viene "de Cristo" y no de ti mismo?','¿Hay una situación donde necesites aplicar esto: no que tú puedes, sino que Cristo puede a través de ti?']},
        'proverbios 3:5':{bigIdea:"Confiar en Dios de todo corazón significa dejar de exigirle a tu propio entendimiento respuestas que solo Él tiene.",exposition:["El proverbio ordena una confianza total: \"de todo tu corazón\". No confianza parcial, con un pie en Dios y otro en mis planes de reserva. El corazón, en la mentalidad hebrea, es el centro de la voluntad y las decisiones, no solo de las emociones. Confiar así es entregar el timón.", "El contraste es agudo: \"no te apoyes en tu propia prudencia\". No dice que la razón sea mala; dice que no es un cimiento suficiente. Tu entendimiento ve un tramo del camino; Dios ve el mapa completo. Apoyarte solo en lo que entiendes es construir sobre información incompleta.", "El versículo siguiente completa el sentido: \"reconócelo en todos tus caminos, y él enderezará tus veredas\". La confianza no es pasividad; es reconocer a Dios en cada decisión, invitándolo a lo cotidiano, no solo a las crisis.", "Confiar cuando no entiendo es la prueba más real de la fe. Es fácil creer cuando todo cuadra; la fe madura descansa en el carácter de Dios precisamente cuando su lógica me sobrepasa."],application:["Identifica una decisión donde estás exigiendo entenderlo todo antes de avanzar. ¿Puedes dar el paso confiando en Dios aunque no tengas el mapa completo?", "Haz de \"reconócelo en todos tus caminos\" un hábito: consulta a Dios en lo pequeño, no solo en lo urgente."],prayer:"Señor, ayúdame a confiar en Ti con todo el corazón y a no idolatrar mi propio entendimiento. Cuando no comprenda el camino, recordaré que Tú lo ves entero. Endereza mis veredas. Amén.",tags:['instrucción','sabiduría','fe'],author:'Rey Salomón (atribuido)',date:'c. 950 a.C.',audience:'Un joven aprendiz de sabiduría',location:'Jerusalén',occasion:'Un padre instruyendo a su hijo. Parte de una sección sobre los beneficios de la sabiduría. El "hijo" puede ser literal o todo creyente.',background:'Salomón, el hombre más sabio que existió, advierte contra confiar en la propia inteligencia. La sabiduría humana sin Dios es insuficiente. "Enderezará tus veredas" implica que sin Dios nuestros caminos se tuercen.',geo:'Jerusalén, en el contexto de la corte real.',connections:[{ref:'Jeremias 17:5',text:'Maldito el varón que confía en el hombre, y pone carne por su brazo.'},{ref:'Salmos 37:5',text:'Encomienda a Jehová tu camino, y confía en él; y él hará.'},{ref:'Isaias 30:21',text:'Y tus oídos oirán a tus espaldas palabra que diga: Este es el camino, andad por él.'},{ref:'Santiago 1:5',text:'Y si alguno de vosotros tiene falta de sabiduría, pídala a Dios.'}],words:[{es:'fíate',or:'בָּטַח (batach)',meaning:'Confiar con seguridad, sentirse a salvo. Es confianza que produce descanso, no ansiedad. Es apoyar todo tu peso en alguien.',strong:'H982'},{es:'corazón',or:'לֵב (leb)',meaning:'No solo las emociones sino la totalidad del ser interior: mente, voluntad, emociones. "Todo tu corazón" significa sin reservas.',strong:'H3820'},{es:'enderezará',or:'יָשַׁר (yashar)',meaning:'Hacer recto, enderezar. Nuestros caminos tienden a desviarse y Dios los corrige. Es una acción continua, no un momento único.',strong:'H3474'}],questions:['¿En qué áreas tiendes a apoyarte en tu "propia prudencia" en lugar de Dios?','¿Qué significa en la práctica reconocerlo en TODOS tus caminos, incluso en las decisiones pequeñas?','¿Has experimentado que Dios "enderezó" un camino que tú habías torcido?']},
        'mateo 11:28':{bigIdea:"Jesús no ofrece más religión al cansado, sino descanso; no una carga mejor, sino su propio yugo suave.",exposition:["Jesús se dirige a \"los trabajados y cargados\": los agotados por la vida y aplastados por el peso de una religión de reglas imposibles. En su época, los fariseos habían convertido la fe en una carga de mandatos. Jesús rompe el molde: en vez de exigir, invita; en vez de cargar, alivia.", "\"Venid a mí\" es sorprendente. No dice \"venid a un sistema\", \"venid a un templo\" ni \"venid a esforzaros más\". El descanso no está en un método, sino en una Persona. La invitación es a Él mismo.", "\"Yo os haré descansar\" es una promesa activa. El descanso no es algo que fabricamos por relajación; es un regalo que Cristo da. Es descanso del peso de ganarse a Dios, del intento agotador de ser suficiente. En Él, la aceptación ya no se gana: se recibe.", "El pasaje continúa con el \"yugo fácil\": Jesús no elimina toda responsabilidad, pero camina uncido a tu lado, llevando el peso contigo. Su yugo es suave porque Él tira de la mayor parte."],application:["¿Estás cansado de intentar ser suficiente para Dios o para los demás? La invitación de hoy es dejar de cargar solo y venir a Él.", "Distingue entre el cansancio de servir a Cristo (que Él sostiene) y el agotamiento de intentar merecerlo (del que te libera)."],prayer:"Jesús, vengo a Ti cansado y cargado. Recibo el descanso que solo Tú das: dejo de intentar ganarme lo que ya me ofreces por gracia. Toma mi carga y enséñame tu yugo suave. Amén.",tags:['consuelo','promesa','invitación'],author:'Mateo (recopilador)',date:'c. 50-70 d.C.',audience:'Multitudes que seguían a Jesús',location:'Galilea',occasion:'Jesús acaba de pronunciar juicio sobre ciudades que no se arrepintieron y luego hace esta invitación de gracia. El contraste es intencional: tras la justicia, la misericordia.',background:'"Trabajados y cargados" aludía a la carga de la religión farisaica con sus cientos de leyes, y también al cansancio de la vida. Jesús ofrece un yugo distinto: no la ausencia de yugo, sino uno ligero.',geo:'Galilea, probablemente cerca de Corazín y Betsaida.',connections:[{ref:'Salmos 55:22',text:'Echa sobre Jehová tu carga, y él te sustentará.'},{ref:'Isaias 28:12',text:'Este es el reposo; dad reposo al cansado.'},{ref:'1 Pedro 5:7',text:'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.'},{ref:'Apocalipsis 22:17',text:'El que tiene sed, venga; y el que quiera, tome del agua de la vida gratuitamente.'}],words:[{es:'trabajados',or:'κοπιάω (kopiaō)',meaning:'Trabajar hasta el agotamiento. No es cansancio normal sino el agotamiento profundo de luchar sin resultado.',strong:'G2872'},{es:'cargados',or:'φορτίζω (phortizō)',meaning:'Cargar con un peso pesado. Se usaba para bestias de carga. Es una carga impuesta, no elegida.',strong:'G5412'},{es:'descansar',or:'ἀναπαύω (anapauō)',meaning:'Dar descanso, alivio, refrigerio. No es solo dejar de trabajar, sino una renovación profunda del alma.',strong:'G373'}],questions:['¿Qué "cargas" llevas hoy que necesitas llevar a Jesús?','Jesús no dice "quitaré la carga" sino "yo os haré descansar". ¿Qué diferencia ves?','¿Hay alguna carga que estás llevando tú mismo en lugar de dejársela a Dios?']},
        'hebreos 11:1':{bigIdea:"La fe no es un salto al vacío, sino la certeza que da sustancia a lo que Dios ha prometido pero aún no vemos.",exposition:["El autor define la fe con dos palabras poderosas: \"certeza\" y \"convicción\". La fe bíblica no es ilusión ni optimismo ciego; es una confianza tan firme en la palabra de Dios que trata lo prometido como si ya fuera real. Da \"sustancia\" a la esperanza, la vuelve terreno sólido bajo los pies.", "\"Lo que se espera\" y \"lo que no se ve\" describen la vida entera del creyente. Caminamos hacia promesas que todavía no tocamos, seguros no por evidencia visible, sino por la fidelidad de Quien prometió. La fe mira lo invisible y lo cuenta como más seguro que lo visible.", "El capítulo entero ilustra esto con hombres y mujeres que actuaron sobre lo que Dios dijo antes de verlo cumplido: Noé construyó, Abraham partió, Moisés renunció. La fe no es sentimiento; es una respuesta que se mueve, obedece y espera.", "Esta fe no descansa en su propia intensidad, sino en su objeto: Dios. La fe débil en un Dios fiel salva; la fe fuerte en algo falso no. Lo que importa no es cuánta fe tengo, sino en Quién la pongo."],application:["¿Qué promesa de Dios necesitas tratar hoy como \"sustancia\", como algo real, aunque todavía no la veas cumplida?", "La fe se ejercita actuando. ¿Hay un paso de obediencia que Dios te pide dar antes de ver el resultado?"],prayer:"Señor, dame una fe que dé sustancia a tu esperanza y convicción de lo que no veo. Que mi confianza no descanse en mis sentimientos sino en tu fidelidad. Ayúdame a caminar creyendo tu palabra. Amén.",tags:['fe','instrucción','definición'],author:'Desconocido (¿Pablo, Apolo, Bernabé?)',date:'c. 60-70 d.C.',audience:'Cristianos judíos bajo persecución',location:'Desconocida',occasion:'El autor escribe a creyentes tentados a abandonar la fe y volver al judaísmo por la presión. Presenta una "galería de la fe" para mostrar que la fe siempre ha sido el camino de Dios.',background:'No es una definición académica sino práctica. La fe no es creer a ciegas, sino tener "evidencia" de lo invisible. Los héroes que siguen demuestran que la fe se basa en el carácter de Dios, no en las circunstancias visibles.',geo:'Posiblemente Roma o una ciudad con gran comunidad judía.',connections:[{ref:'Romanos 8:24',text:'Porque en esperanza fuimos salvos.'},{ref:'2 Corintios 5:7',text:'Porque por fe andamos, no por vista.'},{ref:'Romanos 1:17',text:'Mas el justo por la fe vivirá.'},{ref:'1 Juan 5:4',text:'Esta es la victoria que ha vencido al mundo, nuestra fe.'}],words:[{es:'fe',or:'πίστις (pistis)',meaning:'Fe, confianza, convicción. En el NT es tanto creer datos como confiar en una persona. Incluye fidelidad y lealtad, no solo asentimiento intelectual.',strong:'G4102'},{es:'certeza',or:'ὑπόστασις (hypostasis)',meaning:'Lo que está debajo: fundamento, sustancia, realidad. La fe es la "sustancia" de lo esperado; lo hace real en el presente.',strong:'G5287'},{es:'convicción',or:'ἔλεγχος (elegchos)',meaning:'Prueba, evidencia que persuade. No es un deseo sino una demostración. La fe tiene carácter probatorio.',strong:'G1650'}],questions:['Si la fe es "certeza" y "convicción" (no esperanza vaga), ¿qué te da esa certeza en tu vida?','¿Recuerdas algo que una vez fue "invisible" para ti y que la fe te ayudó a ver?','¿Cómo se diferencia la fe bíblica de "pensar positivo" o "desear con fuerza"?']},
        'jeremias 29:11':{bigIdea:"Los planes de Dios para su pueblo son de paz y esperanza, aun cuando el presente parezca todo lo contrario.",exposition:["Dios pronuncia esta promesa a un pueblo en el exilio, arrancado de su tierra y llevado a Babilonia. No es un versículo para tarjetas de felicitación fácil: es esperanza dicha en medio del quebranto. El contexto le da peso. Dios habla de futuro a quienes sienten que no lo tienen.", "\"Yo sé los pensamientos que tengo acerca de vosotros\". Frente a la confusión del pueblo, Dios afirma que Él sí sabe. Hay un plan, aunque no se vea; hay un propósito, aunque el camino pase por Babilonia. La soberanía de Dios no se cancela por el sufrimiento; opera a través de él.", "\"Pensamientos de paz, y no de mal\": el corazón de Dios hacia los suyos es bueno. Pero el mismo pasaje aclara que la liberación llegaría tras setenta años. La esperanza era real, pero no inmediata. Dios da futuro, no siempre atajos. Su tiempo no es el nuestro.", "Este versículo no promete una vida sin dificultad, sino un Dios que teje propósito y esperanza incluso en el exilio. El destino final de los suyos siempre es \"fin y esperanza\", aunque el trayecto sea largo."],application:["Si estás en tu propio \"exilio\", una etapa que no elegiste, recuerda: Dios sabe lo que hace aunque tú no lo veas. Su plan sigue en pie.", "La esperanza de Dios suele desplegarse con paciencia. Pregúntate si estás confiando en su bondad incluso cuando su tiempo es más largo del que quisieras."],prayer:"Padre, aun en mis exilios confío en que tus pensamientos hacia mí son de paz y no de mal. Dame paciencia para esperar tu tiempo y esperanza para creer que tienes un buen futuro para mí. Amén.",tags:['promesa','esperanza','propósito'],author:'Profeta Jeremías',date:'c. 597 a.C.',audience:'Israelitas exiliados en Babilonia',location:'Carta enviada desde Jerusalén',occasion:'Jeremías escribe al primer grupo de exiliados deportados a Babilonia. Falsos profetas prometían un regreso rápido. Dios, a través de Jeremías, dice la verdad dura: 70 años de exilio. Pero en medio de esa noticia, entrega esta promesa de futuro y esperanza.',background:'El pueblo había perdido tierra, templo y libertad. La carta les ordena algo radical: construir casas, plantar jardines, casarse y buscar el bien de Babilonia. Vivir, no solo sobrevivir. Y en ese proceso, Dios les recuerda que tiene planes buenos incluso para su peor momento.',geo:'Carta enviada desde Jerusalén a Babilonia (actual Irak), donde los exiliados vivían junto al río Quebar.',connections:[{ref:'Romanos 8:28',text:'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.'},{ref:'Isaias 55:8',text:'Porque mis pensamientos no son vuestros pensamientos, ni vuestros caminos mis caminos, dijo Jehová.'},{ref:'Salmos 33:11',text:'El consejo de Jehová permanecerá para siempre; los pensamientos de su corazón, por todas las generaciones.'},{ref:'Efesios 2:10',text:'Porque somos hechura suya, creados en Cristo Jesús para buenas obras, las cuales Dios preparó de antemano para que anduviésemos en ellas.'}],words:[{es:'pensamientos',or:'מַחֲשָׁבוֹת (machashavot)',meaning:'Planes deliberados, diseños intencionales. No es una idea vaga sino un proyecto arquitectónico. Dios tiene un plano detallado para tu vida, no un borrador.',strong:'H4284'},{es:'paz',or:'שָׁלוֹם (shalom)',meaning:'Bienestar total: salud, plenitud, prosperidad, relaciones restauradas. No es solo ausencia de conflicto sino presencia activa de todo bien.',strong:'H7965'},{es:'esperanza',or:'תִּקְוָה (tiqvah)',meaning:'Expectativa, esperanza. La raíz significa "cuerda" o "hilo". Es lo que te sostiene cuando todo colapsa: la cuerda a la que te aferras en la oscuridad.',strong:'H8615'}],questions:['Este versículo fue dado a personas en el peor momento de su historia nacional. ¿Cómo cambia eso tu forma de leerlo en tus propias circunstancias difíciles?','Dios dice "planes de paz y no de mal". ¿Hay áreas de tu vida donde te cuesta creer que su plan es bueno?','La promesa termina con "me buscaréis y me hallaréis". ¿Qué papel juega tu búsqueda activa de Dios en el cumplimiento de su promesa?']},
        'salmos 91:1':{bigIdea:"Quien hace de Dios su morada habitual encuentra en Él una sombra de protección que el mundo no puede dar.",exposition:["El salmo abre con una imagen de intimidad: \"el que habita al abrigo del Altísimo\". No es una visita ocasional al templo, es habitar, morar, hacer de Dios el lugar donde se vive. La protección prometida es para quien se refugia en Él como estilo de vida, no como recurso de emergencia.", "\"Bajo la sombra del Omnipotente\": en el calor abrasador de Oriente, la sombra era vida. Estar bajo la sombra de Dios es estar tan cerca que su presencia te cubre. La cercanía es la clave: la sombra solo alcanza a quien camina junto a quien la proyecta.", "Los nombres de Dios en este versículo predican por sí solos. \"Altísimo\" (Elyón): el que está por encima de todo poder. \"Omnipotente\" (Shaddai): el todo-suficiente. El que se esconde en Dios se esconde en el más alto y el más fuerte; ningún refugio es más seguro.", "El resto del salmo despliega las promesas, pero todas dependen de este primer verbo: habitar. La protección no es mágica ni automática; fluye de una relación cercana y constante con Dios."],application:["¿Es Dios tu morada habitual o tu refugio de último recurso? La sombra cubre a quien vive cerca, no a quien solo corre en la tormenta.", "Cultiva hoy el \"habitar\": momentos deliberados de estar con Dios, no solo de pedirle cosas."],prayer:"Altísimo, quiero habitar en Ti, no solo visitarte. Sé mi morada y mi sombra en el calor de la vida. Enséñame a vivir tan cerca de Ti que tu presencia me cubra cada día. Amén.",tags:['promesa','protección','confianza'],author:'Desconocido (tradición atribuye a Moisés)',date:'c. 1400 a.C. (si es Moisés) o época del templo',audience:'Israel, uso litúrgico y personal',location:'Posiblemente el desierto',occasion:'Una meditación sobre la protección sobrenatural de Dios para quien vive en comunión con Él. El salmo habla de plagas, peligros nocturnos, saetas, leones. Es un cántico de confianza radical.',background:'El versículo de apertura establece la condición: "el que habita". No es una visita, es residencia. El nivel de protección descrito en el salmo corresponde al nivel de intimidad con Dios. Habitar en Él no es un acto ocasional sino un estilo de vida.',geo:'El contexto evoca el desierto: plagas, animales peligrosos, peligros de campaña militar. Aplicable a toda situación de amenaza.',connections:[{ref:'Juan 15:4',text:'Permaneced en mí, y yo en vosotros. Como el pámpano no puede llevar fruto por sí mismo, si no permanece en la vid.'},{ref:'Salmos 121:7',text:'Jehová te guardará de todo mal; él guardará tu alma.'},{ref:'Isaias 43:2',text:'Cuando pases por las aguas, yo estaré contigo; y cuando por los ríos, no te anegarán.'},{ref:'2 Tesalonicenses 3:3',text:'Pero fiel es el Señor, que os afirmará y guardará del mal.'}],words:[{es:'habita',or:'יֹשֵׁב (yoshev)',meaning:'Habitar, sentarse, quedarse. Es permanencia, no visita. El "que habita" ha establecido su residencia espiritual en Dios, no quien lo visita solo en momentos de crisis.',strong:'H3427'},{es:'abrigo',or:'סֵתֶר (seter)',meaning:'Escondite, refugio secreto, lugar oculto. Evoca una cueva o fortaleza donde el enemigo no puede encontrarte. Dios mismo es el escondite.',strong:'H5643'},{es:'Altísimo',or:'עֶלְיוֹן (Elyon)',meaning:'El Más Alto, el Supremo. Nombre que enfatiza la soberanía absoluta de Dios sobre toda autoridad, poder o peligro. Nada está por encima de Él.',strong:'H5945'}],questions:['¿Qué diferencia hay entre "visitar" a Dios en momentos de necesidad y "habitar" en Él como estilo de vida?','El salmo promete protección a quien mora con Dios. ¿En qué áreas de tu vida necesitas pasar de visitar a habitar?','¿Hay una situación actual donde necesitas aplicar la imagen del "abrigo": estar escondido bajo la protección de Dios?']},
        '1 corintios 13:4':{bigIdea:"El amor verdadero no se mide por lo que siente, sino por lo que hace: es paciente y es benigno.",exposition:["Pablo escribe a una iglesia orgullosa de sus dones espirituales pero pobre en amor. Por eso interrumpe su enseñanza sobre los dones para mostrar el camino más excelente. Y define el amor no con emociones, sino con verbos: lo que el amor hace y lo que no hace.", "\"El amor es sufrido\" (paciente): literalmente, \"de larga ira\", tarda en enojarse. Soporta las faltas de los demás sin explotar. Es la paciencia de Dios reflejada en nosotros, que no lleva cuenta de cada ofensa.", "\"Es benigno\" (bondadoso): la paciencia soporta, la bondad actúa. No solo no hace daño, sino que busca activamente el bien del otro. El amor paciente aguanta; el amor benigno bendice.", "Luego viene la lista de lo que el amor NO es: no tiene envidia, no se jacta, no se envanece. El amor verdadero desinfla el ego. Donde crece el amor, se encoge el yo. Este es el amor con el que Dios nos ama en Cristo, y el que Él produce en nosotros."],application:["Cambia la palabra \"amor\" por tu nombre en este versículo: \"[tu nombre] es sufrido, es benigno...\". ¿Dónde te queda grande? Ahí Dios quiere trabajar.", "Hoy el amor no es un sentimiento que esperas sentir, sino una decisión que puedes tomar: ser paciente y bondadoso con alguien difícil."],prayer:"Señor, Tú eres amor. Produce en mí un amor que sea paciente cuando quiero explotar y bondadoso cuando sería más fácil ignorar. Encoge mi ego para que crezca tu amor en mí. Amén.",tags:['amor','instrucción','carácter'],author:'Apóstol Pablo',date:'c. 55 d.C.',audience:'Iglesia de Corinto',location:'Éfeso (escrito desde ahí)',occasion:'La iglesia de Corinto tenía conflictos serios: divisiones por líderes, pleitos legales, abuso de los dones espirituales, orgullo intelectual. El capítulo 13 es la respuesta de Pablo: sin amor, todo lo demás, incluso los dones más impresionantes, es nada.',background:'Pablo no define el amor con conceptos abstractos sino con acciones concretas. Cada frase de este versículo es una corrección directa a los problemas de Corinto: eran impacientes, envidiosos, vanidosos. Pablo les muestra que el amor verdadero es el opuesto exacto de lo que estaban haciendo.',geo:'Escrito desde Éfeso, enviado a Corinto (actual Grecia).',connections:[{ref:'Juan 13:34',text:'Un mandamiento nuevo os doy: que os améis unos a otros; como yo os he amado, que también os améis unos a otros.'},{ref:'1 Juan 4:7',text:'Amados, amémonos unos a otros; porque el amor es de Dios. Todo aquel que ama, es nacido de Dios, y conoce a Dios.'},{ref:'Romanos 13:10',text:'El amor no hace mal al prójimo; así que el cumplimiento de la ley es el amor.'},{ref:'Colosenses 3:14',text:'Y sobre todas estas cosas, vestíos de amor, que es el vínculo perfecto.'}],words:[{es:'sufrido',or:'μακροθυμέω (makrothumeō)',meaning:'Tener paciencia larga. La raíz une "largo" (makro) con "ánimo" (thumos). Es aguantar sin explotar, soportar provocación sin represalia. No es pasividad sino fuerza contenida.',strong:'G3114'},{es:'benigno',or:'χρηστεύομαι (chrēsteuomai)',meaning:'Actuar con bondad activa. No es solo no hacer daño, es buscar activamente el bien del otro. Es la benignidad práctica en acción.',strong:'G5541'},{es:'envidia',or:'ζηλόω (zēloō)',meaning:'Arder de celos, desear lo que otro tiene. En Corinto había competencia por los dones espirituales más visibles. Pablo dice: el amor no compite, celebra.',strong:'G2206'}],questions:['Pablo describe el amor con verbos de acción, no con sentimientos. ¿Cuál de estas acciones te resulta más difícil de practicar consistentemente?','Si aplicaras esta descripción del amor a tus relaciones más cercanas, ¿qué cambiaría concretamente?','¿Hay alguna relación donde estés haciendo lo correcto pero sin amor? ¿Qué diferencia haría añadir el amor genuino?']},
        'josue 1:9':{bigIdea:"El valor no nace de la ausencia de peligro, sino de la presencia garantizada de Dios: \"contigo estaré\".",exposition:["Josué asume el liderazgo tras la muerte de Moisés, ante la tarea imposible de conquistar la tierra prometida. El pueblo lo mira, los enemigos lo esperan, y el peso podría aplastarlo. Dios no le quita el desafío; le da la razón para enfrentarlo: su compañía.", "\"Esfuérzate y sé valiente\" es una orden, no una sugerencia. Pero es una orden con fundamento: \"no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas\". El valor bíblico no es sentirse fuerte, es actuar confiando en que Dios va delante.", "Tres veces en este capítulo Dios le repite \"esfuérzate\". La repetición revela que Josué necesitaba oírlo, porque el miedo era real. Dios no reprocha el temor; lo confronta con su presencia. La valentía no niega el miedo, lo somete a una verdad mayor.", "\"En dondequiera que vayas\": la promesa no tiene límites geográficos. No hay territorio, batalla ni valle donde la presencia de Dios no llegue primero. Ese es el suelo firme del valor del creyente."],application:["¿Qué tarea te parece hoy demasiado grande? Dios no promete quitarla, promete acompañarte en ella. Da el paso con esa certeza.", "Cuando el miedo regrese, predícate lo que Dios le repitió a Josué: no estás solo, Él va contigo dondequiera que vayas."],prayer:"Señor, ante lo que me sobrepasa, dame el valor que nace de saber que Tú vas conmigo. Esfuérzame cuando quiera desmayar y recuérdame que tu presencia me acompaña a cada lugar. Amén.",tags:['promesa','valentía','fuerza'],author:'Narrador / voz de Dios',date:'c. 1405 a.C.',audience:'Josué y el pueblo de Israel',location:'Llanuras de Moab, a orillas del río Jordán',occasion:'Moisés acaba de morir. Josué enfrenta la tarea humanamente imposible: cruzar el Jordán en crecida, conquistar ciudades amuralladas, enfrentar gigantes. Dios lo llama tres veces en el mismo capítulo a ser fuerte y valiente.',background:'No es motivación psicológica sino una orden divina respaldada por una presencia divina. "No temas ni desmayes" no significa "siente valor" sino "actúa con valor aunque sientas miedo". La clave es la promesa final: Dios estará con él dondequiera que vaya.',geo:'Orillas orientales del río Jordán, frente a Jericó. El pueblo está a punto de cruzar hacia Canaán.',connections:[{ref:'Deuteronomio 31:6',text:'Esforzaos y cobrad ánimo; no temáis, ni tengáis miedo de ellos, porque Jehová tu Dios es el que va contigo.'},{ref:'Isaias 41:10',text:'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo.'},{ref:'Mateo 28:20',text:'Yo estoy con vosotros todos los días, hasta el fin del mundo.'},{ref:'Hebreos 13:5',text:'No te desampararé, ni te dejaré.'}],words:[{es:'esfuérzate',or:'חֲזַק (chazaq)',meaning:'Ser fuerte, fortalecerse, agarrarse con fuerza. Es un imperativo activo: no esperar a sentirse fuerte, sino elegir actuar con firmeza ante la adversidad.',strong:'H2388'},{es:'valiente',or:'אָמַץ (amatz)',meaning:'Ser audaz, atrevido, resuelto. Implica vigor mental y moral, no solo físico. Es la valentía de tomar decisiones difíciles sin paralizarse.',strong:'H553'},{es:'contigo',or:'עִמָּךְ (immak)',meaning:'Con-tigo, en tu mismo espacio. No es Dios observando desde lejos sino caminando en el mismo terreno, en la misma situación. Presencia literal y personal.',strong:'H5973'}],questions:['Dios ordena "no temas" pero Josué sin duda sentía miedo. ¿Cómo puedes actuar con valentía aunque sientas miedo?','¿Hay un Jordán que necesitas cruzar en tu vida, una decisión que has estado posponiendo por temor?','La valentía de Josué se basaba en la presencia de Dios, no en sus propias capacidades. ¿En qué cosas confías más en ti mismo que en Dios?']},
        'salmos 46:1':{bigIdea:"Dios no es solo un refugio para después de la tormenta, sino un auxilio presente en medio de ella.",exposition:["El salmo nace en tiempos de crisis nacional: naciones que rugen, reinos que se tambalean, la tierra que parece moverse. En medio de ese caos, el salmista declara una roca inamovible: \"Dios es nuestro amparo y fortaleza\". Cuando todo tiembla, Dios no.", "\"Amparo\" habla de refugio, un lugar donde esconderse; \"fortaleza\" habla de poder, fuerza para resistir. Dios es las dos cosas: el escondite donde nos protegemos y la fuerza que nos sostiene. No solo nos cubre, también nos capacita.", "La frase clave es \"pronto auxilio en las tribulaciones\". \"Pronto\" significa muy presente, disponible, cercano. Dios no es un socorro lejano al que hay que despertar; está ya presente en la tribulación, no esperando al final de ella.", "Por eso el salmo puede decir después: \"no temeremos, aunque la tierra sea removida\". La paz no viene de la ausencia de terremotos, sino de la presencia del Dios que no se mueve cuando todo se mueve."],application:["En tu tribulación actual, ¿estás buscando a Dios como auxilio \"presente\" o esperando que aparezca al final? Él ya está en medio de tu situación.", "Cuando el mundo tiemble, ancla tu corazón no en la calma exterior sino en el Dios que no se mueve."],prayer:"Dios, Tú eres mi amparo y mi fortaleza, mi pronto auxilio cuando todo tiembla. No temeré, porque Tú estás presente en medio de mi tribulación, no al final de ella. Quédate cerca. Amén.",tags:['consuelo','promesa','refugio'],author:'Hijos de Coré',date:'Posiblemente c. 701 a.C. (invasión asiria de Senaquerib)',audience:'Pueblo de Israel en crisis nacional',location:'Jerusalén',occasion:'Posiblemente escrito durante el asedio asirio de Jerusalén bajo Ezequías, cuando el ejército de Senaquerib rodeó la ciudad. Un milagro divino destruyó 185.000 soldados en una noche. El salmo canta la seguridad de los que confían en Dios incluso cuando la tierra se sacude.',background:'El salmo comienza con una declaración teológica radical: Dios es amparo, fortaleza y ayuda. No "puede ser" ni "a veces es", sino "es". Luego imagina lo peor posible: montañas que se derrumban, mares que braman. Y en todo eso, concluye: no temeremos.',geo:'Jerusalén, bajo amenaza del ejército asirio más poderoso del mundo antiguo.',connections:[{ref:'Salmos 91:2',text:'Diré yo a Jehová: Esperanza mía, y castillo mío; mi Dios, en quien confiaré.'},{ref:'Proverbios 18:10',text:'Torre fuerte es el nombre de Jehová; a él correrá el justo, y será levantado.'},{ref:'Nahum 1:7',text:'Jehová es bueno, una fortaleza en el día de la angustia; y conoce a los que en él confían.'},{ref:'2 Samuel 22:3',text:'Dios mío, fortaleza mía, en él confiaré; mi escudo, y la fuerza de mi salvación, mi alto refugio.'}],words:[{es:'amparo',or:'מַחֲסֶה (machseh)',meaning:'Refugio, lugar donde esconderse de la tormenta. Es imagen de alguien que corre a ponerse bajo techo cuando llega el peligro. Dios es ese refugio siempre disponible.',strong:'H4268'},{es:'fortaleza',or:'עֹז (oz)',meaning:'Fuerza, poder, bastión inexpugnable. No es solo un lugar seguro, es un lugar desde donde se derrota al enemigo. Dios no solo protege, es poder ofensivo.',strong:'H5797'},{es:'pronto auxilio',or:'נִמְצָא מְאֹד (nimtza meod)',meaning:'Encontrado en abundancia, siempre disponible, fácil de encontrar. No es ayuda tardía ni escasa: es abundante y accesible en el momento exacto de la necesidad.',strong:'H4672'}],questions:['El salmo imagina lo peor posible (montañas que caen al mar) y dice "no temeremos". ¿Cuál es tu montaña que cae y cómo cambia este versículo tu perspectiva?','¿Qué diferencia hay entre saber que Dios puede ayudar y declarar que Él es tu amparo y fortaleza?','El salmo invita a estar quietos y conocer que Él es Dios. ¿Hay una situación donde necesitas dejar de luchar y descansar en su poder?']},
        'juan 14:6':{bigIdea:"Jesús no señala un camino a Dios: Él mismo es el Camino, la Verdad y la Vida.",exposition:["Jesús responde a Tomás, que pregunta angustiado por dónde ir. La respuesta no es un mapa ni un método: \"Yo soy el camino\". No dijo \"yo enseño el camino\" ni \"yo muestro un camino\", sino \"yo soy\". El acceso a Dios no es un sistema, es una Persona.", "\"Camino, verdad y vida\" son tres afirmaciones entrelazadas. Es el Camino porque nos lleva al Padre; la Verdad porque en Él Dios se nos revela sin engaño; la Vida porque solo en Él hay vida eterna. Quitar cualquiera de las tres deja el evangelio incompleto.", "\"Nadie viene al Padre sino por mí\": una afirmación exclusiva que ofende al mundo y consuela al creyente. Ofende porque niega otros caminos; consuela porque garantiza uno seguro. Si Jesús es el camino, entonces hay camino, y está abierto para todo el que venga.", "Esta exclusividad no es arrogancia, es amor. Jesús, muerto y resucitado, es el único que abrió de par en par la puerta al Padre. Señalar otro camino sería enviar a la gente a puertas cerradas."],application:["¿Buscas a Dios a través de fórmulas, esfuerzos o experiencias? El versículo te lleva de vuelta a lo esencial: a la Persona de Jesús.", "Descansa en la seguridad de que el camino no depende de tu perfección, sino de Aquel que dijo \"Yo soy\"."],prayer:"Jesús, Tú eres mi camino al Padre, la verdad que no engaña y la vida que no acaba. No busco otra puerta: vengo a Dios por Ti, que moriste y resucitaste para abrirme paso. Amén.",tags:['fe','camino','salvación'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Los discípulos (Última Cena)',location:'Aposento alto, Jerusalén',occasion:'Es la noche antes de la crucifixión. Jesús habla de irse y prepararles un lugar. Tomás interrumpe: "Señor, no sabemos a dónde vas, ¿cómo pues podemos saber el camino?" La respuesta de Jesús es una de las declaraciones más exclusivas y absolutas del Nuevo Testamento.',background:'Jesús no dice "soy un camino" sino "soy el camino". En un contexto donde el pluralismo religioso era común (Roma tenía miles de dioses), esta declaración era revolucionaria. La forma griega usa el artículo definido tres veces: el camino, la verdad, la vida. No hay artículo indefinido.',geo:'Aposento alto en Jerusalén, horas antes de la traición de Judas y la crucifixión. Y su posterior resurrección al tercer día.',connections:[{ref:'Juan 10:9',text:'Yo soy la puerta; el que por mí entrare, será salvo; y entrará, y saldrá, y hallará pastos.'},{ref:'Hechos 4:12',text:'Y en ningún otro hay salvación; porque no hay otro nombre bajo el cielo, dado a los hombres, en que podamos ser salvos.'},{ref:'1 Timoteo 2:5',text:'Porque hay un solo Dios, y un solo mediador entre Dios y los hombres, Jesucristo hombre.'},{ref:'Hebreos 10:20',text:'Por el camino nuevo y vivo que él nos abrió a través del velo, esto es, de su carne.'}],words:[{es:'camino',or:'ὁδός (hodos)',meaning:'Camino, ruta, senda. En el contexto judío evocaba "el camino" de la Torah. Jesús personaliza este concepto: el camino no es un conjunto de reglas sino una persona.',strong:'G3598'},{es:'verdad',or:'ἀλήθεια (alētheia)',meaning:'Verdad absoluta, realidad genuina. No solo información correcta sino la realidad última del universo. Jesús no solo dice la verdad: Él es la verdad encarnada.',strong:'G225'},{es:'vida',or:'ζωή (zōē)',meaning:'Vida en su forma más plena y divina. El griego distingue bios (existencia biológica) de zoe (vida verdadera, eterna, divina). Jesús muerto y resucitado ofrece zoe, no solo bios.',strong:'G2222'}],questions:['Jesús dice "nadie viene al Padre sino por mí". ¿Cómo reconcilias esta afirmación exclusiva con el amor de Dios por toda la humanidad?','Si Jesús es la verdad, ¿qué implicaciones tiene eso para la forma en que buscas conocer la realidad y tomar decisiones?','¿Hay algo que hayas puesto como camino a Dios además de Jesús: la religión, la moralidad, la tradición familiar?']},
        'efesios 2:8':{bigIdea:"La salvación es un regalo de Dios recibido por fe, no un salario que se gana con obras.",exposition:["Pablo condensa el corazón del evangelio: \"por gracia sois salvos por medio de la fe\". Dos palabras cambian todo: gracia (favor inmerecido) y fe (mano vacía que recibe). La salvación no comienza en nosotros buscando a Dios, sino en Dios buscándonos por pura bondad.", "\"Y esto no de vosotros, pues es don de Dios\". Incluso la fe con la que recibimos es regalo. No hay ni un rincón de la salvación del que podamos jactarnos. Todo, de principio a fin, es don. El orgullo humano queda sin lugar donde apoyarse.", "\"No por obras, para que nadie se gloríe\". Si pudiéramos ganar la salvación, la gloria sería nuestra. Dios la hace regalo precisamente para que la gloria sea suya y nuestra seguridad no dependa de nuestro rendimiento cambiante, sino de su gracia firme.", "Esta gracia se ancla en Cristo, muerto y resucitado por nosotros. El versículo siguiente aclara: no somos salvos por obras, pero sí creados \"para buenas obras\". La gracia no cancela las obras; las pone en su lugar: fruto, no raíz."],application:["¿Tu paz con Dios depende de lo bien que te portas esta semana? Este versículo te libera: descansas en su gracia, no en tu desempeño.", "Deja que la gratitud, no la obligación, mueva tus buenas obras. Sirves porque ya eres salvo, no para llegar a serlo."],prayer:"Padre, gracias porque me salvaste por gracia, no por mis méritos. Nada tengo de qué jactarme: todo es tu regalo. Que mi vida sea la respuesta agradecida a un amor que no gané. Amén.",tags:['salvación','gracia','fe'],author:'Apóstol Pablo',date:'c. 60-62 d.C.',audience:'Iglesia de Éfeso (y circular a otras iglesias)',location:'Prisión en Roma',occasion:'Pablo escribe una de sus cartas más teológicas mientras está preso. En el capítulo 2 describe el estado de muerte espiritual del ser humano y luego el contraste radical de la gracia de Dios. Este versículo es el corazón de esa explicación.',background:'El versículo resuelve el debate humano más antiguo: ¿cómo se salva el hombre? Pablo responde con tres negaciones: no por obras, no de vosotros, no por méritos. Todo es gracia. Todo es don. Ningún ser humano puede jactarse. La fe misma es posibilitada por Dios.',geo:'Escrito desde prisión en Roma, enviado a la ciudad de Éfeso (actual Turquía occidental).',connections:[{ref:'Romanos 3:28',text:'Concluimos, pues, que el hombre es justificado por fe sin las obras de la ley.'},{ref:'Tito 3:5',text:'Nos salvó, no por obras de justicia que nosotros hubiéramos hecho, sino por su misericordia.'},{ref:'Romanos 6:23',text:'Porque la paga del pecado es muerte, mas la dádiva de Dios es vida eterna en Cristo Jesús Señor nuestro.'},{ref:'Filipenses 3:9',text:'Y ser hallado en él, no teniendo mi propia justicia, que es por la ley, sino la que es por la fe de Cristo.'}],words:[{es:'gracia',or:'χάρις (charis)',meaning:'Favor inmerecido. La raíz griega significa "alegría". La gracia es el regalo que Dios da no porque tú lo merezcas sino porque Él es generoso. No puede ganarse, solo recibirse.',strong:'G5485'},{es:'fe',or:'πίστις (pistis)',meaning:'Confianza activa, fidelidad, convicción que produce acción. No es solo creer datos sobre Dios sino confiar en Él como persona. Pablo sugiere que incluso esta fe es don de Dios.',strong:'G4102'},{es:'don',or:'δῶρον (dōron)',meaning:'Regalo, presente. Algo dado gratuitamente, sin contraprestación. La salvación no es un intercambio sino un regalo unilateral de Dios al hombre.',strong:'G1435'}],questions:['¿Hay áreas en tu vida espiritual donde todavía intentas ganarte la aprobación de Dios? ¿Cómo cambia este versículo esa tendencia?','Si la salvación es completamente un don, ¿qué rol juega la fe? ¿Es la fe un mérito o una mano abierta para recibir?','Pablo dice que es "para que nadie se gloríe". ¿Cómo afecta tu actitud hacia otros saber que tu salvación no depende de tu esfuerzo sino de la gracia de Dios?']},
        'genesis 1:1':{bigIdea:"Todo lo que existe empieza con Dios: no somos un accidente, sino la obra intencional de un Creador.",exposition:["\"En el principio creó Dios los cielos y la tierra\". La Biblia no comienza argumentando la existencia de Dios; la presupone. Antes de la materia, del tiempo y del espacio, estaba Dios. Él no es parte de la creación: es anterior a ella y su causa.", "El verbo \"creó\" (bará) se usa en hebreo solo con Dios como sujeto. Es hacer surgir algo donde no había nada, un poder exclusivamente divino. El universo no es autoexistente ni eterno; fue llamado a existir por la voluntad de un Dios personal.", "Que Dios creara \"los cielos y la tierra\" —una expresión que abarca la totalidad— significa que nada queda fuera de su dominio. Si Él lo hizo todo, entonces todo le pertenece y todo tiene sentido en relación con Él. No hay rincón neutral en el universo.", "Y si Dios creó con propósito, entonces tú también fuiste hecho con intención. No eres un producto del azar, sino parte de una obra pensada por un Creador que, más adelante en el mismo capítulo, te hace a su imagen."],application:["Cuando dudes de tu valor o tu propósito, vuelve al principio: fuiste creado, no producido al azar. Detrás de tu existencia hay un Creador intencional.", "Reconocer a Dios como Creador cambia cómo vives: todo lo que tienes es suyo, prestado y con propósito."],prayer:"Dios Creador, Tú estabas antes de todo y todo lo hiciste con propósito. Gracias porque no soy un accidente sino obra de tus manos. Ayúdame a vivir reconociendo que Tú eres el principio de todo. Amén.",tags:['fe','creación','fundamento'],author:'Moisés (tradición)',date:'c. 1400 a.C. (escritura)',audience:'Israel recién salido de Egipto',location:'El Sinaí o el desierto',occasion:'El libro del Génesis comienza sin introducir a Dios: lo presupone. El primer versículo de la Biblia no argumenta la existencia de Dios, la declara. En ocho palabras en hebreo, establece cuatro verdades fundamentales que el resto de la Escritura asume.',background:'Israel venía de Egipto, donde los dioses eran fuerzas de la naturaleza: el sol (Ra), el río (Hapi), la tierra. El Génesis desmitifica todo: el sol no es un dios, fue creado. El mar no es un dios, fue ordenado. Hay un solo Creador, y Él está por encima de toda su creación.',geo:'El texto no sitúa al narrador en ningún lugar: trasciende la geografía. Habla desde antes del tiempo y del espacio.',connections:[{ref:'Juan 1:1',text:'En el principio era el Verbo, y el Verbo era con Dios, y el Verbo era Dios.'},{ref:'Colosenses 1:16',text:'Porque en él fueron creadas todas las cosas, las que hay en los cielos y las que hay en la tierra.'},{ref:'Hebreos 11:3',text:'Por la fe entendemos haber sido constituido el universo por la palabra de Dios.'},{ref:'Salmos 33:6',text:'Por la palabra de Jehová fueron hechos los cielos, y todo el ejército de ellos por el aliento de su boca.'}],words:[{es:'principio',or:'בְּרֵאשִׁית (bereshit)',meaning:'Al inicio, en el comienzo. La primera palabra de toda la Biblia. No solo el inicio del tiempo sino el punto de partida de toda realidad. Antes de esto, solo Dios.',strong:'H7225'},{es:'creó',or:'בָּרָא (bara)',meaning:'Crear de la nada (creatio ex nihilo). Este verbo en hebreo solo tiene a Dios como sujeto: los humanos hacen, forman, construyen; Dios crea. Ningún otro ser puede bara.',strong:'H1254'},{es:'Dios',or:'אֱלֹהִים (Elohim)',meaning:'Nombre plural de Dios, usado con verbo singular. Indica plenitud y majestad, la totalidad de su ser. Los rabinos ven en este plural una riqueza interior de Dios que el NT revela como Trinidad.',strong:'H430'}],questions:['El versículo declara a Dios sin defenderlo ni argumentarlo. ¿Cómo cambia tu fe saber que la Biblia no intenta probar a Dios sino revelarlo?','Si Dios creó los cielos y la tierra (es decir, todo lo que existe), ¿qué área de tu vida aún no has puesto bajo su señorío como Creador?','Juan 1:1 muestra que el Hijo de Dios estaba presente en el principio. ¿Cómo enriquece esto tu comprensión de quién es Jesús?']},
        '2 timoteo 1:7':{bigIdea:"El espíritu que Dios da no produce cobardía, sino poder, amor y una mente dominada por Él.",exposition:["Pablo escribe a Timoteo, un joven pastor tímido, probablemente intimidado por la oposición y por su propia juventud. Le recuerda una verdad que endereza el alma: \"no nos ha dado Dios espíritu de cobardía\". El miedo paralizante no viene de Dios; no encaja con lo que Él ha puesto dentro de ti.", "A cambio, Dios da tres cosas. \"Poder\": no la fuerza propia, sino la del Espíritu que capacita para lo que nos supera. La misma potencia que levantó a Cristo de los muertos habita en el creyente.", "\"Amor\": el poder de Dios nunca es frío ni agresivo; se expresa en amor. Y \"dominio propio\" (una mente sobria y templada): claridad para pensar bien cuando el miedo quiere nublar el juicio. Poder sin amor sería tiranía; amor sin dominio propio sería sentimentalismo. Dios da los tres en equilibrio.", "El versículo anterior habla de \"avivar el fuego del don de Dios\". La timidez no se vence apretando los dientes, sino recordando quién nos habita. El miedo se disuelve no mirándonos a nosotros, sino al Espíritu que se nos dio."],application:["¿Dónde te está frenando el miedo hoy: hablar, servir, obedecer? Recuerda que la cobardía no viene de Dios; el poder, el amor y el dominio propio sí.", "Aviva el don: da el paso que temes, confiando en el Espíritu que ya vive en ti, no en tu propia valentía."],prayer:"Padre, gracias porque no me diste espíritu de cobardía sino de poder, amor y dominio propio. Aviva en mí tu Espíritu para vencer el miedo y servirte con valentía y amor. Amén.",tags:['fuerza','valentía','promesa'],author:'Apóstol Pablo',date:'c. 66-67 d.C.',audience:'Timoteo, hijo espiritual de Pablo',location:'Prisión en Roma (segunda encarcelación)',occasion:'Es la última carta de Pablo antes de su ejecución. Timoteo era joven, de naturaleza más tímida y con problemas de salud. Pablo le escribe desde prisión, sabiendo que morirá pronto, animándolo a no avergonzarse del evangelio ni a dejarse paralizar por el miedo.',background:'Pablo no le dice "esfuérzate más" sino que le recuerda una verdad teológica: el espíritu de cobardía no viene de Dios. El miedo que paraliza no es de origen divino. Dios da tres cosas en cambio: poder (capacidad sobrenatural), amor (motivación correcta) y dominio propio (mente equilibrada).',geo:'Escrito desde la prisión romana, posiblemente la Cárcel Mamertina. Enviado a Timoteo en Éfeso.',connections:[{ref:'Josue 1:9',text:'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo.'},{ref:'Romanos 8:15',text:'Pues no habéis recibido el espíritu de esclavitud para estar otra vez en temor, sino el espíritu de adopción.'},{ref:'1 Juan 4:18',text:'En el amor no hay temor, sino que el perfecto amor echa fuera el temor.'},{ref:'Filipenses 4:13',text:'Todo lo puedo en Cristo que me fortalece.'}],words:[{es:'cobardía',or:'δειλία (deilia)',meaning:'Miedo paralizante, cobardía. Es el miedo que incapacita y silencia. Pablo declara que este tipo de temor no tiene origen divino: Dios no lo envió.',strong:'G1167'},{es:'poder',or:'δύναμις (dynamis)',meaning:'Poder sobrenatural, capacidad divina. Es la raíz de la palabra "dinamita". No es confianza propia sino energía de Dios fluyendo a través del ser humano.',strong:'G1411'},{es:'dominio propio',or:'σωφρονισμός (sōphronismos)',meaning:'Mente sana, disciplina mental, equilibrio. No es supresión del miedo sino una mente ordenada y clara que funciona bien incluso bajo presión.',strong:'G4995'}],questions:['¿Hay áreas de tu vida donde el miedo te ha silenciado o paralizado? ¿Qué cambia saber que ese miedo no viene de Dios?','Pablo recibió poder, amor y dominio propio. ¿Cuál de los tres necesitas más en este momento?','Timoteo era naturalmente tímido pero fue llamado a liderar. ¿Cómo te anima eso si sientes que no tienes el temperamento adecuado para lo que Dios te pide?']},
        'isaias 40:31':{bigIdea:"Los que ponen su esperanza en el Señor no se agotan: Él renueva sus fuerzas para volar, correr y caminar.",exposition:["El capítulo consuela a un pueblo cansado, convencido de que Dios había olvidado su causa. Isaías responde con una de las promesas más elevadas de la Escritura: los que esperan en Jehová \"tendrán nuevas fuerzas\". La palabra \"esperar\" implica confiar y aguardar activamente, no rendirse.", "La imagen del águila es deliberada: no aletea contra el viento agotándose, sino que extiende las alas y deja que la corriente la eleve. Así es la fuerza renovada: no es esforzarse más, sino apoyarse en Otro. La energía viene de Dios, no de la propia resistencia.", "El versículo desciende en escala: \"levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán\". Volar es para los momentos altos; correr, para los urgentes; caminar, para los largos y monótonos. Dios promete fuerza para los tres, y quizá la más difícil es la del caminar diario.", "El secreto no está en la técnica sino en la fuente: quien espera en el Señor recibe una fuerza que se renueva, porque no depende de sus reservas sino de las inagotables de Dios."],application:["Si estás agotado, la respuesta bíblica no es \"esfuérzate más\", sino \"espera en el Señor\". ¿Dónde necesitas dejar de aletear y empezar a apoyarte en Él?", "Pídele fuerza no solo para los momentos altos, sino para el caminar cotidiano que a veces cansa más que las crisis."],prayer:"Señor, estoy cansado y en Ti quiero esperar. Renueva mis fuerzas como las del águila. Dame aliento para volar, correr y sobre todo para caminar fielmente cada día. Amén.",tags:['promesa','fuerza','esperanza'],author:'Profeta Isaías',date:'c. 700 a.C.',audience:'Israel agotado ante la amenaza del exilio',location:'Jerusalén',occasion:'Es el versículo final del gran capítulo de consolación. El capítulo 40 abre con "Consolaos, consolaos, pueblo mío". Después de describir la grandeza incomparable de Dios (vs. 12-26) y contrastarla con los ídolos que no pueden hacer nada, cierra con esta promesa para los que están agotados.',background:'El versículo anterior dice: "los muchachos se fatigan y se cansan, los jóvenes flaquean y caen". La fuerza humana, incluso la de los más jóvenes y vigorosos, tiene límite. La condición para el milagro no es la fuerza propia sino esperar en Dios. El águila no vuela por esfuerzo muscular sino usando corrientes de aire: así es la espera en Dios.',geo:'Jerusalén. Isaías mira hacia el futuro exilio babilónico y el agotamiento del pueblo.',connections:[{ref:'Salmos 27:14',text:'Aguarda a Jehová; esfuérzate, y aliéntese tu corazón: sí, espera a Jehová.'},{ref:'Salmos 103:5',text:'El que sacia de bien tu boca de modo que te rejuvenezcas como el águila.'},{ref:'2 Corintios 4:16',text:'Por lo cual no desmayamos; antes aunque este nuestro hombre exterior se va desgastando, el interior no obstante se renueva de día en día.'},{ref:'Mateo 11:28',text:'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.'}],words:[{es:'esperan',or:'קָוָה (qavah)',meaning:'Esperar con tensión, como una cuerda estirada hacia algo. No es espera pasiva sino expectativa activa y orientada. Es la postura del que vive mirando a Dios.',strong:'H6960'},{es:'nuevas fuerzas',or:'חֵלֶף כֹּחַ (chelef koach)',meaning:'Literalmente "cambiarán fuerza" o "intercambiarán fuerza". No es recuperar la energía propia sino recibir una fuerza diferente: la de Dios en sustitución de la humana.',strong:'H2498'},{es:'águilas',or:'נֶשֶׁר (nesher)',meaning:'El águila vuela sin aletear usando columnas de aire caliente. Es la imagen de quien no se esfuerza con sus propias fuerzas sino que se eleva sobre la corriente del Espíritu de Dios.',strong:'H5404'}],questions:['¿Hay un agotamiento en tu vida ahora mismo, físico, emocional o espiritual? ¿Qué significa para ti esperar en Jehová en esa situación?','La imagen del águila no vuela por fuerza muscular sino por corrientes de viento. ¿Cómo cambia tu forma de enfrentar los desafíos entender que la energía de Dios puede sustituir a la tuya?','¿Cuál de las tres promesas necesitas más hoy: levantar alas como águilas, correr sin cansarse, o caminar sin fatigarse?']},
        'salmos 121:1':{bigIdea:"El socorro del creyente no viene de los montes ni de sus propios recursos, sino del Dios que hizo el cielo y la tierra.",exposition:["Este es un \"cántico de las subidas\", cantado por los peregrinos que subían a Jerusalén. Al alzar los ojos hacia los montes, veían tanto el camino a la ciudad santa como los peligros del trayecto: bandidos, precipicios, santuarios paganos en las cumbres. La pregunta brota natural: \"¿de dónde vendrá mi socorro?\".", "El versículo siguiente responde sin titubear: \"Mi socorro viene de Jehová, que hizo los cielos y la tierra\". No de los montes, no de los ídolos que se adoraban en ellos, no de la fuerza propia del viajero, sino del Creador de esos mismos montes.", "La lógica es preciosa: si Dios hizo el cielo y la tierra, entonces es más grande que cualquier peligro del camino. El que fabricó las montañas puede ciertamente guardar al que camina entre ellas. Nuestro socorro no es proporcional al problema, sino al poder del que ayuda.", "El resto del salmo lo confirma: Dios no duerme, guarda tu entrada y tu salida, te cuida de día y de noche. Alzar los ojos es reconocer que la ayuda verdadera viene de arriba."],application:["Cuando busques ayuda, examina hacia dónde alzas los ojos primero: ¿a tus recursos, a otras personas, o a Dios? Él es la fuente, los demás son instrumentos.", "En un día de peligro o incertidumbre, repite: \"mi socorro viene del que hizo los cielos y la tierra\"."],prayer:"Señor, alzo mis ojos a Ti, no a los montes ni a mis fuerzas. Mi socorro viene de Ti, Creador del cielo y la tierra. Guarda mi entrada y mi salida hoy. Amén.",tags:['protección','confianza','promesa'],author:'Desconocido (salmo de los grados / ascensos)',date:'c. 700-500 a.C.',audience:'Peregrinos israelitas subiendo a Jerusalén',location:'Camino a Jerusalén',occasion:'Los "Salmos de los Grados" (Sal 120-134) eran cantados por los peregrinos durante el ascenso hacia Jerusalén para las fiestas. El viaje era peligroso: asaltantes en los montes, calor, agotamiento. Al alzar los ojos a los montes, el peregrino pregunta: ¿de dónde vendrá mi ayuda?',background:'La pregunta del versículo 1 puede tener dos lecturas: una ingenua (¿viene la ayuda de los montes donde están los santuarios paganos?) y la respuesta correcta (no de los montes sino de quien los hizo). El salmo es una declaración de confianza total: Dios no duerme, cuida de día y de noche, guarda la vida para siempre.',geo:'El camino de ascenso a Jerusalén, rodeado de colinas. Los montes evocaban tanto refugio como peligro.',connections:[{ref:'Salmos 46:1',text:'Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.'},{ref:'Isaias 41:10',text:'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo.'},{ref:'Juan 10:28',text:'Y yo les doy vida eterna; y no perecerán para siempre, ni nadie las arrebatará de mi mano.'},{ref:'1 Pedro 5:7',text:'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.'}],words:[{es:'alzaré',or:'נָשָׂא (nasa)',meaning:'Levantar, elevar. El peregrino levanta activamente los ojos: es un gesto deliberado de orientación. No mira al suelo ni hacia adentro, dirige su mirada hacia arriba.',strong:'H5375'},{es:'socorro',or:'עֵזֶר (ezer)',meaning:'Ayuda, auxilio. Es la misma palabra usada cuando Dios crea a la mujer como "ayuda idónea": no ayuda inferior sino complementaria y esencial. La ayuda de Dios es eso: esencial.',strong:'H5828'},{es:'guarda',or:'שָׁמַר (shamar)',meaning:'Guardar, custodiar, vigilar. Aparece seis veces en el salmo. Es vigilancia continua, sin pausas. El que guarda a Israel no duerme ni se adormece.',strong:'H8104'}],questions:['El peregrino alzaba los ojos en medio del peligro del camino. ¿Hacia dónde tienden a ir tus ojos cuando enfrentas dificultades: hacia el problema, hacia ti mismo, o hacia Dios?','Dios cuida "tu salida y tu entrada desde ahora y para siempre". ¿Qué salida o entrada de tu vida necesitas poner hoy bajo ese cuidado?','¿Hay algo que estás guardando o protegiendo con tu propia fuerza, que en realidad le corresponde guardar a Dios?']},
        'romanos 10:9':{bigIdea:"La salvación se recibe confesando a Jesús como Señor y creyendo de corazón que Dios lo resucitó de los muertos.",exposition:["Pablo resume cómo una persona es salva con una sencillez asombrosa. No exige rituales complejos ni méritos acumulados, sino dos movimientos: confesar con la boca y creer con el corazón. La salvación está \"cerca\", al alcance de todo el que responde con fe.", "\"Confesar que Jesús es el Señor\" es reconocer su señorío, entregarle el trono de la vida. En el mundo romano, decir \"Jesús es Señor\" en vez de \"César es señor\" podía costar la vida. Confesar no es repetir palabras, es cambiar de lealtad.", "\"Creer que Dios le levantó de los muertos\" pone la resurrección en el centro de la fe. No basta admirar a Jesús como maestro; hay que creer que venció la muerte. La resurrección es la prueba de que su sacrificio fue aceptado y de que la muerte ya no tiene la última palabra.", "Boca y corazón, confesión y fe, van juntos: una fe real se hace pública, y una confesión verdadera brota de la convicción interior. Así se recibe la vida que Cristo resucitado ofrece."],application:["¿Has hecho tú esa confesión y esa fe personal? La salvación no se hereda ni se supone: se recibe entregándole a Jesús el señorío de tu vida.", "Que \"Jesús es Señor\" no sea solo una frase: examina qué áreas de tu vida todavía no reconocen su trono."],prayer:"Señor Jesús, confieso que Tú eres el Señor y creo que Dios te levantó de los muertos. Reina en mi vida entera. Gracias porque en tu resurrección tengo vida y salvación. Amén.",tags:['salvación','fe','confesión'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Iglesia en Roma',location:'Corinto (escrito desde ahí)',occasion:'Pablo acaba de explicar que Israel buscó la justicia por obras de la ley, no por fe, y tropezó. Ahora ofrece la alternativa: la justicia por fe es accesible, está cerca, en tu boca y en tu corazón. Este versículo resume el evangelio en su forma más sencilla y directa.',background:'La confesión "Jesús es el Señor" en el Imperio Romano era una declaración política de consecuencias reales: el título Kyrios (Señor) pertenecía al César. Decir "Jesús es Kyrios" era negar que César lo era. No era una frase religiosa inofensiva, era una declaración de lealtad suprema con riesgo de muerte. Y junto a esa confesión pública, la fe interna: Dios levantó a Jesús de los muertos.',geo:'Escrito desde Corinto, enviado a Roma, capital del Imperio donde el culto al César era más intenso.',connections:[{ref:'Juan 3:16',text:'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda.'},{ref:'Hechos 2:21',text:'Y todo aquel que invocare el nombre del Señor, será salvo.'},{ref:'Efesios 2:8',text:'Porque por gracia sois salvos por medio de la fe; y esto no de vosotros, pues es don de Dios.'},{ref:'1 Juan 1:9',text:'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.'}],words:[{es:'confesares',or:'ὁμολογέω (homologeō)',meaning:'Literalmente "decir lo mismo". Confesar es declarar públicamente lo que crees internamente. No es solo recitar palabras sino hacer una declaración de lealtad ante otros.',strong:'G3670'},{es:'Señor',or:'κύριος (kyrios)',meaning:'Señor, amo, soberano. En el contexto del Imperio Romano este título se usaba para el Emperador. Declarar "Jesús es Kyrios" era la declaración de lealtad suprema más costosa que un creyente podía hacer.',strong:'G2962'},{es:'levantó',or:'ἐγείρω (egeirō)',meaning:'Despertar, levantar de entre los muertos. La resurrección de Jesús es el centro de la confesión cristiana: no solo murió por nosotros sino que resucitó, venciendo la muerte para siempre.',strong:'G1453'}],questions:['La confesión en Roma era peligrosa: significaba que el César no es tu señor supremo. En tu contexto actual, ¿qué implica realmente declarar que Jesús es el Señor de tu vida?','El versículo une boca y corazón: fe interior y confesión exterior. ¿Están alineados en tu vida, o hay algo que crees en el corazón pero no te atreves a declarar?','La resurrección de Jesús es la base de la salvación aquí. ¿Qué diferencia hace para tu fe saber que Jesús no solo murió por ti sino que venció la muerte y vive hoy?']},
        'mateo 6:33':{bigIdea:"Cuando el reino de Dios ocupa el primer lugar, lo demás encuentra su lugar; la prioridad correcta ordena toda la vida.",exposition:["Jesús acaba de hablar sobre la ansiedad por la comida, la bebida y el vestido. Los paganos, dice, corren detrás de todo eso. El discípulo tiene una brújula distinta: \"buscad primeramente el reino de Dios y su justicia\". La palabra clave es \"primeramente\": no exclusivamente, pero sí en primer lugar.", "Buscar el reino es poner el gobierno de Dios por encima de mis intereses; buscar su justicia es anhelar vivir como Él quiere. No se trata de despreciar el trabajo o la provisión, sino de reordenar las prioridades para que Dios ocupe el trono, no el segundo puesto.", "La promesa es liberadora: \"todas estas cosas os serán añadidas\". Lo que el mundo persigue con ansiedad, Dios lo añade a quienes lo buscan a Él primero. No es una fórmula de prosperidad, sino la confianza de que un Padre que sabe lo que necesitas no te abandonará mientras le sigues.", "El desorden de prioridades es la raíz de mucha ansiedad. Cuando lo secundario ocupa el primer lugar, todo se tambalea. Poner a Dios primero no le quita espacio a la vida: se lo devuelve ordenado."],application:["Revisa tus prioridades reales, no las declaradas: tu tiempo, tu dinero y tus preocupaciones muestran qué buscas \"primeramente\".", "Esta semana, toma una decisión concreta que ponga el reino de Dios antes que tu comodidad o seguridad, y observa cómo Él provee."],prayer:"Padre, quiero buscarte a Ti primero, no como un apéndice de mi vida sino como su centro. Ordena mis prioridades y libera mi corazón de la ansiedad, confiando en que Tú añades lo demás. Amén.",tags:['promesa','fe','prioridad'],author:'Mateo (recopilador)',date:'c. 50-70 d.C.',audience:'Los discípulos y las multitudes',location:'Monte de las Bienaventuranzas, Galilea',occasion:'Clímax de la sección del Sermón del Monte sobre la ansiedad material. Jesús acaba de hablar de los lirios del campo y las aves del cielo: si Dios los viste y alimenta, ¿cuánto más cuidará de sus hijos? La conclusión práctica es este versículo.',background:'Jesús invierte la lógica humana. El pensamiento natural dice: "primero asegura lo material, luego lo espiritual". Cristo dice lo opuesto: pon a Dios primero y lo material viene por añadidura. No promete riqueza, promete provisión. No elimina el trabajo, reordena las prioridades.',geo:'El Monte de las Bienaventuranzas, colinas sobre el Mar de Galilea. Jesús enseña a una multitud que incluye personas pobres y ansiosas por el sustento diario.',connections:[{ref:'Salmos 37:4',text:'Deléitate asimismo en Jehová, y él te concederá las peticiones de tu corazón.'},{ref:'Lucas 12:31',text:'Mas buscad el reino de Dios, y todas estas cosas os serán añadidas.'},{ref:'Filipenses 4:19',text:'Mi Dios, pues, suplirá todo lo que os falta conforme a sus riquezas en gloria en Cristo Jesús.'},{ref:'1 Reyes 3:13',text:'Y aun también te he dado las cosas que no pediste, riquezas y honra.'}],words:[{es:'buscad',or:'ζητέω (zēteō)',meaning:'Buscar activamente, perseguir, investigar. Es verbo de acción continua: no un acto puntual sino un estilo de vida orientado. Buscar el reino es la ocupación permanente del creyente.',strong:'G2212'},{es:'primeramente',or:'πρῶτον (prōton)',meaning:'Primero, antes que todo. No dice que lo material no importa, sino que va en segundo lugar. El orden correcto lo cambia todo: cuando Dios es primero, lo demás se acomoda.',strong:'G4412'},{es:'añadidas',or:'προστίθημι (prostithēmi)',meaning:'Añadir, agregar encima de. Las necesidades materiales son el "extra" que Dios añade a quien ya tiene lo principal: su reino y su justicia.',strong:'G4369'}],questions:['¿En qué área de tu vida inviertes más tiempo y energía: buscando el reino de Dios o asegurando lo material?','Jesús promete que lo necesario "será añadido". ¿Confías en esa promesa lo suficiente como para reordenar tus prioridades reales, no solo las declaradas?','¿Qué cambiaría concretamente en tu semana si aplicaras "buscar primeramente" a tus decisiones de tiempo y dinero?']},
        'isaias 53:5':{bigIdea:"Las heridas del Siervo no fueron por sus culpas, sino por las nuestras: por su llaga somos sanados.",exposition:["Setecientos años antes de la cruz, Isaías describe con detalle asombroso el sufrimiento del Mesías. \"Herido fue por nuestras rebeliones, molido por nuestros pecados\". La sustitución es total: Él ocupa nuestro lugar, carga lo que era nuestro, recibe el golpe que merecíamos.", "Cada verbo pesa. \"Herido\", \"molido\", \"el castigo de nuestra paz sobre él\". No sufrió por sus faltas —no las tenía— sino por las nuestras. La paz con Dios que nosotros no podíamos comprar, Él la pagó con su propio quebranto. Su dolor es nuestra reconciliación.", "\"Por su llaga fuimos nosotros curados\". La sanidad más profunda que ofrece este pasaje es la del alma: el perdón, la restauración de la relación con Dios. La herida de Cristo se convierte en la medicina del pecador.", "Pero la historia no termina en el sufrimiento. Aquel Siervo herido y molido resucitó al tercer día; por eso el mismo capítulo anuncia que \"verá linaje, vivirá por largos días\". No adoramos a una víctima vencida, sino a un Salvador vivo cuya obra fue vindicada por la resurrección."],application:["Cuando el peso de tu culpa te acuse, mira la cruz: el castigo que traía tu paz ya cayó sobre Cristo. No queda condena para ti.", "Recibe la sanidad que Él ofrece primero en el alma: perdón y paz con Dios, garantizados por su resurrección."],prayer:"Señor Jesús, fuiste herido por mis rebeliones y molido por mis pecados. Por tu llaga soy sanado y por tu resurrección tengo vida. Gracias por tomar mi lugar. Ayúdame a vivir en la paz que compraste. Amén.",tags:['salvación','sanidad','promesa'],author:'Profeta Isaías',date:'c. 700 a.C.',audience:'Israel y toda la humanidad',location:'Jerusalén',occasion:'El cuarto Cántico del Siervo. Isaías profetiza 700 años antes de Cristo con una precisión que asombró a la iglesia primitiva: describe la pasión de Jesús con detalles que solo el NT confirma después.',background:'Cada línea describe la obra completa de Cristo: "herido por nuestras rebeliones" (la crucifixión), "molido por nuestros pecados" (el sufrimiento), "castigo de nuestra paz sobre él" (la muerte sustitutiva), "por su llaga fuimos curados" (la resurrección y sus frutos). La sanidad que produce su llaga solo es posible porque resucitó: un Cristo muerto no puede sanar. El NT cita este pasaje tanto para la expiación como para la sanidad física.',geo:'Escrito en Jerusalén, posiblemente durante el reinado de Ezequías.',connections:[{ref:'1 Pedro 2:24',text:'Quien llevó él mismo nuestros pecados en su cuerpo sobre el madero, para que nosotros, estando muertos a los pecados, vivamos a la justicia; y por cuya llaga fuisteis sanados.'},{ref:'Mateo 8:17',text:'Para que se cumpliese lo dicho por el profeta Isaías, cuando dijo: El mismo tomó nuestras enfermedades, y llevó nuestras dolencias.'},{ref:'Romanos 4:25',text:'El cual fue entregado por nuestras transgresiones, y resucitado para nuestra justificación.'},{ref:'2 Corintios 5:21',text:'Al que no conoció pecado, por nosotros lo hizo pecado, para que nosotros fuésemos hechos justicia de Dios en él.'}],words:[{es:'herido',or:'מְחֹלָל (mecholal)',meaning:'Traspasado, perforado. No es un golpe superficial sino una herida penetrante. El término evoca clavos y lanza, confirmado en el NT en Juan 19:34.',strong:'H2490'},{es:'llaga',or:'חַבּוּרָה (chabburah)',meaning:'Moretón, herida abierta. Raíz que implica unirse: lo que une su sufrimiento con nuestra sanidad. La llaga de Cristo es el puente entre su muerte y nuestra restauración.',strong:'H2250'},{es:'curados',or:'רָפָא (rapha)',meaning:'Sanar, restaurar, reparar. Implica restauración completa: espiritual, emocional y física. Es el mismo verbo del nombre divino "Jehová-Rapha", el Señor tu sanador.',strong:'H7495'}],questions:['Isaías escribió esto 700 años antes. ¿Cómo afecta tu fe saber que la historia de la cruz fue planeada y anunciada con tanta precisión?','La llaga que sana: Jesús sufrió para que nosotros pudiéramos ser restaurados. ¿Hay un área de tu vida, física, emocional o espiritual, donde necesitas reclamar esa sanidad hoy?','La resurrección es lo que hace que la llaga de Cristo sane: un Cristo muerto no salva. ¿Qué diferencia hace en tu fe que Cristo no solo murió sino que resucitó y vive?']},
        '1 pedro 5:7':{bigIdea:"Puedes echar toda tu ansiedad sobre Dios porque, sencillamente, Él tiene cuidado de ti.",exposition:["Pedro escribe a cristianos que sufren persecución y presión. En medio de eso les da una orden práctica: \"echando toda vuestra ansiedad sobre él\". El verbo \"echar\" es enérgico, como quien lanza una carga pesada de sus hombros a otro que puede llevarla.", "\"Toda\" no admite excepciones: no las grandes preocupaciones solamente, ni las pequeñas solamente, sino todas. Nada es demasiado grande para el poder de Dios ni demasiado pequeño para su cuidado. La ansiedad que retenemos nos aplasta; la que entregamos nos libera.", "La razón es tan sencilla que casi la pasamos por alto: \"porque él tiene cuidado de vosotros\". No echamos nuestra ansiedad sobre un Dios indiferente, sino sobre un Padre atento. Su cuidado no es teórico: es personal, dirigido a ti.", "El versículo anterior habla de humillarse bajo la poderosa mano de Dios. Confiar la ansiedad a Dios es un acto de humildad: reconocer que no puedo cargar con todo y que no tengo que hacerlo, porque Él sí puede."],application:["Nombra la ansiedad que llevas hoy y, en oración, entrégala deliberadamente a Dios. Echar es un acto de la voluntad, no solo un sentimiento.", "Cuando la preocupación regrese (y regresará), vuelve a echarla. Confiar es un hábito que se repite, no un evento único."],prayer:"Padre, echo sobre Ti toda mi ansiedad, porque sé que tienes cuidado de mí. No puedo cargar con todo y no tengo que hacerlo. Recíbeme y dame tu paz en lugar de mi afán. Amén.",tags:['consuelo','confianza','paz'],author:'Apóstol Pedro',date:'c. 62-64 d.C.',audience:'Iglesias dispersas en Asia Menor bajo persecución',location:'Roma ("Babilonia", 1 Pe 5:13)',occasion:'Pedro escribe a creyentes que enfrentan sufrimiento y persecución. El contexto inmediato llama a humillarse bajo la mano poderosa de Dios y a resistir al diablo. En ese marco de tensión, viene esta invitación radical a echar la ansiedad sobre Dios.',background:'El verbo "echar" es fuerte: no es "depositar suavemente" sino "lanzar con fuerza". Como quien lanza un bulto pesado. Pedro había visto a Jesús caminar sobre el agua y hundirse cuando quitó los ojos de Él: conocía de primera mano lo que pasa cuando la ansiedad supera la confianza. La razón que da es íntima: "porque él tiene cuidado de vosotros".',geo:'Escrito desde Roma (llamada "Babilonia" en código), enviado a las iglesias dispersas en el Ponto, Galacia, Capadocia, Asia y Bitinia.',connections:[{ref:'Salmos 55:22',text:'Echa sobre Jehová tu carga, y él te sustentará; no dejará para siempre caído al justo.'},{ref:'Mateo 11:28',text:'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.'},{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración.'},{ref:'Salmos 34:18',text:'Cercano está Jehová a los quebrantados de corazón; y salvará a los contritos de espíritu.'}],words:[{es:'echando',or:'ἐπιρίπτω (epirriptō)',meaning:'Lanzar sobre, arrojar encima. Es un verbo de acción decisiva y única. No se dice "vayan echando poco a poco" sino un lanzamiento deliberado. Es un acto de fe activo, no pasivo.',strong:'G1977'},{es:'ansiedad',or:'μέριμνα (merimna)',meaning:'Preocupación que divide y dispersa la mente. La raíz implica ser partido en dos. La ansiedad fragmenta el alma; Dios la recoge y la unifica en su cuidado.',strong:'G3308'},{es:'cuidado',or:'μέλει (melei)',meaning:'Le importa, le interesa profundamente. No es cuidado distante sino interés personal y activo. Dios no solo puede ayudar: le importas. Esa es la motivación para echar la ansiedad.',strong:'G3199'}],questions:['¿Hay una carga específica que llevas solo y que Dios te está invitando a lanzarle? ¿Qué te impide hacerlo?','Pedro da la razón para echar la ansiedad: "él tiene cuidado de ti". ¿Realmente crees eso para tu situación específica de hoy?','La ansiedad fragmenta la mente. ¿En qué área de tu vida sientes esa fragmentación? ¿Qué pasaría si realmente la lanzaras sobre Dios?']},
        'salmos 34:18':{bigIdea:"Dios no se aleja del corazón roto: precisamente allí, en el quebranto, es donde más cerca está.",exposition:["David escribe este salmo tras una etapa de miedo y huida. Por eso su consuelo no es teórico: \"cercano está Jehová a los quebrantados de corazón\". En un mundo que suele evitar a los que sufren, Dios hace lo contrario: se acerca. El quebranto no lo repele, lo atrae.", "\"Quebrantados de corazón\" y \"contritos de espíritu\" describen a los que están deshechos, sin fuerzas para fingir. No es una condición que Dios desprecie; es un lugar donde Él elige habitar. La cercanía de Dios no depende de nuestra fortaleza, sino que se manifiesta en nuestra fragilidad.", "\"Salva a los contritos de espíritu\": el mismo versículo une cercanía con salvación. Dios no solo se acerca para acompañar, sino para rescatar. El fondo del pozo no es el fin para el creyente; es donde la mano de Dios llega.", "Este salmo desmiente la mentira de que el sufrimiento es señal de abandono divino. A menudo es exactamente lo contrario: en el corazón roto, Dios está más presente que nunca."],application:["Si tu corazón está roto hoy, no interpretes ese dolor como distancia de Dios. Según su Palabra, es donde más cerca está.", "No tienes que recomponerte para acercarte a Él. Ven tal como estás: es a los quebrantados a quienes promete cercanía."],prayer:"Señor, mi corazón está herido, y tu Palabra dice que precisamente ahí estás cerca. Acércate a mí, sálvame y sostenme. Gracias porque no desprecias mi quebranto, sino que lo habitas. Amén.",tags:['consuelo','promesa','sanidad'],author:'Rey David',date:'c. 1000 a.C.',audience:'Congregación de Israel',location:'Gat (contexto histórico de la huida)',occasion:'David huyó del rey Saúl y se refugió con el filisteo Abimelec (o Aquis). Al verse en peligro, fingió locura para escapar con vida. Desde esa experiencia de profunda humillación, escribe este salmo de gratitud y enseñanza.',background:'El versículo 18 es una de las declaraciones más contraintuitivas de los Salmos: Dios no se acerca a los poderosos sino a los quebrantados. La autosuficiencia es una barrera; el corazón roto es una puerta abierta. David lo sabía por experiencia: en su momento de mayor debilidad (fingiendo locura), Dios lo libró.',geo:'Compuesto en el contexto de la huida de David, probablemente en el campamento de Adulam donde se reunieron hombres angustiados y endeudados.',connections:[{ref:'Salmos 51:17',text:'Los sacrificios de Dios son el espíritu quebrantado; al corazón contrito y humillado no despreciarás tú, oh Dios.'},{ref:'Isaias 57:15',text:'Porque así dijo el Alto y Sublime, el que habita la eternidad, y cuyo nombre es el Santo: Yo habito en la altura y la santidad, y también con el quebrantado y humilde de espíritu.'},{ref:'Mateo 5:3',text:'Bienaventurados los pobres en espíritu, porque de ellos es el reino de los cielos.'},{ref:'Santiago 4:6',text:'Dios resiste a los soberbios, y da gracia a los humildes.'}],words:[{es:'cercano',or:'קָרוֹב (qarov)',meaning:'Próximo, adyacente, al lado. No dice que Dios "eventualmente llegará" sino que "está cerca" ahora, en el momento del quebranto. Es presencia inmediata, no promesa futura.',strong:'H7138'},{es:'quebrantados',or:'שָׁבַר (shavar)',meaning:'Roto, partido. La imagen es de un hueso fracturado o una vasija hecha pedazos. El corazón quebrantado no es el que se siente triste: es el que ya no confía en sus propias fuerzas.',strong:'H7665'},{es:'contritos',or:'דַּכָּא (dakka)',meaning:'Aplastado, pulverizado. Imagen aún más fuerte que quebrantado. El contrito de espíritu es quien ha llegado al límite absoluto de sus recursos y lo sabe.',strong:'H1793'}],questions:['¿Hay un quebranto en tu vida que has intentado ocultar o superar solo? ¿Cómo cambia este versículo tu forma de ver ese dolor?','Dios se acerca a los quebrantados, no a los fuertes. ¿Hay algo en tu vida donde tu aparente fortaleza podría estar alejándote de la cercanía de Dios?','David escribió esto después de fingir locura para sobrevivir, su peor momento. ¿Puedes pensar en un momento de quebranto tuyo donde ahora reconoces que Dios estaba cerca?']},
        'juan 11:25':{bigIdea:"Jesús no solo da resurrección y vida: Él mismo, en persona, es la resurrección y la vida.",exposition:["Marta acaba de perder a su hermano Lázaro y cree en una resurrección futura, \"en el día postrero\". Jesús lleva su fe de una doctrina lejana a una Persona presente: \"Yo soy la resurrección y la vida\". No promete un evento distante; se ofrece a sí mismo como la respuesta a la muerte.", "La afirmación es audaz. No dice \"yo traigo\" ni \"yo enseño\" sobre la resurrección, sino \"yo soy\". La vida eterna no es una cosa que Jesús reparte desde afuera; es algo que Él es, y que comparte con quien está unido a Él.", "\"El que cree en mí, aunque esté muerto, vivirá\". Para el creyente, la muerte física deja de ser el final y se vuelve un paso. La tumba no es un punto, es una coma. Jesús redefine la muerte a la luz de su propio poder sobre ella.", "Días después, Jesús respaldaría estas palabras con su propia resurrección, venciendo la muerte no en teoría sino en hechos. Por eso su promesa tiene autoridad: habla el que salió vivo del sepulcro."],application:["Frente a la pérdida y al miedo a la muerte, la esperanza cristiana no es una idea, es una Persona viva. ¿Está tu fe puesta en Él?", "Vive hoy con la libertad de quien sabe que la muerte no tiene la última palabra: Cristo, la resurrección y la vida, la tuvo primero."],prayer:"Jesús, Tú eres la resurrección y la vida. Creo en Ti, el que venció la muerte. Quita mi miedo al final y lléname de la esperanza de que, unido a Ti, viviré para siempre. Amén.",tags:['fe','resurrección','promesa'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Los discípulos y Marta',location:'Betania, a dos kilómetros de Jerusalén',occasion:'Lázaro ha muerto y lleva cuatro días en la tumba. Marta sale al encuentro de Jesús y le dice que si hubiera llegado antes, su hermano no habría muerto. Jesús le responde con una de las declaraciones más profundas de todo el evangelio de Juan.',background:'Marta tenía una fe correcta pero incompleta: creía en la resurrección final, "en el último día". Jesús la corrige con una revelación mayor: la resurrección no es solo un evento escatológico lejano, es una persona presente. Él mismo es la resurrección. Minutos después, resucitará a Lázaro como señal anticipatoria de su propia resurrección.',geo:'Betania, a las afueras de Jerusalén. Jesús llega sabiendo que irá a Jerusalén donde será ejecutado, pero primero demuestra que tiene poder sobre la muerte antes de someterse a ella voluntariamente.',connections:[{ref:'Juan 5:24',text:'El que oye mi palabra, y cree al que me envió, tiene vida eterna; y no vendrá a condenación, mas ha pasado de muerte a vida.'},{ref:'1 Corintios 15:22',text:'Porque así como en Adán todos mueren, también en Cristo todos serán vivificados.'},{ref:'Apocalipsis 1:18',text:'Y el que vivo, y estuve muerto; mas he aquí que vivo por los siglos de los siglos.'},{ref:'Romanos 6:5',text:'Porque si fuimos plantados juntamente con él en la semejanza de su muerte, así también lo seremos en la de su resurrección.'}],words:[{es:'resurrección',or:'ἀνάστασις (anastasis)',meaning:'Levantarse, ponerse de pie desde abajo. No es "vida después de la muerte" vaga, sino levantarse con cuerpo, con identidad, con historia. Cristo resucitó así y promete lo mismo para los que creen en Él.',strong:'G386'},{es:'vida',or:'ζωή (zōē)',meaning:'Vida divina, plena, eterna. No la existencia biológica (bios) sino la vida de la misma calidad que Dios tiene. Quien cree en Jesús ya posee esta vida: no comienza después de morir, comienza ahora.',strong:'G2222'},{es:'vivirá',or:'ζάω (zaō)',meaning:'Vivir, tener vida activa. El que cree en Cristo, aunque muera físicamente, vivirá porque tiene en él la vida que no puede ser destruida por la muerte.',strong:'G2198'}],questions:['Marta esperaba la resurrección "en el último día". Jesús dice que Él mismo es la resurrección ahora. ¿Cómo cambia eso tu forma de entender tu fe: algo futuro o alguien presente?','Jesús dijo esto antes de resucitar a Lázaro y antes de su propia resurrección. ¿Cómo afecta tu fe saber que lo que prometió, primero lo cumplió en sí mismo?','¿Hay un área de tu vida que sientes "muerta"? ¿Qué significa traer a Jesús, que es la resurrección, a ese lugar?']},
        'galatas 2:20':{bigIdea:"La vida cristiana no es yo esforzándome por Dios, sino Cristo viviendo en mí por la fe.",exposition:["Pablo describe el corazón de la vida cristiana con una paradoja: \"con Cristo estoy juntamente crucificado, y ya no vivo yo\". El viejo yo, el que intentaba justificarse por sus obras, murió con Cristo en la cruz. La vida cristiana empieza con una muerte: la del ego que quiere ser su propio salvador.", "\"Mas vive Cristo en mí\". Aquí está la resurrección hecha experiencia diaria: el Cristo que resucitó ahora vive dentro del creyente por su Espíritu. No se trata de imitar a un héroe ausente, sino de ser habitado por un Señor vivo. Lo que no puedo hacer por mí mismo, Él lo hace en mí.", "\"Lo que ahora vivo en la carne, lo vivo en la fe del Hijo de Dios\". La fe es el canal por el que esa vida fluye. No vivo mirando mis recursos, sino confiando momento a momento en Aquel que me ama.", "Y la motivación lo corona: \"el cual me amó y se entregó a sí mismo por mí\". Todo nace del amor personal de Cristo. No es un principio abstracto: es \"por mí\". La cruz y la vida resucitada tienen tu nombre escrito."],application:["¿Vives la fe como un esfuerzo tuyo por agradar a Dios, o como Cristo viviendo en ti? El cambio de perspectiva lo transforma todo.", "Cuando falles, recuerda: no descansas en tu desempeño, sino en el Cristo vivo que te ama y habita en ti."],prayer:"Señor, mi viejo yo fue crucificado contigo; ahora vive Cristo en mí. Enséñame a vivir por fe en el Hijo de Dios que me amó y se entregó por mí. Que seas Tú quien viva a través de mi vida. Amén.",tags:['fe','identidad','transformación'],author:'Apóstol Pablo',date:'c. 48-49 d.C.',audience:'Iglesias de Galacia',location:'Antioquía (posiblemente)',occasion:'Pablo defiende el evangelio contra los judaizantes que exigían la circuncisión. Su argumento climático: él mismo fue liberado de la ley por haber muerto con Cristo. Ya no vive la vida religiosa por esfuerzo propio sino que Cristo vive en él.',background:'Este es uno de los versículos más profundos sobre la identidad cristiana. No dice "sigo vivo pero ahora me esfuerzo más" sino "ya no vivo yo". La conversión no es mejora del yo antiguo sino muerte y sustitución. El resultado es una vida nueva cuya fuente ya no es el esfuerzo humano sino la fe en quien amó y se entregó por nosotros.',geo:'La carta circuló por las iglesias de la región de Galacia (actual Turquía central), fundadas por Pablo en su primer viaje misionero.',connections:[{ref:'Romanos 6:6',text:'Sabiendo esto, que nuestro viejo hombre fue crucificado juntamente con él, para que el cuerpo del pecado sea destruido.'},{ref:'Colosenses 3:3',text:'Porque habéis muerto, y vuestra vida está escondida con Cristo en Dios.'},{ref:'2 Corintios 5:17',text:'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.'},{ref:'Juan 15:5',text:'Yo soy la vid, vosotros los pámpanos; el que permanece en mí, y yo en él, éste lleva mucho fruto.'}],words:[{es:'crucificado',or:'συσταυρόω (systauroō)',meaning:'Crucificado conjuntamente, al mismo tiempo. El prefijo syn- indica unión. La crucifixión de Cristo no fue solo un evento histórico: el creyente participó en ella espiritualmente. Es la base de la nueva identidad.',strong:'G4957'},{es:'vive Cristo en mí',or:'ζῇ δὲ ἐν ἐμοὶ Χριστός',meaning:'Cristo vive, mora, habita en el interior. No es metáfora sino realidad espiritual: el Espíritu de Cristo toma residencia en el creyente. La vida cristiana es Cristo viviendo su vida a través de ti.',strong:'G2198'},{es:'fe',or:'πίστις (pistis)',meaning:'Confianza activa, abandono personal. Pablo no vive por principios sino por una relación de fe con una persona: "el Hijo de Dios que me amó". La fe es personal, no abstracta.',strong:'G4102'}],questions:['Si "ya no vivo yo, mas vive Cristo en mí", ¿qué partes de tu vida todavía operan desde el "yo viejo" en lugar de desde Cristo?','Pablo dice que lo que ahora vive, lo vive "en la fe del Hijo de Dios que me amó". ¿Qué diferencia hace para tu vida diaria saber que es Cristo quien vive en ti?','¿Cuándo fue la última vez que tomaste una decisión específicamente porque "Cristo vive en mí" en lugar de porque "yo quiero" o "yo debo"?']},
        'apocalipsis 3:20':{bigIdea:"Cristo se para a la puerta y llama: la comunión con Él comienza cuando alguien decide abrir.",exposition:["Estas palabras se dirigen a una iglesia tibia, la de Laodicea, que había dejado a Cristo fuera de su propia vida. La imagen es conmovedora: el Señor de la iglesia parado afuera, tocando a su propia puerta. No la derriba; llama. El amor de Cristo respeta; invita, no fuerza.", "\"Si alguno oye mi voz y abre la puerta\": la iniciativa es de Cristo —Él llama primero—, pero la respuesta es nuestra. La puerta tiene la manija por dentro. Dios no entra por la fuerza en un corazón; espera a ser recibido.", "\"Entraré a él, y cenaré con él, y él conmigo\". En el mundo antiguo, compartir la cena era símbolo de intimidad y amistad. Cristo no ofrece solo perdón, sino comunión: una relación cercana, cotidiana, de mesa compartida.", "Aunque dicho a una iglesia, el llamado resuena a cada persona. Cristo sigue tocando a la puerta de corazones que lo han dejado afuera, esperando pacientemente ser invitado a entrar."],application:["¿Hay áreas de tu vida donde has dejado a Cristo tocando afuera? Él espera, pero espera a que abras.", "La comunión con Cristo no es un evento único; es una cena diaria. Ábrele la puerta hoy, en lo cotidiano."],prayer:"Señor Jesús, has estado llamando y a veces te he dejado fuera. Hoy abro la puerta. Entra, cena conmigo y comparte mi vida entera. Quiero comunión contigo, no solo religión sobre Ti. Amén.",tags:['invitación','amor','intimidad'],author:'Juan el apóstol',date:'c. 90-95 d.C.',audience:'La iglesia de Laodicea',location:'Isla de Patmos (visión)',occasion:'Es la última de las siete cartas a las iglesias. Laodicea era una ciudad rica y autosuficiente: famosa por sus bancos, su manufactura de lana y su escuela de medicina. La iglesia reflejaba la ciudad: se creía rica espiritualmente pero era "tibia, desgraciada, miserable, pobre, ciega y desnuda".',background:'La paradoja más asombrosa del libro: Jesús llamando a la puerta de su propia iglesia. Él es el dueño de la casa, pero está afuera. No entra por la fuerza ni derriba la puerta: llama y espera. La decisión de abrir es humana. La "cena" que promete es la imagen de intimidad más plena que existe: compartir la mesa, la conversación, la vida.',geo:'La carta está dirigida a Laodicea (actual Turquía), ciudad en el cruce de rutas comerciales. Jesús recibe la visión en la isla de Patmos, donde Juan estaba exiliado.',connections:[{ref:'Juan 14:23',text:'El que me ama, mi palabra guardará; y mi Padre le amará, y vendremos a él, y haremos morada con él.'},{ref:'Cantares 5:2',text:'Yo dormía, pero mi corazón velaba. Voz de mi amado que llama: Ábreme, hermana mía.'},{ref:'Lucas 12:37',text:'Bienaventurados aquellos siervos a los cuales su señor, cuando venga, halle velando.'},{ref:'Juan 10:3',text:'A este abre el portero, y las ovejas oyen su voz; y a sus ovejas llama por nombre, y las saca.'}],words:[{es:'estoy',or:'ἕστηκα (hestēka)',meaning:'He permanecido de pie, estoy parado. No es que Jesús "pasa por ahí". Está parado delante de la puerta, esperando. Es una postura de determinación y paciencia: lleva tiempo llamando.',strong:'G2476'},{es:'llamo',or:'κρούω (krouō)',meaning:'Golpear, llamar. Es un golpe deliberado y repetido, no un toque suave. Jesús no insinúa su presencia: llama activamente, con insistencia, esperando respuesta.',strong:'G2925'},{es:'cenaré',or:'δειπνέω (deipneō)',meaning:'Cenar, compartir la comida principal del día. La cena en el mundo antiguo era el momento de mayor intimidad y comunión. No es una visita rápida: es quedarse, compartir, estar.',strong:'G1172'}],questions:['Jesús está fuera de la puerta de una iglesia que se cree autosuficiente. ¿Hay áreas de tu vida espiritual donde la autosuficiencia podría haber dejado a Jesús afuera?','El llamado es personal: "si alguno oye mi voz". ¿Escuchas la voz de Jesús llamando a alguna puerta específica en tu vida ahora mismo?','La promesa es intimidad total: cenar juntos. ¿Qué cambiaría en tu vida si pasaras de una religión de reglas a una relación de cena con Jesús?']},
        'salmos 119:105':{bigIdea:"La Palabra de Dios no ilumina todo el horizonte de golpe, sino el paso siguiente: lámpara y lumbrera para caminar.",exposition:["El salmo 119 es un extenso canto de amor a la Palabra de Dios. En este versículo, la Escritura se compara con dos luces: \"lámpara es a mis pies tu palabra, y lumbrera a mi camino\". Dos imágenes, dos alcances: la lámpara alumbra el paso inmediato; la lumbrera, el trayecto más amplio.", "En tiempos sin electricidad, una lámpara de aceite alumbraba justo lo suficiente para no tropezar: el siguiente paso. Así opera muchas veces la guía de Dios. No suele iluminar todo el futuro de una vez; alumbra lo suficiente para avanzar con fe, un paso a la vez.", "Que la Palabra sea \"a mis pies\" enseña dónde poner la mirada: no en la especulación sobre lo lejano, sino en obedecer lo que ya está iluminado hoy. La luz se da para caminar, no solo para admirar.", "Y la fuente de esa luz es la Palabra misma. En un mundo lleno de voces y consejos, la Escritura es la lámpara confiable que no engaña, porque procede de Aquel que conoce el camino de principio a fin."],application:["Si Dios no te muestra todo el futuro, no es abandono: es su método. Obedece la luz que ya tienes y el siguiente tramo se iluminará.", "Haz de la Palabra tu lámpara diaria. La dirección de Dios se recibe leyendo y obedeciendo lo que ya reveló, no esperando señales espectaculares."],prayer:"Señor, que tu Palabra sea lámpara a mis pies y lumbrera a mi camino. Cuando no vea todo el trayecto, dame fe para dar el paso que ya iluminaste. Guíame con tu verdad. Amén.",tags:['instrucción','fe','sabiduría'],author:'Desconocido',date:'Período post-exílico, posiblemente c. 500-400 a.C.',audience:'Pueblo de Israel',location:'Desconocida',occasion:'El salmo más largo de la Biblia: 176 versículos, cada grupo de ocho comenzando con una letra del alfabeto hebreo. Es una meditación completa sobre la Palabra de Dios. El versículo 105 es el versículo más famoso del salmo y uno de los más memorizados de toda la Biblia.',background:'La lámpara en el mundo antiguo era pequeña, de aceite, que iluminaba solo unos pocos pasos adelante. No daba visibilidad de todo el camino hasta el destino. El autor celebra exactamente eso: la Palabra de Dios no da un mapa completo del futuro sino luz suficiente para el paso siguiente. Es una descripción de cómo Dios guía: paso a paso, no todo de una vez.',geo:'El contexto es genérico y universal: cualquier camino en la oscuridad, cualquier vida que necesita dirección.',connections:[{ref:'Proverbios 6:23',text:'Porque el mandamiento es lámpara, y la enseñanza es luz; y camino de vida las reprensiones que te instruyen.'},{ref:'2 Pedro 1:19',text:'Tenemos también la palabra profética más segura, a la cual hacéis bien en estar atentos como a una antorcha que alumbra en lugar oscuro.'},{ref:'Juan 8:12',text:'Otra vez Jesús les habló, diciendo: Yo soy la luz del mundo; el que me sigue, no andará en tinieblas.'},{ref:'Salmos 19:8',text:'Los mandamientos de Jehová son rectos, que alegran el corazón; el precepto de Jehová es puro, que alumbra los ojos.'}],words:[{es:'lámpara',or:'נֵר (ner)',meaning:'Lámpara pequeña de aceite. Iluminaba solo el espacio inmediato, no el horizonte. Dios no da mapas completos: da luz suficiente para el paso siguiente. Eso requiere caminar de fe.',strong:'H5216'},{es:'pies',or:'רֶגֶל (regel)',meaning:'Pie, paso. La guía es para los pies, no solo para la mente. No es información teórica sino dirección práctica para cada paso concreto de la vida.',strong:'H7272'},{es:'lumbrera',or:'אוֹר (or)',meaning:'Luz, claridad. Es la primera palabra de la creación: "Sea la luz". La misma creatividad que dio luz al cosmos la aplica Dios a guiar el camino de quien sigue su Palabra.',strong:'H216'}],questions:['La lámpara iluminaba solo unos pasos adelante. ¿Hay decisiones en tu vida donde quieres ver todo el camino antes de dar el primer paso? ¿Cómo te habla este versículo?','¿Cuándo fue la última vez que la Escritura te iluminó un paso concreto, no solo una verdad abstracta?','Lámpara para los pies y lumbrera para el camino: ¿cómo es tu hábito real con la Biblia? ¿La usas como guía práctica o solo como conocimiento?']},
        'filipenses 4:6':{bigIdea:"El antídoto contra el afán no es esforzarse por no preocuparse, sino convertir cada preocupación en oración agradecida.",exposition:["\"Por nada estéis afanosos\" suena imposible hasta que Pablo dice cómo. No manda simplemente \"dejen de preocuparse\", lo cual sería inútil; ofrece un reemplazo: \"sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias\". El afán se vence sustituyéndolo por oración.", "\"Por nada\" y \"en todo\" son totales: ninguna preocupación queda fuera, toda situación entra en oración. Nada es demasiado pequeño para orar por ello ni demasiado grande para entregarlo. La oración es el canal por el que la carga pasa de mis hombros a los de Dios.", "El detalle clave es \"con acción de gracias\". No se ora solo pidiendo, sino agradeciendo. La gratitud recuerda lo que Dios ya ha hecho y desarma el pánico, porque quien agradece confía en que el mismo Dios que ayudó antes ayudará ahora.", "El versículo siguiente promete el resultado: \"la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones\". No promete que cambien las circunstancias, sino que llegue una paz que las circunstancias no pueden explicar."],application:["Cada vez que sientas afán hoy, conviértelo en una oración concreta. La preocupación no orada crece; la orada se rinde a Dios.", "Añade siempre gratitud a tus peticiones: nombra algo por lo que agradecer antes de pedir, y verás cómo cambia tu corazón."],prayer:"Padre, en vez de afanarme, traigo a Ti mis peticiones con acción de gracias. Recibe mis cargas y dame tu paz que sobrepasa todo entendimiento. Confío en que Tú cuidas de cada detalle. Amén.",tags:['paz','oración','confianza'],author:'Apóstol Pablo',date:'c. 61 d.C.',audience:'Iglesia en Filipos',location:'Prisión en Roma',occasion:'Pablo escribe desde la cárcel, sin saber si saldrá vivo, y enseña sobre la ansiedad. La carta a los Filipenses es la más gozosa del NT, paradójicamente escrita desde prisión. Este versículo es la receta práctica contra la ansiedad.',background:'Pablo no dice "no te preocupes porque todo está bien" sino que hay algo que hacer con la ansiedad: llevarla a Dios en oración específica y con acción de gracias. La gratitud no es fingir que todo es perfecto sino reconocer la presencia de Dios en medio de la imperfección.',geo:'Escrito desde Roma, enviado a Filipos (actual norte de Grecia).',connections:[{ref:'1 Pedro 5:7',text:'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.'},{ref:'Mateo 11:28',text:'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.'},{ref:'Salmos 55:22',text:'Echa sobre Jehová tu carga, y él te sustentará; no dejará para siempre caído al justo.'},{ref:'Filipenses 4:7',text:'Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.'}],words:[{es:'afanosos',or:'μεριμνάω (merimnaō)',meaning:'Estar ansioso, dividido en la mente. La raíz implica ser partido en dos. La ansiedad fragmenta el alma; la oración la unifica porque lleva todo a un único punto: la presencia de Dios.',strong:'G3309'},{es:'oración',or:'προσευχή (proseuchē)',meaning:'Oración dirigida a Dios, comunicación general con Él. Describe la postura global de hablar con Dios.',strong:'G4335'},{es:'ruego',or:'δέησις (deēsis)',meaning:'Petición específica nacida de una necesidad concreta. Complementa a la oración: no solo hablar con Dios sino pedirle algo concreto y urgente.',strong:'G1162'}],questions:['Pablo estaba en prisión cuando escribió esto. ¿Cómo cambia eso que este versículo trate sobre la ansiedad?','¿Qué diferencia hay entre suprimir la ansiedad y llevarla a Dios con acción de gracias?','¿Hay una preocupación específica que llevas solo y que podrías convertir hoy en una oración concreta?']},
        'filipenses 4:7':{bigIdea:"La paz de Dios no se explica ni se fabrica: es un guardián que custodia el corazón cuando lo entregamos a Él en oración.",exposition:["Este versículo es la promesa que sigue al mandato de orar en lugar de afanarse. \"Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús\". Es el fruto de convertir la ansiedad en oración agradecida.", "\"La paz de Dios\" no es la paz que el mundo da —ausencia de problemas—, sino una paz que proviene de Dios mismo. Puede coexistir con la tormenta. No depende de que todo se resuelva, sino de Quién sostiene el barco.", "\"Sobrepasa todo entendimiento\": es una paz que no se puede explicar con la lógica de las circunstancias. Cuando todo indica que deberíamos estar deshechos y sin embargo hay calma, esa paz inexplicable delata su origen divino.", "El verbo \"guardará\" es militar: como una guarnición que custodia una ciudad. La paz de Dios monta guardia alrededor del corazón y de la mente, protegiéndolos de la invasión del miedo. No solo consuela: defiende."],application:["Cuando sientas paz en medio de algo que humanamente debería aplastarte, no la descartes: es la guarnición de Dios protegiéndote.", "Busca esta paz por el camino que Dios señala: oración con gratitud (v.6). La paz del versículo 7 es la respuesta a la obediencia del versículo 6."],prayer:"Señor, dame tu paz que sobrepasa todo entendimiento. Que monte guardia sobre mi corazón y mis pensamientos en Cristo Jesús, aun cuando las circunstancias digan lo contrario. Confío en Ti. Amén.",tags:['paz','promesa','consuelo'],author:'Apóstol Pablo',date:'c. 61 d.C.',audience:'Iglesia en Filipos',location:'Prisión en Roma',occasion:'Versículo inmediatamente después de la invitación a orar (4:6). Es la consecuencia prometida: si llevas tus cargas a Dios con gratitud, la paz de Dios actuará como guardián sobre tu corazón y tu mente.',background:'La "paz que sobrepasa todo entendimiento" no puede ser producida por la razón humana. Es una paz que no requiere que las circunstancias sean buenas para existir. Pablo la experimenta en prisión: no hay razón lógica para tener paz, pero la tiene. Es sobrenatural por definición.',geo:'Escrito desde Roma, enviado a Filipos.',connections:[{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.'},{ref:'Juan 14:27',text:'La paz os dejo, mi paz os doy; yo no os la doy como el mundo la da. No se turbe vuestro corazón.'},{ref:'Isaias 26:3',text:'Tú guardarás en completa paz a aquel cuyo pensamiento en ti persevera, porque en ti ha confiado.'},{ref:'Colosenses 3:15',text:'Y la paz de Dios gobierne en vuestros corazones, a la que asimismo fuisteis llamados en un solo cuerpo.'}],words:[{es:'sobrepasa',or:'ὑπερέχω (hyperechō)',meaning:'Exceder, estar por encima. La paz de Dios no solo es mejor que la paz humana: está en una categoría completamente diferente. No puede ser producida, solo recibida.',strong:'G5242'},{es:'guardará',or:'φρουρέω (phroureo)',meaning:'Guardar como centinela militar. La paz de Dios no es un sentimiento pasivo: es un guardián activo que protege el corazón contra la invasión de la ansiedad.',strong:'G5432'},{es:'pensamientos',or:'νόημα (noēma)',meaning:'Pensamiento, razonamiento. La paz guarda no solo las emociones sino también los procesos mentales que generan miedo.',strong:'G3540'}],questions:['La paz de Dios sobrepasa todo entendimiento: no necesita razones lógicas para existir. ¿Has experimentado ese tipo de paz en medio de una situación sin solución aparente?','Pablo describe la paz como "guardián" de corazón y mente. ¿Qué pensamientos específicos necesitas que esa paz proteja?','¿Cuál es la condición para recibir esta paz según el versículo anterior (4:6)? ¿La estás cumpliendo?']},
        'juan 14:27':{bigIdea:"La paz que Jesús deja no es como la del mundo: no depende de las circunstancias, sino de su presencia.",exposition:["Jesús habla estas palabras la noche antes de la cruz, cuando los discípulos estaban a punto de enfrentar su mayor crisis. En ese momento les hereda algo: \"La paz os dejo, mi paz os doy\". No una paz cualquiera, sino la suya propia, la misma serenidad con que Él enfrentaría la cruz.", "\"No como el mundo la da, yo os la doy\". La paz del mundo depende de que las condiciones sean favorables: salud, dinero, ausencia de conflicto. Es frágil, se rompe cuando cambian las circunstancias. La paz de Cristo es distinta: brota de una relación, no de una situación.", "\"No se turbe vuestro corazón, ni tenga miedo\". La paz de Jesús no es pasiva; confronta el miedo y la turbación. Nos da algo con qué resistir la ansiedad: su presencia y su promesa, más fuertes que cualquier motivo de temor.", "Esta paz sería posible porque Jesús, tras la cruz, resucitaría y enviaría su Espíritu (del que habla en el mismo capítulo). No es una paz huérfana: viene acompañada de su presencia permanente en el creyente."],application:["¿Buscas paz cambiando tus circunstancias o recibiendo la de Cristo? La primera es frágil; la segunda permanece aun en la tormenta.", "Cuando tu corazón se turbe, escucha la orden amorosa de Jesús: \"no tenga miedo\". No estás solo; su paz es tu herencia."],prayer:"Jesús, recibo tu paz, no la que el mundo da, sino la tuya. Que mi corazón no se turbe ni tenga miedo, porque Tú estás conmigo. Guarda mi alma en tu calma inexplicable. Amén.",tags:['paz','promesa','consuelo'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Los discípulos en la Última Cena',location:'Aposento alto, Jerusalén',occasion:'Jesús habla a sus discípulos la noche antes de su crucifixión. Ellos están angustiados porque anuncia que se va. En ese momento de máxima tensión, Jesús les entrega su despedida más preciosa: su paz.',background:'El contraste es crucial: "no como el mundo la da". La paz del mundo es condicional: buenas noticias, seguridad económica, ausencia de conflicto. La paz de Jesús es de otra naturaleza: existe mientras Él habita en ti, independientemente de las circunstancias. La ofrece la noche antes de morir y resucitar: prueba máxima de que esta paz no depende de cómo salgan las cosas.',geo:'Aposento alto en Jerusalén, pocas horas antes del arresto de Jesús en Getsemaní y su posterior crucifixión y resurrección.',connections:[{ref:'Filipenses 4:7',text:'Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.'},{ref:'Isaias 26:3',text:'Tú guardarás en completa paz a aquel cuyo pensamiento en ti persevera, porque en ti ha confiado.'},{ref:'Juan 16:33',text:'En el mundo tendréis aflicción; pero confiad, yo he vencido al mundo.'},{ref:'Romanos 5:1',text:'Justificados pues por la fe, tenemos paz para con Dios por medio de nuestro Señor Jesucristo.'}],words:[{es:'paz',or:'εἰρήνη (eirēnē)',meaning:'Paz, armonía. Equivale al shalom hebreo: bienestar total, no solo ausencia de conflicto sino presencia de todo bien. Jesús deja su propio shalom como herencia a sus seguidores.',strong:'G1515'},{es:'os dejo',or:'ἀφίημι (aphiēmi)',meaning:'Dejar, donar, testar. Jesús usa un término de herencia: está legando algo que le pertenece. Su paz es su testamento personal antes de morir y resucitar.',strong:'G863'},{es:'turbe',or:'ταράσσω (tarassō)',meaning:'Agitar, perturbar, revolver. La imagen es de agua agitada. Jesús prohíbe ese estado: "no se turbe". No pide indiferencia sino estabilidad anclada en Él.',strong:'G5015'}],questions:['Jesús ofreció su paz la noche antes de morir y resucitar. ¿Qué dice eso sobre el tipo de paz que ofrece?','¿Qué diferencia hay entre la paz que el mundo da (circunstancias favorables) y la que Jesús da?','¿Hay una situación actual donde necesitas recibir esta paz que no depende de cómo salgan las cosas?']},
        '2 corintios 1:3':{bigIdea:"Dios es el Padre de misericordias que nos consuela, no para que guardemos el consuelo, sino para que lo pasemos a otros.",exposition:["Pablo comienza esta carta, escrita desde el dolor y la presión, alabando a Dios con dos títulos preciosos: \"Padre de misericordias y Dios de toda consolación\". No es un Dios distante ante el sufrimiento humano; es fuente inagotable de compasión y consuelo.", "\"Padre de misericordias\": la misericordia no es un acto ocasional de Dios, es parte de su identidad, es su paternidad. Y \"Dios de toda consolación\": no de alguna, sino de toda. No hay clase de dolor para la que Dios no tenga consuelo disponible.", "El versículo siguiente revela el propósito del consuelo: \"para que podamos también nosotros consolar a los que están en cualquier angustia, por medio de la consolación con que nosotros somos consolados de Dios\". El consuelo no termina en nosotros; nos convierte en canales.", "Así, hasta nuestro sufrimiento adquiere sentido: lo que Dios nos consuela en el valle, lo usamos para acompañar a otros en el suyo. Nadie consuela mejor a un quebrantado que quien fue consolado en el mismo quebranto."],application:["El consuelo que Dios te ha dado en una prueba no es solo para ti. ¿A quién podrías acompañar hoy con lo que Dios te enseñó en tu dolor?", "Cuando sufras, recibe activamente la consolación de Dios: Él es Padre de misericordias, no un espectador distante."],prayer:"Padre de misericordias, gracias por consolarme en toda angustia. Lléname de tu consuelo y hazme canal de él para otros. Que mi dolor sirva para acompañar a los que sufren. Amén.",tags:['consuelo','amor','promesa'],author:'Apóstol Pablo',date:'c. 56 d.C.',audience:'Iglesia de Corinto y toda Acaya',location:'Macedonia',occasion:'Pablo abre esta carta con una doxología. Acababa de pasar por sufrimientos en Asia donde "perdió la esperanza de vida". Desde esa experiencia de dolor extremo, celebra al Dios que lo consoló y propone la paradoja: el dolor recibido se convierte en fuente de consuelo para otros.',background:'La palabra "consolación" aparece 10 veces en los primeros 11 versículos. Pablo no escribe sobre el consuelo desde una vida fácil sino desde el sufrimiento real. La tesis central: el consuelo que Dios da en la aflicción nos capacita para consolar a otros que enfrentan lo mismo.',geo:'Escrito desde Macedonia (norte de Grecia), durante el tercer viaje misionero de Pablo.',connections:[{ref:'Salmos 34:18',text:'Cercano está Jehová a los quebrantados de corazón; y salvará a los contritos de espíritu.'},{ref:'Isaias 51:12',text:'Yo, yo soy el que os consuelo. ¿Quién eres tú para que tengas temor del hombre mortal?'},{ref:'Juan 14:16',text:'Y yo rogaré al Padre, y os dará otro Consolador, para que esté con vosotros para siempre.'},{ref:'Mateo 5:4',text:'Bienaventurados los que lloran, porque ellos recibirán consolación.'}],words:[{es:'consolación',or:'παράκλησις (paraklēsis)',meaning:'Consolación, aliento. La raíz significa "llamar al lado de". Dios no consuela desde lejos: se coloca junto a ti en el dolor. La misma raíz nombra al Espíritu Santo: Paracleto, el que se pone al lado.',strong:'G3874'},{es:'misericordias',or:'οἰκτιρμός (oiktirmos)',meaning:'Compasión profunda, entrañas de misericordia. Implica un movimiento emocional desde adentro. Dios no solo actúa misericordiosamente: siente compasión real.',strong:'G3628'},{es:'tribulación',or:'θλῖψις (thlipsis)',meaning:'Presión, angustia. La raíz significa apretar. La tribulación aplasta. Pablo no la niega sino que muestra a Dios presente en medio de ella.',strong:'G2347'}],questions:['Pablo celebra el consuelo de Dios después de casi morir. ¿Hay un dolor que Dios ha consolado en ti y que podría convertirse en fuente de consuelo para otros?','La consolación que recibes tiene propósito: capacitarte para consolar a otros. ¿Hay alguien que necesita el consuelo que tú has experimentado?','¿Hay una aflicción que todavía no has llevado al "Dios de toda consolación"? ¿Qué te impide hacerlo?']},
        'santiago 1:5':{bigIdea:"A quien le falta sabiduría no se le reprocha: se le invita a pedirla a un Dios que da con generosidad.",exposition:["Santiago escribe a creyentes en medio de pruebas, donde más se necesita saber cómo responder. Y ofrece una salida sencilla: \"si alguno de vosotros tiene falta de sabiduría, pídala a Dios\". Reconocer que no sabemos no es debilidad vergonzosa; es el primer paso hacia la sabiduría.", "Dios da \"a todos abundantemente y sin reproche\". Dos rasgos hermosos: da con generosidad (abundantemente) y sin echar en cara nuestra ignorancia (sin reproche). No suspira cuando volvemos a preguntar; da con gozo, como un padre que ama enseñar a su hijo.", "La sabiduría bíblica no es acumular información, sino saber vivir bien a los ojos de Dios: discernir, decidir y actuar conforme a su voluntad. Es lo que más falta hace en las decisiones difíciles y las pruebas confusas.", "El versículo siguiente pone la condición: pedir \"con fe, no dudando nada\". No una fe perfecta, pero sí una confianza genuina de que el Dios generoso responderá. Pedir sabiduría es un acto de humildad y de fe a la vez."],application:["Antes de tu próxima decisión difícil, detente y pídele sabiduría a Dios. Él no te reprochará por no saber; te dará con generosidad.", "Cultiva el hábito de admitir lo que no sabes. La sabiduría empieza donde termina la autosuficiencia."],prayer:"Señor, me falta sabiduría y a Ti la pido. Gracias porque das con generosidad y sin reproche. Dame discernimiento para vivir conforme a tu voluntad en las decisiones que enfrento. Amén.",tags:['sabiduría','promesa','fe'],author:'Santiago (hermano de Jesús)',date:'c. 44-49 d.C.',audience:'Las doce tribus dispersas (judeocristianos)',location:'Jerusalén',occasion:'Santiago escribe la carta más práctica del NT. El contexto habla de pruebas que producen paciencia y madurez. Ante las decisiones difíciles que traen las pruebas, la instrucción es simple: pide sabiduría.',background:'La promesa es extraordinaria: Dios da "a todos" (no solo a los sabios), "abundantemente" (no a cuentagotas), "sin reproche" (sin hacerte sentir mal por pedir). No hay condición de mérito. La única condición es pedir con fe.',geo:'Escrito desde Jerusalén, probablemente la primera carta del NT, para judeocristianos dispersos por la persecución.',connections:[{ref:'Proverbios 2:6',text:'Porque Jehová da la sabiduría, y de su boca viene el conocimiento y la inteligencia.'},{ref:'1 Reyes 3:9',text:'Da pues a tu siervo corazón entendido para juzgar a tu pueblo, y para discernir entre lo bueno y lo malo.'},{ref:'Mateo 7:7',text:'Pedid, y se os dará; buscad, y hallaréis; llamad, y se os abrirá.'},{ref:'Proverbios 3:5',text:'Fíate de Jehová con todo tu corazón, y no te apoyes en tu propia prudencia.'}],words:[{es:'sabiduría',or:'σοφία (sophia)',meaning:'Sabiduría práctica y espiritual. No solo conocimiento sino habilidad para aplicarlo correctamente en situaciones reales. Capacidad de discernir qué hacer cuando las respuestas no son obvias.',strong:'G4678'},{es:'abundantemente',or:'ἁπλῶς (haplōs)',meaning:'Generosamente, sin reservas. Dios no da sabiduría a cuentagotas ni con condiciones complicadas: da con generosidad directa y sin regateo.',strong:'G574'},{es:'sin reproche',or:'μὴ ὀνειδίζοντος (mē oneidizōntos)',meaning:'Sin reprender ni echar en cara. Dios no te hace sentir tonto por no saber, ni te critica por pedir. Su sabiduría viene sin juicio adjunto.',strong:'G3679'}],questions:['¿Hay una decisión difícil ante la que no sabes qué hacer? ¿Has pedido sabiduría a Dios con confianza de que Él da generosamente y sin reproches?','Santiago dice que Dios da "a todos". ¿Crees que eso te incluye a ti en tu área de mayor incertidumbre?','¿Cuándo fue la última vez que tomaste una decisión importante y la primera acción fue pedirle sabiduría a Dios?']},
        'romanos 15:13':{bigIdea:"El Dios de esperanza llena de gozo y paz a los que creen, para que abunden en esperanza por el poder del Espíritu.",exposition:["Pablo cierra una sección con una bendición desbordante. Llama a Dios \"el Dios de esperanza\": no solo el que da esperanza, sino su misma fuente y dueño. En un mundo que fabrica esperanzas frágiles, Dios es la esperanza que no defrauda.", "\"Os llene de todo gozo y paz en el creer\". Fíjate en el canal: \"en el creer\". El gozo y la paz no llegan por circunstancias favorables, sino por confiar en Dios. La fe es el conducto por el que fluyen. Donde crece la confianza, crecen el gozo y la paz.", "El objetivo es \"que abundéis en esperanza\". No una esperanza escasa que apenas alcanza, sino abundante, que rebosa. La vida cristiana no está diseñada para sobrevivir a duras penas, sino para desbordar de expectativa confiada en Dios.", "Y todo esto \"por el poder del Espíritu Santo\". Esta esperanza no se genera por optimismo humano ni por fuerza de voluntad; es obra del Espíritu en nosotros. Es sobrenatural, y por eso puede resistir lo que la esperanza terrenal no resiste."],application:["Si tu esperanza anda baja, revisa tu confianza: el gozo y la paz llegan \"en el creer\". ¿Dónde necesitas volver a confiar en el Dios de esperanza?", "Pide al Espíritu Santo lo que no puedes fabricar: una esperanza que no dependa de tus circunstancias, sino de su poder."],prayer:"Dios de esperanza, lléname de todo gozo y paz en el creer, para que abunde en esperanza por el poder de tu Espíritu. Que mi confianza en Ti desborde aun cuando todo alrededor invite a desanimarme. Amén.",tags:['esperanza','promesa','paz'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Iglesia en Roma',location:'Corinto',occasion:'Final de una sección sobre la unidad entre judíos y gentiles. Pablo cierra con esta bendición que resume lo que Dios hace en el creyente: llenarlo de gozo y paz para que la esperanza abunde.',background:'La esperanza bíblica no es optimismo ni pensamiento positivo. Es certeza anclada en el carácter de Dios y en la resurrección de Cristo. No depende de las circunstancias sino del Espíritu Santo que la produce en el interior.',geo:'Escrito desde Corinto, enviado a Roma.',connections:[{ref:'Jeremias 29:11',text:'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz y no de mal.'},{ref:'Romanos 8:24',text:'Porque en esperanza fuimos salvos; mas la esperanza que se ve no es esperanza.'},{ref:'Hebreos 6:19',text:'La cual tenemos como segura y firme ancla del alma, y que penetra hasta dentro del velo.'},{ref:'1 Pedro 1:3',text:'Bendito el Dios y Padre de nuestro Señor Jesucristo, que nos hizo renacer para una esperanza viva, por la resurrección de Jesucristo.'}],words:[{es:'esperanza',or:'ἐλπίς (elpis)',meaning:'Esperanza, expectativa segura. No es un deseo vago sino una expectativa fundada en la fidelidad de Dios. La esperanza cristiana tiene un objeto concreto y un fundamento: Cristo resucitado.',strong:'G1680'},{es:'abundéis',or:'περισσεύω (perisseuō)',meaning:'Abundar, rebosar. Pablo no pide esperanza suficiente sino que desborde. La imagen es un recipiente que se llena hasta derramarse.',strong:'G4052'},{es:'poder',or:'δύναμις (dynamis)',meaning:'Poder sobrenatural. La esperanza que abunda no es producto del esfuerzo humano sino del poder activo del Espíritu Santo operando en el interior.',strong:'G1411'}],questions:['¿Qué diferencia hay entre el optimismo que el mundo ofrece y la esperanza que el Espíritu Santo produce?','¿Tu nivel de esperanza hoy es escaso, suficiente o abundante? ¿Qué lo determina?','¿Hay una situación sin salida aparente donde necesitas que el Dios de esperanza te llene de gozo y paz?']},
        '2 corintios 12:9':{bigIdea:"La gracia de Dios es suficiente, y su poder se perfecciona precisamente allí donde reconocemos nuestra debilidad.",exposition:["Pablo había rogado tres veces que Dios le quitara un \"aguijón en la carne\", un sufrimiento persistente. La respuesta divina no fue quitar el problema, sino dar algo mejor: \"Bástate mi gracia; porque mi poder se perfecciona en la debilidad\". Dios no siempre remueve la carga; siempre da gracia suficiente para llevarla.", "\"Bástate mi gracia\": la gracia de Dios es suficiente. No siempre suficiente para eliminar la prueba, pero siempre suficiente para sostenernos en ella. Es un suministro que se renueva a la medida exacta de la necesidad.", "\"Mi poder se perfecciona en la debilidad\" invierte la lógica humana. Creemos que el poder de Dios se luce cuando somos fuertes; Pablo descubre lo contrario: cuando reconozco mi debilidad, dejo espacio para que se manifieste la fuerza de Dios. La vasija rota deja ver mejor el tesoro.", "Por eso Pablo concluye: \"de buena gana me gloriaré en mis debilidades, para que habite en mí el poder de Cristo\". La debilidad deja de ser vergüenza y se vuelve escenario del poder divino."],application:["¿Le has rogado a Dios que quite algo que sigue ahí? Quizá no lo quite todavía, pero su gracia es suficiente para sostenerte hoy.", "Deja de esconder tu debilidad como fracaso. Ofrécela a Dios como el lugar donde su poder puede lucirse."],prayer:"Señor, cuando ruego que quites mi aguijón y no lo haces, ayúdame a creer que tu gracia me basta. Que tu poder se perfeccione en mi debilidad y que Cristo habite en mí. Amén.",tags:['gracia','fuerza','promesa'],author:'Apóstol Pablo',date:'c. 56 d.C.',audience:'Iglesia de Corinto',location:'Macedonia',occasion:'Pablo describe su "aguijón en la carne", algo doloroso que le fue dado para que no se enorgulleciera. Tres veces oró para que se quitara. La respuesta de Dios no fue "sí" sino esta declaración sobre cómo funciona la gracia en la debilidad.',background:'La paradoja cristiana más profunda: Dios no siempre quita el dolor, pero en el dolor perfecciona su poder. No es que el poder de Dios tenga deficiencias que se corrigen, sino que se manifiesta completamente cuando la debilidad humana deja espacio. El ego lleno no necesita a Dios; el ego vaciado es el recipiente perfecto.',geo:'Escrito desde Macedonia, enviado a Corinto.',connections:[{ref:'Filipenses 4:13',text:'Todo lo puedo en Cristo que me fortalece.'},{ref:'Isaias 40:29',text:'Da esfuerzo al cansado, y multiplica las fuerzas al que no tiene ningunas.'},{ref:'2 Timoteo 1:7',text:'Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio.'},{ref:'1 Corintios 1:27',text:'Mas lo necio del mundo escogió Dios, para avergonzar a los sabios; y lo débil del mundo escogió Dios, para avergonzar a lo fuerte.'}],words:[{es:'bástate',or:'ἀρκέω (arkeō)',meaning:'Ser suficiente, bastar completamente. Dios no dice "te daré más" sino "lo que tengo ya es suficiente para ti". La gracia no es insuficiente para ninguna situación humana.',strong:'G714'},{es:'perfecciona',or:'τελέω (teleō)',meaning:'Completar, llevar a plenitud. El poder de Dios no se activa a medias en la debilidad: se manifiesta completo y sin restricciones.',strong:'G5055'},{es:'debilidad',or:'ἀσθένεια (astheneia)',meaning:'Debilidad, carencia de fuerza. No es derrota sino la condición que crea espacio para el poder de Dios. Pablo aprende a celebrarla porque es la puerta del poder divino.',strong:'G769'}],questions:['Dios le dijo "no" a Pablo tres veces. ¿Hay algo que has pedido repetidamente sin obtener respuesta? ¿Cómo cambia esta perspectiva ese silencio?','Pablo terminó gloriándose en sus debilidades. ¿Hay debilidades tuyas que podrían ser el lugar donde el poder de Dios se manifiesta más claramente?','¿En qué área sientes que no eres suficiente? ¿Qué significa para esa área que la gracia de Dios sí lo es?']},
        'salmos 130:4':{bigIdea:"En Dios hay perdón, no para que lo tomemos a la ligera, sino para que lo temamos y amemos con reverencia.",exposition:["Este salmo brota \"de lo profundo\", del fondo de un alma abrumada por la culpa. En medio de esa angustia surge una de las verdades más liberadoras: \"pero en ti hay perdón\". No dice que en Dios haya solo justicia o juicio; hay perdón. La esperanza del pecador no es que Dios ignore el pecado, sino que lo perdona.", "El versículo anterior lo plantea con crudeza: \"si mirares a los pecados, ¿quién podrá mantenerse?\". Nadie. Si Dios llevara solo cuentas, todos estaríamos perdidos. Pero no es así: en Él hay perdón, y por eso hay pie firme para el que se acerca.", "Sorprende el propósito: \"para que seas temido\". Podríamos pensar que el perdón produciría descuido, pero produce reverencia. Un Dios que perdona a semejante costo despierta un temor de amor, no de terror. Quien es muy perdonado, mucho ama.", "Este perdón anticipa la cruz, donde Dios haría posible perdonar sin dejar de ser justo. El salmista espera; nosotros miramos atrás y vemos cumplida la esperanza en Cristo."],application:["Si la culpa te tiene \"en lo profundo\", escucha la verdad del salmo: en Dios hay perdón. No te acercas a un juez implacable, sino a un Padre que perdona.", "Deja que el perdón produzca en ti no descuido, sino reverencia y amor: mientras más entiendes lo que te fue perdonado, más honras a Dios."],prayer:"Señor, desde lo profundo clamo a Ti. Gracias porque en Ti hay perdón y no llevas solo cuentas de mis pecados. Que tu misericordia produzca en mí reverencia y un amor agradecido. Amén.",tags:['perdón','gracia','esperanza'],author:'Desconocido',date:'c. 600-400 a.C.',audience:'Israel',location:'Contexto litúrgico, peregrinación a Jerusalén',occasion:'Uno de los Salmos de los Grados cantados en el ascenso a Jerusalén. El salmo abre "De lo profundo, Jehová, a ti clamo", describe el peso aplastante de la culpa, y luego declara la realidad del perdón divino.',background:'El versículo 4 es el giro central: la respuesta al clamor desde lo profundo es el perdón. Hay un matiz importante: "para que seas reverenciado". El perdón no produce liviandad moral sino asombro. Quien realmente ha sido perdonado queda maravillado, no engreído.',geo:'El camino de peregrinación hacia Jerusalén. "De lo profundo" evoca el abismo de la culpa o una crisis extrema.',connections:[{ref:'Salmos 86:5',text:'Porque tú, Señor, eres bueno y perdonador, y grande en misericordia para con todos los que te invocan.'},{ref:'1 Juan 1:9',text:'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados, y limpiarnos de toda maldad.'},{ref:'Isaias 43:25',text:'Yo, yo soy el que borro tus rebeliones por amor de mí mismo, y no me acordaré de tus pecados.'},{ref:'Miqueas 7:18',text:'¿Qué Dios como tú, que perdona la maldad, y olvida el pecado del remanente de su heredad?'}],words:[{es:'perdón',or:'סְלִיחָה (selichah)',meaning:'Perdón, disposición perdonadora. Es la única vez que esta palabra aparece en los Salmos. Describe no solo el acto de perdonar sino la naturaleza misma de Dios: Él es perdonador por esencia.',strong:'H5547'},{es:'reverenciado',or:'יָרֵא (yare)',meaning:'Ser temido con reverencia, ser adorado con asombro. El resultado del perdón no es familiaridad descuidada sino asombro profundo. El perdonado queda maravillado, no engreído.',strong:'H3372'}],questions:['¿Hay un pecado o fracaso del que no te has perdonado a ti mismo, aunque crees que Dios perdona?','El versículo dice que el perdón produce reverencia. ¿Cómo has respondido al perdón de Dios: con más liviandad o con más asombro?','¿Hay algo en lo más profundo de tu corazón que no has llevado al Dios que perdona?']},
        '1 tesalonicenses 5:18':{bigIdea:"La gratitud no depende de que todo salga bien, sino de la voluntad de Dios: dar gracias en todo, no por todo.",exposition:["Pablo cierra una serie de instrucciones breves con una exigente: \"dad gracias en todo\". No dice dar gracias por todo, como si el mal fuera bueno, sino en todo, en medio de cualquier circunstancia. Siempre hay motivo de gratitud, aunque no todo lo que vivimos sea bueno.", "\"Porque esta es la voluntad de Dios para con vosotros en Cristo Jesús\". Muchos buscan desesperadamente \"la voluntad de Dios\" para grandes decisiones; aquí está, clara y a la mano: una vida agradecida. Dios quiere hijos que confían y agradecen, no que solo se quejan.", "La gratitud en todo es un acto de fe. Agradecer cuando las cosas van bien es fácil; hacerlo en la dificultad declara que confío en que Dios sigue obrando aunque no lo entienda. La acción de gracias desarma la amargura y la ansiedad.", "Esta gratitud es posible \"en Cristo Jesús\": no nace de negar la realidad, sino de una relación con Aquel que da razones eternas para agradecer aun cuando las temporales escasean."],application:["Hoy, en medio de lo que no te gusta, encuentra tres cosas por las que dar gracias. La gratitud es un músculo que se ejercita.", "Cuando busques \"la voluntad de Dios\", recuerda que ya te la reveló en parte: vivir agradecido. Empieza obedeciendo eso."],prayer:"Padre, enséñame a dar gracias en todo, no solo cuando todo va bien. Sé que esta es tu voluntad en Cristo. Cambia mi queja por gratitud y mi ansiedad por confianza. Amén.",tags:['gratitud','instrucción','voluntad'],author:'Apóstol Pablo',date:'c. 50-51 d.C.',audience:'Iglesia en Tesalónica',location:'Corinto',occasion:'Final de la carta, sección de instrucciones prácticas. "Gozaos siempre. Orad sin cesar. Dad gracias en todo." Tres comandos breves que resumen una postura de vida, no tareas separadas.',background:'La frase "en todo" exige interpretación: no "por todo" (como si agradeciéramos el mal) sino "en todo", en medio de cualquier circunstancia. Y añade la razón: "porque esta es la voluntad de Dios". Dar gracias en todo responde directamente a la pregunta "¿cuál es la voluntad de Dios para mi vida?"',geo:'Escrito desde Corinto, enviado a Tesalónica (actual norte de Grecia).',connections:[{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.'},{ref:'Efesios 5:20',text:'Dando siempre gracias por todo al Dios y Padre, en el nombre de nuestro Señor Jesucristo.'},{ref:'Colosenses 3:17',text:'Y todo lo que hacéis, sea de palabra o de hecho, hacedlo todo en el nombre del Señor Jesús, dando gracias a Dios Padre por medio de él.'},{ref:'Salmos 100:4',text:'Entrad por sus puertas con acción de gracias, por sus atrios con alabanza; alabadle, bendecid su nombre.'}],words:[{es:'gracias',or:'εὐχαριστέω (eucharisteō)',meaning:'Dar gracias, estar agradecido. La raíz es "eu" (bien) y "charis" (gracia). Dar gracias es reconocer activamente la gracia de Dios en lugar de darla por supuesta.',strong:'G2168'},{es:'en todo',or:'ἐν παντί (en panti)',meaning:'En toda circunstancia. No "por todo" (fingir que el mal es bueno) sino gratitud dentro de la situación, sea cual sea.',strong:'G3956'},{es:'voluntad',or:'θέλημα (thelēma)',meaning:'Voluntad, plan intencional. Pablo revela algo concreto de la voluntad de Dios: que des gracias en toda circunstancia. Es una de las declaraciones más directas de lo que Dios quiere.',strong:'G2307'}],questions:['"En todo", no "por todo". ¿Cuál es la diferencia práctica en una situación de dolor o injusticia?','Pablo dice que dar gracias en todo "es la voluntad de Dios". ¿Cómo cambia esto que busques su voluntad si esta ya es parte de ella?','¿Hay una circunstancia difícil actual donde todavía no has encontrado razón para dar gracias? ¿Qué pasaría si empezaras a buscarla?']},
        'nehemias 8:10':{bigIdea:"El gozo del Señor no es una emoción pasajera, sino la fuerza que sostiene al pueblo de Dios.",exposition:["El pueblo acababa de escuchar la lectura de la Ley tras años de olvido, y lloraba al ver cuánto se había alejado. Nehemías no minimiza el arrepentimiento, pero les da una perspectiva mayor: \"no os entristezcáis, porque el gozo de Jehová es vuestra fuerza\". Había un tiempo para llorar, pero también para celebrar la gracia de Dios.", "\"El gozo de Jehová\": no se refiere principalmente a nuestra alegría por Dios, sino al gozo que proviene de Él, e incluso al gozo que Dios mismo tiene por su pueblo restaurado. Esa alegría, arraigada en Dios y no en las circunstancias, es distinta de la felicidad frágil del mundo.", "\"Es vuestra fuerza\". El gozo no es un lujo emocional; es una fuente de fortaleza. Un pueblo que se goza en Dios tiene resistencia para reconstruir muros, enfrentar oposición y perseverar. La tristeza paraliza; el gozo del Señor impulsa.", "Nehemías incluso les manda celebrar y compartir con los que no tenían: el gozo verdadero se desborda en generosidad. La alegría en Dios no se guarda, se reparte."],application:["Cuando te sientas débil, pregúntate dónde está tu gozo. El gozo puesto en Dios es fuerza; puesto en las circunstancias, es frágil.", "El arrepentimiento tiene su lugar, pero no te quedes en la tristeza: la gracia de Dios es motivo de celebración que te da fuerzas para seguir."],prayer:"Señor, que tu gozo sea mi fuerza. Cuando la tristeza o la debilidad me abrumen, recuérdame la alegría de ser tuyo y restaurado por tu gracia. Que ese gozo me impulse a seguir. Amén.",tags:['fuerza','gozo','promesa'],author:'Nehemías o Esdras',date:'c. 445 a.C.',audience:'Pueblo de Israel recién regresado del exilio',location:'Jerusalén, junto a la puerta del Agua',occasion:'El pueblo acaba de escuchar la lectura pública de la Ley por primera vez en generaciones. Al comprender las palabras, lloran de remordimiento. Nehemías y los levitas los interrumpen: este día es sagrado, es día de celebrar, no de llorar. La tristeza no es la respuesta correcta a la Palabra de Dios recién recibida.',background:'La frase "el gozo de Jehová es vuestra fortaleza" es la inversión de la lógica natural: esperaríamos que la fortaleza produzca gozo, pero aquí el gozo produce fortaleza. El gozo de Jehová no es estado de ánimo sino fuente de energía espiritual que Dios mismo suministra.',geo:'Ante la puerta del Agua en Jerusalén, durante la reconstrucción de los muros bajo el liderazgo de Nehemías.',connections:[{ref:'Salmos 16:11',text:'En tu presencia hay plenitud de gozo; delicias a tu diestra para siempre.'},{ref:'Isaias 12:3',text:'Sacaréis con gozo aguas de las fuentes de la salvación.'},{ref:'Habacuc 3:18',text:'Con todo, yo me alegraré en Jehová, y me gozaré en el Dios de mi salvación.'},{ref:'Juan 15:11',text:'Esto os he hablado, para que mi gozo esté en vosotros, y vuestro gozo sea cumplido.'}],words:[{es:'gozo',or:'חֶדְוָה (chedvah)',meaning:'Alegría festiva, gozo intenso. Palabra rara en el AT, indica una alegría expresiva y celebratoria. No es contentamiento suave sino energía gozosa activa.',strong:'H2304'},{es:'fortaleza',or:'מָעוֹז (maoz)',meaning:'Refugio, bastión, lugar fuerte. El gozo de Jehová no solo alegra: es una fortaleza espiritual que protege y da resistencia en el tiempo de prueba.',strong:'H4581'}],questions:['El pueblo lloraba de culpa y se les dijo que el gozo de Jehová era su fortaleza. ¿Cómo conviven el arrepentimiento genuino y el gozo en la fe cristiana?','¿Dónde sueles buscar la fortaleza para los días difíciles: en ti mismo, en las circunstancias o en el gozo de Jehová?','¿Hay algo que te roba el gozo espiritual sistemáticamente? ¿Qué cambiaría si lo enfrentaras desde la fortaleza del gozo de Dios?']},
        'romanos 12:2':{bigIdea:"No somos moldeados por el mundo, sino transformados desde adentro por la renovación de la mente.",exposition:["Tras once capítulos sobre la gracia de Dios, Pablo llega a la respuesta práctica: cómo vivir. Y empieza por la mente. \"No os conforméis a este siglo\": no dejes que el molde del mundo te dé forma. El mundo presiona constantemente para que pensemos, deseemos y vivamos como todos.", "El contraste es \"transformaos por medio de la renovación de vuestro entendimiento\". La palabra griega para transformar es \"metamorfoo\", la misma raíz de metamorfosis: un cambio profundo, desde adentro, como el de la oruga en mariposa. No es un retoque exterior, es una transformación interior.", "El campo de batalla es la mente. Si el mundo nos conforma llenándonos la cabeza de sus valores, Dios nos transforma renovando cómo pensamos, a través de su Palabra y su Espíritu. Cambia la mente y cambiará la vida.", "El propósito es discernir \"cuál sea la buena voluntad de Dios, agradable y perfecta\". Una mente renovada no solo se comporta distinto: ve distinto, reconoce y desea lo que Dios quiere. La transformación produce discernimiento."],application:["¿Qué está moldeando más tu mente: el flujo constante del mundo o la Palabra de Dios? Renovar el entendimiento requiere elegir con qué lo llenas.", "La transformación empieza en cómo piensas. Identifica una mentira del mundo que has creído y reemplázala con una verdad de Dios."],prayer:"Señor, no quiero que el mundo me moldee. Transforma mi vida renovando mi mente con tu verdad. Dame discernimiento para reconocer y desear tu voluntad buena, agradable y perfecta. Amén.",tags:['transformación','instrucción','voluntad'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Iglesia en Roma',location:'Corinto',occasion:'Capítulo 12 marca el giro práctico de la carta. Los primeros 11 capítulos son teología; los capítulos 12-16 son aplicación. Este versículo es la bisagra: cómo se traduce la gracia de Dios en una vida transformada.',background:'La transformación del creyente no es comportamiento externo sino renovación de la mente. El "mundo" que no deben imitar es el sistema de valores culturales que opera sin referencia a Dios. La alternativa no es ser extraño sino tener la mente renovada por el Espíritu para discernir la voluntad de Dios.',geo:'Escrito desde Corinto, enviado a Roma.',connections:[{ref:'Efesios 4:23',text:'Y renovaos en el espíritu de vuestra mente.'},{ref:'Colosenses 3:10',text:'Y revestido del nuevo, el cual conforme a la imagen del que lo creó se va renovando hasta el conocimiento pleno.'},{ref:'Filipenses 4:8',text:'En esto pensad: todo lo que es verdadero, todo lo honesto, todo lo justo, todo lo puro, todo lo amable.'},{ref:'1 Juan 2:15',text:'No améis al mundo, ni las cosas que están en el mundo.'}],words:[{es:'conforméis',or:'συσχηματίζω (syschēmatizō)',meaning:'Moldearse según un patrón externo. El mundo presiona constantemente para darte su forma. Es un proceso activo y continuo, no un evento único.',strong:'G4964'},{es:'transformaos',or:'μεταμορφόω (metamorphoō)',meaning:'Ser transformado desde adentro. Es la raíz de metamorfosis. A diferencia del conformarse (exterior), la transformación viene del núcleo hacia afuera. Solo el Espíritu puede producirla.',strong:'G3339'},{es:'renovación',or:'ἀνακαίνωσις (anakainōsis)',meaning:'Renovación radical, hacerse completamente nuevo. No es reparar lo viejo sino una novedad esencial. La mente renovada por el Espíritu opera en una categoría diferente.',strong:'G342'}],questions:['¿En qué áreas has notado que el mundo ha moldeado tus pensamientos o valores sin que te hayas dado cuenta?','La transformación viene por renovación de la mente. ¿Qué estás poniendo en tu mente regularmente? ¿Qué produce en ti?','Conocer la voluntad de Dios requiere mente renovada. ¿Estás invirtiendo en esa renovación como prioridad?']},
        '1 juan 4:8':{bigIdea:"Dios no solo ama: Dios es amor, y por eso conocerlo transforma necesariamente cómo amamos.",exposition:["Juan hace una afirmación que llega al fondo de la identidad de Dios: \"Dios es amor\". No dice solo que Dios ama, o que tiene amor, sino que el amor es su misma esencia. Todo lo que Dios hace brota de esa naturaleza. Su justicia, su santidad y su poder están teñidos de amor.", "Por eso Juan concluye: \"el que no ama, no ha conocido a Dios\". La prueba de conocer a Dios no es principalmente cuánto sabemos de teología, sino cuánto amamos. Es imposible conocer íntimamente a un Dios que es amor y permanecer sin amor.", "Este amor no es sentimentalismo. El contexto lo define por la cruz: \"en esto se mostró el amor de Dios... en que envió a su Hijo\". El amor divino es sacrificial, se entrega, busca el bien del otro a costa propia. Y ese Hijo entregado resucitó, garantizando que su amor vence hasta la muerte.", "Conocer a este Dios nos cambia: recibir su amor nos capacita para amar. No amamos para ganarnos a Dios; amamos porque hemos sido amados por Él primero."],application:["Mide tu conocimiento de Dios no por lo que sabes, sino por cómo amas. ¿Se parece tu amor al de Aquel que se entregó por ti?", "Recibe primero el amor de Dios; de esa fuente brota el amor a los demás. No puedes dar lo que no has recibido."],prayer:"Padre, Tú eres amor. Ayúdame a conocerte de verdad, y que ese conocimiento se note en cómo amo. Lléname de tu amor sacrificial para poder amar a otros como Tú me amas. Amén.",tags:['amor','fe','fundamento'],author:'Juan el apóstol',date:'c. 85-95 d.C.',audience:'Iglesias de Asia Menor',location:'Éfeso',occasion:'Juan escribe para combatir el gnosticismo temprano, que separaba lo espiritual de lo material y negaba la encarnación real de Cristo. En ese contexto define la naturaleza de Dios con una de las afirmaciones más densas de toda la Escritura: Dios es amor.',background:'Hay tres declaraciones sobre la naturaleza de Dios en el NT: "Dios es espíritu" (Juan 4:24), "Dios es luz" (1 Juan 1:5) y "Dios es amor" (1 Juan 4:8,16). Esta tercera es la más profunda: no dice que Dios tiene amor o expresa amor, sino que su misma esencia es amor. Todo lo que hace fluye de lo que es.',geo:'Escrito desde Éfeso (actual Turquía), posiblemente la última carta del apóstol Juan.',connections:[{ref:'Juan 3:16',text:'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda.'},{ref:'Romanos 8:38',text:'Por lo cual estoy seguro de que ni la muerte, ni la vida... nos podrá separar del amor de Dios, que es en Cristo Jesús Señor nuestro.'},{ref:'1 Corintios 13:4',text:'El amor es sufrido, es benigno; el amor no tiene envidia, el amor no es jactancioso.'},{ref:'1 Juan 4:19',text:'Nosotros le amamos a él, porque él nos amó primero.'}],words:[{es:'ama',or:'ἀγαπάω (agapaō)',meaning:'Amar con amor incondicional, de elección y voluntad. No es amor emocional que depende de la respuesta. El que no practica este amor revela que no conoce a Dios, porque Dios es exactamente eso.',strong:'G25'},{es:'conocido',or:'γινώσκω (ginōskō)',meaning:'Conocer por experiencia y relación, no solo por información. Juan dice que quien no ama no ha experimentado a Dios aunque sepa muchas cosas sobre Él.',strong:'G1097'},{es:'amor',or:'ἀγάπη (agapē)',meaning:'Amor incondicional, sacrificial, que busca el bien del otro sin esperar retorno. No es emoción sino carácter activo. Juan dice que esta es la esencia misma de Dios.',strong:'G26'}],questions:['Juan dice que Dios no solo tiene amor sino que es amor. ¿Cómo cambia eso tu imagen de Dios?','Si el amor es la esencia de Dios y fuimos creados a su imagen, ¿qué dice eso sobre nuestra capacidad y necesidad de amar?','¿Hay alguien en tu vida a quien te resulta difícil amar incondicionalmente? ¿Cómo te ayuda saber que ese amor viene de Dios, no de ti?']},
        'salmos 139:14':{bigIdea:"Fuiste formado de manera admirable y maravillosa: tu valor no lo decides tú ni el mundo, lo estableció tu Creador.",exposition:["David medita en cómo Dios lo conoce por completo y lo formó en el vientre de su madre. La conclusión es adoración: \"te alabaré; porque formidables, maravillosas son tus obras\". Al contemplar su propia existencia, David no ve un accidente, sino una obra maestra de Dios.", "\"Estoy maravillado\" o \"formidablemente maravillosa\" es su asombro ante el hecho de existir. El cuerpo humano, la vida, la mente: nada de esto es casualidad. Cada persona lleva impresa la firma de un Creador cuidadoso y sabio.", "\"Y mi alma lo sabe muy bien\". David no lo cree a medias; es una convicción profunda del alma. Saber que fuimos hechos con intención por un Dios que nos ama es el fundamento más sólido de la identidad y del valor propio.", "En un mundo que mide el valor por apariencia, logros o aprobación, este versículo lo reubica: tu valor viene de haber sido formado por Dios de manera maravillosa. Nada ni nadie puede quitarte lo que el Creador estableció."],application:["Si luchas con tu valor o tu imagen, deja que la verdad de David reemplace las voces del mundo: eres obra maravillosa de Dios, no un error.", "Trata a los demás —y a ti mismo— como creaciones admirables de Dios. Esa convicción cambia cómo nos hablamos y nos tratamos."],prayer:"Señor, gracias porque me formaste de manera admirable y maravillosa. Cuando dude de mi valor, recuérdame que soy obra tuya, pensada y amada por Ti. Que mi alma lo sepa muy bien. Amén.",tags:['identidad','alabanza','promesa'],author:'David',date:'c. 1000-950 a.C.',audience:'Israel',location:'Posiblemente Jerusalén',occasion:'Salmo meditativo donde David contempla el conocimiento total que Dios tiene de él: pensamientos, camino, palabras antes de formarlas. Ante esa omnisciencia no huye sino que concluye con asombro: el Dios que todo lo conoce lo hizo maravillosamente.',background:'El versículo 14 es la respuesta de adoración a los versículos 13-16: Dios tejió al salmista en el vientre de su madre y lo conoció antes de nacer. La identidad cristiana no se construye desde afuera sino desde el Creador. "Formidables y maravillosas" describe las obras de Dios, y el creyente reconoce que él mismo es una de esas obras.',geo:'Probablemente Jerusalén, en el contexto de la vida de David como rey.',connections:[{ref:'Génesis 1:27',text:'Y creó Dios al hombre á su imagen, á imagen de Dios lo creó; varón y hembra los creó.'},{ref:'Efesios 2:10',text:'Porque hechura suya somos, creados en Cristo Jesús para buenas obras, las cuales Dios preparó de antemano para que anduviésemos en ellas.'},{ref:'Jeremías 1:5',text:'Antes que te formase en el vientre te conocí, y antes que nacieses te santifiqué.'},{ref:'Isaías 43:1',text:'Ahora pues, así dice Jehová, Criador tuyo, oh Jacob, y el que te formó, oh Israel: No temas, porque yo te redimí.'}],words:[{es:'formidables',or:'יָרֵא (yare)',meaning:'Causante de temor reverente, asombroso, digno de maravilla. Las obras de Dios en la creación del cuerpo humano no son ordinarias: provocan reverencia y asombro.',strong:'H3372'},{es:'maravillosas',or:'פָּלָא (pala)',meaning:'Ser extraordinario, más allá de la comprensión ordinaria. Dios hizo al ser humano de tal manera que supera lo que la mente puede comprender plenamente.',strong:'H6381'},{es:'tejiste',or:'סָכַךְ (sakak)',meaning:'Entrelazar, cubrir, tejer. La imagen es la de un artesano que entrelaza con cuidado y propósito, no un proceso mecánico o accidental.',strong:'H5526'}],questions:['Si Dios te hizo "maravillosamente", ¿cómo contradice eso la voz interior que te dice que no eres suficiente?','Este salmo lo escribió alguien que también enfrentó vergüenza, fracaso y rechazo. ¿Cómo coexiste el asombro de ser obra de Dios con la experiencia de la imperfección?','¿Hay algo en tu historia, cuerpo o personalidad que te ha costado aceptar como obra de Dios?']},
        '1 corintios 10:13':{bigIdea:"Ninguna tentación es invencible: Dios es fiel y siempre abre una salida para que puedas resistir.",exposition:["Pablo advierte a los corintios que no se confíen, pero enseguida los anima. Primero desmonta el aislamiento del que es tentado: \"no os ha sobrevenido ninguna tentación que no sea humana\". La tentación que enfrentas no es única ni monstruosa; otros la han vencido antes que tú. No estás solo ni condenado a caer.", "El fundamento de la esperanza no es nuestra fuerza, sino el carácter de Dios: \"fiel es Dios, que no os dejará ser tentados más de lo que podéis resistir\". Dios pone un límite. No permitirá una tentación que exceda, con su ayuda, tu capacidad de resistir. Su fidelidad vigila cada prueba.", "\"Antes dará también juntamente con la tentación la salida\". Junto con cada tentación hay una puerta de escape que Dios provee. El problema muchas veces no es la falta de salida, sino que no la buscamos o no queremos usarla.", "El propósito final es \"que podáis soportar\". Dios no promete quitar toda tentación, sino darnos, en fidelidad, lo necesario para no ser vencidos por ella."],application:["Cuando seas tentado, cree dos verdades: no estás solo en esto y hay una salida. Pídele a Dios ojos para verla y voluntad para tomarla.", "No juegues cerca del límite. La salida suele estar al principio de la tentación; cuanto antes la tomes, más fácil resistir."],prayer:"Señor, gracias porque eres fiel y no permites que sea tentado más de lo que puedo resistir. Cuando llegue la tentación, ayúdame a ver la salida que Tú provees y a tomarla. Sosténme para soportar. Amén.",tags:['tentación','promesa','fuerza'],author:'Apóstol Pablo',date:'c. 53-54 d.C.',audience:'Iglesia en Corinto',location:'Éfeso',occasion:'Pablo acaba de recordar cómo Israel cayó en el desierto a pesar de los milagros que presenció. Advierte a los corintios que no crean que son inmunes a la tentación. Luego declara la promesa: Dios ya previó la tentación y preparó la salida.',background:'La promesa no es que no habrá tentación sino que ninguna será irresistible. "Juntamente con la tentación dará también la salida" revela que la vía de escape ya existe antes de que la tentación llegue. Dios no improvisa rescates; los planifica con anticipación. El problema no es la tentación sino no buscar la salida.',geo:'Escrito desde Éfeso, enviado a Corinto.',connections:[{ref:'Santiago 1:13',text:'Cuando alguno es tentado, no diga que es tentado de parte de Dios; porque Dios no puede ser tentado con el mal, ni él tienta a nadie.'},{ref:'Hebreos 4:15',text:'Porque no tenemos un sumo sacerdote que no pueda compadecerse de nuestras debilidades, sino uno que fue tentado en todo según nuestra semejanza, pero sin pecado.'},{ref:'Mateo 26:41',text:'Velad y orad, para que no entréis en tentación; el espíritu a la verdad está dispuesto, pero la carne es débil.'},{ref:'2 Pedro 2:9',text:'Sabe el Señor librar de tentación a los piadosos.'}],words:[{es:'fiel',or:'πιστός (pistos)',meaning:'Fiel, confiable, que cumple sus promesas. La garantía contra la tentación irresistible no es tu fuerza de voluntad sino el carácter de Dios. Él es fiel: no puede actuar en contradicción con su naturaleza.',strong:'G4103'},{es:'salida',or:'ἔκβασις (ekbasis)',meaning:'Salida, escapatoria, camino de escape. En el griego clásico se usaba para el desenlace de un drama. Dios no solo permite la tentación: prepara activamente la salida.',strong:'G1545'},{es:'soportar',or:'ὑποφέρω (hypopherō)',meaning:'Llevar por debajo, aguantar bajo presión. La meta no siempre es escapar inmediatamente sino mantenerse firme hasta que aparezca la salida.',strong:'G5297'}],questions:['¿Hay alguna tentación en tu vida que crees irresistible? ¿Qué cambia si Dios ya preparó la salida antes de que llegara?','¿Has buscado activamente esa salida, o has esperado pasivamente a que desaparezca la tentación?','La promesa descansa en la fidelidad de Dios, no en la tuya. ¿Cómo cambia eso tu relación con tus fracasos pasados?']},
        'juan 16:33':{bigIdea:"En el mundo tendremos aflicción, pero podemos tener paz y confianza porque Cristo ya venció al mundo.",exposition:["Jesús habla la noche antes de la cruz y no engaña a sus discípulos con falsas promesas. Es honesto: \"en el mundo tendréis aflicción\". La vida cristiana no está exenta de tribulación; seguir a Cristo no es un pase para evitar el dolor. Reconocerlo nos ahorra la amargura de la sorpresa.", "Pero enmarca esa dura verdad entre dos consuelos. Al inicio: \"para que en mí tengáis paz\". La paz no está en la ausencia de problemas, sino \"en mí\", en Cristo. Es una paz que se encuentra en una Persona, no en una circunstancia.", "Al final, el grito de victoria: \"confiad, yo he vencido al mundo\". Jesús lo dice antes de la cruz, con tal seguridad que habla como si ya hubiera ganado. Y así fue: con su muerte y resurrección venció definitivamente al mundo, al pecado y a la muerte.", "Por eso la tribulación no tiene la última palabra. El creyente sufre, pero sufre como quien está del lado del Vencedor. La batalla puede seguir, pero el resultado ya está decidido."],application:["No te sorprendas por la aflicción; Jesús la anunció. Pero no te quedes ahí: enmárcala entre su paz y su victoria.", "Cuando el mundo te abrume, repite el fundamento de tu confianza: \"Él ya venció\". Tu esperanza no depende de tu fuerza, sino de su triunfo."],prayer:"Jesús, sé que en el mundo tendré aflicción, pero en Ti tengo paz. Gracias porque ya venciste al mundo con tu muerte y resurrección. Dame confianza para vivir como quien está del lado del Vencedor. Amén.",tags:['paz','victoria','promesa'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Los doce discípulos en el Aposento Alto',location:'Jerusalén',occasion:'Última noche de Jesús antes de su arresto. Después de lavar los pies, prometer el Espíritu y orar por los suyos, cierra con esta declaración. Es su última enseñanza antes de Getsemaní.',background:'La estructura del versículo es perfecta: el recurso (en mí, paz), la realidad (en el mundo, tribulación), el mandato (confiad), el fundamento (yo he vencido al mundo). Jesús declara la victoria en tiempo perfecto —"he vencido"— antes de que la cruz ocurriera. La resurrección fue la confirmación pública de lo ya consumado.',geo:'El Aposento Alto en Jerusalén, pocas horas antes del Huerto de Getsemaní.',connections:[{ref:'Romanos 8:37',text:'Antes, en todas estas cosas somos más que vencedores por medio de aquel que nos amó.'},{ref:'1 Juan 5:4',text:'Porque todo lo que es nacido de Dios vence al mundo; y esta es la victoria que ha vencido al mundo, nuestra fe.'},{ref:'Juan 14:27',text:'La paz os dejo, mi paz os doy; yo no os la doy como el mundo la da. No se turbe vuestro corazón, ni tenga miedo.'},{ref:'Apocalipsis 21:4',text:'Enjugará Dios toda lágrima de los ojos de ellos; y ya no habrá muerte, ni habrá más llanto, ni clamor, ni dolor.'}],words:[{es:'paz',or:'εἰρήνη (eirēnē)',meaning:'Paz, bienestar total. Traducción del shalom hebreo: no solo ausencia de conflicto sino presencia de plenitud. Esta paz no depende de circunstancias favorables sino de relación con Jesús.',strong:'G1515'},{es:'aflicción',or:'θλῖψις (thlipsis)',meaning:'Presión, tribulación. Literalmente "apretar". Jesús no promete ausencia de tribulación sino paz en medio de ella. La promesa no cambia la circunstancia; cambia la postura ante ella.',strong:'G2347'},{es:'vencido',or:'νικάω (nikaō)',meaning:'Vencer, conquistar. Tiempo perfecto: victoria completada con efectos permanentes. Jesús declaró la victoria antes de que la cruz ocurriera. La resurrección fue la confirmación.',strong:'G3528'}],questions:['Jesús no prometió un mundo sin problemas sino paz en medio de ellos. ¿En qué situación buscas que cambie la circunstancia cuando debería cambiar tu postura interior?','"He vencido al mundo" lo dijo antes de la cruz, y la resurrección lo confirmó. ¿Cómo afecta tu fe saber que la victoria fue declarada y certificada?','¿Hay áreas donde el mundo te ha quitado la paz que Jesús prometió? ¿Cómo regresar a ella?']},
        'salmos 27:1':{bigIdea:"Si el Señor es tu luz, tu salvación y tu fortaleza, entonces el miedo pierde su fundamento.",exposition:["David hace tres declaraciones y saca una conclusión inevitable. \"Jehová es mi luz\": en la oscuridad de la confusión y el peligro, Dios ilumina y da dirección. Donde Él está, las tinieblas no dominan. \"Y mi salvación\": Dios no solo alumbra, rescata.", "\"Jehová es la fortaleza de mi vida\": no una fortaleza entre otras, sino la fuerza misma de su existir. David había enfrentado ejércitos y traiciones; sabía que su seguridad no estaba en su espada, sino en su Dios.", "De esas verdades brota la pregunta que desarma el miedo: \"¿de quién temeré?... ¿de quién he de atemorizarme?\". No es negación ingenua del peligro; es lógica de fe. Si Dios es mi luz, salvación y fortaleza, ninguna amenaza es mayor que Él.", "El miedo suele nacer de olvidar quién es Dios y agrandar el problema. David hace lo contrario: agranda a Dios, y el temor encuentra su justa proporción. Nombrar a Dios correctamente reduce el miedo a su tamaño real."],application:["Cuando el miedo apriete, contrarréstalo declarando quién es Dios para ti: luz, salvación, fortaleza. Agranda a Dios y el temor se encoge.", "Convierte la pregunta de David en tu escudo: \"¿de quién temeré?\". Ningún enemigo es más grande que tu Dios."],prayer:"Señor, Tú eres mi luz, mi salvación y la fortaleza de mi vida. ¿De quién temeré? Cuando el miedo quiera dominarme, ayúdame a recordar quién eres Tú. En Ti descansa mi seguridad. Amén.",tags:['valentía','protección','confianza'],author:'David',date:'c. 1000-950 a.C.',audience:'Israel',location:'Posiblemente durante persecución de Saúl o de Absalón',occasion:'Salmo de confianza profunda en medio de amenaza real. David enfrenta enemigos, ejércitos y acusadores. La apertura no es oración sino declaración: David ya decidió antes del peligro en quién confía.',background:'La pregunta retórica "¿de quién me temeré?" no espera respuesta. Si Jehová es luz (elimina la oscuridad del miedo), salvación (rescata del peligro) y fortaleza (es el bastión), entonces el temor no tiene asidero. Es una teología construida antes de la prueba para que sostenga durante ella.',geo:'Posiblemente el desierto de Judea, donde David huyó de sus perseguidores.',connections:[{ref:'Isaías 41:10',text:'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo.'},{ref:'Romanos 8:31',text:'¿Qué, pues, diremos a esto? Si Dios es por nosotros, ¿quién contra nosotros?'},{ref:'Hebreos 13:6',text:'De manera que podemos decir confiadamente: El Señor es mi ayudador; no temeré lo que me pueda hacer el hombre.'},{ref:'Salmos 91:1',text:'El que habita al abrigo del Altísimo, morará bajo la sombra del Omnipotente.'}],words:[{es:'luz',or:'אוֹר (or)',meaning:'Luz. En el AT, luz es vida, orientación y presencia divina. Jehová como luz disipa la oscuridad del miedo y da dirección cuando todo parece oscuro.',strong:'H216'},{es:'salvación',or:'יֶשַׁע (yesha)',meaning:'Salvación, liberación, espacio amplio. La raíz sugiere ser sacado de un lugar estrecho a uno amplio. Jehová no solo protege sino que libera al que estaba atrapado.',strong:'H3468'},{es:'fortaleza',or:'מָעוֹז (maoz)',meaning:'Bastión, lugar inaccesible al enemigo. Metáfora militar: el que habita en Dios habita en una fortaleza que el enemigo no puede tomar.',strong:'H4581'}],questions:['David escribió esto en medio de peligro real, no un día tranquilo. ¿Cómo construyes confianza en Dios antes de que llegue la crisis, para que te sostenga durante ella?','"Luz", "salvación", "fortaleza": tres imágenes de lo que Dios es. ¿Cuál necesitas más en este momento de tu vida?','La pregunta "¿de quién me temeré?" invita a nombrar el miedo. ¿A qué tienes miedo hoy? ¿Cómo cambia eso si Jehová es tu luz y salvación?']},
        '1 juan 1:9':{bigIdea:"Confesar el pecado no lo esconde ni lo excusa: lo lleva a un Dios fiel y justo que perdona y limpia.",exposition:["Juan escribe a creyentes, no a incrédulos: la confesión es parte de la vida cristiana normal, no solo del inicio. \"Si confesamos nuestros pecados\". Confesar significa literalmente \"decir lo mismo\" que Dios dice sobre nuestro pecado: dejar de excusarlo, minimizarlo o esconderlo, y llamarlo por su nombre.", "Dios responde siendo \"fiel y justo para perdonar\". \"Fiel\" porque cumple su promesa de perdonar; \"justo\" porque el perdón no ignora el pecado: fue pagado en la cruz. Dios no perdona pasando por alto la justicia, sino porque Cristo satisfizo sus demandas. Perdonar al que confía es un acto de justicia, no solo de misericordia.", "La promesa es doble: \"perdonar nuestros pecados, y limpiarnos de toda maldad\". No solo cancela la deuda (perdón), también quita la mancha (limpieza). Dios restaura la relación y purifica el corazón.", "\"De toda maldad\": no hay pecado tan sucio que la sangre de Cristo no pueda limpiar. La confesión sincera nunca se topa con un Dios reacio, sino con uno que espera para perdonar."],application:["No arrastres culpa escondida. Llévala a Dios en confesión honesta: Él es fiel y justo, no dudes de su perdón.", "La confesión mantiene la relación fresca. Hazla parte de tu vida diaria, no solo de las grandes caídas."],prayer:"Señor, confieso mis pecados delante de Ti, sin excusas. Gracias porque eres fiel y justo para perdonarme y limpiarme de toda maldad. Recibo tu perdón y camino limpio por la obra de Cristo. Amén.",tags:['perdón','limpieza','gracia'],author:'Juan el apóstol',date:'c. 85-95 d.C.',audience:'Iglesias de Asia Menor',location:'Éfeso',occasion:'Juan combate enseñanzas gnósticas que negaban el pecado. El versículo 8 dice que quien afirma no tener pecado se engaña. El versículo 9 ofrece la solución: no negar el pecado sino confesarlo.',background:'La promesa tiene dos partes: Dios "perdonará" (cancela la deuda) y "limpiará" (remueve la mancha). El perdón es judicial; la limpieza es relacional. La garantía descansa en el carácter de Dios: es "fiel" (cumple su promesa) y "justo" (Cristo ya pagó el precio, así que perdonar es un acto de justicia, no solo de misericordia).',geo:'Escrito desde Éfeso.',connections:[{ref:'Salmos 32:5',text:'Mi pecado te declaré, y no encubrí mi iniquidad. Dije: Confesaré mis rebeliones a Jehová; y tú perdonaste la maldad de mi pecado.'},{ref:'Proverbios 28:13',text:'El que encubre sus pecados no prosperará; mas el que los confiesa y se aparta, alcanzará misericordia.'},{ref:'Isaías 1:18',text:'Venid luego, dice Jehová, y estemos a cuenta: si vuestros pecados fueren como la grana, como la nieve serán emblanquecidos.'},{ref:'Hebreos 4:16',text:'Lleguémonos pues confiadamente al trono de la gracia, para alcanzar misericordia y hallar gracia para el oportuno socorro.'}],words:[{es:'confesamos',or:'ὁμολογέω (homologeō)',meaning:'Decir lo mismo, estar de acuerdo. Confesar el pecado es ponerse de acuerdo con Dios sobre él: llamar pecado a lo que Él llama pecado, sin minimizarlo ni ocultarlo.',strong:'G3670'},{es:'fiel',or:'πιστός (pistos)',meaning:'Fiel, que cumple lo prometido. El perdón no depende de cuánto te arrepientas sino del carácter de Dios. Él prometió perdonar al que confiesa: esa fidelidad es la garantía.',strong:'G4103'},{es:'limpiarnos',or:'καθαρίζω (katharizō)',meaning:'Limpiar, purificar, hacer ceremonialmente puro. Va más allá del perdón judicial: restaura la pureza y quita la mancha. La sangre de Jesús es lo que limpia.',strong:'G2511'}],questions:['¿Hay algo que has estado minimizando en lugar de confesar? ¿Qué te impide llevarlo a Dios tal como es?','Juan dice que Dios perdona porque es justo, no solo misericordioso. Cristo ya pagó. ¿Cómo cambia eso tu capacidad de aceptar el perdón sin sentir que no lo mereces?','¿Cuál es la diferencia práctica entre el perdón (cancelar la deuda) y la limpieza (quitar la mancha)?']},
        'romanos 5:8':{bigIdea:"Dios probó su amor de la manera más contundente: Cristo murió por nosotros cuando aún éramos pecadores.",exposition:["Pablo mide el amor de Dios no por palabras, sino por un hecho. \"Dios muestra su amor para con nosotros, en que siendo aún pecadores, Cristo murió por nosotros\". El amor humano suele esperar a que el otro sea digno; el amor de Dios se movió cuando éramos indignos, enemigos, sin nada que ofrecer.", "El versículo anterior lo subraya: apenas alguien moriría por un justo. Pero Dios no esperó a que mejoráramos. \"Siendo aún pecadores\": no reformados, no arrepentidos todavía, sino en plena rebeldía. Ahí, en ese punto, Cristo dio su vida. El amor de Dios no reacciona a nuestra bondad; la precede.", "La cruz es la prueba. No tenemos que adivinar si Dios nos ama ni medirlo por nuestras circunstancias. La demostración está clavada en la historia: Cristo murió por nosotros. Y no quedó en la muerte: resucitó, garantizando que ese amor no fue derrota sino victoria.", "Este amor es el fundamento inamovible de la seguridad del creyente. Si Dios amó tanto cuando éramos enemigos, cuánto más nos cuidará ahora que somos sus hijos reconciliados."],application:["Cuando dudes de que Dios te ama, no consultes tus sentimientos ni tus fracasos: mira la cruz y la tumba vacía. Ahí está la prueba definitiva.", "Si Dios te amó siendo su enemigo, deja de creer que tienes que ganarte su amor con buena conducta. Ya fue demostrado de una vez para siempre."],prayer:"Padre, gracias por demostrar tu amor de forma tan clara: Cristo murió por mí cuando yo aún era pecador, y resucitó para darme vida. Que esa certeza sea el ancla de mi seguridad. Amén.",tags:['amor','gracia','salvación'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Iglesia en Roma',location:'Corinto',occasion:'En Romanos 5 Pablo argumenta las implicaciones de la justificación por fe. Cristo murió por los "débiles" (v.6), por los "impíos" (v.6) y —punto máximo— por nosotros "siendo aún pecadores". Es el argumento del amor incondicional: sin esperar ningún mérito.',background:'El argumento contrasta con la lógica humana: por un hombre justo quizás alguien moriría. Pero Cristo murió por pecadores, por impíos, por enemigos (v.10). Este amor no es declaración sino demostración histórica. La cruz es el evento donde el amor de Dios se hizo visible. Y la resurrección es la confirmación de que esa demostración fue aceptada.',geo:'Escrito desde Corinto, enviado a Roma.',connections:[{ref:'Juan 3:16',text:'De tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.'},{ref:'Juan 15:13',text:'Nadie tiene mayor amor que este, que uno ponga su vida por sus amigos.'},{ref:'1 Juan 4:10',text:'En esto consiste el amor: no en que nosotros hayamos amado a Dios, sino en que él nos amó a nosotros.'},{ref:'Isaías 53:5',text:'Mas él herido fue por nuestras rebeliones, molido por nuestros pecados.'}],words:[{es:'muestra',or:'συνίστημι (synistēmi)',meaning:'Demostrar, probar, presentar como evidente. El amor de Dios no es solo sentimiento: tiene una prueba histórica. La cruz fue una demostración que ya ocurrió y no puede deshacerse.',strong:'G4921'},{es:'siendo aún pecadores',or:'ἔτι ἁμαρτωλῶν (eti hamartolon)',meaning:'Todavía siendo pecadores, en estado de rebelión. Dios no esperó que mejoráramos para amarnos. El amor que nos alcanzó lo hizo en nuestra peor condición.',strong:'G2089'},{es:'murió',or:'ἀπέθανεν (apethanen)',meaning:'Murió. Pablo no se queda en la muerte: en Romanos 5:10 añade que fuimos reconciliados por su muerte y salvados por su vida, es decir, por su resurrección.',strong:'G599'}],questions:['El amor de Dios te alcanzó "siendo aún pecador", no después de mejorar. ¿Cómo cambia eso la manera en que te ves a ti mismo?','Si la cruz fue la prueba del amor de Dios en tu estado de rebelión, ¿qué podría alejarte de ese amor ahora?','¿Hay alguien a quien amas condicionalmente? ¿Cómo transforma tu amor a esa persona saber que Dios te amó sin condiciones?']},
        'mateo 5:4':{bigIdea:"En el reino de Jesús, los que lloran no son los desdichados, sino los que recibirán consuelo de Dios.",exposition:["Esta bienaventuranza suena a contradicción: \"bienaventurados los que lloran\". El mundo llama dichoso al que ríe, al que lo tiene todo. Jesús invierte la escala: hay una bendición reservada para los que lloran. No exalta el dolor en sí, sino que promete algo a quienes lo atraviesan de la mano de Dios.", "El llanto aquí incluye varias lágrimas: el duelo por la pérdida, pero sobre todo el quebranto por el propio pecado y por el estado del mundo. Es el llanto del que ya no finge estar bien, del que reconoce su necesidad. Ese llanto sincero abre el corazón a Dios.", "La promesa es rotunda: \"ellos recibirán consolación\". No un consuelo cualquiera, sino el de Dios mismo. La misma sensibilidad que hace llorar es la que permite recibir el consuelo divino. El corazón endurecido ni llora ni es consolado.", "Esta consolación empieza ahora, en la cercanía de Dios al quebrantado, y culmina en la promesa de un día donde Él enjugará toda lágrima. El llanto del creyente tiene fecha de caducidad."],application:["No escondas tu llanto ante Dios como si fuera falta de fe. Es precisamente a los que lloran a quienes Jesús promete consuelo.", "Permítete también el llanto sano por el pecado. El quebranto que reconoce la necesidad es la puerta por donde entra la consolación de Dios."],prayer:"Señor, en mi llanto vengo a Ti. Gracias porque prometes consuelo a los que lloran. Recíbeme con mis lágrimas, consuélame con tu presencia y sostén mi esperanza de que un día las enjugarás todas. Amén.",tags:['consuelo','tristeza','promesa'],author:'Mateo el apóstol',date:'c. 80-90 d.C.',audience:'Discípulos y multitudes',location:'Monte de las Bienaventuranzas, Galilea',occasion:'El Sermón del Monte, la enseñanza más larga de Jesús en los Evangelios. Las Bienaventuranzas abren el sermón y describen a los ciudadanos del Reino. Cada una invierte los valores del mundo.',background:'En el mundo romano, llorar en público era señal de debilidad. Los estoicos enseñaban a controlar las emociones. Jesús declara "bienaventurados los que lloran": no solo los que lloran por su pecado sino los que lloran por pérdidas, duelos y cargas. El consuelo es promesa activa —"serán consolados", pasiva divina: es Dios quien consuela. La resurrección de Jesús es el fundamento: quien venció la muerte puede consolar cualquier dolor.',geo:'Monte de las Bienaventuranzas, orilla noroccidental del Mar de Galilea.',connections:[{ref:'2 Corintios 1:3',text:'Bendito el Dios y Padre de nuestro Señor Jesucristo, Padre de misericordias y Dios de toda consolación.'},{ref:'Isaías 61:2',text:'A proclamar el año de la buena voluntad de Jehová, y el día de venganza del Dios nuestro; a consolar a todos los enlutados.'},{ref:'Apocalipsis 21:4',text:'Enjugará Dios toda lágrima de los ojos de ellos; y ya no habrá muerte, ni habrá más llanto.'},{ref:'Salmos 34:18',text:'Cercano está Jehová a los quebrantados de corazón; y salvará a los contritos de espíritu.'}],words:[{es:'lloran',or:'πενθέω (pentheō)',meaning:'Llorar con lamento, estar de duelo. Es el llanto más intenso del griego, el que se asocia con la muerte de un ser querido o pérdida irreversible. Jesús no habla de tristeza superficial sino de dolor profundo.',strong:'G3996'},{es:'consolados',or:'παρακαλέω (parakaleō)',meaning:'Ser consolado, ser llamado al lado. La raíz es Paráclito (el Espíritu Santo). El consuelo que promete Jesús es el del mismo Espíritu acercándose al que llora.',strong:'G3870'},{es:'bienaventurados',or:'μακάριος (makarios)',meaning:'Dichoso, favorecido por Dios. No es felicidad circunstancial sino la bendición que viene de estar en la posición correcta ante Dios.',strong:'G3107'}],questions:['Jesús dice que los que lloran son bienaventurados. ¿Cómo reconcilias esto con la presión de "estar bien" y no mostrar vulnerabilidad?','¿Hay un dolor que has evitado enfrentar porque crees que la fe significa no llorar? ¿Qué te dice Jesús aquí?','La promesa es "serán consolados", no "dejarán de sentir dolor". ¿Cuál es la diferencia entre consuelo y anestesia del dolor?']},
        'salmos 51:10':{bigIdea:"El corazón limpio no se produce con esfuerzo humano: es una creación nueva que solo Dios puede obrar.",exposition:["David escribe este salmo tras su gran pecado con Betsabé. No pide simplemente que se le perdonen los actos, sino algo más profundo: \"crea en mí, oh Dios, un corazón limpio\". Sabe que su problema no es solo de conducta, sino de corazón. Reformar la superficie no basta; necesita una transformación de raíz.", "El verbo \"crea\" (bará) es el mismo de Génesis 1: hacer surgir algo de la nada, un acto exclusivo de Dios. David reconoce que él no puede fabricarse un corazón limpio con buenas intenciones; necesita un acto creador de Dios. La santidad verdadera es obra divina, no logro humano.", "\"Renueva un espíritu recto dentro de mí\". No solo pide limpieza puntual, sino una disposición interior estable, firme, orientada a Dios. La gracia no solo perdona lo pasado; reforma el interior para el futuro.", "Este clamor anticipa la promesa del nuevo pacto: un corazón nuevo dado por Dios. Lo que David pidió, Cristo lo hace posible por su Espíritu en todo el que se acerca quebrantado."],application:["Cuando caigas, no te limites a corregir conductas: pide a Dios lo que David pidió, un corazón limpio. El cambio real empieza adentro.", "Deja de intentar reformarte a pura fuerza de voluntad. Preséntate a Dios como el único que puede crear en ti algo nuevo."],prayer:"Oh Dios, crea en mí un corazón limpio y renueva un espíritu recto dentro de mí. No puedo hacerlo por mis fuerzas; hazlo Tú, que creas de la nada. Transforma mi interior, no solo mi conducta. Amén.",tags:['arrepentimiento','transformación','perdón'],author:'David',date:'c. 1000-950 a.C.',audience:'Personal, luego litúrgico',location:'Jerusalén',occasion:'El encabezado del salmo dice: "cuando Natán el profeta fue a él después que se había llegado a Betsabé". Es el salmo del peor fracaso moral de David: adulterio y asesinato encubierto. Este versículo es el corazón de su oración.',background:'David no pide restaurar su reputación ni borrar las consecuencias: pide algo más profundo. "Crea" es el mismo verbo de Génesis 1:1 (bara): solo Dios puede crear algo de la nada. David reconoce que lo que necesita no puede producirse con esfuerzo humano sino solo por acto creador divino. Después de la restauración, David volverá a la adoración y al testimonio (vv. 12-13).',geo:'Jerusalén, en el palacio real, tras la confrontación del profeta Natán.',connections:[{ref:'Ezequiel 36:26',text:'Os daré corazón nuevo, y pondré espíritu nuevo dentro de vosotros; y quitaré de vuestra carne el corazón de piedra, y os daré un corazón de carne.'},{ref:'2 Corintios 5:17',text:'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.'},{ref:'Lamentaciones 3:22',text:'Por la misericordia de Jehová no hemos sido consumidos, porque nunca decayeron sus misericordias.'},{ref:'1 Juan 1:9',text:'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados.'}],words:[{es:'crea',or:'בָּרָא (bara)',meaning:'Crear de la nada. Es el mismo verbo de Génesis 1:1. David no pide mejorar su carácter sino un acto creador de Dios. Solo Dios puede crear algo que no existía: un corazón limpio.',strong:'H1254'},{es:'limpio',or:'טָהוֹר (tahor)',meaning:'Puro, sin mezcla, ceremonialmente apto para la presencia de Dios. David pide una pureza radical, no parcial.',strong:'H2889'},{es:'recto',or:'נָכוֹן (nakon)',meaning:'Firme, establecido, estable. El espíritu que David pide es uno que no oscile, que sea constante. Después del fracaso, lo que más se necesita es estabilidad interior.',strong:'H3559'}],questions:['David, el "varón conforme al corazón de Dios", cayó en el peor fracaso. ¿Cómo cambia tu perspectiva sobre tus propios fracasos?','Usa el verbo "crear" (bara), el de Génesis 1. ¿Qué dice eso sobre lo que es posible con Dios incluso después de un colapso moral?','¿Hay algo en tu interior que necesita esta oración de David hoy? ¿Cuándo fue la última vez que oraste así de honestamente?']},
        'filipenses 4:19':{bigIdea:"Dios se compromete a suplir toda necesidad conforme a sus riquezas, que son infinitas, no conforme a nuestra escasez.",exposition:["Pablo escribe esta promesa a los filipenses que, siendo pobres, habían dado con generosidad para apoyarlo. Es en ese contexto de sacrificio donde dice: \"mi Dios, pues, suplirá todo lo que os falta\". A los que dan confiando en Dios, Dios los respalda con su provisión.", "\"Todo lo que os falta\": la promesa abarca toda necesidad genuina. No dice que Dios dará todos nuestros caprichos, pero sí que cubrirá lo que verdaderamente hace falta. Él conoce la diferencia entre lo que deseamos y lo que necesitamos, y se compromete con lo segundo.", "La medida es asombrosa: \"conforme a sus riquezas en gloria\". Dios no da conforme a nuestra pobreza, ni siquiera de sus riquezas (un poco de lo mucho que tiene), sino conforme a ellas, a la altura de su abundancia infinita. Un Dios inmensamente rico provee a esa escala.", "Y todo es \"en Cristo Jesús\": la provisión fluye por medio de la relación con Él. No es un contrato mágico, sino el cuidado de un Padre rico hacia sus hijos unidos a su Hijo."],application:["Cuando te falte algo esencial, recuerda la fuente y la medida: tu Dios provee conforme a sus riquezas infinitas, no según lo que tú ves.", "Da con generosidad confiando en esta promesa. Los filipenses la recibieron precisamente por dar; la fe que suelta descubre que Dios sostiene."],prayer:"Padre, gracias porque suples todo lo que me falta conforme a tus riquezas en gloria. Enséñame a confiar en tu provisión abundante y a dar con generosidad, sabiendo que Tú nunca te empobreces. Amén.",tags:['provisión','promesa','fe'],author:'Apóstol Pablo',date:'c. 61 d.C.',audience:'Iglesia en Filipos',location:'Roma, desde la prisión',occasion:'Final de la carta, después de agradecer el regalo económico que los filipenses enviaron a Pablo en prisión. Este versículo es la respuesta de Pablo: Dios les devolverá lo que dieron, con interés divino.',background:'El contexto es clave: no es prosperidad general sino reciprocidad divina hacia los que dan generosamente. "Conforme a sus riquezas en gloria" pone el estándar: no según las posibilidades humanas sino según la riqueza ilimitada de Dios. "En Cristo Jesús" es el canal: la provisión llega a través de la relación con Él.',geo:'Escrito desde Roma durante el primer encarcelamiento de Pablo.',connections:[{ref:'Mateo 6:33',text:'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.'},{ref:'Salmos 23:1',text:'Jehová es mi pastor; nada me faltará.'},{ref:'Lucas 12:24',text:'Considerad los cuervos, que ni siembran, ni siegan... Pues ¿cuánto más valéis vosotros que las aves?'},{ref:'2 Corintios 9:8',text:'Y poderoso es Dios para hacer que abunde en vosotros toda gracia, a fin de que, teniendo siempre en todas las cosas todo lo suficiente, abundéis para toda buena obra.'}],words:[{es:'suplirá',or:'πληρόω (plēroō)',meaning:'Llenar hasta el tope, satisfacer plenamente. No es "dará algo" sino "satisfará toda necesidad". La provisión de Dios no es escasa sino completa.',strong:'G4137'},{es:'conforme',or:'κατά (kata)',meaning:'De acuerdo con, según el estándar de. La provisión no es "de" las riquezas de Dios (como si tomara un poco de un fondo grande) sino "según" ellas, con su misma escala.',strong:'G2596'},{es:'gloria',or:'δόξα (doxa)',meaning:'Gloria, majestad, la perfección del carácter divino en acción. La riqueza de Dios operando en gloria es riqueza sin límite ni merma.',strong:'G1391'}],questions:['Pablo escribe esta promesa desde una prisión, no desde la abundancia. ¿Cómo cambia eso el peso de la promesa?','¿Hay una necesidad real que enfrentas ahora? ¿Cómo cambia este versículo la manera en que la presentas a Dios?','La promesa es "todo lo que os falta". ¿Distingues entre necesidades reales y deseos? ¿Cómo le presentas ambas a Dios?']},
        'isaias 26:3':{bigIdea:"La paz completa es para la mente que permanece fija en Dios, porque descansa en Él con confianza.",exposition:["Isaías canta a un Dios que guarda a su pueblo, y revela el secreto de una paz que el mundo no conoce: \"tú guardarás en completa paz a aquel cuyo pensamiento en ti persevera\". La paz plena tiene una condición y una fuente muy claras.", "La condición está en el pensamiento: \"cuyo pensamiento en ti persevera\", o en la mente firme, apoyada en Dios. La paz no llega a la mente dispersa que salta de preocupación en preocupación, sino a la que se mantiene fija en Dios. Aquello en lo que fijamos la mente determina si tenemos paz o pánico.", "La razón se da enseguida: \"porque en ti ha confiado\". La mente firme en Dios es fruto de la confianza en Él. No es autocontrol mental a secas, sino confianza que ancla los pensamientos. Confiar en Dios estabiliza la mente, y la mente estable produce paz.", "\"Completa paz\": en hebreo, literalmente \"shalom, shalom\", paz repetida, paz perfecta y desbordante. No una calma parcial, sino una plenitud que abarca todo el ser, aun en medio de la tormenta."],application:["Examina en qué se fija tu mente durante el día. La paz sigue a la atención: mente en los problemas produce ansiedad; mente en Dios produce shalom.", "Cuando la ansiedad crezca, redirige deliberadamente tus pensamientos a Dios y a su fidelidad probada. La confianza recobrada trae paz."],prayer:"Señor, guarda mi mente en completa paz manteniéndola fija en Ti. Cuando mis pensamientos se dispersen en preocupaciones, ayúdame a volver a confiar en Ti. Tu shalom perfecto es mi descanso. Amén.",tags:['paz','confianza','promesa'],author:'Isaías',date:'c. 740-700 a.C.',audience:'Israel y Judá',location:'Jerusalén',occasion:'Parte del llamado "Apocalipsis de Isaías" (caps. 24-27), que anuncia juicio sobre las naciones y restauración de Israel. El cap. 26 es un himno de alabanza por la ciudad de Dios.',background:'La paz prometida no es circunstancial sino producto de una postura mental: el pensamiento "perseverante" en Dios. En hebreo es "samuch samuch", repetición que indica firmeza total. La paz no viene de resolver los problemas sino de fijar la mente en Dios mientras los problemas permanecen.',geo:'Escrito en Jerusalén durante el período de amenaza asiria.',connections:[{ref:'Filipenses 4:7',text:'Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.'},{ref:'Juan 14:27',text:'La paz os dejo, mi paz os doy; yo no os la doy como el mundo la da.'},{ref:'Filipenses 4:8',text:'En esto pensad: todo lo que es verdadero, todo lo honesto, todo lo justo, todo lo puro, todo lo amable.'},{ref:'Romanos 8:6',text:'Porque el ocuparse de la carne es muerte, pero el ocuparse del Espíritu es vida y paz.'}],words:[{es:'guardarás',or:'נָצַר (natsar)',meaning:'Guardar, proteger, custodiar. Dios no solo da paz: la guarda activamente. La paz en Él está bajo custodia divina.',strong:'H5341'},{es:'completa paz',or:'שָׁלוֹם שָׁלוֹם (shalom shalom)',meaning:'Paz perfecta. En hebreo, la repetición intensifica. Shalom (bienestar total, integridad, plenitud) duplicado es la paz más plena posible, no tranquilidad superficial.',strong:'H7965'},{es:'confió',or:'בָּטַח (batach)',meaning:'Confiar, poner peso en algo. La raíz sugiere apoyarse en una superficie. Quien confía en Dios no está suspendido en el aire sino apoyado en una base firme.',strong:'H982'}],questions:['La paz completa viene de la mente que "persevera" en Dios. ¿En qué está habitualmente tu mente cuando estás bajo presión?','Isaías escribió esto con Asiria amenazando a Israel. ¿Hay una amenaza real en tu vida ahora donde esta promesa necesita aplicarse?','¿Cuál es la diferencia entre la paz que da el mundo (cuando las circunstancias mejoran) y la paz que guarda a quien confía en Dios?']},
        'salmos 37:4':{bigIdea:"Deleitarse en el Señor reordena los deseos del corazón, de modo que Él concede lo que Él mismo ha plantado.",exposition:["Este versículo se malinterpreta cuando se lee como una fórmula para obtener lo que queremos: \"deléitate y Dios te dará tus antojos\". Pero el orden importa. Primero: \"deléitate asimismo en Jehová\". El deleite es en Dios mismo, no en sus regalos. Él es el tesoro, no el medio para otros tesoros.", "Deleitarse en el Señor significa hallar en Él el gozo, la satisfacción y el mayor placer del alma. Cuando Dios se vuelve nuestro deleite, algo sucede con nuestros deseos: se transforman. Empezamos a querer lo que Él quiere.", "\"Y él te concederá las peticiones de tu corazón\". No es que Dios se pliegue a todos nuestros caprichos, sino que, al deleitarnos en Él, nuestro corazón desea cosas que Él con gusto concede. Los deseos se alinean con su voluntad, y esos deseos alineados encuentran respuesta.", "El salmo entero contrasta al que se afana por prosperar a su manera con el que confía y se deleita en Dios. La verdadera riqueza no es obtener lo que ansiamos, sino desear rectamente porque Dios es nuestro gozo."],application:["Antes de pedir que Dios cumpla tus deseos, pídele que los transforme. Deléitate en Él y descubrirás que tus anhelos empiezan a cambiar.", "Cultiva el gozo en Dios mismo, no solo en sus beneficios. Cuando Él es tu deleite, tienes ya lo mejor, tengas o no lo demás."],prayer:"Señor, enséñame a deleitarme en Ti, no solo en lo que me das. Transforma los deseos de mi corazón hasta que quiera lo que Tú quieres. Que Tú seas mi mayor gozo y mi mayor tesoro. Amén.",tags:['contentamiento','promesa','fe'],author:'David',date:'c. 1000-950 a.C.',audience:'Israel',location:'No especificada',occasion:'Salmo acróstico (cada estrofa comienza con una letra del alfabeto hebreo) sobre la injusticia: los malvados prosperan, los justos sufren. El salmo aconseja confiar y esperar. El versículo 4 es el clímax de esa confianza.',background:'La promesa "te concederá las peticiones de tu corazón" está condicionada: "deléitate en Jehová". No es fórmula mágica sino inversión radical. Cuando Dios es tu deleite supremo, tus deseos más profundos se alinean con los de Él. Lo que pides comienza a ser lo que Él da, porque lo que quieres ha sido transformado por quién es Él para ti.',geo:'Contexto genérico, aplicable a cualquier situación de injusticia o espera.',connections:[{ref:'Mateo 6:33',text:'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.'},{ref:'Salmos 73:25',text:'¿A quién tengo yo en los cielos sino a ti? Y fuera de ti nada deseo en la tierra.'},{ref:'Juan 15:7',text:'Si permanecéis en mí, y mis palabras permanecen en vosotros, pedid todo lo que queréis, y os será hecho.'},{ref:'Filipenses 4:11',text:'He aprendido a contentarme, cualquiera que sea mi situación.'}],words:[{es:'deléitate',or:'עָנַג (anag)',meaning:'Deleitarse, disfrutar con placer suave. No es deber sino gozo. Dios no pide obediencia árida sino ser el objeto de tu mayor placer.',strong:'H6026'},{es:'concederá',or:'נָתַן (natan)',meaning:'Dar, conceder, colocar. No como recompensa por esfuerzo sino como regalo del que ya se deleita en darte lo que necesitas.',strong:'H5414'},{es:'peticiones',or:'מִשְׁאָלוֹת (mishaalot)',meaning:'Peticiones del corazón, deseos más íntimos. No caprichos superficiales sino lo que el corazón anhela en lo más hondo. Cuando el corazón se deleita en Dios, esos deseos profundos comienzan a parecerse a los de Él.',strong:'H4862'}],questions:['¿Cuál es la diferencia entre "pedir lo que quieres" y "deleitarte en Dios y que Él te conceda lo que quieres"?','Si Dios fuera tu mayor deleite, ¿cómo cambiarían tus deseos? ¿Hay deseos que ya han cambiado así en tu vida?','¿Hay algo que has pedido mucho sin respuesta? ¿Qué dice este versículo sobre la raíz del problema?']},
        'mateo 6:34':{bigIdea:"La ansiedad por el mañana roba las fuerzas de hoy; Jesús nos llama a vivir un día a la vez, confiando en el Padre.",exposition:["Jesús cierra su enseñanza sobre la ansiedad con una instrucción práctica: \"no os afanéis por el día de mañana\". No prohíbe la planificación responsable, sino la preocupación que se adelanta a sufrir males que aún no llegan. El afán toma prestado el dolor del futuro y lo suma al presente.", "\"El día de mañana traerá su afán\". Jesús es realista: cada día tiene sus dificultades. Pero también implica una promesa: cuando llegue ese mañana, vendrá acompañado de la gracia de Dios para enfrentarlo. La gracia para mañana llega mañana, no hoy.", "\"Basta a cada día su propio mal\". Hay suficiente en el día de hoy como para gastar energías anticipando el de mañana. Vivir en el presente, confiando en el Padre para cada jornada, es un acto de fe que libera del peso del futuro imaginado.", "Detrás de todo está la confianza en un Padre que cuida (el mismo capítulo habla de las aves y los lirios). No nos afanamos por el mañana porque el mañana ya tiene un Dios que lo gobierna y que estará ahí cuando llegue."],application:["¿Cuánta energía gastas sufriendo por males que quizá nunca lleguen? Devuélvele el mañana a Dios y concéntrate en obedecer y confiar hoy.", "Practica vivir un día a la vez. Cuando la mente salte al futuro con ansiedad, tráela de vuelta al presente y a la provisión de Dios para hoy."],prayer:"Padre, ayúdame a no afanarme por el mañana. Dame gracia para vivir hoy confiando en Ti, y la certeza de que cuando llegue el mañana, Tú ya estarás allí. Un día a la vez, contigo. Amén.",tags:['ansiedad','confianza','instrucción'],author:'Mateo el apóstol',date:'c. 80-90 d.C.',audience:'Discípulos y multitudes',location:'Monte de las Bienaventuranzas, Galilea',occasion:'Parte del Sermón del Monte, sección sobre la ansiedad (6:25-34). Jesús acaba de señalar que las aves y los lirios no se afanan y el Padre los provee. Este versículo cierra la sección: tampoco te afanes por el futuro.',background:'El principio es radical: el mañana tiene sus propios problemas y Dios proveerá para ellos cuando lleguen. La ansiedad de hoy por el mañana carga un peso doble: el problema futuro más la preocupación presente. Jesús llama a vivir por "días", no por décadas de anticipación ansiosa.',geo:'Monte de las Bienaventuranzas, norte de Galilea.',connections:[{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.'},{ref:'1 Pedro 5:7',text:'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.'},{ref:'Lucas 12:22',text:'Por tanto os digo: No os afanéis por vuestra vida, qué comeréis; ni por el cuerpo, qué vestiréis.'},{ref:'Lamentaciones 3:23',text:'Nuevas son cada mañana; grande es tu fidelidad.'}],words:[{es:'afanéis',or:'μεριμνάω (merimnaō)',meaning:'Afanarse, estar dividido mentalmente. La raíz sugiere que la mente se parte en muchos fragmentos. Jesús no prohíbe la planificación sino la división interior que produce la preocupación ansiosa.',strong:'G3309'},{es:'mañana',or:'αὔριον (aurion)',meaning:'El día de mañana. Jesús no dice que no tendrá problemas; dice que tiene los suyos propios y que Dios proveerá para ellos cuando lleguen.',strong:'G839'},{es:'mal',or:'κακία (kakia)',meaning:'Afán, problema, dificultad del día. No necesariamente el mal moral sino las dificultades propias de cada jornada. Suficiente para cada uno.',strong:'G2549'}],questions:['¿De cuántos "mañanas" te estás preocupando hoy? ¿Qué dice este versículo sobre esa carga doble?','Jesús no dice que el mañana no tendrá problemas. ¿Cuál es la diferencia entre planificar con sabiduría y afanarse con ansiedad?','Si vivieras solo el "hoy" en serio, ¿qué cambiaría en cómo usas tus energías emocionales y mentales?']},
        '2 cronicas 7:14':{bigIdea:"La restauración de un pueblo empieza cuando se humilla, ora, busca a Dios y se aparta del mal.",exposition:["Dios responde a la oración de Salomón en la dedicación del templo con una promesa condicional para su pueblo. Ante el juicio y la sequía espiritual, señala el camino de vuelta con cuatro verbos: \"si se humillare mi pueblo, sobre los cuales mi nombre es invocado, y oraren, y buscaren mi rostro, y se convirtieren de sus malos caminos\".", "El camino empieza con humildad: reconocer la necesidad de Dios y soltar el orgullo autosuficiente. Sigue con la oración: buscar activamente a Dios en dependencia. Luego \"buscar su rostro\": anhelar a Dios mismo, no solo sus beneficios. Y culmina en el arrepentimiento: apartarse concretamente del mal, no solo lamentarlo.", "La promesa es triple: \"entonces yo oiré desde los cielos, y perdonaré sus pecados, y sanaré su tierra\". Dios escucha, perdona y restaura. La sanidad de la tierra sigue a la sanidad del corazón; el orden es espiritual antes que circunstancial.", "Aunque fue dicho a Israel, el principio permanece: Dios responde al pueblo que se humilla y lo busca de verdad. La restauración no viene por estrategias, sino por volver a Él."],application:["Cuando sientas sequía espiritual, personal o en tu comunidad, recorre los cuatro pasos: humíllate, ora, busca el rostro de Dios y aparta el mal concreto.", "No busques solo la sanidad de tus circunstancias (\"la tierra\"); busca primero el rostro de Dios. Lo demás sigue a eso."],prayer:"Señor, me humillo delante de Ti, te busco en oración y anhelo tu rostro. Apártame de mis malos caminos. Escucha desde los cielos, perdóname y restaura lo que está seco en mi vida. Amén.",tags:['arrepentimiento','restauración','promesa'],author:'Cronista (posiblemente Esdras)',date:'c. 450-400 a.C.',audience:'Israel post-exílico',location:'Jerusalén',occasion:'La noche después de que Salomón dedicó el templo. Dios se le aparece y responde su oración. La promesa es condicional: describe qué debe hacer Israel cuando llegue la calamidad.',background:'El versículo tiene cuatro condiciones (humillarse, orar, buscar el rostro, convertirse) y cuatro promesas (oiré, perdonaré, sanaré). La condición más radical es la última: no basta el ritual religioso; Dios pide transformación de conducta. La promesa "sanaré su tierra" va más allá del individuo: el arrepentimiento personal tiene efectos comunitarios.',geo:'El Templo de Salomón en Jerusalén, recién construido.',connections:[{ref:'Jeremías 29:13',text:'Me buscaréis y me hallaréis, porque me buscaréis de todo vuestro corazón.'},{ref:'Joel 2:13',text:'Rasgad vuestro corazón, y no vuestros vestidos, y convertíos a Jehová vuestro Dios.'},{ref:'Lucas 15:20',text:'Y levantándose, vino a su padre. Y cuando aún estaba lejos, lo vio su padre, y fue movido a misericordia.'},{ref:'1 Juan 1:9',text:'Si confesamos nuestros pecados, él es fiel y justo para perdonar nuestros pecados.'}],words:[{es:'humillare',or:'כָּנַע (kana)',meaning:'Humillarse, someterse, doblar la rodilla. Es reconocer que uno no es autosuficiente, que la dirección propia ha fallado. Es la postura que Dios busca antes de sanar.',strong:'H3665'},{es:'buscare',or:'בָּקַשׁ (baqash)',meaning:'Buscar con deseo intenso, procurar. No buscar casualmente sino con determinación, como un hombre que busca agua en el desierto.',strong:'H1245'},{es:'sanaré',or:'רָפָא (rapha)',meaning:'Sanar, restaurar la salud. El mismo verbo de "Jehová-Rapha". La sanidad prometida es completa y va más allá del individuo: "su tierra". El arrepentimiento personal produce restauración comunitaria.',strong:'H7495'}],questions:['Las cuatro condiciones son: humillarse, orar, buscar su rostro y convertirse. ¿En cuál tienes más resistencia?','"Sanaré su tierra" es la promesa colectiva. ¿Cómo conectas el arrepentimiento personal con la salud de tu familia o comunidad?','¿Hay un "mal camino" del que necesitas convertirte hoy, no solo pedir perdón sino cambiar de dirección?']},
        'hebreos 13:5':{bigIdea:"El contentamiento nace de una promesa: Dios nunca nos dejará ni nos desamparará.",exposition:["El autor une dos cosas que parecen distintas: \"sean vuestras costumbres sin avaricia, contentos con lo que tenéis ahora\". La avaricia y la falta de contentamiento nacen del miedo a que no habrá suficiente. La respuesta no es tener más, sino confiar en Quien lo tiene todo.", "El fundamento del contentamiento es una promesa de Dios citada del Antiguo Testamento: \"No te desampararé, ni te dejaré\". El contentamiento cristiano no es resignación estoica; es descanso en la presencia garantizada de Dios. Puedo estar en paz con lo que tengo porque nunca me faltará Quien me sostiene.", "En el griego, la promesa usa varias negaciones acumuladas, algo así como \"de ninguna manera, jamás te dejaré\". Es un \"nunca\" enfático, sin excepciones ni cláusulas. Dios no dice que estará mientras nos portemos bien o mientras las cosas vayan bien: dice \"jamás\".", "Por eso el versículo siguiente concluye con confianza: \"el Señor es mi ayudador; no temeré\". Si la presencia de Dios es permanente, entonces ni la escasez ni la amenaza tienen la última palabra."],application:["La raíz de la avaricia y la ansiedad económica es el miedo a quedarnos solos y desprovistos. Cámbiala por la promesa: Dios jamás te dejará.", "Practica el contentamiento hoy agradeciendo lo que tienes, anclado no en tus posesiones, sino en la presencia permanente de Dios."],prayer:"Señor, líbrame de la avaricia y del afán. Enséñame a estar contento, porque Tú prometiste que jamás me dejarás ni me desampararás. Tú eres mi ayudador; en Ti descanso y no temeré. Amén.",tags:['soledad','promesa','confianza'],author:'Desconocido (posiblemente Pablo)',date:'c. 60-70 d.C.',audience:'Judíos creyentes bajo presión de apostasía',location:'Roma o Alejandría',occasion:'La carta llama a los creyentes hebreos a no volver al judaísmo pese a la persecución. El capítulo 13 da instrucciones prácticas. Este versículo combina dos advertencias: no codiciéis y contentaos, porque Dios mismo hizo una promesa de presencia permanente.',background:'La promesa "no te desampararé, ni te dejaré" es una cita de Josué 1:5, donde Dios la hizo a Josué al entrar a tierra difícil. El autor la aplica a todos los creyentes en toda situación de necesidad o abandono. El contenimiento no viene de las circunstancias sino de saber que el Dios que nunca falla está presente.',geo:'Escrito probablemente desde Roma, enviado a una comunidad judeo-cristiana bajo presión.',connections:[{ref:'Josué 1:5',text:'No te dejaré, ni te desampararé.'},{ref:'Mateo 28:20',text:'Y he aquí yo estoy con vosotros todos los días, hasta el fin del mundo.'},{ref:'Romanos 8:38',text:'Estoy seguro de que ni la muerte, ni la vida... nos podrá separar del amor de Dios.'},{ref:'Salmos 23:4',text:'Aunque ande en valle de sombra de muerte, no temeré mal alguno, porque tú estarás conmigo.'}],words:[{es:'desampararé',or:'ἀνίημι (aniēmi)',meaning:'Aflojar, soltar, abandonar. La doble negación en el griego original es enfática: "no, nunca te soltaré, no, nunca te abandonaré". Cinco negaciones en dos verbos que subrayan que es absolutamente imposible que Dios te deje.',strong:'G447'},{es:'dejaré',or:'ἐγκαταλείπω (enkataleiō)',meaning:'Dejar atrás, abandonar en un momento de necesidad. Es la palabra que Jesús usó en la cruz: "¿Por qué me has desamparado?" Dios prometió nunca hacer con nosotros lo que ocurrió en la cruz para nuestra salvación.',strong:'G1459'},{es:'contentos',or:'ἀρκέω (arkeō)',meaning:'Ser suficiente, estar satisfecho con lo que hay. El contentamiento no es resignación sino confianza en que el que está contigo es suficiente sin importar lo que falte.',strong:'G714'}],questions:['¿Hay una situación de soledad o abandono en tu vida ahora mismo? ¿Cómo cambia esto saber que Dios hizo una promesa personal e inquebrantable de estar contigo?','La promesa se dio originalmente a Josué antes de una tarea imposible. ¿Qué tarea difícil estás enfrentando donde necesitas esta misma promesa?','¿Cuál es la diferencia entre no estar solo porque tienes personas alrededor y no estar solo porque Dios está contigo?']},
        'salmos 103:3':{bigIdea:"Antes de pedir nada más, el alma recuerda lo primero: Dios perdona todas las iniquidades y sana todas las dolencias.",exposition:["David se predica a sí mismo: \"bendice, alma mía, a Jehová... y no olvides ninguno de sus beneficios\". El olvido es el gran enemigo de la gratitud. Por eso enumera los beneficios de Dios, y encabeza la lista con el perdón: \"él es quien perdona todas tus iniquidades\".", "\"Todas\": no algunas, no las pequeñas, sino todas. No hay pecado del creyente arrepentido que quede fuera del perdón de Dios. Este es el beneficio primero y mayor, del que dependen todos los demás, porque sin perdón no hay relación con Dios.", "\"El que sana todas tus dolencias\". Dios es también el sanador. A veces sana el cuerpo aquí; siempre sana el alma; y garantiza la sanidad total en la resurrección. Perdón y sanidad van juntos en su cuidado integral: atiende tanto la culpa como el quebranto.", "El salmo sigue enumerando: rescata, corona de misericordia, sacia de bien. Pero empieza por el perdón, porque quien ha sido perdonado de todo tiene ya el mayor motivo para bendecir a Dios con toda el alma."],application:["Combate el olvido espiritual: haz memoria deliberada de los beneficios de Dios, empezando por el perdón de todas tus iniquidades.", "Cuando la culpa quiera acusarte, declara la verdad del salmo: Él perdona todas, sin excepción. Deja que esa certeza levante tu alabanza."],prayer:"Bendice, alma mía, al Señor. Gracias porque perdonas todas mis iniquidades y sanas todas mis dolencias. No quiero olvidar tus beneficios. Recibe mi alabanza por tu misericordia sin medida. Amén.",tags:['sanidad','perdón','promesa'],author:'David',date:'c. 1000-950 a.C.',audience:'Israel',location:'Probablemente Jerusalén',occasion:'Salmo de alabanza personal que enumera los "beneficios" de Jehová. El versículo 3 es una doble declaración: perdona Y sana. Combina la restauración espiritual con la física en un mismo aliento.',background:'El orden importa: primero perdón, luego sanidad. En el pensamiento hebreo, la enfermedad y la ruptura espiritual estaban relacionadas. Dios actúa sobre ambas. "Todas tus dolencias" no promete que nunca enfermarás sino que ninguna enfermedad escapa al cuidado de Jehová-Rapha, el Dios que sana.',geo:'Sin ubicación específica; es meditación personal de David.',connections:[{ref:'Isaías 53:5',text:'Y por su llaga fuimos nosotros curados.'},{ref:'Santiago 5:16',text:'Confesaos vuestras ofensas unos a otros, y orad unos por otros, para que seáis sanados.'},{ref:'Mateo 9:35',text:'Y recorría Jesús todas las ciudades y aldeas... y sanando toda enfermedad y toda dolencia en el pueblo.'},{ref:'Jeremías 17:14',text:'Sáname, oh Jehová, y seré sano; sálvame, y seré salvo; porque mi alabanza eres tú.'}],words:[{es:'perdona',or:'סָלַח (salach)',meaning:'Perdonar, remitir. En hebreo se usa exclusivamente de Dios perdonando al hombre. Ningún ser humano puede "salach" a otro. Es un perdón divino único que borra la deuda completamente.',strong:'H5545'},{es:'sana',or:'רָפָא (rapha)',meaning:'Sanar, restaurar, reparar. Raíz del nombre divino Jehová-Rapha. Implica restauración completa, no solo alivio de síntomas. Aplica tanto a lo físico como a lo espiritual y emocional.',strong:'H7495'},{es:'dolencias',or:'תַּחֲלוּא (tachalua)',meaning:'Enfermedad, dolencia, lo que debilita. La palabra incluye el ámbito físico pero también el emocional. El salmista habla de toda clase de deterioro humano.',strong:'H8463'}],questions:['El versículo pone el perdón antes de la sanidad. ¿Hay una conexión en tu vida entre algo sin resolver espiritualmente y el estado de tu salud o bienestar?','¿Has llevado a Jehová-Rapha una enfermedad o dolor crónico con la misma confianza con que pides perdón?','¿Cuáles son los "beneficios" de Dios que olvidamos con más frecuencia cuando la vida es difícil?']},
        'mateo 7:7':{bigIdea:"La oración persistente no es rogarle a un Dios reacio, sino confiar en un Padre bueno que invita a pedir, buscar y llamar.",exposition:["Jesús da tres imperativos que se intensifican: \"pedid... buscad... llamad\". Pedir es la actitud humilde del que reconoce su necesidad; buscar añade esfuerzo y anhelo; llamar implica persistencia ante una puerta. La oración no es pasiva; es una búsqueda activa y constante de Dios.", "En el original, los verbos están en una forma que sugiere continuidad: seguid pidiendo, seguid buscando, seguid llamando. Jesús no promete respuestas a la oración caprichosa de un momento, sino a la fe que persevera y no se rinde.", "Las promesas son rotundas: \"se os dará... hallaréis... se os abrirá\". Jesús no dice \"quizá\"; habla con la certeza de quien conoce el corazón del Padre. La oración persistente no cae en el vacío.", "El fundamento se da después: si los padres humanos, siendo imperfectos, dan cosas buenas a sus hijos, cuánto más el Padre celestial. La confianza en la oración descansa en la bondad de Dios, no en nuestra insistencia como si tuviéramos que vencer su resistencia."],application:["¿Has dejado de orar por algo porque la respuesta tarda? Jesús te anima a seguir pidiendo, buscando y llamando con fe perseverante.", "Ora confiando en la bondad del Padre, no como quien tiene que convencer a un Dios reacio, sino como un hijo que se acerca a un Padre bueno."],prayer:"Padre, gracias por invitarme a pedir, buscar y llamar. Dame perseverancia para no rendirme en la oración y confianza en tu bondad. Sé que un Padre bueno como Tú responde a sus hijos. Amén.",tags:['oración','promesa','fe'],author:'Mateo el apóstol',date:'c. 80-90 d.C.',audience:'Discípulos y multitudes',location:'Monte de las Bienaventuranzas, Galilea',occasion:'Parte del Sermón del Monte, sección sobre la oración (7:7-11). Justo después de la prohibición de juzgar hipócritamente, Jesús pasa a la instrucción sobre pedir.',background:'Los tres verbos —pedir, buscar, llamar— están en presente continuo en griego: "seguid pidiendo, seguid buscando, seguid llamando". No es una promesa de resultado instantáneo sino de persistencia premiada. La comparación con un padre humano (vv. 9-11) refuerza: si los padres imperfectos dan buenas cosas, cuánto más el Padre perfecto.',geo:'Monte de las Bienaventuranzas, Galilea.',connections:[{ref:'Jeremías 33:3',text:'Clama a mí, y yo te responderé, y te enseñaré cosas grandes y dificultosas que tú no conoces.'},{ref:'1 Juan 5:14',text:'Y esta es la confianza que tenemos en él, que si pedimos alguna cosa conforme a su voluntad, él nos oye.'},{ref:'Lucas 18:1',text:'También les refirió Jesús una parábola sobre la necesidad de orar siempre, y no desmayar.'},{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego.'}],words:[{es:'pedid',or:'αἰτέω (aiteō)',meaning:'Pedir, solicitar. Presente imperativo: seguir pidiendo de manera continua. No una petición única sino una postura de dependencia persistente.',strong:'G154'},{es:'buscad',or:'ζητέω (zēteō)',meaning:'Buscar, procurar activamente. Presente imperativo: seguir buscando. Implica búsqueda activa, no espera pasiva. La oración no es solo hablar sino buscar a Dios.',strong:'G2212'},{es:'llamad',or:'κρούω (krouō)',meaning:'Golpear (una puerta), llamar insistentemente. Imagen de alguien que no se rinde aunque la puerta no se abra de inmediato. La perseverancia en la oración es parte de la promesa.',strong:'G2925'}],questions:['Los verbos están en presente continuo: "seguir pidiendo, seguir buscando, seguir llamando". ¿En qué petición has desmayado que necesitas retomar?','¿Qué diferencia hay en tu vida cuando oras persistentemente versus cuando oras una sola vez y te olvidas?','Jesús compara a Dios con un padre humano que da buenas cosas. ¿Cómo esta imagen cambia tu expectativa de la respuesta divina?']},
        'lamentaciones 3:23':{bigIdea:"Las misericordias de Dios son nuevas cada mañana; su fidelidad no se agota aunque todo lo demás se derrumbe.",exposition:["Estas palabras brillan en medio del libro más triste de la Biblia. Jeremías llora la destrucción de Jerusalén, ha tocado fondo. Y justo ahí, en el capítulo central, cambia el tono: \"por la misericordia de Jehová no hemos sido consumidos\". La razón de que sigamos en pie no es la suerte, sino que la misericordia de Dios no se ha terminado.", "\"Nuevas son cada mañana\". Como el maná en el desierto, la misericordia de Dios se renueva a diario. La de ayer sirvió para ayer; hoy amanece una provisión fresca. No importa cuánto gastaste de la gracia de Dios ayer; hay reserva nueva esta mañana.", "\"Grande es tu fidelidad\". En medio de las ruinas, Jeremías no proclama que las circunstancias sean buenas, sino que Dios es fiel. La fidelidad de Dios no depende de lo que pase alrededor; es constante como el amanecer. Cada mañana que sale el sol es un testigo silencioso de que Dios sigue siendo fiel.", "Esta esperanza no niega el dolor —el libro sigue lamentándose—, pero lo enmarca en algo más grande: un Dios cuya misericordia no se acaba y cuya fidelidad no falla."],application:["Empieza cada mañana recordando que la misericordia de Dios es nueva para hoy. El fracaso de ayer no agota su gracia de hoy.", "En medio de tus propias ruinas, aprende de Jeremías a proclamar la fidelidad de Dios aunque las circunstancias no hayan cambiado."],prayer:"Señor, gracias porque tus misericordias son nuevas cada mañana y grande es tu fidelidad. Cuando toque fondo, recuérdame que no me has consumido, porque tu amor no se acaba. En Ti espero. Amén.",tags:['fidelidad','esperanza','promesa'],author:'Jeremías',date:'c. 587-586 a.C.',audience:'Sobrevivientes de la destrucción de Jerusalén',location:'Jerusalén en ruinas',occasion:'Jeremías escribe estas palabras entre los escombros de Jerusalén, destruida por Babilonia. El libro entero es un poema de duelo. En el capítulo 3, en el punto más oscuro, ocurre el giro: "Esto recapacitaré en mi corazón, por lo tanto esperaré" (v. 21). El versículo 23 es el corazón de esa esperanza.',background:'El contexto es absolutamente devastador: ciudad destruida, templo quemado, pueblo deportado. No hay circunstancias más duras. Y sin embargo Jeremías declara que las misericordias de Dios son nuevas cada mañana. "Grande es tu fidelidad" (v. 23) se convirtió en la base del himno más cantado de la historia cristiana. La esperanza no viene de las circunstancias sino de quién es Dios.',geo:'Jerusalén en ruinas, c. 587 a.C., después de la destrucción babilónica.',connections:[{ref:'Salmos 30:5',text:'Por la tarde durará el lloro, y a la mañana vendrá la alegría.'},{ref:'Ezequiel 36:26',text:'Os daré corazón nuevo, y pondré espíritu nuevo dentro de vosotros.'},{ref:'Isaías 40:28',text:'¿No has sabido, no has oído que el Dios eterno es Jehová... no desfallece, ni se fatiga?'},{ref:'2 Timoteo 2:13',text:'Si fuéremos infieles, él permanece fiel; él no puede negarse a sí mismo.'}],words:[{es:'misericordias',or:'חֶסֶד (chesed)',meaning:'Amor leal, fidelidad del pacto, amor que no falla. Una de las palabras más ricas del AT. No es solo misericordia emocional sino lealtad comprometida que no depende de la respuesta del receptor.',strong:'H2617'},{es:'nuevas',or:'חָדָשׁ (chadash)',meaning:'Nuevas, frescas. No recicladas ni agotadas. Cada mañana llega con misericordias que no estaban disponibles ayer. Los problemas de hoy vienen con recursos divinos de hoy.',strong:'H2319'},{es:'fidelidad',or:'אֱמוּנָה (emunah)',meaning:'Firmeza, confiabilidad, fidelidad. La raíz es "aman" de donde viene "amén". Dios es el Amén viviente: lo que dice se cumple, lo que promete permanece.',strong:'H530'}],questions:['Jeremías escribió esto entre los escombros, no en un buen día. ¿Cómo cambia eso la credibilidad de su declaración de esperanza?','¿Cuál es el "escombro" en tu vida ahora mismo? ¿Cómo sería aplicar Lamentaciones 3:23 esta mañana?','Las misericordias son "nuevas cada mañana". ¿Qué significaría comenzar cada día esperando misericordias frescas en lugar de cargar las de ayer?']},
        'colosenses 3:23':{bigIdea:"Todo trabajo, hasta el más humilde, se transforma cuando se hace de corazón como para el Señor y no para los hombres.",exposition:["Pablo escribe originalmente a esclavos, personas con los trabajos más duros y menos reconocidos, y les da una perspectiva que dignifica cualquier labor: \"todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres\". El cambio no está en la tarea, sino en para quién se hace.", "\"De corazón\" (o de buena gana, con el alma): no a medias, no solo cuando alguien mira. El trabajo cristiano se hace con integridad y entrega aun en lo invisible, porque hay Alguien que siempre ve.", "\"Como para el Señor y no para los hombres\": aquí está la transformación. Cuando trabajo pensando que mi verdadero jefe es Cristo, el trabajo se convierte en adoración. La opinión de los hombres deja de gobernarme; busco agradar a Dios, que es justo y recompensa.", "El versículo siguiente lo confirma: \"del Señor recibiréis la recompensa de la herencia\". El reconocimiento que este mundo no da, Dios lo garantiza. Ningún esfuerzo hecho para Él se pierde, aunque nadie más lo note."],application:["Reenfoca tu trabajo de hoy: no lo haces principalmente para tu jefe, tu cliente o tu familia, sino para el Señor. Eso cambia el cómo y el porqué.", "En las tareas invisibles o poco valoradas, recuerda que Dios ve y recompensa. Trabaja con excelencia incluso cuando nadie aplaude."],prayer:"Señor, ayúdame a hacer todo de corazón, como para Ti y no para los hombres. Que mi trabajo sea adoración y que busque tu aprobación más que la de nadie. En Ti está mi recompensa. Amén.",tags:['trabajo','instrucción','propósito'],author:'Apóstol Pablo',date:'c. 60-62 d.C.',audience:'Iglesia en Colosas',location:'Roma, desde la prisión',occasion:'El capítulo 3 describe la nueva vida en Cristo: quitarse lo viejo, ponerse lo nuevo. La sección 3:18-4:1 aplica esto a relaciones: esposos/esposas, padres/hijos, y finalmente siervos/señores. A los siervos (trabajadores) se les dice que trabajen como si el patrón fuera Cristo mismo.',background:'El principio es radical: no hay trabajo secular y trabajo sagrado. Todo trabajo puede ser acto de adoración si se hace "de ánimo, como al Señor". Pablo lo dice a esclavos que no elegían su trabajo y cuyo esfuerzo podría sentirse como pérdida de tiempo. El motivador no es el reconocimiento humano sino la audiencia divina.',geo:'Escrito desde Roma, enviado a Colosas (actual Turquía).',connections:[{ref:'Proverbios 16:3',text:'Encomienda tus obras a Jehová, y tus pensamientos serán afirmados.'},{ref:'Mateo 5:16',text:'Así alumbre vuestra luz delante de los hombres, para que vean vuestras obras buenas.'},{ref:'1 Corintios 10:31',text:'Si pues coméis o bebéis, o hacéis otra cosa, hacedlo todo para la gloria de Dios.'},{ref:'Eclesiastés 9:10',text:'Todo lo que te viniere a la mano para hacer, hazlo según tus fuerzas.'}],words:[{es:'de ánimo',or:'ἐκ ψυχῆς (ek psychēs)',meaning:'Desde el alma, de todo corazón. No el mínimo esfuerzo para cumplir sino el máximo de lo que uno es. Pablo pide una calidad de trabajo que viene del alma, no de la calculadora de lo que observará el jefe.',strong:'G5590'},{es:'al Señor',or:'τῷ κυρίῳ (tō kyriō)',meaning:'Al Señor, a Cristo. Cambio de audiencia. Cuando el patrón es Cristo, el estándar no es "lo que se nota" sino "lo que es excelente". El trabajo ordinario se convierte en acto de culto.',strong:'G2962'},{es:'hacéis',or:'ποιέω (poieō)',meaning:'Hacer, producir, llevar a cabo. El presente continuo indica toda acción que se realiza, no solo las grandes. Limpiar, escribir, construir, cuidar: todo cuenta cuando se hace al Señor.',strong:'G4160'}],questions:['¿Qué cambiaría en cómo trabajas mañana si lo hicieras como si tu jefe fuera Cristo?','Pablo lo dijo a esclavos que no elegían su trabajo. ¿Cómo transforma eso los trabajos que tampoco eliges o que no te gustan?','¿Hay una tarea en tu vida que has estado haciendo con desgana? ¿Cómo empezar a hacerla "de ánimo, como al Señor"?']},
        'hebreos 12:1':{bigIdea:"La vida cristiana es una carrera de resistencia: despojarse de todo peso y correr con paciencia la que Dios puso delante.",exposition:["Tras el capítulo 11, que enumera a los héroes de la fe, el autor los presenta como \"tan grande nube de testigos\" que nos rodea. No son espectadores que nos vigilan, sino testigos cuya vida de fe da testimonio de que vale la pena correr. Su ejemplo nos anima a seguir.", "\"Despojémonos de todo peso, y del pecado que nos asedia\". El corredor se quita todo lo que estorba. Hay dos cosas que soltar: el pecado, que claramente enreda, y los \"pesos\", que no son necesariamente pecados, sino cosas legítimas que, sin embargo, nos frenan en la carrera. La fe madura discierne qué soltar.", "\"Corramos con paciencia la carrera que tenemos por delante\". La vida cristiana no es un sprint, es una carrera de resistencia. La palabra \"paciencia\" es perseverancia, aguante. No se gana por explosiones de entusiasmo, sino por constancia fiel hasta el final. Y la carrera es la \"que tenemos por delante\": la que Dios diseñó para cada uno, no la de otro.", "El versículo siguiente da el secreto: correr \"puestos los ojos en Jesús\". La resistencia se sostiene mirando a Él, el autor y consumador de la fe, no las circunstancias ni a nosotros mismos."],application:["Identifica los \"pesos\" que te frenan: no solo pecados evidentes, sino hábitos o distracciones legítimas que te restan en la carrera de la fe.", "Cuando quieras rendirte, recuerda que es una carrera de resistencia, no de velocidad. Corre con paciencia, los ojos puestos en Jesús."],prayer:"Señor, ayúdame a despojarme de todo peso y del pecado que me asedia. Dame paciencia para correr la carrera que pusiste delante de mí, con los ojos fijos en Jesús. Que no me rinda hasta el final. Amén.",tags:['perseverancia','fe','instrucción'],author:'Desconocido (posiblemente Pablo)',date:'c. 60-70 d.C.',audience:'Judíos creyentes bajo presión',location:'Roma o Alejandría',occasion:'El capítulo 11 termina con la gran lista de los héroes de la fe (Abel, Noé, Abraham, Moisés…). El capítulo 12 abre con "por tanto": la nube de testigos que completaron su carrera es la razón para correr la nuestra.',background:'La imagen es la de un estadio griego lleno de espectadores. Los héroes del capítulo 11 "nos rodean" en el sentido de que su testimonio de fe perseverante es el contexto en que corremos nosotros. "Despojémonos" es activo: quitar lo que estorba es responsabilidad del corredor. Y "corramos con paciencia" implica que la carrera de la fe es de fondo, no de velocidad.',geo:'Escrito a una comunidad cristiana bajo presión de apostasía, posiblemente en Roma.',connections:[{ref:'Santiago 1:3',text:'Sabiendo que la prueba de vuestra fe obra paciencia.'},{ref:'Filipenses 3:14',text:'Prosigo a la meta, al premio del supremo llamamiento de Dios en Cristo Jesús.'},{ref:'1 Corintios 9:24',text:'¿No sabéis que los que corren en el estadio, todos a la verdad corren, pero uno solo lleva el premio?'},{ref:'Gálatas 6:9',text:'No nos cansemos, pues, de hacer bien; porque a su tiempo segaremos, si no desmayamos.'}],words:[{es:'nube de testigos',or:'νέφος μαρτύρων (nephos martyrōn)',meaning:'Nube densa de testigos. "Nube" indica multitud incontable. "Testigos" son los que dieron testimonio con su vida de fe. No son espectadores anónimos sino vidas que probaron que Dios cumple lo que promete.',strong:'G3509'},{es:'peso',or:'ὄγκος (onkos)',meaning:'Masa, bulto, lo que hace lento al corredor. No es solo el pecado sino cualquier cosa —ocupaciones, preocupaciones, relaciones— que ralentice la carrera de fe.',strong:'G3591'},{es:'paciencia',or:'ὑπομονή (hypomonē)',meaning:'Resistencia activa, perseverancia bajo presión. No es resignación pasiva sino mantenerse firme mientras se avanza. La raíz es "quedarse debajo" del peso sin ceder.',strong:'G5281'}],questions:['¿Quiénes son los "testigos" en tu historia personal —personas de fe cuya vida te inspira— cuyo ejemplo te llama a no rendirte?','¿Qué "peso" (no necesariamente pecado) está haciendo más lenta tu carrera de fe ahora mismo?','La carrera requiere "paciencia". ¿En qué área de tu vida espiritual estás tentado a esprintar o a rendirte en lugar de correr con perseverancia?']},
        'santiago 1:3':{bigIdea:"Las pruebas no son enemigas de la fe: bien recibidas, son el taller donde Dios forja la paciencia.",exposition:["Santiago dice algo que va contra el instinto: \"tened por sumo gozo cuando os halléis en diversas pruebas\". No manda gozarse por el dolor en sí, sino por lo que la prueba produce. Y el versículo lo explica: \"sabiendo que la prueba de vuestra fe produce paciencia\".", "La clave está en \"sabiendo\". El gozo en la prueba no es ingenuo ni forzado; nace del conocimiento de un propósito. Quien entiende que la dificultad está haciendo algo bueno en él puede enfrentarla con esperanza en vez de amargura.", "\"La prueba de vuestra fe produce paciencia\" (o perseverancia, constancia). La fe no probada es teoría; la fe probada se fortalece, como el músculo que crece bajo resistencia. Dios no desperdicia las pruebas: las usa como taller para forjar carácter que no se produce de otra manera.", "El pasaje continúa: la paciencia lleva a la madurez, \"para que seáis perfectos y cabales, sin que os falte cosa alguna\". El fin no es el sufrimiento, sino un creyente completo. Dios está más interesado en tu madurez que en tu comodidad."],application:["Ante una prueba, cambia la pregunta \"¿por qué me pasa esto?\" por \"¿qué quiere Dios formar en mí a través de esto?\". El propósito cambia la actitud.", "No malgastes tus pruebas resistiéndote a lo que Dios quiere enseñarte. Recíbelas como el taller donde crece tu paciencia y tu fe."],prayer:"Señor, ayúdame a ver mis pruebas con tus ojos. Sé que están produciendo paciencia y madurez en mí. Dame gozo en medio de ellas, confiando en que no las desperdicias, sino que me formas. Amén.",tags:['perseverancia','prueba','fe'],author:'Santiago (hermano del Señor)',date:'c. 45-50 d.C.',audience:'Dispersión judeo-cristiana',location:'Jerusalén',occasion:'Apertura de la carta más práctica del NT. Santiago escribe a creyentes que sufren pruebas de todo tipo. La instrucción de "tener por sumo gozo" las pruebas parece contraria a la razón hasta que se entiende el mecanismo: la prueba → paciencia → madurez.',background:'La cadena es clara: prueba → prueba de fe → paciencia → obra perfecta → madurez. Santiago no dice que la prueba sea buena en sí misma sino que produce algo valioso si se responde con fe. El gozo no es por el sufrimiento sino por lo que el sufrimiento produce cuando se procesa con confianza en Dios.',geo:'Escrito desde Jerusalén, a judíos creyentes dispersos por el Imperio.',connections:[{ref:'Romanos 5:3',text:'Y no solo esto, sino que también nos gloriamos en las tribulaciones, sabiendo que la tribulación produce paciencia.'},{ref:'1 Pedro 1:7',text:'Para que la prueba de vuestra fe, mucho más preciosa que el oro que perece, sea hallada en alabanza, gloria y honra.'},{ref:'Hebreos 12:11',text:'Ninguna disciplina al presente parece ser causa de gozo, sino de tristeza; pero después da fruto apacible de justicia.'},{ref:'Juan 16:33',text:'En el mundo tendréis aflicción; mas confiad, yo he vencido al mundo.'}],words:[{es:'prueba',or:'δοκίμιον (dokimion)',meaning:'Proceso de prueba para verificar autenticidad. Se usaba en metalurgia para probar si el metal era puro. Las pruebas de vida revelan la calidad real de la fe, no solo la declarada.',strong:'G1383'},{es:'paciencia',or:'ὑπομονή (hypomonē)',meaning:'Resistencia activa, perseverancia bajo presión. No es aguantar pasivamente sino mantenerse firme y avanzar aunque duela.',strong:'G5281'},{es:'perfectos',or:'τέλειος (teleios)',meaning:'Completo, maduro, que alcanzó su telos (propósito). No perfección moral sin fallas sino completitud de carácter: un creyente que ha sido probado y ha perseverado tiene un carácter que no puede fabricarse de otra manera.',strong:'G5046'}],questions:['Santiago dice "tened por sumo gozo". No es fingir que la prueba no duele. ¿Cuál es la diferencia entre gozo auténtico en la prueba y negación del dolor?','¿Hay una prueba actual en tu vida que Dios podría estar usando para producir paciencia y madurez?','La prueba revela la fe real, no la declarada. ¿Qué ha revelado de ti la prueba más difícil que has vivido?']},
        'mateo 6:14':{bigIdea:"El perdón que recibimos de Dios y el perdón que damos a otros están inseparablemente unidos.",exposition:["Justo después de enseñar el Padrenuestro, Jesús subraya una de sus peticiones: la del perdón. \"Si perdonáis a los hombres sus ofensas, os perdonará también a vosotros vuestro Padre celestial\". De todas las frases de la oración modelo, esta es la que amplía, porque es la más difícil de vivir.", "Jesús no enseña que ganemos el perdón de Dios perdonando; el perdón de Dios es por gracia. Enseña que quien ha sido perdonado de verdad se vuelve una persona que perdona. Un corazón que rehúsa perdonar revela que no ha comprendido cuánto se le ha perdonado a él.", "El versículo siguiente lo dice en negativo: \"si no perdonáis... tampoco vuestro Padre os perdonará\". Es una advertencia seria. La falta de perdón cierra el corazón, y el mismo corazón cerrado que no da perdón tampoco recibe libremente el de Dios.", "Perdonar no significa negar el daño ni fingir que no dolió; significa soltar el derecho a la venganza y entregarle la deuda a Dios. Es liberar al ofensor, y de paso liberarse uno mismo de la cárcel del rencor."],application:["¿Hay alguien a quien te resistes a perdonar? Recuerda la deuda impagable que Dios te perdonó a ti; desde ahí, el perdón se vuelve posible.", "Perdonar es una decisión antes que un sentimiento. Empieza soltando en oración el derecho a cobrarle a quien te hirió."],prayer:"Padre, Tú me has perdonado una deuda que jamás podría pagar. Ayúdame a perdonar a los que me han ofendido, como Tú me perdonaste. Libera mi corazón del rencor y hazme un canal de tu gracia. Amén.",tags:['perdón','instrucción','gracia'],author:'Mateo el apóstol',date:'c. 80-90 d.C.',audience:'Discípulos y multitudes',location:'Monte de las Bienaventuranzas, Galilea',occasion:'Inmediatamente después del Padrenuestro (6:9-13). La única petición que Jesús comenta y amplía es la del perdón. La conexión es explícita: así como pides ser perdonado, así debes perdonar.',background:'Esta es una de las enseñanzas más incómodas de Jesús: la capacidad de recibir el perdón de Dios está conectada a la voluntad de perdonar a otros. No es transaccional (como si ganaras el perdón perdonando) sino que quien genuinamente ha experimentado el perdón de Dios queda transformado en su actitud hacia los que le ofenden. El que no puede perdonar revela que no ha dimensionado cuánto ha sido perdonado.',geo:'Monte de las Bienaventuranzas, Galilea.',connections:[{ref:'Efesios 4:32',text:'Antes sed benignos unos con otros, misericordiosos, perdonándoos unos a otros, como Dios también os perdonó en Cristo.'},{ref:'Colosenses 3:13',text:'Soportándoos unos a otros, y perdonándoos unos a otros si alguno tuviere queja contra otro.'},{ref:'Mateo 18:22',text:'Jesús le dijo: No te digo hasta siete, sino aun hasta setenta veces siete.'},{ref:'Lucas 23:34',text:'Y Jesús decía: Padre, perdónalos, porque no saben lo que hacen.'}],words:[{es:'perdonáis',or:'ἀφίημι (aphiēmi)',meaning:'Dejar ir, remitir, liberar. La imagen es soltar algo que sostienes. El perdón no es sentimiento sino acto: soltar la deuda que el otro tiene contigo. No necesariamente olvidar ni restablecer la confianza, sino liberar al otro de la deuda moral.',strong:'G863'},{es:'ofensas',or:'παράπτωμα (paraptōma)',meaning:'Tropiezo, caída lateral, desviación. No solo insultos sino todo acto que daña la relación. La misma palabra se usa para las transgresiones que Dios perdona.',strong:'G3900'},{es:'celestial',or:'οὐράνιος (ouranios)',meaning:'Celestial, del cielo. El Padre celestial es el estándar del perdón. La medida no es lo que me parece razonable perdonar sino la medida ilimitada de Dios.',strong:'G3770'}],questions:['Jesús conecta recibir perdón con darlo. ¿Hay alguien a quien no has perdonado? ¿Cómo afecta eso tu experiencia del perdón de Dios?','Perdonar no es olvidar ni restaurar la confianza automáticamente. ¿Cómo definirías el perdón bíblico en términos prácticos?','¿Cuánto te ha perdonado Dios? ¿Cómo cambia dimensionar eso la manera en que ves la ofensa de la persona que necesitas perdonar?']},
        'miqueas 6:8':{bigIdea:"Dios no busca ceremonias impresionantes, sino una vida de justicia, misericordia y humildad delante de Él.",exposition:["El pueblo preguntaba con qué grandes ofrendas podría agradar a Dios: ¿miles de carneros, ríos de aceite? Miqueas responde reduciendo todo a lo esencial: \"oh hombre, ya se te ha declarado lo que es bueno, y qué pide Jehová de ti\". Dios ya lo había dejado claro; no era un misterio de rituales, sino un asunto del corazón y la conducta.", "Lo que Dios pide se resume en tres cosas. \"Hacer justicia\": tratar a los demás con equidad, defender lo correcto, no aprovecharse del débil. La fe verdadera se nota en cómo tratamos a la gente.", "\"Amar misericordia\": no solo practicar la bondad, sino amarla, deleitarse en ser compasivo y fiel. Dios quiere personas cuyo corazón se incline naturalmente hacia la misericordia, no que la ejerzan a regañadientes.", "\"Humillarte ante tu Dios\": caminar humildemente con Él, en dependencia y reverencia, sin la arrogancia de creer que las ceremonias compran su favor. Estas tres cosas resumen una vida que agrada a Dios más que cualquier sacrificio externo."],application:["Examina si tu religión es más de apariencia (rituales, actividades) que de sustancia (justicia, misericordia, humildad). Dios mira lo segundo.", "Elige hoy un acto concreto en cada área: una decisión justa, un gesto de misericordia, un momento de humildad ante Dios."],prayer:"Señor, no quiero impresionarte con apariencias. Enséñame a hacer justicia, a amar la misericordia y a caminar humildemente contigo. Que mi vida, y no solo mis palabras, te agrade cada día. Amén.",tags:['justicia','humildad','instrucción'],author:'Miqueas',date:'c. 740-700 a.C.',audience:'Israel y Judá',location:'Moreset, Judá',occasion:'El capítulo 6 es un juicio judicial: Dios demanda a Israel. El versículo 8 llega después de la pregunta "¿con qué me presentaré ante Jehová?" La respuesta derrumba la religiosidad externa: Dios no quiere sacrificios de terneros ni torrentes de aceite, sino tres cosas concretas.',background:'Las tres exigencias forman un tríptico moral. "Hacer justicia" (mishpat) es acción concreta en favor del débil: actuar correctamente. "Amar misericordia" (chesed) es actitud de lealtad y amor leal: la disposición interior. "Humillarte" (tsana) con Dios es la postura espiritual que hace posibles las otras dos. Sin humildad, la justicia se convierte en legalismo y la misericordia en condescendencia.',geo:'Escrito en Moreset, ciudad pequeña de Judá, durante los reinados de Jotam, Acaz y Ezequías.',connections:[{ref:'Amós 5:24',text:'Pero corra el juicio como las aguas, y la justicia como impetuoso arroyo.'},{ref:'Isaías 1:17',text:'Aprended a hacer el bien; buscad el juicio, restituid al agraviado, haced justicia al huérfano, amparad a la viuda.'},{ref:'Mateo 23:23',text:'¡Ay de vosotros, escribas y fariseos, hipócritas! porque diezmáis la menta y el eneldo y el comino, y dejáis lo más importante de la ley: la justicia, la misericordia y la fe.'},{ref:'Lucas 10:27',text:'Amarás al Señor tu Dios con todo tu corazón, y al prójimo como a ti mismo.'}],words:[{es:'justicia',or:'מִשְׁפָּט (mishpat)',meaning:'Juicio justo, derecho, orden correcto. Implica acción: hacer lo que es recto en la relación con el prójimo, especialmente con el vulnerable. No es solo principio sino práctica concreta.',strong:'H4941'},{es:'misericordia',or:'חֶסֶד (chesed)',meaning:'Amor leal, fidelidad del pacto. No es misericordia sentimental sino lealtad comprometida que actúa aunque no se deba. Es la misma palabra usada para la misericordia de Dios en los Salmos.',strong:'H2617'},{es:'humillarte',or:'צָנַע (tsana)',meaning:'Caminar con humildad, moderación, discreción. No es ostentación ni espectáculo sino relación genuina y privada con Dios. La humildad es la raíz que hace auténtica tanto la justicia como la misericordia.',strong:'H6800'}],questions:['Las tres exigencias son: hacer justicia (acción), amar misericordia (actitud), humillarte (postura espiritual). ¿En cuál eres más fuerte? ¿En cuál más débil?','¿Hay alguien vulnerable en tu entorno inmediato —familiar, vecino, compañero— con quien puedas "hacer justicia" esta semana?','Jesús citó este tipo de exigencia contra el legalismo religioso. ¿En qué área de tu vida religiosa estás descuidando lo esencial por lo externo?']},
        'salmos 100:2':{bigIdea:"Servir a Dios no es una carga solemne y forzada: es un acto de alegría, venir ante Él con cánticos de gozo.",exposition:["Este salmo es una invitación a la adoración de todo el pueblo. En este versículo el mandato es claro y luminoso: \"servid a Jehová con alegría; venid ante su presencia con regocijo\". El servicio a Dios y la adoración se describen no como obligación pesada, sino como celebración.", "\"Con alegría\": Dios no busca siervos amargados que le rinden culto por temor o rutina, sino corazones que se gozan en Él. La alegría no es un extra opcional de la adoración; es parte de su esencia. Un Dios tan bueno merece ser servido con gozo, no con caras largas.", "\"Venid ante su presencia con regocijo\" (o con cánticos). Acercarse a Dios debería producir canto. El salmo nos recuerda que la presencia de Dios no es un lugar de temor esclavizante para su pueblo, sino de gozo, como el reencuentro con alguien profundamente amado.", "El salmo da las razones más adelante: \"Jehová es Dios... él nos hizo... para siempre es su misericordia\". La alegría en el servicio brota de conocer quién es Dios: nuestro Hacedor, nuestro Pastor, eternamente bueno."],application:["Revisa el tono de tu vida espiritual: ¿sirves a Dios por alegría o por obligación? Pídele que renueve el gozo en tu servicio.", "Trae canto a tu acercamiento a Dios. La adoración alegre no depende de que todo vaya bien, sino de recordar quién es Él."],prayer:"Señor, quiero servirte con alegría y venir a tu presencia con cánticos. Renueva mi gozo cuando el servicio se vuelva rutina. Recuérdame quién eres, para que mi adoración rebose de regocijo. Amén.",tags:['alabanza','gozo','instrucción'],author:'Desconocido',date:'Período post-mosaico, posiblemente David',audience:'Israel',location:'Culto en el templo o tabernáculo',occasion:'Uno de los salmos de acción de gracias más conocidos. El título es "Salmo de alabanza". Cada versículo es un imperativo: cantad, servid, venid, conoced, entrad, alabadle. Es una invitación al pueblo entero a la adoración.',background:'La secuencia revela la lógica de la adoración bíblica: primero reconocer quién es Dios (él nos hizo, somos suyos) y luego la respuesta (alegría, canto, acción de gracias). La alabanza no es técnica ni requisito sino respuesta natural al conocimiento de quién es Dios. "Servid con alegría" indica que el servicio sin gozo no es el modelo bíblico de adoración.',geo:'Probablemente compuesto para el culto del templo en Jerusalén.',connections:[{ref:'Salmos 95:1',text:'Venid, aclamemos alegremente a Jehová; cantemos con júbilo a la roca de nuestra salvación.'},{ref:'Filipenses 4:4',text:'Regocijaos en el Señor siempre. Otra vez digo: ¡Regocijaos!'},{ref:'Efesios 5:19',text:'Hablando entre vosotros con salmos, con himnos y cánticos espirituales, cantando y alabando al Señor en vuestros corazones.'},{ref:'Apocalipsis 4:11',text:'Señor, digno eres de recibir la gloria y la honra y el poder; porque tú creaste todas las cosas.'}],words:[{es:'alegría',or:'שִׂמְחָה (simchah)',meaning:'Alegría, gozo, regocijo expresivo. No es una sonrisa forzada sino desbordamiento interior. El salmista llama a servir con ese tipo de alegría genuina, no con cumplimiento religioso árido.',strong:'H8057'},{es:'regocijo',or:'רְנָנָה (renanah)',meaning:'Canto gozoso, gritos de júbilo. La raíz indica vocalización del gozo: no solo sentirlo sino expresarlo. La adoración bíblica no es solo interna sino externa y expresiva.',strong:'H7445'},{es:'servid',or:'עָבַד (avad)',meaning:'Servir, adorar, trabajar. Es el mismo verbo para trabajar y adorar. Servir a Dios y adorar a Dios son en hebreo el mismo acto. El trabajo bien hecho es adoración.',strong:'H5647'}],questions:['¿Hay una diferencia entre cómo alabas a Dios en la iglesia y cómo lo haces en casa o en el trabajo? ¿Por qué?','"Servid con alegría" implica que es posible servir sin alegría. ¿Cuándo fue la última vez que tu servicio a Dios fue genuinamente gozoso?','¿Qué conocimiento de quién es Dios te produciría más alabanza natural en tu vida diaria?']},
        'genesis 2:24':{bigIdea:"El matrimonio, según su diseño original, es dejar, unirse y volverse una sola carne: un pacto de unidad profunda.",exposition:["Tras crear a la mujer, Dios establece el fundamento del matrimonio, y Jesús mismo lo citaría siglos después como la norma permanente. \"Dejará el hombre a su padre y a su madre, y se unirá a su mujer, y serán una sola carne\". Tres movimientos definen el pacto matrimonial.", "\"Dejará\": el matrimonio implica una nueva prioridad. Sin cortar el amor a los padres, se forma una nueva unidad familiar que tiene precedencia. Se deja una lealtad anterior para establecer una nueva y primaria.", "\"Se unirá\" (o se allegará): la palabra hebrea implica pegarse, adherirse firmemente, con lealtad y permanencia. No es una unión frágil sujeta al capricho, sino un compromiso que se aferra. El matrimonio es pacto, no contrato desechable.", "\"Serán una sola carne\": una unidad total —física, emocional, espiritual— donde dos vidas se entretejen en una. Refleja algo del misterio de la unión de Cristo con su iglesia. Este diseño, dado en el principio, sigue siendo el modelo bueno de Dios para el matrimonio."],application:["Si estás casado, examina las tres partes: ¿has \"dejado\" bien?, ¿te \"unes\" con lealtad?, ¿cultivas la \"una sola carne\" en todas las dimensiones?", "Trata el matrimonio como el pacto permanente que Dios diseñó, no como un arreglo condicional. La permanencia es parte de su bondad, no de su carga."],prayer:"Señor, gracias por el regalo del matrimonio según tu diseño. Enséñanos a dejar, unirnos y ser una sola carne con lealtad y amor. Que nuestras uniones reflejen la fidelidad de Cristo por su iglesia. Amén.",tags:['matrimonio','familia','instrucción'],author:'Moisés',date:'c. 1400 a.C. (compilación)',audience:'Israel',location:'Sinaí o las llanuras de Moab',occasion:'Después de la creación de la mujer a partir del hombre, el narrador inserta este principio teológico sobre el matrimonio. Jesús lo cita en Mateo 19 como la base del diseño de Dios para la unión conyugal.',background:'El versículo establece el patrón del matrimonio antes de la caída: es un diseño de Dios, no una construcción cultural. "Dejar" implica una nueva lealtad primaria. "Unirse" es la adherencia permanente y total. "Una sola carne" es la unión más profunda posible: física, emocional, espiritual. El orden importa: primero dejar, luego unirse, luego una sola carne.',geo:'El Jardín de Edén; principio teológico universal desde la creación.',connections:[{ref:'Mateo 19:5',text:'Por esto el hombre dejará padre y madre, y se unirá a su mujer, y los dos serán una sola carne.'},{ref:'Efesios 5:31',text:'Por esto dejará el hombre a su padre y a su madre, y se unirá a su mujer, y los dos serán una sola carne.'},{ref:'Proverbios 18:22',text:'El que halla esposa halla el bien, y alcanza la benevolencia de Jehová.'},{ref:'1 Corintios 7:3',text:'El marido cumpla con la mujer el deber conyugal, y asimismo la mujer con el marido.'}],words:[{es:'dejará',or:'עָזַב (azab)',meaning:'Abandonar, dejar atrás. No significa dejar de amar a los padres sino establecer una nueva lealtad primaria. El matrimonio crea un nuevo núcleo que tiene precedencia sobre la familia de origen.',strong:'H5800'},{es:'unirá',or:'דָּבַק (dabaq)',meaning:'Adherirse, pegarse, permanecer junto a. La imagen es pegamento: unión que no se separa fácilmente. La misma raíz se usa para describir la devoción de Rut a Noemí y la del creyente a Dios.',strong:'H1692'},{es:'una sola carne',or:'בָּשָׂר אֶחָד (basar echad)',meaning:'Una carne unificada. La más profunda unidad posible entre dos personas. No solo cuerpos sino vidas, memorias, propósitos. Jesús añade: "lo que Dios juntó, no lo separe el hombre."',strong:'H1320'}],questions:['Primero "dejar", luego "unirse". ¿Hay lealtades del pasado (familia de origen, hábitos, identidades previas) que no has dejado completamente y que afectan tu matrimonio?','¿Qué significa "una sola carne" en términos prácticos en tu relación: no solo físicamente sino emocionalmente y espiritualmente?','Este versículo describe el diseño original de Dios. Si tu matrimonio no está ahí, ¿qué pasos concretos podrías dar para acercarte a ese diseño?']},
        'juan 14:16':{bigIdea:"Jesús no dejó huérfanos a los suyos: pidió al Padre otro Consolador que permanece para siempre con nosotros.",exposition:["La noche antes de la cruz, Jesús consuela a discípulos que temían quedarse solos. Promete: \"yo rogaré al Padre, y os dará otro Consolador, para que esté con vosotros para siempre\". La partida física de Jesús no significaría abandono, sino la llegada del Espíritu Santo.", "La palabra \"otro\" es significativa: en griego, \"otro de la misma clase\". El Espíritu no es un sustituto inferior de Jesús, sino Dios mismo presente en el creyente, con la misma naturaleza. Lo que Jesús fue para los discípulos a su lado, el Espíritu lo es dentro de nosotros.", "\"Consolador\" (Paracleto) significa el que es llamado a nuestro lado para ayudar: consuela, aconseja, defiende, fortalece. No es una fuerza impersonal, sino una Persona que acompaña en cada necesidad del alma.", "\"Para que esté con vosotros para siempre\". A diferencia de la presencia física de Jesús, limitada a un lugar y un tiempo, el Espíritu permanece sin interrupción y para siempre. El creyente nunca está solo: Dios habita en él de forma permanente."],application:["Cuando te sientas solo, recuerda la promesa: tienes al Consolador contigo para siempre. No es un sentimiento pasajero, es una presencia permanente.", "Aprende a depender del Espíritu Santo como Ayudador real: pídele consuelo, dirección y fuerza en las decisiones y luchas de cada día."],prayer:"Padre, gracias por darme otro Consolador, tu Espíritu Santo, que permanece conmigo para siempre. Que aprenda a reconocer su presencia y a depender de su ayuda. Nunca estoy solo, porque Tú vives en mí. Amén.",tags:['espíritu santo','promesa','consuelo'],author:'Juan el apóstol',date:'c. 85-90 d.C.',audience:'Los doce discípulos en el Aposento Alto',location:'Jerusalén',occasion:'La misma noche del Aposento Alto. Jesús está hablando de su partida y los discípulos están angustiados. La promesa del Espíritu Santo (el Paráclito) es la respuesta de Jesús a esa angustia: no los dejará solos sino que enviará a Otro que estará con ellos para siempre.',background:'"Otro Consolador" es crucial: Jesús ha sido su Paráclito visible; el Espíritu Santo será el Paráclito invisible pero permanente. "Para siempre" contrasta con la presencia física de Jesús, que era temporaria. El Espíritu no viene de visita; viene para quedarse. La resurrección de Jesús fue la condición para que el Espíritu fuera enviado.',geo:'El Aposento Alto en Jerusalén.',connections:[{ref:'Juan 16:7',text:'Pero yo os digo la verdad: Os conviene que yo me vaya; porque si no me fuese, el Consolador no vendría a vosotros.'},{ref:'Hechos 2:4',text:'Y fueron todos llenos del Espíritu Santo, y comenzaron a hablar en otras lenguas, según el Espíritu les daba que hablasen.'},{ref:'Romanos 8:26',text:'El Espíritu mismo intercede por nosotros con gemidos indecibles.'},{ref:'1 Corintios 3:16',text:'¿No sabéis que sois templo de Dios, y que el Espíritu de Dios mora en vosotros?'}],words:[{es:'Consolador',or:'Παράκλητος (Paraklētos)',meaning:'El llamado al lado de alguien. Abogado defensor, ayudador, intercesor, consejero. En los tribunales griegos, el Paráclito era quien hablaba en tu favor. Jesús llama al Espíritu con este nombre: alguien que viene a tu lado para ayudarte.',strong:'G3875'},{es:'Otro',or:'ἄλλος (allos)',meaning:'Otro del mismo tipo. No "heteros" (diferente) sino "allos" (idéntico en naturaleza). El Espíritu no es sustituto menor de Jesús sino Otro de la misma clase divina.',strong:'G243'},{es:'para siempre',or:'εἰς τὸν αἰῶνα (eis ton aiōna)',meaning:'Para el siglo, eternamente, sin fin. La presencia del Espíritu no tiene fecha de expiración. A diferencia de la presencia física de Jesús, que terminó, la del Espíritu es permanente.',strong:'G165'}],questions:['Jesús prometió "Otro Consolador" cuando Él se fuera. ¿Cómo experimentas la presencia del Espíritu Santo en tu vida diaria, o es algo más teórico que real para ti?','"Para siempre" contrasta con la temporalidad de las presencias humanas. ¿Cómo cambia tu vida saber que el Espíritu Santo nunca se va?','El Espíritu fue enviado después de la resurrección y ascensión de Jesús. ¿Qué significa que ahora tenemos algo mejor que la presencia física de Jesús según Juan 16:7?']},
        'romanos 8:26':{bigIdea:"Cuando no sabemos ni cómo orar, el Espíritu mismo intercede por nosotros con gemidos que Dios entiende.",exposition:["Pablo reconoce una realidad de la vida cristiana que muchos callan: \"no sabemos lo que hemos de pedir como conviene\". Hay momentos de dolor y confusión en que ni siquiera encontramos las palabras. Lejos de reprocharlo, Pablo muestra el remedio: no estamos solos en nuestra debilidad para orar.", "\"El Espíritu nos ayuda en nuestra debilidad\". El mismo Espíritu que habita en el creyente se involucra en su oración. La palabra griega sugiere que carga el peso junto a nosotros, como quien ayuda a levantar una carga demasiado grande.", "\"El Espíritu mismo intercede por nosotros con gemidos indecibles\". Cuando nuestras palabras se acaban, la oración no se detiene: el Espíritu traduce ante Dios lo que ni siquiera sabemos expresar. Esos gemidos, que no caben en palabras humanas, llegan perfectamente al Padre.", "El versículo siguiente completa el consuelo: Dios, que escudriña los corazones, sabe cuál es la intención del Espíritu, porque intercede conforme a la voluntad de Dios. Nuestra oración imperfecta es perfeccionada por el Espíritu. Nunca oramos solos."],application:["Cuando no sepas qué pedir ni cómo, no dejes de orar. Preséntate ante Dios aunque solo tengas gemidos; el Espíritu los lleva y los traduce.", "Descansa en que tus oraciones débiles son sostenidas por el Espíritu. No dependen de tu elocuencia, sino de su intercesión perfecta."],prayer:"Espíritu Santo, gracias porque me ayudas en mi debilidad. Cuando no sé qué pedir, Tú intercedes por mí con gemidos que el Padre entiende. Ora en mí y por mí, conforme a la voluntad de Dios. Amén.",tags:['oración','espíritu santo','consuelo'],author:'Apóstol Pablo',date:'c. 57 d.C.',audience:'Iglesia en Roma',location:'Corinto',occasion:'Pablo desarrolla la vida en el Espíritu (cap. 8). Después de hablar de la esperanza de la gloria futura y el gemido de la creación, llega a la oración: incluso cuando no sabemos qué pedir, el Espíritu intercede.',background:'El versículo aborda uno de los problemas más honestos de la oración: no saber qué pedir. Los "gemidos indecibles" no son glossolalia necesariamente sino la intercesión del Espíritu que va más allá del lenguaje humano. El creyente no tiene que tener todo articulado; el Espíritu completa lo que no puede expresarse.',geo:'Escrito desde Corinto.',connections:[{ref:'Juan 14:16',text:'Y yo rogaré al Padre, y os dará otro Consolador, para que esté con vosotros para siempre.'},{ref:'Hebreos 7:25',text:'Por lo cual puede también salvar perpetuamente a los que por él se acercan a Dios, viviendo siempre para interceder por ellos.'},{ref:'1 Juan 5:14',text:'Y esta es la confianza que tenemos en él, que si pedimos alguna cosa conforme a su voluntad, él nos oye.'},{ref:'Filipenses 4:6',text:'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego.'}],words:[{es:'ayuda',or:'συναντιλαμβάνω (synantilambanō)',meaning:'Tomar junto con, llevar la carga del otro lado. La imagen es dos personas cargando algo pesado: el Espíritu toma el otro extremo de la carga de la oración cuando nosotros no podemos cargarla solos.',strong:'G4878'},{es:'debilidad',or:'ἀσθένεια (astheneia)',meaning:'Debilidad, fragilidad, incapacidad. No solo incapacidad física sino limitación en el conocimiento y el lenguaje para orar bien. Pablo reconoce una debilidad estructural en la oración humana.',strong:'G769'},{es:'gemidos indecibles',or:'στεναγμοῖς ἀλαλήτοις (stenagmois alalētois)',meaning:'Gemidos que no pueden articularse con palabras. El Espíritu intercede más profundamente que el lenguaje. La oración más profunda no siempre se expresa con palabras sino con presencia y deseo.',strong:'G4726'}],questions:['¿Hay una situación en tu vida donde no sabes qué pedirle a Dios? ¿Cómo cambia saber que el Espíritu intercede exactamente allí?','Pablo llama a la incapacidad de orar bien "debilidad", no fracaso. ¿Cómo cambia eso la manera en que juzgas tu vida de oración?','La intercesión del Espíritu es "conforme a la voluntad de Dios" (v.27). ¿Cómo te da eso paz aunque no siempre entiendas la respuesta a tus oraciones?']},
        'marcos 16:15':{bigIdea:"El evangelio no es para guardarlo: Jesús envía a los suyos al mundo entero a anunciar las buenas nuevas.",exposition:["Estas son de las últimas palabras de Jesús resucitado antes de ascender. Habiendo vencido la muerte, comisiona a sus discípulos: \"id por todo el mundo y predicad el evangelio a toda criatura\". La resurrección no es el final de la historia, sino el arranque de una misión.", "\"Id\": la fe cristiana es enviada, centrífuga, en movimiento hacia afuera. No es un tesoro para acumular en privado, sino una noticia para difundir. El discípulo que recibe el evangelio se convierte en portador del evangelio.", "\"Por todo el mundo... a toda criatura\": el alcance no tiene fronteras. Ningún pueblo, cultura o persona queda fuera del encargo. La salvación que Cristo compró con su muerte y resurrección es para todos, y por eso el anuncio debe llegar a todos.", "\"El evangelio\" —las buenas nuevas— es el contenido: que Cristo murió por los pecadores, resucitó y ofrece perdón y vida a quien crea. Anunciar esto es el privilegio y la responsabilidad de la iglesia en cada generación, incluida la nuestra."],application:["El evangelio que recibiste no es solo para ti. ¿A quién en tu círculo Dios te está llamando a compartirle las buenas nuevas?", "No necesitas cruzar el mundo para obedecer: empieza por \"tu mundo\", las personas que Dios ya puso a tu alcance."],prayer:"Señor Jesús, resucitado y vivo, gracias por confiarme el evangelio. Dame amor por los que no te conocen y valentía para anunciar tus buenas nuevas. Envíame a mi mundo a hablar de Ti. Amén.",tags:['evangelismo','misión','instrucción'],author:'Marcos',date:'c. 65-70 d.C.',audience:'Los once discípulos',location:'Galilea',occasion:'La Gran Comisión de Marcos: las últimas palabras del Jesús resucitado a sus discípulos. Les encomienda ir a todo el mundo a proclamar el evangelio. La resurrección es el fundamento: el que envía venció la muerte.',background:'El verbo "id" en el original es participio (mientras vais, yendo) lo que sugiere que la misión no es ir a un lugar especial sino proclamar el evangelio en el ir de la vida cotidiana. "Toda criatura" no deja a nadie fuera. La comisión no es opcional ni para especialistas sino para todo creyente en el curso de su vida.',geo:'Galilea, después de la resurrección.',connections:[{ref:'Mateo 28:19',text:'Por tanto, id, y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo.'},{ref:'Romanos 1:16',text:'Porque no me avergüenzo del evangelio, porque es poder de Dios para salvación a todo aquel que cree.'},{ref:'Hechos 1:8',text:'Pero recibiréis poder, cuando haya venido sobre vosotros el Espíritu Santo, y me seréis testigos.'},{ref:'1 Pedro 3:15',text:'Estad siempre preparados para presentar defensa con mansedumbre y reverencia ante todo el que os demande razón de la esperanza que hay en vosotros.'}],words:[{es:'id',or:'πορευθέντες (poreuthentes)',meaning:'Yendo, mientras vais. Participio, no imperativo independiente. La misión ocurre en el movimiento normal de la vida, no solo en viajes misioneros especiales.',strong:'G4198'},{es:'predicad',or:'κηρύξατε (kēryxate)',meaning:'Proclamad como heraldo. Un kēryx era el mensajero oficial que proclamaba las noticias del rey. El creyente proclama las noticias del Rey resucitado.',strong:'G2784'},{es:'evangelio',or:'εὐαγγέλιον (euangelion)',meaning:'Buena noticia, evangelio. Literalmente "eu" (buena) + "angelia" (noticia). La noticia más buena que existe: Cristo murió por los pecados, resucitó al tercer día, y todo el que crea en Él tiene vida eterna.',strong:'G2098'}],questions:['El mandato es para "toda criatura". ¿Hay personas en tu círculo inmediato que aún no han escuchado el evangelio claramente?','El "id" del griego es participio: "mientras vais". ¿Cómo cambia eso la misión de una actividad especial a un estilo de vida?','¿Hay algo que te impide compartir tu fe con otros? ¿Vergüenza, miedo al rechazo, falta de palabras? ¿Cómo responde a eso Hechos 1:8?']},
        'proverbios 22:6':{bigIdea:"La formación temprana marca el rumbo de una vida: instruir al niño en el camino correcto deja una huella duradera.",exposition:["Este proverbio es un principio de sabiduría sobre la crianza: \"instruye al niño en su camino, y aun cuando fuere viejo no se apartará de él\". La niñez es tierra fértil; lo que se siembra temprano echa raíces profundas que perduran.", "\"Instruye\" implica dedicación intencional: enseñar, modelar, guiar con constancia. No se trata de dejar que el niño se forme solo, sino de encaminarlo activamente en el camino de Dios. La formación espiritual no ocurre por accidente.", "\"En su camino\" puede entenderse también como conforme a la etapa y el carácter del niño: instruir con sabiduría, adaptándose a quién es, no imponiendo un molde rígido. La buena formación conoce al niño y lo dirige hacia Dios respetando su singularidad.", "Como todo proverbio, es un principio general, no una garantía mecánica: describe la tendencia sabia, no una fórmula infalible. Pero anima a padres y educadores a tomar en serio la enorme influencia de la formación temprana, confiando la cosecha a Dios."],application:["Si tienes hijos o influyes en niños, aprovecha esos años formativos: lo que siembras hoy en fe y carácter deja huella para toda la vida.", "Instruir no es solo hablar, es modelar. Los niños aprenden el camino de Dios más por lo que ven en ti que por lo que les dices."],prayer:"Señor, dame sabiduría para instruir a los niños que pones en mi vida en tu camino. Que siembre fe, carácter y amor a Ti en sus años tempranos, y confío a Ti la cosecha de esa siembra. Amén.",tags:['familia','instrucción','promesa'],author:'Salomón',date:'c. 950-900 a.C.',audience:'Israel',location:'Jerusalén',occasion:'Parte de la primera colección principal de Proverbios (10:1–22:16). Los proverbios de Salomón cubren ética práctica, familia, trabajo y carácter. Este versículo es uno de los más citados en contextos de crianza.',background:'La frase "en su camino" es clave: no el camino de los padres sino el del hijo, su disposición particular, sus talentos y carácter únicos. La educación bíblica no es molde uniforme sino formación que respeta y desarrolla la individualidad que Dios puso en cada hijo. La promesa "no se apartará de él" apunta a una tendencia general, no a una garantía mecánica.',geo:'Jerusalén, corte de Salomón.',connections:[{ref:'Deuteronomio 6:6',text:'Y estas palabras que yo te mando hoy, estarán sobre tu corazón; y las repetirás a tus hijos.'},{ref:'Efesios 6:4',text:'Y vosotros, padres, no provoquéis a ira a vuestros hijos, sino criadlos en disciplina y amonestación del Señor.'},{ref:'Salmos 127:3',text:'He aquí, herencia de Jehová son los hijos; cosa de estima el fruto del vientre.'},{ref:'2 Timoteo 3:15',text:'Y que desde la niñez has sabido las Sagradas Escrituras, las cuales te pueden hacer sabio para la salvación.'}],words:[{es:'instruye',or:'חָנַךְ (chanak)',meaning:'Iniciar, dedicar, entrenar. La raíz incluye la idea de crear el gusto por algo, como una nodriza que pone dulce en los labios de un bebé para que comience a querer comer. Instruir es crear amor por el camino correcto.',strong:'H2596'},{es:'camino',or:'דֶּרֶךְ (derek)',meaning:'Camino, manera, modo de vida. "En su camino" sugiere la orientación particular del niño: sus capacidades, inclinaciones, temperamento dados por Dios.',strong:'H1870'},{es:'apartará',or:'סוּר (sur)',meaning:'Desviarse, apartarse. La promesa es que la educación correcta crea una dirección que persiste. No una garantía mecánica sino una tendencia profunda del carácter.',strong:'H5493'}],questions:['La instrucción es "en su camino", el camino del hijo, no del padre. ¿Cómo te esfuerzas por conocer y respetar la individualidad única que Dios puso en los tuyos?','¿Qué estás "instruyendo" en casa por cómo vives, más allá de lo que dices con palabras?','¿Hay promesas de Dios relacionadas con tus hijos que llevas en oración? ¿Cómo te sostiene este versículo en la espera?']},
        'efesios 6:10':{bigIdea:"La fuerza para la batalla espiritual no se saca de uno mismo, sino del poder de la fuerza del Señor.",exposition:["Pablo introduce su enseñanza sobre la armadura de Dios con un llamado fundamental: \"fortaleceos en el Señor, y en el poder de su fuerza\". Antes de describir cualquier arma, señala la fuente de toda victoria: no nuestras capacidades, sino el poder de Dios.", "\"Fortaleceos en el Señor\": el verbo está en una forma que implica \"sean fortalecidos\", es decir, dejarse fortalecer por Otro. No es un mandato a apretar los dientes y esforzarse más, sino a recibir fuerza de Dios. La fortaleza cristiana es prestada, no propia.", "\"En el poder de su fuerza\": Pablo acumula palabras de poder para dejar claro de qué recursos hablamos. Es la misma potencia con que Dios levantó a Cristo de los muertos (Efesios 1). No enfrentamos la batalla espiritual con energías humanas, sino con poder de resurrección.", "El contexto es la lucha contra fuerzas espirituales de maldad. Reconocer que la pelea es real y superior a nuestras fuerzas nos lleva a la única estrategia sensata: revestirnos del poder de Dios, no confiar en el nuestro."],application:["Ante la tentación o la lucha espiritual, deja de confiar en tu fuerza de voluntad. Pide ser fortalecido en el Señor y en el poder de su fuerza.", "Recuerda de qué poder dispones: el mismo que resucitó a Cristo. La batalla no se pelea desde la debilidad, sino desde la victoria de Dios."],prayer:"Señor, fortaléceme en Ti y en el poder de tu fuerza. Reconozco que no puedo con la batalla espiritual por mis medios. Revísteme de tu poder de resurrección para mantenerme firme. Amén.",tags:['fortaleza','identidad','instrucción'],author:'Apóstol Pablo',date:'c. 60-62 d.C.',audience:'Iglesia en Éfeso',location:'Roma, desde la prisión',occasion:'El versículo abre la sección final de la carta (6:10-20), el pasaje de la "armadura de Dios". Pablo acaba de hablar de relaciones familiares y laborales. Ahora eleva la mirada: detrás de todas las luchas humanas hay una guerra espiritual.',background:'La fortaleza que Pablo exige no se produce: se recibe. "Fortaleceos EN el Señor" indica que la fuente es externa al creyente. La armadura que sigue no es técnica de autodefensa sino identificación con lo que Dios ya proveyó en Cristo. El creyente no enfrenta la batalla por su cuenta; se viste de Alguien más fuerte.',geo:'Escrito desde la prisión en Roma, enviado a Éfeso.',connections:[{ref:'Isaías 40:31',text:'Pero los que esperan en Jehová tendrán nuevas fuerzas; levantarán alas como las águilas.'},{ref:'Filipenses 4:13',text:'Todo lo puedo en Cristo que me fortalece.'},{ref:'Josué 1:9',text:'¿No te lo he mandado yo? Esfuérzate y sé valiente; no temas ni desmayes.'},{ref:'Romanos 8:37',text:'Antes, en todas estas cosas somos más que vencedores por medio de aquel que nos amó.'}],words:[{es:'fortaleceos',or:'ἐνδυναμόω (endynamoō)',meaning:'Ser fortalecido, recibir poder. Pasiva: la acción viene de afuera. No te fortaleces a ti mismo; recibes la fortaleza del Señor. La raíz es dynamis, el poder activo de Dios.',strong:'G1743'},{es:'en el Señor',or:'ἐν κυρίῳ (en kyriō)',meaning:'En el Señor, unido al Señor. La preposición "en" indica posición de unión. No es fortaleza al lado del Señor sino fortaleza que viene de estar dentro de Él, en relación.',strong:'G2962'},{es:'potencia',or:'κράτος (kratos)',meaning:'Fuerza dominante, poder que no puede ser superado. Es el mismo término que describe la fuerza que resucitó a Cristo. El creyente tiene acceso a ese poder.',strong:'G2904'}],questions:['Pablo dice "fortaleceos EN el Señor", no por vuestro propio esfuerzo. ¿En qué batallas estás intentando ganar con tus propias fuerzas?','La armadura de Dios no se elabora; se viste. ¿Qué significa para ti "vestir" hoy la fortaleza que Dios ya proveyó?','¿Hay una batalla espiritual específica en tu vida ahora mismo que has estado enfrentando solo? ¿Cómo cambia esto?']},
        'filipenses 1:6':{bigIdea:"La obra que Dios comienza, Dios la termina: nuestra seguridad no descansa en nuestra constancia, sino en su fidelidad.",exposition:["Pablo expresa una confianza serena sobre los creyentes: \"el que comenzó en vosotros la buena obra, la perfeccionará hasta el día de Jesucristo\". La vida cristiana no es un proyecto que nosotros iniciamos y debemos sostener; es una obra que Dios empezó y se compromete a completar.", "\"El que comenzó\": la iniciativa fue de Dios. No fuimos nosotros quienes despertamos a Dios con nuestra bondad; Él comenzó la buena obra de la salvación en nosotros por pura gracia. Y quien empieza una obra por gracia no la abandona a mitad de camino.", "\"La perfeccionará\": Dios no deja obras inconclusas. Como un buen artesano que termina lo que empieza, Él llevará a su culminación el proceso de hacernos como Cristo. Nuestros tropiezos no cancelan su compromiso; Él es fiel aunque nosotros vacilemos.", "\"Hasta el día de Jesucristo\": el plazo llega hasta el regreso de Cristo, cuando la obra estará completa. Mientras tanto, podemos descansar: nuestra perseverancia final no depende de nuestra fuerza, sino de la fidelidad del que comenzó."],application:["Si te desanimas por tu lento crecimiento espiritual, recuerda: Dios comenzó la obra y Él la terminará. No depende solo de ti.", "Descansa en la fidelidad de Dios, no en tu constancia. Él no abandona lo que empieza; se compromete a completarte hasta el fin."],prayer:"Señor, gracias porque Tú comenzaste la buena obra en mí y prometes completarla. Cuando dude por mis fallas, recuérdame que mi seguridad está en tu fidelidad, no en mis fuerzas. Termina en mí tu obra. Amén.",tags:['crecimiento','promesa','fe'],author:'Apóstol Pablo',date:'c. 61-62 d.C.',audience:'Iglesia en Filipos',location:'Roma, desde la prisión',occasion:'Pablo escribe desde la cárcel con inusual gozo. El versículo 6 forma parte de su oración de acción de gracias por los filipenses. Aunque está encadenado, está seguro de algo: la obra que Dios comenzó no depende de las circunstancias externas sino de la fidelidad de Dios.',background:'"El que comenzó" indica que Dios tomó la iniciativa. "La perfeccionará" (epitelesō) es futuro de certeza: no probabilidad sino promesa. El "día de Jesucristo" es el horizonte final. Dios es el autor, sostenedor y completador de la fe. El creyente no se forma a sí mismo: es formado por Dios.',geo:'Escrito desde la prisión en Roma, enviado a Filipos (Macedonia, actual Grecia).',connections:[{ref:'Juan 15:5',text:'Yo soy la vid, vosotros los pámpanos; el que permanece en mí, y yo en él, éste lleva mucho fruto; porque separados de mí nada podéis hacer.'},{ref:'2 Pedro 3:18',text:'Antes bien, creced en la gracia y el conocimiento de nuestro Señor y Salvador Jesucristo.'},{ref:'Hebreos 12:2',text:'Puestos los ojos en Jesús, el autor y consumador de la fe.'},{ref:'Salmos 138:8',text:'Jehová cumplirá su propósito en mí; tu misericordia, oh Jehová, es para siempre.'}],words:[{es:'comenzó',or:'ἐνάρχομαι (enarchomai)',meaning:'Comenzar, iniciar formalmente. La voz activa pone a Dios como sujeto: Él es quien tomó la iniciativa de la salvación y la transformación. No fue el creyente quien la inició.',strong:'G1728'},{es:'perfeccionará',or:'ἐπιτελέω (epiteleō)',meaning:'Completar, llevar a su fin. Lo que Dios comienza, Dios lo termina: no lo abandona a medias. Es el mismo verbo para terminar una obra de construcción o completar un ritual.',strong:'G2005'},{es:'buena obra',or:'ἔργον ἀγαθόν (ergon agathon)',meaning:'Trabajo bueno, obra noble. No solo la conversión inicial sino el proceso entero de santificación y crecimiento espiritual. Dios no solo perdona; transforma.',strong:'G2041'}],questions:['Dios comenzó la obra en ti, lo que significa que no dependió de que tú lo buscaras. ¿Cómo cambia eso tu gratitud hacia Él?','¿Hay áreas de tu vida donde sientes que no estás creciendo espiritualmente? ¿Qué te dice este versículo sobre quién sostiene ese crecimiento?','El versículo habla del "día de Jesucristo" como horizonte final. ¿Cómo cambia ese horizonte eterno la manera en que evalúas tu crecimiento espiritual hoy?']},
        'hebreos 10:24':{bigIdea:"La fe no es un asunto solitario: estamos llamados a pensar en los demás para estimularnos al amor y a las buenas obras.",exposition:["El autor da una instrucción sorprendentemente activa: \"considerémonos unos a otros para estimularnos al amor y a las buenas obras\". La palabra \"considerémonos\" implica prestar atención, fijarse en el otro deliberadamente. La vida cristiana incluye una responsabilidad mutua: mirar por el crecimiento de los demás, no solo por el propio.", "\"Para estimularnos\": el término griego es fuerte, sugiere provocar, incitar. En otros contextos se usa negativamente (provocar a ira); aquí se redime: provoquémonos, incitémonos, pero al amor y a las buenas obras. Debemos ser una influencia que empuja al hermano hacia lo bueno.", "\"Al amor y a las buenas obras\": el objetivo de esta atención mutua es concreto. No se trata solo de sentirnos bien juntos, sino de espolearnos a amar más y a hacer el bien. La comunidad cristiana existe para hacernos mejores discípulos, no solo para acompañarnos.", "El versículo siguiente advierte contra abandonar la congregación. La fe crece en comunidad; aislados nos enfriamos. Nos necesitamos unos a otros para no desmayar y para arder en amor."],application:["¿A quién estás \"considerando\" para estimularlo al bien? Elige a alguien y anímalo activamente hacia el amor y las buenas obras esta semana.", "No vivas tu fe en aislamiento. Busca y valora la comunidad cristiana: es el lugar donde Dios diseñó que crezcamos y nos sostengamos."],prayer:"Señor, líbrame de una fe solitaria. Enséñame a considerar a los demás para animarlos al amor y a las buenas obras, y dame hermanos que hagan lo mismo por mí. Que juntos crezcamos en Ti. Amén.",tags:['comunidad','amor','instrucción'],author:'Desconocido (posiblemente Pablo, Apolos o Bernabé)',date:'c. 64-68 d.C.',audience:'Judeocristianos tentados a abandonar la fe',location:'Roma o Palestina',occasion:'El capítulo 10 culmina una larga exposición sobre la superioridad del sacrificio de Cristo. En ese contexto de "ya tenemos acceso perfecto a Dios", el autor da instrucciones prácticas: no abandonar la comunidad, estimularse mutuamente al amor y a las buenas obras.',background:'El verbo "considerémonos" (katanoeō) implica observación cuidadosa y atención deliberada. No es relación casual sino atención intencional. La comunidad no es opcional ni decorativa: es el entorno donde el amor y las buenas obras se desarrollan. El versículo siguiente (10:25) prohíbe explícitamente dejar de reunirse.',geo:'Carta enviada a judeocristianos en Roma o Palestina que consideraban regresar al judaísmo por la persecución.',connections:[{ref:'Romanos 12:10',text:'Amaos los unos a los otros con amor fraternal; en cuanto a honra, prefiriéndoos los unos a los otros.'},{ref:'Gálatas 6:2',text:'Sobrellevad los unos las cargas de los otros, y cumplid así la ley de Cristo.'},{ref:'Hechos 2:42',text:'Y perseveraban en la doctrina de los apóstoles, en la comunión unos con otros, en el partimiento del pan y en las oraciones.'},{ref:'Proverbios 27:17',text:'El hierro con hierro se afila; y así el hombre aguza el rostro de su amigo.'}],words:[{es:'considerémonos',or:'κατανοέω (katanoeō)',meaning:'Observar con atención cuidadosa, notar con intención. No es mirada superficial sino atención focalizada en la otra persona. La raíz "kata" refuerza la intensidad: considerar profundamente.',strong:'G2657'},{es:'estimularnos',or:'παροξυσμός (paroxysmos)',meaning:'Incitación, estímulo fuerte. La misma palabra del "entredicho" entre Pablo y Bernabé (Hechos 15:39). No es un suave empuje sino una estimulación enérgica hacia lo bueno.',strong:'G3948'},{es:'amor',or:'ἀγάπη (agapē)',meaning:'Amor incondicional, sacrificial. El primer resultado de la estimulación mutua es el amor ágape: no solo sentimientos sino acciones deliberadas de bien hacia el prójimo.',strong:'G26'}],questions:['¿Eres deliberadamente "considerado" hacia otros creyentes, o tus relaciones en la iglesia son más pasivas y casuales?','¿Hay alguien en tu comunidad de fe que necesita ser estimulado hacia el amor y las buenas obras? ¿Cómo podrías ser esa influencia esta semana?','El versículo siguiente (10:25) conecta esto con reunirse regularmente. ¿Cómo ha sido tu participación en comunidad últimamente?']},
        '2 corintios 5:17':{bigIdea:"Estar en Cristo no es una mejora del viejo yo, sino una nueva creación: lo viejo pasó, todo es hecho nuevo.",exposition:["Pablo hace una declaración radical sobre lo que significa ser cristiano: \"si alguno está en Cristo, nueva criatura es\". La palabra griega para criatura es la misma de creación. No es que Dios remiende al viejo hombre; crea algo nuevo, como cuando llamó a la existencia el mundo. La conversión es un acto creador de Dios.", "\"En Cristo\": esta es la clave. La novedad no viene de nuestro esfuerzo por cambiar, sino de estar unidos a Cristo. Fuera de Él seguimos siendo la vieja creación; en Él, participamos de una vida nueva, la vida de resurrección.", "\"Las cosas viejas pasaron\": el pasado que condena, la vieja identidad, el viejo dominio del pecado, ya no tienen la última palabra. No significa que dejemos de luchar, pero sí que hemos sido trasladados a una realidad nueva. Ya no somos definidos por lo que fuimos.", "\"He aquí todas son hechas nuevas\": Pablo casi grita de asombro (\"he aquí\"). Es una noticia demasiado buena para decirla sin entusiasmo. En Cristo, Dios te da un comienzo genuinamente nuevo, no una segunda oportunidad frágil, sino una nueva creación."],application:["Si estás en Cristo, deja de definirte por tu pasado o tus fracasos. Dios te ve como nueva creación; aprende a verte así también.", "La novedad no se logra a fuerza de voluntad, sino permaneciendo en Cristo. Vive conectado a Él, la fuente de tu vida nueva."],prayer:"Señor, gracias porque en Cristo soy una nueva creación. Las cosas viejas pasaron y todo es hecho nuevo. Ayúdame a vivir según esa nueva identidad y no atado a mi pasado. Renueva cada día tu obra en mí. Amén.",tags:['nuevo comienzo','transformación','identidad'],author:'Apóstol Pablo',date:'c. 55-57 d.C.',audience:'Iglesia en Corinto',location:'Macedonia',occasion:'Pablo defiende su ministerio explicando su motivación: el amor de Cristo le constriñe. En ese contexto hace una de las declaraciones más radicales sobre la identidad del creyente: en Cristo, todo es nuevo.',background:'"Nueva criatura" o "nueva creación" (ktisis) usa el mismo vocabulario que la creación en Génesis. Convertirse en cristiano no es mejorar la vieja versión: es ser creado de nuevo. "Las cosas viejas pasaron" es un aoristo que indica un evento completo y definitivo. "He aquí todas son hechas nuevas" es una exclamación de asombro, no una descripción gradual.',geo:'Escrito desde Macedonia (posiblemente Filipos o Tesalónica) durante el tercer viaje misionero de Pablo.',connections:[{ref:'Romanos 6:4',text:'Porque somos sepultados juntamente con él para muerte por el bautismo, a fin de que como Cristo resucitó de los muertos por la gloria del Padre, así también nosotros andemos en vida nueva.'},{ref:'Gálatas 2:20',text:'Con Cristo estoy juntamente crucificado, y ya no vivo yo, mas vive Cristo en mí.'},{ref:'Ezequiel 36:26',text:'Os daré corazón nuevo, y pondré espíritu nuevo dentro de vosotros.'},{ref:'Apocalipsis 21:5',text:'Y el que estaba sentado en el trono dijo: He aquí, yo hago nuevas todas las cosas.'}],words:[{es:'nueva criatura',or:'καινὴ κτίσις (kainē ktisis)',meaning:'Nueva creación. Ktisis es el mismo término de Génesis: creación desde cero. No es reforma del antiguo yo sino creación de uno nuevo. El adjetivo kainē (nuevo en calidad) indica que es de otra categoría.',strong:'G2537'},{es:'viejas',or:'παλαιός (palaios)',meaning:'Viejo, anticuado, obsoleto. Lo que pasó no es la personalidad o los recuerdos sino la condición espiritual de separación de Dios, la esclavitud al pecado y la identidad construida sin Cristo.',strong:'G3820'},{es:'nuevas',or:'καινός (kainos)',meaning:'Nuevo en calidad. El mismo adjetivo que describe el nuevo pacto, la nueva Jerusalén, el nuevo cielo y la nueva tierra. No es renovación cosmética sino renovación esencial.',strong:'G2537'}],questions:['Pablo dice "si alguno está EN Cristo": la nueva creación depende de esa posición. ¿Vives consciente de que estás en Cristo, o es una idea teórica para ti?','¿Hay algo del "viejo yo" que sigues cargando como si no hubiera pasado? ¿Qué le dice a eso 2 Corintios 5:17?','La imagen es la creación del Génesis. Dios creó algo de la nada. ¿Qué áreas de tu vida necesitan ser tocadas por esa creatividad divina que hace nuevas todas las cosas?']}
    };

    // Términos sugeridos para el autocompletado.
    const SUGGESTIONS = ['amor','fe','esperanza','paz','perdón','sabiduría','gracia','salvación',
        'oración','fuerza','consuelo','propósito','descanso','temor','confianza','alabanza','creación','valentía','protección',
        'gozo','sanidad','identidad','provisión','perseverancia','victoria','transformación','restauración','fortaleza',
        'arrepentimiento','fidelidad','humildad','justicia','matrimonio','familia','trabajo','misión','ansiedad',
        'soledad','tristeza','tentación','gratitud','resurrección','comunidad','crecimiento','nuevo comienzo',
        'Salmos 23','Juan 3:16','Proverbios 3:5','Romanos 8:28','Filipenses 4:13','Isaías 41:10','Mateo 11:28','Hebreos 11:1',
        'Jeremías 29:11','Salmos 91:1','1 Corintios 13:4','Josué 1:9','Salmos 46:1','Juan 14:6','Efesios 2:8','Génesis 1:1',
        '2 Timoteo 1:7','Isaías 40:31','Salmos 121:1','Romanos 10:9',
        'Mateo 6:33','Isaías 53:5','1 Pedro 5:7','Salmos 34:18','Juan 11:25','Gálatas 2:20','Apocalipsis 3:20','Salmos 119:105',
        'Filipenses 4:6','Filipenses 4:7','Juan 14:27','2 Corintios 1:3','Santiago 1:5','Romanos 15:13','2 Corintios 12:9','Salmos 130:4','1 Tesalonicenses 5:18','Nehemías 8:10','Romanos 12:2','1 Juan 4:8'];

    let sbCurrentFilter = 'all';
    let sbStudyData = null;
    const SB_SUGSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    const SB_ARROW  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:rgba(255,255,255,.3);flex-shrink:0"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>';

    function sbVersionLabel(){ return (typeof translationMode!=='undefined' && translationMode==='sbll') ? 'SBLL 2026' : 'RVA 1909'; }
    function sbSyncVersion(){ const v=document.getElementById('sbVersionLabel'); if(v) v.textContent=sbVersionLabel(); }

    // ── Autocompletado ──
    function sbSuggest(){
        const inp=document.getElementById('searchInput'), box=document.getElementById('sbSuggestBox');
        if(!inp||!box) return;
        const v=inp.value.trim();
        if(v.length<1){ box.classList.remove('open'); box.innerHTML=''; return; }
        const vn=_sAccents(v.toLowerCase());
        const f=SUGGESTIONS.filter(s=>_sAccents(s.toLowerCase()).includes(vn)).slice(0,6);
        if(!f.length){ box.classList.remove('open'); box.innerHTML=''; return; }
        const re=new RegExp('('+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
        box.innerHTML=f.map(s=>{
            const h=s.replace(re,'<b>$1</b>');
            return '<div class="sb-sug" onmousedown="sbPickSuggest(this.dataset.q)" data-q="'+s.replace(/"/g,'&quot;')+'">'+SB_SUGSVG+'<span>'+h+'</span></div>';
        }).join('');
        box.classList.add('open');
    }
    function sbPickSuggest(s){ const inp=document.getElementById('searchInput'); if(inp) inp.value=s; sbCloseSuggest(); runSearch(); }
    function sbCloseSuggest(){ const b=document.getElementById('sbSuggestBox'); if(b){ b.classList.remove('open'); b.innerHTML=''; } }
    document.addEventListener('click',function(e){ const c=document.getElementById('searchContainer'); if(c && !c.contains(e.target)) sbCloseSuggest(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ const sp=document.getElementById('studyPanel'); if(sp && sp.classList.contains('open')) closeStudy(); } });

    // ── Filtros (Testamento / clasificación) ──
    function sbFilter(el){
        document.querySelectorAll('.sb-tab').forEach(t=>t.classList.remove('active'));
        el.classList.add('active'); sbCurrentFilter=el.dataset.filter;
        const inp=document.getElementById('searchInput');
        if(inp && inp.value.trim().length>=2) runSearch();
    }

    // ── Lanzar búsquedas (intención / temas) ──
    function sbRunQuery(q){
        const inp=document.getElementById('searchInput'); if(inp) inp.value=q;
        sbCloseSuggest(); runSearch();
        const area=document.getElementById('sbResultsArea'); if(area) area.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function sbIntention(w){ if(window.showToast) showToast('Buscando: '+w+' 💛'); sbRunQuery(w); }
    function sbTopic(w){ sbRunQuery(w); }

    // ── Búsqueda por voz ──
    function sbVoice(){
        const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
        if(!SR){ if(window.showToast) showToast('Tu navegador no soporta búsqueda por voz'); return; }
        const btn=document.getElementById('voiceBtn'); const r=new SR();
        r.lang='es-ES'; r.continuous=false; r.interimResults=false;
        r.onstart=()=>{ if(btn)btn.classList.add('listening'); if(window.showToast) showToast('Escuchando… 🎤'); };
        r.onresult=e=>{ const t=e.results[0][0].transcript; const inp=document.getElementById('searchInput'); if(inp)inp.value=t; runSearch(); };
        r.onend=r.onerror=()=>{ if(btn)btn.classList.remove('listening'); };
        try{ r.start(); }catch(e){}
    }

    // ── Panel de Estudio Profundo (premium) ──
    function sbIsPremium(){ return !!(window.SDV_Auth && window.SDV_Auth.premium); }
    async function openStudy(book, chapter, verse, text){
        // El Estudio Bíblico es GRATIS (sin muro premium): accesible para todos.
        sbStudyData={ book, chapter:+chapter, verse:+verse, text:text||'', ref:book+' '+chapter+':'+verse, versions:null };
        document.getElementById('spRef').textContent=sbStudyData.ref;
        document.getElementById('spTest').textContent=NT_BOOKS.has(book)?'Nuevo Testamento':'Antiguo Testamento';
        document.querySelectorAll('.sp-tab').forEach(t=>t.classList.remove('active'));
        const first=document.querySelector('.sp-tab[data-tab="ensenanza"]'); if(first) first.classList.add('active');
        ['ensenanza','contexto','conexiones','palabra','versiones','reflexion'].forEach(sbRenderStudy);
        document.querySelectorAll('.sp-pane').forEach(p=>p.classList.remove('active'));
        document.getElementById('pane-ensenanza').classList.add('active');
        document.getElementById('studyOverlay').classList.add('open');
        document.getElementById('studyPanel').classList.add('open');
        document.body.style.overflow='hidden';
        sbLoadVersions();
    }
    function closeStudy(){
        document.getElementById('studyOverlay').classList.remove('open');
        document.getElementById('studyPanel').classList.remove('open');
        document.body.style.overflow='';
    }
    function sbStudyTab(el){
        document.querySelectorAll('.sp-tab').forEach(t=>t.classList.remove('active'));
        el.classList.add('active');
        document.querySelectorAll('.sp-pane').forEach(p=>p.classList.remove('active'));
        document.getElementById('pane-'+el.dataset.tab).classList.add('active');
    }
    function sbEsc(s){ return String(s==null?'':s).replace(/</g,'&lt;'); }
    function sbSoon(title){
        return '<div class="sp-soon"><span class="sp-soon-ic">✦</span><p>'+title+'</p>'+
            '<small>Estamos ampliando el estudio bíblico versículo por versículo. Mientras tanto, revisa <b>Versiones</b> y <b>Reflexión</b>.</small></div>';
    }
    function sbRenderStudy(tab){
        const d=sbStudyData; if(!d) return;
        const cur=CURATED[_sAccents(d.ref).toLowerCase()];
        const pane=document.getElementById('pane-'+tab); if(!pane) return;
        const _paras=(v)=>Array.isArray(v)?v:String(v||'').split(/\n\n+/);
        if(tab==='ensenanza'){
            let html='<div class="sp-verse">"'+sbEsc(d.text)+'"</div>'+
                '<div class="sp-refline">'+sbEsc(d.ref)+' · Reina-Valera 1909</div>';
            if(cur && (cur.author||cur.date)){
                html+='<div class="sp-authorline">✒ '+[cur.author,cur.date].filter(Boolean).map(sbEsc).join(' · ')+'</div>';
            }
            if(cur && cur.bigIdea){
                html+='<div class="sp-bigidea"><span class="sp-bigidea-l">La idea central</span><p>'+sbEsc(cur.bigIdea)+'</p></div>';
            }
            if(cur && cur.exposition){
                html+='<div class="sp-teach">'+_paras(cur.exposition).map(p=>'<p>'+sbEsc(p)+'</p>').join('')+'</div>';
                if(cur.application){
                    html+='<div class="sp-apply"><span class="sp-apply-l">✦ Para tu vida hoy</span>'+
                        _paras(cur.application).map(p=>'<p>'+sbEsc(p)+'</p>').join('')+'</div>';
                }
                if(cur.prayer){
                    html+='<div class="sp-prayer"><span class="sp-prayer-l">🙏 Oración</span><p>'+sbEsc(cur.prayer)+'</p></div>';
                }
            } else {
                html+=sbSoon('Estamos escribiendo la enseñanza completa de este versículo. Mientras tanto, revisa <b>Contexto</b>, <b>Conexiones</b> y <b>Reflexión</b>.');
            }
            pane.innerHTML=html;
        }
        else if(tab==='contexto'){
            let tags;
            if(cur){ tags=cur.tags.map(t=>'<span class="sr-tag tag-'+_sAccents(t).toLowerCase()+'">'+t+'</span>').join(''); }
            else { tags='<span class="sr-tag '+(NT_BOOKS.has(d.book)?'tag-fe':'tag-promesa')+'">'+(NT_BOOKS.has(d.book)?'Nuevo Testamento':'Antiguo Testamento')+'</span>'; }
            let html='<div class="sp-verse">"'+sbEsc(d.text)+'"</div><div class="sp-tags">'+tags+'</div>';
            if(cur){
                html+='<div class="sp-grid">'+
                    '<div class="sp-cell"><span class="sp-cell-l">Autor</span><span class="sp-cell-v">'+sbEsc(cur.author)+'</span></div>'+
                    '<div class="sp-cell"><span class="sp-cell-l">Fecha</span><span class="sp-cell-v">'+sbEsc(cur.date)+'</span></div>'+
                    '<div class="sp-cell"><span class="sp-cell-l">Destinatario</span><span class="sp-cell-v">'+sbEsc(cur.audience)+'</span></div>'+
                    '<div class="sp-cell"><span class="sp-cell-l">Lugar</span><span class="sp-cell-v">'+sbEsc(cur.location)+'</span></div>'+
                    '</div>'+
                    '<div class="sp-card"><span class="sp-card-l">Ocasión</span><p class="sp-card-p">'+sbEsc(cur.occasion)+'</p></div>'+
                    '<div class="sp-card"><span class="sp-card-l">Contexto histórico</span><p class="sp-card-p">'+sbEsc(cur.background)+'</p></div>'+
                    '<div class="sp-card"><span class="sp-card-l">📍 Contexto geográfico</span><p class="sp-card-p">'+sbEsc(cur.geo)+'</p></div>';
            } else {
                html+=sbSoon('Contexto histórico y geográfico — próximamente');
            }
            pane.innerHTML=html;
        }
        else if(tab==='conexiones'){
            if(cur){
                pane.innerHTML='<p class="sp-hint">Versículos conectados temáticamente por referencia cruzada.</p>'+
                    cur.connections.map((c,i)=>'<div class="sp-conn" onclick="sbOpenConnection(this.dataset.r)" data-r="'+c.ref.replace(/"/g,'&quot;')+'">'+
                        '<span class="sp-conn-n">'+(i+1)+'</span>'+
                        '<div style="flex:1;min-width:0"><span class="sp-conn-ref">'+sbEsc(c.ref)+'</span><p class="sp-conn-tx">"'+sbEsc(c.text)+'"</p></div>'+
                        SB_ARROW+'</div>').join('');
            } else { pane.innerHTML=sbSoon('Conexiones cruzadas — próximamente'); }
        }
        else if(tab==='palabra'){
            if(cur){
                pane.innerHTML='<p class="sp-hint">Estudio de palabras clave en su idioma original.</p>'+
                    cur.words.map(w=>'<div class="sp-card"><div class="sp-word-top"><div><span class="sp-word-es">'+sbEsc(w.es)+'</span><span class="sp-word-or">'+sbEsc(w.or)+'</span></div><span class="sp-word-st">'+sbEsc(w.strong)+'</span></div><p class="sp-card-p">'+sbEsc(w.meaning)+'</p></div>').join('');
            } else { pane.innerHTML=sbSoon('Palabra original (hebreo/griego) — próximamente'); }
        }
        else if(tab==='versiones'){
            let html='<p class="sp-hint">El mismo versículo en las traducciones disponibles.</p>';
            const vs=d.versions;
            if(!vs){ html+='<div class="sp-soon"><span class="sp-soon-ic">⏳</span><p>Cargando versiones…</p></div>'; }
            else {
                if(vs.rva) html+='<div class="sp-ver"><span class="sp-ver-l">Reina-Valera Antigua 1909</span><p class="sp-ver-t">"'+sbEsc(vs.rva)+'"</p></div>';
                if(vs.sbll) html+='<div class="sp-ver"><span class="sp-ver-l">SBLL 2026</span><p class="sp-ver-t">"'+sbEsc(vs.sbll)+'"</p></div>';
                if(!vs.rva && !vs.sbll) html+=sbSoon('No se pudo cargar este versículo en las versiones.');
            }
            pane.innerHTML=html;
        }
        else if(tab==='reflexion'){
            const qs=(cur && cur.questions) ? cur.questions : [
                '¿Qué te dice este versículo sobre quién es Dios?',
                '¿Hay algo que este pasaje te invita a cambiar, creer o agradecer hoy?',
                '¿Cómo puedes aplicar esta verdad a una situación concreta de tu semana?'];
            const key='sdv_refl_'+_sAccents(d.ref).toLowerCase().replace(/\s+/g,'_');
            let saved=''; try{ saved=localStorage.getItem(key)||''; }catch(e){}
            pane.innerHTML='<p class="sp-hint">Preguntas para meditación personal y aplicación práctica.</p>'+
                qs.map((q,i)=>'<div class="sp-q"><span class="sp-q-n">'+(i+1)+'</span><p class="sp-q-t">'+sbEsc(q)+'</p></div>').join('')+
                '<div class="sp-note"><div class="sp-note-h">✎ Espacio de reflexión</div>'+
                '<textarea id="sbReflNote" placeholder="Escribe tus pensamientos, oraciones o lo que Dios te habló hoy…">'+sbEsc(saved)+'</textarea>'+
                '<div class="sp-note-foot"><span>Tus notas se guardan en este dispositivo</span>'+
                '<button class="sp-note-save" onclick="sbSaveReflection()">💾 Guardar</button></div></div>';
        }
    }
    function sbSaveReflection(){
        const d=sbStudyData; if(!d) return;
        const ta=document.getElementById('sbReflNote'); if(!ta) return;
        const key='sdv_refl_'+_sAccents(d.ref).toLowerCase().replace(/\s+/g,'_');
        try{ localStorage.setItem(key, ta.value); if(window.showToast) showToast('Reflexión guardada ✓'); }catch(e){}
    }
    async function sbLoadVersions(){
        const d=sbStudyData; if(!d) return;
        const out={};
        try{ await ensureBible('rva'); if(window.BIBLE){ const ch=(window.BIBLE[d.book]||[])[d.chapter-1]; if(ch) out.rva=ch[d.verse-1]; } }catch(e){}
        try{ await ensureBible('sbll'); if(window.BIBLE_SBLL){ const ch=(window.BIBLE_SBLL[d.book]||[])[d.chapter-1]; if(ch) out.sbll=ch[d.verse-1]; } }catch(e){}
        if(!out.rva && d.text) out.rva=d.text;
        if(sbStudyData===d){ d.versions=out; sbRenderStudy('versiones'); }
    }
    function sbOpenConnection(ref){
        const m=String(ref).match(/^(.+?)\s+(\d+):(\d+)/); if(!m){ if(window.showToast) showToast('Próximamente'); return; }
        const book=sbResolveBook(m[1]); const ch=+m[2], vs=+m[3];
        if(!book){ if(window.showToast) showToast('Estudio de '+ref+' próximamente ✦'); return; }
        ensureBible().then(()=>{
            let txt=''; try{ const c=(getActiveBible()[book]||[])[ch-1]; if(c) txt=c[vs-1]||''; }catch(e){}
            openStudy(book, ch, vs, txt);
        }).catch(()=>openStudy(book, ch, vs, ''));
    }
