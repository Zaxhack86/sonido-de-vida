#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de devocionales — Sonido de Vida.

Fuente única de verdad para los devocionales SEO. A partir de la lista ARTICLES:
  1. Renderiza cada devocional/<slug>.html con la plantilla aprobada.
  2. Inserta las tarjetas en devocionales.html entre <!-- GEN:START --> / <!-- GEN:END -->.
  3. Inserta las URLs en sitemap.xml entre los mismos marcadores.
  4. Encadena prev/next en el orden de la lista.

No toca los 19 devocionales escritos a mano (viven fuera de los marcadores).
Crece por lotes: añadir artículos a ARTICLES y volver a ejecutar.

    python3 tools/gen_devocionales.py

Reglas de contenido respetadas: Reina-Valera 1909; nunca mencionar la muerte de
Jesús sin afirmar su resurrección (se audita con grep aparte).
"""
import json
import os
import re
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://sonidodevida.com"
ADS = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1847146837046506" crossorigin="anonymous"></script>'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">')

# El bloque <style> es idéntico al de los devocionales escritos a mano.
STYLE = r"""<style>
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
.verse-text::before { content:'\201C'; color:var(--gold); }
.verse-text::after  { content:'\201D'; color:var(--gold); }
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
}</style>"""

WA_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
FB_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
TW_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>'
COPY_ICON = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
PLAY_ICON = '<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>'
BACK_ICON = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>'


def audio_url(libro, cap):
    return f"/?libro={quote(libro)}&cap={cap}"


def render_article(a, prev, nxt):
    url = f"{SITE}/devocional/{a['slug']}"
    desc = a["description"]
    article_ld = json.dumps({
        "@context": "https://schema.org", "@type": "Article",
        "headline": a["title"], "description": desc,
        "image": f"{SITE}/og-image.png", "datePublished": a["date_iso"],
        "author": {"@type": "Organization", "name": "Sonido de Vida"},
        "publisher": {"@type": "Organization", "name": "Sonido de Vida",
                      "logo": {"@type": "ImageObject", "url": f"{SITE}/icon-512.png"}},
        "mainEntityOfPage": url,
    }, ensure_ascii=False)
    faq_ld = json.dumps({
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": ans}}
                       for q, ans in a["faqs"]],
    }, ensure_ascii=False)

    faq_html = "\n".join(
        f'''        <div class="faq-item">
          <button class="faq-question" onclick="toggleFaq(this)">
            {q}<span class="faq-arrow">+</span>
          </button>
          <div class="faq-answer"><p>{ans}</p></div>
        </div>''' for q, ans in a["faqs"])

    share_text = quote(f"*{a['hero_verse']}*\n— {a['ref']}\n\nDevocional completo: {url}")
    fb = quote(url, safe="")
    tw_text = quote(f"\"{a['hero_verse']}\" — {a['ref']}\n\n{url}")

    def nav_post(item, direction, cls):
        if not item:
            href, title = "/devocionales", "Ver todos los devocionales"
        else:
            href, title = f"/devocional/{item['slug']}", item["title"]
        return (f'<a href="{href}" class="nav-post {cls}">'
                f'<div class="direction">{direction}</div>'
                f'<div class="post-title">{title}</div></a>')

    meta_tags = "".join(f'<span class="meta-tag">{t}</span>' for t in a["meta_tags"])
    aud = audio_url(a["libro"], a["cap"])

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {ADS}
  <title>{a['title']}</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{a['title']}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{SITE}/og-image.png">
  <meta property="og:site_name" content="Sonido de Vida">
  <meta property="og:locale" content="es_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{a['title']}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{SITE}/og-image.png">
  <script type="application/ld+json">
  {article_ld}
  </script>
  <script type="application/ld+json">
  {faq_ld}
  </script>
  {FONTS}
  {STYLE}
</head>
<body>

<nav>
  <a href="/" class="nav-logo">♪ Sonido de Vida</a>
  <a href="/devocionales" class="nav-back">
    {BACK_ICON}
    Devocionales
  </a>
</nav>

<div class="hero-verse">
  <div class="tag">✦ Devocional</div>
  <div class="verse-ref">{a['ref']}</div>
  <p class="verse-text">{a['hero_verse']}</p>
  <a href="{aud}" class="audio-cta">
    {PLAY_ICON}
    Escuchar {a['ref_book']} {a['cap']} en audio
  </a>
</div>

<div class="breadcrumb">
  <a href="/">Inicio</a><span>›</span>
  <a href="/devocionales">Devocionales</a><span>›</span>
  {a['ref_book']} {a['cap']}
</div>

<div class="content-wrap">
  <h1 class="devocional-title">{a['title']}</h1>
  <div class="meta-info">
    <span>{a['date_label']}</span>
    {meta_tags}
    <span class="meta-tag">{a['read']} min lectura</span>
  </div>
  <div class="divider"></div>

  <div class="devocional-body">
{a['body']}
  </div>

  <div class="prayer-section">
    <h3>✦ Oración</h3>
    <p>{a['prayer']}</p>
  </div>

  <div class="listen-section">
    <h3>Escucha {a['ref_book']} {a['cap']} completo en audio</h3>
    <p>Reina Valera 1909 · Voz clara · Gratis, sin registro</p>
    <a href="{aud}" class="audio-cta">
      {PLAY_ICON}
      Abrir en Sonido de Vida
    </a>
  </div>

  <div class="faq-section">
    <h2>Preguntas frecuentes sobre {a['ref_book']} {a['cap']}</h2>
{faq_html}
  </div>

  <div class="share-section">
    <h4>Compartir este devocional</h4>
    <div class="share-buttons">
      <a class="share-btn share-whatsapp" href="https://wa.me/?text={share_text}" target="_blank" rel="noopener">
        {WA_ICON}
        WhatsApp
      </a>
      <a class="share-btn share-facebook" href="https://www.facebook.com/sharer/sharer.php?u={fb}" target="_blank" rel="noopener">
        {FB_ICON}
        Facebook
      </a>
      <a class="share-btn share-twitter" href="https://twitter.com/intent/tweet?text={tw_text}" target="_blank" rel="noopener">
        {TW_ICON}
        X / Twitter
      </a>
      <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('{url}').then(()=>{{this.textContent='¡Copiado!'}})">
        {COPY_ICON}
        Copiar link
      </button>
    </div>
  </div>

  <nav class="nav-posts">
    {nav_post(prev, '← Anterior', 'prev')}
    {nav_post(nxt, 'Siguiente →', 'next')}
  </nav>
</div>

<script>
function toggleFaq(btn){{
  const item=btn.closest('.faq-item');
  const isOpen=item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i=>i.classList.remove('open'));
  if(!isOpen)item.classList.add('open');
}}
</script>
</body>
</html>'''


def render_card(a):
    tags = "".join(f'<span class="card-tag">{t}</span>' for t in a["card_tags"])
    return f'''    <a href="/devocional/{a['slug']}" class="card reveal" data-category="{a['category']}">
      <div class="card-top">
        <div class="card-ref">{a['ref']}</div>
        <div class="card-verse">{a['card_verse']}</div>
      </div>
      <div class="card-body">
        <div class="card-title">{a['card_title']}</div>
        <div class="card-excerpt">{a['card_excerpt']}</div>
        <div class="card-footer">
          <div class="card-tags">{tags}</div>
          <span class="card-link">Leer →</span>
        </div>
      </div>
    </a>'''


def replace_between(text, start, end, payload, fallback_before=None):
    if start in text and end in text:
        pre = text.split(start)[0]
        post = text.split(end)[1]
        return f"{pre}{start}\n{payload}\n{end}{post}"
    if fallback_before and fallback_before in text:
        block = f"{start}\n{payload}\n{end}\n"
        return text.replace(fallback_before, block + fallback_before, 1)
    raise SystemExit("No se encontraron marcadores ni fallback")


def main():
    from articles import ARTICLES  # lista de dicts (lote acumulado)

    # 1. Devocionales individuales + prev/next
    os.makedirs(os.path.join(ROOT, "devocional"), exist_ok=True)
    for i, a in enumerate(ARTICLES):
        prev = ARTICLES[i - 1] if i > 0 else None
        nxt = ARTICLES[i + 1] if i < len(ARTICLES) - 1 else None
        html = render_article(a, prev, nxt)
        with open(os.path.join(ROOT, "devocional", f"{a['slug']}.html"), "w", encoding="utf-8") as f:
            f.write(html)

    # 2. Hub
    hub_path = os.path.join(ROOT, "devocionales.html")
    hub = open(hub_path, encoding="utf-8").read()
    cards = "\n".join(render_card(a) for a in ARTICLES)
    hub = replace_between(hub, "<!-- GEN:START -->", "<!-- GEN:END -->", cards)
    total = 19 + len(ARTICLES)
    hub = re.sub(r'(<span class="grid-count" id="grid-count">)\d+( devocionales</span>)',
                 rf'\g<1>{total}\g<2>', hub)
    open(hub_path, "w", encoding="utf-8").write(hub)

    # 3. Sitemap
    sm_path = os.path.join(ROOT, "sitemap.xml")
    sm = open(sm_path, encoding="utf-8").read()
    urls = "\n".join(
        f'''  <url>
    <loc>{SITE}/devocional/{a['slug']}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <lastmod>{a['date_iso']}</lastmod>
  </url>''' for a in ARTICLES)
    sm = replace_between(sm, "<!-- GEN:START -->", "<!-- GEN:END -->", urls,
                         fallback_before="</urlset>")
    open(sm_path, "w", encoding="utf-8").write(sm)

    print(f"OK: {len(ARTICLES)} devocionales generados. Total en hub: {total}.")


if __name__ == "__main__":
    main()
