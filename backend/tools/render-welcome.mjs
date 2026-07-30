// Renderiza el correo de bienvenida Premium a archivos, para previsualizarlo en
// el navegador o pegarlo como campaña en Brevo (a los Premium que ya existen).
//
//   node backend/tools/render-welcome.mjs
//
// Salida: backend/emails/_preview/premium-bienvenida.{html,txt}
// La plantilla es la MISMA que envía el worker: no editar la salida, editar
// backend/emails/premium-bienvenida.js.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { premiumWelcomeEmail } from '../emails/premium-bienvenida.js';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../emails/_preview');
const { subject, html, text } = premiumWelcomeEmail();

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'premium-bienvenida.html'), html);
await writeFile(resolve(outDir, 'premium-bienvenida.txt'), text);

console.log('Asunto: ' + subject);
console.log('HTML:   ' + resolve(outDir, 'premium-bienvenida.html') + `  (${(html.length / 1024).toFixed(1)} KB)`);
console.log('Texto:  ' + resolve(outDir, 'premium-bienvenida.txt'));
