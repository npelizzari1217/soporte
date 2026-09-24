/**
 * FeriadosController — unit test (tarea 2.3, sdd/feriados-configurables).
 *
 * WU2b scope: los dos bloques asignados a este work unit.
 *  1. Metadata de guards por método — class-level `JwtAuthGuard`, y
 *     `GlobalAdminGuard` en los tres endpoints de escritura, NO en `GET`.
 *  2. Tabla error → HTTP (D7), contra el catálogo completo de
 *     `feriados.errors.ts` (4 clases).
 *
 * Cobertura funcional endpoint-por-endpoint (happy path de cada método)
 * queda para el e2e de WU2c (tarea 2.4): mismo patrón que `KbController`,
 * cuyo `.spec.ts` combina ambos bloques con tests funcionales, pero acá se
 * difiere por presupuesto de revisión (≤400 líneas, owner decision
 * 2026-09-24 — ver `apply-progress.md`, sección WU2b).
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FeriadosController, toHttpException } from './feriados.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { DomainError } from '../../../shared/domain/result';
import * as FeriadosErrors from '../../domain/errors/feriados.errors';

/** Clave con la que Nest guarda los guards de `@UseGuards` (constante interna, no exportada como tipo público). */
const GUARDS_KEY = '__guards__';

type Handler = (...args: never[]) => unknown;

function guardsDe(handler: Handler): unknown[] {
  return (Reflect.getMetadata(GUARDS_KEY, handler) as unknown[] | undefined) ?? [];
}

describe('FeriadosController — guards (D5/D6, spec "ROOT-only writes, backend-enforced")', () => {
  it('[CRITICAL] a nivel de clase declara únicamente JwtAuthGuard (lectura abierta a cualquier autenticado)', () => {
    expect(guardsDe(FeriadosController as unknown as Handler)).toEqual([JwtAuthGuard]);
  });

  it('[CRITICAL] GET /feriados NO declara GlobalAdminGuard por método (lectura para cualquier autenticado)', () => {
    expect(guardsDe(FeriadosController.prototype.listar)).toEqual([]);
  });

  const ENDPOINTS_DE_ESCRITURA: [string, Handler][] = [
    ['POST /feriados', FeriadosController.prototype.crear],
    ['PATCH /feriados/:id', FeriadosController.prototype.editar],
    ['DELETE /feriados/:id', FeriadosController.prototype.eliminar],
  ];

  it.each(ENDPOINTS_DE_ESCRITURA)(
    '[CRITICAL] %s exige ROOT: declara GlobalAdminGuard',
    (_ruta, handler) => {
      expect(guardsDe(handler)).toContain(GlobalAdminGuard);
    },
  );
});

describe('toHttpException — catálogo de errores → HTTP (D7, design.md)', () => {
  // Mismo criterio que `equipos.controller.spec.ts` (D2): filtra por
  // herencia real de `DomainError`, no por forma, para que TS2677 no lo
  // rechace y el catálogo sea el número de la verdad, no un literal a mano.
  const CLASES_DE_ERROR = Object.values(FeriadosErrors).filter(
    (valor) => typeof valor === 'function' && valor.prototype instanceof DomainError,
  );

  it('el catálogo de feriados.errors.ts tiene EXACTAMENTE 4 clases de error', () => {
    expect(CLASES_DE_ERROR).toHaveLength(4);
  });

  const TABLA: Array<[string, () => DomainError, 404 | 422]> = [
    [
      'FechaCalendarioInvalidaError',
      () => new FeriadosErrors.FechaCalendarioInvalidaError('2026-02-30'),
      422,
    ],
    [
      'FeriadoFechaDuplicadaError',
      () => new FeriadosErrors.FeriadoFechaDuplicadaError('2026-12-25'),
      422,
    ],
    [
      'FeriadoFechaEsGlobalError',
      () => new FeriadosErrors.FeriadoFechaEsGlobalError('2026-12-25'),
      422,
    ],
    [
      'FeriadoNoEncontradoError',
      () => new FeriadosErrors.FeriadoNoEncontradoError('feriado-1'),
      404,
    ],
  ];

  it.each(TABLA)('%s → %i', (_nombre, construirError, esperado) => {
    const exception = toHttpException(construirError());
    if (esperado === 404) {
      expect(exception).toBeInstanceOf(NotFoundException);
    } else {
      expect(exception).toBeInstanceOf(UnprocessableEntityException);
    }
  });
});
