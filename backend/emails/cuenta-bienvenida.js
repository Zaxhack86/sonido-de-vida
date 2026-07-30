// Correo de bienvenida para cuentas GRATIS (Sonido de Vida)
// ─────────────────────────────────────────────────────────────────────
// Se envía UNA sola vez por usuario, la primera vez que entra a la app sin
// ser Premium. Objetivo doble: que use lo que ya tiene gratis (si no vuelve,
// nunca pagará) y que pruebe Premium 7 días gratis.
//
// La forma (paleta, tablas, envoltorio) está en `base.js`. La versión Premium
// de este correo es `premium-bienvenida.js`.

import { SITE, GOLD_SOFT, CREAM, MUTED, LINE, NAVY_CARD, GOLD, bloqueFeature, bloqueExtra, boton, versiculo, envoltorio, sinHtml } from './base.js';

// Lo que ya puede hacer HOY, sin pagar nada. Primero el valor, después la venta.
const GRATIS = [
    {
        n: '01',
        titulo: 'Toda la Biblia en audio, completa',
        texto: 'Los 66 libros narrados, de Génesis a Apocalipsis, en español. Puedes escuchar de corrido —un libro entero o toda la Biblia seguida— mientras manejas, trabajas o descansas.',
        como: 'Pestaña <b>Biblia</b> → elige libro y capítulo → reproducir. Sigue sonando aunque cambies de app.',
    },
    {
        n: '02',
        titulo: 'Estudio Bíblico, sin costo',
        texto: 'Escribe una referencia y no solo verás el versículo: también las palabras en hebreo o griego, el contexto, la enseñanza pastoral y cómo apunta a Cristo. Es material de seminario, explicado sencillo.',
        como: 'Pestaña <b>Buscar</b> → escribe "Juan 3:16" (o una palabra suelta) → abre el estudio.',
    },
    {
        n: '03',
        titulo: 'Devocionales y el Reto de 11 días',
        texto: 'Casi 60 lecturas cortas para empezar el día, y un reto de once días que toca once áreas reales: ansiedad, finanzas, familia lejos, identidad, perdón. Te llega uno por día a tu correo.',
        como: 'Menú → <b>Devocionales</b>, y <b>Retos</b> para apuntarte al de 11 días.',
    },
    {
        n: '04',
        titulo: 'Instálala en tu teléfono',
        texto: 'Se instala como una app normal, ocupa casi nada y sigue sonando con la pantalla apagada.',
        como: 'En Android: menú del navegador → <b>Instalar aplicación</b>. En iPhone: Safari → <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.',
    },
];

// Las dos cosas que solo están en Premium. No listar más: la prueba se vende
// con dos motivos claros, no con una lista larga.
const PREMIUM = [
    ['🎧', 'RV-SDV, nuestra voz propia', 'Una narración exclusiva de toda la Biblia en <b>calidad estudio</b>: cálida y natural, sin el filo metálico de una voz automática. Grabada por Sonido de Vida sobre la Reina-Valera 1909.'],
    ['🌙', 'Modo Enfoque', 'Música de ambiente con la Palabra encima: <b>Meditación</b> (versículos que van rotando para orar o descansar) o <b>Con voz</b> (música de fondo mientras se narra el capítulo). Con temporizador para dormir.'],
];

/**
 * Devuelve { subject, html, text } del correo de bienvenida a cuenta gratis.
 * @param {{ nombre?: string }} [opts] nombre de pila, si se conoce.
 */
export function accountWelcomeEmail(opts = {}) {
    const nombre = (opts.nombre || '').trim();
    const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

    const cuerpo = `
        <p style="margin:0 0 10px;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:3px;color:${GOLD};text-transform:uppercase">Tu cuenta está lista</p>
        <h1 style="margin:0 0 18px;font:400 30px/1.25 Georgia,'Times New Roman',serif;color:${CREAM}">Bienvenido a Sonido de Vida</h1>

        <p style="margin:0 0 16px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">${saludo}</p>
        <p style="margin:0 0 26px;font:400 16px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">Gracias por crear tu cuenta. Nacimos con una idea simple: que cualquier persona pueda <b style="color:${GOLD_SOFT}">escuchar la Palabra</b> aunque no tenga tiempo de sentarse a leer. Esto es lo que ya tienes, gratis, desde hoy:</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${GRATIS.map(bloqueFeature).join('')}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:22px 0 8px">
            ${boton(SITE, 'Entrar y escuchar')}
          </td></tr>
          <tr><td align="center" style="padding:0 0 26px">
            <p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}">Entra con el mismo correo al que llegó este mensaje.</p>
          </td></tr>
        </table>

        <!-- Invitación a la prueba -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NAVY_CARD};border:1px solid ${GOLD};border-radius:16px">
          <tr><td style="padding:26px 24px">
            <p style="margin:0 0 8px;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:2px;color:${GOLD};text-transform:uppercase">✨ 7 días gratis</p>
            <h2 style="margin:0 0 12px;font:400 23px/1.3 Georgia,'Times New Roman',serif;color:${GOLD_SOFT}">Prueba Premium una semana, sin pagar</h2>
            <p style="margin:0 0 18px;font:400 15px/1.65 Arial,Helvetica,sans-serif;color:${CREAM}">Premium abre dos cosas que cambian por completo cómo se escucha la Biblia:</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${PREMIUM.map(bloqueExtra).join('')}
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="padding:12px 0 10px">
                ${boton(SITE, 'Probar Premium 7 días gratis')}
              </td></tr>
            </table>
            <p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};text-align:center">Después, $2.99 al mes o $24.99 al año. Cancelas cuando quieras desde la pestaña <b>Yo</b>; si cancelas antes de que terminen los 7 días, no se te cobra nada.</p>
          </td></tr>
        </table>

        ${versiculo('Lámpara es a mis pies tu palabra, y astro a mi camino.', 'Salmo 119:105 · Reina-Valera 1909')}

        <p style="margin:28px 0 0;font:400 15px/1.7 Arial,Helvetica,sans-serif;color:${CREAM}">Si tienes una duda o quieres pedir algo para la app, escríbenos desde <a href="${SITE}/contacto" style="color:${GOLD_SOFT};font-weight:bold">sonidodevida.com/contacto</a>. Lo leemos todo.</p>
        <p style="margin:8px 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}">Este correo sale de un buzón automático. Si respondes, tu mensaje llega igualmente a contacto@sonidodevida.com.</p>
        <p style="margin:14px 0 0;font:400 15px/1.7 Arial,Helvetica,sans-serif;color:${MUTED}">Con cariño,<br><b style="color:${CREAM}">El equipo de Sonido de Vida</b></p>`;

    const pie = `
        <p style="margin:0 0 10px;font:400 12px/1.7 Arial,Helvetica,sans-serif;color:#6f6b60;border-top:1px solid ${LINE};padding-top:16px">
          Recibes este correo porque acabas de crear tu cuenta en Sonido de Vida. Es un aviso único de bienvenida.
        </p>`;

    const html = envoltorio({
        titulo: 'Bienvenido a Sonido de Vida',
        preheader: 'Toda la Biblia en audio, tu Estudio Bíblico gratis y 7 días de Premium para probar.',
        cuerpo,
        pie,
    });

    const text = [
        'SONIDO DE VIDA — Tu cuenta está lista',
        '',
        saludo,
        '',
        'Gracias por crear tu cuenta. Nacimos con una idea simple: que cualquier persona pueda escuchar la Palabra aunque no tenga tiempo de sentarse a leer.',
        '',
        'ESTO YA ES TUYO, GRATIS:',
        '',
        ...GRATIS.map(f => `${f.n}. ${f.titulo}\n${sinHtml(f.texto)}\nCómo llegar: ${sinHtml(f.como)}\n`),
        `Entrar y escuchar: ${SITE} (con el mismo correo al que llegó este mensaje).`,
        '',
        '✨ Y PRUEBA PREMIUM 7 DÍAS GRATIS',
        'Premium abre dos cosas que cambian cómo se escucha la Biblia:',
        ...PREMIUM.map(([, t, d]) => `- ${t}: ${sinHtml(d)}`),
        '',
        'Después, $2.99 al mes o $24.99 al año. Cancelas cuando quieras desde la pestaña Yo; si cancelas antes de que terminen los 7 días, no se te cobra nada.',
        '',
        '«Lámpara es a mis pies tu palabra, y astro a mi camino.» — Salmo 119:105 (Reina-Valera 1909)',
        '',
        `Si tienes una duda o quieres pedir algo para la app, escríbenos desde ${SITE}/contacto. Lo leemos todo.`,
        'Este correo sale de un buzón automático. Si respondes, tu mensaje llega igualmente a contacto@sonidodevida.com.',
        '',
        'El equipo de Sonido de Vida',
        `${SITE} · ${SITE}/contacto`,
    ].join('\n');

    return { subject: 'Bienvenido a Sonido de Vida ✨ empieza por aquí (y prueba Premium 7 días gratis)', html, text };
}
