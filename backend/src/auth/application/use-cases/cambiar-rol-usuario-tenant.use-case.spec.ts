import { describe, it, expect, vi } from 'vitest';
import { CambiarRolUsuarioTenantUseCase } from './cambiar-rol-usuario-tenant.use-case';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import {
  MembresiaNoEncontradaError,
  PermisosPorTipoNoAplicadosError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { Result } from '../../../shared/domain/result';
import type { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import type { IRoleRepository } from '../../domain/ports/i-role.repository';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';
import type { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import type { IPermisosPorTipoDeCliente } from '../../domain/ports/i-permisos-por-tipo-de-cliente.port';
import { permisosPorTipoEnMemoria } from '../../test-helpers/permisos-por-tipo-en-memoria';

function buildMembresia() {
  return MembresiaEntity.reconstitute(
    { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-viejo', activo: true },
    'membresia-1',
    new Date(),
    new Date(),
    null,
  );
}

/** Fixture: matriz custom recortada a mano (`TICKETS:ALTAS`, SIN `TICKETS:ASIGNAR`) — S13/S14. */
function buildUseCaseConAplicarPreset(
  aplicarPresetResult: Result<void, PresetRolNoDefinidoError> = Result.ok(undefined),
) {
  const membresia = buildMembresia();
  const rolNuevo = RoleEntity.create({
    codigo: 'TECNICO',
    nombre: 'Técnico',
    descripcion: null,
    permisos: [],
  });
  const membresiaRepo = {
    findByUsuarioYCliente: vi
      .fn<IMembresiaRepository['findByUsuarioYCliente']>()
      .mockResolvedValue(membresia),
    save: vi.fn<IMembresiaRepository['save']>().mockResolvedValue(undefined),
  };
  const roleRepo = {
    findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(rolNuevo),
  };
  const aplicarPresetPermisosUseCase = {
    execute: vi
      .fn<AplicarPresetPermisosUseCase['execute']>()
      .mockResolvedValue(aplicarPresetResult),
  };
  const useCase = new CambiarRolUsuarioTenantUseCase(
    membresiaRepo,
    roleRepo,
    aplicarPresetPermisosUseCase,
  );
  return { useCase, membresia, membresiaRepo, roleRepo, aplicarPresetPermisosUseCase };
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
      findByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findByUsuarioYCliente']>()
        .mockResolvedValue(membresia),
      save: vi.fn<IMembresiaRepository['save']>().mockResolvedValue(undefined),
    };
    const roleRepo = {
      findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(rolNuevo),
    };
    const aplicarPresetPermisosUseCase = {
      execute: vi.fn<AplicarPresetPermisosUseCase['execute']>(),
    };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo,
      roleRepo,
      aplicarPresetPermisosUseCase,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ADMINISTRADOR',
    });

    expect(result.isOk()).toBe(true);
    expect(membresiaRepo.findByUsuarioYCliente).toHaveBeenCalledWith('usuario-1', 'cliente-token');
    expect(membresia.rolId).toBe(rolNuevo.id);
    expect(membresiaRepo.save).toHaveBeenCalledWith(membresia);
    // R6: SIN reaplicarPreset, la matriz queda intacta (S13).
    expect(aplicarPresetPermisosUseCase.execute).not.toHaveBeenCalled();
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si la membresía no existe en este cliente', async () => {
    const membresiaRepo = {
      findByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findByUsuarioYCliente']>()
        .mockResolvedValue(null),
      save: vi.fn<IMembresiaRepository['save']>(),
    };
    const roleRepo = {
      findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(
        RoleEntity.create({
          codigo: 'TECNICO',
          nombre: 'Técnico',
          descripcion: null,
          permisos: [],
        }),
      ),
    };
    const aplicarPresetPermisosUseCase = {
      execute: vi.fn<AplicarPresetPermisosUseCase['execute']>(),
    };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo,
      roleRepo,
      aplicarPresetPermisosUseCase,
    );

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
    const membresiaRepo = {
      findByUsuarioYCliente: vi.fn<IMembresiaRepository['findByUsuarioYCliente']>(),
      save: vi.fn<IMembresiaRepository['save']>(),
    };
    const roleRepo = {
      findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(null),
    };
    const aplicarPresetPermisosUseCase = {
      execute: vi.fn<AplicarPresetPermisosUseCase['execute']>(),
    };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo,
      roleRepo,
      aplicarPresetPermisosUseCase,
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'ROL_INEXISTENTE',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    expect(membresiaRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
  });

  // ─── R6 (confirmado por el usuario, #2220): reaplicarPreset ────────────────

  it('S13 — SIN reaplicarPreset, cambia el rol y la matriz queda IDÉNTICA (no invoca AplicarPresetPermisosUseCase)', async () => {
    const { useCase, membresia, membresiaRepo, aplicarPresetPermisosUseCase } =
      buildUseCaseConAplicarPreset();

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
    });

    expect(result.isOk()).toBe(true);
    expect(membresiaRepo.save).toHaveBeenCalledWith(membresia);
    expect(aplicarPresetPermisosUseCase.execute).not.toHaveBeenCalled();
  });

  it('S14 — CON reaplicarPreset: true, sobrescribe la matriz con el preset del rol DESTINO', async () => {
    const { useCase, aplicarPresetPermisosUseCase } = buildUseCaseConAplicarPreset();

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      reaplicarPreset: true,
    });

    expect(result.isOk()).toBe(true);
    expect(aplicarPresetPermisosUseCase.execute).toHaveBeenCalledWith({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      sobrescribir: true,
    });
  });

  it('reaplicarPreset: true pero el rol destino no tiene preset definido → propaga PresetRolNoDefinidoError (fail explícito, no silencioso)', async () => {
    const { useCase } = buildUseCaseConAplicarPreset(
      Result.fail(new PresetRolNoDefinidoError('ROL_SIN_PRESET')),
    );

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      reaplicarPreset: true,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
  });

  it('reaplicarPreset: false (explícito) se comporta igual que ausente — matriz intacta', async () => {
    const { useCase, aplicarPresetPermisosUseCase } = buildUseCaseConAplicarPreset();

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      rolCodigo: 'TECNICO',
      reaplicarPreset: false,
    });

    expect(result.isOk()).toBe(true);
    expect(aplicarPresetPermisosUseCase.execute).not.toHaveBeenCalled();
  });

  /**
   * T4c (odd/tasks/permisos-por-tipo-ticket.md): con `reaplicarPreset`, el cambio de rol reemplaza
   * también las filas por tipo. Se arma con el `AplicarPresetPermisosUseCase` real y el servicio
   * real de la plantilla sobre un repositorio en memoria.
   */
  describe('permisos por tipo de ticket (T4c)', () => {
    function conPresetReal(puerto: IPermisosPorTipoDeCliente) {
      const matriz = {
        setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
        findByUsuarioYCliente: vi
          .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
          .mockResolvedValue(['TICKETS:ALTAS']),
      };
      const membresiaRepo = {
        findByUsuarioYCliente: vi
          .fn<IMembresiaRepository['findByUsuarioYCliente']>()
          .mockResolvedValue(buildMembresia()),
        save: vi.fn<IMembresiaRepository['save']>().mockResolvedValue(undefined),
      };
      const roleRepo = {
        findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(
          RoleEntity.create({
            codigo: 'TECNICO',
            nombre: 'Técnico',
            descripcion: null,
            permisos: [],
          }),
        ),
      };
      const useCase = new CambiarRolUsuarioTenantUseCase(
        membresiaRepo,
        roleRepo,
        new AplicarPresetPermisosUseCase(matriz, puerto),
      );
      return { useCase, membresiaRepo, matriz };
    }

    it('con reaplicarPreset: true reemplaza las filas por tipo por las del rol destino', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'BORRADO' },
      ]);
      const { useCase } = conPresetReal(porTipo.puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      });

      expect(result.isOk()).toBe(true);
      const filas = porTipo.repo.filasDe('usuario-1');
      expect(filas).not.toContain('tipo-soporte:BORRADO');
      expect(filas).toContain('tipo-soporte:ASIGNAR');
      expect(filas).toContain('tipo-mantenimiento:MODIFICACION');
      expect(porTipo.clientes).toEqual(['cliente-token']);
    });

    it('sin reaplicarPreset no toca las filas por tipo', async () => {
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: 'usuario-1', tipoId: 'tipo-soporte', accion: 'BORRADO' },
      ]);
      const { useCase } = conPresetReal(porTipo.puerto);

      await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
      });

      expect(porTipo.repo.filasDe('usuario-1')).toEqual(['tipo-soporte:BORRADO']);
    });

    it('si falla el tenant: el rol y la matriz quedaron cambiados, y el error llega al llamador', async () => {
      const puerto: IPermisosPorTipoDeCliente = {
        aplicarPlantilla: vi
          .fn<IPermisosPorTipoDeCliente['aplicarPlantilla']>()
          .mockRejectedValue(new Error('base del tenant caída')),
      };
      const { useCase, membresiaRepo, matriz } = conPresetReal(puerto);

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PermisosPorTipoNoAplicadosError);
      expect(membresiaRepo.save).toHaveBeenCalledOnce();
      expect(matriz.setPermisos).toHaveBeenCalledOnce();
    });
  });
});
