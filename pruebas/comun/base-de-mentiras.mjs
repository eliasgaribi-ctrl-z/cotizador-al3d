/* LA BASE DE MENTIRAS: un IndexedDB en memoria, con índices y cursores, para correr los módulos
   de js/datos en node. Es la misma de pruebas/puente.mjs (`idbConIndices`), aparte para que la
   prueba de dos dispositivos (pruebas/sincronizacion.mjs) le dé una a cada teléfono.
   Vive en pruebas/comun/ y no en pruebas/: correr.sh corre todo *.mjs de pruebas/, y esto no
   es una prueba. */

export function idbConIndices() {
  const almacenes = new Map();   // nombre → { keyPath, indices: Map(nombre → campo), datos: Map }
  const llave = (v, c) => (Array.isArray(c) ? c.map(k => v[k]) : v[c]);
  const valida = k => (Array.isArray(k) ? k.every(valida) : (typeof k === 'string' || (typeof k === 'number' && !Number.isNaN(k))));
  const cmp = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  class Tx extends EventTarget {
    constructor() { super(); this.error = null; this._pend = 0; this._fin = false; setTimeout(() => this._revisar(), 0); }
    _revisar() {
      if (this._pend || this._fin) return;
      this._fin = true;
      const ev = new Event('complete'); this.dispatchEvent(ev); if (this.oncomplete) this.oncomplete(ev);
    }
    _paso(p, hacer) {
      this._pend++;
      setTimeout(() => {
        p.result = hacer();
        if (p.onsuccess) p.onsuccess({ target: p });
        this._pend--; setTimeout(() => this._revisar(), 0);
      }, 0);
      return p;
    }
    objectStore(n) { return vista(this, almacenes.get(n), null); }
  }
  function vista(tx, a, indice) {
    const campo = indice ? a.indices.get(indice) : a.keyPath;
    const filas = (rango, dir) => {
      let xs = [...a.datos.values()].filter(v => valida(llave(v, campo)));
      if (rango && 'only' in rango) xs = xs.filter(v => cmp(llave(v, campo), rango.only) === 0);
      xs.sort((x, y) => cmp(llave(x, campo), llave(y, campo)) || cmp(llave(x, a.keyPath), llave(y, a.keyPath)));
      return dir === 'prev' ? xs.reverse() : xs;
    };
    return {
      get: k => tx._paso({}, () => (a.datos.has(k) ? structuredClone(a.datos.get(k)) : undefined)),
      put: v => tx._paso({}, () => { a.datos.set(llave(v, a.keyPath), structuredClone(v)); return llave(v, a.keyPath); }),
      delete: k => tx._paso({}, () => { a.datos.delete(k); }),
      clear: () => tx._paso({}, () => { a.datos.clear(); }),
      count: r => tx._paso({}, () => filas(r).length),
      index: i => vista(tx, a, i),
      openCursor(rango, dir) {
        const xs = filas(rango, dir);
        let i = 0;
        const p = {};
        const siguiente = () => tx._paso(p, () => (i < xs.length
          ? { value: structuredClone(xs[i]), continue: () => { i++; siguiente(); } } : null));
        siguiente();
        return p;
      },
    };
  }
  const db = {
    objectStoreNames: { contains: n => almacenes.has(n) },
    createObjectStore(n, { keyPath }) {
      const a = { keyPath, indices: new Map(), datos: new Map() };
      almacenes.set(n, a);
      return { indexNames: { contains: i => a.indices.has(i) }, createIndex: (i, c) => a.indices.set(i, c) };
    },
    transaction: () => new Tx(),
    close() {},
  };
  return {
    open() {
      const p = {};
      setTimeout(() => { p.result = db; if (p.onupgradeneeded) p.onupgradeneeded({ oldVersion: 0 }); p.onsuccess(); }, 0);
      return p;
    },
  };
}

