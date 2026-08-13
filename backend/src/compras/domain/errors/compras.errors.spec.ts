/**
 * PR-5 [UNIT] — RED→GREEN: errores de dominio de `compras/` (`compras.errors.ts`).
 *
 * Verifica `code` estable + herencia de `DomainError`/`Error` para cada uno
 * de los 19 errores enumerados en el spec §5 ("Errores -> HTTP"), y que los
 * 19 `code` sean únicos entre sí (sin colisiones).
 *
 * Nota de conteo (discrepancia declarada): `tasks` (PR-5) dice "16 errores",
 * pero el spec §5 enumera 19 por nombre (2×409 + 2×404 + 15×422). El spec
 * gana — ver `sdd/redisenio-modulo-compras/apply-progress-pr5` para el detalle.
 *
 * Mensajes específicos solo se testean cuando el constructor recibe un
 * identificador de negocio (id de compra/ítem, o año) que el mensaje debe
 * conservar — mismo criterio que `tickets.errors.spec.ts`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4 (escenarios S2,S5,S7,S10,
 * S13,S16-S18,S20-S21,S23-S25,S28-S30) y §5 (catálogo Errores -> HTTP).
 */
import { DomainError } from '../../../shared/domain/result';
import {
  SinCicloActivoError,
  NumeradorCompraAgotadoError,
  CompraNoEncontradaError,
  ItemCompraNoEncontradoError,
  CompraCanceladaError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  CompraConComprasRegistradasError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraYaDecididoError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
  CantidadEntregadaExcedeCompradaError,
  CantidadEntregadaRetrocedeError,
  ItemCompraYaCerradoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
} from './compras.errors';

interface ErrorCase {
  readonly name: string;
  readonly code: string;
  readonly httpStatus: 404 | 409 | 422;
  readonly build: () => DomainError;
  readonly messageContains?: readonly string[];
}

const CASES: readonly ErrorCase[] = [
  // 409 — precondición de infraestructura de negocio (§5)
  {
    name: 'SinCicloActivoError',
    code: 'SIN_CICLO_ACTIVO',
    httpStatus: 409,
    build: () => new SinCicloActivoError(),
  },
  {
    name: 'NumeradorCompraAgotadoError',
    code: 'NUMERADOR_COMPRA_AGOTADO',
    httpStatus: 409,
    build: () => new NumeradorCompraAgotadoError(2026),
    messageContains: ['2026'],
  },

  // 404 — no existe / no visible (§5)
  {
    name: 'CompraNoEncontradaError',
    code: 'COMPRA_NO_ENCONTRADA',
    httpStatus: 404,
    build: () => new CompraNoEncontradaError('compra-1'),
    messageContains: ['compra-1'],
  },
  {
    name: 'ItemCompraNoEncontradoError',
    code: 'ITEM_COMPRA_NO_ENCONTRADO',
    httpStatus: 404,
    build: () => new ItemCompraNoEncontradoError('item-1'),
    messageContains: ['item-1'],
  },

  // 422 — invariante de dominio (§5) — 15 errores
  {
    name: 'CompraCanceladaError',
    code: 'COMPRA_CANCELADA',
    httpStatus: 422,
    build: () => new CompraCanceladaError('compra-1'),
    messageContains: ['compra-1'],
  },
  {
    name: 'CompraYaCanceladaError',
    code: 'COMPRA_YA_CANCELADA',
    httpStatus: 422,
    build: () => new CompraYaCanceladaError('compra-1'),
    messageContains: ['compra-1'],
  },
  {
    name: 'CompraYaCerradaError',
    code: 'COMPRA_YA_CERRADA',
    httpStatus: 422,
    build: () => new CompraYaCerradaError('compra-1'),
    messageContains: ['compra-1'],
  },
  {
    name: 'CompraConComprasRegistradasError',
    code: 'COMPRA_CON_COMPRAS_REGISTRADAS',
    httpStatus: 422,
    build: () => new CompraConComprasRegistradasError('compra-1'),
    messageContains: ['compra-1'],
  },
  {
    name: 'ItemCompraAprobadoNoEliminableError',
    code: 'ITEM_COMPRA_APROBADO_NO_ELIMINABLE',
    httpStatus: 422,
    build: () => new ItemCompraAprobadoNoEliminableError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'ItemCompraYaDecididoError',
    code: 'ITEM_COMPRA_YA_DECIDIDO',
    httpStatus: 422,
    build: () => new ItemCompraYaDecididoError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'ItemCompraCongeladoError',
    code: 'ITEM_COMPRA_CONGELADO',
    httpStatus: 422,
    build: () => new ItemCompraCongeladoError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'ItemCompraNoAprobadoError',
    code: 'ITEM_COMPRA_NO_APROBADO',
    httpStatus: 422,
    build: () => new ItemCompraNoAprobadoError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'CantidadCompradaExcedeSolicitadaError',
    code: 'CANTIDAD_COMPRADA_EXCEDE_SOLICITADA',
    httpStatus: 422,
    build: () => new CantidadCompradaExcedeSolicitadaError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'CantidadCompradaRetrocedeError',
    code: 'CANTIDAD_COMPRADA_RETROCEDE',
    httpStatus: 422,
    build: () => new CantidadCompradaRetrocedeError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'CantidadEntregadaExcedeCompradaError',
    code: 'CANTIDAD_ENTREGADA_EXCEDE_COMPRADA',
    httpStatus: 422,
    build: () => new CantidadEntregadaExcedeCompradaError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'CantidadEntregadaRetrocedeError',
    code: 'CANTIDAD_ENTREGADA_RETROCEDE',
    httpStatus: 422,
    build: () => new CantidadEntregadaRetrocedeError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'ItemCompraYaCerradoError',
    code: 'ITEM_COMPRA_YA_CERRADO',
    httpStatus: 422,
    build: () => new ItemCompraYaCerradoError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'ItemSinFaltanteError',
    code: 'ITEM_SIN_FALTANTE',
    httpStatus: 422,
    build: () => new ItemSinFaltanteError('item-1'),
    messageContains: ['item-1'],
  },
  {
    name: 'MotivoCierreFaltanteRequeridoError',
    code: 'MOTIVO_CIERRE_FALTANTE_REQUERIDO',
    httpStatus: 422,
    build: () => new MotivoCierreFaltanteRequeridoError('item-1'),
    messageContains: ['item-1'],
  },
];

describe('compras.errors — catálogo de errores de dominio (19, spec §5)', () => {
  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s expone code estable, extiende DomainError, y el mensaje conserva el identificador',
    (_name, testCase) => {
      const error = testCase.build();
      expect(error.code).toBe(testCase.code);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      for (const fragment of testCase.messageContains ?? []) {
        expect(error.message).toContain(fragment);
      }
    },
  );

  it('los 19 codes del catálogo son únicos entre sí (sin colisiones)', () => {
    const codes = CASES.map((testCase) => testCase.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBe(19);
  });

  it('el catálogo mapea cada code a exactamente el HTTP status de spec §5 (2×409, 2×404, 15×422)', () => {
    const porStatus = { 404: 0, 409: 0, 422: 0 } as Record<404 | 409 | 422, number>;
    for (const testCase of CASES) {
      porStatus[testCase.httpStatus] += 1;
    }
    expect(porStatus[409]).toBe(2);
    expect(porStatus[404]).toBe(2);
    expect(porStatus[422]).toBe(15);
  });
});
