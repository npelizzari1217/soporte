/**
 * [CONTROLLER][RED→GREEN] — `RolesController` (sdd/beta-frontend item 3).
 *
 * Unit test: instancia el controller directamente con el use case
 * mockeado (sin bootstrapear NestJS ni pasar por guards), mismo patrón que
 * `sla-config.controller.spec.ts`. Alto valor (política 80/20): NO declara
 * `@RequirePermissions` (catálogo de lectura abierta) + mapeo correcto al DTO.
 */
import 'reflect-metadata';
import { RolesController } from './roles.controller';
import { PERMISSIONS_KEY } from '../../infrastructure/guards/decorators';
import { RoleEntity } from '../../domain/entities/role.entity';

describe('RolesController (item 3)', () => {
  function buildController() {
    const listarRolesUseCase = { execute: vi.fn() };
    const controller = new RolesController(listarRolesUseCase as never);
    return { controller, listarRolesUseCase };
  }

  it('NO declara @RequirePermissions (catálogo global, cualquier usuario autenticado)', () => {
    const permisos = Reflect.getMetadata(PERMISSIONS_KEY, RolesController.prototype.listar);
    expect(permisos).toBeUndefined();
  });

  describe('GET /roles', () => {
    it('lista los roles del catálogo global mapeados al DTO de respuesta', async () => {
      const { controller, listarRolesUseCase } = buildController();
      const role = RoleEntity.create(
        { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
        'role-uuid',
      );
      listarRolesUseCase.execute.mockResolvedValue([role]);

      const result = await controller.listar();

      expect(result).toEqual([
        { id: 'role-uuid', codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null },
      ]);
    });
  });
});
