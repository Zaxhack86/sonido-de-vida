(function () {
        // [clave en window.BIBLE, nombre con tildes, abreviatura, testamento]
        const META = [
            ['Genesis','Génesis','Gén','ot'],['Exodo','Éxodo','Éx','ot'],['Levitico','Levítico','Lev','ot'],
            ['Numeros','Números','Núm','ot'],['Deuteronomio','Deuteronomio','Deut','ot'],['Josue','Josué','Jos','ot'],
            ['Jueces','Jueces','Jue','ot'],['Rut','Rut','Rut','ot'],['1 Samuel','1 Samuel','1Sam','ot'],
            ['2 Samuel','2 Samuel','2Sam','ot'],['1 Reyes','1 Reyes','1Rey','ot'],['2 Reyes','2 Reyes','2Rey','ot'],
            ['1 Cronicas','1 Crónicas','1Cró','ot'],['2 Cronicas','2 Crónicas','2Cró','ot'],['Esdras','Esdras','Esd','ot'],
            ['Nehemias','Nehemías','Neh','ot'],['Ester','Ester','Est','ot'],['Job','Job','Job','ot'],
            ['Salmos','Salmos','Sal','ot'],['Proverbios','Proverbios','Prov','ot'],['Eclesiastes','Eclesiastés','Ecl','ot'],
            ['Cantares','Cantares','Cant','ot'],['Isaias','Isaías','Isa','ot'],['Jeremias','Jeremías','Jer','ot'],
            ['Lamentaciones','Lamentaciones','Lam','ot'],['Ezequiel','Ezequiel','Eze','ot'],['Daniel','Daniel','Dan','ot'],
            ['Oseas','Oseas','Os','ot'],['Joel','Joel','Joel','ot'],['Amos','Amós','Amós','ot'],
            ['Abdias','Abdías','Abd','ot'],['Jonas','Jonás','Jon','ot'],['Miqueas','Miqueas','Miq','ot'],
            ['Nahum','Nahúm','Nah','ot'],['Habacuc','Habacuc','Hab','ot'],['Sofonias','Sofonías','Sof','ot'],
            ['Hageo','Hageo','Hag','ot'],['Zacarias','Zacarías','Zac','ot'],['Malaquias','Malaquías','Mal','ot'],
            ['Mateo','Mateo','Mt','nt'],['Marcos','Marcos','Mr','nt'],['Lucas','Lucas','Lc','nt'],['Juan','Juan','Jn','nt'],
            ['Hechos','Hechos','Hch','nt'],['Romanos','Romanos','Ro','nt'],['1 Corintios','1 Corintios','1Co','nt'],
            ['2 Corintios','2 Corintios','2Co','nt'],['Galatas','Gálatas','Gál','nt'],['Efesios','Efesios','Ef','nt'],
            ['Filipenses','Filipenses','Fil','nt'],['Colosenses','Colosenses','Col','nt'],
            ['1 Tesalonicenses','1 Tesalonicenses','1Ts','nt'],['2 Tesalonicenses','2 Tesalonicenses','2Ts','nt'],
            ['1 Timoteo','1 Timoteo','1Ti','nt'],['2 Timoteo','2 Timoteo','2Ti','nt'],['Tito','Tito','Tit','nt'],
            ['Filemon','Filemón','Flm','nt'],['Hebreos','Hebreos','Heb','nt'],['Santiago','Santiago','Stg','nt'],
            ['1 Pedro','1 Pedro','1Pe','nt'],['2 Pedro','2 Pedro','2Pe','nt'],['1 Juan','1 Juan','1Jn','nt'],
            ['2 Juan','2 Juan','2Jn','nt'],['3 Juan','3 Juan','3Jn','nt'],['Judas','Judas','Jud','nt'],
            ['Apocalipsis','Apocalipsis','Ap','nt'],
        ];
        let curTest = 'all', sel = null, selCh = null, q = '';
        const $ = id => document.getElementById(id);
        function data() { return (window.BIBLE) || (typeof getActiveBible === 'function' ? getActiveBible() : {}) || {}; }
        function chapsOf(key) { const b = data()[key]; return Array.isArray(b) ? b.length : 0; }
        function metaOf(key) { return META.find(m => m[0] === key); }

        function render() {
            const grid = $('bibBooksGrid'); if (!grid) return;
            const d = data(), ql = q.trim().toLowerCase();
            grid.innerHTML = ''; let n = 0;
            META.forEach(m => {
                const [key, name, abbr, test] = m;
                if (!d[key]) return;
                if (curTest !== 'all' && test !== curTest) return;
                if (ql && !(name.toLowerCase().includes(ql) || abbr.toLowerCase().includes(ql) || key.toLowerCase().includes(ql))) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'bib-book' + (sel === key ? ' active' : '');
                b.textContent = abbr; b.title = name;
                b.style.animationDelay = (Math.min(n, 30) * 0.012) + 's'; n++;
                b.onclick = () => selectBook(key);
                grid.appendChild(b);
            });
        }
        function renderChapters(count) {
            const g = $('bibChaptersGrid'); if (!g) return; g.innerHTML = '';
            for (let i = 1; i <= count; i++) {
                const c = document.createElement('button');
                c.type = 'button';
                c.className = 'bib-ch' + (selCh === i ? ' active' : '');
                c.textContent = i; c.style.animationDelay = (Math.min(i, 40) * 0.008) + 's';
                c.onclick = () => selectChapter(i);
                g.appendChild(c);
            }
        }
        function openStep(el) {
            if (!el) return;
            el.hidden = false;
            el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
        }
        function selectBook(key) {
            sel = key; selCh = null;
            render();
            const m = metaOf(key), count = chapsOf(key);
            $('bibSelName').textContent = m ? m[1] : key;
            $('bibSelChaps').textContent = count + ' capítulos';
            $('bibSelectedBook').hidden = false;
            const bs = $('bookSelect'); if (bs) bs.value = key;
            renderChapters(count);
            openStep($('bibChapterStep'));
            $('bibLoadStep').hidden = true;
            $('bibChapterStep').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function selectChapter(n) {
            selCh = n;
            renderChapters(chapsOf(sel));
            const cs = $('chapterSelect');
            if (cs) {
                cs.disabled = false; cs.innerHTML = '';
                for (let i = 1; i <= chapsOf(sel); i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; cs.appendChild(o); }
                cs.value = n;
            }
            openStep($('bibLoadStep'));
            $('bibLoadStep').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function clearBook() {
            sel = null; selCh = null; q = '';
            const sb = $('bibBookSearch'); if (sb) sb.value = '';
            $('bibSelectedBook').hidden = true;
            $('bibChapterStep').hidden = true;
            $('bibLoadStep').hidden = true;
            render();
        }
        function load() {
            if (!sel || !selCh) { if (window.showToast) showToast('Elige un libro y un capítulo'); return; }
            if (typeof loadChapter === 'function') loadChapter({ book: sel, chapter: selCh });
        }
        function testament(t, btn) {
            curTest = t;
            document.querySelectorAll('#listen .bib-tab').forEach(x => x.classList.remove('active'));
            if (btn) btn.classList.add('active');
            render();
        }
        function filter(v) { q = v || ''; render(); }
        function syncFromState() {
            if (!window.state || !state.book) return;
            sel = state.book; selCh = state.chapter;
            const m = metaOf(sel), count = chapsOf(sel);
            render();
            if ($('bibSelName')) {
                $('bibSelName').textContent = m ? m[1] : sel;
                $('bibSelChaps').textContent = count + ' capítulos';
                $('bibSelectedBook').hidden = false;
            }
            renderChapters(count);
            if ($('bibChapterStep')) $('bibChapterStep').hidden = false;
            if ($('bibLoadStep')) $('bibLoadStep').hidden = false;
        }
        window.BibleUI = { render, selectBook, selectChapter, clearBook, load, testament, filter, syncFromState };
    })();

    // Buscar dentro de la barra inline (mismo elemento de audio que el reproductor flotante)
    function seekBib(e) {
        if (!audio || !audio.duration || !isFinite(audio.duration)) return;
        const r = document.getElementById('bibProg').getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        audio.currentTime = pct * audio.duration;
    }
    // Velocidad de lectura (0.9×–1.2×): aplica a ambos <audio> y persiste en swaps.
    // Solo voz SBLL 2026: si el usuario baja de 1× se cambia automáticamente a esa voz.
    function setReadSpeed(rate, btn) {
        rate = Math.max(0.9, Math.min(1.2, rate));
        // La cámara lenta (0.9×) solo existe para la voz SBLL 2026 (las demás
        // pierden calidad al ralentizarse). El botón se oculta en otras voces.
        if (rate < 1 && translationMode !== 'sbll') return;
        try { playbackSpeed = rate; audioA.playbackRate = rate; audioB.playbackRate = rate; } catch (e) {}
        document.querySelectorAll('#listen .bib-speed button').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }
    // El botón 0.9× del lector solo se muestra con la voz SBLL 2026.
    function updateReadSpeedAvail() {
        const slow = document.getElementById('bibSlowBtn');
        if (!slow) return;
        const ok = (translationMode === 'sbll');
        slow.style.display = ok ? '' : 'none';
        // Si dejamos de poder ir lento, normalizar a 1× para no quedar atascado.
        if (!ok && playbackSpeed < 1) setReadSpeed(1, document.querySelector('#listen .bib-speed button:nth-child(2)'));
    }
