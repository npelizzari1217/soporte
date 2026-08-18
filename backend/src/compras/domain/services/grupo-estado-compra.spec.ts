/**
 * WU-25 [UNIT] — `derivarGrupoEstadoCompra` (sdd/compras-orden-filtro-estado).
 *
 * Los tres grupos del listado (`ACTIVAS`/`COMPLETADAS`/`CANCELADAS`) son
 * mutuamente EXCLUYENTES y EXHAUSTIVOS. Este spec lo demuestra de dos formas
 * complementarias:
 *
 * 1. Un caso REPRESENTATIVO por rama de la tabla de verdad (T1-T5 + Regla 0),
 *    cruzado únicamente con las variantes de entrega que cambian el
 *    resultado — NO el producto cartesiano (política de testing del repo:
 *    alto valor, cero combinatoria).
 * 2. Un oráculo INDEPENDIENTE escrito desde los conteos `(n, nP, nA, nR)` y
 *    la vista de entrega, sin importar la implementación, aplicado sobre un
 *    barrido acotado de conteos — ahí se verifica que cada compra cae en
 *    EXACTAMENTE un grupo y que ese grupo pertenece a `GRUPOS_ESTADO_COMPRA`.
 *
 * CAMBIO DE COMPORTAMIENTO DELIBERADO frente al predicado `soloEnCurso`
 * anterior: una compra con TODOS sus ítems rechazados (T5) caía dentro de
 * "en curso" por el término `∄ ítem APROBADO`. Con los grupos nuevos cae en
 * `CANCELADAS`, no en `ACTIVAS` — no queda nada por comprar ni por entregar.
 */
import {
  CompraParaDerivacion,
  derivarGrupoEstadoCompra,
  GRUPOS_ESTADO_COMPRA,
  GrupoEstadoCompra,
  ItemParaDerivacion,
  ORDEN_GRUPO_ESTADO_COMPRA,
} from './estado-compra';

function itemPendiente(): ItemParaDerivacion {
  return { estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false };
}

function itemRechazado(): ItemParaDerivacion {
  return { estadoAprobacion: 'RECHAZADO', comprado: false, entregado: false };
}

function itemAprobado(entregado: boolean): ItemParaDerivacion {
  return { estadoAprobacion: 'APROBADO', comprado: entregado, entregado };
}

function compra(items: ItemParaDerivacion[], cancelada = false): CompraParaDerivacion {
  return { cancelada, items };
}

// ---------------------------------------------------------------------------
// Oráculo INDEPENDIENTE — escrito desde la definición canónica de los grupos,
// en términos de conteos, sin llamar ni importar la implementación.
// ---------------------------------------------------------------------------

interface ConteosCompra {
  readonly cancelada: boolean;
  readonly nP: number;
  readonly nA: number;
  readonly nR: number;
  /** Cantidad de ítems APROBADOS que todavía NO están entregados (`nA` como cota superior). */
  readonly nAprobadosNoEntregados: number;
}

/**
 * G3 (`CANCELADAS`) = `cancelada ∨ (n>0 ∧ nP=0 ∧ nA=0 ∧ nR>=1)`.
 * G1 (`ACTIVAS`)    = `¬G3 ∧ (nP>=1 ∨ n=0 ∨ ∃ aprobado no entregado)`.
 * G2 (`COMPLETADAS`)= el resto.
 */
function oraculoGrupo(c: ConteosCompra): GrupoEstadoCompra {
  const n = c.nP + c.nA + c.nR;

  if (c.cancelada || (n > 0 && c.nP === 0 && c.nA === 0 && c.nR >= 1)) {
    return 'CANCELADAS';
  }
  if (c.nP >= 1 || n === 0 || c.nAprobadosNoEntregados >= 1) {
    return 'ACTIVAS';
  }
  return 'COMPLETADAS';
}

function armarDesdeConteos(c: ConteosCompra): CompraParaDerivacion {
  const items: ItemParaDerivacion[] = [
    ...Array.from({ length: c.nP }, itemPendiente),
    ...Array.from({ length: c.nR }, itemRechazado),
    ...Array.from({ length: c.nA }, (_unused, indice) =>
      itemAprobado(indice >= c.nAprobadosNoEntregados),
    ),
  ];
  return compra(items, c.cancelada);
}

describe('derivarGrupoEstadoCompra — un caso representativo por rama (WU-25)', () => {
  interface Caso {
    readonly nombre: string;
    readonly compra: CompraParaDerivacion;
    readonly esperado: GrupoEstadoCompra;
  }

  const casos: readonly Caso[] = [
    {
      nombre: 'Regla 0 — cancelada con todos sus ítems aprobados y entregados',
      compra: compra([itemAprobado(true)], true),
      esperado: 'CANCELADAS',
    },
    {
      nombre: 'Regla 0 — cancelada sin ítems',
      compra: compra([], true),
      esperado: 'CANCELADAS',
    },
    {
      nombre: 'T1 — sin ítems (n=0): todavía hay que cargarlos',
      compra: compra([]),
      esperado: 'ACTIVAS',
    },
    {
      nombre: 'T2 — hay un PENDIENTE aunque el aprobado ya esté entregado',
      compra: compra([itemPendiente(), itemAprobado(true)]),
      esperado: 'ACTIVAS',
    },
    {
      nombre: 'T3 — APROBADO con todos los aprobados entregados',
      compra: compra([itemAprobado(true), itemAprobado(true)]),
      esperado: 'COMPLETADAS',
    },
    {
      nombre: 'T3 — APROBADO con un aprobado sin entregar (cuantificador universal)',
      compra: compra([itemAprobado(true), itemAprobado(false)]),
      esperado: 'ACTIVAS',
    },
    {
      nombre: 'T4 — APROBADO_PARCIALMENTE con el aprobado entregado',
      compra: compra([itemAprobado(true), itemRechazado()]),
      esperado: 'COMPLETADAS',
    },
    {
      nombre: 'T4 — APROBADO_PARCIALMENTE con el aprobado sin entregar',
      compra: compra([itemAprobado(false), itemRechazado()]),
      esperado: 'ACTIVAS',
    },
    {
      nombre: 'T5 — todos RECHAZADOS: cierre negativo, NO queda activa',
      compra: compra([itemRechazado(), itemRechazado()]),
      esperado: 'CANCELADAS',
    },
  ];

  it.each(casos)('$nombre -> $esperado', ({ compra: entrada, esperado }) => {
    expect(derivarGrupoEstadoCompra(entrada)).toBe(esperado);
  });
});

describe('derivarGrupoEstadoCompra — exclusividad y exhaustividad (WU-25)', () => {
  /**
   * Barrido acotado de conteos: 0..2 por estado de aprobación, con y sin
   * cancelación, y con 0..nA aprobados sin entregar. Es un barrido de
   * CONTEOS (no de combinaciones de ítems distinguibles), así que crece
   * lineal y no explota — la matriz completa de ítems ya la cubre
   * `estado-compra.spec.ts`.
   */
  function barrido(): ConteosCompra[] {
    const filas: ConteosCompra[] = [];
    for (const cancelada of [false, true]) {
      for (let nP = 0; nP <= 2; nP += 1) {
        for (let nA = 0; nA <= 2; nA += 1) {
          for (let nR = 0; nR <= 2; nR += 1) {
            for (let noEntregados = 0; noEntregados <= nA; noEntregados += 1) {
              filas.push({ cancelada, nP, nA, nR, nAprobadosNoEntregados: noEntregados });
            }
          }
        }
      }
    }
    return filas;
  }

  it('toda compra cae en EXACTAMENTE un grupo, y ese grupo es uno de los tres declarados', () => {
    const gruposDeclarados = new Set<string>(GRUPOS_ESTADO_COMPRA);
    const fueraDeCatalogo: string[] = [];

    for (const conteos of barrido()) {
      const grupo = derivarGrupoEstadoCompra(armarDesdeConteos(conteos));
      if (!gruposDeclarados.has(grupo)) {
        fueraDeCatalogo.push(`${JSON.stringify(conteos)} -> ${grupo}`);
      }
    }

    // Que la función devuelva UN valor del catálogo ya es exclusividad
    // (no puede pertenecer a dos grupos) y exhaustividad (nunca devuelve
    // `undefined` ni cae fuera de la enumeración) sobre todo el barrido.
    expect(fueraDeCatalogo).toEqual([]);
    expect(barrido().length).toBeGreaterThan(0);
  });

  it('coincide con el oráculo independiente en TODO el barrido de conteos', () => {
    const divergencias: string[] = [];

    for (const conteos of barrido()) {
      const obtenido = derivarGrupoEstadoCompra(armarDesdeConteos(conteos));
      const esperado = oraculoGrupo(conteos);
      if (obtenido !== esperado) {
        divergencias.push(`${JSON.stringify(conteos)}: esperado ${esperado}, obtenido ${obtenido}`);
      }
    }

    expect(divergencias).toEqual([]);
  });

  it('anti verde vacuo: el barrido produce los TRES grupos, no uno solo', () => {
    const vistos = new Set(barrido().map((c) => derivarGrupoEstadoCompra(armarDesdeConteos(c))));

    expect(vistos).toEqual(new Set(GRUPOS_ESTADO_COMPRA));
  });
});

describe('ORDEN_GRUPO_ESTADO_COMPRA — el orden de los grupos (WU-25)', () => {
  it('ACTIVAS primero, COMPLETADAS al medio, CANCELADAS última', () => {
    expect(ORDEN_GRUPO_ESTADO_COMPRA.ACTIVAS).toBe(0);
    expect(ORDEN_GRUPO_ESTADO_COMPRA.COMPLETADAS).toBe(1);
    expect(ORDEN_GRUPO_ESTADO_COMPRA.CANCELADAS).toBe(2);
  });
});
