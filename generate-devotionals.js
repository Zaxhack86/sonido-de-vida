// generate-devotionals.js — run with: node generate-devotionals.js
// Generates all devocional HTML files from content data

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://sonidodevida.com';
const OUT_DIR  = path.join(__dirname, 'devocional');

// ─── SHARED CSS ──────────────────────────────────────────────────────────────
const CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --gold:#c9a84c; --gold-light:#e8d48b; --gold-dark:#a07c2a;
  --deep-blue:#1a1a3e; --dark:#0d0d1a;
  --cream:#f5f0e8; --warm-white:#faf8f4;
  --text-dark:#2c2c3e; --text-light:#6b6b80;
}
body { font-family:'Inter',sans-serif; background:var(--warm-white); color:var(--text-dark); }
nav { background:var(--dark); padding:.9rem 2rem; display:flex; justify-content:space-between; align-items:center; }
.nav-logo { font-family:'Cinzel',serif; font-size:1.3rem; font-weight:700; color:var(--gold-light); text-decoration:none; }
.nav-back { color:rgba(255,255,255,.7); text-decoration:none; font-size:.88rem; display:flex; align-items:center; gap:.4rem; transition:color .2s; }
.nav-back:hover { color:var(--gold-light); }
.hero-verse { background:linear-gradient(135deg,#0d0d1a 0%,#1a1a3e 60%,#2d1b69 100%); padding:4.5rem 2rem 3.5rem; text-align:center; }
.tag { display:inline-block; background:rgba(201,168,76,.15); border:1px solid rgba(201,168,76,.3); color:var(--gold-light); font-size:.78rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; padding:.35rem 1rem; border-radius:50px; margin-bottom:1.5rem; }
.verse-ref { font-family:'Cinzel',serif; font-size:1rem; color:var(--gold); margin-bottom:1.2rem; letter-spacing:.08em; }
.verse-text { font-family:'Lora',serif; font-size:clamp(1.4rem,3.5vw,2.1rem); color:white; line-height:1.55; max-width:700px; margin:0 auto 2.2rem; font-style:italic; }
.verse-text::before { content:'“'; color:var(--gold); }
.verse-text::after  { content:'”'; color:var(--gold); }
.audio-cta { display:inline-flex; align-items:center; gap:.6rem; background:linear-gradient(135deg,var(--gold),var(--gold-dark)); color:var(--dark); padding:.9rem 2.2rem; border-radius:50px; font-weight:700; font-size:.95rem; text-decoration:none; transition:transform .2s,box-shadow .2s; }
.audio-cta:hover { transform:translateY(-2px); box-shadow:0 8px 25px rgba(201,168,76,.4); }
.breadcrumb { background:white; border-bottom:1px solid #eee; padding:.7rem 2rem; font-size:.82rem; color:var(--text-light); }
.breadcrumb a { color:var(--text-light); text-decoration:none; }
.breadcrumb a:hover { color:var(--gold-dark); }
.breadcrumb span { margin:0 .4rem; }
.content-wrap { max-width:760px; margin:0 auto; padding:3.5rem 2rem 5rem; }
.devocional-title { font-family:'Cinzel',serif; font-size:clamp(1.5rem,3vw,2rem); color:var(--deep-blue); margin-bottom:.6rem; line-height:1.3; }
.meta-info { display:flex; align-items:center; gap:.75rem; margin-bottom:1.5rem; color:var(--text-light); font-size:.85rem; flex-wrap:wrap; }
.meta-tag { background:var(--cream); color:var(--gold-dark); padding:.25rem .75rem; border-radius:50px; font-weight:500; font-size:.78rem; border:1px solid rgba(201,168,76,.2); }
.divider { width:60px; height:3px; background:linear-gradient(90deg,var(--gold),var(--gold-light)); border-radius:2px; margin:1.5rem 0 2.5rem; }
.devocional-body p { font-family:'Lora',serif; font-size:1.1rem; line-height:1.9; color:#3a3a4e; margin-bottom:1.6rem; }
.devocional-body strong { color:var(--deep-blue); font-weight:600; }
.devocional-body em { color:#5a4a7e; }
h2.section-title { font-family:'Cinzel',serif; font-size:1.2rem; color:var(--deep-blue); margin:2.5rem 0 1rem; padding-bottom:.5rem; border-bottom:2px solid var(--cream); }
.verse-block { background:linear-gradient(135deg,rgba(201,168,76,.07),rgba(201,168,76,.03)); border-left:4px solid var(--gold); padding:1.4rem 1.8rem; border-radius:0 10px 10px 0; margin:2rem 0; }
.verse-block p { font-family:'Lora',serif; font-style:italic; font-size:1.1rem; color:var(--text-dark); line-height:1.75; margin:0; }
.verse-block cite { display:block; margin-top:.6rem; font-style:normal; font-size:.85rem; color:var(--gold-dark); font-weight:600; }
.insight-box { background:var(--deep-blue); color:white; border-radius:14px; padding:1.8rem 2rem; margin:2.5rem 0; }
.insight-box p { font-family:'Lora',serif; font-size:1.05rem; line-height:1.8; color:rgba(255,255,255,.9); margin:0; }
.insight-label { font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--gold-light); font-weight:600; margin-bottom:.6rem; display:block; }
.prayer-section { background:linear-gradient(135deg,rgba(201,168,76,.08),rgba(45,27,105,.06)); border:1px solid rgba(201,168,76,.2); border-radius:14px; padding:2rem; margin:2.5rem 0; }
.prayer-section h3 { font-family:'Cinzel',serif; font-size:1rem; color:var(--gold-dark); letter-spacing:.08em; text-transform:uppercase; margin-bottom:1rem; }
.prayer-section p { font-family:'Lora',serif; font-style:italic; font-size:1rem; line-height:1.85; color:var(--text-dark); margin:0; }
.listen-section { background:linear-gradient(135deg,var(--deep-blue),#2d1b69); border-radius:16px; padding:2.2rem 2rem; margin:2.5rem 0; text-align:center; }
.listen-section h3 { font-family:'Cinzel',serif; font-size:1.1rem; color:var(--gold-light); margin-bottom:.5rem; }
.listen-section p { font-size:.9rem; color:rgba(255,255,255,.65); margin-bottom:1.4rem; font-family:'Lora',serif; }
.faq-section { margin:3rem 0; }
.faq-section h2 { font-family:'Cinzel',serif; font-size:1.3rem; color:var(--deep-blue); margin-bottom:1.5rem; }
.faq-item { border:1px solid #eee; border-radius:10px; margin-bottom:.75rem; overflow:hidden; }
.faq-question { width:100%; background:white; border:none; padding:1.1rem 1.4rem; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-family:'Inter',sans-serif; font-size:.95rem; font-weight:500; color:var(--text-dark); }
.faq-question:hover { background:var(--cream); }
.faq-arrow { color:var(--gold); font-size:1.2rem; transition:transform .3s; flex-shrink:0; margin-left:1rem; }
.faq-answer { display:none; padding:0 1.4rem 1.2rem; background:white; }
.faq-answer p { font-family:'Lora',serif; font-size:.97rem; line-height:1.8; color:var(--text-light); margin:0; }
.faq-item.open .faq-answer { display:block; }
.faq-item.open .faq-arrow { transform:rotate(45deg); }
.share-section { margin:2.5rem 0; }
.share-section h4 { font-family:'Cinzel',serif; font-size:.9rem; color:var(--text-light); letter-spacing:.08em; margin-bottom:1rem; text-transform:uppercase; }
.share-buttons { display:flex; gap:.75rem; flex-wrap:wrap; }
.share-btn { display:inline-flex; align-items:center; gap:.5rem; padding:.6rem 1.25rem; border-radius:50px; font-size:.87rem; font-weight:500; text-decoration:none; cursor:pointer; transition:transform .2s,opacity .2s; border:none; font-family:inherit; }
.share-btn:hover { transform:translateY(-1px); opacity:.9; }
.share-whatsapp { background:#25d366; color:white; }
.share-facebook { background:#1877f2; color:white; }
.share-twitter  { background:#000; color:white; }
.share-copy { background:var(--cream); color:var(--deep-blue); border:1px solid #ddd !important; }
.nav-posts { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:3rem; padding-top:2rem; border-top:1px solid #eee; }
.nav-post { background:white; border:1px solid #eee; border-radius:12px; padding:1.2rem; text-decoration:none; transition:box-shadow .2s,border-color .2s; }
.nav-post:hover { box-shadow:0 4px 15px rgba(0,0,0,.08); border-color:var(--gold); }
.nav-post .direction { font-size:.75rem; color:var(--text-light); text-transform:uppercase; letter-spacing:.08em; margin-bottom:.4rem; }
.nav-post .post-title { font-family:'Lora',serif; font-size:.95rem; color:var(--text-dark); }
.nav-post.next { text-align:right; }
@media(max-width:600px){
  .nav-posts{grid-template-columns:1fr;}
  .content-wrap{padding:2rem 1.25rem 4rem;}
  .hero-verse{padding:3rem 1.5rem 2.5rem;}
}`;

// ─── HTML GENERATOR ───────────────────────────────────────────────────────────
function html(d) {
  const waText = encodeURIComponent(`*${d.verseShort}*\n— ${d.ref}\n\nDevocional completo: ${BASE_URL}/devocional/${d.slug}`);
  const fbUrl  = encodeURIComponent(`${BASE_URL}/devocional/${d.slug}`);
  const twText = encodeURIComponent(`"${d.verseShort}" — ${d.ref}\n\n${BASE_URL}/devocional/${d.slug}`);
  const pageUrl = `${BASE_URL}/devocional/${d.slug}`;

  const navPrev = d.prev
    ? `<a href="/devocional/${d.prev.slug}" class="nav-post prev"><div class="direction">← Anterior</div><div class="post-title">${d.prev.title}</div></a>`
    : `<div></div>`;
  const navNext = d.next
    ? `<a href="/devocional/${d.next.slug}" class="nav-post next"><div class="direction">Siguiente →</div><div class="post-title">${d.next.title}</div></a>`
    : `<div></div>`;

  const faqSchema = d.faqs.map(f => `{
      "@type":"Question",
      "name":${JSON.stringify(f.q)},
      "acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(f.a)}}
    }`).join(',\n    ');

  const faqHtml = d.faqs.map(f => `
        <div class="faq-item">
          <button class="faq-question" onclick="toggleFaq(this)">
            ${f.q}<span class="faq-arrow">+</span>
          </button>
          <div class="faq-answer"><p>${f.a}</p></div>
        </div>`).join('');

  const tagsHtml = d.tags.map(t => `<span class="meta-tag">${t}</span>`).join('');

return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${d.title}</title>
  <meta name="description" content="${d.metaDesc}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${d.title}">
  <meta property="og:description" content="${d.metaDesc}">
  <meta property="og:image" content="${BASE_URL}/og-image.png">
  <meta property="og:site_name" content="Sonido de Vida">
  <meta property="og:locale" content="es_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${d.title}">
  <meta name="twitter:description" content="${d.metaDesc}">
  <meta name="twitter:image" content="${BASE_URL}/og-image.png">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article",
   "headline":${JSON.stringify(d.title)},
   "description":${JSON.stringify(d.metaDesc)},
   "image":"${BASE_URL}/og-image.png",
   "datePublished":"${d.date}",
   "author":{"@type":"Organization","name":"Sonido de Vida"},
   "publisher":{"@type":"Organization","name":"Sonido de Vida","logo":{"@type":"ImageObject","url":"${BASE_URL}/icon-512.png"}},
   "mainEntityOfPage":"${pageUrl}"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    ${faqSchema}
  ]}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>

<nav>
  <a href="/" class="nav-logo">♪ Sonido de Vida</a>
  <a href="/devocionales" class="nav-back">
    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
    Devocionales
  </a>
</nav>

<div class="hero-verse">
  <div class="tag">✦ Devocional</div>
  <div class="verse-ref">${d.ref}</div>
  <p class="verse-text">${d.verseShort}</p>
  <a href="/?libro=${encodeURIComponent(d.libro)}&cap=${d.cap}" class="audio-cta">
    <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
    Escuchar ${d.ref.split(':')[0]} en audio
  </a>
</div>

<div class="breadcrumb">
  <a href="/">Inicio</a><span>›</span>
  <a href="/devocionales">Devocionales</a><span>›</span>
  ${d.ref.split(':')[0]}
</div>

<div class="content-wrap">
  <h1 class="devocional-title">${d.h1}</h1>
  <div class="meta-info">
    <span>${d.dateLabel}</span>
    ${tagsHtml}
    <span class="meta-tag">5 min lectura</span>
  </div>
  <div class="divider"></div>

  <div class="devocional-body">
    ${d.bodyHtml}
  </div>

  <div class="prayer-section">
    <h3>✦ Oración</h3>
    <p>${d.prayer}</p>
  </div>

  <div class="listen-section">
    <h3>Escucha ${d.ref.split(':')[0]} completo en audio</h3>
    <p>Reina Valera 1909 · Voz clara · Gratis, sin registro</p>
    <a href="/?libro=${encodeURIComponent(d.libro)}&cap=${d.cap}" class="audio-cta">
      <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
      Abrir en Sonido de Vida
    </a>
  </div>

  <div class="faq-section">
    <h2>Preguntas frecuentes sobre ${d.ref.split(':')[0]}</h2>
    ${faqHtml}
  </div>

  <div class="share-section">
    <h4>Compartir este devocional</h4>
    <div class="share-buttons">
      <a class="share-btn share-whatsapp" href="https://wa.me/?text=${waText}" target="_blank" rel="noopener">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp
      </a>
      <a class="share-btn share-facebook" href="https://www.facebook.com/sharer/sharer.php?u=${fbUrl}" target="_blank" rel="noopener">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </a>
      <a class="share-btn share-twitter" href="https://twitter.com/intent/tweet?text=${twText}" target="_blank" rel="noopener">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
        X / Twitter
      </a>
      <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('${pageUrl}').then(()=>{this.textContent='¡Copiado!'})">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copiar link
      </button>
    </div>
  </div>

  <nav class="nav-posts">
    ${navPrev}
    ${navNext}
  </nav>
</div>

<script>
function toggleFaq(btn){
  const item=btn.closest('.faq-item');
  const isOpen=item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i=>i.classList.remove('open'));
  if(!isOpen)item.classList.add('open');
}
</script>
</body>
</html>`;
}

// ─── DEVOTIONAL DATA ──────────────────────────────────────────────────────────
const devotionals = [

// ── 1 ──────────────────────────────────────────────────────────────────────
{
  slug: 'genesis-1-1',
  ref: 'Génesis 1:1',
  libro: 'Genesis',
  cap: '1',
  date: '2026-05-23',
  dateLabel: '23 de mayo, 2026',
  verseShort: 'En el principio creó Dios los cielos y la tierra.',
  title: 'Génesis 1:1: Lo Que la Primera Frase de la Biblia Dice Sobre Tu Valor',
  metaDesc: '¿Qué significa "En el principio creó Dios"? Devocional profundo sobre Génesis 1:1: el significado de bara, bereshit y por qué la creación define tu identidad.',
  h1: 'Génesis 1:1: Antes que Existieras Tú, Existía Él',
  tags: ['Génesis', 'Identidad', 'Creación'],
  bodyHtml: `
    <p>La Biblia no empieza con una explicación. No empieza con una defensa de la existencia de Dios, ni con un argumento filosófico, ni con una lista de reglas. Empieza con un acto. <strong>Dios crea.</strong> Y ese primer movimiento lo dice todo.</p>
    <p>En hebreo, la primera palabra es <em>bereshit</em> — que no significa "en el principio" con artículo definido sino "en un comienzo", sin artículo. Como diciendo: antes de que el tiempo mismo tuviera nombre, antes de que hubiera un "antes"... Dios ya estaba ahí. Y creó.</p>

    <h2 class="section-title">Una palabra que solo Dios puede usar</h2>
    <p>El verbo que la Biblia usa aquí es <em>bara</em>. Y hay algo extraordinario en ese verbo: en todo el Antiguo Testamento, <strong>bara nunca tiene como sujeto a un ser humano</strong>. Solo Dios bara. Los humanos construimos, fabricamos, formamos — pero no bara. Bara implica crear de la nada, sin materia previa, sin modelo, sin necesidad. Es la clase de acto que solo puede hacer alguien que no depende de nada para existir.</p>
    <p>Esto importa porque establece desde la primera oración algo que el resto de la Biblia nunca olvida: <strong>hay una diferencia fundamental entre el Creador y lo creado</strong>. No somos chispas divinas. No somos dioses dormidos que necesitan despertar. Somos creaturas — y eso, lejos de ser una humillación, es nuestra mayor dignidad.</p>

    <div class="verse-block">
      <p>En el principio creó Dios los cielos y la tierra. Y la tierra estaba desordenada y vacía, y las tinieblas estaban sobre la superficie del abismo, y el Espíritu de Dios se movía sobre la superficie de las aguas.</p>
      <cite>— Génesis 1:1-2, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El caos antes del orden, y lo que eso te dice</h2>
    <p>Nótalo: antes de que Dios hablara, había caos. <em>Tohu vabohu</em> — sin forma y vacía. Tinieblas totales. Y el Espíritu de Dios se movía sobre eso. La imagen hebrea es la de un ave que aletea sobre sus huevos, que incuba el potencial de vida antes de que aparezca.</p>
    <p>Dios no busca materia prima perfecta para trabajar. Trabaja sobre el caos. Habla en medio de las tinieblas. <strong>Si hay áreas de tu vida que parecen tohu vabohu — sin forma, vacías, oscuras — ese es exactamente el tipo de material con el que Dios trabaja desde el primer día.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>En una cultura que dice "hazte a ti mismo", la Biblia empieza con una declaración radical: <strong>tú no te hiciste.</strong> Eso no es una limitación — es la fuente de tu valor. Tu dignidad no depende de lo que has logrado, sino de quién te creó y con qué propósito.</p>
    </div>

    <h2 class="section-title">La creación como declaración de amor</h2>
    <p>No había ninguna necesidad de que Dios creara. No había vacío en él que necesitara llenarse. No había soledad que resolver — la Trinidad era perfecta comunión antes del tiempo. Dios creó por desbordamiento, no por carencia. La creación es el exceso del amor trinitario volcándose hacia afuera.</p>
    <p>Lo que significa que cuando miras cualquier cosa creada — una montaña, un niño, tú mismo — estás mirando el exceso del amor de Dios tomando forma. Y cuando el mundo dice que eres un accidente cósmico, el primer versículo de la Biblia ya respondió eso hace milenios: <strong>tú eres una intención.</strong></p>`,
  prayer: 'Dios que estabas antes del principio: recuérdame hoy que no soy un accidente sino una intención tuya. Que mi valor no viene de lo que produzco ni de lo que otros piensan de mí, sino de que tú me bara — me creaste como solo tú sabes hacerlo. En el caos de mi día de hoy, muévete como lo hiciste sobre las aguas. Habla, y que haya luz. Amén.',
  faqs: [
    {q:'¿Qué significa "bara" en Génesis 1:1?', a:'Bara es el verbo hebreo que la Biblia usa exclusivamente para la acción creadora de Dios. A diferencia de otros verbos como "formar" o "hacer", bara implica creación desde la nada, sin materia previa. Nunca aparece con un sujeto humano en el Antiguo Testamento — solo Dios bara.'},
    {q:'¿Qué significa "bereshit" — "en el principio"?', a:'En hebreo, bereshit literalmente significa "en un comienzo", sin artículo definido. Esto sugiere que el texto está hablando de algo anterior al tiempo mismo — antes de que hubiera un "antes". Dios no está dentro del tiempo; el tiempo es parte de su creación.'},
    {q:'¿Por qué la tierra estaba "desordenada y vacía" antes de la creación?', a:'Los términos hebreos tohu vabohu describen un caos primordial — sin forma, sin propósito, sin vida. Esto establece un patrón que aparece en toda la Biblia: Dios trabaja precisamente sobre el caos y la vacuidad para producir orden y significado. Es una promesa implícita para cualquier área de nuestra vida que parezca sin forma.'},
    {q:'¿Cómo aplica Génesis 1:1 a mi identidad personal?', a:'Si Dios te creó con bara — con el mismo acto creador que usó para el universo — entonces tu existencia no es accidental. Tu valor no viene de tu productividad, tu apariencia ni tu historia. Viene de que eres obra de un Creador que nunca crea sin propósito. En la cultura del "hazte a ti mismo", Génesis 1:1 dice: ya fuiste hecho por alguien mayor que tú.'}
  ],
  prev: null,
  next: {slug:'salmos-23', title:'Salmos 23: Lo que David sabía que tú necesitas saber hoy'}
},

// ── 2 ──────────────────────────────────────────────────────────────────────
{
  slug: 'salmos-23',
  ref: 'Salmos 23:1',
  libro: 'Salmos',
  cap: '23',
  date: '2026-05-24',
  dateLabel: '24 de mayo, 2026',
  verseShort: 'El Señor es mi pastor; nada me faltará.',
  title: 'Salmos 23: El Señor es mi Pastor — Significado Profundo y Devocional',
  metaDesc: '¿Qué significa "El Señor es mi pastor, nada me faltará"? Devocional profundo sobre Salmos 23, su contexto bíblico y cómo aplicarlo en tiempos de incertidumbre.',
  h1: 'Salmos 23: Lo Que David Sabía Que Tú Necesitas Saber Hoy',
  tags: ['Salmos', 'Confianza', 'Provisión'],
  bodyHtml: `
    <p>Hay textos en la Biblia que conocemos tan bien que dejamos de escucharlos. Los recitamos desde la infancia, los grabamos en madera y los colgamos en la pared, y precisamente por eso algún día dejaron de hablarnos. El Salmo 23 es, quizás, el más peligroso en ese sentido. Es tan familiar que casi nunca lo leemos de verdad.</p>
    <p>Hoy quiero que lo veas como si fuera la primera vez.</p>

    <h2 class="section-title">Un hombre que conocía las ovejas por dentro</h2>
    <p>David no escribió este salmo desde un templo. No lo escribió con incienso en el ambiente. David lo escribió con olor a lana, con tierra en las manos, con años de noches solitarias bajo el cielo de Belén cuidando un rebaño que no era suyo. Él sabía exactamente lo que una oveja necesita — y lo que una oveja nunca puede darse a sí misma.</p>
    <p><strong>Las ovejas son los únicos animales domésticos que no sobreviven sin pastor.</strong> No tienen instinto de orientación como las palomas. No tienen defensas naturales como el perro. Son completamente dependientes. Y David, conociendo esto desde niño, un día miró su propia vida y dijo: <em>"Así soy yo. Y eso está bien, porque conozco a mi Pastor."</em></p>

    <div class="verse-block">
      <p>Jehová es mi pastor; nada me faltará. En lugares de delicados pastos me hará descansar; junto a aguas de reposo me pastoreará. Confortará mi alma; me guiará por sendas de justicia por amor de su nombre.</p>
      <cite>— Salmos 23:1-3, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El verbo que lo cambia todo</h2>
    <p>Nótalo: David no dijo <em>"el Señor será mi pastor"</em> ni <em>"ha sido mi pastor"</em>. Dijo <strong>"ES"</strong>. Tiempo presente. Los estudiosos creen que lo escribió durante la rebelión de Absalón — cuando su propio hijo lo perseguía para matarlo, cuando había perdido su trono y dormía en el desierto. Y en ese momento declaró que Dios era su pastor ahora mismo. La fe bíblica opera exactamente donde estás, no donde desearías estar.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>¿En qué tiempo conjugas tu fe habitualmente? ¿"Dios me ayudará algún día"? ¿"Antes Dios me sostuvo"? La invitación del Salmo 23 es que lo conviertas en presente: <strong>el Señor ES mi pastor hoy, en esto, aquí.</strong></p>
    </div>

    <h2 class="section-title">El valle que no puedes evitar, y la promesa que sí puedes tomar</h2>
    <p>Hay un versículo en este salmo que la gente bordó en cojines durante años sin entender bien lo que dice: <em>"aunque ande en el valle de sombra de muerte, no temeré mal alguno; porque tú estarás conmigo."</em> La palabra hebrea es <strong>tsalmavet</strong> — oscuridad de muerte. Y lo que David dice no es que Dios quitará ese valle de tu camino. Dice que <strong>no lo cruzarás solo.</strong></p>
    <p>Y el salmo termina con una imagen que en español pierde fuerza. En el hebreo original, David no dice que la bondad y la misericordia lo "seguirán". Dice que lo <strong>perseguirán</strong> — el mismo verbo que se usa para un enemigo que te caza. La gracia de Dios no es un favor ocasional. Es una persecución implacable que no descansa hasta alcanzarte.</p>`,
  prayer: 'Señor, hoy elijo creer que eres mi pastor. No en los días buenos solamente, sino en el valle donde estoy ahora mismo. Donde no veo salida, donde el miedo levanta su voz más alto que la fe — allí quiero encontrarte. Que tu presencia sea más real que mis circunstancias. Amén.',
  faqs: [
    {q:'¿Qué significa "El Señor es mi pastor, nada me faltará"?', a:'David declara que Dios provee todo lo necesario — no como riqueza automática, sino como suficiencia: todo lo que necesito para cumplir el propósito de Dios estará disponible a su tiempo. "Nada me faltará" es una promesa de provisión suficiente, no de abundancia ilimitada.'},
    {q:'¿Cuándo escribió David el Salmo 23?', a:'La mayoría de los estudiosos creen que fue en su madurez, posiblemente durante la rebelión de Absalón, cuando huía de su propio hijo. Eso hace que sus palabras de confianza no sean optimismo fácil sino fe probada en el fuego más doloroso.'},
    {q:'¿Qué significa "el valle de sombra de muerte" en Salmos 23:4?', a:'En hebreo, tsalmavet describe una oscuridad tan profunda que parece mortal. El versículo no promete que evitaremos ese valle, sino que no lo cruzaremos solos. La presencia de Dios no elimina el valle — lo transforma.'},
    {q:'¿Cómo aplicar el Salmo 23 en mi vida diaria?', a:'Léelo en voz alta sustituyendo el genérico por lo específico: "El Señor es mi pastor HOY, en ESTA situación." La fe bíblica no es abstracta — se ancla en el presente. También puedes escucharlo completo en nuestra app, dejando que las palabras entren cuando los ojos están cansados.'}
  ],
  prev: {slug:'genesis-1-1', title:'Génesis 1:1: Antes que Existieras Tú, Existía Él'},
  next: {slug:'salmos-91', title:'Salmos 91: La Promesa de Protección que Requiere una Condición'}
},

// ── 3 ──────────────────────────────────────────────────────────────────────
{
  slug: 'salmos-91',
  ref: 'Salmos 91:1',
  libro: 'Salmos',
  cap: '91',
  date: '2026-05-25',
  dateLabel: '25 de mayo, 2026',
  verseShort: 'El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente.',
  title: 'Salmos 91: La Promesa de Protección Que Requiere Una Condición que Nadie Menciona',
  metaDesc: 'El Salmo 91 promete protección, pero hay una condición en el versículo 1 que muchos ignoran. Devocional profundo sobre habitar vs. visitar a Dios.',
  h1: 'Salmos 91: Habitar en Dios No es lo Mismo que Visitarlo',
  tags: ['Salmos', 'Protección', 'Fe'],
  bodyHtml: `
    <p>El Salmo 91 es uno de los textos más proclamados en tiempos de crisis. Lo vemos en cadenas de WhatsApp, en carteles de iglesia, en oraciones de emergencia. Y es poderoso — cada una de sus promesas es real. Pero hay algo en el primer versículo que cambia todo, y que casi nunca se menciona.</p>
    <p><em>"El que habita al abrigo del Altísimo."</em> La promesa entera cuelga de esa palabra: <strong>habita</strong>.</p>

    <h2 class="section-title">La diferencia entre visitar y habitar</h2>
    <p>Habitar no es lo mismo que visitar. No es lo mismo que pasar por. Habitar es hacer tu hogar en algún lugar — es la dirección donde vives, no el lugar donde vas cuando hay emergencia. Y el Salmo 91 no está escrito para quien visita a Dios en momentos de crisis. Está escrito para quien vive allí permanentemente.</p>
    <p>Muchos de nosotros tenemos una relación turística con Dios: visitamos cuando el paisaje es bello o cuando hay peligro. Pero el Altísimo no es un refugio de emergencia — <strong>es un hogar al que llegas cada mañana antes de que llegue la crisis.</strong></p>

    <div class="verse-block">
      <p>El que habita al abrigo del Altísimo morará bajo la sombra del Omnipotente. Diré yo a Jehová: Esperanza mía, y castillo mío; mi Dios, en quien confiaré.</p>
      <cite>— Salmos 91:1-2, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">Las promesas que siguen — y por qué son para quienes habitan</h2>
    <p>Después del primer versículo, el salmo despliega un catálogo extraordinario de promesas: protección de lazo, enfermedad, terror nocturno, saeta, pestilencia. Ángeles que te llevan en las manos para que no tropieces. Mil que caen a tu lado y tú no. Es poderoso, sí. Pero el salmista no dice "reclama estas promesas en el momento de peligro". Dice: habita primero.</p>
    <p>Y hay una ironía notable: los versículos 11 y 12 — "a sus ángeles mandará para que te guarden... en las manos te llevarán" — son exactamente los que Satanás citó a Jesús durante la tentación en el desierto. Hasta el enemigo conoce este salmo. La diferencia entre usarlo como promesa y usarlo como arma es la misma diferencia entre <strong>confiar en Dios y poner a prueba a Dios.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>¿Cuándo recurres a Dios habitualmente? ¿Solo en crisis, o como práctica diaria? <strong>La protección del Salmo 91 no es una armadura que te pones cuando hay batalla — es la atmósfera en la que ya vives cuando la batalla llega.</strong></p>
    </div>

    <h2 class="section-title">El final del salmo: Dios habla en primera persona</h2>
    <p>El Salmo 91 termina de forma única entre todos los salmos: Dios mismo toma la palabra en los versículos 14 al 16. Y la condición que menciona no es oración, ni ayuno, ni ritual. Es una sola cosa: <em>"Por cuanto en mí ha puesto su amor."</em> Conocer el nombre de Dios — intimidad real, no información religiosa. <strong>La protección más profunda no viene de recitar el salmo sino de conocer al Autor.</strong></p>`,
  prayer: 'Señor, quiero ser alguien que habita en ti y no solo que te visita. Que mi primera dirección sea tu presencia, no el problema del día. Enséñame a vivir en ti antes de que llegue la tormenta, para que cuando llegue ya estés en casa conmigo. Amén.',
  faqs: [
    {q:'¿Qué significa "habitar al abrigo del Altísimo" en Salmos 91:1?', a:'"Habitar" implica residencia permanente, no visita ocasional. El abrigo del Altísimo es el lugar de protección divina que está disponible para quien vive en comunión continua con Dios, no solo para quien lo busca en emergencias.'},
    {q:'¿Es el Salmo 91 una promesa de que no nos pasará nada malo?', a:'No. El Salmo 91 promete la presencia y el apoyo de Dios en medio de los peligros, no la ausencia de los peligros mismos. Versículos como "mil caerán a tu lado" implican que habrá batalla — la promesa es que estarás de pie al final.'},
    {q:'¿Por qué Satanás citó el Salmo 91 para tentar a Jesús?', a:'En Mateo 4:6, Satanás cita los versículos 11-12 para invitar a Jesús a tirarse del templo y probar que los ángeles lo sostendrían. Jesús respondió que no se debe tentar a Dios. Esto muestra la diferencia entre confiar en las promesas de Dios (fe) y usarlas para forzar su mano (manipulación).'},
    {q:'¿Cómo "habitar en Dios" de forma práctica?', a:'Habitar implica una comunicación continua con Dios — no solo oraciones de emergencia sino conversación ordinaria a lo largo del día. Leer su Palabra no como tarea sino como alimento. Traer decisiones pequeñas y grandes a su presencia. Es una postura de dependencia diaria, no un ritual semanal.'}
  ],
  prev: {slug:'salmos-23', title:'Salmos 23: Lo que David sabía que tú necesitas saber hoy'},
  next: {slug:'proverbios-3-5', title:'Proverbios 3:5-6: Confiar de todo corazón cuando la mente dice lo contrario'}
},

// ── 4 ──────────────────────────────────────────────────────────────────────
{
  slug: 'proverbios-3-5',
  ref: 'Proverbios 3:5-6',
  libro: 'Proverbios',
  cap: '3',
  date: '2026-05-26',
  dateLabel: '26 de mayo, 2026',
  verseShort: 'Confía en Jehová con todo tu corazón, y no te apoyes en tu propio entendimiento.',
  title: 'Proverbios 3:5-6: Confiar en Dios Cuando Tu Mente Dice lo Contrario',
  metaDesc: 'Devocional sobre Proverbios 3:5-6. Qué significa confiar con todo el corazón, por qué no apoyarse en el propio entendimiento, y cómo Dios endereza tus caminos.',
  h1: 'Proverbios 3:5-6: El Arte de Soltar el Mapa Cuando Dios es el GPS',
  tags: ['Proverbios', 'Sabiduría', 'Confianza'],
  bodyHtml: `
    <p>Vivimos en una cultura que nos dice que la máxima virtud es confiar en uno mismo. "Sigue tu corazón. Confía en tu instinto. Tú sabes lo que necesitas." Y en ese contexto, el sabio Salomón escribe algo que suena casi como una provocación: <em>"no te apoyes en tu propio entendimiento."</em></p>
    <p>No es anti-intelectual. No es una invitación a la irresponsabilidad. Es algo mucho más profundo.</p>

    <h2 class="section-title">Lo que significa "batach" — el peso completo</h2>
    <p>La palabra hebrea para confiar en este versículo es <em>batach</em>. No significa "tener esperanza" ni "creer en principio". Batach es una imagen física: significa inclinarse hacia algo hasta que ese algo sostiene todo tu peso. Como cuando te sientas en una silla — no te quedas parado a un lado "creyendo" que aguantará. Le pones todo el peso encima y te sueltas.</p>
    <p><strong>"Confía en Jehová con todo tu corazón"</strong> es una invitación a batach completo — no confianza parcial, no fe de respaldo por si acaso, sino el peso completo de tu vida sobre Él. Y la condición del versículo siguiente tiene sentido en ese contexto: si sigues apoyado en tu propio entendimiento, nunca podrás batach completamente en Dios. Son posturas incompatibles.</p>

    <div class="verse-block">
      <p>Confía en Jehová con todo tu corazón, y no te apoyes en tu propio entendimiento. Reconócele en todos tus caminos, y él enderezará tus veredas.</p>
      <cite>— Proverbios 3:5-6, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El entendimiento propio y sus límites</h2>
    <p>Dios no te pide que apagues tu inteligencia. Él te la dio. Lo que este versículo señala es un límite específico: tu perspectiva es parcial. Ves el presente, algo del pasado y muy poco del futuro. Dios ve el arco completo de tu historia y sabe dónde llevan los caminos que tú no puedes ver todavía.</p>
    <p>Apoyarte en tu propio entendimiento como único árbitro es como navigar con un mapa que solo tiene la cuadra donde estás. Puede funcionar para moverte unos metros. Pero si el destino está lejos, necesitas a alguien que tenga el mapa completo.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"Reconócele en todos tus caminos" — no solo en las decisiones grandes. En todos. La frase implica incluirlo en la conversación de cada decisión, no solo las que parecen espirituales. <strong>La fe que solo aparece en los momentos importantes es turismo; la que aparece en lo ordinario es habitación.</strong></p>
    </div>

    <h2 class="section-title">"Él enderezará tus veredas" — una promesa activa</h2>
    <p>La promesa final del versículo 6 no dice que Dios quitará todos los obstáculos de tu camino ni que pondrá autopistas donde había montañas. Dice que <em>enderezará tus veredas</em> — hará que el camino sea suficientemente claro para que puedas andar. No promete GPS en tiempo real. Promete suficiente luz para el siguiente paso.</p>
    <p>Y a veces eso es todo lo que necesitamos: no ver el destino final, sino ver dónde poner el pie ahora mismo.</p>`,
  prayer: 'Señor, hoy quiero batach en ti — ponerte el peso completo. Hay decisiones que estoy intentando resolver con mi propio mapa, y el mapa es demasiado pequeño. Reconócete en mis caminos de hoy — en el pequeño y en el grande. Y endereza lo que yo solo puedo torcer. Amén.',
  faqs: [
    {q:'¿Qué significa "confiar con todo tu corazón" en Proverbios 3:5?', a:'La palabra hebrea batach implica apoyarse completamente en algo, poniendo todo el peso sobre ello. No es una creencia teórica sino una postura activa de dependencia total. Confiar con todo el corazón significa que no hay un plan de respaldo personal operando en paralelo.'},
    {q:'¿Por qué dice "no te apoyes en tu propio entendimiento"?', a:'No es anti-intelectual. Es un reconocimiento de los límites de nuestra perspectiva: vemos el presente y parte del pasado, pero Dios ve el arco completo de nuestra historia. Apoyarnos solo en nuestra comprensión es navegar con un mapa incompleto.'},
    {q:'¿Qué significa "reconócele en todos tus caminos"?', a:'"Todos" es la palabra clave — no solo las decisiones importantes o los momentos de crisis, sino cada camino: el trabajo, las relaciones, las decisiones pequeñas. Incluir a Dios en la conversación ordinaria es lo que distingue la fe como estilo de vida de la religión como evento semanal.'},
    {q:'¿Qué promete "Él enderezará tus veredas"?', a:'La promesa no es que Dios eliminará todos los obstáculos ni que el camino será siempre fácil. Enderezar las veredas significa hacer que el camino sea suficientemente claro para avanzar — no visión del destino final, sino luz suficiente para el siguiente paso.'}
  ],
  prev: {slug:'salmos-91', title:'Salmos 91: La Promesa de Protección que Requiere una Condición'},
  next: {slug:'isaias-40-31', title:'Isaías 40:31: Lo que Significa Esperar a Dios Cuando el Mundo Se Cae'}
},

// ── 5 ──────────────────────────────────────────────────────────────────────
{
  slug: 'isaias-40-31',
  ref: 'Isaías 40:31',
  libro: 'Isaias',
  cap: '40',
  date: '2026-05-27',
  dateLabel: '27 de mayo, 2026',
  verseShort: 'Los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas.',
  title: 'Isaías 40:31: Lo Que Significa Esperar a Dios Cuando el Mundo Se Cae',
  metaDesc: 'Devocional sobre Isaías 40:31. El significado hebreo de "esperar en Dios" (qavah), por qué las águilas no son el punto más alto, y cómo no desmayar en lo ordinario.',
  h1: 'Isaías 40:31: La Promesa Más Importante No es Volar — es No Desmayar',
  tags: ['Isaías', 'Esperanza', 'Fortaleza'],
  bodyHtml: `
    <p>Cuando el mundo se derrumba, tendemos a pedir alas de águila. Queremos elevarnos por encima del problema, ver desde arriba, volar libre de lo que nos aplasta. Y el texto lo promete. Pero si lees Isaías 40:31 con cuidado, descubres que las águilas no son el punto más importante del versículo.</p>

    <h2 class="section-title">Qavah: esperar con tensión activa</h2>
    <p>La palabra hebrea que se traduce como "esperar" es <em>qavah</em>. Y no significa sentarse a aguardar pasivamente. Qavah viene de una raíz que significa trenzar, retorcer fibras juntas bajo tensión — como se hace con una cuerda. La imagen es de fibras que están siendo tensadas, jaladas, puestas a prueba, y en ese proceso se vuelven más fuertes y unidas.</p>
    <p><strong>Esperar en Dios no es inactividad. Es una tensión activa — permanecer anclado en Él mientras la corriente jala en todas las demás direcciones.</strong> El que espera según Isaías no está cruzado de brazos; está usando toda su energía para mantenerse orientado hacia Dios cuando todo le dice que mire hacia otro lado.</p>

    <div class="verse-block">
      <p>Pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.</p>
      <cite>— Isaías 40:31, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El orden descendente que nadie menciona</h2>
    <p>Nota el orden de las tres promesas: águilas, luego correr, luego caminar. La mayoría lo lee como una escalada — primero lo básico, luego lo intermedio, luego lo glorioso. Pero es al revés. Las águilas son los momentos de euforia espiritual — cuando sientes la presencia de Dios como algo tangible, cuando la fe parece fácil. Correr es el esfuerzo sostenido — cuando todavía hay energía pero ya no es emocionante. Y caminar es lo ordinario. El martes normal. El día en que nada es dramático y la fe no se siente como nada especial.</p>
    <p><strong>La promesa más difícil del versículo no es volar — es caminar sin fatigarse.</strong> Cualquiera puede tener fe en el momento de la crisis o de la euforia. La fe madura es la que persiste en lo ordinario, semana tras semana, sin señales especiales, sin emoción intensa, sin ver el resultado todavía.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>¿En cuál de las tres etapas estás hoy — águilas, carrera o caminata? <strong>La promesa de Isaías cubre las tres. Dios no solo aparece en los momentos de euforia espiritual; es precisamente en la caminata ordinaria donde más necesitas su fortaleza y donde más claramente se prueba si la fe es real.</strong></p>
    </div>

    <h2 class="section-title">El contexto: Dios habla a un pueblo que ya no creía</h2>
    <p>Isaías escribió este versículo para judíos en cautiverio babilónico — personas que habían perdido su tierra, su templo, su rey, y muchos de los cuales empezaban a creer que Dios se había olvidado de ellos. El versículo anterior (40:30) dice que "los jóvenes se fatigan y se cansan, los más fuertes flaquean y caen." Hasta la energía natural de la juventud tiene un límite. La fortaleza de Dios, no.</p>
    <p>Esta promesa no es para quien está en la cima. Es para quien está al límite de sus fuerzas y se pregunta si tiene sentido seguir esperando.</p>`,
  prayer: 'Señor, hoy no me siento con alas de águila. Ni siquiera siento que puedo correr. Estoy en la caminata — ordinaria, sin señales, sin emoción. Y en este lugar ordinario te pido que cumplas la promesa más difícil del versículo: que yo pueda caminar y no fatigarme. Ser fiel cuando no es dramático. Amén.',
  faqs: [
    {q:'¿Qué significa "esperar en Jehová" en Isaías 40:31?', a:'La palabra hebrea qavah no implica espera pasiva sino tensión activa — como fibras de cuerda siendo trenzadas bajo tensión. Esperar en Dios significa mantenerse orientado hacia Él mientras todo jala en otras direcciones, con toda la energía que eso requiere.'},
    {q:'¿Por qué menciona águilas, correr y caminar en ese orden?', a:'El orden es descendente, no ascendente. Las águilas representan los momentos de euforia espiritual; correr, el esfuerzo sostenido; caminar, lo ordinario diario. La promesa más difícil y más necesaria es la última: caminar sin fatigarse, ser fiel en lo cotidiano sin señales ni emoción.'},
    {q:'¿Para quién escribió Isaías este versículo?', a:'Para judíos en cautiverio babilónico que habían perdido todo y comenzaban a creer que Dios los había olvidado. El versículo anterior dice que "hasta los jóvenes se fatigan" — reconoce que la energía humana tiene límite. Esta promesa es para quien está al borde de sus fuerzas.'},
    {q:'¿Cómo "esperar en Dios" cuando no siento nada?', a:'La promesa de Isaías 40:31 no depende de sentir la presencia de Dios. Qavah es una decisión de orientación, no un estado emocional. En los momentos secos, esperar en Dios puede verse así: leer su Palabra aunque no sientas nada, orar aunque parezca al vacío, seguir fieles a lo que sabes que es correcto aunque no haya señal de confirmación.'}
  ],
  prev: {slug:'proverbios-3-5', title:'Proverbios 3:5-6: Confiar de todo corazón cuando la mente dice lo contrario'},
  next: {slug:'jeremias-29-11', title:'Jeremías 29:11: La Promesa que Dios Hizo a Gente que Lo Había Perdido Todo'}
},

// ── 6 ──────────────────────────────────────────────────────────────────────
{
  slug: 'jeremias-29-11',
  ref: 'Jeremías 29:11',
  libro: 'Jeremias',
  cap: '29',
  date: '2026-05-28',
  dateLabel: '28 de mayo, 2026',
  verseShort: 'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz y no de mal.',
  title: 'Jeremías 29:11: La Promesa de Dios Que Fue Escrita Para Gente que Lo Había Perdido Todo',
  metaDesc: 'Jeremías 29:11 es el versículo más usado en tazas de café, pero el contexto lo cambia todo. Fue escrito para exiliados que esperarían 70 años. Devocional profundo.',
  h1: 'Jeremías 29:11: Lo Que Esta Promesa Realmente Costó Escuchar',
  tags: ['Jeremías', 'Esperanza', 'Propósito'],
  bodyHtml: `
    <p>Si hay un versículo que aparece en más tazas de café, más citas de Instagram y más decoración de cuartos de quinceañera que cualquier otro, es Jeremías 29:11. <em>"Porque yo sé los pensamientos que tengo acerca de vosotros... pensamientos de paz y no de mal, para daros el fin que esperáis."</em></p>
    <p>Es hermoso. Es real. Y el contexto lo hace todavía más poderoso — y más exigente — de lo que la mayoría de nosotros hemos considerado.</p>

    <h2 class="section-title">La carta que nadie quería recibir</h2>
    <p>Jeremías escribió esto como carta a un grupo de personas muy específico: judíos que acababan de ser deportados a Babilonia. Habían perdido sus casas, su país, su templo, la presencia de Dios tal como la conocían. Llevaban meses en tierra extraña, sin entender por qué. Y antes de darles la promesa del versículo 11, Dios les dice algo que los profetas falsos no estaban diciendo: <em>van a estar aquí setenta años.</em> No semanas. No meses. <strong>Setenta años.</strong></p>
    <p>La promesa de Jeremías 29:11 no fue dada a personas a punto de salir de su crisis. Fue dada a personas que iban a vivir y morir en el exilio — y cuya esperanza era que sus hijos o nietos verían el cumplimiento.</p>

    <div class="verse-block">
      <p>Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis. Entonces me invocaréis, y vendréis y oraréis a mí, y yo os oiré.</p>
      <cite>— Jeremías 29:11-12, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El plan que Dios conoce pero no siempre revela</h2>
    <p>Nota la frase: <em>"Yo sé los pensamientos."</em> No "yo te revelaré el plan" ni "te daré el mapa de tu futuro". Dice que Él lo sabe. El conocimiento es de Dios, no el mapa nuestro. Y a veces la mayor prueba de fe no es caminar en la oscuridad total, sino caminar sabiendo que alguien más tiene la luz aunque tú no la tengas.</p>
    <p>Los profetas falsos en tiempos de Jeremías prometían que el exilio duraría dos años — que todo se resolvería pronto. Jeremías no prometió eso. Prometió algo más real y más difícil: <strong>que el tiempo en el exilio no era tiempo perdido sino tiempo dentro de un plan que Dios ya conocía.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>¿Qué haría diferente tu actitud si supieras que tu "exilio" actual forma parte de un plan que Dios ya conoce? La promesa del versículo 11 no te dice cuánto durará ni cómo terminará. <strong>Te dice que el que diseñó el final conoce tus pensamientos y los suyos hacia ti son de paz.</strong></p>
    </div>

    <h2 class="section-title">La condición que viene después de la promesa</h2>
    <p>El versículo 13 dice: <em>"me buscaréis y me hallaréis cuando me busquéis de todo vuestro corazón."</em> La promesa del plan bueno viene acompañada de una invitación: buscarlo donde estás, no solo donde quisieras estar. No esperar a salir del exilio para buscar a Dios. Buscarlo en Babilonia, en el martes difícil, en el año que no tenías planeado. <strong>El plan de Dios se activa donde tú estás, no donde quisieras estar.</strong></p>`,
  prayer: 'Señor, hoy no veo el final del camino. No sé cuánto durará esto. Pero tú sí lo sabes, y lo que sé de ti me dice que tus planes hacia mí son de paz. Enséñame a buscarte aquí, en este exilio que no pedí, y a confiar en que este tiempo no es tiempo perdido sino tiempo dentro de tu mapa. Amén.',
  faqs: [
    {q:'¿A quién le dijo Dios Jeremías 29:11?', a:'A judíos que acababan de ser deportados a Babilonia y perderían todo durante setenta años. Esta promesa no fue dada a personas a punto de salir de su crisis, sino a quienes vivirían en el exilio por décadas. Eso la hace más poderosa — y más exigente — de lo que parece en una cita de Instagram.'},
    {q:'¿Significa Jeremías 29:11 que todo me saldrá bien pronto?', a:'No necesariamente. La promesa original se cumplió setenta años después, para los hijos y nietos de quienes la escucharon. Lo que sí garantiza es que Dios conoce un plan de bien para tu vida — no que ese plan se revelará en tu cronograma, sino en el suyo.'},
    {q:'¿Qué son los "pensamientos de paz" que Dios tiene?', a:'"Shalom" — la palabra hebrea traducida como "paz" — no es solo ausencia de conflicto. Es bienestar total, plenitud, completud. Los planes de Dios apuntan a tu shalom: que nada te falte para ser lo que fuiste creado para ser. Eso incluye el proceso, no solo el destino.'},
    {q:'¿Hay una condición en Jeremías 29:11?', a:'Sí, en el versículo 13: "me buscaréis y me hallaréis cuando me busquéis de todo vuestro corazón." El plan de Dios no opera en piloto automático. Se activa en la persona que lo busca donde está — en Babilonia, en el exilio, en el año difícil — con todo su corazón.'}
  ],
  prev: {slug:'isaias-40-31', title:'Isaías 40:31: Lo que Significa Esperar a Dios Cuando el Mundo Se Cae'},
  next: {slug:'mateo-6-33', title:'Mateo 6:33: Qué Significa Buscar Primero el Reino de Dios en la Vida Real'}
},

// ── 7 ──────────────────────────────────────────────────────────────────────
{
  slug: 'mateo-6-33',
  ref: 'Mateo 6:33',
  libro: 'Mateo',
  cap: '6',
  date: '2026-05-29',
  dateLabel: '29 de mayo, 2026',
  verseShort: 'Buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.',
  title: 'Mateo 6:33: Qué Significa Buscar Primero el Reino de Dios en la Vida Real',
  metaDesc: 'Devocional sobre Mateo 6:33. Qué es el "reino de Dios", qué significa "primeramente", y por qué Jesús hizo esta promesa a personas pobres, no a personas ricas.',
  h1: 'Mateo 6:33: Jesús No Dijo Esto Desde un Escenario — Lo Dijo en una Colina',
  tags: ['Mateo', 'Reino de Dios', 'Prioridades'],
  bodyHtml: `
    <p>Este versículo se predica frecuentemente como una fórmula de prosperidad: pon a Dios primero y Él te dará todo lo demás. Y aunque hay verdad en eso, el contexto del Sermón del Monte lo hace mucho más radical y mucho más específico que una fórmula de éxito.</p>

    <h2 class="section-title">Jesús habló a personas que no tenían nada que perder</h2>
    <p>El capítulo 6 de Mateo es parte del Sermón del Monte. El auditorio no eran empresarios buscando el secreto del éxito. Eran campesinos, pescadores, personas con trabajos inestables, familias que vivían al borde de la subsistencia en una región ocupada por Roma. Cuando Jesús dijo <em>"no os afanéis"</em> por la comida y el vestido, hablaba a personas que tenían razones concretas para afanarse — no razones teóricas.</p>
    <p>Y en ese contexto, la invitación a buscar "primeramente" el reino no era un lujo espiritual de gente que ya tiene todo resuelto. Era una invitación radical a reorganizar las prioridades de personas que estaban sobreviviendo.</p>

    <div class="verse-block">
      <p>Más buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas. Así que, no os afanéis por el día de mañana, porque el día de mañana traerá su afán.</p>
      <cite>— Mateo 6:33-34, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">¿Qué es el "reino de Dios"?</h2>
    <p>El reino de Dios en el Nuevo Testamento no es principalmente un lugar al que iremos después de morir. Es el reinado activo de Dios — su voluntad siendo hecha, su carácter expresándose, su orden reemplazando el desorden humano — aquí, ahora, en la vida real. Cuando Jesús dice "busca primero el reino", está diciendo: <strong>haz de la voluntad de Dios tu primera prioridad operativa, no solo tu primera prioridad declarada.</strong></p>
    <p>Hay una diferencia enorme entre decir que Dios es lo primero en tu vida y organizarla como si realmente lo fuera. El versículo no habla de lo que declaras sino de lo que buscas — el verbo es activo, continuo, intencional.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"Primeramente" en griego es proton — primero en secuencia. No "solo", sino "primero". Jesús no dijo que no te importes por el pan de mañana. Dijo que lo pongas segundo. <strong>¿En tu agenda real, en tus decisiones de dinero y tiempo, qué es genuinamente proton?</strong></p>
    </div>

    <h2 class="section-title">"Todas estas cosas os serán añadidas" — la lógica de la adición</h2>
    <p>La promesa usa el verbo "añadidas" — no "ganadas", no "merecidas", sino añadidas como consecuencia de una prioridad correcta. La provisión de Dios opera como consecuencia del orden correcto, no como recompensa por el rendimiento religioso. <strong>No se trata de hacer suficientes méritos para que Dios te deba algo. Se trata de alinearte con la lógica del reino, donde la provisión fluye como subproducto de la orientación correcta.</strong></p>
    <p>Y Jesús termina el capítulo con algo brutalmente práctico: no te afanes por mañana porque cada día tiene su propio afán. El reino no se busca en el futuro abstracto — se busca en el presente concreto, en las decisiones de hoy.</p>`,
  prayer: 'Señor, quiero que proton en mi vida sea real y no solo declarado. Donde mi tiempo y mi dinero, mis planes y mis miedos digan quién es verdaderamente primero. Hoy te invito a ser primera prioridad operativa — no solo espiritual. Y confío en que lo que necesite vendrá añadido. Amén.',
  faqs: [
    {q:'¿Qué significa "el reino de Dios" en Mateo 6:33?', a:'El reino de Dios no es solo el cielo futuro — es el reinado activo de Dios en el presente: su voluntad siendo hecha, su orden reemplazando el desorden humano. Buscar el reino significa hacer de la voluntad de Dios tu primera prioridad operativa en las decisiones reales de tu vida.'},
    {q:'¿Qué significa "buscar primeramente"?', a:'"Primeramente" en griego es proton — primero en secuencia, no en exclusividad. Jesús no dijo que ignores tus necesidades materiales, sino que las pongas en segundo lugar. La fe cristiana es una organización de prioridades, no un desprecio de lo práctico.'},
    {q:'¿Es Mateo 6:33 una promesa de prosperidad material?', a:'No exactamente. Jesús hablaba a campesinos pobres, no a personas ricas. La promesa de que "todas estas cosas serán añadidas" se refiere a provisión suficiente para las necesidades básicas como consecuencia de prioridades correctas, no como recompensa por méritos religiosos.'},
    {q:'¿Cómo "buscar el reino" en la vida cotidiana?', a:'Buscar el reino no es solo orar más — es preguntarse en cada decisión: ¿cómo actúa alguien bajo el reinado de Dios en esta situación? ¿Qué diría su voluntad aquí? Incluye las decisiones de dinero, tiempo, relaciones y trabajo, no solo las decisiones "espirituales".'}
  ],
  prev: {slug:'jeremias-29-11', title:'Jeremías 29:11: La Promesa que Dios Hizo a Gente que Lo Había Perdido Todo'},
  next: {slug:'juan-3-16', title:'Juan 3:16: El Versículo Más Conocido y el Más Malentendido'}
},

// ── 8 ──────────────────────────────────────────────────────────────────────
{
  slug: 'juan-3-16',
  ref: 'Juan 3:16',
  libro: 'Juan',
  cap: '3',
  date: '2026-05-30',
  dateLabel: '30 de mayo, 2026',
  verseShort: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.',
  title: 'Juan 3:16: El Versículo Más Conocido del Mundo y el Más Malentendido',
  metaDesc: 'Devocional sobre Juan 3:16. Qué significa "de tal manera", quién era Nicodemo, por qué "unigénito" no es solo "único hijo", y qué es "vida eterna" realmente.',
  h1: 'Juan 3:16: Lo Que Pasó en Esa Noche que Cambió Todo',
  tags: ['Juan', 'Salvación', 'Amor de Dios'],
  bodyHtml: `
    <p>Si hay un versículo que la gente lleva tatuado, grita en los estadios de fútbol y bordó en la primera página de su Biblia, es Juan 3:16. Lo conocemos de memoria. Y precisamente por eso, vale la pena releerlo como si fuera la primera vez — porque tiene capas que la familiaridad nos ha robado.</p>

    <h2 class="section-title">La noche en que Nicodemo no podía dormir</h2>
    <p>Jesús dijo esto de noche, en una conversación privada con un hombre llamado Nicodemo. Y el detalle de la noche importa: Nicodemo era fariseo, miembro del Sanedrín, parte de la élite religiosa. Si se reunía con Jesús de día, su reputación estaba en riesgo. Vino de noche — con curiosidad genuina pero también con miedo al costo. <strong>Jesús no lo juzgó por eso. Le dijo la verdad de frente.</strong></p>
    <p>Y la ironía es notable: el experto religioso que conocía la Ley de memoria no entendía la cosa más básica — que Dios lo amaba y quería que viviera. A veces la familiaridad con lo religioso es el mayor obstáculo para recibir lo espiritual.</p>

    <div class="verse-block">
      <p>Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.</p>
      <cite>— Juan 3:16, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"De tal manera" — no solo cuánto sino cómo</h2>
    <p>En el griego original, la frase es <em>houtos ēgapēsen</em> — "de esta manera amó". No "cuánto amó" sino <strong>cómo amó</strong>. La palabra houtos apunta al método, a la forma específica del amor: dando a su Hijo. No con palabras, no con promesas, no con decretos desde lejos — sino con la entrega más costosa posible.</p>
    <p>El amor de Dios no es un sentimiento que Él tiene. Es un acto que Él ejecutó. Y la medida de ese amor no es cómo te sientes cuando oras, sino lo que ya sucedió en una cruz hace dos mil años, independientemente de cómo te sientas hoy.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"Unigénito" en griego es monogenēs — único en su clase, sin par, irrepetible. No es solo que Dios no tuviera otro hijo. Es que no existía nada comparable a lo que entregó. <strong>Cuando Dios midió el costo de amarte y decidió pagarlo de todas formas, usó la moneda más alta que existía.</strong></p>
    </div>

    <h2 class="section-title">"Vida eterna" no es solo vivir para siempre</h2>
    <p>La frase <em>zōē aiōnios</em> — vida eterna — en el griego del Nuevo Testamento no se refiere principalmente a la duración de la vida sino a su calidad. Es la vida propia de la era venidera — la vida que pertenece al reino de Dios, que tiene la textura de la eternidad porque viene de Él. Juan 17:3 lo define: <em>"Y esta es la vida eterna: que te conozcan a ti, el único Dios verdadero."</em></p>
    <p>Vida eterna no es la recompensa que recibirás cuando mueras. Es la clase de vida que empieza cuando te conectas con su Fuente — aquí, ahora, en este lado de la muerte. El que cree, dice Jesús, ya tiene vida eterna. No la espera — la vive.</p>`,
  prayer: 'Dios que de tal manera amaste: hoy quiero recibir ese amor no como doctrina sino como realidad. Que lo que hiciste en la cruz no sea solo historia que sé sino verdad que vivo. Que la vida eterna que me ofreciste sea la calidad de vida que experimento empezando hoy. Amén.',
  faqs: [
    {q:'¿Qué significa "de tal manera amó Dios" en Juan 3:16?', a:'En griego, houtos apunta al método del amor, no solo a su intensidad: de esta manera específica amó — dando a su Hijo. El amor de Dios no es un sentimiento, es un acto que ya ocurrió en la cruz, independientemente de cómo nos sintamos hoy.'},
    {q:'¿Qué significa "unigénito"?', a:'Monogenēs en griego significa único en su clase, irrepetible, sin par. No solo que Dios no tuviera otro hijo — sino que no había nada comparable a lo que entregó. Fue la moneda más alta posible pagada deliberadamente por amor.'},
    {q:'¿Qué es "vida eterna"?', a:'Zōē aiōnios en el griego del Nuevo Testamento no es principalmente duración sino calidad: la vida propia del reino de Dios. Juan 17:3 la define como conocer a Dios. No es la recompensa tras la muerte — es la clase de vida que comienza cuando uno se conecta con su Fuente, aquí y ahora.'},
    {q:'¿Quién era Nicodemo y por qué importa que viniera de noche?', a:'Nicodemo era fariseo y miembro del Sanedrín — élite religiosa que podría haber perdido su posición si lo veían con Jesús. Vino de noche por precaución. Jesús no lo rechazó por eso. Esta conversación muestra que Dios recibe a los que vienen con duda y miedo, no solo a los que llegan con certeza.'}
  ],
  prev: {slug:'mateo-6-33', title:'Mateo 6:33: Qué Significa Buscar Primero el Reino de Dios en la Vida Real'},
  next: {slug:'romanos-8-1', title:'Romanos 8:1: La Libertad que Dios Da a los Que Ya No Creen Merecerla'}
},

// ── 9 ──────────────────────────────────────────────────────────────────────
{
  slug: 'romanos-8-1',
  ref: 'Romanos 8:1',
  libro: 'Romanos',
  cap: '8',
  date: '2026-05-31',
  dateLabel: '31 de mayo, 2026',
  verseShort: 'Ahora, pues, ninguna condenación hay para los que están en Cristo Jesús.',
  title: 'Romanos 8:1: La Libertad que Dios Da a los Que Ya No Creen Merecerla',
  metaDesc: 'Devocional sobre Romanos 8:1. Por qué "ninguna condenación" es un veredicto legal, no un sentimiento. La diferencia entre condenación y convicción. Cómo vivir en libertad.',
  h1: 'Romanos 8:1: El Veredicto Que Nadie Esperaba Después del Capítulo 7',
  tags: ['Romanos', 'Libertad', 'Gracia'],
  bodyHtml: `
    <p>Para entender Romanos 8:1, tienes que leer primero Romanos 7. Y Romanos 7 es incómodo. Es el capítulo donde Pablo — el apóstol, el teólogo, el que escribió la mitad del Nuevo Testamento — dice sin vergüenza: <em>"el bien que quiero, no lo hago; y el mal que no quiero, eso practico."</em> Es la confesión más honesta de fracaso espiritual en toda la Escritura.</p>
    <p>Y termina el capítulo con un grito: <em>"¡Miserable hombre de mí! ¿Quién me librará de este cuerpo de muerte?"</em> No es retórica. Es el fondo del pozo.</p>

    <h2 class="section-title">La puerta que se abre después del fondo</h2>
    <p>Y entonces, sin pausa, sin transición larga: <em>"Ahora, pues, ninguna condenación hay para los que están en Cristo Jesús."</em> El contraste es deliberado y violento. Miserable en el 7, libre en el 8. No porque Pablo cambió. No porque encontró la disciplina correcta. Sino porque en medio de su fracaso descubrió dónde estaba parado: en Cristo.</p>
    <p><strong>"Ninguna condenación"</strong> es lenguaje de tribunal. Katakrima en griego — el veredicto del juez, la sentencia final. Pablo no dice "Dios no está molesto conmigo" ni "Dios me entiende y tiene paciencia". Dice que el Juez ya emitió su veredicto y es: <em>no culpable.</em></p>

    <div class="verse-block">
      <p>Ahora, pues, ninguna condenación hay para los que están en Cristo Jesús, los que no andan conforme a la carne, sino conforme al Espíritu.</p>
      <cite>— Romanos 8:1, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">La diferencia entre condenación y convicción</h2>
    <p>Aquí hay una distinción que puede cambiar cómo te relacionas con Dios: <strong>condenación y convicción no son lo mismo.</strong> La condenación dice: "eres un fracaso, no tienes remedio, Dios está harto de ti." Esa voz no es de Dios — es del acusador. La convicción dice: "eso que hiciste está mal, aquí hay corrección disponible, vuelve." Esa es la voz del Espíritu.</p>
    <p>El enemigo usa la culpa para paralizarte en el pasado. El Espíritu usa la convicción para moverte hacia adelante. La diferencia práctica: después de fallar, ¿te aleja de Dios o te mueve hacia Él?</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"Los que están en Cristo Jesús" — la palabra clave es la posición. No los que merecen. No los que han rendido lo suficiente. Los que están en Él. <strong>Si estás en Cristo, el veredicto ya fue emitido antes de que fallaste hoy. Ese veredicto no cambia cuando fallas — fue diseñado precisamente para cubrir ese fallo.</strong></p>
    </div>

    <h2 class="section-title">La libertad que no es permiso sino poder</h2>
    <p>Romanos 8:1 no es una licencia para vivir sin cambio. La segunda parte del versículo dice "los que andan conforme al Espíritu". La libertad de la condenación no es permiso para seguir igual — es el poder para ser diferente. <strong>La gracia no produce indiferencia al pecado; produce una nueva motivación para el bien que el miedo nunca pudo producir.</strong> No cambias para evitar condenación. Ya no hay condenación. Cambias porque eres amado y libre.</p>`,
  prayer: 'Señor, hoy necesito escuchar el veredicto más que el acusador. Ninguna condenación. No lo siento siempre, no lo merezco nunca, pero es lo que Tú has declarado. Ayúdame a pararme en ese veredicto y no en mi historial. Y que la libertad de no ser condenado me libere para caminar diferente. Amén.',
  faqs: [
    {q:'¿Qué significa "ninguna condenación" en Romanos 8:1?', a:'Katakrima en griego es la sentencia final de un juez. No es un sentimiento ni una promesa de que todo irá bien. Es un veredicto legal: no culpable. Dios actúa como Juez que ya emitió su sentencia sobre quienes están en Cristo, independientemente del historial.'},
    {q:'¿Cuál es la diferencia entre condenación y convicción?', a:'La condenación dice "eres un fracaso sin remedio" y te paraliza en el pasado. La convicción dice "eso está mal, hay corrección disponible" y te mueve hacia adelante. La condenación viene del acusador; la convicción viene del Espíritu Santo. La diferencia práctica: ¿te aleja de Dios o te mueve hacia Él?'},
    {q:'¿Significa Romanos 8:1 que el pecado no importa?', a:'No. La segunda parte del versículo habla de "andar conforme al Espíritu". La libertad de la condenación no es permiso para seguir igual — es el poder para ser diferente. La gracia no produce indiferencia al pecado; produce una motivación nueva que el miedo nunca pudo producir.'},
    {q:'¿Por qué es importante leer Romanos 7 antes de Romanos 8:1?', a:'Porque Romanos 7 es la confesión de Pablo de fracaso espiritual profundo: "el bien que quiero no lo hago." Romanos 8:1 llega inmediatamente después de ese fondo. El contraste es el punto: la libertad de la condenación no viene después de que te portas bien — viene en medio del fracaso honesto.'}
  ],
  prev: {slug:'juan-3-16', title:'Juan 3:16: El Versículo Más Conocido y el Más Malentendido'},
  next: {slug:'romanos-8-28', title:'Romanos 8:28: Dios No Causó Tu Dolor, Pero Hará Algo con Él'}
},

// ── 10 ──────────────────────────────────────────────────────────────────────
{
  slug: 'romanos-8-28',
  ref: 'Romanos 8:28',
  libro: 'Romanos',
  cap: '8',
  date: '2026-06-01',
  dateLabel: '1 de junio, 2026',
  verseShort: 'Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien.',
  title: 'Romanos 8:28: Dios No Causó Tu Dolor, Pero Hará Algo con Él',
  metaDesc: 'Devocional sobre Romanos 8:28. Qué significa "todas las cosas ayudan a bien", cuál es la condición del versículo, y cuál es el "bien" que Dios tiene en mente.',
  h1: 'Romanos 8:28: La Diferencia Entre Todo Es Bueno y Todo Obra para Bien',
  tags: ['Romanos', 'Sufrimiento', 'Propósito'],
  bodyHtml: `
    <p>Este versículo ha sido usado para decirle a personas que acaban de perder un hijo, que fueron traicionadas, que les diagnosticaron algo terrible: "tranquilo, todo pasa por algo." Y la intención es buena. Pero esa lectura simplificada puede ser cruelmente insensible — y no es lo que Pablo dijo.</p>

    <h2 class="section-title">Dios no causó el mal — pero lo usa</h2>
    <p>El versículo no dice que <em>todo es bueno</em>. No dice que Dios causó tu enfermedad, tu traición, tu pérdida. La Biblia es clara en que hay mal en el mundo que no viene de Dios. Lo que dice Romanos 8:28 es algo diferente y más poderoso: <strong>"todas las cosas ayudan a bien"</strong> — que Dios tiene la capacidad de tomar cualquier cosa, incluso lo que el enemigo usó para destruirte, y hacerla cooperar hacia un propósito de bien.</p>
    <p>Es la diferencia entre un director de teatro que causó el drama de tu vida y uno que toma el drama que ya existía y lo convierte en algo que transforma al auditorio.</p>

    <div class="verse-block">
      <p>Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.</p>
      <cite>— Romanos 8:28, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">La condición que no podemos saltarnos</h2>
    <p>El versículo tiene una condición explícita que se omite frecuentemente: <em>"a los que aman a Dios."</em> No es una promesa universal. Es una promesa para personas en una relación activa con Él. No se activa automáticamente para todos — se activa en el contexto de amar a Dios y estar alineados con su llamado. Lo que significa que la pregunta no es solo "¿me ayudará Dios en esto?" sino <em>"¿lo estoy amando en medio de esto?"</em></p>
    <p><strong>El sufrimiento no produce automáticamente bien. El sufrimiento en las manos de alguien que ama a Dios produce bien.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El versículo 29 define cuál es el "bien" al que ayudan todas las cosas: "ser hechos conformes a la imagen de su Hijo." El objetivo de Dios no es tu comodidad — es tu transformación. <strong>Cuando preguntas "¿por qué me pasa esto?", Dios podría estar respondiendo "para que te parezcas más a Cristo."</strong></p>
    </div>

    <h2 class="section-title">El "bien" que Dios tiene en mente</h2>
    <p>Muchos leen "bien" como sinónimo de "lo que yo quiero que pase". Pero el versículo 29 define el bien explícitamente: <em>"ser hechos conformes a la imagen de su Hijo."</em> El objetivo de Dios en tu vida no es principalmente tu prosperidad, tu comodidad ni la resolución rápida de tus problemas. Es que te parezcas más a Jesús. Y resulta que eso frecuentemente requiere proceso. Presión. Tiempo. La madera que no pasó por fuego no puede ser arte; el mineral que no pasó por fundición no puede ser metal. <strong>El bien de Romanos 8:28 es lo que te convierte en algo que antes no podías ser.</strong></p>`,
  prayer: 'Señor, hoy no veo el bien en esto. Y no te pido que me expliques el porqué todavía. Te pido que en medio de lo que no entiendo, trabajes como sabes hacerlo — tomando lo roto y haciéndolo parte de algo mayor. Confío no porque todo sea bueno sino porque Tú eres bueno. Amén.',
  faqs: [
    {q:'¿Significa Romanos 8:28 que Dios causó mi sufrimiento?', a:'No. El versículo no dice que todas las cosas son buenas ni que Dios las causó. Dice que Dios puede hacer que cooperen hacia el bien. Hay mal en el mundo que no viene de Dios — la promesa es que tiene la capacidad de redimir incluso ese mal en la vida de quien lo ama.'},
    {q:'¿Quiénes son "los que aman a Dios" en Romanos 8:28?', a:'La promesa tiene una condición explícita: "a los que aman a Dios". No es automática para todos. Se activa en el contexto de una relación activa y amor genuino hacia Dios. El sufrimiento solo no produce bien — el sufrimiento en manos de alguien que ama a Dios produce bien.'},
    {q:'¿Cuál es el "bien" que Romanos 8:28 promete?', a:'El versículo 29 lo define: "ser hechos conformes a la imagen de su Hijo." El objetivo de Dios no es principalmente tu comodidad sino tu transformación para parecerte más a Cristo. Ese "bien" frecuentemente requiere proceso, presión y tiempo.'},
    {q:'¿Cómo usar Romanos 8:28 para consolar a alguien que sufre?', a:'Con cuidado y honestidad. Antes de citarlo, vale la pena estar presente en el dolor sin apresurar la resolución. El versículo es cierto, pero en momentos agudos de pérdida, a veces la presencia vale más que el versículo. Cuando sí se comparte, la versión honesta es: "Dios no causó esto, pero tiene la capacidad de usarlo."'}
  ],
  prev: {slug:'romanos-8-1', title:'Romanos 8:1: La Libertad que Dios Da a los Que Ya No Creen Merecerla'},
  next: {slug:'filipenses-4-13', title:'Filipenses 4:13: Lo que "Todo lo Puedo en Cristo" Realmente Significa'}
},

// ── 11 ──────────────────────────────────────────────────────────────────────
{
  slug: 'filipenses-4-13',
  ref: 'Filipenses 4:13',
  libro: 'Filipenses',
  cap: '4',
  date: '2026-06-02',
  dateLabel: '2 de junio, 2026',
  verseShort: 'Todo lo puedo en Cristo que me fortalece.',
  title: 'Filipenses 4:13: Lo Que "Todo lo Puedo en Cristo" Realmente Significa',
  metaDesc: 'Devocional sobre Filipenses 4:13. Pablo escribió esto desde la cárcel. "Todo lo puedo" no es motivación personal — es contentamiento aprendido. El verdadero significado.',
  h1: 'Filipenses 4:13: Pablo Lo Escribió en Cadenas, No Desde un Escenario',
  tags: ['Filipenses', 'Fortaleza', 'Contentamiento'],
  bodyHtml: `
    <p>Este versículo está en más camisetas deportivas, más posters de motivación y más discursos de estadio que casi cualquier otro texto bíblico. Lo usamos antes de los partidos, antes de los exámenes, antes de presentaciones importantes. Como si fuera el equivalente cristiano de "sí se puede".</p>
    <p>Y hay algo de verdad en ese uso. Pero hay algo mucho más poderoso si leemos lo que Pablo estaba haciendo cuando lo escribió.</p>

    <h2 class="section-title">Pablo escribió esto desde la cárcel</h2>
    <p>Filipenses es una carta de prisión. Pablo no la escribió desde una plataforma de éxito. La escribió con grilletes, mientras esperaba un juicio que podía terminar en su ejecución, rodeado de guardias romanos, sin saber qué pasaría mañana. Y desde ahí escribe con una alegría que desconcierta — "regocijaos en el Señor siempre, otra vez digo: regocijaos." No como performance. Como realidad.</p>
    <p>El versículo 13 no es el punto de llegada de un discurso motivacional. Es la conclusión de un proceso de aprendizaje que Pablo describe en los versículos anteriores.</p>

    <div class="verse-block">
      <p>No lo digo porque desee dádiva, sino porque busco fruto que abunde en vuestra cuenta. He aprendido a contentarme, cualquiera que sea mi situación... Todo lo puedo en Cristo que me fortalece.</p>
      <cite>— Filipenses 4:11, 13, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"He aprendido" — el verbo que cambia todo</h2>
    <p>El versículo 11 dice algo que se pasa por alto: <em>"he aprendido a contentarme."</em> El contentamiento no es natural para Pablo — ni para ninguno de nosotros. Es aprendido. El verbo griego es <em>manthanō</em> — aprender por experiencia práctica, por repetición, por prueba. Como aprender un idioma: no te sale al principio, pero con práctica se vuelve segunda naturaleza.</p>
    <p>Pablo dice que aprendió contentamiento tanto en abundancia como en necesidad — ambas son difíciles a su manera. Y el "todo lo puedo" del versículo 13 es la conclusión de ese aprendizaje: <strong>puedo vivir con paz en cualquier circunstancia, no porque tenga lo que quiero sino porque tengo a Cristo.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"Todo lo puedo" en el contexto del pasaje no significa "puedo lograr cualquier cosa que me proponga". Significa: <strong>"puedo atravesar cualquier circunstancia — buena o mala — con el Espíritu de Dios sosteniéndome."</strong> Es una promesa de suficiencia interior, no de capacidad exterior ilimitada.</p>
    </div>

    <h2 class="section-title">La fuerza que no viene de ti</h2>
    <p>"En Cristo que me fortalece" — la clave no es el "todo lo puedo" sino el "en Cristo". El verbo griego para fortalecer es <em>endunamoō</em>: ser infundido con poder, ser fortalecido desde afuera hacia adentro. No es disciplina propia. No es mentalidad positiva. Es ser constantemente abastecido por una fuente que no se agota.</p>
    <p>La diferencia práctica: la motivación personal tiene un límite — se agota, se desinfla, falla en la crisis real. La fortaleza de Cristo no. <strong>No porque seas fuerte, sino porque Él es suficiente.</strong> Y aprender esa diferencia — como aprendió Pablo en la cárcel — es una de las lecciones más liberadoras de la vida cristiana.</p>`,
  prayer: 'Señor, hoy no me siento capaz. Las circunstancias son más grandes que mis fuerzas. Y eso está bien, porque la promesa no es que yo sea fuerte — es que Tú eres suficiente. Enséñame el contentamiento que Pablo aprendió en cadenas: que cualquiera sea mi situación, Tú eres más. Amén.',
  faqs: [
    {q:'¿Qué significa "todo lo puedo en Cristo que me fortalece"?', a:'En contexto, Pablo lo escribe desde prisión y lo conecta con "he aprendido a contentarme en cualquier situación." "Todo lo puedo" no significa capacidad ilimitada para lograr metas, sino la posibilidad de atravesar cualquier circunstancia con paz porque Cristo sostiene desde dentro.'},
    {q:'¿Por qué Pablo dice "he aprendido" a contentarse?', a:'El verbo griego manthanō implica aprender por experiencia práctica y repetición. El contentamiento no es natural — es adquirido mediante el proceso de vivir tanto la abundancia como la necesidad y descubrir que Dios es suficiente en ambas.'},
    {q:'¿Es Filipenses 4:13 un versículo de motivación personal?', a:'Parcialmente, pero no en el sentido de éxito personal. Pablo lo escribe en prisión, no desde el éxito. La fortaleza que promete no viene de la disciplina mental propia sino de ser endunamoō — infundido con poder desde Cristo. Es una promesa de suficiencia divina, no de capacidad humana.'},
    {q:'¿Cómo experimentar la fortaleza de Cristo en la práctica?', a:'El mismo pasaje da pistas: oración, acción de gracias, pensar en lo verdadero y lo puro (v.6-8). No son técnicas mágicas sino posturas que mantienen la conexión con la Fuente. La fortaleza de Cristo no se acumula en reserva — llega en el momento de necesidad para quien permanece conectado a Él.'}
  ],
  prev: {slug:'romanos-8-28', title:'Romanos 8:28: Dios No Causó Tu Dolor, Pero Hará Algo con Él'},
  next: null
}

]; // end devotionals array

// ─── GENERATE FILES ───────────────────────────────────────────────────────────
devotionals.forEach(d => {
  const content = html(d);
  const filePath = path.join(OUT_DIR, `${d.slug}.html`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ devocional/${d.slug}.html`);
});

console.log(`\n✅ ${devotionals.length} devocionales generados en /devocional/`);

// Export data for index page
module.exports = { devotionals };
