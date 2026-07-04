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
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CiclosVigentesController } from './ciclos-vigentes.controller';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ListarCiclosVigentesUseCase } from '../../application/use-cases/listar-ciclos-vigentes.use-case';
import { EditarCicloVigenteUseCase } from '../../application/use-cases/editar-ciclo-vigente.use-case';
import { DesactivarCicloVigenteUseCase } from '../../application/use-cases/desactivar-ciclo-vigente.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { Result } from '../../../shared/domain/result';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockCrearCiclo(): vi.Mocked<CrearCicloVigenteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<CrearCicloVigenteUseCase>;
}

function makeMockListarCiclos(): vi.Mocked<ListarCiclosVigentesUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ListarCiclosVigentesUseCase>;
}

function makeMockEditarCiclo(): vi.Mocked<EditarCicloVigenteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<EditarCicloVigenteUseCase>;
}

function makeMockDesactivarCiclo(): vi.Mocked<DesactivarCicloVigenteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<DesactivarCicloVigenteUseCase>;
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
  let listarCiclos: vi.Mocked<ListarCiclosVigentesUseCase>;
  let editarCiclo: vi.Mocked<EditarCicloVigenteUseCase>;
  let desactivarCiclo: vi.Mocked<DesactivarCicloVigenteUseCase>;

  beforeEach(() => {
    crearCiclo = makeMockCrearCiclo();
    listarCiclos = makeMockListarCiclos();
    editarCiclo = makeMockEditarCiclo();
    desactivarCiclo = makeMockDesactivarCiclo();
    controller = new CiclosVigentesController(
      crearCiclo,
      listarCiclos,
      editarCiclo,
      desactivarCiclo,
    );
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

  // ── T2.7: GET /ciclos-vigentes ──────────────────────────────────────────

  it('GET /ciclos-vigentes → 200, retorna CicloVigenteResponseDto[] (mapea ListarCiclosVigentesUseCase)', async () => {
    const ciclos = [makeMockCiclo(), makeMockCiclo()];
    listarCiclos.execute.mockResolvedValue(ciclos);

    const response = await controller.listar();

    expect(listarCiclos.execute).toHaveBeenCalledTimes(1);
    expect(response).toHaveLength(2);
    expect(response[0]).toMatchObject({ id: ciclos[0].id, nombre: ciclos[0].nombre });
  });

  // ── T2.7: PATCH /ciclos-vigentes/:id ────────────────────────────────────

  it('PATCH /ciclos-vigentes/:id con dto válido → 200 CicloVigenteResponseDto con campos actualizados', async () => {
    const ciclo = makeMockCiclo();
    editarCiclo.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.editar(ciclo.id, { nombre: 'Actualizado' });

    expect(editarCiclo.execute).toHaveBeenCalledWith(ciclo.id, { nombre: 'Actualizado' });
    expect(response).toMatchObject({ id: ciclo.id });
  });

  it('PATCH .../:id cuando el use case retorna Result.fail(CicloVigenteNotFoundError) → 404', async () => {
    editarCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteNotFoundError('x')));

    await expect(controller.editar('x', { nombre: 'Y' })).rejects.toThrow(NotFoundException);
  });

  it('PATCH .../:id cuando retorna Result.fail(CicloVigenteInvalidDatesError) → 422', async () => {
    editarCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteInvalidDatesError()));

    await expect(
      controller.editar('x', { fechaInicio: '2027-01-01', fechaFin: '2026-01-01' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('PATCH .../:id cuando retorna Result.fail(CicloVigenteOverlapError) → 422', async () => {
    editarCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteOverlapError()));

    await expect(
      controller.editar('x', { fechaInicio: '2027-01-01', fechaFin: '2027-12-31' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // ── T2.7: DELETE /ciclos-vigentes/:id ────────────────────────────────────

  it('DELETE /ciclos-vigentes/:id → 204, sin body', async () => {
    desactivarCiclo.execute.mockResolvedValue(Result.ok(undefined));

    const response = await controller.desactivar('some-id');

    expect(desactivarCiclo.execute).toHaveBeenCalledWith('some-id');
    expect(response).toBeUndefined();
  });

  it('DELETE .../:id cuando el use case retorna Result.fail(CicloVigenteNotFoundError) → 404', async () => {
    desactivarCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteNotFoundError('x')));

    await expect(controller.desactivar('x')).rejects.toThrow(NotFoundException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Metadata: GlobalAdminGuard en GET/PATCH/DELETE (T2.7)
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController — GlobalAdminGuard en GET/PATCH/DELETE (T2.7)', () => {
  const GUARDS_METADATA = '__guards__';

  it('tiene GlobalAdminGuard aplicado en listar() (GET) (metadata)', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, CiclosVigentesController.prototype.listar) ?? [];
    expect(guards.some((g) => g === GlobalAdminGuard)).toBe(true);
  });

  it('tiene GlobalAdminGuard aplicado en editar() (PATCH) (metadata)', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, CiclosVigentesController.prototype.editar) ?? [];
    expect(guards.some((g) => g === GlobalAdminGuard)).toBe(true);
  });

  it('tiene GlobalAdminGuard aplicado en desactivar() (DELETE) (metadata)', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, CiclosVigentesController.prototype.desactivar) ?? [];
    expect(guards.some((g) => g === GlobalAdminGuard)).toBe(true);
  });
});
