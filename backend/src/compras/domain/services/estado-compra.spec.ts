/**
 * PR-4 [UNIT] — RED→GREEN: `derivarEstadoCompra` (spec §2 tabla de verdad
 * de estado de cabecera, §3 tabla de `comprado`/`cerrado`).
 *
 * Estrategia: dos ORÁCULOS INDEPENDIENTES (`oraculoEstado` y
 * `oraculoCompradoCerrado`), escritos como cadena plana de `if`/`for` que
 * NO importan `derivarEstadoCompra` ni comparten código con ella. Se
 * generan filas exhaustivas y se comparan implementación vs. oráculo fila
 * por fila. Si ambas coinciden en todo el espacio, es mucho más difícil que
 * compartan el mismo error.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §2, §3. Ref design: ADR-C1.
 * Tarea: PR-4.
 */
import {
  CompraParaDerivacion,
  derivarEstadoCompra,
  enCentesimas,
  EstadoCompra,
  itemComprado,
  itemEntregado,
  ItemParaDerivacion,
  subtotalItemEnCentesimas,
} from './estado-compra';

// ---------------------------------------------------------------------------
// Oráculo independiente #1 — estado de cabecera (spec §2)
// ---------------------------------------------------------------------------

/**
 * Segunda expresión, independiente, de la tabla de verdad T1-T5 + Regla 0.
 * Escrita como cadena plana de `if`, una condición por fila de la spec, en
 * un orden distinto al de `derivarEstadoDesdeConteos` (que combina T1∪T2 en
 * una sola condición). NO importa ni llama a la implementación.
 */
function oraculoEstado(nP: number, nR: number, nA: number, cancelada: boolean): EstadoCompra {
  if (cancelada) {
    return 'CANCELADO'; // Regla 0: prioridad absoluta.
  }

  const n = nP + nR + nA;

  if (n === 0) {
    return 'PENDIENTE'; // T1
  }
  if (nP >= 1) {
    return 'PENDIENTE'; // T2
  }
  if (nP === 0 && nR === 0 && nA === n && nA >= 1) {
    return 'APROBADO'; // T3
  }
  if (nP === 0 && nA >= 1 && nR >= 1) {
    return 'APROBADO_PARCIALMENTE'; // T4
  }
  if (nP === 0 && nA === 0 && nR === n && nR >= 1) {
    return 'RECHAZADO'; // T5
  }

  throw new Error(`oraculoEstado: combinación no cubierta nP=${nP} nR=${nR} nA=${nA}`);
}

// ---------------------------------------------------------------------------
// Oráculo independiente #2 — comprado/cerrado (spec §3)
// ---------------------------------------------------------------------------

interface EstadoItemAprobado {
  readonly comprado: boolean;
  readonly entregado: boolean;
}

/**
 * Segunda expresión, independiente, de la tabla de `comprado`/`cerrado`
 * (spec §3). Recorre los aprobados con un `for` explícito y banderas
 * mutables — deliberadamente NO usa `.every()` para no compartir ni el
 * mecanismo con la implementación.
 */
function oraculoCompradoCerrado(
  estado: EstadoCompra,
  aprobados: readonly EstadoItemAprobado[],
): { comprado: boolean; cerrado: boolean } {
  if (estado === 'PENDIENTE' || estado === 'RECHAZADO' || estado === 'CANCELADO') {
    return { comprado: false, cerrado: false };
  }

  // estado === 'APROBADO' | 'APROBADO_PARCIALMENTE'
  if (aprobados.length === 0) {
    return { comprado: false, cerrado: false };
  }

  let todosComprados = true;
  let todosEntregados = true;
  for (let indice = 0; indice < aprobados.length; indice += 1) {
    if (!aprobados[indice].comprado) {
      todosComprados = false;
    }
    if (!aprobados[indice].entregado) {
      todosEntregados = false;
    }
  }

  return { comprado: todosComprados, cerrado: todosEntregados };
}

// ---------------------------------------------------------------------------
// Fábricas de items
// ---------------------------------------------------------------------------

function itemPendiente(): ItemParaDerivacion {
  return { estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false };
}

function itemRechazado(): ItemParaDerivacion {
  return { estadoAprobacion: 'RECHAZADO', comprado: false, entregado: false };
}

function itemAprobado(estado: EstadoItemAprobado): ItemParaDerivacion {
  return { estadoAprobacion: 'APROBADO', comprado: estado.comprado, entregado: estado.entregado };
}

function armarCompra(
  nP: number,
  nR: number,
  aprobados: readonly EstadoItemAprobado[],
  cancelada: boolean,
): CompraParaDerivacion {
  const items: ItemParaDerivacion[] = [
    ...Array.from({ length: nP }, itemPendiente),
    ...Array.from({ length: nR }, itemRechazado),
    ...aprobados.map(itemAprobado),
  ];
  return { cancelada, items };
}

// ---------------------------------------------------------------------------
// Generador #1 — tabla de estado de cabecera: n=0..4 × particiones × cancelada
// ---------------------------------------------------------------------------

interface FilaEstado {
  readonly nP: number;
  readonly nR: number;
  readonly nA: number;
  readonly cancelada: boolean;
}

function generarFilasEstado(): FilaEstado[] {
  const filas: FilaEstado[] = [];
  for (let n = 0; n <= 4; n += 1) {
    for (let nP = 0; nP <= n; nP += 1) {
      for (let nA = 0; nA <= n - nP; nA += 1) {
        const nR = n - nP - nA;
        for (const cancelada of [false, true]) {
          filas.push({ nP, nR, nA, cancelada });
        }
      }
    }
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Generador #2 — tabla comprado/cerrado: nP,nR ∈ 0..3 × estados de aprobados (nA<=2)
// ---------------------------------------------------------------------------

/** Los tres estados posibles de un ítem aprobado (FT es imposible por invariante: entregado ⇒ comprado). */
const ESTADOS_ITEM_APROBADO: readonly EstadoItemAprobado[] = [
  { comprado: false, entregado: false },
  { comprado: true, entregado: false },
  { comprado: true, entregado: true },
];

function combinacionesEstadosAprobados(nA: number): EstadoItemAprobado[][] {
  if (nA === 0) {
    return [[]];
  }
  const resto = combinacionesEstadosAprobados(nA - 1);
  const combinaciones: EstadoItemAprobado[][] = [];
  for (const estado of ESTADOS_ITEM_APROBADO) {
    for (const combinacion of resto) {
      combinaciones.push([estado, ...combinacion]);
    }
  }
  return combinaciones;
}

interface FilaCompradoCerrado {
  readonly nP: number;
  readonly nR: number;
  readonly aprobados: EstadoItemAprobado[];
}

function generarFilasCompradoCerrado(): FilaCompradoCerrado[] {
  const filas: FilaCompradoCerrado[] = [];
  for (let nP = 0; nP <= 3; nP += 1) {
    for (let nR = 0; nR <= 3; nR += 1) {
      for (let nA = 0; nA <= 2; nA += 1) {
        for (const aprobados of combinacionesEstadosAprobados(nA)) {
          filas.push({ nP, nR, aprobados });
        }
      }
    }
  }
  return filas;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('derivarEstadoCompra — estado de cabecera (spec §2)', () => {
  const filas = generarFilasEstado();

  it(`genera un espacio de prueba no trivial (${filas.length} filas)`, () => {
    expect(filas.length).toBeGreaterThan(30);
  });

  it.each(filas)('nP=$nP nR=$nR nA=$nA cancelada=$cancelada', ({ nP, nR, nA, cancelada }) => {
    const aprobados: EstadoItemAprobado[] = Array.from({ length: nA }, () => ({
      comprado: false,
      entregado: false,
    }));
    const compra = armarCompra(nP, nR, aprobados, cancelada);

    const esperado = oraculoEstado(nP, nR, nA, cancelada);
    const obtenido = derivarEstadoCompra(compra).estado;

    expect(obtenido).toBe(esperado);
  });
});

describe('derivarEstadoCompra — comprado/cerrado (spec §3)', () => {
  const filas = generarFilasCompradoCerrado();

  it(`genera un espacio de prueba no trivial (${filas.length} filas)`, () => {
    expect(filas.length).toBeGreaterThan(100);
  });

  it.each(filas)('nP=$nP nR=$nR aprobados=$aprobados.length', ({ nP, nR, aprobados }) => {
    const compra = armarCompra(nP, nR, aprobados, false);

    const estadoEsperado = oraculoEstado(nP, nR, aprobados.length, false);
    const { comprado: compradoEsperado, cerrado: cerradoEsperado } = oraculoCompradoCerrado(
      estadoEsperado,
      aprobados,
    );

    const resultado = derivarEstadoCompra(compra);

    expect(resultado.estado).toBe(estadoEsperado);
    expect(resultado.comprado).toBe(compradoEsperado);
    expect(resultado.cerrado).toBe(cerradoEsperado);
  });
});

// ---------------------------------------------------------------------------
// TRAMPA #1 — vacuidad del cuantificador universal con nA=0 (spec §3,
// "la decisión más importante de la fase"). Test nombrado aparte, NO
// escondido dentro del generador: con cero aprobados, `every` sobre el
// conjunto vacío daría `true` por vacuidad matemática — la spec decide que
// acá es `false`.
// ---------------------------------------------------------------------------

it('nA=0 => comprado=false y cerrado=false, NO true por vacuidad', () => {
  const compraRechazada = armarCompra(0, 3, [], false);
  const resultadoRechazada = derivarEstadoCompra(compraRechazada);
  expect(resultadoRechazada.estado).toBe('RECHAZADO');
  expect(resultadoRechazada.comprado).toBe(false);
  expect(resultadoRechazada.cerrado).toBe(false);

  const compraPendienteVacia = armarCompra(0, 0, [], false);
  const resultadoPendienteVacia = derivarEstadoCompra(compraPendienteVacia);
  expect(resultadoPendienteVacia.estado).toBe('PENDIENTE');
  expect(resultadoPendienteVacia.comprado).toBe(false);
  expect(resultadoPendienteVacia.cerrado).toBe(false);
});

// ---------------------------------------------------------------------------
// TRAMPA #2 — Regla 0 gana sobre cualquier combinación. Test nombrado
// aparte: sin la Regla 0, este caso (todos los ítems APROBADO, nP=0, nR=0)
// caería en T3 y daría 'APROBADO'. La cancelación tiene prioridad absoluta.
// ---------------------------------------------------------------------------

it('Regla 0 gana sobre cualquier combinación', () => {
  const todosAprobados: EstadoItemAprobado[] = [
    { comprado: true, entregado: true },
    { comprado: true, entregado: true },
    { comprado: true, entregado: true },
  ];
  const compraCanceladaConTodoAprobado = armarCompra(0, 0, todosAprobados, true);

  // Sin Regla 0, T3 (nP=0, nR=0, nA=n>=1) daría 'APROBADO' — la cancelación
  // debe ganarle a esa lectura.
  const sinRegla0 = oraculoEstado(0, 0, 3, false);
  expect(sinRegla0).toBe('APROBADO');

  const resultado = derivarEstadoCompra(compraCanceladaConTodoAprobado);
  expect(resultado.estado).toBe('CANCELADO');
  expect(resultado.comprado).toBe(false);
  expect(resultado.cerrado).toBe(false);
});

// ---------------------------------------------------------------------------
// PR-7 — `enCentesimas` / `itemComprado` / `itemEntregado` (ADR-C3).
// ---------------------------------------------------------------------------

describe('enCentesimas — ADR-C3', () => {
  it.each([
    [0.3, 30],
    [0.1, 10],
    [150000, 15000000],
    [0, 0],
  ])('redondea %s a %s centésimas', (n, esperado) => {
    expect(enCentesimas(n)).toBe(esperado);
  });

  it('LA TRAMPA DEL FLOAT: enCentesimas(0.1+0.2) === enCentesimas(0.3) (30 === 30), a diferencia de la comparación directa', () => {
    expect(0.1 + 0.2 === 0.3).toBe(false); // el problema que motiva ADR-C3
    expect(enCentesimas(0.1 + 0.2)).toBe(enCentesimas(0.3));
  });

  it('caso de UNDERSHOOT: enCentesimas(0.7-0.6) === enCentesimas(0.1) (10 === 10), pese a que 0.7-0.6 < 0.1 en float directo', () => {
    expect(0.7 - 0.6 < 0.1).toBe(true); // el float directo se queda corto
    expect(enCentesimas(0.7 - 0.6)).toBe(enCentesimas(0.1));
  });
});

describe('itemComprado / itemEntregado — ADR-C3', () => {
  it.each([
    [
      'cantidadRecibida < cantidad, sin cierre',
      { cantidad: 10, cantidadRecibida: 5, cerradoConFaltante: false },
      false,
    ],
    [
      'cantidadRecibida === cantidad',
      { cantidad: 10, cantidadRecibida: 10, cerradoConFaltante: false },
      true,
    ],
    [
      'cantidadRecibida > cantidad',
      { cantidad: 10, cantidadRecibida: 12, cerradoConFaltante: false },
      true,
    ],
    [
      'cerradoConFaltante=true con cantidadRecibida < cantidad (S22, la cláusula OR)',
      { cantidad: 10, cantidadRecibida: 5, cerradoConFaltante: true },
      true,
    ],
    [
      'LA TRAMPA DEL FLOAT: cantidad=0.1, cantidadRecibida=0.7-0.6 (undershoot en float directo)',
      { cantidad: 0.1, cantidadRecibida: 0.7 - 0.6, cerradoConFaltante: false },
      true,
    ],
  ])('itemComprado: %s => %s', (_desc, item, esperado) => {
    expect(itemComprado(item)).toBe(esperado);
  });

  it.each([
    [
      'cantidadEntregada < cantidad, sin cierre',
      { cantidad: 10, cantidadEntregada: 5, cerradoConFaltante: false },
      false,
    ],
    [
      'cantidadEntregada === cantidad',
      { cantidad: 10, cantidadEntregada: 10, cerradoConFaltante: false },
      true,
    ],
    [
      'cerradoConFaltante=true con cantidadEntregada < cantidad (S22, la cláusula OR)',
      { cantidad: 10, cantidadEntregada: 5, cerradoConFaltante: true },
      true,
    ],
  ])('itemEntregado: %s => %s', (_desc, item, esperado) => {
    expect(itemEntregado(item)).toBe(esperado);
  });
});

describe('subtotalItemEnCentesimas — WU-20 (compras-tres-etapas-y-sectores R6, ADR-T12)', () => {
  it('monto=150000.50, cantidad=3 => 45000150 centésimas (450001.50 / 100)', () => {
    expect(subtotalItemEnCentesimas(150000.5, 3)).toBe(45000150);
  });

  it('aritmética en centésimas evita el error de sumar en float directo (0.1+0.1+0.1 !== 0.3)', () => {
    // Documenta la trampa que la función existe para evitar en el caller
    // (CompraEntity.totalesPorMoneda acumula subtotales en centésimas).
    expect(0.1 + 0.1 + 0.1).not.toBe(0.3);
    expect(
      subtotalItemEnCentesimas(0.1, 1) +
        subtotalItemEnCentesimas(0.1, 1) +
        subtotalItemEnCentesimas(0.1, 1),
    ).toBe(30);
  });

  it('monto=0 (borde válido, CHECK monto >= 0) => subtotal 0', () => {
    expect(subtotalItemEnCentesimas(0, 5)).toBe(0);
  });
});
