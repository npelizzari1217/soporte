/**
 * T1.5 [RED] — Tests de protección JwtAuthGuard en CiclosVigentesController
 *             (RED → GREEN con T1.6)
 *
 * Verifica que CiclosVigentesController requiere JWT válido en todos sus endpoints.
 * Cierra el agujero de seguridad: el controlador está ABIERTO sin autenticación.
 *
 * Estrategia:
 * - Metadata inspection: verifica que @UseGuards(JwtAuthGuard) está aplicado
 * - Behavioral: verifica que JwtAuthGuard rechaza requests sin/mal token
 *
 * Spec ref: auth-rbac/CiclosVigentesController protegido
 * Tarea: T1.5 (PR1, admin-general)
 */

import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CiclosVigentesController } from './ciclos-vigentes.controller';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { Result } from '../../../shared/domain/result';
import { CicloVigenteOverlapError } from '../../domain/errors/clientes.errors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockCrearCiclo(): vi.Mocked<CrearCicloVigenteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<CrearCicloVigenteUseCase>;
}

function makeMockCiclo(): CicloVigenteEntity {
  return CicloVigenteEntity.create({
    nombre: 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Protección JwtAuthGuard (T1.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController — protección JwtAuthGuard (T1.5)', () => {
  /**
   * Verifica a nivel de metadatos que JwtAuthGuard está aplicado en el controlador.
   * Falla en RED porque @UseGuards no está en el controlador aún.
   * Pasa en GREEN (T1.6) cuando se agrega @UseGuards(JwtAuthGuard).
   */
  it('tiene JwtAuthGuard aplicado a nivel de controlador (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, CiclosVigentesController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('JwtAuthGuard lanza UnauthorizedException sin header Authorization (simula POST /ciclos-vigentes sin token)', () => {
    const mockTokenService = { verifyJwt: vi.fn() };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: {}, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JwtAuthGuard lanza UnauthorizedException con token expirado (simula POST /ciclos-vigentes con token vencido)', () => {
    const mockTokenService = { verifyJwt: vi.fn().mockReturnValue(null) };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = {
      headers: { authorization: 'Bearer expired.invalid.token' },
      user: null,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Protección GlobalAdminGuard — el catálogo global solo lo escribe el operador global
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController — protección GlobalAdminGuard (catálogo global)', () => {
  it('tiene GlobalAdminGuard aplicado en POST create (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, CiclosVigentesController.prototype.create) ?? [];
    expect(guards.some((g) => g === GlobalAdminGuard)).toBe(true);
  });

  it('GlobalAdminGuard lanza ForbiddenException si is_global_admin=false (no-operador escribe el catálogo)', () => {
    const guard = new GlobalAdminGuard();
    const request = { user: { is_global_admin: false } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('GlobalAdminGuard permite si is_global_admin=true (operador global)', () => {
    const guard = new GlobalAdminGuard();
    const request = { user: { is_global_admin: true } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comportamiento funcional existente (no-regression)
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController — comportamiento (no-regression)', () => {
  let controller: CiclosVigentesController;
  let crearCiclo: vi.Mocked<CrearCicloVigenteUseCase>;

  beforeEach(() => {
    crearCiclo = makeMockCrearCiclo();
    controller = new CiclosVigentesController(crearCiclo);
  });

  it('retorna CicloVigenteResponseDto con los datos del ciclo (token válido → 201)', async () => {
    const ciclo = makeMockCiclo();
    crearCiclo.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.create({
      nombre: 'Ejercicio 2026',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
      activo: true,
    });

    expect(response).toMatchObject({
      id: ciclo.id,
      nombre: 'Ejercicio 2026',
      activo: true,
    });
  });

  it('lanza UnprocessableEntityException (422) en solapamiento de fechas', async () => {
    crearCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteOverlapError()));

    await expect(
      controller.create({
        nombre: 'Solapado',
        fechaInicio: '2026-06-01',
        fechaFin: '2027-06-30',
        activo: true,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
