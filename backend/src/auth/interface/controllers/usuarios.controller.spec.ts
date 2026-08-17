/**
 * usuarios.controller.spec.ts — TDD RED→GREEN (gestión mínima de usuarios,
 * sdd/beta-frontend/spec §5). Unit test: instancia el controller
 * directamente con los use cases mockeados (mismo patrón que
 * `clientes.controller.spec.ts`) — NO cubre guards reales (JwtAuthGuard/
 * TenantGuard/PermissionsGuard, ya testeados aparte).
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import {
  MembresiaNoEncontradaError,
  MembresiaYaActivaError,
  ModuloInvalidoError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { payloadDeTest } from '../../test-helpers/payload-de-test';

function buildController() {
  const listarUsuariosTenantUseCase = { execute: vi.fn() };
  const crearUsuarioTenantUseCase = { execute: vi.fn() };
  const cambiarRolUsuarioTenantUseCase = { execute: vi.fn() };
  const desactivarMembresiaUsuarioTenantUseCase = { execute: vi.fn() };
  const obtenerModulosUsuarioTenantUseCase = { execute: vi.fn() };
  const asignarModulosUsuarioTenantUseCase = { execute: vi.fn() };
  const editarUsuarioTenantUseCase = { execute: vi.fn() };
  const obtenerPermisosUsuarioTenantUseCase = { execute: vi.fn() };
  const asignarPermisosUsuarioTenantUseCase = { execute: vi.fn() };
  const aplicarPresetPermisosUseCase = { execute: vi.fn() };
  const controller = new UsuariosController(
    listarUsuariosTenantUseCase as any,
    crearUsuarioTenantUseCase as any,
    cambiarRolUsuarioTenantUseCase as any,
    desactivarMembresiaUsuarioTenantUseCase as any,
    obtenerModulosUsuarioTenantUseCase as any,
    asignarModulosUsuarioTenantUseCase as any,
    editarUsuarioTenantUseCase as any,
    obtenerPermisosUsuarioTenantUseCase as any,
    asignarPermisosUsuarioTenantUseCase as any,
    aplicarPresetPermisosUseCase as any,
  );
  return {
    controller,
    listarUsuariosTenantUseCase,
    crearUsuarioTenantUseCase,
    cambiarRolUsuarioTenantUseCase,
    desactivarMembresiaUsuarioTenantUseCase,
    obtenerModulosUsuarioTenantUseCase,
    asignarModulosUsuarioTenantUseCase,
    editarUsuarioTenantUseCase,
    obtenerPermisosUsuarioTenantUseCase,
    asignarPermisosUsuarioTenantUseCase,
    aplicarPresetPermisosUseCase,
  };
}

function buildActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return payloadDeTest({
    sub: 'actor-id',
    cliente_id: 'cliente-token',
    rol: 'TECNICO',
    permisos: [],
    cliente_nombre: 'Cliente Token',
    ...overrides,
  });
}

const MEMBRESIA_ITEM = {
  membresiaId: 'm1',
  usuarioId: 'u1',
  nombre: 'Ada',
  apellido: 'Tec',
  email: 'ada@test.com',
  rolCodigo: 'TECNICO',
};

describe('UsuariosController (gestión mínima de usuarios, sdd/beta-frontend §5)', () => {
  describe('GET /usuarios', () => {
    it('con TICKETS:ASIGNAR retorna la lista SIN email (dato sensible, R10)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: ['TICKETS:ASIGNAR'] });

      const result = await controller.listar(actor);

      expect(listarUsuariosTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
      });
      expect(result).toEqual([{ id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO' }]);
      expect(result[0]).not.toHaveProperty('email');
    });

    it('con TICKETS:VER_TODOS retorna la lista SIN email', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: ['TICKETS:VER_TODOS'] });

      const result = await controller.listar(actor);

      expect(result[0]).not.toHaveProperty('email');
    });

    it('ADMINISTRADOR retorna la lista CON email (R10 — independiente de la regla OR de acceso)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ rol: 'ADMINISTRADOR', permisos: [] });

      const result = await controller.listar(actor);

      expect(result).toEqual([
        { id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO', email: 'ada@test.com' },
      ]);
    });

    it('TECNICO con TICKETS:ASIGNAR (no ADMINISTRADOR, no ROOT) NUNCA recibe email aunque entre a la lista (R10)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ rol: 'TECNICO', permisos: ['TICKETS:ASIGNAR'] });

      const result = await controller.listar(actor);

      expect('email' in result[0]).toBe(false);
    });

    it('sin TICKETS:ASIGNAR, TICKETS:VER_TODOS ni ser admin → 403 ForbiddenException (R4-excepción, S25)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      const actor = buildActor({ permisos: ['TICKETS:ALTAS'] });

      await expect(controller.listar(actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(listarUsuariosTenantUseCase.execute).not.toHaveBeenCalled();
    });

    // Regresión (sdd/root-access-fix): un ROOT scopeado a un tenant tiene
    // permisos=[]. El chequeo inline de acceso/email NO pasa por
    // PermissionsGuard (regla OR), así que debe honrar is_global_admin igual
    // que el guard — antes le daba 403 (podía CREAR usuarios pero no verlos).
    it('ROOT (is_global_admin, permisos=[]) lista CON email sin recibir 403', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: [], is_global_admin: true });

      const result = await controller.listar(actor);

      expect(listarUsuariosTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
      });
      expect(result).toEqual([
        { id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO', email: 'ada@test.com' },
      ]);
    });
  });

  describe('POST /usuarios', () => {
    const DTO = {
      email: 'nuevo@test.com',
      nombre: 'Nueva',
      apellido: 'Persona',
      password: 'Secreto123!',
      rolCodigo: 'TECNICO',
    };

    it('crea el usuario y retorna 201 con el DTO de respuesta, clienteId SIEMPRE del actor', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      const usuario = UsuarioEntity.create({
        email: DTO.email,
        nombre: DTO.nombre,
        apellido: DTO.apellido,
        passwordHash: 'hash',
        activo: true,
      });
      const membresia = MembresiaEntity.create({
        usuarioId: usuario.id,
        clienteId: 'cliente-token',
        rolId: 'rol-1',
        activo: true,
      });
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok({ usuario, membresia, rolCodigo: 'TECNICO' }),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.crear(actor, DTO as any);

      expect(crearUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        ...DTO,
      });
      expect(result).toEqual({
        usuarioId: usuario.id,
        email: DTO.email,
        nombre: DTO.nombre,
        apellido: DTO.apellido,
        rol: 'TECNICO',
        membresiaId: membresia.id,
        activo: true,
      });
    });

    it('propaga 422 UnprocessableEntityException cuando el rol no existe', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new RolNoEncontradoError('INEXISTENTE')),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.crear(actor, DTO as any)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('propaga 409 ConflictException cuando el usuario ya tiene membresía activa', async () => {
      const { controller, crearUsuarioTenantUseCase } = buildController();
      crearUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaYaActivaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.crear(actor, DTO as any)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('PATCH /usuarios/:id/rol', () => {
    it('cambia el rol y retorna 200, clienteId SIEMPRE del actor', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-2', activo: true },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.cambiarRol(actor, 'usuario-1', { rolCodigo: 'ADMINISTRADOR' } as any);

      expect(cambiarRolUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'ADMINISTRADOR',
        reaplicarPreset: undefined,
      });
    });

    it('R6 — reenvía reaplicarPreset: true al use case', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-2', activo: true },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.cambiarRol(actor, 'usuario-1', {
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      } as any);

      expect(cambiarRolUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
        reaplicarPreset: true,
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, cambiarRolUsuarioTenantUseCase } = buildController();
      cambiarRolUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.cambiarRol(actor, 'usuario-ajeno', { rolCodigo: 'TECNICO' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH /usuarios/:id', () => {
    it('edita nombre/apellido y retorna { usuarioId, nombre, apellido }, clienteId SIEMPRE del actor', async () => {
      const { controller, editarUsuarioTenantUseCase } = buildController();
      const usuario = UsuarioEntity.reconstitute(
        {
          email: 'ada@test.com',
          nombre: 'Ada',
          apellido: 'Lovelace',
          passwordHash: 'hash',
          activo: true,
        },
        'usuario-1',
        new Date(),
        new Date(),
        null,
      );
      editarUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(usuario));
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.editar(actor, 'usuario-1', {
        nombre: 'Ada',
        apellido: 'Lovelace',
      } as any);

      expect(editarUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        nombre: 'Ada',
        apellido: 'Lovelace',
      });
      expect(result).toEqual({ usuarioId: 'usuario-1', nombre: 'Ada', apellido: 'Lovelace' });
    });

    it('propaga 404 NotFoundException cuando no hay membresía activa en este cliente', async () => {
      const { controller, editarUsuarioTenantUseCase } = buildController();
      editarUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      await expect(
        controller.editar(actor, 'usuario-ajeno', { nombre: 'X' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('DELETE /usuarios/:id/membresia', () => {
    it('desactiva la membresía y retorna 204 (void), clienteId SIEMPRE del actor', async () => {
      const { controller, desactivarMembresiaUsuarioTenantUseCase } = buildController();
      const membresia = MembresiaEntity.reconstitute(
        { usuarioId: 'usuario-1', clienteId: 'cliente-token', rolId: 'rol-1', activo: false },
        'membresia-1',
        new Date(),
        new Date(),
        null,
      );
      desactivarMembresiaUsuarioTenantUseCase.execute.mockResolvedValue(Result.ok(membresia));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await controller.desactivarMembresia(actor, 'usuario-1');

      expect(desactivarMembresiaUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, desactivarMembresiaUsuarioTenantUseCase } = buildController();
      desactivarMembresiaUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(controller.desactivarMembresia(actor, 'usuario-ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('GET /usuarios/:id/modulos', () => {
    it('retorna { modulos } del cliente del token', async () => {
      const { controller, obtenerModulosUsuarioTenantUseCase } = buildController();
      obtenerModulosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok(['SOPORTE', 'COMPRAS']),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.obtenerModulos(actor, 'usuario-1');

      expect(obtenerModulosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
      });
      expect(result).toEqual({ modulos: ['SOPORTE', 'COMPRAS'] });
    });
  });

  describe('PATCH /usuarios/:id/modulos', () => {
    it('asigna los módulos y retorna { usuarioId, modulos }, clienteId SIEMPRE del actor', async () => {
      const { controller, asignarModulosUsuarioTenantUseCase } = buildController();
      asignarModulosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok(['SOPORTE', 'EQUIPOS']),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.asignarModulos(actor, 'usuario-1', {
        modulos: ['SOPORTE', 'EQUIPOS'],
      } as any);

      expect(asignarModulosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        modulos: ['SOPORTE', 'EQUIPOS'],
      });
      expect(result).toEqual({ usuarioId: 'usuario-1', modulos: ['SOPORTE', 'EQUIPOS'] });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, asignarModulosUsuarioTenantUseCase } = buildController();
      asignarModulosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.asignarModulos(actor, 'usuario-ajeno', { modulos: ['SOPORTE'] } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propaga 422 UnprocessableEntityException cuando algún módulo es inválido', async () => {
      const { controller, asignarModulosUsuarioTenantUseCase } = buildController();
      asignarModulosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new ModuloInvalidoError(['INEXISTENTE'])),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.asignarModulos(actor, 'usuario-1', { modulos: ['INEXISTENTE'] } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  // ─── ABM de la matriz de permisos (WU-7.4, sdd/matriz-permisos-por-usuario) ─

  describe('GET /usuarios/:id/permisos', () => {
    it('retorna celdas + esAdministrador + catalogo', async () => {
      const { controller, obtenerPermisosUsuarioTenantUseCase } = buildController();
      obtenerPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok({ celdas: ['TICKETS:LECTURA'], esAdministrador: false }),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.obtenerPermisos(actor, 'usuario-1');

      expect(obtenerPermisosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
      });
      expect(result.celdas).toEqual(['TICKETS:LECTURA']);
      expect(result.esAdministrador).toBe(false);
      expect(result.catalogo).toBeDefined();
      expect(result.catalogo.DASHBOARD).toBeDefined();
    });

    it('propaga 404 NotFoundException cuando no hay membresía activa en este cliente', async () => {
      const { controller, obtenerPermisosUsuarioTenantUseCase } = buildController();
      obtenerPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      await expect(controller.obtenerPermisos(actor, 'usuario-ajeno')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('PATCH /usuarios/:id/permisos', () => {
    it('reemplaza las celdas y retorna { usuarioId, celdas }, clienteId SIEMPRE del actor', async () => {
      const { controller, asignarPermisosUsuarioTenantUseCase } = buildController();
      asignarPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.ok(['TICKETS:LECTURA', 'TICKETS:ALTAS']),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.asignarPermisos(actor, 'usuario-1', {
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      } as any);

      expect(asignarPermisosUsuarioTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      });
      expect(result).toEqual({
        usuarioId: 'usuario-1',
        celdas: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      });
    });

    it('propaga 404 NotFoundException cuando la membresía no existe en este cliente', async () => {
      const { controller, asignarPermisosUsuarioTenantUseCase } = buildController();
      asignarPermisosUsuarioTenantUseCase.execute.mockResolvedValue(
        Result.fail(new MembresiaNoEncontradaError()),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.asignarPermisos(actor, 'usuario-ajeno', { celdas: ['TICKETS:LECTURA'] } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('POST /usuarios/:id/permisos/aplicar-preset', () => {
    it('aplica el preset y retorna { usuarioId, rolCodigo }', async () => {
      const { controller, aplicarPresetPermisosUseCase } = buildController();
      aplicarPresetPermisosUseCase.execute.mockResolvedValue(Result.ok(undefined));
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      const result = await controller.aplicarPresetPermisos(actor, 'usuario-1', {
        rolCodigo: 'TECNICO',
      } as any);

      expect(aplicarPresetPermisosUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        rolCodigo: 'TECNICO',
      });
      expect(result).toEqual({ usuarioId: 'usuario-1', rolCodigo: 'TECNICO' });
    });

    it('propaga 422 UnprocessableEntityException cuando el rol no tiene preset definido', async () => {
      const { controller, aplicarPresetPermisosUseCase } = buildController();
      aplicarPresetPermisosUseCase.execute.mockResolvedValue(
        Result.fail(new PresetRolNoDefinidoError('ROL_SIN_PRESET')),
      );
      const actor = buildActor({ permisos: ['usuario:gestionar', 'rol:asignar'] });

      await expect(
        controller.aplicarPresetPermisos(actor, 'usuario-1', {
          rolCodigo: 'ROL_SIN_PRESET',
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
