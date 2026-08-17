import { describe, it, expect, vi } from 'vitest';
import { CrearUsuarioTenantUseCase } from './crear-usuario-tenant.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { Result } from '../../../shared/domain/result';
import {
  RolNoEncontradoError,
  MembresiaYaActivaError,
  PresetRolNoDefinidoError,
} from '../../domain/errors/auth.errors';

const DTO = {
  clienteId: 'cliente-token',
  email: 'nuevo@test.com',
  nombre: 'Nueva',
  apellido: 'Persona',
  password: 'Secreto123!',
  rolCodigo: 'TECNICO',
};

function buildRole() {
  return RoleEntity.create({
    codigo: 'TECNICO',
    nombre: 'Técnico',
    descripcion: null,
    permisos: [],
  });
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const usuarioRepo = {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    ...(overrides.usuarioRepo as object),
  };
  const membresiaRepo = {
    findActivaByUsuarioYCliente: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    ...(overrides.membresiaRepo as object),
  };
  const roleRepo = {
    findByCodigo: vi.fn().mockResolvedValue(buildRole()),
    ...(overrides.roleRepo as object),
  };
  const hashProvider = {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    ...(overrides.hashProvider as object),
  };
  const aplicarPresetPermisosUseCase = {
    execute: vi.fn().mockResolvedValue(Result.ok(undefined)),
    ...(overrides.aplicarPresetPermisosUseCase as object),
  };
  const useCase = new CrearUsuarioTenantUseCase(
    usuarioRepo as never,
    membresiaRepo as never,
    roleRepo as never,
    hashProvider as never,
    aplicarPresetPermisosUseCase as never,
  );
  return {
    useCase,
    usuarioRepo,
    membresiaRepo,
    roleRepo,
    hashProvider,
    aplicarPresetPermisosUseCase,
  };
}

describe('CrearUsuarioTenantUseCase (gestión mínima de usuarios, sdd/beta-frontend)', () => {
  it('crea un usuario global NUEVO + su membresía en el cliente del token', async () => {
    const { useCase, usuarioRepo, membresiaRepo, hashProvider, roleRepo } = buildDeps();
    const rol = await roleRepo.findByCodigo('TECNICO');

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(hashProvider.hash).toHaveBeenCalledWith(DTO.password);
    expect(usuarioRepo.create).toHaveBeenCalledOnce();
    expect(membresiaRepo.create).toHaveBeenCalledOnce();
    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.clienteId).toBe(DTO.clienteId);
    expect(membresiaCreada.rolId).toBe(rol.id);
    expect(membresiaCreada.activo).toBe(true);
  });

  // ─── Fix post-verify W4 (sdd/matriz-permisos-por-usuario): el alta NO
  // ─── sembraba la matriz — el usuario nacía con 0 celdas, invisible como
  // ─── asignable, sin error (documentado como workaround en demo-seed.ts).

  it('[CRITICAL] siembra el preset de la matriz del rol para la membresía recién creada (W4)', async () => {
    const { useCase, membresiaRepo, aplicarPresetPermisosUseCase } = buildDeps();

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(aplicarPresetPermisosUseCase.execute).toHaveBeenCalledWith({
      clienteId: DTO.clienteId,
      usuarioId: membresiaCreada.usuarioId,
      rolCodigo: DTO.rolCodigo,
      sobrescribir: false,
    });
  });

  /**
   * Fix W11. El alta pide el preset con `sobrescribir: false` porque el mismo
   * caso de uso cubre DOS situaciones que parecen una: el alta de alguien que
   * nunca existió (matriz vacía, el preset la siembra) y el RE-alta de alguien
   * dado de baja, cuya matriz la baja conservó intacta a propósito
   * (`desactivar-membresia` solo desactiva la membresía, no borra celdas).
   *
   * Sin el flag, el re-alta pisaba con el preset del rol los recortes que un
   * ADMINISTRADOR hubiera hecho a mano. Es el mismo efecto sorpresa que R6
   * prohibió para el cambio de rol, entrando por la puerta del re-alta.
   *
   * La puerta explícita para pisar sigue existiendo y es una sola:
   * `PATCH /usuarios/:id/rol` con `reaplicarPreset: true`, que pide
   * confirmación en el frontend.
   */
  it('[CRITICAL] W11: el alta NO pide sobrescribir, para no pisar la matriz de un re-alta', async () => {
    const { useCase, aplicarPresetPermisosUseCase } = buildDeps();

    await useCase.execute(DTO);

    const argumentos = aplicarPresetPermisosUseCase.execute.mock.calls[0][0] as {
      sobrescribir: boolean;
    };
    expect(argumentos.sobrescribir).toBe(false);
  });

  it('[CRITICAL] falla con PresetRolNoDefinidoError si el rol no tiene preset — la membresía YA quedó creada (mismo criterio que CambiarRolUsuarioTenantUseCase)', async () => {
    const { useCase, membresiaRepo } = buildDeps({
      aplicarPresetPermisosUseCase: {
        execute: vi.fn().mockResolvedValue(Result.fail(new PresetRolNoDefinidoError('TECNICO'))),
      },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PresetRolNoDefinidoError);
    expect(membresiaRepo.create).toHaveBeenCalledOnce();
  });

  it('AISLAMIENTO: la membresía SIEMPRE se crea con el clienteId recibido, nunca otro', async () => {
    const { useCase, membresiaRepo } = buildDeps();

    await useCase.execute({ ...DTO, clienteId: 'cliente-especifico' });

    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.clienteId).toBe('cliente-especifico');
  });

  it('reutiliza un usuario global EXISTENTE (no rehashea password ni pisa nombre/apellido)', async () => {
    const existente = UsuarioEntity.reconstitute(
      {
        email: DTO.email,
        nombre: 'Original',
        apellido: 'Original',
        passwordHash: 'hash-viejo',
        activo: true,
        isGlobalAdmin: false,
      },
      'usuario-existente',
      new Date(),
      new Date(),
      null,
    );
    const { useCase, usuarioRepo, membresiaRepo, hashProvider, aplicarPresetPermisosUseCase } =
      buildDeps({
        usuarioRepo: { findByEmail: vi.fn().mockResolvedValue(existente) },
      });

    const result = await useCase.execute(DTO);

    expect(result.isOk()).toBe(true);
    expect(hashProvider.hash).not.toHaveBeenCalled();
    expect(usuarioRepo.create).not.toHaveBeenCalled();
    const membresiaCreada = membresiaRepo.create.mock.calls[0][0];
    expect(membresiaCreada.usuarioId).toBe('usuario-existente');
    // W4: la membresía NUEVA en este cliente también necesita su preset, y
    // aplica igual para un usuario global reutilizado.
    //
    // Va con `sobrescribir: false` (W11). El apply-progress original decía
    // "0 celdas es 0 celdas" para justificar sobrescribir siempre, y esa
    // premisa era FALSA: un usuario reutilizado puede tener celdas de una
    // membresía anterior en ESTE mismo cliente, dada de baja pero con su
    // matriz conservada. Ahí no son 0.
    expect(aplicarPresetPermisosUseCase.execute).toHaveBeenCalledWith({
      clienteId: DTO.clienteId,
      usuarioId: 'usuario-existente',
      rolCodigo: DTO.rolCodigo,
      sobrescribir: false,
    });
  });

  it('falla con RolNoEncontradoError si el rolCodigo no existe en el catálogo', async () => {
    const { useCase, membresiaRepo } = buildDeps({
      roleRepo: { findByCodigo: vi.fn().mockResolvedValue(null) },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RolNoEncontradoError);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });

  it('falla con MembresiaYaActivaError si el usuario ya tiene membresía activa en ESTE cliente', async () => {
    const existente = UsuarioEntity.reconstitute(
      {
        email: DTO.email,
        nombre: 'Original',
        apellido: 'Original',
        passwordHash: 'hash-viejo',
        activo: true,
        isGlobalAdmin: false,
      },
      'usuario-existente',
      new Date(),
      new Date(),
      null,
    );
    const { useCase, membresiaRepo } = buildDeps({
      usuarioRepo: { findByEmail: vi.fn().mockResolvedValue(existente) },
      membresiaRepo: {
        findActivaByUsuarioYCliente: vi.fn().mockResolvedValue({
          clienteId: DTO.clienteId,
          clienteNombre: 'X',
          rolCodigo: 'USUARIO',
          permisos: [],
        }),
      },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaYaActivaError);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });
});
