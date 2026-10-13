// Los escenarios del importador (sync-e-importacion/importador.mjs): una hoja de 50 filas con los casos borde de §6.4 y una hoja con tres
// teléfonos. Aparte para que el mismo escenario sirva para generar el ensayo que se corre en el proyecto de pruebas de Supabase.
import { volcado, filaVentas, dia, respaldoTelefono, proyectoTel } from './hoja-de-mentiras.js';

export function cincuentaFilas() {
  const casos = [
    { C: 'COBRANDO', D: 'Constru BNT', F: 'Sí', G: 10000, I: 5800, L: '2026-08-01' },
    { C: 'COBRANDO', D: 'Elias BBVA', F: 'No', G: 10000, L: '2026-08-02' },
    { C: 'COBRANDO', F: 'Sí', G: 1.45, L: '2026-08-03' },
    { C: 'COBRANDO', F: 'Sí', G: 2.35, L: '2026-08-04' },
    { C: 'COBRANDO', F: 'Sí', G: 0.05, L: '2026-08-05' },
    { C: 'COBRANDO', F: 'Sí', G: -1.45, L: '2026-08-06' },
    { C: 'COBRANDO', F: 'Sí', G: 4310.34, I: 5000, L: '2026-08-07' },
    { C: 'LIQUIDADO', D: 'Constru BNT', F: 'Sí', G: 1000, I: 500, J: 100, L: '2026-07-01', N: '2026-07-20' },
    { C: 'LIQUIDADO', F: 'Sí', G: 1000, I: 1160, L: '2026-07-02' },
    { C: 'COBRANDO', F: 'Sí', G: 1000, I: 1000, J: 200, L: '2026-07-03' },
    { C: 'COBRANDO', F: 'Sí', G: 1000, I: 1160, L: '2026-07-04', abonos: ['150'] },
    { C: 'COBRANDO', D: 'Elias BBVA', F: 'Sí', G: 1000, I: 2000, L: '2026-07-05' },
    { C: 'COBRANDO', D: 'Rul HSBC', F: 'No', G: 800, L: '2026-07-06' },
    { C: 'COBRANDO', F: 'No', G: 800, L: '2026-07-07' },
    { C: 'COBRANDO', F: 'Sí', G: 0, L: '2026-07-08' },
    { C: 'COBRANDO', F: 'Sí', G: -500, L: '2026-07-09' },
    { C: 'COBRANDO', F: 'Sí', G: 100.005, I: 0.001, J: 0.002, L: '2026-07-10' },
    { C: 'COBRANDO', F: 'No', G: 10000, L: '2026-06-01', abonos: ['100.00', '200.00', '50.55', '-50'] },
    { C: 'LIQUIDADO', D: 'Moni MPago', F: 'Sí', G: 2000, I: 2320, L: '2026-06-02', N: '2026-06-14' },
    { C: 'FABRICACION', D: 'Tatis BNT', F: 'Sí', G: 3500.5, I: 1000, L: '2026-10-01', M: '2026-10-25' },
    { C: 'REPARANDO', F: 'Sí', G: 0.01, L: '2026-10-02' },
    { C: 'COBRANDO', F: 'No', G: 0.01, L: '' },
  ];
  // el resto: determinista, con centavos en 5, negativos, 0-3 decimales, cuentas y estatus de todo tipo
  const cuentas = ['', 'Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT'];
  const estatus = ['COBRANDO', 'LIQUIDADO', 'FABRICACION', 'REPARANDO'];
  for (let k = 0; casos.length < 50; k++) {
    const g = ((k * 7919) % 90000) / [1, 10, 100, 1000][k % 4] * (k % 9 === 0 ? -1 : 1) + (k % 5 === 0 ? 0.005 : 0);
    const cuenta = cuentas[k % 6];
    const iva = cuenta ? (k % 7 === 0 ? cuenta === 'Elias BBVA' : cuenta !== 'Elias BBVA') : k % 2 === 0;
    casos.push({ C: estatus[k % 4], D: cuenta, F: iva ? 'Sí' : 'No', G: Number(g.toFixed(3)), I: k % 3 ? Number(((k * 37) % 5000 / 10).toFixed(1)) : 0,
      J: k % 4 === 1 ? 12.25 : 0, L: `2026-0${1 + (k % 9)}-1${k % 10}`, N: k % 6 === 0 ? `2026-09-2${k % 10}` : '',
      abonos: k % 3 === 0 ? [`${(k % 40) + 1}.10`] : [] });
  }
  return casos.map((c, i) => {
    const folio = 'V-' + String(100 + i).padStart(3, '0');
    const celdas = { A: folio, B: `Cliente ${i} - Negocio ${i}`, C: c.C, D: c.D || '', F: c.F, G: c.G, I: c.I ?? '', J: c.J ?? '',
      L: dia(c.L), M: dia(c.M), N: dia(c.N), Z: c.C === 'FABRICACION' ? 'En diseño' : '' };
    return { folio, abonos: c.abonos || [], fila: filaVentas({ celdas, abonos: c.abonos || [] }) };
  });
}

export function escenarioRico() {
  const ventas = [
    filaVentas({ celdas: { A: 'V-010', B: 'Ana - Tacos Ana (Letras 3D con iluminacion)', C: 'COBRANDO', D: 'Constru BNT', E: 'Letras 3D con iluminacion', F: 'Sí',
      G: 12500, I: 6000, L: dia('2026-09-01'), M: dia('2026-10-20'), Y: 'COT-0001@K7QM', Z: 'Cortado', AB: '20.6597,-103.3496', AE: '33 1234 5678',
      AF: 'Instalación', AH: '2 semanas', AI: JSON.stringify({ 'Etapa de obra': 3000, 'Fecha instalacion': 100 }) }, abonos: ['250'] }),
    filaVentas({ celdas: { A: 'V-011', B: 'Beto - Taller Beto', C: 'FABRICACION', F: 'Sí', G: 800, L: dia('2026-10-01'), Z: 'Cortado', AG: 'nota de la hoja',
      AI: JSON.stringify({ 'Etapa de obra': 4000 }) } }),
    filaVentas({ celdas: { A: 'V-012', B: 'Caro - Café Caro', C: 'LIQUIDADO', D: 'Elias BBVA', F: 'No', G: 500, I: 500, L: dia('2025-03-01'), M: dia('2025-03-10'), N: dia('2025-03-15') } }),
    filaVentas({ celdas: { A: 'V-013', B: 'Dani - Dental Dani', C: 'COBRANDO', F: 'Sí', G: 300, L: dia('2025-04-01') } }),
  ];
  const origen = { folio: 'COT-0001', proy: 'Tacos Ana', cliente: 'Ana', precioAuth: 14500, sub: 12500, items: [{ id: 1, tipo: 'Letras', n: 8, pu: 1500, desc: 'x' }] };
  const telA = respaldoTelefono({
    proyectos: [proyectoTel({ id: 'proy-a1', dispositivo: 'K7QM', folio_global: 'COT-0001@K7QM', folio_hoja: 'V-010', folio_local: 'COT-0001', nombre: 'Ana - Tacos Ana',
      etapa: 'ganado', sub: 12500, neto: 14500, precio_auth: 14500, anti_pactado: 6000, cuenta: 'Constru BNT', estatus_notion: 'COBRANDO', origen,
      sellos: { etapa: 1000, instalacion: 50 }, creado_en: 1000 })],
    instalaciones: [{ id: 'ins-a', empresa_id: 'al3d', proyecto_id: 'proy-a1', fecha: '2026-10-20', hora: null, ventana: 'manana', duracion_min: 180,
      estado: 'confirmada', movida: 1, notas: '', creado_en: 1000, actualizado_en: 1000 }],
    requerimientos: [
      { id: 'proy-a1:acr-3mm', proyecto_id: 'proy-a1', material_id: 'acr-3mm', cantidad_compra: 1, unidad_compra: 'lamina', estado: 'calculado', actualizado_en: 9000 },
      { id: 'proy-a1:vinil', proyecto_id: 'proy-a1', material_id: 'vinil', cantidad_compra: 1, unidad_compra: 'metro', estado: 'calculado', actualizado_en: 500 },
    ],
    movimientos: [
      { id: 'mov-salida:proy-a1:acr-3mm', material_id: 'acr-3mm', tipo: 'salida', cantidad: -1, unidad_compra: 'lamina', origen: 'derivado', proyecto_id: 'proy-a1',
        requerimiento_id: 'proy-a1:acr-3mm', ts: 100, usuario: 'Ana', rol: 'fabricacion', dispositivo: 'K7QM', sello: 'Ana · Fabricación (K7QM)' },
      { id: 'mov-e1', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'compra', ts: 50, costo_total: 4250 },
    ],
    historial: [{ folio: 'COT-0001', disp: 'K7QM', cliente: 'Ana', proy: 'Tacos Ana', fecha: '2026-08-30', items: [] }],
    folio: 7,
  });
  const telB = respaldoTelefono({
    proyectos: [
      proyectoTel({ id: 'proy-b1', dispositivo: 'B2B2', folio_global: 'COT-0001@K7QM', folio_hoja: 'V-010', nombre: 'Ana - Tacos Ana', etapa: 'ganado',
        sellos: { instalacion: 2500 }, creado_en: 2000 }),
      proyectoTel({ id: 'proy-hoja-V-011', dispositivo: 'hoja', de_hoja: true, folio_hoja: 'V-011', folio_local: 'V-011', nombre: 'Beto - Taller Beto', etapa: 'armado',
        sellos: { etapa: 5000 }, creado_en: 3000 }),
    ],
    instalaciones: [{ id: 'ins-b', empresa_id: 'al3d', proyecto_id: 'proy-b1', fecha: '2026-10-22', hora: '09:00', ventana: 'dia', duracion_min: 120,
      estado: 'reagendada', movida: 2, notas: 'Movida del 20 al 22', creado_en: 2000, actualizado_en: 2500 }],
    requerimientos: [
      { id: 'proy-b1:acr-3mm', proyecto_id: 'proy-b1', material_id: 'acr-3mm', cantidad_compra: 1, unidad_compra: 'lamina', estado: 'comprado', actualizado_en: 100 },
      { id: 'proy-b1:vinil', proyecto_id: 'proy-b1', material_id: 'vinil', cantidad_compra: 2, unidad_compra: 'metro', estado: 'calculado', actualizado_en: 500 },
      { id: 'proy-zzz:acr-3mm', proyecto_id: 'proy-zzz', material_id: 'acr-3mm', cantidad_compra: 1, unidad_compra: 'lamina', estado: 'calculado', actualizado_en: 1 },
    ],
    movimientos: [
      { id: 'mov-salida:proy-b1:acr-3mm', material_id: 'acr-3mm', tipo: 'salida', cantidad: -1, unidad_compra: 'lamina', origen: 'derivado', proyecto_id: 'proy-b1',
        requerimiento_id: 'proy-b1:acr-3mm', ts: 200, usuario: 'Beto', rol: 'fabricacion', dispositivo: 'B2B2' },
      { id: 'mov-e1', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'compra', ts: 50, costo_total: 4250 },
      { id: 'mov-x', material_id: 'vinil', tipo: 'salida', cantidad: -2, unidad_compra: 'metro', origen: 'manual', proyecto_id: 'proy-desconocido', ts: 300 },
    ],
  });
  // un teléfono viejo: sin proyectos y con una cotización que no dice de qué aparato es (IM-12)
  const telC = respaldoTelefono({ historial: [{ folio: 'COT-0500', cliente: 'Zoe', proy: 'Zapatería Zoe', fecha: '2026-05-01', items: [] }] });
  return { volcado: volcado({ ventas, abonos: [['V-010', '', 250, dia('2026-09-20'), 'abono', '']] }),
    telefonos: [{ etiqueta: 'telA', respaldo: telA }, { etiqueta: 'telB', respaldo: telB }, { etiqueta: 'telC', respaldo: telC }] };
}
