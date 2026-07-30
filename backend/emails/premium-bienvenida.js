// Correo de bienvenida Premium (Sonido de Vida)
// ─────────────────────────────────────────────────────────────────────
// Se envía UNA sola vez por usuario, la primera vez que su cuenta pasa a
// Premium (pago en Stripe, cupón de regalo o cortesía de admin). Explica
// qué se abrió en su cuenta y CÓMO llegar a cada cosa dentro de la app.
//
// Vive fuera de `api-worker.js` a propósito: así el mismo HTML se puede
// renderizar a archivo con `node backend/tools/render-welcome.mjs` para
// previsualizarlo o pegarlo como campaña en Brevo, sin duplicar el texto.
// La forma (paleta, tablas, envoltorio) está en `base.js`.

import { SITE, GOLD_SOFT, CREAM, MUTED, LINE, bloqueFeature, bloqueExtra, boton, versiculo, envoltorio, sinHtml } from './base.js';

// Una novedad = un bloque. `como` es el "cómo acceder": lo que de verdad
// hace la diferencia entre un suscriptor que usa la app y uno que se va.
const FEATURES = [
    {
        n: '01',
        titulo: 'RV-SDV · la Biblia con nuestra voz, en calidad estudio',
        texto: 'Una narración exclusiva de <b>toda la Biblia</b>, de Génesis a Apocalipsis (1.189 capítulos, Reina-Valera 1909), producida por Sonido de Vida. Cálida, natural y sin los cortes metálicos de una voz automática. No está disponible en el plan gratuito.',
        como: 'Ya viene activada en tu cuenta. En la pestaña <b>Biblia</b>, arriba, verás el selector de voz con <b>✨ RV-SDV</b> marcado. Si prefieres otra, ahí mismo cambias a SBLL 2026.',
    },
    {
        n: '02',
        titulo: 'Modo Enfoque · música y Palabra a la vez',
        texto: 'Dos formas de entrar: <b>Meditación</b> (música de ambiente con versículos que van rotando, para orar o descansar) y <b>Con voz</b> (música de fondo mientras se narra el capítulo que estés escuchando). Con temporizador y varios estilos de ambiente para elegir.',
        como: 'Botón <b>✨ Modo Enfoque</b> en el Inicio, o el ícono de estrella dentro del reproductor de la Biblia para entrar directo con voz.',
    },
    {
        n: '03',
        titulo: 'El texto sigue al audio, y tú mandas en la velocidad',
        texto: 'Mientras suena la narración, el versículo que se está leyendo se resalta solo. Y puedes bajar o subir la velocidad sin que la voz se distorsione — incluso cámara lenta (0,9×) para meditar frase por frase.',
        como: 'Abre cualquier capítulo en <b>Biblia</b> y dale a reproducir. Los controles de velocidad están en el reproductor y dentro del Modo Enfoque.',
    },
    {
        n: '04',
        titulo: 'Instálala en tu teléfono y escucha con la pantalla apagada',
        texto: 'Instalada como app, la Biblia sigue sonando con el celular bloqueado o en otra aplicación, y se ve a pantalla completa, sin barras del navegador.',
        como: 'En Android: menú del navegador → <b>Instalar aplicación</b>. En iPhone: Safari → <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>. La app te guía paso a paso si le das al aviso de instalación.',
    },
];

// Cosas que ya existen y que casi nadie descubre solo.
const EXTRAS = [
    ['📖', 'Estudio Bíblico', 'Escribe una referencia en <b>Buscar</b> ("Juan 3:16") y abre su estudio: palabras en hebreo o griego, contexto, enseñanza pastoral, Cristo en el texto y voces de la historia.'],
    ['🕯️', 'Devocionales', 'Casi 60 lecturas cortas para empezar el día, con audio.'],
    ['🔥', 'Reto 11 Días, 11 Áreas', 'Once audios, once áreas de tu vida, uno por día en tu correo.'],
    ['🔖', 'Tus versículos', 'Guarda los que te hablen y vuelve a ellos desde la pestaña <b>Yo</b>.'],
];

/**
 * Devuelve { subject, html, text } del correo de bienvenida Premium.
 * @param {{ nombre?: string }} [opts] nombre de pila, si se conoce.
 */
export function premiumWelcomeEmail(opts = {}) {
    const nombre = (opts.nombre || '').trim();
    const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

    const cuerpo = `
        <p style="margin:0 0 10px;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:3px;color:#c9a84c;text-transform:uppercase">✨ Ya eres Premium</p>
        <h1 style="margin:0 0 18px;font:400 30px/1.25 Georgia,'Times New Roman',serif;color:${CREAM}">Bienvenido a la comunidad Premium</h1>

        <p style="margin:0 0 16px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">${saludo}</p>
        <p style="margin:0 0 16px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">Gracias por sostener este proyecto. Tu suscripción no solo te abre lo mejor de la app: hace posible que la Palabra siga sonando —en buena voz y gratis— para miles de personas que no pueden pagarla.</p>
        <p style="margin:0 0 26px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">Esto es <b style="color:${GOLD_SOFT}">todo lo que acaba de abrirse en tu cuenta</b>, y dónde encontrarlo:</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${FEATURES.map(bloqueFeature).join('')}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:22px 0 8px">
            ${boton(SITE, 'Abrir Sonido de Vida')}
          </td></tr>
          <tr><td align="center" style="padding:0 0 26px">
            <p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}">Entra con el mismo correo al que llegó este mensaje.</p>
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE}">
          <tr><td style="padding:24px 0 6px">
            <h2 style="margin:0 0 16px;font:400 20px/1.3 Georgia,'Times New Roman',serif;color:${GOLD_SOFT}">Y de paso, no te pierdas esto</h2>
          </td></tr>
          ${EXTRAS.map(bloqueExtra).join('')}
        </table>

        ${versiculo('Voz de Jehová con potencia; voz de Jehová con gloria.', 'Salmo 29:4 · Reina-Valera 1909')}

        <p style="margin:28px 0 0;font:400 15px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">Si algo no te funciona o quieres pedir una función, respóndeme a este correo: lo leo yo.</p>
        <p style="margin:14px 0 0;font:400 15px/1.7 Arial,Helvetica,sans-serif;color:${MUTED}">Con cariño,<br><b style="color:${CREAM}">El equipo de Sonido de Vida</b></p>`;

    const pie = `
        <p style="margin:0 0 10px;font:400 12px/1.7 Arial,Helvetica,sans-serif;color:#6f6b60">
          Gestiona o cancela tu suscripción cuando quieras desde la pestaña <b>Yo</b> &rarr; <b>Gestionar mi suscripción</b>. Sin llamadas ni trámites.
        </p>
        <p style="margin:0 0 10px;font:400 11px/1.6 Arial,Helvetica,sans-serif;color:#4f4b43">
          Recibes este correo porque acabas de activar Premium en Sonido de Vida. Es un aviso único de tu cuenta, no una campaña publicitaria.
        </p>`;

    const html = envoltorio({
        titulo: 'Bienvenido a Sonido de Vida Premium',
        preheader: 'Tu voz nueva RV-SDV, el Modo Enfoque y todo lo que acaba de abrirse en tu cuenta.',
        cuerpo,
        pie,
    });

    const text = [
        'SONIDO DE VIDA — Ya eres Premium',
        '',
        saludo,
        '',
        'Gracias por sostener este proyecto. Tu suscripción no solo te abre lo mejor de la app: hace posible que la Palabra siga sonando, gratis, para miles de personas.',
        '',
        'ESTO ES LO QUE ACABA DE ABRIRSE EN TU CUENTA:',
        '',
        ...FEATURES.map(f => `${f.n}. ${f.titulo}\n${sinHtml(f.texto)}\nCómo llegar: ${sinHtml(f.como)}\n`),
        `Abrir la app: ${SITE} (entra con el mismo correo al que llegó este mensaje).`,
        '',
        'Y DE PASO:',
        ...EXTRAS.map(([, t, d]) => `- ${t}: ${sinHtml(d)}`),
        '',
        '«Voz de Jehová con potencia; voz de Jehová con gloria.» — Salmo 29:4 (Reina-Valera 1909)',
        '',
        'Si algo no te funciona o quieres pedir una función, responde a este correo.',
        '',
        'El equipo de Sonido de Vida',
        `${SITE} · ${SITE}/contacto`,
        'Gestiona o cancela tu suscripción desde la pestaña Yo → Gestionar mi suscripción.',
    ].join('\n');

    return { subject: 'Ya eres Premium ✨ esto es lo nuevo y cómo usarlo', html, text };
}
