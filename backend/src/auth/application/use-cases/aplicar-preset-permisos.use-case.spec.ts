import { describe, it, expect, vi } from 'vitest';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';
import {
  MatrizPermisosNoAplicadaError,
  PermisosPorTipoNoAplicadosError,
  PresetRolNoDefinidoError,
} from '../../domain/errors/auth.errors';
import type { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import type { IPermisosPorTipoDeCliente } from '../../domain/ports/i-permisos-por-tipo-de-cliente.port';
import { permisosPorTipoEnMemoria } from '../../test-helpers/permisos-por-tipo-en-memoria';

/** Matriz master simulada: devuelve `celdasActuales` y registra cada `setPermisos`. */
function matrizCon(celdasActuales: string[] = []) {
  return {
    setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
    findByUsuarioYCliente: vi
      .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
      .mockResolvedValue(celdasActuales),
  };
}

/** Filas por tipo de un TECNICO sobre `TIPOS_DE_PRUEBA`, por la traducción de L11. */
const FILAS_TECNICO = [
  'tipo-soporte:LECTURA',
  'tipo-soporte:VER_TODOS',
  'tipo-soporte:ALTAS',
  'tipo-soporte:MODIFICACION',
  'tipo-soporte:TRANSICIONAR',
  'tipo-soporte:ASIGNAR',
  'tipo-soporte:COMENTAR',
  'tipo-soporte:OBSERVAR',
  'tipo-soporte:IMPRESION',
  'tipo-mantenimiento:LECTURA',
  'tipo-mantenimiento:VER_TODOS',
  'tipo-mantenimiento:ALTAS',
  'tipo-mantenimiento:MODIFICACION',
  'tipo-mantenimiento:TRANSICIONAR',
  'tipo-mantenimiento:ASIGNAR',
  'tipo-mantenimiento:COMENTAR',
  'tipo-mantenimiento:OBSERVAR',
  'tipo-mantenimiento:IMPRESION',
].sort();

describe('AplicarPresetPermisosUseCase (ADR-P9, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  it('sobrescribe la matriz del usuario con el preset EXACTO del rol', async () => {
    const permisosRepo = {
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

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
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>(),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

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
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

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
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>(),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue(['TICKETS:LECTURA', 'TICKETS:ALTAS']),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

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
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue([]),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

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
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>(),
      findByUsuarioYCliente: vi
        .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
        .mockResolvedValue(['TICKETS:LECTURA']),
    };
    const useCase = new AplicarPresetPermisosUseCase(
      permisosRepo,
      permisosPorTipoEnMemoria().puerto,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-1',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_SIN_PRESET',
      sobrescribir: false,
    });

    expect(result.isFail()).toBe(true);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });

  describe('permisos por tipo de ticket (odd/tasks/permisos-por-tipo-ticket.md, T4c)', () => {
    it('TECNICO: escribe sus acciones en cada tipo de TICKETS y EDILICIA del tenant del cliente', async () => {
      const permisosRepo = matrizCon();
      const porTipo = permisosPorTipoEnMemoria();
      const useCase = new AplicarPresetPermisosUseCase(permisosRepo, porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: false,
      });

      expect(result.isOk()).toBe(true);
      expect(porTipo.repo.filasDe('usuario-1')).toEqual(FILAS_TECNICO);
      expect(porTipo.clientes).toEqual(['cliente-token']);
    });

    it('USUARIO: ver, crear y comentar sin ver todos, en TICKETS y en EDILICIA (L35)', async () => {
      const porTipo = permisosPorTipoEnMemoria();
      const useCase = new AplicarPresetPermisosUseCase(matrizCon(), porTipo.puerto);

      await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'USUARIO',
        sobrescribir: true,
      });

      expect(porTipo.repo.filasDe('usuario-1')).toEqual(
        [
          'tipo-soporte:LECTURA',
          'tipo-soporte:ALTAS',
          'tipo-soporte:COMENTAR',
          'tipo-soporte:IMPRESION',
          'tipo-mantenimiento:LECTURA',
          'tipo-mantenimiento:ALTAS',
          'tipo-mantenimiento:COMENTAR',
          'tipo-mantenimiento:IMPRESION',
        ].sort(),
      );
    });

    it('sobrescribir=true reemplaza las filas por tipo existentes, sin fusionar', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'BORRADO' },
      ]);
      const useCase = new AplicarPresetPermisosUseCase(
        matrizCon(['TICKETS:LECTURA']),
        porTipo.puerto,
      );

      await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: true,
      });

      expect(porTipo.repo.filasDe('usuario-1')).toEqual(FILAS_TECNICO);
    });

    it('sobrescribir=false con filas por tipo existentes no las toca, aunque la matriz esté vacía', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
      ]);
      const permisosRepo = matrizCon();
      const useCase = new AplicarPresetPermisosUseCase(permisosRepo, porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: false,
      });

      expect(result.isOk()).toBe(true);
      expect(permisosRepo.setPermisos).toHaveBeenCalledTimes(1);
      expect(porTipo.repo.filasDe('usuario-1')).toEqual(['tipo-soporte:LECTURA']);
    });

    it('sobrescribir=false con matriz existente no escribe filas por tipo (no concede lo que la matriz no tiene)', async () => {
      const porTipo = permisosPorTipoEnMemoria();
      const useCase = new AplicarPresetPermisosUseCase(
        matrizCon(['COMPRAS:LECTURA']),
        porTipo.puerto,
      );

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: false,
      });

      expect(result.isOk()).toBe(true);
      expect(porTipo.repo.filasDe('usuario-1')).toEqual([]);
      expect(porTipo.clientes).toEqual([]);
    });

    it('ADMINISTRADOR: no escribe filas por tipo, y con sobrescribir=true borra las previas', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
      ]);
      const useCase = new AplicarPresetPermisosUseCase(matrizCon(), porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'ADMINISTRADOR',
        sobrescribir: true,
      });

      expect(result.isOk()).toBe(true);
      expect(porTipo.repo.filasDe('usuario-1')).toEqual([]);
    });

    it('un rol sin preset no toca las filas por tipo', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
      ]);
      const useCase = new AplicarPresetPermisosUseCase(matrizCon(), porTipo.puerto);

      await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'ROL_SIN_PRESET',
        sobrescribir: true,
      });

      expect(porTipo.clientes).toEqual([]);
      expect(porTipo.repo.filasDe('usuario-1')).toEqual(['tipo-soporte:LECTURA']);
    });

    /**
     * Master y tenant son bases distintas, sin transacción común. Desde la etapa 1 las filas por
     * tipo deciden el acceso a tickets, así que se escriben primero (W1 del judgment-day): si el
     * tenant falla, la matriz no se toca y el usuario no queda con un rol nuevo y el acceso viejo.
     */
    it('W1: si falla el tenant, la matriz NO se toca y devuelve PermisosPorTipoNoAplicadosError', async () => {
      const permisosRepo = matrizCon(['TICKETS:LECTURA']);
      const caida = new Error('conexión rechazada');
      const puerto: IPermisosPorTipoDeCliente = {
        aplicarPlantilla: vi
          .fn<IPermisosPorTipoDeCliente['aplicarPlantilla']>()
          .mockRejectedValue(caida),
      };
      const useCase = new AplicarPresetPermisosUseCase(permisosRepo, puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'USUARIO',
        sobrescribir: true,
      });

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(PermisosPorTipoNoAplicadosError);
      expect(error.message).toBe(
        'No se pudieron guardar los permisos por tipo de ticket y la matriz de permisos no se ' +
          'modificó. Vuelva a aplicar la plantilla del rol.',
      );
      expect(error instanceof PermisosPorTipoNoAplicadosError && error.causa).toBe(caida);
      expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
    });

    it('W1: un descenso TECNICO→USUARIO escribe las filas por tipo ANTES que la matriz', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'ASIGNAR' },
      ]);
      const permisosRepo = matrizCon(['TICKETS:LECTURA', 'TICKETS:ASIGNAR']);
      // Al escribir master, las filas por tipo ya tienen que ser las del rol nuevo.
      const filasAlEscribirMaster: string[][] = [];
      permisosRepo.setPermisos.mockImplementation(async () => {
        filasAlEscribirMaster.push(porTipo.repo.filasDe('usuario-1'));
      });
      const useCase = new AplicarPresetPermisosUseCase(permisosRepo, porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'USUARIO',
        sobrescribir: true,
      });

      expect(result.isOk()).toBe(true);
      expect(filasAlEscribirMaster).toHaveLength(1);
      expect(filasAlEscribirMaster[0]).not.toContain('tipo-soporte:ASIGNAR');
      expect(filasAlEscribirMaster[0]).toContain('tipo-soporte:LECTURA');
    });

    it('W1: si falla master después del tenant, devuelve MatrizPermisosNoAplicadaError (no se traga)', async () => {
      const porTipo = permisosPorTipoEnMemoria();
      const caida = new Error('master caída');
      const permisosRepo = matrizCon();
      permisosRepo.setPermisos.mockRejectedValue(caida);
      const useCase = new AplicarPresetPermisosUseCase(permisosRepo, porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        sobrescribir: true,
      });

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(MatrizPermisosNoAplicadaError);
      expect(error.message).toBe(
        'Se guardaron los permisos por tipo de ticket, pero no la matriz de permisos. ' +
          'Vuelva a aplicar la plantilla del rol para completarla.',
      );
      expect(error instanceof MatrizPermisosNoAplicadaError && error.causa).toBe(caida);
      // El tenant quedó con la plantilla nueva: reaplicarla reescribe las dos bases.
      expect(porTipo.repo.filasDe('usuario-1')).toEqual(FILAS_TECNICO);
    });
  });
});
