import { describe, it, expect, vi } from 'vitest';
import { CrearUsuarioTenantUseCase } from './crear-usuario-tenant.use-case';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';
import type { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import type { IPermisosPorTipoDeCliente } from '../../domain/ports/i-permisos-por-tipo-de-cliente.port';
import { permisosPorTipoEnMemoria } from '../../test-helpers/permisos-por-tipo-en-memoria';
import type { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import type { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import type { IRoleRepository } from '../../domain/ports/i-role.repository';
import type { IHashProvider } from '../../domain/ports/i-hash.provider';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { Result } from '../../../shared/domain/result';
import {
  RolNoEncontradoError,
  MembresiaYaActivaError,
  PermisosPorTipoNoAplicadosError,
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

function buildDefaults() {
  return {
    usuarioRepo: {
      findByEmail: vi.fn<IUsuarioRepository['findByEmail']>().mockResolvedValue(null),
      create: vi.fn<IUsuarioRepository['create']>().mockResolvedValue(undefined),
    },
    membresiaRepo: {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(null),
      create: vi.fn<IMembresiaRepository['create']>().mockResolvedValue(undefined),
    },
    roleRepo: {
      findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(buildRole()),
    },
    hashProvider: {
      hash: vi.fn<IHashProvider['hash']>().mockResolvedValue('hashed-password'),
    },
    aplicarPresetPermisosUseCase: {
      execute: vi
        .fn<AplicarPresetPermisosUseCase['execute']>()
        .mockResolvedValue(Result.ok(undefined)),
    },
  };
}

type Deps = ReturnType<typeof buildDefaults>;

/** Cada override reemplaza solo los métodos que nombra; el resto queda con el default. */
type Overrides = { [K in keyof Deps]?: Partial<Deps[K]> };

function buildDeps(overrides: Overrides = {}) {
  const defaults = buildDefaults();
  const usuarioRepo = { ...defaults.usuarioRepo, ...overrides.usuarioRepo };
  const membresiaRepo = { ...defaults.membresiaRepo, ...overrides.membresiaRepo };
  const roleRepo = { ...defaults.roleRepo, ...overrides.roleRepo };
  const hashProvider = { ...defaults.hashProvider, ...overrides.hashProvider };
  const aplicarPresetPermisosUseCase = {
    ...defaults.aplicarPresetPermisosUseCase,
    ...overrides.aplicarPresetPermisosUseCase,
  };
  const useCase = new CrearUsuarioTenantUseCase(
    usuarioRepo,
    membresiaRepo,
    roleRepo,
    hashProvider,
    aplicarPresetPermisosUseCase,
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
    if (!rol) throw new Error('el doble de roleRepo tiene que devolver el rol');

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
        execute: vi
          .fn<AplicarPresetPermisosUseCase['execute']>()
          .mockResolvedValue(Result.fail(new PresetRolNoDefinidoError('TECNICO'))),
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
        usuarioRepo: {
          findByEmail: vi.fn<IUsuarioRepository['findByEmail']>().mockResolvedValue(existente),
        },
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
      roleRepo: { findByCodigo: vi.fn<IRoleRepository['findByCodigo']>().mockResolvedValue(null) },
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
      usuarioRepo: {
        findByEmail: vi.fn<IUsuarioRepository['findByEmail']>().mockResolvedValue(existente),
      },
      membresiaRepo: {
        findActivaByUsuarioYCliente: vi
          .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
          .mockResolvedValue({
            clienteId: DTO.clienteId,
            clienteNombre: 'X',
            rolCodigo: 'USUARIO',
            clienteRequiere2fa: false,
          }),
      },
    });

    const result = await useCase.execute(DTO);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaYaActivaError);
    expect(membresiaRepo.create).not.toHaveBeenCalled();
  });

  /**
   * T4c (odd/tasks/permisos-por-tipo-ticket.md): el alta escribe también las filas por tipo de
   * la plantilla. Se arma con el `AplicarPresetPermisosUseCase` real y el servicio real de la
   * plantilla sobre un repositorio en memoria, para afirmar sobre las filas que quedan.
   */
  describe('permisos por tipo de ticket (T4c)', () => {
    function conPresetReal(celdasMaster: string[], puerto: IPermisosPorTipoDeCliente) {
      const matriz = {
        setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>().mockResolvedValue(undefined),
        findByUsuarioYCliente: vi
          .fn<IMatrizPermisosRepository['findByUsuarioYCliente']>()
          .mockResolvedValue(celdasMaster),
      };
      const aplicarPreset = new AplicarPresetPermisosUseCase(matriz, puerto);
      // `buildDeps` mezcla los overrides con spread, que no copia métodos de prototipo.
      const deps = buildDeps({
        aplicarPresetPermisosUseCase: {
          execute: vi.fn((input) => aplicarPreset.execute(input)),
        },
      });
      return { ...deps, matriz };
    }

    it('el alta de un TECNICO deja sus filas por tipo en TICKETS y EDILICIA, en el tenant del token', async () => {
      const porTipo = permisosPorTipoEnMemoria();
      const { useCase } = conPresetReal([], porTipo.puerto);

      const result = await useCase.execute(DTO);

      expect(result.isOk()).toBe(true);
      const usuarioId = result.getValue().usuario.id;
      const filas = porTipo.repo.filasDe(usuarioId);
      expect(filas).toContain('tipo-soporte:ASIGNAR');
      expect(filas).toContain('tipo-mantenimiento:TRANSICIONAR');
      expect(filas).not.toContain('tipo-soporte:BORRADO');
      expect(porTipo.clientes).toEqual([DTO.clienteId]);
    });

    it('el alta de un ADMINISTRADOR no escribe filas por tipo', async () => {
      const porTipo = permisosPorTipoEnMemoria();
      const { useCase, roleRepo } = conPresetReal([], porTipo.puerto);
      roleRepo.findByCodigo.mockResolvedValue(
        RoleEntity.create({
          codigo: 'ADMINISTRADOR',
          nombre: 'Admin',
          descripcion: null,
          permisos: [],
        }),
      );

      const result = await useCase.execute({ ...DTO, rolCodigo: 'ADMINISTRADOR' });

      expect(result.isOk()).toBe(true);
      expect(porTipo.repo.filasDe(result.getValue().usuario.id)).toEqual([]);
    });

    it('el re-alta con filas por tipo existentes no las pisa (sobrescribir=false)', async () => {
      const existente = UsuarioEntity.create({
        email: DTO.email,
        nombre: 'Ya',
        apellido: 'Existia',
        passwordHash: 'hash',
        activo: true,
        isGlobalAdmin: false,
      });
      const porTipo = permisosPorTipoEnMemoria(undefined, [
        { usuarioId: existente.id, tipoId: 'tipo-soporte', accion: 'LECTURA' },
      ]);
      const { useCase, usuarioRepo } = conPresetReal([], porTipo.puerto);
      usuarioRepo.findByEmail.mockResolvedValue(existente);

      const result = await useCase.execute(DTO);

      expect(result.isOk()).toBe(true);
      expect(porTipo.repo.filasDe(existente.id)).toEqual(['tipo-soporte:LECTURA']);
    });

    it('si falla el tenant: la membresía queda, la matriz NO se toca (W1) y el error llega al llamador', async () => {
      const puerto: IPermisosPorTipoDeCliente = {
        aplicarPlantilla: vi
          .fn<IPermisosPorTipoDeCliente['aplicarPlantilla']>()
          .mockRejectedValue(new Error('base del tenant caída')),
      };
      const { useCase, membresiaRepo, matriz } = conPresetReal([], puerto);

      const result = await useCase.execute(DTO);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(PermisosPorTipoNoAplicadosError);
      expect(membresiaRepo.create).toHaveBeenCalledOnce();
      expect(matriz.setPermisos).not.toHaveBeenCalled();
    });
  });
});
