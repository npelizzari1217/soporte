import { describe, it, expect, vi } from 'vitest';
import { ObtenerPermisosUsuarioTenantUseCase } from './obtener-permisos-usuario-tenant.use-case';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';

function buildMembresiaResuelta(rolCodigo: string) {
  return {
    clienteId: 'cliente-token',
    clienteNombre: 'Cliente Token',
    rolCodigo,
    permisos: [],
  };
}

describe('ObtenerPermisosUsuarioTenantUseCase (ABM de la matriz, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  it('usuario NO administrador: retorna las celdas de la matriz y esAdministrador=false', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(buildMembresiaResuelta('TECNICO')),
    };
    const permisosRepo = {
      findByUsuarioYCliente: vi.fn().mockResolvedValue(['TICKETS:LECTURA', 'TICKETS:ALTAS']),
    };
    const useCase = new ObtenerPermisosUsuarioTenantUseCase(
      membresiaRepo as never,
      permisosRepo as never,
    );

    const result = await useCase.execute({ clienteId: 'cliente-token', usuarioId: 'usuario-1' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      esAdministrador: false,
    });
    expect(permisosRepo.findByUsuarioYCliente).toHaveBeenCalledWith('usuario-1', 'cliente-token');
  });

  it('ADMINISTRADOR: retorna celdas=[] SIN consultar la matriz (R2 — no tiene filas propias)', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn()
        .mockResolvedValue(buildMembresiaResuelta('ADMINISTRADOR')),
    };
    const permisosRepo = { findByUsuarioYCliente: vi.fn() };
    const useCase = new ObtenerPermisosUsuarioTenantUseCase(
      membresiaRepo as never,
      permisosRepo as never,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-admin',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ celdas: [], esAdministrador: true });
    expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si no hay membresía activa en este cliente', async () => {
    const membresiaRepo = { findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(null) };
    const permisosRepo = { findByUsuarioYCliente: vi.fn() };
    const useCase = new ObtenerPermisosUsuarioTenantUseCase(
      membresiaRepo as never,
      permisosRepo as never,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
  });
});
