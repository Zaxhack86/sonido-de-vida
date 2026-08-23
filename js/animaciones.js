/* ══════════════════════════════════════════════════════════════════════════
   VIDA AL BAJAR — el Inicio se va montando solo mientras el visitante baja
   ──────────────────────────────────────────────────────────────────────────
   Añadido 2026-08-23. Tres cosas, y ninguna toca el HTML de la app:

     1. Cada bloque del Inicio entra al aparecer en pantalla, y las rejillas
        entran tarjeta a tarjeta (escalonado). Nada depende del ratón: en el
        móvil, que es donde vive esta app, no hay ratón.
     2. Los números de la barra de arriba SUBEN hasta su cifra al llegar.
     3. El sello de la casa (js/matrix-sdv.js): SÓLO el logo de arriba y el
        del pie se DESCIFRAN. Ni el titular, ni los títulos, ni al pasar el
        ratón —se probó con todo y él lo cortó el mismo día: una firma que
        aparece en cada rótulo deja de ser una firma.

   El marcado es automático —se recorre el Inicio y se decide qué es cabecera,
   qué es rejilla y qué es bloque suelto—, así una sección nueva se anima sola
   sin volver aquí.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MX = window.SDVMatrix || null;
  const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Sin IntersectionObserver no se marca NADA: un elemento con `data-anim` y
     sin nadie que lo encienda se queda invisible para siempre. Antes que un
     efecto, la página. */
  const HAY_OBS = typeof IntersectionObserver === 'function';

  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ── El vigía ──────────────────────────────────────────────────────────── */
  /* Un único observador para toda la página. Se deja de mirar en cuanto la
     pieza entra: esto es una entrada, no un vaivén — que las cosas se
     desvanezcan al subir marea y se vuelvan a montar cansa. */
  const vigia = HAY_OBS ? new IntersectionObserver((filas) => {
    filas.forEach((f) => {
      if (!f.isIntersecting) return;
      encender(f.target);
      vigia.unobserve(f.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' }) : null;

  function encender(el) {
    el.classList.add('moviendo', 'en');
    const espera = parseInt(el.style.getPropertyValue('--anim-espera')) || 0;

    /* El trazo de oro se enciende él mismo y no por su padre: en cuanto la
       entrada termina, el padre se queda sin `data-anim` (ver abajo). */
    if (el.classList.contains('anim-trazo')) el.classList.add('en');
    el.querySelectorAll('.anim-trazo').forEach(t => t.classList.add('en'));

    /* Y al terminar, la pieza se queda LIMPIA. Mientras lleve `data-anim`, el
       `transform:none` del estado final gana por orden de archivo al
       `:hover{transform:translateY(-3px)}` que la tarjeta ya traía de
       app.css, y las tarjetas dejarían de responder al ratón para siempre.
       La clase `en` se queda: sin `data-anim` sólo la usa el trazo. */
    setTimeout(() => {
      el.classList.remove('moviendo');
      delete el.dataset.anim;
      el.style.removeProperty('--anim-espera');
    }, 900 + espera);

    /* Las cifras viven en un hijo del bloque que acaba de entrar. */
    if (el.dataset.cuenta) contar(el);
    el.querySelectorAll('[data-cuenta]').forEach(contar);
  }

  function marcar(el, anim, espera) {
    if (!el || el.dataset.anim) return;
    el.dataset.anim = anim;
    if (espera) el.style.setProperty('--anim-espera', espera + 'ms');
    /* Si llevaba el `.reveal` de app.js, se lo lleva esta capa: dos entradas
       encima de la misma pieza se pelean por el `transform`. */
    el.classList.remove('reveal');
    vigia.observe(el);
  }

  /* ── Qué se anima ──────────────────────────────────────────────────────── */
  /* Una rejilla es una caja de verdad puesta en fila o en cuadrícula: sus
     hijos entran uno detrás de otro. Una TARJETA no lo es aunque por dentro
     sea `flex` —el icono, el texto y el botón de una promo son una sola cosa
     y tienen que entrar juntos—, así que se excluyen por nombre. */
  function esRejilla(el) {
    if (el.children.length < 2 || el.matches('[class*="card"]')) return false;
    const d = getComputedStyle(el).display;
    return d === 'grid' || d === 'flex';
  }

  const CABECERAS = '.shw-head, .section-header';
  const PASO = 85;        // el escalón entre tarjeta y tarjeta
  const PASO_TOPE = 8;    // más allá de ocho, la última tardaría un segundo entero

  function montarSeccion(sec) {
    /* La portada tiene su propia entrada desde siempre (`fadeInUp`) y encima
       está en pantalla al cargar: animarla otra vez sería un parpadeo. */
    if (sec.classList.contains('hero')) return;

    /* Se trabaja sobre el envoltorio interior: el `<section>` trae el fondo de
       la franja, y animar el fondo parte la página en bandas mientras entra.
       Si la sección entera cuelga de un solo envoltorio (`.faq-inner`,
       `.home-focus-wrap`), se baja un piso más — pero nunca dentro de una
       tarjeta, que es una pieza. */
    let caja = sec;
    for (let i = 0; i < 2; i++) {
      const uno = caja.children.length === 1 ? caja.children[0] : null;
      if (!uno || uno.matches('[class*="card"]') || !uno.children.length) break;
      caja = uno;
    }

    Array.from(caja.children).forEach((bloque) => {
      if (bloque.matches(CABECERAS)) { montarCabecera(bloque); return; }
      if (esRejilla(bloque)) {
        bloque.classList.remove('reveal');
        Array.from(bloque.children).forEach((hijo, i) =>
          marcar(hijo, 'escala', Math.min(i, PASO_TOPE) * PASO));
      } else {
        marcar(bloque, 'sube', 0);
        montarTitulo(bloque.matches('h2') ? bloque : bloque.querySelector('h2'));
      }
    });
  }

  /* La cabecera entra por renglones: primero el rótulo pequeño, luego el
     título, luego la frase. Es el orden en que se lee. */
  function montarCabecera(cab) {
    cab.classList.remove('reveal');
    const piezas = Array.from(cab.children);
    if (!piezas.length) { marcar(cab, 'asoma', 0); return; }
    piezas.forEach((p, i) => marcar(p, 'asoma', i * 110));
    montarTitulo(cab.querySelector('h2'));
  }

  /* El título de sección lleva su trazo de oro, y sólo si está centrado: en una
     promo con el texto a la izquierda, una rayita en medio del renglón no es un
     remate, es un despiste.

     Aquí NO se descifra nada. El sello es de los dos logos y de nadie más
     —«el resto no, se ve fatal así», 2026-08-23—: revolver todos los títulos
     de la página convierte una firma en un tic. */
  function montarTitulo(h2) {
    if (!h2 || QUIETO) return;
    if (getComputedStyle(h2).textAlign === 'center') h2.classList.add('anim-trazo');
  }

  /* El vigía del sello: el logo del pie se descifra cuando asoma, una vez. */
  function vigiaSello(el) {
    if (!HAY_OBS || !MX) return;
    const o = new IntersectionObserver((filas) => {
      filas.forEach((f) => {
        if (!f.isIntersecting) return;
        o.unobserve(f.target);
        setTimeout(() => MX.descifrar(f.target, MX.duraDe(f.target, 520, 1150), MX.ENTRADA), 320);
      });
    }, { threshold: .35 });
    o.observe(el);
  }

  /* ── Los números que suben ─────────────────────────────────────────────── */
  /* «1,189» se cuenta como número y se vuelve a escribir con su coma; el «%»
     y cualquier otro adorno se quedan donde estaban. */
  function contar(el) {
    if (el.dataset.contando) return;   // el vigía puede llamar dos veces
    el.dataset.contando = '1';
    const bruto = el.dataset.cuenta;
    const n = parseFloat(bruto.replace(/[^\d.]/g, ''));
    if (!isFinite(n)) return;
    const coma = bruto.includes(',');
    const antes = bruto.slice(0, bruto.search(/[\d]/));
    const luego = bruto.slice(bruto.search(/[\d][^\d]*$/) + 1);
    const t0 = performance.now(), dura = 1400;

    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dura);
      /* Frena al final, como un cuentakilómetros al parar. */
      const v = Math.round(n * (1 - Math.pow(1 - k, 3)));
      el.textContent = antes + (coma ? v.toLocaleString('es-MX') : String(v)) + luego;
      if (k < 1) requestAnimationFrame(paso);
      else el.textContent = bruto;   // el original, tal cual estaba escrito
    };
    requestAnimationFrame(paso);
  }

  function montarCifras() {
    $$('.stats-bar .stat-item h3').forEach((h3) => {
      if (QUIETO || h3.dataset.cuenta) return;
      h3.dataset.cuenta = h3.textContent.trim();
    });
  }

  /* ── La portada que se despide ─────────────────────────────────────────── */
  /* Al bajar, el contenido de la portada se queda un poco atrás y se apaga:
     medio segundo de profundidad que no cuesta ni un elemento nuevo. Y la
     flecha de «baja» se apaga en cuanto ya bajó. */
  function montarPortada() {
    const cont = document.querySelector('.hero-content');
    const flecha = document.querySelector('.hero-scroll');
    if (QUIETO || (!cont && !flecha)) return;
    let pedido = false;

    const pintar = () => {
      pedido = false;
      const y = window.scrollY, alto = window.innerHeight;
      if (y > alto * 1.2) return;          // ya no se ve: no se gasta nada
      if (cont) {
        cont.style.setProperty('--hero-y', (y * .22).toFixed(1) + 'px');
        cont.style.opacity = Math.max(0, 1 - y / (alto * .62)).toFixed(3);
      }
      if (flecha) flecha.classList.toggle('lejos', y > 90);
    };

    addEventListener('scroll', () => {
      if (!pedido) { pedido = true; requestAnimationFrame(pintar); }
    }, { passive: true });
    pintar();
  }

  /* ── El sello, arriba y abajo ──────────────────────────────────────────── */
  /* El nombre de la marca se descifra al cargar (arriba) y al asomarse
     (abajo). Ninguno de los dos reacciona al ratón: revolver lo primero y lo
     último que se lee, cada vez que el puntero lo cruza, cansa. */
  function montarSello() {
    if (!MX || QUIETO) return;

    const arranca = () => {
      const logo = document.querySelector('.nav-logo .logo-text');
      if (logo) setTimeout(() => MX.descifrar(logo, MX.duraDe(logo, 620, 900), MX.ENTRADA), 240);

      const pie = document.querySelector('.footer-logo');
      if (pie) vigiaSello(pie);
    };

    /* Con la fuente aún sin cargar, las letras se medirían con la de repuesto
       y el revuelto no cuadraría de ancho —y el guardián de `descifrar()`
       apagaría la pieza—. Si tarda demasiado, se arranca igual. */
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(arranca);
    } else arranca();
  }

  /* ── Arranque ──────────────────────────────────────────────────────────── */
  function montar() {
    if (HAY_OBS && !QUIETO) {
      $$('section[data-tab="inicio"]').forEach(montarSeccion);
      montarCifras();
    }
    montarPortada();
    montarSello();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', montar);
  else montar();

  window.SDVAnim = { montar };
})();
