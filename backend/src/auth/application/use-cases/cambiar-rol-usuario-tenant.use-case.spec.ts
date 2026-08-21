import { describe, it, expect, vi } from 'vitest';
import { CambiarRolUsuarioTenantUseCase } from './cambiar-rol-usuario-tenant.use-case';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import {
  MembresiaNoEncontradaError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { Result } from '../../../shared/domain/result';

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
    findByUsuarioYCliente: vi.fn().mockResolvedValue(membresia),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const roleRepo = { findByCodigo: vi.fn().mockResolvedValue(rolNuevo) };
  const aplicarPresetPermisosUseCase = { execute: vi.fn().mockResolvedValue(aplicarPresetResult) };
  const useCase = new CambiarRolUsuarioTenantUseCase(
    membresiaRepo as never,
    roleRepo as never,
    aplicarPresetPermisosUseCase as never,
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
      findByUsuarioYCliente: vi.fn().mockResolvedValue(membresia),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const roleRepo = { findByCodigo: vi.fn().mockResolvedValue(rolNuevo) };
    const aplicarPresetPermisosUseCase = { execute: vi.fn() };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo as never,
      roleRepo as never,
      aplicarPresetPermisosUseCase as never,
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
    const aplicarPresetPermisosUseCase = { execute: vi.fn() };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo as never,
      roleRepo as never,
      aplicarPresetPermisosUseCase as never,
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
    const membresiaRepo = { findByUsuarioYCliente: vi.fn(), save: vi.fn() };
    const roleRepo = { findByCodigo: vi.fn().mockResolvedValue(null) };
    const aplicarPresetPermisosUseCase = { execute: vi.fn() };
    const useCase = new CambiarRolUsuarioTenantUseCase(
      membresiaRepo as never,
      roleRepo as never,
      aplicarPresetPermisosUseCase as never,
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
});
