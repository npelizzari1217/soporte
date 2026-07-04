/**
 * T3.8 [RED] — Tests integración CiclosController (tenant-level), contrato Fase 3.
 *
 * Rutas cubiertas:
 *   GET    /ciclos/activo        → ObtenerCicloActivoUseCase (SIN guard de permisos, ADR-8)
 *   GET    /ciclos                → ListarCiclosUseCase (Permissions ciclo:gestionar)
 *   POST   /ciclos                → ElegirCicloTenantUseCase (PermissionsOrGlobalAdminGuard, ADR-3)
 *   PATCH  /ciclos/:id/activar    → ActivarCicloUseCase (PermissionsOrGlobalAdminGuard, ADR-7 sin cambios)
 *
 * Reemplaza el contrato viejo de POST /ciclos ({nombre,fechaInicio,fechaFin})
 * por ElegirCicloDto ({cicloVigenteId}) — ADR-3, breaking change aceptado.
 *
 * Spec ref: ciclos-master-tenant/design ADR-3, ADR-6, ADR-7, ADR-8; riesgo #5 (orden de rutas)
 * Tarea: T3.8
 */
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CiclosController } from './ciclos.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PermissionsOrGlobalAdminGuard } from '../../../auth/infrastructure/guards/permissions-or-global-admin.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { ElegirCicloTenantUseCase } from '../../application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { ObtenerCicloActivoUseCase } from '../../application/use-cases/obtener-ciclo-activo.use-case';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { Result } from '../../../shared/domain/result';
import {
  CicloVigenteOverlapError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCiclo(overrides?: Partial<{ activo: boolean; nombre: string }>): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: overrides?.nombre ?? 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? false,
    cicloVigenteId: 'master-id-001',
  });
}

function makeMockListar(): vi.Mocked<ListarCiclosUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ListarCiclosUseCase>;
}
function makeMockElegir(): vi.Mocked<ElegirCicloTenantUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ElegirCicloTenantUseCase>;
}
function makeMockActivar(): vi.Mocked<ActivarCicloUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ActivarCicloUseCase>;
}
function makeMockObtenerActivo(): vi.Mocked<ObtenerCicloActivoUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ObtenerCicloActivoUseCase>;
}

function makeController() {
  const listar = makeMockListar();
  const elegir = makeMockElegir();
  const activar = makeMockActivar();
  const obtenerActivo = makeMockObtenerActivo();
  const controller = new CiclosController(listar, elegir, activar, obtenerActivo);
  return { controller, listar, elegir, activar, obtenerActivo };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ciclos/activo
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — GET /ciclos/activo (T3.8)', () => {
  it('con ciclo activo existente → 200 CicloResponseDto', async () => {
    const { controller, obtenerActivo } = makeController();
    const ciclo = makeCiclo({ activo: true });
    obtenerActivo.execute.mockResolvedValue(ciclo);

    const response = await controller.activo();

    expect(response).not.toBeNull();
    expect(response!.id).toBe(ciclo.id);
    expect(response!.activo).toBe(true);
  });

  it('sin ciclo activo (use case retorna null) → retorna null (200 + null, no 404)', async () => {
    const { controller, obtenerActivo } = makeController();
    obtenerActivo.execute.mockResolvedValue(null);

    const response = await controller.activo();

    expect(response).toBeNull();
  });

  it('NO tiene guard de permisos a nivel de método (accesible a todos los roles, ADR-8)', () => {
    const GUARDS_KEY = '__guards__';
    const methodFn = CiclosController.prototype.activo;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsGuard)).toBe(false);
    expect(guards.some((g) => g === PermissionsOrGlobalAdminGuard)).toBe(false);
  });

  it('declarado ANTES que listar/create/activar en la clase (riesgo #5, orden de rutas)', () => {
    // JS preserva el orden de inserción de claves string en el prototipo.
    // Nest registra rutas en el orden de declaración de métodos de la clase.
    const methodNames = Object.getOwnPropertyNames(CiclosController.prototype).filter(
      (name) => name !== 'constructor',
    );
    const idxActivo = methodNames.indexOf('activo');
    const idxListar = methodNames.indexOf('listar');
    const idxCreate = methodNames.indexOf('create');
    const idxActivar = methodNames.indexOf('activar');

    expect(idxActivo).toBeGreaterThanOrEqual(0);
    expect(idxActivo).toBeLessThan(idxListar);
    expect(idxActivo).toBeLessThan(idxCreate);
    expect(idxActivo).toBeLessThan(idxActivar);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ciclos (listar) — sin cambios de comportamiento
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — GET /ciclos (T3.8, sin cambios)', () => {
  it('ADMINISTRADOR → 200 con ciclos del tenant resuelto', async () => {
    const { controller, listar } = makeController();
    const ciclo = makeCiclo();
    listar.execute.mockResolvedValue([ciclo]);

    const response = await controller.listar();

    expect(response).toHaveLength(1);
    expect(response[0].id).toBe(ciclo.id);
  });

  it('listar() sigue con PermissionsGuard (no el combinado)', () => {
    const GUARDS_KEY = '__guards__';
    const methodFn = CiclosController.prototype.listar;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsGuard)).toBe(true);
    expect(guards.some((g) => g === PermissionsOrGlobalAdminGuard)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ciclos (elegir) — nuevo contrato ElegirCicloDto
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — POST /ciclos (T3.8, ADR-3)', () => {
  it('{ cicloVigenteId } válido → 201 CicloResponseDto con activo=false', async () => {
    const { controller, elegir } = makeController();
    const ciclo = makeCiclo({ activo: false });
    elegir.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.create({ cicloVigenteId: 'master-id-001' });

    expect(response.id).toBeTruthy();
    expect(response.activo).toBe(false);
    expect(elegir.execute).toHaveBeenCalledWith({ cicloVigenteId: 'master-id-001' });
  });

  it('use case retorna CicloVigenteNotFoundError → 404 NotFoundException', async () => {
    const { controller, elegir } = makeController();
    elegir.execute.mockResolvedValue(Result.fail(new CicloVigenteNotFoundError('no-existe')));

    await expect(controller.create({ cicloVigenteId: 'no-existe' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('use case retorna CicloVigenteOverlapError → 422 UnprocessableEntityException', async () => {
    const { controller, elegir } = makeController();
    elegir.execute.mockResolvedValue(Result.fail(new CicloVigenteOverlapError()));

    await expect(controller.create({ cicloVigenteId: 'master-id-001' })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('response NO incluye cicloVigenteId', async () => {
    const { controller, elegir } = makeController();
    const ciclo = makeCiclo();
    elegir.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.create({ cicloVigenteId: 'master-id-001' });

    expect(response).not.toHaveProperty('cicloVigenteId');
  });

  it('create() tiene PermissionsOrGlobalAdminGuard (no PermissionsGuard)', () => {
    const GUARDS_KEY = '__guards__';
    const methodFn = CiclosController.prototype.create;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsOrGlobalAdminGuard)).toBe(true);
    expect(guards.some((g) => g === PermissionsGuard)).toBe(false);
  });

  it('create() requiere permiso ciclo:gestionar', () => {
    const methodFn = CiclosController.prototype.create;
    const perms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, methodFn) ?? [];
    expect(perms).toContain('ciclo:gestionar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /ciclos/:id/activar — sin cambios de comportamiento (ADR-7), solo guard swap
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — PATCH /ciclos/:id/activar (T3.8, ADR-7)', () => {
  it('ADMINISTRADOR → 200 con ciclo activo=true en respuesta', async () => {
    const { controller, activar } = makeController();
    const ciclo = makeCiclo({ activo: true });
    activar.execute.mockResolvedValue(ciclo);

    const response = await controller.activar(ciclo.id);

    expect(response.id).toBe(ciclo.id);
    expect(response.activo).toBe(true);
  });

  it('ciclo inexistente → NotFoundException (re-lanzada del use case)', async () => {
    const { controller, activar } = makeController();
    activar.execute.mockRejectedValue(new NotFoundException('Ciclo no encontrado'));

    await expect(controller.activar('id-que-no-existe')).rejects.toThrow(NotFoundException);
  });

  it('activar() tiene PermissionsOrGlobalAdminGuard (no PermissionsGuard)', () => {
    const GUARDS_KEY = '__guards__';
    const methodFn = CiclosController.prototype.activar;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsOrGlobalAdminGuard)).toBe(true);
    expect(guards.some((g) => g === PermissionsGuard)).toBe(false);
  });

  it('activar() requiere permiso ciclo:gestionar', () => {
    const methodFn = CiclosController.prototype.activar;
    const perms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, methodFn) ?? [];
    expect(perms).toContain('ciclo:gestionar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard metadata a nivel de clase
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — Guard metadata de clase (T3.8)', () => {
  const GUARDS_KEY = '__guards__';

  it('JwtAuthGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, CiclosController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('TenantGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, CiclosController) ?? [];
    expect(guards.some((g) => g === TenantGuard)).toBe(true);
  });
});
