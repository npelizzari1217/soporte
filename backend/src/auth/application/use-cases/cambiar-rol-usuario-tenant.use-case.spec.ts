import { describe, it, expect, vi } from 'vitest';
import { CambiarRolUsuarioTenantUseCase } from './cambiar-rol-usuario-tenant.use-case';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { MembresiaNoEncontradaError, RolNoEncontradoError } from '../../domain/errors/auth.errors';

function buildMembresia() {
  return MembresiaEntity.reconstitute(
    { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-viejo', activo: true },
    'membresia-1',
    new Date(),
    new Date(),
    null,
  );
}

describe('CambiarRolUsuarioTenantUseCase (gestión mínima de usuarios, sdd/beta-frontend)', () => {
  it('cambia el rol de la membresía del usuario EN ESTE cliente', async () => {
    const membresia = buildMembresia();
    const rolNuevo = RoleEntity.create({
      codigo: 'ADMINISTRADOR',
      nombre: 'Administrador',
      descripcion: null,
      permisos: [],
    });
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(membresia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const roleRepo = { findByCodigo: vi.fn().mockResolvedValue(rolNuevo) };
    const useCase = new CambiarRolUsuarioTenantUseCase(membresiaRepo as never, roleRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ADMINISTRADOR',
    });

    expect(result.isOk()).toBe(true);
    expect(membresiaRepo.findByUsuarioYCliente).toHaveBeenCalledWith('usuario-1', 'cliente-token');
    expect(membresia.rolId).toBe(rolNuevo.id);
    expect(membresiaRepo.save).toHaveBeenCalledWith(membresia);
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si la membresía no existe en este cliente', async () => {
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };
    const roleRepo = {
      findByCodigo: vi.fn().mockResolvedValue(
        RoleEntity.create({
          codigo: 'TECNICO',
          nombre: 'Técnico',
          descripcion: null,
          permisos: [],
        }),
      ),
    };
    const useCase = new CambiarRolUsuarioTenantUseCase(membresiaRepo as never, roleRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
      rolCodigo: 'TECNICO',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(membresiaRepo.save).not.toHaveBeenCalled();
  });

  it('falla con RolNoEncontradoError si el rolCodigo no existe en el catálogo', async () => {
    const membresiaRepo = { findByUsuarioYCliente: vi.fn(), save: vi.fn() };
    const roleRepo = { findByCodigo: vi.fn().mockResolvedValue(null) };
    const useCase = new CambiarRolUsuarioTenantUseCase(membresiaRepo as never, roleRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_INEXISTENTE',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    expect(membresiaRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
  });
});
