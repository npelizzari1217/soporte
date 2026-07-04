/**
 * TEST — Unit tests para ReparacionesController.
 *
 * Verifica que el controlador:
 * - Delega a ListarReparacionesUseCase.
 * - Pasa `query.cicloId` al use case (Fase 4, ciclos-master-tenant, ADR-5).
 * - Sin `cicloId` en la query, lo pasa como `undefined` (el use case resuelve el activo).
 * - Retorna la lista tal cual la devuelve el use case (Result.getValue()).
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 *
 * El use case es mockeado (sin Prisma ni NestJS DI).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: 4.7 (Fase 4, PR4)
 */
import { ReparacionesController } from './reparaciones.controller';
import { Result } from '../../../shared/domain/result';
import { ReparacionListItemResponseDto } from '../dtos/reparaciones.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<ReparacionListItemResponseDto> = {},
): ReparacionListItemResponseDto {
  return {
    id: 'ed-001',
    ticketId: 'ticket-001',
    numero: 'EDI-2026-00001',
    titulo: 'Reparar grieta',
    estadoId: 'estado-abierto',
    ubicacionId: 'ub-001',
    ubicacionNombre: 'Piso 3',
    porcentajeAvance: 50,
    createdAt: new Date('2026-01-01T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-01-01T10:00:00Z').toISOString(),
    ...overrides,
  };
}

function makeUseCaseMock() {
  return { listarReparacionesUseCase: { execute: vi.fn() } };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReparacionesController', () => {
  let controller: ReparacionesController;
  let mocks: ReturnType<typeof makeUseCaseMock>;

  beforeEach(() => {
    mocks = makeUseCaseMock();
    controller = new ReparacionesController(mocks.listarReparacionesUseCase as any);
  });

  describe('GET /reparaciones (listarReparaciones)', () => {
    it('retorna la lista de reparaciones que devuelve el use case', async () => {
      const items = [makeItem()];
      mocks.listarReparacionesUseCase.execute.mockResolvedValue(Result.ok(items));

      const result = await controller.listarReparaciones({});

      expect(result).toEqual(items);
    });

    it('sin cicloId en la query, pasa undefined al use case (resuelve el ciclo activo)', async () => {
      mocks.listarReparacionesUseCase.execute.mockResolvedValue(Result.ok([]));

      await controller.listarReparaciones({});

      expect(mocks.listarReparacionesUseCase.execute).toHaveBeenCalledWith(undefined);
    });

    it('con cicloId explícito en la query, lo pasa al use case (histórico)', async () => {
      mocks.listarReparacionesUseCase.execute.mockResolvedValue(Result.ok([]));

      await controller.listarReparaciones({ cicloId: 'ciclo-historico-id' });

      expect(mocks.listarReparacionesUseCase.execute).toHaveBeenCalledWith('ciclo-historico-id');
    });

    it('retorna [] cuando el use case no encuentra reparaciones', async () => {
      mocks.listarReparacionesUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.listarReparaciones({});

      expect(result).toEqual([]);
    });
  });

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ReparacionesController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ReparacionesController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ReparacionesController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ReparacionesController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });
  });
});
