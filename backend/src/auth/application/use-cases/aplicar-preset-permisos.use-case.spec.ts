import { describe, it, expect, vi } from 'vitest';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';
import { PresetRolNoDefinidoError } from '../../domain/errors/auth.errors';

describe('AplicarPresetPermisosUseCase (ADR-P9, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  it('sobrescribe la matriz del usuario con el preset EXACTO del rol', async () => {
    const permisosRepo = {
      setPermisos: vi.fn().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      sobrescribir: true,
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
    const permisosRepo = {
      setPermisos: vi.fn(),
      findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_SIN_PRESET',
      sobrescribir: true,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });

  it('ADMINISTRADOR: aplica preset vacío (bypassea vía resolverScope, R2 — no necesita celdas)', async () => {
    const permisosRepo = {
      setPermisos: vi.fn().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ADMINISTRADOR',
      sobrescribir: true,
    });

    expect(result.isOk()).toBe(true);
    expect(permisosRepo.setPermisos).toHaveBeenCalledWith('usuario-1', 'cliente-token', []);
  });

  /**
   * Fix W11. El caso que se había escapado: la baja de una membresía NO borra
   * celdas (`desactivar-membresia-usuario-tenant.use-case.ts` solo desactiva),
   * así que un re-alta encuentra la matriz que el ADMINISTRADOR había
   * recortado a mano y la pisaba con el preset del rol.
   */
  it('[CRITICAL] W11: con sobrescribir=false y celdas existentes, NO toca la matriz', async () => {
    const permisosRepo = {
      setPermisos: vi.fn(),
      findByUsuarioYCliente: vi.fn().mockResolvedValue(['TICKETS:LECTURA', 'TICKETS:ALTAS']),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      sobrescribir: false,
    });

    expect(result.isOk()).toBe(true);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });

  it('con sobrescribir=false y matriz VACÍA, sí siembra el preset (el alta genuina)', async () => {
    const permisosRepo = {
      setPermisos: vi.fn().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      sobrescribir: false,
    });

    expect(result.isOk()).toBe(true);
    expect(permisosRepo.setPermisos).toHaveBeenCalledTimes(1);
  });

  /**
   * El preset se resuelve ANTES de decidir si se aplica, a propósito: un rol
   * sin preset tiene que fallar igual aunque después no fuéramos a escribir
   * nada. Si no, un rol mal configurado pasaría inadvertido en todos los
   * re-altas y solo aparecería el día que alguien diera de alta a un usuario
   * nuevo con ese rol.
   */
  it('[CRITICAL] con sobrescribir=false, un rol SIN preset falla igual aunque la matriz no esté vacía', async () => {
    const permisosRepo = {
      setPermisos: vi.fn(),
      findByUsuarioYCliente: vi.fn().mockResolvedValue(['TICKETS:LECTURA']),
    };
    const useCase = new AplicarPresetPermisosUseCase(permisosRepo as never);

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_SIN_PRESET',
      sobrescribir: false,
    });

    expect(result.isFail()).toBe(true);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });
});
