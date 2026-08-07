import { describe, it, expect, vi } from 'vitest';
import { DesactivarMembresiaUsuarioTenantUseCase } from './desactivar-membresia-usuario-tenant.use-case';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';

function buildMembresia(activo = true) {
  return MembresiaEntity.reconstitute(
    { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-1', activo },
    'membresia-1',
    new Date(),
    new Date(),
    null,
  );
}

describe('DesactivarMembresiaUsuarioTenantUseCase (gestión mínima de usuarios, sdd/beta-frontend)', () => {
  it('desactiva la membresía del usuario en este cliente (no borra el usuario global)', async () => {
    const membresia = buildMembresia(true);
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(membresia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new DesactivarMembresiaUsuarioTenantUseCase(membresiaRepo as never);

    const result = await useCase.execute({ clienteId: 'cliente-token', usuarioId: 'usuario-1' });

    expect(result.isOk()).toBe(true);
    expect(membresia.activo).toBe(false);
    expect(membresiaRepo.save).toHaveBeenCalledWith(membresia);
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si la membresía no existe en este cliente', async () => {
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };
    const useCase = new DesactivarMembresiaUsuarioTenantUseCase(membresiaRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(membresiaRepo.save).not.toHaveBeenCalled();
  });

  it('es idempotente: desactivar una membresía ya inactiva no lanza', async () => {
    const membresia = buildMembresia(false);
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(membresia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new DesactivarMembresiaUsuarioTenantUseCase(membresiaRepo as never);

    const result = await useCase.execute({ clienteId: 'cliente-token', usuarioId: 'usuario-1' });

    expect(result.isOk()).toBe(true);
    expect(membresia.activo).toBe(false);
  });
});
