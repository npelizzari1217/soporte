import { describe, it, expect, vi } from 'vitest';
import { AsignarModulosUsuarioTenantUseCase } from './asignar-modulos-usuario-tenant.use-case';
import { MembresiaNoEncontradaError, ModuloInvalidoError } from '../../domain/errors/auth.errors';

const MEMBRESIA_ACTIVA = {
  clienteId: 'cliente-token',
  clienteNombre: 'Cliente Token',
  rolCodigo: 'TECNICO',
  permisos: [],
};

describe('AsignarModulosUsuarioTenantUseCase (feature 5.2 CAPA 4)', () => {
  it('happy: valida membresía activa y reemplaza el set de módulos', async () => {
    const modulosRepo = { setModulos: vi.fn().mockResolvedValue(undefined) };
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(MEMBRESIA_ACTIVA),
    };
    const useCase = new AsignarModulosUsuarioTenantUseCase(
      modulosRepo as never,
      membresiaRepo as never,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      modulos: ['TICKETS', 'COMPRAS'],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(['TICKETS', 'COMPRAS']);
    expect(membresiaRepo.findActivaByUsuarioYCliente).toHaveBeenCalledWith(
      'usuario-1',
      'cliente-token',
    );
    expect(modulosRepo.setModulos).toHaveBeenCalledWith('usuario-1', 'cliente-token', [
      'TICKETS',
      'COMPRAS',
    ]);
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si no hay membresía activa en este cliente', async () => {
    const modulosRepo = { setModulos: vi.fn() };
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(null),
    };
    const useCase = new AsignarModulosUsuarioTenantUseCase(
      modulosRepo as never,
      membresiaRepo as never,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-ajeno',
      modulos: ['TICKETS'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(modulosRepo.setModulos).not.toHaveBeenCalled();
  });

  it('falla con ModuloInvalidoError (fail-fast) si algún módulo no está en el catálogo', async () => {
    const modulosRepo = { setModulos: vi.fn() };
    const membresiaRepo = { findActivaByUsuarioYCliente: vi.fn() };
    const useCase = new AsignarModulosUsuarioTenantUseCase(
      modulosRepo as never,
      membresiaRepo as never,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      modulos: ['TICKETS', 'INEXISTENTE'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ModuloInvalidoError);
    // fail-fast: ni siquiera consulta la membresía
    expect(membresiaRepo.findActivaByUsuarioYCliente).not.toHaveBeenCalled();
    expect(modulosRepo.setModulos).not.toHaveBeenCalled();
  });
});
