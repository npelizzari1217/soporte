import { describe, it, expect, vi } from 'vitest';
import { ListarUsuariosTenantUseCase } from './listar-usuarios-tenant.use-case';

describe('ListarUsuariosTenantUseCase (G2/G3, sdd/beta-frontend)', () => {
  it('retorna las membresías activas del cliente dado, resueltas con usuario+rol', async () => {
    const membresiaRepo = {
      findActivasByCliente: vi.fn().mockResolvedValue([
        {
          membresiaId: 'm1',
          usuarioId: 'u1',
          nombre: 'Ada',
          apellido: 'Tec',
          email: 'ada@test.com',
          rolCodigo: 'TECNICO',
        },
      ]),
    };
    const useCase = new ListarUsuariosTenantUseCase(membresiaRepo as never);

    const result = await useCase.execute({ clienteId: 'cliente-a' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
    expect(membresiaRepo.findActivasByCliente).toHaveBeenCalledWith('cliente-a');
  });

  it('AISLAMIENTO: siempre consulta por el clienteId recibido, nunca otro', async () => {
    const membresiaRepo = { findActivasByCliente: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarUsuariosTenantUseCase(membresiaRepo as never);

    await useCase.execute({ clienteId: 'cliente-del-token' });

    expect(membresiaRepo.findActivasByCliente).toHaveBeenCalledOnce();
    expect(membresiaRepo.findActivasByCliente).toHaveBeenCalledWith('cliente-del-token');
  });
});
