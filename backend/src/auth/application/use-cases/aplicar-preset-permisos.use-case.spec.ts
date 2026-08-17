import { describe, it, expect, vi } from 'vitest';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';
import { PresetRolNoDefinidoError } from '../../domain/errors/auth.errors';

describe('AplicarPresetPermisosUseCase (ADR-P9, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  it('sobrescribe la matriz del usuario con el preset EXACTO del rol', async () => {
    const permisosRepo = { setPermisos: vi.fn().mockResolvedValue(undefined) };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
    });

    expect(result.isOk()).toBe(true);
    expect(permisosRepo.setPermisos).toHaveBeenCalledTimes(1);
    const [usuarioId, clienteId, celdas] = permisosRepo.setPermisos.mock.calls[0];
    expect(usuarioId).toBe('usuario-1');
    expect(clienteId).toBe('cliente-token');
    expect(celdas).toContain('TICKETS:ASIGNAR');
    expect(celdas).not.toContain('COMPRAS:APROBACION');
  });

  it('rolCodigo sin preset definido: falla con PresetRolNoDefinidoError SIN tocar la matriz (fail explícito, nunca preset vacío en silencio)', async () => {
    const permisosRepo = { setPermisos: vi.fn() };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_SIN_PRESET',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });

  it('ADMINISTRADOR: aplica preset vacío (bypassea vía resolverScope, R2 — no necesita celdas)', async () => {
    const permisosRepo = { setPermisos: vi.fn().mockResolvedValue(undefined) };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ADMINISTRADOR',
    });

    expect(result.isOk()).toBe(true);
    expect(permisosRepo.setPermisos).toHaveBeenCalledWith('usuario-1', 'cliente-token', []);
  });
});
