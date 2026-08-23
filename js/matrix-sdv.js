/* ══════════════════════════════════════════════════════════════════════════
   EL SELLO DE LA CASA — la lluvia que descifra el texto
   ──────────────────────────────────────────────────────────────────────────
   Portado tal cual de chequeclaro.com (`descifrarTexto()` en js/comun.js) y de
   zaxdesigns.com. Aquí sólo cambian la paleta (en css/animaciones.css) y el
   repertorio de letras: esto es una web de la Palabra, no de dinero, así que
   fuera el `$` y el `%`.

   Es una firma, no un adorno: se usa POCO y siempre en lo mismo —el nombre de
   la marca, el titular y los rótulos en negrita—. Nunca en la prosa: descifrar
   un párrafo es ilegible.

   Expone `window.SDVMatrix.descifrar(el, dura, temple)` y los dos temples.
   Quien decide QUÉ se descifra y CUÁNDO es js/animaciones.js.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const QUIETO    = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HAY_RATON = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mirando   = () => document.visibilityState === 'visible';

  const TXT_GIRO    = 80;    // cada cuánto cambia la letra revuelta
  const TXT_VENTANA = 7;     // cuántas letras se revuelven a la vez
  const TXT_ESPERA  = 1100;  // no se repite antes de esto (entrar y salir con el ratón)

  /* Sin puntuación: los signos no cambian nunca. Con vocales acentuadas y `ñ`
     porque el texto es español y su ancho manda al elegir candidatas. */
  const TXT_POOL = 'abcdefghijklmnopqrstuvwxyzáéíóúñ0123456789';

  const MX_ENTRADA = { base: .52, piso: .15, caida: .035 };  // al aparecer
  const MX_ROCE    = { base: .95, piso: .62, caida: .020 };  // al pasar el ratón

  const txtEstado = new WeakMap();
  const anchos    = new Map();
  let regla;   // el canvas donde se miden las letras

  /* Un revuelto estable: la misma semilla da siempre la misma letra, así la
     ola no parpadea entre fotogramas. */
  function revuelto(semilla, i) {
    let x = ((semilla + 1) * 2654435761 + (i + 1) * 40503) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    x = Math.imul(x, 1274126177) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  /* Las candidatas de una letra: las del mismo ancho y la misma caja. Se
     calcula una vez por fuente y letra; a partir de ahí es leer una tabla.
     Ojo con Cinzel: sus «minúsculas» son versalitas, pero como se mide con la
     MISMA fuente el ancho sale bien igual. */
  function candidatas(font, ch) {
    let cache = anchos.get(font);
    if (!cache) { cache = { w: new Map(), c: new Map() }; anchos.set(font, cache); }
    if (cache.c.has(ch)) return cache.c.get(ch);

    if (!regla) regla = document.createElement('canvas').getContext('2d');
    regla.font = font;
    const ancho = (x) => {
      let w = cache.w.get(x);
      if (w === undefined) { w = regla.measureText(x).width; cache.w.set(x, w); }
      return w;
    };

    const mayus = ch !== ch.toLowerCase();
    const pool = mayus ? TXT_POOL.toUpperCase() : TXT_POOL;
    const w0 = ancho(ch);
    let lista = [...pool].filter(x => x !== ch && Math.abs(ancho(x) - w0) <= w0 * .07);
    /* Si no hay ninguna del mismo ancho —una «ñ», una «w»— se cogen las seis
       más parecidas: peor eso que dejar la letra quieta en medio de la ola. */
    if (lista.length < 4) {
      lista = [...pool].filter(x => x !== ch)
        .sort((a, b) => Math.abs(ancho(a) - w0) - Math.abs(ancho(b) - w0)).slice(0, 6);
    }
    cache.c.set(ch, lista);
    return lista;
  }

  function fuenteDe(el) {
    const s = getComputedStyle(el);
    return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  }

  const ES_LETRA = /[\p{L}\p{N}]/u;

  function descifrarTexto(el, dura, temple) {
    if (QUIETO || !el || !mirando()) return;
    const est = txtEstado.get(el) || { ult: -1e9, vivo: false, off: false };
    const ahora = performance.now();
    if (est.off || est.vivo || ahora - est.ult < TXT_ESPERA) return;

    /* Los nodos de texto, en orden de lectura. La estructura (un `<br>`, un
       `<em>`, el `<span>` del degradado) no se toca: sólo se sustituye el
       texto de dentro. */
    const textos = [];
    const paseo = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = paseo.nextNode(); n; n = paseo.nextNode())
      if (n.nodeValue.trim()) textos.push(n);
    if (!textos.length) return;

    const font  = fuenteDe(el);
    const antes = el.getBoundingClientRect();
    const cols = [], trozos = [];

    /* Mientras dura el revuelto, lo que se anuncia es el texto de verdad. */
    el.setAttribute('aria-label', textos.map(n => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim());

    textos.forEach((n) => {
      const texto = n.nodeValue;
      const caja = document.createElement('span');
      caja.className = 'mx-linea';
      let palabra = null;
      for (const ch of texto) {
        if (ch === ' ' || ch === '\n' || ch === '\t') {
          palabra = null;
          caja.appendChild(document.createTextNode(ch));
          continue;
        }
        if (!palabra) {
          palabra = document.createElement('span');
          palabra.className = 'mx-palabra';
          caja.appendChild(palabra);
        }
        const s = document.createElement('span');
        s.className = 'mx';
        s.textContent = ch;
        palabra.appendChild(s);
        cols.push({ s, ch, muda: ES_LETRA.test(ch), papel: '', puesto: ch, giro: -1, op: '' });
      }
      n.parentNode.replaceChild(caja, n);
      trozos.push({ caja, texto });
    });

    let terminado = false;
    const deshacer = () => {
      if (terminado) return;
      terminado = true;
      trozos.forEach(({ caja, texto }) => {
        if (caja.parentNode) caja.parentNode.replaceChild(document.createTextNode(texto), caja);
      });
      el.removeAttribute('aria-label');
      txtEstado.set(el, { ult: performance.now(), vivo: false, off: est.off });
    };

    /* El guardián: si al partir el texto en columnas el rótulo cambió de
       tamaño, el efecto empujaría la página. Se deshace y ese elemento queda
       apagado para siempre. */
    const despues = el.getBoundingClientRect();
    if (Math.abs(despues.height - antes.height) > .5 ||
        Math.abs(despues.width  - antes.width)  > 2) {
      deshacer();
      txtEstado.set(el, { ult: performance.now(), vivo: false, off: true });
      return;
    }

    const opacar = (col, v) => {
      const s = v >= .999 ? '' : v.toFixed(2);
      if (col.op !== s) { col.s.style.opacity = s; col.op = s; }
    };

    const total = cols.length;
    const t0 = performance.now();
    txtEstado.set(el, { ult: ahora, vivo: true, off: false });

    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dura);
      const giro = Math.floor((t - t0) / TXT_GIRO);
      /* El frente llega al final antes que el reloj: las últimas letras tienen
         que tener tiempo de posarse dentro de la animación. */
      const frente = Math.min(total, Math.floor(total * Math.pow(k, 1.1) * 1.22));

      /* La cabeza es la primera letra que queda por descifrar, no la posición
         `frente` a secas: si el frente cae sobre un signo, ahí no hay nada que
         encender y la ola se quedaría un momento sin cabeza. */
      let cabeza = -1;
      for (let i = frente; i < total; i++) if (cols[i].muda) { cabeza = i; break; }

      for (let i = 0; i < total; i++) {
        const col = cols[i];
        const enLaOla = col.muda && cabeza >= 0 && i >= cabeza && i < cabeza + TXT_VENTANA;
        const papel = i < frente ? (col.muda ? 'fijo' : 'seco')
                    : enLaOla    ? (i === cabeza ? 'cabeza' : 'ola')
                    : 'lejos';

        /* Ya posada, o todavía esperando su turno: la letra de verdad. */
        if (papel === 'fijo' || papel === 'seco' || papel === 'lejos') {
          if (col.papel !== papel) {
            col.s.className = papel === 'fijo' ? 'mx mx--fijo'
                            : papel === 'seco' ? 'mx mx--seco' : 'mx';
            col.papel = papel;
            col.puesto = '';
          }
          if (col.puesto !== col.ch) { col.s.textContent = col.ch; col.puesto = col.ch; }
          opacar(col, papel !== 'lejos' ? 1
            : Math.max(temple.piso, temple.base - (i - (cabeza < 0 ? frente : cabeza)) * temple.caida));
          continue;
        }

        /* Está en la ola. La letra que había se va CAYENDO mientras entra la
           nueva: eso es lo que lo convierte en lluvia y no en un parpadeo. */
        if (col.giro !== giro) {
          const sale = col.s.querySelector('.mx__g--sale');
          if (sale) sale.remove();
          const previa = col.s.querySelector('.mx__g');
          if (previa) previa.className = 'mx__g mx__g--sale';
          else col.s.textContent = '';

          const b = document.createElement('b');   // uno NUEVO = la caída empieza otra vez
          b.className = 'mx__g';
          const lista = candidatas(font, col.ch);
          b.textContent = lista[revuelto(giro, i) % lista.length] || col.ch;
          col.s.appendChild(b);
          col.giro = giro;
          col.puesto = '';
        }
        if (col.papel !== papel) {
          col.s.className = papel === 'cabeza' ? 'mx mx--cabeza' : 'mx';
          col.papel = papel;
        }
        /* La cola se apaga hacia la derecha, como el rastro de una gota. */
        opacar(col, papel === 'cabeza' ? 1 : Math.max(.5, .95 - (i - cabeza) * .08));
      }

      if (k < 1 && mirando()) requestAnimationFrame(paso);
      else deshacer();
    };

    requestAnimationFrame(paso);

    /* El paracaídas. Si el navegador deja de dar fotogramas a media ola —una
       pestaña que se va al fondo— el último `paso` no llega nunca y el rótulo
       se quedaría revuelto para siempre. Con esto vuelve a ser texto pase lo
       que pase. */
    setTimeout(deshacer, dura + 600);
  }

  /* Cuánto dura según lo que hay que descifrar: un logo de tres palabras no
     puede tardar lo mismo que un titular de doce. */
  function duraDe(el, min, max) {
    const n = (el.textContent || '').replace(/\s/g, '').length;
    return Math.max(min, Math.min(max, 260 + n * 26));
  }

  window.SDVMatrix = {
    descifrar: descifrarTexto,
    duraDe,
    ENTRADA: MX_ENTRADA,
    ROCE: MX_ROCE,
    QUIETO, HAY_RATON,
  };
})();
