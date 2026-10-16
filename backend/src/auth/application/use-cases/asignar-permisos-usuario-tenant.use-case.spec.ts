import { describe, it, expect, vi } from 'vitest';
import { AsignarPermisosUsuarioTenantUseCase } from './asignar-permisos-usuario-tenant.use-case';
import {
  CeldaPermisoInvalidaError,
  MembresiaNoEncontradaError,
} from '../../domain/errors/auth.errors';
import type {
  IMembresiaRepository,
  MembresiaResuelta,
} from '../../domain/ports/i-membresia.repository';
import type { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';

function buildMembresiaResuelta(): MembresiaResuelta {
  return {
    clienteId: 'cliente-token',
    clienteNombre: 'Cliente Token',
    rolCodigo: 'TECNICO',
    clienteRequiere2fa: false,
  };
}

describe('AsignarPermisosUsuarioTenantUseCase (ABM de la matriz, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  it('reemplaza el set completo de celdas y lo retorna', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(buildMembresiaResuelta()),
    };
    const permisosRepo = {
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
    };
    const useCase = new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    expect(permisosRepo.setPermisos).toHaveBeenCalledWith('usuario-1', 'cliente-token', [
      'TICKETS:LECTURA',
      'TICKETS:ALTAS',
    ]);
  });

  it('DEFENSA EN PROFUNDIDAD: falla con CeldaPermisoInvalidaError si algún código no está en PARES_VALIDOS', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(buildMembresiaResuelta()),
    };
    const permisosRepo = { setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>() };
    const useCase = new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      celdas: ['DASHBOARD:APROBACION'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CeldaPermisoInvalidaError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
    expect(membresiaRepo.findActivaByUsuarioYCliente).not.toHaveBeenCalled();
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si no hay membresía activa en este cliente', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(null),
    };
    const permisosRepo = { setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>() };
    const useCase = new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
      celdas: ['TICKETS:LECTURA'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });
});
