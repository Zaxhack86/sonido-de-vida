// Base compartida de los correos de Sonido de Vida
// ─────────────────────────────────────────────────────────────────────
// Paleta, envoltorio y piezas de maquetado que usan todas las plantillas de
// `backend/emails/`. Aquí NO va contenido: solo la forma.
//
// Reglas de correo: todo el estilo va en línea (Gmail borra <style>), ancho
// máximo 600 px, maquetado con tablas y siempre una versión de texto plano.

export const SITE = 'https://sonidodevida.com';

export const GOLD = '#c9a84c';
export const GOLD_SOFT = '#e0c67e';
export const NAVY = '#0b1226';
export const NAVY_CARD = '#131c36';
export const CREAM = '#ece7dc';
export const MUTED = '#a6a294';
export const LINE = '#26304d';
export const BG = '#070c18';

/** Bloque numerado con su "Cómo llegar" — el patrón de las funciones de la app. */
export function bloqueFeature(f) {
    return `
      <tr><td style="padding:0 0 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NAVY_CARD};border:1px solid ${LINE};border-radius:14px">
          <tr><td style="padding:22px 24px">
            <p style="margin:0 0 8px;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:2px;color:${GOLD}">${f.n}</p>
            <h3 style="margin:0 0 10px;font:700 19px/1.3 Georgia,'Times New Roman',serif;color:${GOLD_SOFT}">${f.titulo}</h3>
            <p style="margin:0 0 ${f.como ? '14px' : '0'};font:400 15px/1.65 Arial,Helvetica,sans-serif;color:${CREAM}">${f.texto}</p>
            ${f.como ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="3" style="background:${GOLD};border-radius:2px"></td>
                <td style="padding:2px 0 2px 14px">
                  <p style="margin:0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}"><b style="color:${GOLD_SOFT}">Cómo llegar:</b> ${f.como}</p>
                </td>
              </tr>
            </table>` : ''}
          </td></tr>
        </table>
      </td></tr>`;
}

/** Fila de lista con emoji, título y descripción. */
export function bloqueExtra([icono, titulo, texto]) {
    return `
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="34" valign="top" style="font-size:20px;line-height:1.4">${icono}</td>
            <td style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}">
              <b style="color:${CREAM}">${titulo}.</b> ${texto}
            </td>
          </tr>
        </table>
      </td></tr>`;
}

/** Botón dorado centrado (bulletproof: fondo en el <td>, no en el <a>). */
export function boton(href, texto) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
      <tr><td style="background:${GOLD};border-radius:12px">
        <a href="${href}" style="display:inline-block;padding:15px 34px;font:700 16px/1 Arial,Helvetica,sans-serif;color:#1a1610;text-decoration:none">${texto}</a>
      </td></tr>
    </table>`;
}

/** Cita bíblica con barra dorada. */
export function versiculo(texto, referencia) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">
      <tr>
        <td width="3" style="background:${GOLD};border-radius:2px"></td>
        <td style="padding:6px 0 6px 18px">
          <p style="margin:0 0 6px;font:italic 400 17px/1.6 Georgia,'Times New Roman',serif;color:${CREAM}">&laquo;${texto}&raquo;</p>
          <p style="margin:0;font:400 13px/1.5 Arial,Helvetica,sans-serif;color:${GOLD}">${referencia}</p>
        </td>
      </tr>
    </table>`;
}

/**
 * Envoltorio completo del correo: <html>, fondo, marca, tarjeta central y pie.
 * @param {{titulo:string, preheader:string, cuerpo:string, pie:string}} p
 */
export function envoltorio({ titulo, preheader, cuerpo, pie }) {
    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
  <tr><td align="center" style="padding:28px 14px 40px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

      <tr><td align="center" style="padding:14px 0 26px">
        <p style="margin:0;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:4px;color:${GOLD};text-transform:uppercase">Sonido de Vida</p>
      </td></tr>

      <tr><td style="background:${NAVY};border:1px solid ${LINE};border-radius:20px;padding:38px 30px 34px">
${cuerpo}
      </td></tr>

      <tr><td style="padding:24px 8px 0">
${pie}
        <p style="margin:0 0 10px;font:400 12px/1.7 Arial,Helvetica,sans-serif;color:#6f6b60">
          <a href="${SITE}" style="color:#8ea6d6;text-decoration:none">sonidodevida.com</a> &nbsp;·&nbsp;
          <a href="${SITE}/contacto" style="color:#8ea6d6;text-decoration:none">Contacto</a> &nbsp;·&nbsp;
          <a href="${SITE}/privacidad" style="color:#8ea6d6;text-decoration:none">Privacidad</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Quita etiquetas HTML para armar la versión de texto plano. */
export const sinHtml = (s) => s.replace(/<[^>]+>/g, '');
