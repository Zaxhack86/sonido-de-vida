// generate-lote34.js — Lotes 3 y 4 (20 devocionales nuevos, #40-59)
// Uso: node generate-lote34.js
// - Escribe los 20 HTML en /devocional/ (plantilla VIVA, con AdSense en <head>)
// - Inserta tarjetas en devocionales.html y URLs en sitemap.xml (antes de GEN:END)
// - Arregla el "seam": el next de lamentaciones-3-22 apunta al primer nuevo
// Idempotente: si el primer slug ya existe en hub/sitemap, no reinserta.

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://sonidodevida.com';
const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'devocional');

const ADSENSE = `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1847146837046506" crossorigin="anonymous"></script>`;

// ─── CSS (idéntico a los devocionales en producción) ──────────────────────────
const CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --gold:#c9a84c; --gold-light:#e8d48b; --gold-dark:#a07c2a;
  --deep-blue:#1a1a3e; --dark:#0d0d1a;
  --cream:#f5f0e8; --warm-white:#faf8f4;
  --text-dark:#2c2c3e; --text-light:#6b6b80;
}
body { font-family:'Inter',sans-serif; color:#f3eee2;
  background:radial-gradient(1100px 620px at 50% -8%, rgba(201,168,76,.07), transparent 62%),
    linear-gradient(180deg,#070e20 0%, #0a1226 60%, #0b1430 100%);
  background-attachment:fixed; min-height:100vh; }
nav { background:rgba(7,14,32,.78); backdrop-filter:blur(12px); border-bottom:1px solid rgba(201,168,76,.12); padding:.9rem 2rem; display:flex; justify-content:space-between; align-items:center; }
.nav-logo { font-family:'Cinzel',serif; font-size:1.3rem; font-weight:700; color:var(--gold-light); text-decoration:none; }
.nav-back { color:rgba(255,255,255,.7); text-decoration:none; font-size:.88rem; display:flex; align-items:center; gap:.4rem; transition:color .2s; }
.nav-back:hover { color:var(--gold-light); }
.hero-verse { position:relative; background:
    radial-gradient(820px 600px at 50% -12%, rgba(201,168,76,.12), transparent 60%),
    radial-gradient(440px 440px at 20% 85%, rgba(201,168,76,.06), transparent 62%),
    linear-gradient(180deg,#070e20 0%, #0b1430 55%, #0a1226 100%);
  padding:4.5rem 2rem 3.5rem; text-align:center; border-bottom:1px solid rgba(201,168,76,.1); }
.tag { display:inline-block; background:rgba(201,168,76,.1); border:1px solid rgba(201,168,76,.28); color:#E6CE80; font-size:.78rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; padding:.35rem 1rem; border-radius:50px; margin-bottom:1.5rem; }
.verse-ref { font-family:'Cinzel',serif; font-size:1rem; color:var(--gold-light); margin-bottom:1.2rem; letter-spacing:.08em; }
.verse-text { font-family:'Lora',serif; font-size:clamp(1.4rem,3.5vw,2.1rem); color:#FAF7F0; line-height:1.55; max-width:700px; margin:0 auto 2.2rem; font-style:italic; }
.verse-text::before { content:'“'; color:var(--gold); }
.verse-text::after  { content:'”'; color:var(--gold); }
.audio-cta { display:inline-flex; align-items:center; gap:.6rem; background:linear-gradient(135deg,var(--gold),var(--gold-dark)); color:var(--dark); padding:.9rem 2.2rem; border-radius:50px; font-weight:700; font-size:.95rem; text-decoration:none; transition:transform .2s,box-shadow .2s; box-shadow:0 12px 32px -10px rgba(201,168,76,.55); }
.audio-cta:hover { transform:translateY(-2px); box-shadow:0 8px 25px rgba(201,168,76,.4); }
.breadcrumb { background:rgba(13,21,48,.55); backdrop-filter:blur(10px); border-bottom:1px solid rgba(201,168,76,.12); padding:.7rem 2rem; font-size:.82rem; color:#8b90a0; }
.breadcrumb a { color:#8b90a0; text-decoration:none; }
.breadcrumb a:hover { color:var(--gold-light); }
.breadcrumb span { margin:0 .4rem; }
.content-wrap { max-width:760px; margin:0 auto; padding:3.5rem 2rem 5rem; }
.devocional-title { font-family:'Cinzel',serif; font-size:clamp(1.5rem,3vw,2rem); margin-bottom:.6rem; line-height:1.3;
  background:linear-gradient(135deg,#E6CE80,#C9A84C,#A8863A); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
.meta-info { display:flex; align-items:center; gap:.75rem; margin-bottom:1.5rem; color:#8b90a0; font-size:.85rem; flex-wrap:wrap; }
.meta-tag { background:rgba(201,168,76,.1); color:var(--gold-light); padding:.25rem .75rem; border-radius:50px; font-weight:500; font-size:.78rem; border:1px solid rgba(201,168,76,.22); }
.divider { width:60px; height:3px; background:linear-gradient(90deg,var(--gold),var(--gold-light)); border-radius:2px; margin:1.5rem 0 2.5rem; }
.devocional-body p { font-family:'Lora',serif; font-size:1.1rem; line-height:1.9; color:#c2c7d2; margin-bottom:1.6rem; }
.devocional-body strong { color:#f3eee2; font-weight:600; }
.devocional-body em { color:var(--gold-light); }
h2.section-title { font-family:'Cinzel',serif; font-size:1.2rem; margin:2.5rem 0 1rem; padding-bottom:.5rem; border-bottom:1px solid rgba(201,168,76,.2);
  background:linear-gradient(135deg,#E6CE80,#C9A84C,#A8863A); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
.verse-block { background:linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.03)); border-left:4px solid var(--gold); padding:1.4rem 1.8rem; border-radius:0 10px 10px 0; margin:2rem 0; }
.verse-block p { font-family:'Lora',serif; font-style:italic; font-size:1.1rem; color:#e6e2d6; line-height:1.75; margin:0; }
.verse-block cite { display:block; margin-top:.6rem; font-style:normal; font-size:.85rem; color:var(--gold-light); font-weight:600; }
.insight-box { background:radial-gradient(420px 200px at 15% 0%, rgba(201,168,76,.1), transparent 60%),linear-gradient(135deg,#0b1430,#0d1733); border:1px solid rgba(201,168,76,.18); color:white; border-radius:14px; padding:1.8rem 2rem; margin:2.5rem 0; }
.insight-box p { font-family:'Lora',serif; font-size:1.05rem; line-height:1.8; color:rgba(255,255,255,.9); margin:0; }
.insight-label { font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--gold-light); font-weight:600; margin-bottom:.6rem; display:block; }
.prayer-section { background:rgba(201,168,76,.05); border:1px solid rgba(201,168,76,.2); border-radius:14px; padding:2rem; margin:2.5rem 0; backdrop-filter:blur(14px); }
.prayer-section h3 { font-family:'Cinzel',serif; font-size:1rem; color:var(--gold-light); letter-spacing:.08em; text-transform:uppercase; margin-bottom:1rem; }
.prayer-section p { font-family:'Lora',serif; font-style:italic; font-size:1rem; line-height:1.85; color:#d7dae2; margin:0; }
.listen-section { background:radial-gradient(560px 280px at 50% 0%, rgba(201,168,76,.1), transparent 60%),linear-gradient(135deg,#0b1430,#0a1226); border:1px solid rgba(201,168,76,.16); border-radius:16px; padding:2.2rem 2rem; margin:2.5rem 0; text-align:center; }
.listen-section h3 { font-family:'Cinzel',serif; font-size:1.1rem; color:var(--gold-light); margin-bottom:.5rem; }
.listen-section p { font-size:.9rem; color:rgba(255,255,255,.65); margin-bottom:1.4rem; font-family:'Lora',serif; }
.faq-section { margin:3rem 0; }
.faq-section h2 { font-family:'Cinzel',serif; font-size:1.3rem; margin-bottom:1.5rem;
  background:linear-gradient(135deg,#E6CE80,#C9A84C,#A8863A); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
.faq-item { border:1px solid rgba(255,255,255,.08); border-radius:10px; margin-bottom:.75rem; overflow:hidden; background:rgba(255,255,255,.025); }
.faq-question { width:100%; background:transparent; border:none; padding:1.1rem 1.4rem; text-align:left; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-family:'Inter',sans-serif; font-size:.95rem; font-weight:500; color:#e8e4d8; }
.faq-question:hover { background:rgba(201,168,76,.06); }
.faq-arrow { color:var(--gold); font-size:1.2rem; transition:transform .3s; flex-shrink:0; margin-left:1rem; }
.faq-answer { display:none; padding:0 1.4rem 1.2rem; background:transparent; }
.faq-answer p { font-family:'Lora',serif; font-size:.97rem; line-height:1.8; color:#a6abba; margin:0; }
.faq-item.open .faq-answer { display:block; }
.faq-item.open .faq-arrow { transform:rotate(45deg); }
.share-section { margin:2.5rem 0; }
.share-section h4 { font-family:'Cinzel',serif; font-size:.9rem; color:#8b90a0; letter-spacing:.08em; margin-bottom:1rem; text-transform:uppercase; }
.share-buttons { display:flex; gap:.75rem; flex-wrap:wrap; }
.share-btn { display:inline-flex; align-items:center; gap:.5rem; padding:.6rem 1.25rem; border-radius:50px; font-size:.87rem; font-weight:500; text-decoration:none; cursor:pointer; transition:transform .2s,opacity .2s; border:none; font-family:inherit; }
.share-btn:hover { transform:translateY(-1px); opacity:.9; }
.share-whatsapp { background:#25d366; color:white; }
.share-facebook { background:#1877f2; color:white; }
.share-twitter  { background:#000; color:white; }
.share-copy { background:rgba(255,255,255,.06); color:var(--gold-light); border:1px solid rgba(201,168,76,.3) !important; }
.nav-posts { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(255,255,255,.08); }
.nav-post { background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.07); border-radius:12px; padding:1.2rem; text-decoration:none; transition:box-shadow .2s,border-color .2s; backdrop-filter:blur(14px); }
.nav-post:hover { box-shadow:0 12px 35px rgba(0,0,0,.4); border-color:rgba(201,168,76,.35); }
.nav-post .direction { font-size:.75rem; color:#8b90a0; text-transform:uppercase; letter-spacing:.08em; margin-bottom:.4rem; }
.nav-post .post-title { font-family:'Lora',serif; font-size:.95rem; color:#e8e4d8; }
.nav-post.next { text-align:right; }
@media(max-width:600px){
  .nav-posts{grid-template-columns:1fr;}
  .content-wrap{padding:2rem 1.25rem 4rem;}
  .hero-verse{padding:3rem 1.5rem 2.5rem;}
}`;

// ─── PLANTILLA HTML ───────────────────────────────────────────────────────────
function html(d) {
  const waText = encodeURIComponent(`*${d.verseShort}*\n— ${d.ref}\n\nDevocional completo: ${BASE_URL}/devocional/${d.slug}`);
  const fbUrl  = encodeURIComponent(`${BASE_URL}/devocional/${d.slug}`);
  const twText = encodeURIComponent(`"${d.verseShort}" — ${d.ref}\n\n${BASE_URL}/devocional/${d.slug}`);
  const pageUrl = `${BASE_URL}/devocional/${d.slug}`;
  const chapterLabel = d.ref.split(':')[0];

  const navPrev = d.prev
    ? `<a href="/devocional/${d.prev.slug}" class="nav-post prev"><div class="direction">← Anterior</div><div class="post-title">${d.prev.title}</div></a>`
    : `<div></div>`;
  const navNext = d.next
    ? `<a href="${d.next.href || ('/devocional/' + d.next.slug)}" class="nav-post next"><div class="direction">Siguiente →</div><div class="post-title">${d.next.title}</div></a>`
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
${ADSENSE}
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
    Escuchar ${chapterLabel} en audio
  </a>
</div>

<div class="breadcrumb">
  <a href="/">Inicio</a><span>›</span>
  <a href="/devocionales">Devocionales</a><span>›</span>
  ${chapterLabel}
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
    <h3>Escucha ${chapterLabel} completo en audio</h3>
    <p>Reina Valera 1909 · Voz clara · Gratis, sin registro</p>
    <a href="/?libro=${encodeURIComponent(d.libro)}&cap=${d.cap}" class="audio-cta">
      <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
      Abrir en Sonido de Vida
    </a>
  </div>

  <div class="faq-section">
    <h2>Preguntas frecuentes sobre ${chapterLabel}</h2>
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

// ─── TARJETA DEL HUB ──────────────────────────────────────────────────────────
function hubCard(d) {
  return `    <a href="/devocional/${d.slug}" class="card reveal" data-category="${d.category}">
      <div class="card-top">
        <div class="card-ref">${d.ref}</div>
        <div class="card-verse">${d.cardVerse}</div>
      </div>
      <div class="card-body">
        <div class="card-title">${d.title}</div>
        <div class="card-excerpt">${d.cardExcerpt}</div>
        <div class="card-footer">
          <div class="card-tags"><span class="card-tag">${d.cardTags[0]}</span><span class="card-tag">${d.cardTags[1]}</span></div>
          <span class="card-link">Leer →</span>
        </div>
      </div>
    </a>
`;
}

function sitemapUrl(d) {
  return `  <url>
    <loc>${BASE_URL}/devocional/${d.slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <lastmod>${d.date}</lastmod>
  </url>
`;
}

// ─── DATOS — 20 DEVOCIONALES (Lotes 3 y 4, #40-59) ────────────────────────────
const devotionals = [

// ── 40 · Salmos 121 ──────────────────────────────────────────────────────────
{
  slug:'salmos-121', ref:'Salmos 121:1-2', libro:'Salmos', cap:'121',
  date:'2026-07-07', dateLabel:'7 de julio, 2026',
  verseShort:'Alzaré mis ojos á los montes, ¿de dónde vendrá mi socorro?',
  cardVerse:'Alzaré mis ojos á los montes, ¿de dónde vendrá mi socorro?',
  title:'Salmos 121: De Dónde Viene Tu Socorro — Significado y Devocional',
  metaDesc:'Devocional sobre Salmos 121. Qué significa "alzaré mis ojos a los montes", de dónde viene realmente el socorro, y por qué el Guardián de Israel no se duerme.',
  h1:'Salmos 121: El Guardián que No Duerme Mientras Tú Sí',
  tags:['Salmos','Protección','Confianza'], category:'Salmos', cardTags:['Salmos','Protección'],
  cardExcerpt:'Los montes alrededor de Jerusalén eran donde estaban los altares paganos. Cuando David alza los ojos, no busca ayuda en ellos: mira más allá, al Dios que hizo los montes y que no se duerme ni un segundo mientras te guarda.',
  bodyHtml:`
    <p>Este es un salmo de peregrinación. Lo cantaban los israelitas mientras subían a Jerusalén, por caminos de montaña donde acechaban ladrones, fieras y el calor que mataba. No es poesía de salón: es un canto de gente con miedo real, caminando hacia el lugar de adoración por terreno peligroso.</p>
    <p>Y empieza con una pregunta que muchos leen mal: <em>"Alzaré mis ojos á los montes, ¿de dónde vendrá mi socorro?"</em></p>

    <h2 class="section-title">Los montes no eran el lugar seguro</h2>
    <p>Solemos imaginar que el salmista mira las montañas con admiración, como buscando fuerza en su grandeza. Pero en el mundo de Israel, los montes eran exactamente lo contrario de un refugio. En las cumbres estaban los <strong>"lugares altos"</strong> — los santuarios paganos donde se adoraba a Baal y a otros dioses. Los montes eran de donde venía el peligro espiritual y el bandido físico.</p>
    <p>Por eso la pregunta no es retórica de asombro, sino casi de angustia: <em>¿de dónde vendrá mi socorro?</em> ¿De estos montes amenazantes? Y la respuesta del versículo 2 corrige el rumbo de la mirada: <strong>"Mi socorro viene de Jehová, que hizo los cielos y la tierra."</strong> No de los montes — del que los hizo.</p>

    <div class="verse-block">
      <p>Alzaré mis ojos á los montes, de donde vendrá mi socorro. Mi socorro viene de Jehová, que hizo los cielos y la tierra. No dará tu pie al resbaladero; ni se dormirá el que te guarda.</p>
      <cite>— Salmos 121:1-3, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El Dios que no necesita dormir</h2>
    <p>Seis veces en ocho versículos aparece el verbo hebreo <em>shamar</em> — guardar, vigilar, custodiar. Es el corazón del salmo. Y dice algo extraordinario: <em>"no se adormecerá ni dormirá el que guarda á Israel."</em> En las religiones vecinas, los dioses dormían, se cansaban, se ausentaban — recuerda cómo Elías se burló de los profetas de Baal diciendo que quizás su dios estaba dormido. El Dios de Israel nunca cierra los ojos.</p>
    <p>Lo que significa que <strong>tu seguridad no depende de tu vigilancia.</strong> Puedes dormir precisamente porque Él no lo hace. Las noches en que el insomnio te tiene contando preocupaciones, hay Alguien despierto que ya está cuidando lo que tú no puedes controlar acostado.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El salmo no promete un camino sin montañas peligrosas. Promete un Guardián en el camino. <strong>La fe no quita la cuesta — pone a Alguien que no se duerme caminando a tu lado por ella.</strong></p>
    </div>

    <h2 class="section-title">"Tu salida y tu entrada"</h2>
    <p>El salmo termina con una promesa de alcance total: <em>"Jehová guardará tu salida y tu entrada desde ahora y para siempre."</em> "Salida y entrada" es un modismo hebreo que significa toda la vida — todo lo que haces, de la mañana a la noche, del nacimiento a la muerte. No hay un solo tramo del camino donde el Guardián se quede atrás.</p>
    <p>El peregrino subía a Jerusalén con miedo. Pero no subía solo. Y tú tampoco.</p>`,
  prayer:'Señor, hoy levanto los ojos más allá de mis problemas, más allá de los montes que me amenazan, hacia Ti que los hiciste. Tú no te duermes. Mientras yo descanso, Tú vigilas; mientras yo no puedo controlar, Tú guardas. Guarda mi salida y mi entrada hoy, y enséñame a dormir confiado porque Tú estás despierto. Amén.',
  faqs:[
    {q:'¿Qué significa "alzaré mis ojos a los montes" en Salmos 121?', a:'En el contexto de Israel, los montes albergaban los "lugares altos" de la idolatría y eran zona de peligro para los peregrinos. La pregunta "¿de dónde vendrá mi socorro?" no expresa admiración por las montañas, sino que corrige la mirada: el socorro no viene de los montes, sino de Jehová que los hizo.'},
    {q:'¿Por qué se repite la palabra "guardar" en el Salmo 121?', a:'El verbo hebreo shamar (guardar, custodiar) aparece seis veces en ocho versículos. Es el tema central del salmo: Dios es el Guardián que vigila continuamente. La repetición subraya que la protección divina no es ocasional sino constante.'},
    {q:'¿Qué significa que Dios "no se dormirá"?', a:'A diferencia de los dioses paganos que, según se creía, dormían o se ausentaban, el Dios de Israel vela sin descanso. Significa que la seguridad del creyente no depende de su propia vigilancia: puede descansar porque Dios nunca cierra los ojos.'},
    {q:'¿Qué significa "tu salida y tu entrada" en Salmos 121:8?', a:'Es un modismo hebreo que abarca la totalidad de la vida — todas las actividades diarias y toda la existencia, del principio al fin. La promesa es que no hay ningún tramo del camino en el que Dios deje de cuidar a los suyos.'}
  ],
  prev:{slug:'lamentaciones-3-22', title:'Lamentaciones 3:22-23: El Versículo de Esperanza Escrito entre las Ruinas'},
  next:{slug:'juan-14-27', title:'Juan 14:27: Una Paz que Llega Aun Cuando la Tormenta No se Va'}
},

// ── 41 · Juan 14:27 ──────────────────────────────────────────────────────────
{
  slug:'juan-14-27', ref:'Juan 14:27', libro:'Juan', cap:'14',
  date:'2026-07-08', dateLabel:'8 de julio, 2026',
  verseShort:'La paz os dejo, mi paz os doy: no como el mundo la da, yo os la doy.',
  cardVerse:'La paz os dejo, mi paz os doy: no como el mundo la da, yo os la doy.',
  title:'Juan 14:27: La Paz que Jesús Da No es la que el Mundo Promete',
  metaDesc:'Devocional sobre Juan 14:27. Qué es la paz que Jesús da, en qué se diferencia de la del mundo, y por qué la dijo la noche antes de la cruz.',
  h1:'Juan 14:27: Una Paz que Llega Aun Cuando la Tormenta No se Va',
  tags:['Juan','Paz','Ansiedad'], category:'Nuevo Testamento', cardTags:['Juan','Paz'],
  cardExcerpt:'Jesús dijo esto la misma noche en que sería traicionado, horas antes de la cruz. No prometió paz como ausencia de problemas, sino una paz que existe en medio de ellos — una eirene que no depende de lo que pase afuera.',
  bodyHtml:`
    <p>Hay frases que pesan distinto según quién las dice y cuándo. "La paz os dejo" suena bonito en un cuadro. Pero Jesús no la pronunció en un día tranquilo. La dijo en el aposento alto, la noche de la última cena, horas antes de ser arrestado, torturado y crucificado. Es paz ofrecida por alguien que sabía exactamente lo que venía.</p>
    <p>Y eso cambia todo lo que la frase significa.</p>

    <h2 class="section-title">Dos clases de paz</h2>
    <p>La palabra griega es <em>eirene</em>, que traduce el hebreo <em>shalom</em> — no solo ausencia de conflicto, sino plenitud, integridad, que nada esencial falte. Pero Jesús hace una distinción cortante: <strong>"no como el mundo la da, yo os la doy."</strong></p>
    <p>La paz del mundo es <em>condicional</em>: depende de que las cuentas cuadren, de que el diagnóstico sea bueno, de que la relación se arregle. Es paz por ausencia de problemas. Cuando el problema vuelve, la paz se va. La paz de Cristo opera al revés: <strong>no quita la tormenta, llega en medio de ella.</strong> No depende de las circunstancias porque no nace de ellas — nace de Él.</p>

    <div class="verse-block">
      <p>La paz os dejo, mi paz os doy: no como el mundo la da, yo os la doy. No se turbe vuestro corazón, ni tenga miedo.</p>
      <cite>— Juan 14:27, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"No se turbe vuestro corazón"</h2>
    <p>Nótalo: Jesús da una orden, no un consejo. <em>"No se turbe."</em> Eso solo tiene sentido si la paz no es un sentimiento que llega solo, sino un regalo que se puede recibir o rechazar. Él no dice "ojalá no se turben"; dice "no se turben", porque acaba de poner a su disposición una paz que hace posible la calma incluso cuando todo invita al pánico.</p>
    <p>El corazón se turba — esa es nuestra reacción natural. La invitación no es fingir que no hay tormenta, sino anclar el corazón en Algo más firme que la tormenta.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>La paz del mundo dice: "estarás bien cuando el problema se resuelva." La paz de Cristo dice: "puedes estar en paz aunque el problema siga, porque yo no me he movido." <strong>Una espera a que cambien las circunstancias; la otra cambia desde dentro al que las atraviesa.</strong></p>
    </div>

    <h2 class="section-title">Un regalo que ya fue comprado</h2>
    <p>Jesús pudo ofrecer paz la noche más oscura de su vida porque sabía que esa oscuridad no tendría la última palabra. Fue a la cruz, sí — pero al tercer día resucitó, y la tumba vacía es la garantía eterna de que su paz no era ingenuidad. Es la paz de Aquel que enfrentó la muerte misma y salió vivo del otro lado.</p>
    <p>Por eso su paz se sostiene cuando la del mundo se cae: <strong>fue probada en el peor escenario posible y no se rompió.</strong> La que Él te ofrece es exactamente esa.</p>`,
  prayer:'Señor Jesús, tantas veces busco la paz que da el mundo: la que llega solo cuando todo se resuelve. Hoy quiero recibir la tuya — la que ofreciste la noche más difícil de tu vida. Calma mi corazón turbado, no porque la tormenta se haya ido, sino porque Tú estás en la barca. Que tu paz, que venció a la muerte, guarde hoy mi mente. Amén.',
  faqs:[
    {q:'¿Qué significa "la paz os dejo, mi paz os doy" en Juan 14:27?', a:'Jesús ofrece su propia paz (eirene, equivalente al shalom hebreo: plenitud e integridad) a sus discípulos. No es un deseo sino un regalo concreto, dado la noche antes de la cruz, que se recibe por fe.'},
    {q:'¿En qué se diferencia la paz de Jesús de la del mundo?', a:'La paz del mundo es condicional: depende de circunstancias favorables y desaparece cuando vuelven los problemas. La paz de Cristo no depende de las circunstancias porque nace de Él, no de ellas; puede existir en medio de la tormenta, no solo en su ausencia.'},
    {q:'¿Por qué Jesús dijo esto justo antes de ser crucificado?', a:'El contexto es el aposento alto, horas antes de su arresto. Que ofreciera paz sabiendo lo que venía demuestra que no era optimismo ingenuo, sino una paz probada en el peor escenario — y confirmada después por su resurrección.'},
    {q:'¿Cómo recibir la paz que Jesús ofrece?', a:'Su mandato "no se turbe vuestro corazón" implica que la paz se recibe activamente. Se cultiva anclando el corazón en Cristo mediante la oración, su Palabra y la confianza consciente, en vez de fijar la atención en las circunstancias amenazantes.'}
  ],
  prev:{slug:'salmos-121', title:'Salmos 121: El Guardián que No Duerme Mientras Tú Sí'},
  next:{slug:'1-corintios-10-13', title:'1 Corintios 10:13: La Promesa para el Momento Justo Antes de Caer'}
},

// ── 42 · 1 Corintios 10:13 ───────────────────────────────────────────────────
{
  slug:'1-corintios-10-13', ref:'1 Corintios 10:13', libro:'1 Corintios', cap:'10',
  date:'2026-07-09', dateLabel:'9 de julio, 2026',
  verseShort:'Fiel es Dios, que no os dejará ser tentados más de lo que podéis llevar.',
  cardVerse:'Fiel es Dios, que no os dejará ser tentados más de lo que podéis llevar.',
  title:'1 Corintios 10:13: Dios Siempre Da una Salida a la Tentación',
  metaDesc:'Devocional sobre 1 Corintios 10:13. Qué significa que Dios no permite tentación mayor de la que podemos soportar, y qué es la "salida" (ekbasis) que promete.',
  h1:'1 Corintios 10:13: La Promesa para el Momento Justo Antes de Caer',
  tags:['1 Corintios','Tentación','Fidelidad'], category:'Nuevo Testamento', cardTags:['1 Corintios','Tentación'],
  cardExcerpt:'No promete que la tentación desaparezca. Promete dos cosas: que no será más de lo que puedes soportar, y que siempre hay una salida — ekbasis, una puerta de escape que Dios coloca antes de que entres en el callejón.',
  bodyHtml:`
    <p>Cuando estamos a punto de ceder a algo que sabemos que nos hará daño, la mentira que más nos repetimos es: <em>"no tengo opción, esto es más fuerte que yo."</em> Y precisamente contra esa mentira escribió Pablo uno de los versículos más prácticos de toda la Biblia.</p>
    <p>No es una promesa de que nunca seremos tentados. Es algo mejor: una promesa sobre lo que Dios garantiza en medio de la tentación.</p>

    <h2 class="section-title">"No os ha tomado tentación, sino humana"</h2>
    <p>Pablo empieza desinflando el aislamiento. La palabra griega para tentación es <em>peirasmos</em>, que significa tanto "tentación" como "prueba". Y dice: lo que te pasa es <em>humano</em> — común, ordinario, compartido. El enemigo te susurra que tu lucha es única, vergonzosa, que nadie entendería. Pablo responde: no hay nada nuevo en tu tentación; millones la han enfrentado y vencido.</p>
    <p>Eso ya cambia el terreno. No estás peleando una batalla rara e imposible. Estás peleando una batalla humana, y hay un Dios fiel comprometido en ella.</p>

    <div class="verse-block">
      <p>No os ha tomado tentación, sino humana: mas fiel es Dios, que no os dejará ser tentados más de lo que podéis llevar; antes dará también juntamente con la tentación la salida, para que podáis aguantar.</p>
      <cite>— 1 Corintios 10:13, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El límite que Dios pone</h2>
    <p>La promesa descansa en dos palabras: <strong>"fiel es Dios."</strong> No dice "fuerte eres tú". La garantía no es tu capacidad sino su fidelidad. Y lo que su fidelidad asegura es un límite: <em>no serás tentado más de lo que puedes llevar</em>. Dios conoce exactamente tu punto de quiebre y no permite que la presión lo sobrepase.</p>
    <p>Esto no significa que la tentación sea ligera. Significa que nunca es imposible de resistir. Cuando dices "no puedo más", la Palabra responde: sí puedes, porque Dios mismo midió la carga antes de permitirla.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>La palabra para "salida" es <em>ekbasis</em>: el camino por el que un ejército escapa de un desfiladero cerrado. Dios no solo limita la tentación — pone una puerta de escape. <strong>El problema casi nunca es que no haya salida; es que en el momento de la tentación dejamos de buscarla.</strong></p>
    </div>

    <h2 class="section-title">La salida siempre está, pero hay que tomarla</h2>
    <p>El versículo dice que Dios da la salida <em>"juntamente con la tentación"</em> — no después, no más tarde, sino al mismo tiempo. La puerta de escape ya está puesta antes de que entres al callejón. A veces es una llamada que puedes hacer, una habitación de la que puedes salir, un pensamiento que puedes redirigir, un "no" que puedes decir mientras aún es fácil.</p>
    <p>La fidelidad de Dios pone la salida. La fe la usa. <strong>Resistir no es apretar los dientes hasta que pase: es caminar hacia la puerta que Él ya abrió.</strong></p>`,
  prayer:'Señor fiel, cuando la tentación me dice que no tengo opción, recuérdame que Tú siempre pones una salida. Dame ojos para verla en el momento exacto y voluntad para tomarla mientras aún puedo. No confío en mi fuerza sino en tu fidelidad, que midió esta carga antes de permitirla. Líbrame del mal hoy. Amén.',
  faqs:[
    {q:'¿Qué significa que Dios no permite tentación mayor de la que podemos soportar?', a:'Significa que la fidelidad de Dios pone un límite a la presión que enfrentamos: nunca permite una tentación que exceda nuestra capacidad de resistir con su ayuda. La garantía no descansa en nuestra fuerza, sino en que "fiel es Dios".'},
    {q:'¿Qué es la "salida" que menciona 1 Corintios 10:13?', a:'La palabra griega ekbasis describe la vía de escape de un lugar cerrado, como un desfiladero. Dios provee, junto con cada tentación, un camino concreto para salir de ella — una decisión, una acción o un pensamiento que rompe el avance hacia el pecado.'},
    {q:'¿Significa este versículo que Dios envía la tentación?', a:'No. Santiago 1:13 aclara que Dios no tienta a nadie con el mal. La tentación viene del enemigo y de nuestros propios deseos. Lo que 1 Corintios 10:13 promete es que Dios permanece fiel en medio de ella, limitándola y proveyendo escape.'},
    {q:'¿Por qué a veces caemos si siempre hay una salida?', a:'Porque la salida hay que tomarla. Dios la provee "juntamente con la tentación", pero en el momento de la presión solemos dejar de buscarla o elegimos no usarla. Resistir es caminar conscientemente hacia la puerta que Dios ya abrió, lo más temprano posible.'}
  ],
  prev:{slug:'juan-14-27', title:'Juan 14:27: Una Paz que Llega Aun Cuando la Tormenta No se Va'},
  next:{slug:'romanos-10-9', title:'Romanos 10:9: La Salvación Más Cercana de lo que Crees'}
},

// ── 43 · Romanos 10:9 ────────────────────────────────────────────────────────
{
  slug:'romanos-10-9', ref:'Romanos 10:9', libro:'Romanos', cap:'10',
  date:'2026-07-10', dateLabel:'10 de julio, 2026',
  verseShort:'Si confesares con tu boca al Señor Jesús, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo.',
  cardVerse:'Si confesares con tu boca al Señor Jesús, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo.',
  title:'Romanos 10:9: Qué Significa Confesar y Creer para Ser Salvo',
  metaDesc:'Devocional sobre Romanos 10:9. Qué significa confesar con la boca y creer en el corazón, y por qué la resurrección de Jesús es el centro de la fe que salva.',
  h1:'Romanos 10:9: La Salvación Más Cercana de lo que Crees',
  tags:['Romanos','Salvación','Fe'], category:'Nuevo Testamento', cardTags:['Romanos','Salvación'],
  cardExcerpt:'Pablo reduce la salvación a dos cosas al alcance de cualquiera: una confesión y una creencia. Y el contenido de esa fe es concreto — que Dios resucitó a Jesús. La tumba vacía no es un detalle decorativo; es el centro de todo.',
  bodyHtml:`
    <p>Hay quien imagina que llegar a Dios requiere una larga escalera de méritos: años de buen comportamiento, ritos complicados, una santidad inalcanzable. Pablo, en Romanos 10, demuele esa idea. La salvación, dice, no está lejos ni en lo alto. Está <em>"cerca de ti, en tu boca y en tu corazón."</em></p>
    <p>Y luego la resume en una sola frase asombrosamente accesible.</p>

    <h2 class="section-title">Confesar: decir quién manda</h2>
    <p>El verbo griego es <em>homologeō</em> — literalmente "decir lo mismo", declarar abiertamente, estar de acuerdo. Confesar "al Señor Jesús" no es recitar una fórmula mágica; es declarar un cambio de gobierno. En el mundo romano, decir <em>"Jesús es Señor" (Kyrios)</em> era peligroso, porque el César reclamaba ese título. Confesar a Jesús como Señor era reconocer que ya no te gobiernas tú, ni te gobierna el imperio: te gobierna Él.</p>
    <p>Por eso la salvación empieza en la boca: porque lo que confesamos públicamente revela a quién realmente le hemos entregado el trono.</p>

    <div class="verse-block">
      <p>Que si confesares con tu boca al Señor Jesús, y creyeres en tu corazón que Dios le levantó de los muertos, serás salvo. Porque con el corazón se cree para justicia; mas con la boca se hace confesión para salud.</p>
      <cite>— Romanos 10:9-10, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">Creer: la resurrección en el centro</h2>
    <p>Nótalo bien: Pablo no dice "cree que Jesús existió" ni "cree que fue un buen maestro". Especifica el contenido exacto de la fe que salva: <strong>"que Dios le levantó de los muertos."</strong> La resurrección no es un apéndice del cristianismo — es su columna vertebral. Si Cristo no resucitó, dirá Pablo más adelante, nuestra fe es vana. Pero resucitó.</p>
    <p>La tumba vacía es la prueba de que el sacrificio fue aceptado, de que la muerte fue vencida, de que Jesús es exactamente quien dijo ser. Creer en el corazón que Dios lo levantó es apostar tu vida entera a que la muerte ya no tiene la última palabra.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>La salvación involucra a la persona entera: el corazón que cree y la boca que confiesa. No es solo una emoción privada ni solo una declaración pública: es la coherencia entre lo que crees adentro y lo que declaras afuera. <strong>Una fe que el corazón guarda pero la boca niega, y una confesión que la boca dice pero el corazón no cree, son ambas incompletas.</strong></p>
    </div>

    <h2 class="section-title">"Serás salvo" — la promesa sin asteriscos</h2>
    <p>El versículo siguiente lo universaliza: <em>"todo aquel que en él creyere, no será avergonzado... porque el mismo Señor de todos es rico para con todos los que le invocan."</em> No hay letra pequeña, ni cláusula de exclusión por raza, pasado o fracaso. La puerta es estrecha en su exigencia — Jesús como Señor — pero ancha en su alcance: <strong>todo aquel.</strong></p>
    <p>La salvación más grande del universo cabe en algo tan cercano como tu propia boca y tu propio corazón. Esa cercanía es, en sí misma, una gracia.</p>`,
  prayer:'Señor Jesús, hoy te confieso como mi Señor — no solo con palabras, sino entregándote el trono de mi vida. Creo en mi corazón que Dios te levantó de los muertos, que la tumba quedó vacía y que la muerte no tuvo la última palabra. Gracias porque la salvación no estaba lejos ni en lo alto, sino cerca, a mi alcance. En tu nombre resucitado, amén.',
  faqs:[
    {q:'¿Qué significa confesar con la boca al Señor Jesús?', a:'El verbo griego homologeō significa "decir lo mismo", declarar abiertamente. Confesar a Jesús como Señor (Kyrios) es reconocer públicamente que Él gobierna tu vida. En el contexto romano era una declaración costosa, porque ese título lo reclamaba el César.'},
    {q:'¿Por qué la resurrección es parte de la fe que salva en Romanos 10:9?', a:'Pablo especifica que hay que creer "que Dios le levantó de los muertos". La resurrección es central, no opcional: prueba que el sacrificio fue aceptado y que Jesús venció a la muerte. Sin ella, según 1 Corintios 15, la fe sería vana — pero Cristo sí resucitó.'},
    {q:'¿Basta con decir las palabras para ser salvo?', a:'No es una fórmula mágica. El versículo 10 aclara que la confesión de la boca debe corresponder a la creencia del corazón. La salvación involucra a la persona entera: fe genuina interior y declaración coherente exterior, no una mera recitación.'},
    {q:'¿Para quién es la promesa de salvación de Romanos 10?', a:'El versículo 13 la universaliza: "todo aquel que invocare el nombre del Señor, será salvo". No hay exclusión por raza, pasado o fracaso. La exigencia es clara —Jesús como Señor— pero el alcance es para todos los que le invocan.'}
  ],
  prev:{slug:'1-corintios-10-13', title:'1 Corintios 10:13: La Promesa para el Momento Justo Antes de Caer'},
  next:{slug:'salmos-37-4', title:'Salmos 37:4: La Promesa Que Cambia lo que tu Corazón Pide'}
},

// ── 44 · Salmos 37:4 ─────────────────────────────────────────────────────────
{
  slug:'salmos-37-4', ref:'Salmos 37:4', libro:'Salmos', cap:'37',
  date:'2026-07-11', dateLabel:'11 de julio, 2026',
  verseShort:'Pon asimismo tu delicia en Jehová, y él te concederá las peticiones de tu corazón.',
  cardVerse:'Pon asimismo tu delicia en Jehová, y él te concederá las peticiones de tu corazón.',
  title:'Salmos 37:4: Deléitate en Jehová y Él te Dará — Qué Significa Realmente',
  metaDesc:'Devocional sobre Salmos 37:4. ¿Es un cheque en blanco? Qué significa deleitarse en Dios y cómo Él no solo concede los deseos del corazón, sino que los transforma.',
  h1:'Salmos 37:4: La Promesa Que Cambia lo que tu Corazón Pide',
  tags:['Salmos','Deleite','Deseos'], category:'Salmos', cardTags:['Salmos','Deleite'],
  cardExcerpt:'Muchos lo leen como un cheque en blanco: deléitate y tendrás lo que quieras. Pero el orden importa. Cuando te deleitas de verdad en Dios, Él no solo concede tus deseos — los transforma en deseos que vale la pena conceder.',
  bodyHtml:`
    <p>Es uno de los versículos más usados — y más malentendidos — de los Salmos. Lo citamos como si fuera una máquina expendedora celestial: <em>"deléitate en Dios y Él te dará lo que pidas."</em> Como si el deleite fuera la moneda y los deseos cumplidos el producto.</p>
    <p>Pero el verbo que David eligió desarma esa lectura por completo.</p>

    <h2 class="section-title">"Deleitarse" — más que disfrutar</h2>
    <p>La palabra hebrea es <em>anag</em>: deleitarse, encontrar el placer más exquisito, ser blandeado de gozo. No es resignación religiosa ("supongo que debo amar a Dios"). Es deleite real, el tipo de gusto que sientes ante algo que de verdad te encanta. David no dice "obedece a Dios y te premiará"; dice <strong>"haz de Dios mismo tu mayor placer."</strong></p>
    <p>Y aquí está la clave que casi todos pasan por alto: cuando algo se convierte en tu deleite supremo, <em>tus deseos empiezan a reorganizarse alrededor de ello</em>. El que ama de verdad la música desea practicar; no es un sacrificio, es un anhelo. Deleitarse en Dios reescribe el catálogo de lo que el corazón pide.</p>

    <div class="verse-block">
      <p>Pon asimismo tu delicia en Jehová, y él te concederá las peticiones de tu corazón. Encomienda á Jehová tu camino, y espera en él; y él hará.
      </p>
      <cite>— Salmos 37:4-5, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El orden lo es todo</h2>
    <p>El versículo tiene una secuencia, no es simultáneo. <strong>Primero</strong> el deleite, <strong>después</strong> las peticiones concedidas. Y eso importa porque el deleite es lo que purifica las peticiones. Un corazón que se deleita en Dios va a pedir cosas distintas que un corazón que solo se deleita en sí mismo.</p>
    <p>No es que Dios te dé caprichos por deleitarte. Es que, al deleitarte en Él, empiezas a querer lo que Él quiere — y entonces sí, esos deseos los concede con gusto, porque ya están alineados con su corazón. La promesa no es "Dios cumplirá tus antojos"; es <strong>"Dios cumplirá los deseos que Él mismo plantó en ti cuando te deleitaste en su presencia."</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El Salmo 37 entero es un contraste entre envidiar a los malos que prosperan y confiar en Dios. David escribe "siendo ya viejo" (v.25). Es sabiduría de toda una vida: <strong>lo que más deseas revela en qué te deleitas. Cambia el deleite, y cambiará todo lo que persigues.</strong></p>
    </div>

    <h2 class="section-title">Lo que sigue: encomendar y esperar</h2>
    <p>David no se detiene en el deleite. El versículo 5 añade: <em>"encomienda á Jehová tu camino, y espera en él; y él hará."</em> El verbo "encomendar" es literalmente "rodar" — rueda tu carga sobre Él, como quien transfiere un peso que no puede cargar. Y luego, <em>espera</em>. La promesa rara vez es instantánea.</p>
    <p>Deleitarse, encomendar, esperar. No es una fórmula para manipular a Dios, sino el retrato de un corazón que ha encontrado en Él suficiente gozo como para confiarle también el resultado.</p>`,
  prayer:'Señor, confieso que muchas veces te he tratado como un medio para conseguir lo que quiero, en vez de quererte a Ti como mi mayor deleite. Cámbiame el corazón: enséñame a deleitarme en quién eres, no solo en lo que das. Y mientras lo haces, reordena mis deseos hasta que lo que pida nazca de Ti. Encomiendo mi camino y espero en Ti. Amén.',
  faqs:[
    {q:'¿Es Salmos 37:4 una promesa de que Dios dará todo lo que pidamos?', a:'No es un cheque en blanco. El versículo tiene un orden: primero deleitarse en Dios, luego recibir los deseos del corazón. El deleite en Dios reordena lo que el corazón desea, de modo que las peticiones concedidas son las que ya están alineadas con la voluntad de Dios.'},
    {q:'¿Qué significa "deleitarse en Jehová"?', a:'El verbo hebreo anag significa encontrar el placer más profundo y exquisito. Deleitarse en Dios es hacer de Él mismo —no solo de sus regalos— la mayor fuente de gozo. No es obediencia resignada, sino disfrute genuino de su presencia.'},
    {q:'¿Cómo "deleitarse en Dios" de forma práctica?', a:'Se cultiva pasando tiempo en su presencia con gratitud y no solo con peticiones, meditando en quién es Él, adorando y disfrutando su Palabra. Como cualquier deleite, crece con la cercanía. Escuchar los Salmos en audio puede ayudar a saborearlos sin la fatiga de la prisa.'},
    {q:'¿Cuál es el contexto del Salmo 37?', a:'Es un salmo de David escrito en su vejez (v.25), que contrasta la tentación de envidiar a los malvados que prosperan con la confianza paciente en Dios. El versículo 4 forma parte de una serie de invitaciones: deléitate, encomienda, espera, confía.'}
  ],
  prev:{slug:'romanos-10-9', title:'Romanos 10:9: La Salvación Más Cercana de lo que Crees'},
  next:{slug:'2-corintios-5-17', title:'2 Corintios 5:17: No Mejorado, Sino Hecho Nuevo'}
},

// ── 45 · 2 Corintios 5:17 ────────────────────────────────────────────────────
{
  slug:'2-corintios-5-17', ref:'2 Corintios 5:17', libro:'2 Corintios', cap:'5',
  date:'2026-07-12', dateLabel:'12 de julio, 2026',
  verseShort:'Si alguno está en Cristo, nueva criatura es: las cosas viejas pasaron; he aquí todas son hechas nuevas.',
  cardVerse:'Si alguno está en Cristo, nueva criatura es: las cosas viejas pasaron; he aquí todas son hechas nuevas.',
  title:'2 Corintios 5:17: Nueva Criatura en Cristo — Significado Profundo',
  metaDesc:'Devocional sobre 2 Corintios 5:17. Qué significa ser "nueva criatura" en Cristo, por qué el griego kainos no es solo "reciente", y cómo aplica a tu identidad y tu pasado.',
  h1:'2 Corintios 5:17: No Mejorado, Sino Hecho Nuevo',
  tags:['2 Corintios','Identidad','Nueva vida'], category:'Nuevo Testamento', cardTags:['2 Corintios','Identidad'],
  cardExcerpt:'El griego kainos no significa nuevo como "otro más reciente" sino nuevo en clase, en calidad, en naturaleza. El evangelio no te ofrece una versión mejorada de ti — te ofrece una criatura que antes no existía.',
  bodyHtml:`
    <p>Mucha gente vive el cristianismo como un proyecto de superación personal: ser un poco mejor cada año, corregir defectos, pulir asperezas. Y aunque Dios sí transforma el carácter, Pablo dice algo mucho más radical en 2 Corintios 5:17. No habla de mejora. Habla de <strong>creación.</strong></p>
    <p>La diferencia no es de grado. Es de categoría.</p>

    <h2 class="section-title">Dos palabras griegas para "nuevo"</h2>
    <p>El griego tenía dos términos para "nuevo". <em>Neos</em> significa nuevo en el tiempo: reciente, otro ejemplar del mismo tipo, como un pan recién horneado igual al de ayer. Pero Pablo no usa esa. Usa <strong><em>kainos</em></strong>: nuevo en <em>naturaleza</em>, en calidad, en esencia. No otra cosa igual, sino algo de una clase que antes no existía.</p>
    <p>Y junto a ella usa <em>ktisis</em> — "criatura", "creación", la misma raíz del acto creador de Dios. Así que la frase no dice "si alguno está en Cristo, es una persona renovada". Dice: <strong>es una nueva creación, una criatura nueva, obra fresca de las manos de Dios.</strong> El mismo poder que dijo "sea la luz" actúa en quien está en Cristo.</p>

    <div class="verse-block">
      <p>De modo que si alguno está en Cristo, nueva criatura es: las cosas viejas pasaron; he aquí todas son hechas nuevas. Y todo esto es de Dios, el cual nos reconcilió á sí por Cristo.</p>
      <cite>— 2 Corintios 5:17-18, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Las cosas viejas pasaron"</h2>
    <p>Esta frase es una de las más liberadoras de la Biblia para quien arrastra un pasado pesado. <em>Pasaron</em> — el verbo griego indica algo que se fue y ya no define. No dice que las cosas viejas se mejoraron o se taparon; dice que pasaron. Tu identidad ya no se construye sobre lo que hiciste, lo que te hicieron, o lo que eras. Se construye sobre quién eres ahora <em>en Cristo</em>.</p>
    <p>El enemigo quiere mantenerte presentándote una y otra vez la versión vieja de ti, como si todavía fuera la actual. Pablo dice: esa versión pasó. <strong>No eres tu peor día, ni tu mayor error, ni tu etiqueta más cruel. Eres una criatura nueva.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>"En Cristo" es la clave del versículo, no "nueva criatura". La novedad no es algo que generas por fuerza de voluntad — es consecuencia de <em>estar en Él</em>. Como una rama injertada en un árbol nuevo: la savia que ahora corre por ti no es la tuya. <strong>No te vuelves nuevo esforzándote; te vuelves nuevo permaneciendo en Aquel que te hizo nuevo.</strong></p>
    </div>

    <h2 class="section-title">Lo nuevo todavía se está revelando</h2>
    <p>Hay una tensión honesta aquí: si soy nueva criatura, ¿por qué sigo luchando con lo viejo? Porque la nueva creación es un hecho declarado por Dios que se va manifestando con el tiempo. Eres nuevo en tu identidad <em>posicional</em> desde el primer día; esa novedad se traduce en conducta progresivamente, mientras vives en comunión con Él.</p>
    <p>No estás tratando de <em>volverte</em> alguien que no eres. Estás aprendiendo a <em>vivir como</em> lo que Dios ya declaró que eres. Y esa es una batalla que se pelea desde la victoria, no hacia ella.</p>`,
  prayer:'Padre, gracias porque en Cristo no soy una versión remendada de mi viejo yo, sino una criatura nueva, obra de tus manos. Cuando el enemigo me presente mi pasado como si aún me definiera, recuérdame que esas cosas pasaron. Enséñame a vivir hoy como lo que ya declaraste que soy: nuevo, reconciliado, tuyo. Amén.',
  faqs:[
    {q:'¿Qué significa ser "nueva criatura" en Cristo?', a:'El griego kainos ktisis significa una creación nueva en naturaleza y calidad, no solo reciente en el tiempo. No es una mejora del viejo yo, sino una criatura de una clase que antes no existía, hecha por el mismo poder creador de Dios.'},
    {q:'¿Cuál es la diferencia entre kainos y neos en griego?', a:'Neos significa nuevo en el tiempo (reciente, otro ejemplar del mismo tipo). Kainos —la palabra que usa Pablo— significa nuevo en esencia y calidad. La elección de kainos subraya que la transformación en Cristo es de categoría, no solo de grado.'},
    {q:'¿Qué significa que "las cosas viejas pasaron"?', a:'El verbo griego indica algo que se fue y ya no define la identidad. El pasado, los errores y las viejas etiquetas dejan de ser el fundamento de quién eres. Tu identidad se construye ahora sobre estar "en Cristo", no sobre lo que fuiste.'},
    {q:'Si soy nueva criatura, ¿por qué sigo pecando?', a:'La nueva creación es un hecho posicional declarado por Dios desde el primer día, que se manifiesta progresivamente en la conducta mientras vives en comunión con Él. La lucha contra lo viejo se pelea desde una identidad ya renovada, no para alcanzarla.'}
  ],
  prev:{slug:'salmos-37-4', title:'Salmos 37:4: La Promesa Que Cambia lo que tu Corazón Pide'},
  next:{slug:'mateo-28-19', title:'Mateo 28:19-20: La Última Orden de Jesús y su Última Promesa'}
},

// ── 46 · Mateo 28:19-20 ──────────────────────────────────────────────────────
{
  slug:'mateo-28-19', ref:'Mateo 28:19-20', libro:'Mateo', cap:'28',
  date:'2026-07-13', dateLabel:'13 de julio, 2026',
  verseShort:'Id, y doctrinad á todos los Gentiles... y he aquí, yo estoy con vosotros todos los días, hasta el fin del mundo.',
  cardVerse:'Id, y doctrinad á todos los Gentiles... y he aquí, yo estoy con vosotros todos los días.',
  title:'Mateo 28:19-20: La Gran Comisión y la Promesa que la Acompaña',
  metaDesc:'Devocional sobre la Gran Comisión (Mateo 28:19-20). Qué ordenó realmente el Cristo resucitado, por qué "haced discípulos" es el verbo central, y la promesa final.',
  h1:'Mateo 28:19-20: La Última Orden de Jesús y su Última Promesa',
  tags:['Mateo','Misión','Discipulado'], category:'Nuevo Testamento', cardTags:['Mateo','Misión'],
  cardExcerpt:'El Cristo resucitado no dejó un programa, dejó una orden y una compañía. "Haced discípulos" es el único imperativo en griego; "id, bautizad, enseñad" giran alrededor. Y lo cierra con la promesa: yo estoy con vosotros.',
  bodyHtml:`
    <p>Son las últimas palabras de Jesús en el Evangelio de Mateo. Y las últimas palabras importan: son lo que alguien elige dejar como resumen de todo. El Cristo <strong>resucitado</strong> — vivo, victorioso sobre la tumba — reúne a sus discípulos en un monte de Galilea y les entrega lo que se conoce como la Gran Comisión.</p>
    <p>Lo notable es lo que dijo, y lo que <em>no</em> dijo.</p>

    <h2 class="section-title">"Toda potestad me es dada" — el fundamento</h2>
    <p>Antes de la orden viene una declaración: <em>"Toda potestad me es dada en el cielo y en la tierra."</em> Esto no es un detalle. La misión no descansa en la capacidad de los discípulos —un puñado de pescadores asustados— sino en la <strong>autoridad del que la ordena.</strong> Porque resucitó, Jesús tiene autoridad total; y desde esa autoridad envía. La Gran Comisión empieza con poder, no con presión.</p>

    <div class="verse-block">
      <p>Por tanto, id, y doctrinad á todos los Gentiles, bautizándolos en el nombre del Padre, y del Hijo, y del Espíritu Santo: enseñándoles que guarden todas las cosas que os he mandado: y he aquí, yo estoy con vosotros todos los días, hasta el fin del mundo.</p>
      <cite>— Mateo 28:19-20, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El único verbo que manda: "haced discípulos"</h2>
    <p>En español parece que hay varios mandatos: id, doctrinad (haced discípulos), bautizad, enseñad. Pero en el griego original solo uno es imperativo: <strong><em>mathēteuō</em></strong> — "haced discípulos". Los otros tres son participios que dependen de él: <em>yendo</em>, <em>bautizando</em>, <em>enseñando</em>. Es decir, la orden central no es "vayan" ni "hagan eventos": es <strong>formar seguidores de Jesús.</strong> El ir, el bautizar y el enseñar son el cómo.</p>
    <p>Esto reordena nuestra idea de misión. No se trata solo de conseguir decisiones, sino de hacer <em>discípulos</em>: personas que aprenden a guardar "todas las cosas" que Jesús mandó. Una fe que se reproduce y se profundiza, no que solo se anuncia.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>La Gran Comisión no es una tarea para especialistas. "Yendo" describe la vida ordinaria —tu trabajo, tu barrio, tu familia—. <strong>El llamado no es principalmente ir a otro lugar, sino hacer discípulos por donde ya pasas.</strong></p>
    </div>

    <h2 class="section-title">La promesa que sostiene la orden</h2>
    <p>Y entonces, la última frase, la que lo cambia todo: <em>"he aquí, yo estoy con vosotros todos los días, hasta el fin del mundo."</em> La orden más grande viene con la compañía más grande. Jesús no manda a sus discípulos a una misión y se queda atrás: va con ellos. El "Emanuel —Dios con nosotros" con que empieza Mateo (1:23) es el "yo estoy con vosotros" con que termina. El Evangelio se cierra como abrió: con Dios presente.</p>
    <p><strong>No te envía solo.</strong> Cualquier cosa que Dios te llame a hacer, la hace contigo presente — todos los días, hasta el fin.</p>`,
  prayer:'Señor resucitado, Tú que tienes toda autoridad en el cielo y en la tierra, gracias porque la misión no depende de mi fuerza sino de tu poder. Ayúdame a hacer discípulos por donde ya paso — en mi casa, mi trabajo, mi barrio. Y gracias por la promesa que sostiene todo: que estás conmigo todos los días. No me envías solo. Amén.',
  faqs:[
    {q:'¿Qué es la Gran Comisión de Mateo 28:19-20?', a:'Son las últimas palabras de Jesús resucitado a sus discípulos: la orden de hacer discípulos en todas las naciones, bautizándolos y enseñándoles a obedecer todo lo que Él mandó, acompañada de la promesa de su presencia permanente.'},
    {q:'¿Cuál es el verbo principal de la Gran Comisión?', a:'En el griego original, el único imperativo es "haced discípulos" (mathēteuō). "Id", "bautizando" y "enseñando" son participios que dependen de él. La orden central no es viajar ni hacer eventos, sino formar seguidores de Jesús.'},
    {q:'¿Por qué Jesús menciona su autoridad antes de dar la orden?', a:'Porque la misión descansa en la autoridad del que la ordena, no en la capacidad de los discípulos. Al haber resucitado, Jesús posee "toda potestad en el cielo y en la tierra", y desde ese poder envía. La comisión empieza con respaldo, no con presión.'},
    {q:'¿Qué significa "yo estoy con vosotros todos los días"?', a:'Es la promesa que sostiene la orden: Jesús no envía a sus discípulos y se queda atrás, sino que va con ellos siempre. Conecta con el "Emanuel, Dios con nosotros" del inicio de Mateo. La misión nunca se realiza en soledad.'}
  ],
  prev:{slug:'2-corintios-5-17', title:'2 Corintios 5:17: No Mejorado, Sino Hecho Nuevo'},
  next:{slug:'proverbios-31-10', title:'Proverbios 31: La "Mujer Fuerte" No es una Lista Imposible'}
},

// ── 47 · Proverbios 31:10 ────────────────────────────────────────────────────
{
  slug:'proverbios-31-10', ref:'Proverbios 31:10', libro:'Proverbios', cap:'31',
  date:'2026-07-14', dateLabel:'14 de julio, 2026',
  verseShort:'Mujer fuerte, ¿quién la hallará? Porque su estima sobrepuja largamente á la de piedras preciosas.',
  cardVerse:'Mujer fuerte, ¿quién la hallará? Porque su estima sobrepuja largamente á la de piedras preciosas.',
  title:'Proverbios 31:10: La Mujer Virtuosa — Quién es Realmente (eshet chayil)',
  metaDesc:'Devocional sobre Proverbios 31:10. Qué significa "mujer virtuosa", por qué el hebreo eshet chayil habla de fuerza y valor, y por qué no es una lista imposible que cumplir.',
  h1:'Proverbios 31: La "Mujer Fuerte" No es una Lista Imposible',
  tags:['Proverbios','Mujer','Valor'], category:'Sabiduría', cardTags:['Proverbios','Mujer'],
  cardExcerpt:'La palabra hebrea es chayil — la misma que se usa para un ejército y para los héroes de guerra. Proverbios 31 no describe un ama de casa perfecta, sino una mujer de fuerza y valor. En Israel se recitaba para honrarla, no para abrumarla.',
  bodyHtml:`
    <p>Pocos pasajes han sido tan mal usados como Proverbios 31. Se ha convertido, para muchas mujeres, en una lista agotadora de imposibles: levantarse de noche, manejar negocios, coser, cocinar, ayudar a los pobres, no quejarse nunca. Un estándar que aplasta en lugar de inspirar.</p>
    <p>Pero ese uso traiciona por completo lo que el texto era en su origen.</p>

    <h2 class="section-title">"Mujer fuerte" — eshet chayil</h2>
    <p>La expresión hebrea es <em>eshet chayil</em>. Y <em>chayil</em> es una palabra de fuerza: se usa para los ejércitos, para los hombres valientes de guerra, para el poder y la valentía. Cuando se aplica a un hombre, se traduce "valiente", "esforzado", "guerrero". Aquí se aplica a una mujer. Por eso "mujer virtuosa" se queda corta — el sentido es <strong>"mujer de fuerza", "mujer de valor", una heroína.</strong></p>
    <p>El poema no describe a alguien frágil que cumple tareas domésticas. Describe a una mujer poderosa, capaz, sabia, cuya influencia llena su casa y su comunidad. Es un canto de honor, no una vara de medir.</p>

    <div class="verse-block">
      <p>Mujer fuerte, ¿quién la hallará? Porque su estima sobrepuja largamente á la de piedras preciosas. El corazón de su marido está en ella confiado, y no tendrá necesidad de despojo.</p>
      <cite>— Proverbios 31:10-11, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">Un poema para recitar, no una tarea para cumplir</h2>
    <p>En la tradición judía, Proverbios 31 (un poema acróstico, una estrofa por cada letra del alfabeto hebreo) se canta el viernes en la noche, en el hogar, antes de la cena de Shabat. ¿Quién lo recita? El esposo, a su esposa. No como una lista de exigencias —"haz todo esto"— sino como una <strong>bendición y un reconocimiento</strong>: "mira todo lo que eres y haces; eres una eshet chayil."</p>
    <p>Cambia por completo el tono. No es Dios diciéndole a la mujer "deberías ser así o fallas". Es la comunidad honrando lo que la mujer de fe ya es. Las mujeres judías se llaman unas a otras <em>eshet chayil</em> como un elogio, cuando alguna hace algo valiente o sabio — el equivalente a decir "¡eres una campeona!".</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El capítulo culmina en el versículo 30: <em>"Engañosa es la gracia, y vana la hermosura: la mujer que teme á Jehová, ésa será alabada."</em> El fundamento de toda la fuerza descrita no es la perfección doméstica ni la belleza, sino <strong>el temor de Jehová</strong>. Todo lo demás brota de ahí.</p>
    </div>

    <h2 class="section-title">Fuerza que nace de la fe</h2>
    <p>La mujer de Proverbios 31 trabaja, decide, crea, da — pero no para ganarse el valor, sino porque ya lo tiene en Dios. Su "estima sobrepuja a las piedras preciosas" antes de que el poema mencione una sola de sus obras. Su valor está declarado en el versículo 10; sus obras, descritas a partir del 13, son el desbordamiento de quién ya es.</p>
    <p>Y eso aplica a todo creyente, hombre o mujer: <strong>no trabajamos para conseguir valor; trabajamos desde un valor que Dios ya nos dio.</strong> La identidad precede a la actividad. La gracia precede a la obra.</p>`,
  prayer:'Señor, gracias porque mi valor no se gana con una lista de tareas perfectas, sino que me lo das Tú. Líbrame de leer tu Palabra como una vara que me aplasta, y enséñame a oírla como una bendición que me honra. Que toda mi fuerza, mi trabajo y mi entrega broten del temor reverente a Ti, no del miedo a no ser suficiente. Amén.',
  faqs:[
    {q:'¿Qué significa "mujer virtuosa" en Proverbios 31:10?', a:'La expresión hebrea es eshet chayil, que significa "mujer de fuerza" o "mujer de valor". Chayil es la palabra usada para ejércitos y guerreros valientes. "Virtuosa" se queda corta: el texto describe a una mujer poderosa, capaz y digna de honor, no a alguien frágil.'},
    {q:'¿Es Proverbios 31 una lista de exigencias para las mujeres?', a:'No en su origen. Es un poema acróstico de honor. En la tradición judía, el esposo lo recita a su esposa el viernes por la noche como bendición y reconocimiento de quién ella ya es, no como una lista de tareas que debe cumplir para ser aceptada.'},
    {q:'¿Cuál es el fundamento de la mujer de Proverbios 31?', a:'El versículo 30 lo declara: "la mujer que teme a Jehová, ésa será alabada". El temor reverente de Dios —no la belleza ni la perfección doméstica— es la raíz de toda la fuerza, sabiduría y generosidad descritas en el poema.'},
    {q:'¿Cómo aplica Proverbios 31 a los creyentes hoy?', a:'Enseña que la identidad precede a la actividad: el valor de la mujer se declara (v.10) antes de describir sus obras (v.13 en adelante). Para todo creyente, hombre o mujer, significa que no trabajamos para ganar valor, sino desde el valor que Dios ya nos dio.'}
  ],
  prev:{slug:'mateo-28-19', title:'Mateo 28:19-20: La Última Orden de Jesús y su Última Promesa'},
  next:{slug:'isaias-53-5', title:'Isaías 53:5: La Profecía que Describió la Cruz 700 Años Antes'}
},

// ── 48 · Isaías 53:5 ─────────────────────────────────────────────────────────
{
  slug:'isaias-53-5', ref:'Isaías 53:5', libro:'Isaías', cap:'53',
  date:'2026-07-15', dateLabel:'15 de julio, 2026',
  verseShort:'Por su llaga fuimos nosotros curados.',
  cardVerse:'Mas él herido fué por nuestras rebeliones, molido por nuestros pecados... y por su llaga fuimos nosotros curados.',
  title:'Isaías 53:5: Por su Llaga Fuimos Curados — El Siervo Sufriente',
  metaDesc:'Devocional sobre Isaías 53:5. La profecía del Siervo Sufriente escrita 700 años antes de Cristo: qué significa "por su llaga fuimos curados" y por qué no termina en la tumba.',
  h1:'Isaías 53:5: La Profecía que Describió la Cruz 700 Años Antes',
  tags:['Isaías','Redención','Profecía'], category:'Profetas', cardTags:['Isaías','Redención'],
  cardExcerpt:'Siete siglos antes de Cristo, Isaías describió a un siervo herido por nuestras rebeliones. Pero el capítulo no termina en la tumba: el versículo 10 dice que "verá linaje, vivirá". El Siervo herido vuelve a vivir.',
  bodyHtml:`
    <p>Hay un capítulo en el Antiguo Testamento que se lee como si el autor hubiera estado parado al pie de la cruz. Describe a un hombre despreciado, herido, callado ante sus verdugos, sepultado entre malhechores, que carga el pecado de otros. Y fue escrito <strong>unos 700 años antes</strong> de que Jesús naciera.</p>
    <p>Es Isaías 53, el cuarto y más profundo de los "Cánticos del Siervo". Y su versículo 5 es el corazón del evangelio anunciado por anticipado.</p>

    <h2 class="section-title">Un intercambio en cada línea</h2>
    <p>Lee el versículo despacio y verás un patrón: cada cosa que le sucede al Siervo es <em>por nosotros</em>. <strong>"Él herido fué por nuestras rebeliones, molido por nuestros pecados; el castigo de nuestra paz sobre él."</strong> No es una víctima al azar. Es una sustitución deliberada: lo que merecíamos cayó sobre Él, y lo que Él merecía —paz, salud— vino sobre nosotros.</p>
    <p>El hebreo es contundente. "Molido" es <em>daka</em>, aplastado, triturado. "Castigo de nuestra paz" significa que el <em>shalom</em> nuestro se compró con su dolor. No hubo perdón barato: hubo un precio, y lo pagó otro en nuestro lugar.</p>

    <div class="verse-block">
      <p>Mas él herido fué por nuestras rebeliones, molido por nuestros pecados: el castigo de nuestra paz sobre él; y por su llaga fuimos nosotros curados.</p>
      <cite>— Isaías 53:5, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Por su llaga fuimos curados"</h2>
    <p>La frase final es de una belleza terrible: <em>"por su llaga fuimos nosotros curados."</em> La palabra hebrea para llaga, <em>chaburah</em>, significa el moretón o la herida que deja un golpe. Su herida es nuestra sanidad. Su quebranto, nuestra salud. La curación más profunda —la del alma separada de Dios— se compró con las heridas de Otro.</p>
    <p>Nótalo: el versículo está en pasado. "Fuimos curados." Para Isaías, que escribía siglos antes, ya era un hecho consumado en el plan de Dios. Tan seguro estaba.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Antes del versículo 5, el versículo 6 nos retrata sin halagos: <em>"todos nosotros nos descarriamos como ovejas, cada cual se apartó por su camino."</em> El problema era universal. Por eso la solución tenía que venir de afuera. <strong>No podíamos sanarnos; necesitábamos a Alguien dispuesto a ser herido en nuestro lugar.</strong></p>
    </div>

    <h2 class="section-title">El capítulo no termina en la tumba</h2>
    <p>Aquí está la clave que muchos pasan por alto: Isaías 53 <strong>no acaba con la muerte del Siervo.</strong> El versículo 10 declara que, después de poner su vida en expiación, <em>"verá linaje, vivirá por largos días."</em> Y el 11: <em>"verá el fruto de la aflicción de su alma, y quedará saciado."</em> ¿Cómo puede un hombre muerto ver linaje, vivir largos días, quedar saciado? Solo de una manera: <strong>resucitando.</strong></p>
    <p>Isaías no solo profetizó la cruz; profetizó la tumba vacía. El Siervo herido vive. Por eso "fuimos curados" no es nostalgia de un mártir, sino la victoria de un Salvador que está vivo hoy. La cruz pagó la deuda; la resurrección firmó el recibo.</p>`,
  prayer:'Señor Jesús, Siervo herido por mis rebeliones: me asombra que mi sanidad costara tus llagas, que mi paz costara tu quebranto. Yo me descarrié como oveja, y Tú llevaste mi camino sobre Ti. Gracias porque no te quedaste en la tumba: vives, y por eso mi curación es segura. Hoy descanso en tu obra terminada y en tu vida eterna. Amén.',
  faqs:[
    {q:'¿Cuándo se escribió Isaías 53 y por qué es notable?', a:'Isaías 53 fue escrito alrededor del año 700 a.C., unos siete siglos antes de Cristo. Describe con asombroso detalle a un Siervo Sufriente herido por los pecados de otros, sepultado entre malhechores, lo que los cristianos identifican como una profecía de la pasión de Jesús.'},
    {q:'¿Qué significa "por su llaga fuimos curados"?', a:'La palabra hebrea chaburah significa la herida o moretón que deja un golpe. La frase expresa una sustitución: la herida del Siervo produce nuestra sanidad. La curación más profunda —la reconciliación del alma con Dios— se compró con el sufrimiento de Otro en nuestro lugar.'},
    {q:'¿Isaías 53 habla de la resurrección?', a:'Sí. El capítulo no termina con la muerte del Siervo. Los versículos 10 y 11 dicen que, tras dar su vida en expiación, "verá linaje, vivirá por largos días" y "quedará saciado". Un hombre muerto solo puede ver linaje y vivir largos días si resucita: Isaías anticipa la tumba vacía.'},
    {q:'¿Qué quiere decir que el castigo de "nuestra paz" cayó sobre Él?', a:'Significa que el shalom (paz, plenitud, reconciliación con Dios) que nosotros necesitábamos se obtuvo a través del castigo que el Siervo soportó. No fue un perdón sin costo: el precio fue real y lo pagó Él, para que nosotros recibiéramos la paz que no podíamos ganar.'}
  ],
  prev:{slug:'proverbios-31-10', title:'Proverbios 31: La "Mujer Fuerte" No es una Lista Imposible'},
  next:{slug:'galatas-2-20', title:'Gálatas 2:20: Morir para Empezar a Vivir de Verdad'}
},

// ── 49 · Gálatas 2:20 ────────────────────────────────────────────────────────
{
  slug:'galatas-2-20', ref:'Gálatas 2:20', libro:'Gálatas', cap:'2',
  date:'2026-07-16', dateLabel:'16 de julio, 2026',
  verseShort:'Con Cristo estoy juntamente crucificado, y vivo, no ya yo, mas vive Cristo en mí.',
  cardVerse:'Con Cristo estoy juntamente crucificado, y vivo, no ya yo, mas vive Cristo en mí.',
  title:'Gálatas 2:20: Con Cristo Estoy Juntamente Crucificado — Significado',
  metaDesc:'Devocional sobre Gálatas 2:20. Qué significa estar "crucificado con Cristo" y a la vez vivir, cómo Cristo vive en el creyente, y la fe del Hijo de Dios que nos amó.',
  h1:'Gálatas 2:20: Morir para Empezar a Vivir de Verdad',
  tags:['Gálatas','Identidad','Gracia'], category:'Nuevo Testamento', cardTags:['Gálatas','Identidad'],
  cardExcerpt:'Pablo une dos cosas que parecen contradictorias: estoy crucificado y vivo. La cruz no fue el final — porque Cristo resucitó y ahora vive en él. La vida cristiana no es imitar a un muerto, sino albergar a Uno que vive.',
  bodyHtml:`
    <p>Es uno de los versículos más densos y personales de Pablo. En una sola frase junta la muerte y la vida, el "yo" y Cristo, la cruz y el amor. Y describe el secreto de toda la vida cristiana: no es que yo me esfuerce más por ser bueno, sino que <strong>Otro vive a través de mí.</strong></p>

    <h2 class="section-title">"Estoy juntamente crucificado"</h2>
    <p>Pablo no dice "intento morir a mí mismo" como un proyecto pendiente. Usa el tiempo perfecto griego: <em>algo ya sucedió y sigue teniendo efecto.</em> "He sido crucificado con Cristo" — es un hecho consumado. Cuando Cristo murió, el viejo Pablo —el fariseo orgulloso que confiaba en sus méritos— murió con Él. Ese "yo" que necesitaba probar su valor ante Dios fue clavado en la cruz.</p>
    <p>Esto es liberación, no derrota. El "yo" que muere es el que vivía agotado tratando de ganarse la aceptación de Dios. Ese murió. Y con su muerte terminó la esclavitud de tener que merecer lo que solo se puede recibir como regalo.</p>

    <div class="verse-block">
      <p>Con Cristo estoy juntamente crucificado, y vivo, no ya yo, mas vive Cristo en mí: y lo que ahora vivo en la carne, lo vivo en la fe del Hijo de Dios, el cual me amó, y se entregó á sí mismo por mí.</p>
      <cite>— Gálatas 2:20, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Y vivo" — la paradoja que solo la resurrección resuelve</h2>
    <p>Aquí está el giro asombroso. Pablo dice que está crucificado <em>"y vivo".</em> ¿Cómo puede un crucificado vivir? La respuesta está en la frase siguiente: <strong>"mas vive Cristo en mí."</strong> La vida que ahora tiene Pablo no es la suya reactivada; es la vida de Cristo <em>resucitado</em> habitando en él. Si Cristo siguiera muerto, esta frase sería absurda. Pero Cristo venció la tumba y vive — y esa vida es la que ahora corre por el creyente.</p>
    <p>Por eso el cristianismo no es imitar a un buen hombre que murió hace dos mil años. Es albergar a Uno que está vivo. <strong>No tomas a Jesús como modelo a copiar desde afuera; lo recibes como vida que habita adentro.</strong></p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Fíjate en lo personal del cierre: <em>"el cual me amó, y se entregó á sí mismo por mí."</em> Pablo no dice "amó al mundo" (que es cierto), sino "me amó <em>a mí</em>". La cruz es lo bastante amplia para la humanidad entera y lo bastante íntima para tu nombre. <strong>Cristo no murió por una multitud anónima; murió por ti, personalmente.</strong></p>
    </div>

    <h2 class="section-title">Vivir por fe, no por esfuerzo</h2>
    <p>¿Cómo se vive esta nueva vida? Pablo lo dice: <em>"lo vivo en la fe del Hijo de Dios."</em> No por reglas, no por presión, no por mérito — por fe. Cada día se trata de creer que ya estoy muerto a la vieja manera de buscar aprobación, y de confiar en que Cristo vive en mí para producir lo que yo nunca pude producir solo.</p>
    <p>La vida cristiana, entonces, no es "esfuérzate hasta agotarte". Es "muere a la versión tuya que tenía que ganarlo todo, y deja que Cristo viva". Descanso y vida en lugar de agotamiento y deuda.</p>`,
  prayer:'Señor Jesús, el viejo yo que vivía agotado tratando de ganarme tu amor murió contigo en la cruz. Hoy elijo creerlo. Ya no vivo yo: vive Cristo en mí. Tú, que resucitaste y vives, vive a través de mí hoy lo que yo no puedo producir solo. Gracias porque me amaste a mí, por mi nombre, y te entregaste por mí. Amén.',
  faqs:[
    {q:'¿Qué significa estar "crucificado con Cristo" en Gálatas 2:20?', a:'Pablo usa el tiempo perfecto griego: es un hecho ya consumado que sigue vigente. Cuando Cristo murió, el viejo "yo" del creyente —el que intentaba ganarse la aceptación de Dios por méritos— murió con Él. Es liberación de la esclavitud de tener que merecer la salvación.'},
    {q:'¿Cómo puede Pablo estar crucificado y vivo a la vez?', a:'La paradoja se resuelve en la frase "mas vive Cristo en mí". La vida que Pablo tiene ahora no es la suya reactivada, sino la vida de Cristo resucitado habitando en él. Si Cristo no hubiera resucitado, la frase no tendría sentido; porque vive, su vida habita en el creyente.'},
    {q:'¿Qué significa que "Cristo vive en mí"?', a:'Significa que el cristianismo no es imitar desde afuera a un hombre que murió, sino recibir la vida de Cristo resucitado que habita dentro del creyente por el Espíritu. La transformación viene de adentro hacia afuera, no del esfuerzo por copiar un modelo externo.'},
    {q:'¿Cómo se vive la vida cristiana según Gálatas 2:20?', a:'Por fe, no por esfuerzo ni mérito: "lo vivo en la fe del Hijo de Dios". Consiste en creer cada día que el viejo yo murió y confiar en que Cristo vive en nosotros para producir lo que no podríamos por cuenta propia. Es descanso en su obra, no agotamiento por la propia.'}
  ],
  prev:{slug:'isaias-53-5', title:'Isaías 53:5: La Profecía que Describió la Cruz 700 Años Antes'},
  next:{slug:'salmos-1', title:'Salmos 1: La Diferencia Entre un Árbol Plantado y una Hoja al Viento'}
},

// ── 50 · Salmos 1 ────────────────────────────────────────────────────────────
{
  slug:'salmos-1', ref:'Salmos 1:1-3', libro:'Salmos', cap:'1',
  date:'2026-07-17', dateLabel:'17 de julio, 2026',
  verseShort:'Será como el árbol plantado junto á arroyos de aguas, que da su fruto en su tiempo.',
  cardVerse:'Será como el árbol plantado junto á arroyos de aguas, que da su fruto en su tiempo.',
  title:'Salmos 1: El Árbol Plantado Junto al Río — Significado y Devocional',
  metaDesc:'Devocional sobre Salmos 1. Qué significa meditar (hagah) en la ley de Dios día y noche, y por qué el árbol plantado junto al río da fruto sin marchitarse.',
  h1:'Salmos 1: La Diferencia Entre un Árbol Plantado y una Hoja al Viento',
  tags:['Salmos','Meditación','Fruto'], category:'Salmos', cardTags:['Salmos','Meditación'],
  cardExcerpt:'El verbo hebreo para meditar, hagah, significa murmurar en voz baja, repetir como quien saborea. El árbol del Salmo 1 no produce fruto por esfuerzo, sino porque fue trasplantado junto a la corriente correcta. Todo depende de dónde están tus raíces.',
  bodyHtml:`
    <p>El Salmo 1 es la puerta de entrada a todo el libro de los Salmos. Y no es casualidad que empiece con una sola imagen: dos clases de vida, dos destinos, simbolizados por <strong>un árbol y una brizna de paja.</strong> Todo el salmo se reduce a la diferencia entre tener raíces y no tenerlas.</p>

    <h2 class="section-title">Dónde NO está plantado el dichoso</h2>
    <p>El salmo empieza por la negativa: el hombre bienaventurado <em>"no anduvo en consejo de malos, ni estuvo en camino de pecadores, ni en silla de escarnecedores se ha sentado."</em> Hay una progresión inquietante: <strong>andar, estar, sentarse.</strong> Primero caminas junto a algo, luego te detienes en ello, finalmente te instalas. El pecado rara vez nos captura de golpe; nos acomoda poco a poco hasta que nos sentamos donde nunca planeamos quedarnos.</p>
    <p>El dichoso, en cambio, no se deja arrastrar por esa corriente. Pero el salmo no lo define solo por lo que evita — sino por lo que ama.</p>

    <div class="verse-block">
      <p>Sino que en la ley de Jehová está su delicia, y en su ley medita de día y de noche. Y será como el árbol plantado junto á arroyos de aguas, que da su fruto en su tiempo, y su hoja no cae; y todo lo que hace, prosperará.</p>
      <cite>— Salmos 1:2-3, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Meditar" — hagah, el murmullo que alimenta</h2>
    <p>El verbo hebreo para meditar es <em>hagah</em>. No significa vaciar la mente, como en otras tradiciones. Significa casi lo opuesto: <strong>murmurar en voz baja, repetir, masticar las palabras.</strong> Es el mismo verbo que se usa para el gruñido del león sobre su presa y para el arrullo de la paloma. Meditar la Palabra es darle vueltas, decirla, saborearla, volver a ella una y otra vez hasta que su jugo te alimenta.</p>
    <p>Y lo hace <em>"de día y de noche"</em> — no como tarea de un momento, sino como una corriente continua de fondo. No es leer mucho de golpe, sino habitar pocas palabras profundamente.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El árbol no se planta a sí mismo. El verbo hebreo <em>shatal</em> significa "trasplantado" — alguien lo movió deliberadamente junto a la corriente. <strong>Tu fruto no depende de cuánto te esfuerzas en producir, sino de dónde están plantadas tus raíces. Acércate a la Fuente, y el fruto vendrá a su tiempo.</strong></p>
    </div>

    <h2 class="section-title">Fruto "en su tiempo" y hojas que no caen</h2>
    <p>Nótalo: el árbol da fruto <em>"en su tiempo"</em>, no todo el tiempo. Hay estaciones. La vida arraigada en Dios no significa productividad constante sin descanso, sino fruto en el momento correcto, confiando en los ritmos que Dios diseñó. Y mientras tanto, <em>"su hoja no cae"</em> — hay una vitalidad que permanece aun fuera de la temporada de fruto.</p>
    <p>El contraste final es demoledor: los malos <em>"son como el tamo que arrebata el viento."</em> Paja sin raíz, sin peso, sin fruto, a merced de cualquier ráfaga. Dos vidas: una anclada junto al agua, otra volando sin rumbo. La diferencia está en lo que cada una hizo su deleite.</p>`,
  prayer:'Señor, no quiero ser paja que el viento arrastra, sino árbol plantado junto a tu corriente. Líbrame de la progresión sutil que primero anda, luego se detiene y al final se sienta donde no debe. Enséñame a meditar tu Palabra como quien saborea, de día y de noche, hasta que mis raíces se hundan en Ti y el fruto venga a su tiempo. Amén.',
  faqs:[
    {q:'¿Qué significa meditar en la ley de Dios "día y noche"?', a:'El verbo hebreo hagah significa murmurar en voz baja, repetir y masticar las palabras —no vaciar la mente. Meditar la Palabra es darle vueltas, saborearla y volver a ella continuamente, como una corriente de fondo a lo largo del día, no como una tarea de un solo momento.'},
    {q:'¿Por qué el Salmo 1 compara al justo con un árbol plantado?', a:'El verbo hebreo shatal significa "trasplantado": el árbol no se planta solo, alguien lo coloca junto a la corriente. La imagen enseña que el fruto y la estabilidad del creyente no nacen del esfuerzo propio, sino de dónde están arraigadas sus raíces: en Dios y su Palabra.'},
    {q:'¿Qué significa que el árbol "da su fruto en su tiempo"?', a:'Indica que la vida arraigada en Dios produce fruto en la estación correcta, no de forma constante y sin descanso. Hay ritmos y temporadas. Mientras tanto, "su hoja no cae": permanece una vitalidad estable incluso fuera del tiempo de cosecha.'},
    {q:'¿Cuál es el contraste central del Salmo 1?', a:'Contrasta dos vidas: el justo, como árbol plantado junto a las aguas, con raíces y fruto; y el malo, como "tamo que arrebata el viento", paja sin raíz a merced de cualquier ráfaga. La diferencia decisiva está en aquello que cada uno hace su deleite.'}
  ],
  prev:{slug:'galatas-2-20', title:'Gálatas 2:20: Morir para Empezar a Vivir de Verdad'},
  next:{slug:'juan-11-25', title:'Juan 11:25: Jesús No Dijo que Tenía la Respuesta. Dijo que Él era la Respuesta'}
},

// ── 51 · Juan 11:25 ──────────────────────────────────────────────────────────
{
  slug:'juan-11-25', ref:'Juan 11:25-26', libro:'Juan', cap:'11',
  date:'2026-07-18', dateLabel:'18 de julio, 2026',
  verseShort:'Yo soy la resurrección y la vida: el que cree en mí, aunque esté muerto, vivirá.',
  cardVerse:'Yo soy la resurrección y la vida: el que cree en mí, aunque esté muerto, vivirá.',
  title:'Juan 11:25: Yo Soy la Resurrección y la Vida — Significado',
  metaDesc:'Devocional sobre Juan 11:25. Qué quiso decir Jesús con "Yo soy la resurrección y la vida" ante la tumba de Lázaro, y por qué corrigió el tiempo verbal de Marta.',
  h1:'Juan 11:25: Jesús No Dijo que Tenía la Respuesta. Dijo que Él era la Respuesta',
  tags:['Juan','Resurrección','Esperanza'], category:'Nuevo Testamento', cardTags:['Juan','Resurrección'],
  cardExcerpt:'Marta esperaba consuelo sobre el futuro: "resucitará en el día postrero." Jesús corrigió el tiempo verbal: no una doctrina lejana, sino una Persona presente. "Yo SOY la resurrección" — y días después lo probó saliendo de su propia tumba.',
  bodyHtml:`
    <p>Lázaro llevaba cuatro días muerto. Sus hermanas, Marta y María, habían enviado a buscar a Jesús cuando aún estaba enfermo, y Jesús —deliberadamente— se demoró. Cuando por fin llegó, Lázaro ya estaba en el sepulcro, y Marta salió a su encuentro con una frase cargada de dolor y de fe a medias: <em>"Señor, si hubieses estado aquí, mi hermano no fuera muerto."</em></p>
    <p>Lo que Jesús respondió cambió para siempre cómo entendemos la muerte.</p>

    <h2 class="section-title">El consuelo que Marta esperaba — y el que recibió</h2>
    <p>Jesús le dice: <em>"Tu hermano resucitará."</em> Y Marta, como buena creyente, da la respuesta teológica correcta: <em>"Yo sé que resucitará en la resurrección, en el día postrero."</em> Ella creía en la resurrección — como una <strong>doctrina futura</strong>, un evento lejano al final de los tiempos. Un consuelo verdadero, pero distante.</p>
    <p>Entonces Jesús hace algo asombroso: toma esa esperanza futura y la transforma en una Persona presente. No dice "yo traeré la resurrección" ni "yo enseño sobre ella". Dice: <strong>"YO SOY la resurrección y la vida."</strong></p>

    <div class="verse-block">
      <p>Dícele Jesús: Yo soy la resurrección y la vida: el que cree en mí, aunque esté muerto, vivirá. Y todo aquel que vive y cree en mí, no morirá eternamente. ¿Crees esto?</p>
      <cite>— Juan 11:25-26, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Yo soy" — egō eimi</h2>
    <p>La expresión griega <em>egō eimi</em> ("Yo soy") es la misma con que Dios se reveló a Moisés en la zarza: "YO SOY EL QUE SOY". Juan la repite en boca de Jesús a lo largo de su Evangelio —yo soy el pan, la luz, el camino, la puerta, el buen pastor— y aquí, ante una tumba, declara ser la resurrección misma. <strong>La vida eterna no es una cosa que Jesús reparte; es Él mismo.</strong> Tenerlo a Él es tener la vida.</p>
    <p>Por eso el creyente "aunque esté muerto, vivirá". La muerte física deja de ser el final; pasa a ser un tránsito. Para quien está unido a la Vida en persona, morir no es apagarse, sino cambiar de habitación.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Jesús termina con una pregunta directa, la misma que te hace a ti: <em>"¿Crees esto?"</em> No "¿entiendes esto?" ni "¿te gusta esto?". <strong>¿Lo crees?</strong> La resurrección no pide que comprendas el misterio, sino que confíes en la Persona que lo encarna.</p>
    </div>

    <h2 class="section-title">No fueron solo palabras</h2>
    <p>Lo extraordinario es que Jesús no dijo esto desde la teoría. Minutos después llamó a Lázaro por su nombre y un muerto de cuatro días salió caminando del sepulcro, todavía con las vendas. Y poco tiempo después, Jesús mismo entró en una tumba — y <strong>al tercer día salió de ella por su propio poder</strong>, demostrando que cuando dijo "Yo soy la resurrección" no exageraba.</p>
    <p>Cualquiera puede prometer vida más allá de la muerte. Solo Uno lo respaldó saliendo vivo de su propia tumba. Por eso su pregunta —"¿crees esto?"— no es ingenua: tiene la evidencia de la mañana de Pascua detrás.</p>`,
  prayer:'Señor Jesús, ante mis tumbas —los duelos, las pérdidas, los sueños muertos— Tú no me ofreces solo una doctrina sobre el futuro, sino tu presencia hoy. Tú eres la resurrección y la vida. Creo que saliste vivo de tu propia tumba y que en Ti la muerte ya no tiene la última palabra. A tu pregunta "¿crees esto?" respondo: sí, Señor, creo. Amén.',
  faqs:[
    {q:'¿Qué significa "Yo soy la resurrección y la vida"?', a:'Jesús declara que la vida eterna no es una cosa que reparte ni una doctrina futura, sino que reside en Él mismo. Tener a Cristo es tener la vida. Por eso el creyente, aunque muera físicamente, vivirá: la muerte se convierte en un tránsito, no en el final.'},
    {q:'¿Por qué Jesús corrigió a Marta en Juan 11?', a:'Marta creía en la resurrección como un evento lejano "en el día postrero". Jesús transformó esa esperanza futura en una realidad presente al decir "Yo soy la resurrección", trasladando la fe de una doctrina abstracta a una Persona viva y cercana.'},
    {q:'¿Qué significa la expresión "Yo soy" (egō eimi) en este pasaje?', a:'Es la misma fórmula con que Dios se reveló a Moisés ("YO SOY EL QUE SOY"). Al usarla, Jesús se identifica con el Dios eterno y, ante la tumba de Lázaro, afirma ser la resurrección en persona. La vida eterna no es algo separado de Él, sino Él mismo.'},
    {q:'¿Cómo respaldó Jesús esta afirmación?', a:'Inmediatamente resucitó a Lázaro, muerto desde hacía cuatro días. Y poco después Él mismo entró en una tumba y al tercer día salió vivo por su propio poder. Su resurrección es la evidencia que sostiene la promesa de vida que ofrece a quienes creen.'}
  ],
  prev:{slug:'salmos-1', title:'Salmos 1: La Diferencia Entre un Árbol Plantado y una Hoja al Viento'},
  next:{slug:'juan-8-32', title:'Juan 8:32: La Libertad No Empieza Donde Crees'}
},

// ── 52 · Juan 8:32 ───────────────────────────────────────────────────────────
{
  slug:'juan-8-32', ref:'Juan 8:32', libro:'Juan', cap:'8',
  date:'2026-07-19', dateLabel:'19 de julio, 2026',
  verseShort:'Y conoceréis la verdad, y la verdad os hará libres.',
  cardVerse:'Y conoceréis la verdad, y la verdad os hará libres.',
  title:'Juan 8:32: La Verdad os Hará Libres — Qué Verdad y Qué Libertad',
  metaDesc:'Devocional sobre Juan 8:32. La frase más citada fuera de contexto: qué verdad libera realmente, la condición del versículo anterior, y de qué nos hace libres.',
  h1:'Juan 8:32: La Libertad No Empieza Donde Crees',
  tags:['Juan','Verdad','Libertad'], category:'Nuevo Testamento', cardTags:['Juan','Libertad'],
  cardExcerpt:'La frase más citada en universidades y bibliotecas casi nunca se cita completa. Jesús puso una condición en el versículo anterior: "si permaneciereis en mi palabra." La verdad que libera no es información — es permanencia en Alguien.',
  bodyHtml:`
    <p>"La verdad os hará libres" está grabada en frontispicios de universidades, sedes de agencias de inteligencia y bibliotecas de todo el mundo. Se ha vuelto un lema secular sobre el poder del conocimiento y la información. Pero quien la cita así casi nunca lee el versículo anterior — donde Jesús pone una condición que lo cambia todo.</p>

    <h2 class="section-title">La frase no empieza donde creemos</h2>
    <p>El versículo 32 empieza con una "Y", porque es la segunda mitad de una oración. La primera mitad, el versículo 31, dice: <strong>"Si vosotros permaneciereis en mi palabra, seréis verdaderamente mis discípulos; y conoceréis la verdad, y la verdad os hará libres."</strong></p>
    <p>De pronto el sentido es completamente distinto. La verdad que libera no es información en abstracto, ni datos, ni educación general. Es <em>permanecer en la palabra de Jesús</em>. El verbo griego <em>menō</em> significa quedarse, habitar, morar — no visitar de paso, sino instalarse. La libertad no viene de conocer muchas verdades, sino de <strong>habitar en la Verdad.</strong></p>

    <div class="verse-block">
      <p>Y decía Jesús á los Judíos que le habían creído: Si vosotros permaneciereis en mi palabra, seréis verdaderamente mis discípulos; y conoceréis la verdad, y la verdad os hará libres.</p>
      <cite>— Juan 8:31-32, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">La verdad es una Persona, no solo un concepto</h2>
    <p>Pocos capítulos después, el mismo Jesús dirá: <em>"Yo soy el camino, y la verdad, y la vida."</em> La verdad que libera, en el Evangelio de Juan, no es finalmente un sistema de ideas correctas — es una Persona. Conocer la verdad es conocer a Cristo. Por eso no basta con estar de acuerdo intelectualmente; hay que <em>permanecer</em> en Él, vivir en relación con Él.</p>
    <p>Esto explica por qué hay gente que sabe mucho de la Biblia y sigue esclava, y gente sencilla que apenas sabe leer pero camina en libertad. La diferencia no es la cantidad de información, sino la permanencia en la Persona.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Cuando Jesús dijo esto, sus oyentes se ofendieron: <em>"nunca hemos servido á nadie, ¿cómo dices: seréis libres?"</em> No reconocían su esclavitud. Y Jesús aclaró: <strong>"todo aquel que hace pecado, es siervo del pecado."</strong> La esclavitud más profunda no es política ni económica — es la del corazón cautivo. Y de esa, solo el Hijo libera.</p>
    </div>

    <h2 class="section-title">¿Libres de qué?</h2>
    <p>La libertad que Jesús ofrece no es hacer lo que se nos antoje —eso, irónicamente, suele ser la peor esclavitud—. Es libertad <em>del</em> pecado: del poder que nos domina, de la culpa que nos acusa, del vacío que intentamos llenar con todo menos con Dios. El versículo 36 lo sella: <strong>"si el Hijo os libertare, seréis verdaderamente libres."</strong></p>
    <p>Verdaderamente libres. No una libertad cosmética, sino real, de raíz. La clase de libertad que no depende de las circunstancias externas porque nace de un corazón que ha sido soltado por dentro.</p>`,
  prayer:'Señor Jesús, Tú eres la Verdad, y solo permaneciendo en Ti soy libre de verdad. Perdóname cuando busco libertad en hacer lo que quiero, sin ver que eso me esclaviza más. Líbrame del pecado que me domina, de la culpa que me acusa, del vacío que intento llenar sin Ti. Quiero habitar en tu palabra, no solo visitarla. Hazme verdaderamente libre. Amén.',
  faqs:[
    {q:'¿Cuál es la condición de "la verdad os hará libres" en Juan 8:32?', a:'El versículo 31, que casi siempre se omite, pone la condición: "Si vosotros permaneciereis en mi palabra". La libertad no viene de la información en abstracto, sino de permanecer (griego menō: habitar, morar) en la palabra de Jesús como discípulos genuinos.'},
    {q:'¿Qué "verdad" libera según Jesús?', a:'En el Evangelio de Juan, la verdad que libera no es un sistema de ideas, sino una Persona: Jesús dice "Yo soy el camino, la verdad y la vida" (Juan 14:6). Conocer la verdad es conocer y permanecer en Cristo, no solo acumular conocimiento religioso.'},
    {q:'¿De qué nos hace libres la verdad?', a:'Jesús lo explica en el mismo pasaje: "todo aquel que hace pecado, es siervo del pecado". La libertad que ofrece es del poder del pecado, de la culpa y del vacío, no la libertad de hacer lo que se quiera. El versículo 36 lo sella: "si el Hijo os libertare, seréis verdaderamente libres".'},
    {q:'¿Por qué hay personas que saben mucho de la Biblia y no son libres?', a:'Porque la libertad no depende de la cantidad de información sino de la permanencia en la Persona de Cristo. Se puede tener conocimiento bíblico y seguir esclavo del pecado; la liberación viene de morar en Jesús y vivir en relación con Él, no solo de estar de acuerdo intelectualmente.'}
  ],
  prev:{slug:'juan-11-25', title:'Juan 11:25: Jesús No Dijo que Tenía la Respuesta. Dijo que Él era la Respuesta'},
  next:{slug:'filipenses-2-5', title:'Filipenses 2: El Dios que Eligió el Camino Hacia Abajo'}
},

// ── 53 · Filipenses 2:5-11 ───────────────────────────────────────────────────
{
  slug:'filipenses-2-5', ref:'Filipenses 2:5-8', libro:'Filipenses', cap:'2',
  date:'2026-07-20', dateLabel:'20 de julio, 2026',
  verseShort:'Haya en vosotros este sentir que hubo también en Cristo Jesús.',
  cardVerse:'Haya en vosotros este sentir que hubo también en Cristo Jesús.',
  title:'Filipenses 2:5-11: El Sentir de Cristo y el Camino Hacia Abajo',
  metaDesc:'Devocional sobre Filipenses 2:5-11. El himno de la humildad de Cristo: qué significa kenoō (se anonadó), el camino hacia abajo, y por qué Dios lo exaltó hasta lo sumo.',
  h1:'Filipenses 2: El Dios que Eligió el Camino Hacia Abajo',
  tags:['Filipenses','Humildad','Cristo'], category:'Nuevo Testamento', cardTags:['Filipenses','Humildad'],
  cardExcerpt:'El verbo kenoō — "se anonadó a sí mismo" — significa vaciarse. Cristo descendió de la forma de Dios al madero. Pero el himno no acaba abajo: "por lo cual Dios también le ensalzó". El camino hacia abajo terminó en resurrección y exaltación.',
  bodyHtml:`
    <p>El mundo nos enseña una sola dirección hacia la grandeza: hacia arriba. Subir, escalar, ascender, acumular, destacar. Por eso Filipenses 2 resulta tan subversivo: presenta a Dios mismo eligiendo, voluntariamente, el camino contrario. <strong>El camino hacia abajo.</strong></p>
    <p>Y lo presenta no como teología abstracta, sino como el modelo concreto de cómo debemos tratarnos unos a otros.</p>

    <h2 class="section-title">El motivo: "este sentir"</h2>
    <p>Pablo introduce el pasaje con un propósito práctico: <em>"Haya en vosotros este sentir que hubo también en Cristo Jesús."</em> La palabra griega es <em>phroneō</em> — una manera de pensar, una actitud, una mentalidad. Antes de este himno, Pablo había rogado a los filipenses que no hicieran nada por contienda ni vanagloria, sino estimando a los demás como superiores. Y luego ofrece el ejemplo supremo: la mente de Cristo.</p>

    <div class="verse-block">
      <p>El cual, siendo en forma de Dios, no tuvo por usurpación ser igual á Dios: sino que se anonadó á sí mismo, tomando forma de siervo, hecho semejante á los hombres... se humilló á sí mismo, hecho obediente hasta la muerte, y muerte de cruz.</p>
      <cite>— Filipenses 2:6-8, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Se anonadó" — el vaciamiento de Dios</h2>
    <p>El verbo central es <em>kenoō</em>: vaciarse, despojarse, hacerse nada. De ahí viene la palabra teológica <em>kénosis</em>. Cristo, siendo en forma (<em>morphē</em>, la naturaleza esencial) de Dios, no se aferró a sus privilegios divinos como un botín que retener, sino que se vació. ¿De qué? No de su divinidad —siguió siendo Dios— sino de su gloria, de su derecho a ser servido, de la comodidad de su posición.</p>
    <p>Mira la escalera descendente: de la forma de Dios → a forma de siervo → a semejanza de hombre → a la obediencia → hasta la muerte → y no cualquier muerte, sino <strong>"muerte de cruz"</strong>, la más vergonzosa y dolorosa que existía. Siete peldaños hacia abajo. El Dios del universo descendiendo, escalón por escalón, por amor.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>La humildad de Cristo no fue fingir que valía poco. Él sabía exactamente quién era —igual a Dios— y precisamente por eso pudo descender sin miedo a perder su identidad. <strong>La verdadera humildad no nace de pensar poco de ti, sino de estar tan seguro de quién eres en Dios que puedes servir sin sentir que te disminuyes.</strong></p>
    </div>

    <h2 class="section-title">El himno no termina abajo</h2>
    <p>Si el pasaje acabara en el versículo 8, sería una tragedia. Pero el versículo 9 empieza con dos palabras que lo cambian todo: <strong>"Por lo cual..."</strong> <em>"Por lo cual Dios también le ensalzó á lo sumo, y dióle un nombre que es sobre todo nombre; para que en el nombre de Jesús se doble toda rodilla."</em></p>
    <p>El camino hacia abajo no terminó en la tumba. Cristo murió, sí — pero Dios lo <strong>resucitó y lo exaltó hasta lo sumo</strong>. El que descendió siete peldaños fue levantado por encima de todo. Y ahí está la lógica del Reino: <em>el camino hacia arriba pasa por abajo.</em> El que se humilla será exaltado, no por sus propias fuerzas, sino por la mano de un Dios que honra la humildad. La cruz no fue el final de la historia; fue el camino a la corona.</p>`,
  prayer:'Señor Jesús, Tú que eras igual a Dios elegiste vaciarte, descender y servir hasta la cruz por amor a mí. Dame tu mente, tu sentir: la humildad que no nace de pensar poco de mí, sino de estar seguro en Ti. Y gracias porque el camino hacia abajo no terminó en la tumba: resucitaste y fuiste exaltado. Enséñame que en tu Reino, lo que se humilla, Tú lo levantas. Amén.',
  faqs:[
    {q:'¿Qué significa que Cristo "se anonadó a sí mismo" en Filipenses 2:7?', a:'El verbo griego kenoō significa vaciarse o despojarse, de donde viene el término kénosis. Cristo no dejó de ser Dios, sino que renunció voluntariamente a su gloria, a sus privilegios y a su derecho a ser servido, tomando forma de siervo y haciéndose hombre.'},
    {q:'¿Cuál es "el sentir de Cristo" que Pablo pide imitar?', a:'La palabra griega phroneō describe una mentalidad o actitud. Pablo pide la actitud de humildad y servicio que Cristo mostró: no hacer nada por vanagloria, sino estimar a los demás como superiores y descender para servir, en lugar de aferrarse a los propios derechos.'},
    {q:'¿Filipenses 2 habla de la resurrección de Cristo?', a:'Sí. El himno no termina en la muerte (v.8). El versículo 9 comienza con "Por lo cual Dios también le ensalzó a lo sumo": tras humillarse hasta la cruz, Cristo fue resucitado y exaltado por encima de todo nombre. El descenso terminó en victoria y exaltación.'},
    {q:'¿Qué enseña Filipenses 2 sobre la humildad?', a:'Que la verdadera humildad no consiste en menospreciarse, sino en estar tan seguro de la propia identidad en Dios que se puede servir sin temor a perderla. Y enseña la lógica del Reino: el camino a la exaltación pasa por la humildad, porque Dios levanta al que se abaja.'}
  ],
  prev:{slug:'juan-8-32', title:'Juan 8:32: La Libertad No Empieza Donde Crees'},
  next:{slug:'salmos-51-10', title:'Salmos 51:10: La Palabra que David Eligió Cuando Pedía Perdón'}
},

// ── 54 · Salmos 51:10 ────────────────────────────────────────────────────────
{
  slug:'salmos-51-10', ref:'Salmos 51:10', libro:'Salmos', cap:'51',
  date:'2026-07-21', dateLabel:'21 de julio, 2026',
  verseShort:'Crea en mí, oh Dios, un corazón limpio; y renueva un espíritu recto dentro de mí.',
  cardVerse:'Crea en mí, oh Dios, un corazón limpio; y renueva un espíritu recto dentro de mí.',
  title:'Salmos 51:10: Crea en Mí un Corazón Limpio — La Oración de David',
  metaDesc:'Devocional sobre Salmos 51:10. La oración de David tras su pecado: por qué pidió a Dios "crear" (bara) un corazón limpio y no solo repararlo, y qué significa para tu arrepentimiento.',
  h1:'Salmos 51:10: La Palabra que David Eligió Cuando Pedía Perdón',
  tags:['Salmos','Arrepentimiento','Restauración'], category:'Salmos', cardTags:['Salmos','Perdón'],
  cardExcerpt:'David no pidió que Dios reparara su corazón, sino que creara uno nuevo. El verbo es bara — el mismo de Génesis 1:1, el que solo Dios puede hacer. Sabía que su pecado no necesitaba mantenimiento; necesitaba creación desde cero.',
  bodyHtml:`
    <p>El Salmo 51 es la oración de un hombre que tocó fondo. David, el rey conforme al corazón de Dios, había cometido adulterio con Betsabé y había orquestado la muerte de su esposo para encubrirlo. Cuando el profeta Natán lo confrontó, David no se justificó. Se quebró. Y de ese quebranto nació uno de los salmos de arrepentimiento más profundos de la Biblia.</p>
    <p>En su centro hay una petición con una palabra cuidadosamente elegida.</p>

    <h2 class="section-title">"Crea" — bara, el verbo exclusivo de Dios</h2>
    <p>David ora: <em>"Crea en mí, oh Dios, un corazón limpio."</em> El verbo hebreo que usa es <strong><em>bara</em></strong> — el mismísimo verbo de Génesis 1:1: <em>"En el principio creó (bara) Dios los cielos y la tierra."</em> Como vimos en aquel devocional, bara nunca tiene como sujeto a un ser humano: solo Dios bara, solo Dios crea de la nada.</p>
    <p>Esto es teología en una sola palabra. David no pidió "límpiame el corazón" ni "arréglame", como quien manda reparar algo viejo. Pidió que Dios <strong>creara uno nuevo desde cero.</strong> Había entendido algo devastador y liberador a la vez: su corazón no necesitaba mantenimiento ni una buena limpieza. Estaba tan corrompido que necesitaba un acto de creación — y eso solo Dios puede hacerlo.</p>

    <div class="verse-block">
      <p>Crea en mí, oh Dios, un corazón limpio; y renueva un espíritu recto dentro de mí. No me eches de delante de ti; y no quites de mí tu santo espíritu.</p>
      <cite>— Salmos 51:10-11, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">La diferencia entre reformar y recrear</h2>
    <p>Aquí está la sabiduría del verdadero arrepentimiento. Muchos, al pecar, prometen "portarse mejor", apretar los dientes, intentar más fuerte. Eso es reforma — maquillar el exterior. David fue más hondo: pidió recreación. Sabía que el problema no era de conducta sino de corazón, y que un corazón nuevo no se fabrica con esfuerzo humano, se recibe como creación divina.</p>
    <p>Es exactamente lo que Dios prometería siglos después por boca de Ezequiel: <em>"os daré corazón nuevo, y pondré espíritu nuevo dentro de vosotros; y quitaré de vuestra carne el corazón de piedra, y os daré corazón de carne."</em> David, sin saberlo, oraba ya por el evangelio.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Lo que David más temía no era el castigo, sino la separación: <em>"no me eches de delante de ti."</em> El verdadero arrepentimiento no llora por las consecuencias perdidas, sino por la comunión rota. <strong>La señal de un corazón que Dios está recreando es que extraña más la presencia de Dios que la comodidad que perdió.</strong></p>
    </div>

    <h2 class="section-title">Gracia para el que cae hondo</h2>
    <p>Que este salmo exista es, en sí mismo, una predicación de gracia. David hizo cosas terribles. Y aun así se atrevió a pedir un corazón nuevo, porque conocía el carácter de Dios: <em>"conforme á tu misericordia... conforme á la multitud de tus piedades."</em> No apeló a su trayectoria —que estaba arruinada— sino a la compasión de Dios.</p>
    <p>Si alguna vez has sentido que caíste demasiado hondo para ser restaurado, el Salmo 51 es para ti. El mismo Dios que creó el universo de la nada puede crear un corazón limpio de las ruinas del tuyo. No tienes que arreglarte antes de venir. Solo tienes que pedir lo que solo Él puede hacer.</p>`,
  prayer:'Oh Dios, no te pido que remiendes mi corazón, porque sé que necesita más que un arreglo. Crea en mí —con el mismo poder con que hiciste el mundo— un corazón limpio. Renueva un espíritu recto dentro de mí. No me eches de tu presencia; eso es lo que más temo. Conforme a tu misericordia, no a mis méritos, hazme nuevo. Amén.',
  faqs:[
    {q:'¿Por qué David usó el verbo "crear" en Salmos 51:10?', a:'El verbo hebreo bara es el mismo de Génesis 1:1 y nunca tiene como sujeto a un humano: solo Dios crea de la nada. David no pidió que reparasen o limpiasen su corazón, sino que Dios creara uno nuevo desde cero, reconociendo que su problema requería un acto creador divino, no esfuerzo humano.'},
    {q:'¿Cuál es el contexto del Salmo 51?', a:'Es la oración de arrepentimiento de David tras cometer adulterio con Betsabé y provocar la muerte de Urías, cuando el profeta Natán lo confrontó. En lugar de justificarse, David se quebrantó y clamó a Dios por perdón y restauración.'},
    {q:'¿Qué diferencia hay entre reformarse y ser recreado?', a:'Reformarse es esforzarse por mejorar la conducta exterior; recrearse es recibir un corazón nuevo que solo Dios puede dar. David entendió que su problema era del corazón, no solo del comportamiento, y que la solución era creación divina, no fuerza de voluntad.'},
    {q:'¿Qué temía más David en su arrepentimiento?', a:'No temía principalmente el castigo, sino la separación de Dios: "no me eches de delante de ti". El verdadero arrepentimiento llora más por la comunión rota con Dios que por las consecuencias perdidas, y anhela su presencia por encima de la comodidad.'}
  ],
  prev:{slug:'filipenses-2-5', title:'Filipenses 2: El Dios que Eligió el Camino Hacia Abajo'},
  next:{slug:'hebreos-4-12', title:'Hebreos 4:12: No Lees la Biblia — la Biblia te Lee a Ti'}
},

// ── 55 · Hebreos 4:12 ────────────────────────────────────────────────────────
{
  slug:'hebreos-4-12', ref:'Hebreos 4:12', libro:'Hebreos', cap:'4',
  date:'2026-07-22', dateLabel:'22 de julio, 2026',
  verseShort:'La palabra de Dios es viva y eficaz, y más penetrante que toda espada de dos filos.',
  cardVerse:'La palabra de Dios es viva y eficaz, y más penetrante que toda espada de dos filos.',
  title:'Hebreos 4:12: La Palabra de Dios es Viva y Eficaz — Significado',
  metaDesc:'Devocional sobre Hebreos 4:12. Por qué la Palabra de Dios es viva (zōn) y eficaz (energēs), cómo discierne el corazón, y qué significa que no la lees tú a ella, sino ella a ti.',
  h1:'Hebreos 4:12: No Lees la Biblia — la Biblia te Lee a Ti',
  tags:['Hebreos','Palabra','Transformación'], category:'Nuevo Testamento', cardTags:['Hebreos','Palabra'],
  cardExcerpt:'El griego dice que la Palabra es zōn — viviente — y energēs, de donde viene "energía": activa, operante. No es un texto antiguo que analizas, sino un bisturí que discierne las intenciones de tu corazón mientras lo abres.',
  bodyHtml:`
    <p>Solemos pensar en la lectura de la Biblia como una actividad en la que nosotros somos el sujeto activo: nosotros la abrimos, la estudiamos, la interpretamos, la analizamos. Hebreos 4:12 voltea por completo esa relación. Sugiere que cuando te acercas de verdad a la Palabra, <strong>el que termina siendo examinado eres tú.</strong></p>

    <h2 class="section-title">"Viva y eficaz" — zōn y energēs</h2>
    <p>El versículo empieza con dos adjetivos cargados. La Palabra es <em>zōn</em> — <strong>viviente.</strong> No es un documento muerto del pasado, una reliquia de literatura antigua. Está viva, late, respira, actúa hoy con la misma fuerza que el día en que fue inspirada.</p>
    <p>Y es <em>energēs</em> — de donde viene nuestra palabra "energía": <strong>activa, operante, que produce efecto.</strong> La Palabra de Dios no es información pasiva que se queda quieta esperando a ser archivada. Hace cosas. Trabaja. Opera en quien la recibe. Como una semilla que, una vez sembrada, crece sin que veas el proceso.</p>

    <div class="verse-block">
      <p>Porque la palabra de Dios es viva y eficaz, y más penetrante que toda espada de dos filos: y que alcanza hasta partir el alma, y aun el espíritu, y las coyunturas y tuétanos, y discierne los pensamientos y las intenciones del corazón.</p>
      <cite>— Hebreos 4:12, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">El bisturí que llega donde nadie llega</h2>
    <p>La imagen es la de una espada de doble filo, pero el contexto la convierte en algo más fino: un bisturí de cirujano. La Palabra <em>"alcanza hasta partir el alma y el espíritu, las coyunturas y los tuétanos"</em> — el tuétano es la médula, lo más escondido dentro del hueso. Es decir, la Palabra penetra hasta lo más profundo de ti, hasta donde tú mismo no llegas, hasta los motivos que ni tú reconoces.</p>
    <p>Y entonces <em>"discierne los pensamientos y las intenciones del corazón."</em> El verbo griego <em>kritikos</em> (de donde viene "crítico") significa juzgar, evaluar, separar lo verdadero de lo falso. La Palabra distingue entre lo que decimos que sentimos y lo que de verdad sentimos; entre la razón que damos y el motivo real. Por eso a veces leemos un versículo conocido y, de repente, nos incomoda: no porque haya cambiado el texto, sino porque nos está leyendo a nosotros.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El versículo siguiente (4:13) aclara de quién es esta Palabra: <em>"todas las cosas están desnudas y abiertas á los ojos de aquel á quien tenemos que dar cuenta."</em> La Palabra disciérne porque su Autor lo ve todo. <strong>No hay rincón del corazón que le sea ajeno — y eso, lejos de aterrar, libera: ya no hay que fingir ante Quien ya lo sabe todo y aun así te ama.</strong></p>
    </div>

    <h2 class="section-title">Una cirugía que sana</h2>
    <p>El bisturí no corta para herir, sino para sanar. Cuando la Palabra expone algo en ti —un motivo impuro, un orgullo escondido, un miedo que disfrazas de prudencia— no lo hace para humillarte, sino para liberarte de ello. La luz que incomoda es la misma que cura.</p>
    <p>Por eso acercarse a la Biblia con el corazón abierto es un acto de valentía y de fe: es permitir que el único cirujano perfecto opere donde más lo necesitas. No la leas solo para informarte. Léela para ser leído — y transformado.</p>`,
  prayer:'Señor, tantas veces me acerco a tu Palabra como quien analiza un texto, sin dejar que ella me analice a mí. Hoy abro mi corazón a tu bisturí. Penetra hasta donde yo no llego, discierne los motivos que ni yo reconozco, expón lo que necesito soltar. No para herirme, sino para sanarme. Que tu Palabra viva haga su obra viva en mí. Amén.',
  faqs:[
    {q:'¿Qué significa que la Palabra de Dios es "viva y eficaz"?', a:'El griego usa zōn (viviente) y energēs (activo, operante, de donde viene "energía"). Significa que la Biblia no es un documento muerto del pasado, sino que está viva y produce efecto hoy: actúa, trabaja y transforma a quien la recibe, como una semilla que crece tras ser sembrada.'},
    {q:'¿Qué quiere decir que la Palabra "discierne los pensamientos y las intenciones"?', a:'El verbo griego kritikos significa juzgar y separar lo verdadero de lo falso. La Palabra distingue entre lo que creemos sentir y lo que realmente sentimos, entre la razón aparente y el motivo real del corazón, exponiendo lo que está escondido incluso para nosotros mismos.'},
    {q:'¿Por qué se dice que "la Biblia te lee a ti"?', a:'Porque al acercarnos a ella con sinceridad, deja de ser solo un objeto que analizamos y pasa a examinarnos. Penetra hasta lo más profundo —"hasta los tuétanos"— y revela motivos que no reconocíamos. Un versículo conocido puede incomodarnos no porque cambie, sino porque nos está evaluando.'},
    {q:'¿La función de la Palabra es condenar o sanar?', a:'Aunque expone lo oculto como un bisturí, su fin es sanar, no herir. Cuando la Palabra revela un motivo impuro o un orgullo escondido, lo hace para liberarnos de ello. El versículo siguiente recuerda que su Autor lo ve todo y aun así nos invita a su presencia con confianza.'}
  ],
  prev:{slug:'salmos-51-10', title:'Salmos 51:10: La Palabra que David Eligió Cuando Pedía Perdón'},
  next:{slug:'1-juan-1-9', title:'1 Juan 1:9: Confesar No es Informar a Dios de Algo que No Sabía'}
},

// ── 56 · 1 Juan 1:9 ──────────────────────────────────────────────────────────
{
  slug:'1-juan-1-9', ref:'1 Juan 1:9', libro:'1 Juan', cap:'1',
  date:'2026-07-23', dateLabel:'23 de julio, 2026',
  verseShort:'Si confesamos nuestros pecados, él es fiel y justo para que nos perdone nuestros pecados.',
  cardVerse:'Si confesamos nuestros pecados, él es fiel y justo para que nos perdone nuestros pecados, y nos limpie de toda maldad.',
  title:'1 Juan 1:9: Si Confesamos Nuestros Pecados — La Promesa del Perdón',
  metaDesc:'Devocional sobre 1 Juan 1:9. Qué significa confesar (homologeō), por qué Dios es "fiel y justo" para perdonar, y cómo el perdón descansa en la justicia, no solo en la misericordia.',
  h1:'1 Juan 1:9: Confesar No es Informar a Dios de Algo que No Sabía',
  tags:['1 Juan','Perdón','Confesión'], category:'Nuevo Testamento', cardTags:['1 Juan','Perdón'],
  cardExcerpt:'Confesar, en griego homologeō, significa "decir lo mismo": ponerte de acuerdo con Dios sobre lo que ya ve. Y la promesa no apela a su misericordia sino a su justicia — "fiel y justo" — porque el precio ya fue pagado en la cruz del Resucitado.',
  bodyHtml:`
    <p>Hay una falsa imagen de la confesión que mantiene a muchos creyentes en culpa permanente: la idea de que confesar es ir a informar a Dios de algo que Él no sabía, esperando ablandar su enojo con suficiente arrepentimiento. Pero 1 Juan 1:9 describe algo completamente distinto — y mucho más liberador.</p>

    <h2 class="section-title">"Confesar" — homologeō, decir lo mismo</h2>
    <p>La palabra griega para confesar es <em>homologeō</em>, que literalmente significa <strong>"decir lo mismo"</strong> (homo = igual, logos = palabra). Confesar el pecado no es informar a Dios de algo nuevo —Él ya lo vio todo— ni es flagelarse para ganar el perdón. Es <em>ponerse de acuerdo con Dios</em>: dejar de llamar "error" a lo que Él llama pecado, dejar de justificar lo que Él ya juzgó, decir de mi pecado lo mismo que Dios dice de él.</p>
    <p>Confesar es, en el fondo, un acto de honestidad y rendición: dejo de defender mi versión y me alineo con la verdad de Dios. Por eso es tan sanador — porque la salud del alma empieza cuando dejamos de fingir.</p>

    <div class="verse-block">
      <p>Si confesamos nuestros pecados, él es fiel y justo para que nos perdone nuestros pecados, y nos limpie de toda maldad.</p>
      <cite>— 1 Juan 1:9, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Fiel y justo" — la base sorprendente del perdón</h2>
    <p>Aquí está el detalle que cambia todo. Esperaríamos que Juan dijera que Dios es "amoroso y misericordioso" para perdonar. Pero escribe algo distinto: Dios es <strong>"fiel y justo"</strong> para perdonar. ¿Justo? La justicia normalmente <em>condena</em> al culpable, no lo perdona. ¿Cómo puede la justicia de Dios ser razón para perdonarnos?</p>
    <p>La respuesta está en la cruz. Porque Cristo ya pagó por completo el castigo de nuestro pecado —y resucitó, demostrando que el pago fue aceptado—, ahora sería <em>injusto</em> que Dios nos cobrara dos veces la misma deuda. El perdón ya no depende solo de que Dios sea bondadoso; depende de que sea <strong>justo</strong> con el sacrificio del Resucitado. Dios es <em>fiel</em> porque cumple su promesa, y <em>justo</em> porque honra el precio que su Hijo ya pagó.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Esto transforma la confesión de un acto de ansiedad a un acto de confianza. No vienes a un Juez de humor incierto, rogando que hoy esté de buenas. Vienes a Uno que se ha <strong>comprometido</strong> a perdonar a todo el que confiesa, porque la deuda ya está saldada. <strong>El perdón no es algo que arrancas de un Dios reacio; es algo que Él prometió y la cruz garantizó.</strong></p>
    </div>

    <h2 class="section-title">"Y nos limpie de toda maldad"</h2>
    <p>La promesa tiene dos partes: perdonar y <em>limpiar</em>. El perdón cancela la culpa; la limpieza quita la mancha. Dios no solo borra el registro legal de nuestra deuda, sino que purifica el corazón de la suciedad que el pecado dejó. Y nota la amplitud: <em>"de TODA maldad."</em> No de algunos pecados, no de los confesables solamente — de toda.</p>
    <p>No hay pecado tan grande que esta promesa no alcance, ni tan repetido que la canse. Cada vez que confiesas con honestidad, encuentras a un Dios fiel y justo, listo, no reacio. La culpa que arrastras después de confesar no viene de Dios; Él ya te perdonó y limpió. Créelo tanto como crees su Palabra.</p>`,
  prayer:'Padre, hoy dejo de defender mi versión y digo de mi pecado lo mismo que Tú dices: es pecado, y lo confieso. Gracias porque no vengo a un Juez de humor incierto, sino a Uno fiel y justo, que prometió perdonar porque Cristo ya pagó y resucitó. Perdóname y límpiame de toda maldad. Y ayúdame a soltar la culpa que Tú ya quitaste. Amén.',
  faqs:[
    {q:'¿Qué significa confesar los pecados según 1 Juan 1:9?', a:'El verbo griego homologeō significa "decir lo mismo". Confesar no es informar a Dios de algo que no sabía ni flagelarse para ganar el perdón, sino ponerse de acuerdo con Dios: dejar de justificar el pecado y decir de él lo mismo que Dios dice. Es un acto de honestidad y rendición.'},
    {q:'¿Por qué dice que Dios es "fiel y justo" para perdonar?', a:'Sorprende que no diga "misericordioso", sino "justo", pues la justicia suele condenar. La clave es la cruz: como Cristo ya pagó por completo el castigo del pecado y resucitó, sería injusto que Dios cobrara dos veces la misma deuda. Dios es fiel porque cumple su promesa y justo porque honra el sacrificio de su Hijo.'},
    {q:'¿Significa que debo confesar para que Dios deje de estar enojado?', a:'No. La confesión no arranca el perdón de un Dios reacio. Dios se comprometió a perdonar a todo el que confiesa porque la deuda ya está saldada en la cruz. La confesión es un acto de confianza en una promesa segura, no de ansiedad ante un juez de humor incierto.'},
    {q:'¿De qué nos limpia 1 Juan 1:9?', a:'La promesa tiene dos partes: perdonar (cancelar la culpa) y limpiar (quitar la mancha). Y es de "toda maldad", sin excepción. No hay pecado tan grande ni tan repetido que esta promesa no alcance. La culpa que persiste tras una confesión sincera no viene de Dios, que ya perdonó y limpió.'}
  ],
  prev:{slug:'hebreos-4-12', title:'Hebreos 4:12: No Lees la Biblia — la Biblia te Lee a Ti'},
  next:{slug:'salmos-103-1', title:'Salmos 103: Cuando Tienes que Predicarle a tu Propia Alma'}
},

// ── 57 · Salmos 103 ──────────────────────────────────────────────────────────
{
  slug:'salmos-103-1', ref:'Salmos 103:1-2', libro:'Salmos', cap:'103',
  date:'2026-07-24', dateLabel:'24 de julio, 2026',
  verseShort:'Bendice, alma mía, á Jehová; y no olvides ninguno de sus beneficios.',
  cardVerse:'Bendice, alma mía, á Jehová; y no olvides ninguno de sus beneficios.',
  title:'Salmos 103: Bendice Alma Mía a Jehová — Significado y Devocional',
  metaDesc:'Devocional sobre Salmos 103. Por qué David le habla a su propia alma, qué significa "bendecir" (barak) a Dios, y la importancia de no olvidar sus beneficios.',
  h1:'Salmos 103: Cuando Tienes que Predicarle a tu Propia Alma',
  tags:['Salmos','Gratitud','Adoración'], category:'Salmos', cardTags:['Salmos','Gratitud'],
  cardExcerpt:'David no le habla a Dios aquí — se habla a sí mismo. "Bendice, alma mía." Hay días en que el alma no quiere bendecir, y entonces hay que ordenárselo. El verbo barak viene de "arrodillarse": adorar es doblar el alma aunque las rodillas no quieran.',
  bodyHtml:`
    <p>El Salmo 103 empieza de una manera curiosa. David no se dirige a Dios, ni a una congregación, ni a un enemigo. Se dirige <strong>a sí mismo:</strong> <em>"Bendice, alma mía, á Jehová."</em> Es un hombre dándose una orden, hablándole a su propio interior, predicándose a su propia alma.</p>
    <p>Y en ese pequeño detalle hay una de las lecciones más prácticas sobre la fe en los días difíciles.</p>

    <h2 class="section-title">Hay que predicarse a uno mismo</h2>
    <p>El alma no siempre quiere adorar. Hay mañanas en que el corazón está apático, cansado, lleno de quejas. David lo sabía. Por eso no espera a <em>sentir</em> ganas de bendecir a Dios: se lo <strong>ordena</strong> a su alma. "Bendice, alma mía" — vamos, álzate, recuerda, adora.</p>
    <p>Hay una diferencia enorme entre <em>escuchar</em> a tu alma y <em>hablarle</em> a tu alma. Tu alma te dirá que estás cansado, que Dios se olvidó de ti, que no hay nada que agradecer. La fe consiste, muchas veces, en dejar de escuchar esa voz y empezar a predicarle la verdad: "alma mía, recuerda quién es Dios y todo lo que ha hecho."</p>

    <div class="verse-block">
      <p>Bendice, alma mía, á Jehová; y bendigan todas mis entrañas su santo nombre. Bendice, alma mía, á Jehová, y no olvides ninguno de sus beneficios.</p>
      <cite>— Salmos 103:1-2, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">"Bendecir" — barak, doblar la rodilla</h2>
    <p>La palabra hebrea para bendecir es <em>barak</em>, y su raíz tiene que ver con <strong>arrodillarse.</strong> Bendecir a Dios no es hacerle un favor —Él no necesita nada de nosotros— sino doblarse ante Él, reconocer humildemente su grandeza y su bondad. Es la postura del alma que se inclina, aunque las rodillas físicas estén de pie y aunque el ánimo no acompañe.</p>
    <p>Y David convoca a "todas mis entrañas" — todo su ser interior, sin dejar nada afuera. La adoración auténtica no es solo de los labios; involucra la voluntad, la memoria, las emociones, todo lo de adentro alineándose para reconocer a Dios.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>El antídoto contra la ingratitud es la memoria: <em>"no olvides ninguno de sus beneficios."</em> El olvido es el suelo donde crece la queja. <strong>Cuando dejamos de recordar lo que Dios ha hecho, empezamos a comportarnos como si nunca hubiera hecho nada. Bendecir es, en parte, el arte de recordar a propósito.</strong></p>
    </div>

    <h2 class="section-title">La lista que reordena el corazón</h2>
    <p>David no deja la orden en abstracto; enseguida enumera los beneficios para que su alma no tenga excusa para olvidar: <em>"él es quien perdona todas tus iniquidades, el que sana todas tus dolencias; el que rescata del hoyo tu vida, el que te corona de favores y misericordias."</em> Perdón, sanidad, rescate, corona. Empieza por lo más profundo —el perdón— porque esa es la base de todo lo demás.</p>
    <p>Cuando el alma está abatida, la cura no suele ser un sentimiento nuevo, sino una memoria recuperada. Haz como David: dale a tu alma una orden y luego dale una lista. Recuerda, en voz alta si hace falta, quién es Dios y lo que ha hecho — y verás cómo el corazón, poco a poco, vuelve a inclinarse.</p>`,
  prayer:'Bendice, alma mía, a Jehová. Hoy no espero a tener ganas: te ordeno, alma mía, que recuerdes. Recuerda que Él perdona todas mis iniquidades, sana mis dolencias, rescata mi vida del hoyo y me corona de favores. Señor, perdona mi olvido y mi queja. Que todo mi ser interior se incline ante Ti y no olvide ninguno de tus beneficios. Amén.',
  faqs:[
    {q:'¿Por qué David le habla a su propia alma en el Salmo 103?', a:'Porque el alma no siempre quiere adorar. En lugar de esperar a sentir ganas, David se da una orden a sí mismo: "Bendice, alma mía". Es el arte de predicarse la verdad en vez de solo escuchar las quejas del propio corazón, una herramienta clave de la fe en los días difíciles.'},
    {q:'¿Qué significa "bendecir" a Dios (barak)?', a:'El verbo hebreo barak tiene su raíz en "arrodillarse". Bendecir a Dios no es hacerle un favor —Él no necesita nada— sino doblarse ante Él, reconocer con humildad su grandeza y su bondad. Es la postura del alma que se inclina, aun cuando el ánimo no acompañe.'},
    {q:'¿Por qué insiste el salmo en "no olvidar sus beneficios"?', a:'Porque el olvido es la raíz de la ingratitud y la queja. Cuando dejamos de recordar lo que Dios ha hecho, vivimos como si nunca hubiera hecho nada. Recordar a propósito sus beneficios —perdón, sanidad, rescate— reordena el corazón y lo lleva de nuevo a la adoración.'},
    {q:'¿Qué beneficios de Dios enumera el Salmo 103?', a:'David lista: perdón de todas las iniquidades, sanidad de las dolencias, rescate de la vida del hoyo, y coronación con favores y misericordias. Empieza por el perdón porque es la base de todo lo demás. La lista existe para que el alma no tenga excusa para olvidar.'}
  ],
  prev:{slug:'1-juan-1-9', title:'1 Juan 1:9: Confesar No es Informar a Dios de Algo que No Sabía'},
  next:{slug:'mateo-7-7', title:'Mateo 7:7: Tres Verbos que Jesús Puso en Presente Continuo'}
},

// ── 58 · Mateo 7:7 ───────────────────────────────────────────────────────────
{
  slug:'mateo-7-7', ref:'Mateo 7:7', libro:'Mateo', cap:'7',
  date:'2026-07-25', dateLabel:'25 de julio, 2026',
  verseShort:'Pedid, y se os dará; buscad, y hallaréis; llamad, y se os abrirá.',
  cardVerse:'Pedid, y se os dará; buscad, y hallaréis; llamad, y se os abrirá.',
  title:'Mateo 7:7: Pedid y se os Dará — El Significado en el Griego Original',
  metaDesc:'Devocional sobre Mateo 7:7. Por qué "pedid, buscad, llamad" están en presente continuo en griego, qué enseña sobre la oración persistente, y el corazón del Padre.',
  h1:'Mateo 7:7: Tres Verbos que Jesús Puso en Presente Continuo',
  tags:['Mateo','Oración','Persistencia'], category:'Nuevo Testamento', cardTags:['Mateo','Oración'],
  cardExcerpt:'En griego los tres verbos están en presente continuo: seguid pidiendo, seguid buscando, seguid llamando. Jesús no describe una oración de una sola vez, sino una puerta a la que se llama con insistencia hasta que se abre.',
  bodyHtml:`
    <p>"Pedid, y se os dará." Es una de las invitaciones más conocidas de Jesús sobre la oración. Pero a veces choca con nuestra experiencia: hemos pedido cosas que no se nos dieron, buscado respuestas que no llegaron. ¿Falla la promesa? El griego original revela un matiz que el español no captura — y que lo cambia todo.</p>

    <h2 class="section-title">Presente continuo: no una vez, sino sin cesar</h2>
    <p>Los tres verbos —pedir, buscar, llamar— están en griego en <strong>tiempo presente continuo</strong>, que indica acción sostenida en el tiempo. Una traducción más literal sería: <em>"seguid pidiendo, y se os dará; seguid buscando, y hallaréis; seguid llamando, y se os abrirá."</em></p>
    <p>Jesús no describe una oración de una sola vez, lanzada al aire para ver si pega. Describe una <strong>postura persistente</strong>: el que pide y sigue pidiendo, el que busca y no se rinde, el que llama a la puerta una y otra vez. La oración, en su enseñanza, no es una máquina expendedora —metes la moneda, sale el producto— sino una relación que persevera.</p>

    <div class="verse-block">
      <p>Pedid, y se os dará; buscad, y hallaréis; llamad, y se os abrirá. Porque cualquiera que pide, recibe; y el que busca, halla; y al que llama, se abrirá.</p>
      <cite>— Mateo 7:7-8, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">Tres verbos, una intensidad creciente</h2>
    <p>Nota la progresión: <em>pedir, buscar, llamar.</em> No son sinónimos repetidos por adorno; describen una intensidad que aumenta. <strong>Pedir</strong> es con palabras. <strong>Buscar</strong> añade acción: el que busca se levanta y se mueve, no solo habla. <strong>Llamar</strong> implica llegar hasta una puerta y golpearla con insistencia, decidido a no irse. La oración madura no es pasiva; involucra a la persona entera buscando a Dios con creciente hambre.</p>
    <p>Esto desafía la idea de que orar es recostarse y esperar. Pedir, buscar y llamar son verbos activos. Dios honra al corazón que lo busca de verdad, no por desgaste, sino porque la búsqueda persistente revela un deseo genuino.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Jesús explica enseguida el <em>porqué</em> de la promesa: si un padre humano, "siendo malo", sabe dar buenas cosas a sus hijos, <em>"¿cuánto más vuestro Padre que está en los cielos dará buenas cosas á los que le piden?"</em> <strong>La base de la oración persistente no es desgastar a un Dios reacio, sino confiar en un Padre bueno que quiere dar.</strong></p>
    </div>

    <h2 class="section-title">"Buenas cosas" — y no siempre las que pedimos</h2>
    <p>La promesa no es que Dios nos dé exactamente lo que pedimos, sino que el Padre da <em>"buenas cosas"</em>. A veces la mejor respuesta a una petición es otra cosa mejor, o un "todavía no", o un cambio en el que pide. Un buen padre no le da a su hijo todo lo que reclama, sino lo que de verdad le conviene.</p>
    <p>Por eso seguir pidiendo no es manipular a Dios para que ceda, sino mantener abierto el canal de la relación mientras Él, que ve el cuadro completo, responde como solo un Padre perfecto sabe. Persistir en la oración nos transforma a nosotros tanto como mueve la mano de Dios: nos mantiene cerca, dependientes, confiados. <strong>Sigue pidiendo. Sigue buscando. Sigue llamando. La puerta tiene un Padre bueno del otro lado.</strong></p>`,
  prayer:'Padre bueno, gracias porque me invitas no a una oración de una sola vez, sino a seguir pidiendo, buscando y llamando. Cuando no veo respuesta, dame la perseverancia de quien confía en tu bondad, no la frustración de quien duda de ella. Y cuando tu respuesta sea distinta a lo que pedí, ayúdame a confiar que das "buenas cosas" porque ves lo que yo no veo. Sigo llamando a tu puerta. Amén.',
  faqs:[
    {q:'¿Qué significa "pedid, buscad, llamad" en Mateo 7:7?', a:'En el griego original los tres verbos están en presente continuo, lo que indica acción sostenida: "seguid pidiendo, seguid buscando, seguid llamando". Jesús enseña una oración persistente y perseverante, no una petición de una sola vez. La oración es una relación que insiste, no una transacción instantánea.'},
    {q:'¿Por qué Jesús usa tres verbos distintos?', a:'Describen una intensidad creciente: pedir es con palabras; buscar añade movimiento y acción; llamar implica llegar a una puerta y golpearla con insistencia. La progresión muestra que la oración madura involucra a la persona entera buscando a Dios con hambre creciente, no de forma pasiva.'},
    {q:'¿Significa Mateo 7:7 que Dios dará todo lo que pidamos?', a:'La promesa es que el Padre da "buenas cosas" (v.11), no necesariamente lo exacto que pedimos. Como un buen padre, Dios da lo que de verdad conviene: a veces algo mejor, a veces un "todavía no". Persistir no es manipular a Dios, sino confiar en su bondad y sabiduría.'},
    {q:'¿Cuál es el fundamento de la oración persistente?', a:'No es desgastar a un Dios reacio, sino confiar en un Padre bueno. Jesús razona que si un padre humano sabe dar buenas cosas a sus hijos, cuánto más el Padre celestial. La persistencia nace de la confianza en su carácter y, además, nos transforma manteniéndonos cercanos y dependientes de Él.'}
  ],
  prev:{slug:'salmos-103-1', title:'Salmos 103: Cuando Tienes que Predicarle a tu Propia Alma'},
  next:{slug:'salmos-19-1', title:'Salmos 19: El Sermón que Predica el Cielo Sin Decir una Palabra'}
},

// ── 59 · Salmos 19 ───────────────────────────────────────────────────────────
{
  slug:'salmos-19-1', ref:'Salmos 19:1', libro:'Salmos', cap:'19',
  date:'2026-07-26', dateLabel:'26 de julio, 2026',
  verseShort:'Los cielos cuentan la gloria de Dios, y la expansión denuncia la obra de sus manos.',
  cardVerse:'Los cielos cuentan la gloria de Dios, y la expansión denuncia la obra de sus manos.',
  title:'Salmos 19:1: Los Cielos Cuentan la Gloria de Dios — Significado',
  metaDesc:'Devocional sobre Salmos 19. Cómo la creación predica sin palabras la gloria de Dios, el paso de las estrellas a la Escritura, y las dos formas en que Dios se revela.',
  h1:'Salmos 19: El Sermón que Predica el Cielo Sin Decir una Palabra',
  tags:['Salmos','Creación','Gloria'], category:'Salmos', cardTags:['Salmos','Creación'],
  cardExcerpt:'El verbo saphar significa narrar, contar como un relator. Los cielos no decoran: predican. David dice que cada amanecer es un sermón sin idioma que todo ser humano entiende — y luego pasa de las estrellas a la Escritura, de la gloria al corazón.',
  bodyHtml:`
    <p>C. S. Lewis llamó al Salmo 19 "uno de los más grandes poemas del Salterio y una de las más grandes letras del mundo". Y tiene razón. En unos pocos versículos, David nos lleva desde las galaxias hasta lo más íntimo del corazón humano, mostrando dos maneras en que Dios habla — y la diferencia entre ellas.</p>

    <h2 class="section-title">La creación como un predicador sin voz</h2>
    <p>El salmo abre con una imagen audaz: <em>"Los cielos cuentan la gloria de Dios."</em> El verbo hebreo es <em>saphar</em> — narrar, relatar, contar como hace un cronista. Los cielos no solo existen ni solo decoran: <strong>predican.</strong> Cada estrella, cada amanecer, cada órbita es una frase en un sermón continuo sobre la grandeza del que los hizo.</p>
    <p>Y David subraya algo asombroso en los versículos siguientes: <em>"No hay lenguaje, ni palabras, ni es oída su voz. Por toda la tierra salió su hilo."</em> Es un mensaje <strong>sin idioma</strong> y, por eso mismo, universal. No necesita traducción. Un campesino en Asia, un niño en África y un astrónomo en Europa miran el mismo cielo estrellado y reciben el mismo testimonio silencioso: alguien hizo esto, y es glorioso.</p>

    <div class="verse-block">
      <p>Los cielos cuentan la gloria de Dios, y la expansión denuncia la obra de sus manos. El un día emite palabra al otro día, y la una noche á la otra noche declara sabiduría.</p>
      <cite>— Salmos 19:1-2, Reina Valera 1909</cite>
    </div>

    <h2 class="section-title">Del cielo a la Escritura: dos libros de Dios</h2>
    <p>A la mitad del salmo ocurre un giro que parece abrupto pero es genial. De pronto David deja de hablar de los cielos y empieza a hablar de la <strong>ley del Señor</strong>: <em>"La ley de Jehová es perfecta, que vuelve el alma... el testimonio de Jehová es fiel, que hace sabio al pequeño."</em> ¿Por qué el salto?</p>
    <p>Porque David describe las <em>dos formas</em> en que Dios se revela. La creación (la <em>revelación general</em>) nos dice que Dios <strong>existe</strong> y que es glorioso y poderoso. Pero las estrellas no pueden decirnos cómo perdona Dios, ni cómo acercarnos a Él, ni su nombre. Para eso necesitamos su Palabra (la <em>revelación especial</em>). El cielo despierta la pregunta; la Escritura da la respuesta. El cielo señala al Creador; la Palabra nos presenta al Salvador.</p>

    <div class="insight-box">
      <span class="insight-label">Para reflexionar</span>
      <p>Nota el movimiento del salmo: de lo más grande (los cielos), a lo más confiable (la Palabra), a lo más íntimo (el corazón). David termina orando: <em>"sean gratos los dichos de mi boca y la meditación de mi corazón delante de ti."</em> <strong>Toda contemplación verdadera de la gloria de Dios termina volviéndose hacia adentro, en humildad y entrega.</strong></p>
    </div>

    <h2 class="section-title">El cierre: de la gloria a la gracia</h2>
    <p>Después de contemplar los cielos y exaltar la Palabra, David hace algo profundamente humano: examina su propio corazón. <em>"¿Quién entenderá los errores? Líbrame de los que me son ocultos."</em> La grandeza de Dios no lo aplasta; lo lleva al arrepentimiento y a pedir limpieza. Y llama a Dios <em>"Jehová, roca mía, y redentor mío."</em></p>
    <p>Ese es el destino de toda adoración auténtica: empieza mirando hacia arriba —la gloria en los cielos—, pasa por la Palabra que ilumina, y termina en un corazón rendido que llama a Dios "mi redentor". La próxima vez que mires un cielo estrellado, deja que te predique. Y luego abre la Palabra, para que el Dios cuya gloria viste se convierta en el Dios cuya gracia conoces.</p>`,
  prayer:'Señor, los cielos me predican tu gloria sin decir una palabra, y hoy quiero escuchar ese sermón silencioso. Pero gracias porque no te quedaste solo en las estrellas: me diste tu Palabra perfecta que vuelve el alma. Que la contemplación de tu grandeza me lleve, como a David, a examinar mi corazón y a llamarte "roca mía y redentor mío". Sean gratos los dichos de mi boca delante de Ti. Amén.',
  faqs:[
    {q:'¿Qué significa "los cielos cuentan la gloria de Dios"?', a:'El verbo hebreo saphar significa narrar o relatar como un cronista. La imagen es que la creación predica activamente: cada estrella y cada amanecer proclama la grandeza de Dios. Es un testimonio continuo de que el universo tiene un Creador glorioso.'},
    {q:'¿Por qué el Salmo 19 pasa de los cielos a la ley de Dios?', a:'Porque describe las dos formas en que Dios se revela. La creación (revelación general) muestra que Dios existe y es glorioso, pero no puede explicar cómo perdona ni cómo acercarse a Él. Para eso se necesita su Palabra (revelación especial). El cielo despierta la pregunta; la Escritura da la respuesta.'},
    {q:'¿Qué quiere decir que el mensaje de los cielos no tiene "lenguaje ni palabras"?', a:'Significa que el testimonio de la creación es universal y no requiere traducción. Sin idioma alguno, cada persona en cualquier lugar de la tierra puede mirar el cielo y recibir el mismo mensaje silencioso: alguien hizo esto, y es glorioso. Por eso "por toda la tierra salió su hilo".'},
    {q:'¿Cómo termina el Salmo 19?', a:'Termina volviéndose hacia adentro: tras contemplar los cielos y exaltar la Palabra, David examina su corazón, pide ser librado de sus errores ocultos y llama a Dios "roca mía y redentor mío". La adoración auténtica empieza mirando la gloria de Dios y termina en un corazón rendido y arrepentido.'}
  ],
  prev:{slug:'mateo-7-7', title:'Mateo 7:7: Tres Verbos que Jesús Puso en Presente Continuo'},
  next:{slug:'', href:'/devocionales', title:'Ver todos los devocionales'}
}

]; // fin del array

// ─── GENERAR ──────────────────────────────────────────────────────────────────
function generate() {
  // 1) Escribir los 20 HTML de devocionales
  devotionals.forEach(d => {
    fs.writeFileSync(path.join(OUT_DIR, `${d.slug}.html`), html(d), 'utf8');
    console.log(`✓ devocional/${d.slug}.html`);
  });

  const firstSlug = devotionals[0].slug;

  // 2) Insertar tarjetas en el hub (devocionales.html) antes de GEN:END
  const hubPath = path.join(ROOT, 'devocionales.html');
  let hub = fs.readFileSync(hubPath, 'utf8');
  if (hub.includes(`/devocional/${firstSlug}"`)) {
    console.log('• hub: ya contiene los nuevos devocionales, omito inserción');
  } else {
    const cards = devotionals.map(hubCard).join('');
    hub = hub.replace('<!-- GEN:END -->', cards + '<!-- GEN:END -->');
    fs.writeFileSync(hubPath, hub, 'utf8');
    console.log('✓ devocionales.html (+20 tarjetas)');
  }

  // 3) Insertar URLs en sitemap.xml antes de GEN:END
  const smPath = path.join(ROOT, 'sitemap.xml');
  let sm = fs.readFileSync(smPath, 'utf8');
  if (sm.includes(`/devocional/${firstSlug}<`)) {
    console.log('• sitemap: ya contiene los nuevos devocionales, omito inserción');
  } else {
    const urls = devotionals.map(sitemapUrl).join('');
    sm = sm.replace('<!-- GEN:END -->', urls + '<!-- GEN:END -->');
    fs.writeFileSync(smPath, sm, 'utf8');
    console.log('✓ sitemap.xml (+20 URLs)');
  }

  // 4) Arreglar el seam: el "next" de lamentaciones-3-22 apunta al primer nuevo
  const seamPath = path.join(OUT_DIR, 'lamentaciones-3-22.html');
  let seam = fs.readFileSync(seamPath, 'utf8');
  const oldNext = '<a href="/devocionales" class="nav-post next"><div class="direction">Siguiente →</div><div class="post-title">Ver todos los devocionales</div></a>';
  const newNext = `<a href="/devocional/${firstSlug}" class="nav-post next"><div class="direction">Siguiente →</div><div class="post-title">${devotionals[0].title}</div></a>`;
  if (seam.includes(oldNext)) {
    seam = seam.replace(oldNext, newNext);
    fs.writeFileSync(seamPath, seam, 'utf8');
    console.log('✓ seam: lamentaciones-3-22 → ' + firstSlug);
  } else {
    console.log('• seam: el next de lamentaciones-3-22 ya estaba enlazado o cambió, reviso manual');
  }

  console.log(`\n✅ ${devotionals.length} devocionales (lotes 3 y 4) generados y enlazados.`);
}

generate();

module.exports = { devotionals, html };
