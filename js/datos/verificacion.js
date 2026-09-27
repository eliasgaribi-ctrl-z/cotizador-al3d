/* ============================================================================
   LO QUE SE TECLEA DESDE EL PAPEL — folio y código de verificación, limpios.

   verificar.html tiene dos caminos: el QR, que trae folio y código exactos en la liga, y
   «Verificar a mano», donde alguien copia lo que ve en el PDF. El segundo es el que fallaba:
   el papel traía «COT-0042» y el código, la hoja exigía «COT-0042@K7QM», y una cotización
   buena contestaba «No auténtica». Desde el 26 de septiembre de 2026 el PDF imprime el folio
   completo junto al QR y la hoja acepta también el corto; lo que queda aquí es que lo que la
   persona escribió llegue como lo escribió el cotizador.

   Sin DOM ni imports: lo prueba pruebas/verificacion.mjs en node.
   ============================================================================ */

/* El folio: sin espacios, en mayúsculas y con guiones de verdad. El cotizador solo emite
   mayúsculas (COT- y el aparato, del alfabeto sin 0/O ni 1/I de prefs.dispositivo()), así que
   subir las minúsculas no puede volver bueno un folio que no lo es. El guion largo sale del
   autocorrector del teléfono; «COT0042» es quien se comió el guion.

   Lo que NO se toca es la parte del aparato: ahí la O y la I no existen, pero un 0 o un 1
   convertidos a letra tampoco serían del alfabeto, así que cualquier conversión adivinaría. */
export function normalizarFolio(f) {
  let s = String(f || '').replace(/\s+/g, '').replace(/[‐-―−]/g, '-').toUpperCase();
  const [corto, ...resto] = s.split('@');
  const m = /^([A-Z]+)(\d+)$/.exec(corto);
  const c = m ? m[1] + '-' + m[2] : corto;
  return resto.length ? c + '@' + resto.join('@') : c;
}

/* El código: doce hexadecimales. O→0 e I/L→1 primero —en la letra de imprenta son el mismo
   dibujo y el hexadecimal no tiene esas letras—, después fuera todo lo demás. Es la misma
   regla que normalizarCodigo() en puente/hoja-apps-script.gs; si cambia una, cambia la otra. */
export function normalizarCodigo(c) {
  return String(c || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')
    .replace(/[^0-9A-F]/g, '').slice(0, 12);
}

/* Como va impreso: A1B2-C3D4-E5F6. Si no llega a doce se deja como está, para que quien lo
   teclea vea qué le falta en vez de un guion colgando. */
export function codigoLegible(c) {
  const n = normalizarCodigo(c);
  return n.length === 12 ? n.slice(0, 4) + '-' + n.slice(4, 8) + '-' + n.slice(8) : n;
}

/* ¿Qué le falta a lo que se tecleó? null si está listo para preguntar. Se dice ANTES de
   preguntar porque la hoja, a propósito, contesta lo mismo a todo lo que no cuadra
   («no auténtica»): no puede decir «te faltó un carácter» sin ayudar a quien adivina. */
export function faltaParaVerificar(folio, codigo) {
  const f = normalizarFolio(folio), c = normalizarCodigo(codigo);
  if (!f) return 'Escribe el folio: está arriba a la derecha de la cotización y junto al QR.';
  if (!/^[A-Z0-9-]{1,24}(@[A-Z0-9_-]{1,24})?$/.test(f)) return 'El folio se escribe como viene en el papel, por ejemplo COT-0042@K7QM.';
  if (!c) return 'Escribe el código de verificación: son doce letras y números junto al QR.';
  if (c.length < 12) return 'Al código le faltan ' + (12 - c.length) + ' de sus doce caracteres.';
  return null;
}

/* ¿Es el folio corto, sin la parte del aparato? Sirve para explicar un «no auténtica» que
   puede ser de una hoja que todavía no acepta el corto. */
export const esFolioCorto = f => !!f && normalizarFolio(f).indexOf('@') < 0;
