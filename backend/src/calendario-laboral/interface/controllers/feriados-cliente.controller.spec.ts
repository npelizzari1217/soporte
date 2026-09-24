/**
 * FeriadosClienteController — unit test (tarea 4.2, sdd/feriados-configurables).
 *
 * WU4b scope, igual que `feriados.controller.spec.ts` (WU2b): (1) metadata
 * de guards por método — class-level `JwtAuthGuard, TenantGuard`, y
 * `AdminClienteGuard` en los tres endpoints de escritura, NO en `GET`; (2)
 * tabla error → HTTP (D7) contra el catálogo completo de `feriados.errors.ts`.
 * Cobertura funcional + aislación cross-tenant queda para el e2e de WU4c
 * (tarea 4.3), mismo criterio de presupuesto que WU2b/WU2c.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FeriadosClienteController, toHttpException } from './feriados-cliente.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { DomainError } from '../../../shared/domain/result';
import * as FeriadosErrors from '../../domain/errors/feriados.errors';

/** Clave con la que Nest guarda los guards de `@UseGuards` (constante interna, no exportada como tipo público). */
const GUARDS_KEY = '__guards__';

type Handler = (...args: never[]) => unknown;

function guardsDe(handler: Handler): unknown[] {
  return (Reflect.getMetadata(GUARDS_KEY, handler) as unknown[] | undefined) ?? [];
}

describe('FeriadosClienteController — guards (D5/D6, spec "Per-client admin manages its own holidays; other roles read")', () => {
  it('[CRITICAL] a nivel de clase declara JwtAuthGuard y TenantGuard (lectura abierta a cualquier autenticado del tenant)', () => {
    expect(guardsDe(FeriadosClienteController as unknown as Handler)).toEqual([
      JwtAuthGuard,
      TenantGuard,
    ]);
  });

  it('[CRITICAL] GET /feriados-cliente NO declara AdminClienteGuard por método (lectura para cualquier autenticado del tenant)', () => {
    expect(guardsDe(FeriadosClienteController.prototype.listar)).toEqual([]);
  });

  const ENDPOINTS_DE_ESCRITURA: [string, Handler][] = [
    ['POST /feriados-cliente', FeriadosClienteController.prototype.crear],
    ['PATCH /feriados-cliente/:id', FeriadosClienteController.prototype.editar],
    ['DELETE /feriados-cliente/:id', FeriadosClienteController.prototype.eliminar],
  ];

  it.each(ENDPOINTS_DE_ESCRITURA)(
    '[CRITICAL] %s exige ADMINISTRADOR/ROOT: declara AdminClienteGuard',
    (_ruta, handler) => {
      expect(guardsDe(handler)).toContain(AdminClienteGuard);
    },
  );
});

describe('toHttpException — catálogo de errores → HTTP (D7, design.md)', () => {
  // Mismo criterio que `feriados.controller.spec.ts` (D2): filtra por
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
