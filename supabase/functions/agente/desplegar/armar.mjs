#!/usr/bin/env node
/* ============================================================================
   ARMAR desplegar/index.ts — la función `agente` (el agente de ventas) en UN archivo, para pegarla en el panel.

   Es la misma receta que la de la TV del taller (functions/pantalla/desplegar): en la computadora de Elías no
   hay CLI de Supabase ni Docker y el editor del panel es UN archivo. Esto junta handler.js y _shared (ficha,
   agente, precio, ia, http, entorno, cliente…) con esbuild (versión fijada en package.json y package-lock.json)
   en desplegar/index.ts, que es lo que se pega. Lo único de fuera: npm:@supabase/supabase-js@2.

   Uso (desde la raíz del repositorio; la primera vez, `npm ci` en esta carpeta):
       node supabase/functions/agente/desplegar/armar.mjs              escribe desplegar/index.ts
       node supabase/functions/agente/desplegar/armar.mjs --comprobar  dice si el que está es el que sale hoy

   El archivo lleva en su cabecera la huella (sha256, 16 caracteres) de CADA fuente que entró:
   pruebas/agente-logica.mjs las vuelve a calcular y falla si una fuente cambió sin volver a armar.
   ============================================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, extname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(AQUI, '..', '..', '..', '..');
export const ENTRADA = 'supabase/functions/agente/index.ts';
export const SALIDA = join(AQUI, 'index.ts');

export const lf = t => String(t).replace(/\r\n/g, '\n');
export const huella = texto => createHash('sha256').update(lf(texto), 'utf8').digest('hex').slice(0, 16);

const CARGADOR = { '.js': 'js', '.mjs': 'js', '.ts': 'ts', '.json': 'json' };
const APP = join(RAIZ, 'js') + sep;
/* Un import() dinámico de la app se vuelve una promesa rechazada: */
export const SIN_IMPORT = '(() => Promise.reject(new Error("la función agente no carga módulos de la app con import()")))(';
/* Al leer cada fuente: LF (con autocrlf, en Windows los archivos están con CRLF y el resultado cambiaría). El agente no
   importa módulos de la app (js/); si un día lo hiciera, sus import() dinámicos no entran, como en la de la TV. */
const lectura = {
  name: 'lectura',
  setup(b) {
    b.onLoad({ filter: /\.(m?js|ts|json)$/ }, async a => {
      let t = lf(await readFile(a.path, 'utf8'));
      if (a.path.startsWith(APP)) t = t.replace(/\bimport\(/g, SIN_IMPORT);
      return { contents: t, loader: CARGADOR[extname(a.path)] };
    });
  },
};

/** Arma el archivo. Devuelve { texto, fuentes: [ruta relativa al repo] }. */
export async function armar() {
  const esbuild = await import(pathToFileURL(join(AQUI, 'node_modules', 'esbuild', 'lib', 'main.js')).href).then(m => m.default || m)
    .catch(() => { throw new Error('Falta esbuild: corre «npm ci» en ' + relative(process.cwd(), AQUI) + ' (la versión está fijada en package-lock.json).'); });
  const r = await esbuild.build({
    absWorkingDir: RAIZ, entryPoints: [ENTRADA], bundle: true, write: false, metafile: true, format: 'esm', platform: 'neutral',
    target: 'es2022', external: ['npm:*', 'node:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent', plugins: [lectura],
  });
  const fuentes = Object.keys(r.metafile.inputs).map(p => p.split(sep).join('/')).sort();
  const lineas = fuentes.map(f => '//   ' + huella(readFileSync(join(RAIZ, f), 'utf8')) + '  ' + f);
  const cabecera = [
    '// @ts-nocheck',
    '// ============================================================================',
    '// LA FUNCIÓN `agente` EN UN SOLO ARCHIVO, para pegarla entera en el editor del panel de Supabase.',
    '// GENERADO por supabase/functions/agente/desplegar/armar.mjs con esbuild ' + esbuild.version + '. NO SE EDITA A MANO:',
    '// se cambian las fuentes y se vuelve a armar (node supabase/functions/agente/desplegar/armar.mjs).',
    '// Cómo se despliega: docs/AGENTE-VENTAS.md, «Para publicarlo». Lee IA_KEYS y, si existen, AGENTE_CUENTA_SIN_FACTURA, AGENTE_CUENTA_CON_FACTURA y AGENTE_EMPRESA.',
    '// Fuentes (huella sha256 de 16 caracteres, con saltos LF); pruebas/agente-logica.mjs falla si una cambió:',
    ...lineas,
    '// ============================================================================',
    '',
  ].join('\n');
  return { texto: cabecera + lf(r.outputFiles[0].text), fuentes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { texto, fuentes } = await armar();
    if (process.argv.includes('--comprobar')) {
      const actual = existsSync(SALIDA) ? lf(readFileSync(SALIDA, 'utf8')) : '';
      if (actual === texto) { console.log('desplegar/index.ts está al día (' + fuentes.length + ' fuentes).'); process.exit(0); }
      console.error('desplegar/index.ts NO es el que sale de las fuentes de hoy: vuelve a armarlo.'); process.exit(1);
    }
    await writeFile(SALIDA, texto);
    console.log('Listo: ' + relative(RAIZ, SALIDA).split(sep).join('/') + ' (' + Math.round(Buffer.byteLength(texto) / 1024) + ' KB, ' + fuentes.length + ' fuentes).');
  } catch (e) { console.error(e.message || e); process.exit(1); }
}
