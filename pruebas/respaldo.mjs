/* El respaldo completo: un archivo con las dos mitades, y las dos listas de claves iguales.

   La plataforma arma la mitad del cotizador LEYENDO su almacenamiento con una lista de claves
   propia, porque cotizador.html es un archivo sin módulos y no se puede importar. Dos listas
   de lo mismo es exactamente la duplicación que se separa sin que nadie lo note: alguien
   añade una clave al cotizador, el respaldo completo deja de llevarla, y se descubre al
   restaurar en el teléfono nuevo, cuando ya no hay de dónde sacarla. Esta prueba las
   compara. Y comprueba que lo que arma la plataforma tenga la forma que `restaurarDesde()`
   del cotizador valida.

   Se corre con pruebas/correr.sh, como todas.
*/
import { readFileSync } from 'fs';
import { RESPALDO_KEYS, armarRespaldoCotizador } from '../js/datos/cotizador.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

/* La lista vive en js/cotizador/historial.js; las constantes que nombra pueden estar en cualquiera
   de los once guiones, así que se leen todos, en el orden en que los carga cotizador.html. */
const html = ['catalogo','nucleo','partidas','proceso','ia','entrega','historial','escalador','venta','vectorizador','arranque']
  .map(n => readFileSync(new URL('../js/cotizador/' + n + '.js', import.meta.url), 'utf8')).join('\n');

console.log('\nLAS DOS LISTAS DE CLAVES');
/* La lista del cotizador nombra constantes (CANVA_KEY, PREF_RV_PCT…). Se resuelven buscando
   su `const X='…'` en el mismo archivo, que es lo que haría alguien leyéndolo. */
const lista = (/const RESPALDO_KEYS=\[([\s\S]*?)\];/.exec(html) || [, ''])[1];
const tokens = lista.split(',').map(t => t.trim()).filter(Boolean);
const constantes = {};
for (const m of html.matchAll(/\b([A-Z_]+)=\s*'([a-z0-9_]+)'/g)) if (!(m[1] in constantes)) constantes[m[1]] = m[2];
const delCotizador = tokens.map(t => {
  const lit = /^'([^']+)'$/.exec(t);
  if (lit) return lit[1];
  return constantes[t] || ('<<' + t + ' sin resolver>>');
});
eq('la lista del cotizador se pudo leer entera', delCotizador.filter(k => k.startsWith('<<')), []);
eq('tiene 16 claves', delCotizador.length, 16);
/* `al3d_fold_proy` se escribía y nadie la leía; se quitó de la lista y del código. Si vuelve
   a aparecer en la lista, alguien la resucitó sin lector. */
eq('ya no lleva la clave muerta del plegado', delCotizador.includes('al3d_fold_proy'), false);
eq('la plataforma lleva EXACTAMENTE las mismas', [...RESPALDO_KEYS].sort(), [...delCotizador].sort());

console.log('\nLA FORMA DE LO QUE ARMA LA PLATAFORMA');
/* En node no hay localStorage: se simula uno mínimo con dos claves puestas y una ausente. */
globalThis.localStorage = {
  _d: { al3d_historial: '[{"folio":"COT-0001"}]', al3d_folio: '7' },
  getItem(k) { return k in this._d ? this._d[k] : null; },
};
const r = armarRespaldoCotizador();
eq('app es la del cotizador', r.app, 'cotizador-al3d');
eq('formato 1', r.formato, 1);
eq('trae fecha ISO', /^\d{4}-\d{2}-\d{2}T/.test(r.fecha), true);
eq('datos es un objeto de textos', Object.values(r.datos).every(v => typeof v === 'string'), true);
eq('solo las claves que existen', Object.keys(r.datos).sort(), ['al3d_folio', 'al3d_historial']);
eq('y el texto va tal cual, sin parsear', r.datos.al3d_historial, '[{"folio":"COT-0001"}]');

/* Y lo que `restaurarDesde()` exige del cotizador: que `al3d_historial` sea un arreglo y
   `al3d_q` un objeto con items. Se comprueba contra el texto del cotizador que esas dos
   validaciones siguen ahí, para que si alguien las cambia esta prueba lo diga. */
console.log('\nLO QUE EL COTIZADOR VALIDA AL RESTAURAR');
eq('acepta el respaldo completo y toma su mitad', html.includes("paquete.app==='al3d-completo'&&paquete.cotizador"), true);
eq('exige que el historial sea un arreglo', html.includes("!Array.isArray(JSON.parse(D['al3d_historial']))"), true);
eq('ofrece la restauración que deja la plataforma al arrancar', /ofrecerRestauracionPendiente\(\);\s*\n\}/.test(html), true);
eq('y la lee de la clave que la plataforma escribe', html.includes("const RESTAURAR_PF_KEY='al3d_pf_restaurar'"), true);

/* ---------------------------------------------------------------------------
   LA BASE QUE RECIBE EL RESPALDO — js/datos/db.js contra una IndexedDB de mentira.

   Node no trae IndexedDB, así que se arma una de juguete con lo único que estas
   comprobaciones necesitan, y con el comportamiento que costó: en Chrome la cuota llena
   llega como un `abort` de la transacción DESPUÉS de que el `put` ya dijo `onsuccess`
   (pruebas hechas con Storage.overrideQuotaForOrigin). La transacción de aquí escribe sobre
   una copia y solo la vuelve verdad al cerrar; si al cerrar no cabe, la tira y aborta.

   Y dos reglas de la especificación que la primera versión no tenía, y sin las que esta
   prueba veía fallos que un navegador no tiene nunca:
     · una transacción de solo lectura NO devuelve nada al cerrar. Devolvía su copia, y una
       lectura que terminaba tarde deshacía lo que otra transacción acababa de guardar o de
       borrar;
     · las que tocan el mismo almacén van EN FILA, en el orden en que se crearon: una de
       escritura espera a todas las anteriores que lo toquen, y una de lectura, a las de
       escritura anteriores. Sin fila, dos `poner` a la vez partían de la misma copia y el
       segundo se llevaba por delante al primero.
   Por eso la copia se toma al ARRANCAR y no al crearse: es lo que hace que quien esperó en la
   fila vea lo que dejó el de delante.
   --------------------------------------------------------------------------- */
function idbDeMentira() {
  const almacenes = new Map();          // nombre → { keyPath, datos: Map }
  const cuota = { bytes: Infinity };
  /* El otro aborto después del `onsuccess`, el que la cuota no sabe fingir: un borrado encoge
     la base y nunca se pasa del tope. Con `falla.proxima` puesto, la próxima transacción de
     escritura que cierre aborta con ese error, con todas sus peticiones ya contestadas bien
     —como cuando el disco no confirma—. Se gasta en esa y vuelve a null. */
  const falla = { proxima: null };
  const vivas = [];                     // las que no han terminado, en el orden en que se crearon
  const tam = () => { let n = 0; for (const a of almacenes.values()) for (const v of a.datos.values()) n += JSON.stringify(v).length; return n; };
  const choca = (antes, t) => (antes._modo === 'readwrite' || t._modo === 'readwrite') &&
    antes._nombres.some(n => t._nombres.includes(n));
  const arrancarLasQuePuedan = () => vivas.forEach((t, i) => {
    if (!t._copia && !vivas.slice(0, i).some(antes => choca(antes, t))) t._arrancar();
  });
  class Peticion { constructor() { this.result = undefined; this.error = null; } }
  class Transaccion extends EventTarget {
    constructor(nombres, modo) {
      super();
      this.error = null; this._pend = 0; this._fin = false; this._modo = modo;
      this._nombres = nombres; this._copia = null; this._cola = [];
      vivas.push(this);
      arrancarLasQuePuedan();
    }
    _arrancar() {
      this._copia = new Map(this._nombres.map(n => [n, new Map(almacenes.get(n).datos)]));
      for (const correr of this._cola.splice(0)) correr();
      this._revisar();
    }
    _disparar(tipo) { const ev = new Event(tipo); this.dispatchEvent(ev); if (this['on' + tipo]) this['on' + tipo](ev); }
    _revisar() { setTimeout(() => { if (this._copia && !this._pend && !this._fin) this._cerrar(); }, 0); }
    _cerrar() {
      this._fin = true;
      let err = null;
      if (this._modo === 'readwrite') {
        const antes = new Map([...this._copia.keys()].map(n => [n, almacenes.get(n).datos]));
        for (const [n, d] of this._copia) almacenes.get(n).datos = d;
        err = falla.proxima || (tam() > cuota.bytes ? { name: 'QuotaExceededError', message: 'cuota' } : null);
        falla.proxima = null;
        if (err) for (const [n, d] of antes) almacenes.get(n).datos = d;
      }
      vivas.splice(vivas.indexOf(this), 1);
      if (err) { this.error = err; this._disparar('abort'); }
      else this._disparar('complete');
      arrancarLasQuePuedan();
    }
    /* Una petición hecha mientras la transacción espera su turno se queda en la cola y corre al
       arrancar, en el mismo orden: así lo hace el navegador, y `pedir()` de db.js no se entera. */
    _pedir(hacer) {
      const p = new Peticion();
      this._pend++;
      const correr = () => setTimeout(() => {
        p.result = hacer();
        if (p.onsuccess) p.onsuccess({ target: p });
        this._pend--; this._revisar();
      }, 0);
      if (this._copia) correr(); else this._cola.push(correr);
      return p;
    }
    objectStore(n) {
      const clave = almacenes.get(n).keyPath;
      const d = () => this._copia.get(n);   // hasta que arranca no hay copia: se busca al correr
      return {
        get: k => this._pedir(() => d().has(k) ? structuredClone(d().get(k)) : undefined),
        put: v => this._pedir(() => { d().set(v[clave], structuredClone(v)); return v[clave]; }),
        delete: k => this._pedir(() => { d().delete(k); }),
        clear: () => this._pedir(() => { d().clear(); }),
      };
    }
  }
  const db = {
    objectStoreNames: { contains: n => almacenes.has(n) },
    createObjectStore(n, { keyPath }) {
      almacenes.set(n, { keyPath, datos: new Map() });
      const ind = new Set();
      return { indexNames: { contains: i => ind.has(i) }, createIndex: i => ind.add(i) };
    },
    transaction: (nombres, modo) => new Transaccion([].concat(nombres), modo),
  };
  return {
    cuota, falla,
    open() {
      const p = new Peticion();
      setTimeout(() => { p.result = db; if (p.onupgradeneeded) p.onupgradeneeded({ oldVersion: 0 }); p.onsuccess(); }, 0);
      return p;
    },
  };
}

globalThis.window = globalThis;
const IDB = idbDeMentira();
globalThis.indexedDB = IDB;
const DB = await import('../js/datos/db.js');
eq('la base de mentira abre', await DB.abrir(), true);

console.log('\nLO QUE `poner` DICE QUE GUARDÓ, LO GUARDÓ');
/* El incidente: cuatro fotos de 900 KB, las cuatro con «ok», una sola escrita, y el
   SIN_ESPACIO de la cabecera sin salir nunca. Aquí la cuota son 2,000 caracteres. */
IDB.cuota.bytes = 2000;
const chico = await DB.poner('blobs', { id: 'g1', texto: 'x'.repeat(500) });
eq('lo que cabe se guarda y dice que sí', [chico.ok, !!(await DB.obtener('blobs', 'g1'))], [true, true]);
const grande = await DB.poner('blobs', { id: 'g2', texto: 'x'.repeat(5000) });
eq('lo que no cabe dice SIN_ESPACIO, aunque el put haya contestado bien', grande.ok ? 'ok' : grande.codigo, 'SIN_ESPACIO');
eq('y de verdad no quedó escrito', await DB.obtener('blobs', 'g2'), null);
IDB.cuota.bytes = Infinity;

console.log('\nLO QUE LA BASE DESHIZO AL ABORTAR, NO SE DA POR HECHO');
/* La petición contesta `onsuccess` y DESPUÉS la transacción aborta: el caso para el que existe
   `confirmada()`. Aquí decía «borrar espera a la transacción y borra» con un borrado que
   terminaba bien, y eso no lo probaba: con la fila de la especificación, un `borrar` que
   contestara en el `onsuccess` del delete también «borra», porque la lectura de después espera
   su turno y ya no ve el registro. Lo único que separa esperar de no esperar es el aborto. */
const abortada = { name: 'UnknownError', message: 'el disco no confirmó' };
const texto1 = 'x'.repeat(500);          // el g1 que dejó escrito «lo que cabe se guarda»
IDB.falla.proxima = abortada;
const noBorro = await DB.borrar('blobs', 'g1');
eq('si aborta después del onsuccess, borrar dice que no', noBorro.ok ? 'ok' : noBorro.codigo, 'DESCONOCIDO');
eq('y el registro sigue ahí, como estaba', (await DB.obtener('blobs', 'g1') || {}).texto, texto1);
IDB.falla.proxima = abortada;
const noVacio = await DB.vaciar('blobs');
eq('vaciar, igual: dice que no y no vació', [noVacio.ok, !!(await DB.obtener('blobs', 'g1'))], [false, true]);
IDB.falla.proxima = abortada;
const noPuso = await DB.poner('blobs', { id: 'g1', texto: 'nuevo' });
eq('y poner encima de uno que ya estaba dice que no y deja el viejo',
  [noPuso.ok, (await DB.obtener('blobs', 'g1') || {}).texto], [false, texto1]);
eq('borrar, cuando la transacción sí termina, dice que sí y borra',
  [(await DB.borrar('blobs', 'g1')).ok, await DB.obtener('blobs', 'g1')], [true, null]);

console.log('\nA LA VEZ, COMO EN UN NAVEGADOR');
/* Estas dos vigilan a la de mentira, no a db.js: que haga la fila. Con la primera versión salían
   mal las dos, y en cualquier navegador salen bien. Que la lectura no escriba al cerrar no se
   ve desde aquí mientras haya fila —nadie escribe mientras una lectura está abierta—; sin fila
   era lo que deshacía lo guardado, y se queda para que las dos cosas no dependan una de otra. */
const [pa, pb] = await Promise.all([DB.poner('blobs', { id: 'a1' }), DB.poner('blobs', { id: 'b1' })]);
eq('dos poner a la vez guardan los dos',
  [pa.ok, pb.ok, !!(await DB.obtener('blobs', 'a1')), !!(await DB.obtener('blobs', 'b1'))], [true, true, true, true]);
/* Con su propio registro, puesto y comprobado antes: si dependiera del de arriba, el día que
   aquél no se guardara esta saldría en verde sobre nada que borrar. */
const habia = (await DB.poner('blobs', { id: 'c1' })).ok && !!(await DB.obtener('blobs', 'c1'));
const [, visto] = await Promise.all([DB.borrar('blobs', 'c1'), DB.obtener('blobs', 'c1')]);
eq('leer detrás de un borrado espera su turno y ya no ve lo borrado',
  [habia, visto, await DB.obtener('blobs', 'c1')], [true, null, null]);

console.log('\nRESTAURAR EL VIEJO Y LUEGO EL BUENO');
/* El incidente: alguien se equivoca de archivo, restaura el del día 1, se da cuenta y
   restaura el del 15. Con el sello de «ahora» puesto al primero, el segundo salía entero en
   `conservados` y el proyecto se quedaba en la etapa vieja. */
const paquete = (etapa, ts) => JSON.stringify({ app: 'plataforma-al3d', formato: 1, fecha: new Date(ts).toISOString(),
  datos: { proyectos: [{ id: 'proy-1', nombre: 'Ana - Cafe', etapa, actualizado_en: ts, creado_en: 1 }] } });
const del1 = Date.parse('2026-09-01T12:00:00Z'), del15 = Date.parse('2026-09-15T12:00:00Z');
const a = await DB.importar(paquete('ganado', del1));
eq('el viejo entra', [a.ok, a.valor && a.valor.registros], [true, 1]);
eq('y conserva la fecha en que de verdad se editó', (await DB.obtener('proyectos', 'proy-1')).actualizado_en, del1);
const b = await DB.importar(paquete('instalado', del15));
eq('el bueno entra, no se «conserva» lo viejo', [b.valor && b.valor.registros, b.valor && b.valor.conservados], [1, 0]);
eq('y el proyecto queda en la etapa del bueno', (await DB.obtener('proyectos', 'proy-1')).etapa, 'instalado');
const c = await DB.importar(paquete('ganado', del1));
eq('volver a restaurar el viejo ya no pisa al bueno', [c.valor && c.valor.conservados, (await DB.obtener('proyectos', 'proy-1')).etapa], [1, 'instalado']);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl respaldo completo cuadra de los dos lados.');
process.exit(fallos ? 1 : 0);
