// Renderiza los correos de bienvenida a archivos, para previsualizarlos en el
// navegador o pegarlos como campaña en Brevo.
//
//   node backend/tools/render-welcome.mjs
//
// Salida: backend/emails/_preview/{premium,cuenta}-bienvenida.{html,txt}
// Las plantillas son las MISMAS que envía el worker: no editar la salida,
// editar los archivos de backend/emails/.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { premiumWelcomeEmail } from '../emails/premium-bienvenida.js';
import { accountWelcomeEmail } from '../emails/cuenta-bienvenida.js';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../emails/_preview');
await mkdir(outDir, { recursive: true });

const correos = [
    ['premium-bienvenida', premiumWelcomeEmail()],
    ['cuenta-bienvenida', accountWelcomeEmail()],
];

for (const [nombre, { subject, html, text }] of correos) {
    await writeFile(resolve(outDir, nombre + '.html'), html);
    await writeFile(resolve(outDir, nombre + '.txt'), text);
    console.log(`${nombre}  (${(html.length / 1024).toFixed(1)} KB)`);
    console.log(`  asunto: ${subject}`);
    console.log(`  html:   ${resolve(outDir, nombre + '.html')}`);
}
