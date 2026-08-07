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
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { JwtPayload } from '../../domain/ports/i-token.service';

function buildController() {
  const listarUsuariosTenantUseCase = { execute: vi.fn() };
  const crearUsuarioTenantUseCase = { execute: vi.fn() };
  const cambiarRolUsuarioTenantUseCase = { execute: vi.fn() };
  const desactivarMembresiaUsuarioTenantUseCase = { execute: vi.fn() };
  const obtenerModulosUsuarioTenantUseCase = { execute: vi.fn() };
  const asignarModulosUsuarioTenantUseCase = { execute: vi.fn() };
  const controller = new UsuariosController(
    listarUsuariosTenantUseCase as any,
    crearUsuarioTenantUseCase as any,
    cambiarRolUsuarioTenantUseCase as any,
    desactivarMembresiaUsuarioTenantUseCase as any,
    obtenerModulosUsuarioTenantUseCase as any,
    asignarModulosUsuarioTenantUseCase as any,
  );
  return {
    controller,
    listarUsuariosTenantUseCase,
    crearUsuarioTenantUseCase,
    cambiarRolUsuarioTenantUseCase,
    desactivarMembresiaUsuarioTenantUseCase,
    obtenerModulosUsuarioTenantUseCase,
    asignarModulosUsuarioTenantUseCase,
  };
}

function buildActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'actor-id',
    cliente_id: 'cliente-token',
    rol: 'TECNICO',
    permisos: [],
    is_global_admin: false,
    cliente_nombre: 'Cliente Token',
    membresias: [],
    ...overrides,
  };
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
    it('con ticket:asignar retorna la lista SIN email (dato sensible)', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: ['ticket:asignar'] });

      const result = await controller.listar(actor);

      expect(listarUsuariosTenantUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-token',
      });
      expect(result).toEqual([{ id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO' }]);
    });

    it('con ticket:ver_todos retorna la lista SIN email', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: ['ticket:ver_todos'] });

      const result = await controller.listar(actor);

      expect(result[0]).not.toHaveProperty('email');
    });

    it('con usuario:gestionar retorna la lista CON email', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      listarUsuariosTenantUseCase.execute.mockResolvedValue(Result.ok([MEMBRESIA_ITEM]));
      const actor = buildActor({ permisos: ['usuario:gestionar'] });

      const result = await controller.listar(actor);

      expect(result).toEqual([
        { id: 'u1', nombre: 'Ada', apellido: 'Tec', rol: 'TECNICO', email: 'ada@test.com' },
      ]);
    });

    it('sin ninguno de los 3 permisos → 403 ForbiddenException', async () => {
      const { controller, listarUsuariosTenantUseCase } = buildController();
      const actor = buildActor({ permisos: ['ticket:crear'] });

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
});
