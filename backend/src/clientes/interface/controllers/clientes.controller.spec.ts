/**
 * clientes.controller.spec.ts — TDD RED→GREEN (T8.4, PR8).
 *
 * Unit test: instancia el controller directamente con el use case mockeado
 * (sin bootstrapear NestJS ni pasar por guards) — verifica traducción
 * HTTP ↔ use case y mapeo Result.fail → HttpException. La cobertura de
 * guards reales (JwtAuthGuard + GlobalAdminGuard) vía HTTP real vive en
 * `crear-cliente.e2e.spec.ts` (T8.5).
 */
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  AdminEmailYaRegistradoError,
  AdministradorRoleNotFoundError,
  ClienteNoEncontradoError,
  OnlyRootCanCreateClienteError,
} from '../../domain/errors/clientes.errors';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

function buildController() {
  const crearClienteUseCase = { execute: vi.fn() };
  const listarClientesUseCase = { execute: vi.fn() };
  const editarClienteUseCase = { execute: vi.fn() };
  const desactivarClienteUseCase = { execute: vi.fn() };
  const reactivarClienteUseCase = { execute: vi.fn() };
  const controller = new ClientesController(
    crearClienteUseCase as any,
    listarClientesUseCase as any,
    editarClienteUseCase as any,
    desactivarClienteUseCase as any,
    reactivarClienteUseCase as any,
  );
  return {
    controller,
    crearClienteUseCase,
    listarClientesUseCase,
    editarClienteUseCase,
    desactivarClienteUseCase,
    reactivarClienteUseCase,
  };
}

const ROOT_USER: JwtPayload = {
  sub: 'root-id',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  membresias: [],
};

const CREATE_DTO = {
  nombre: 'ACME S.A.',
  adminEmail: 'admin@acme.test',
  adminNombre: 'Ada',
  adminApellido: 'Admin',
  adminPassword: 'SuperSecret!123',
};

describe('ClientesController (T8.4)', () => {
  describe('POST /clientes', () => {
    it('crea el cliente y retorna 201 con el DTO de respuesta', async () => {
      const { controller, crearClienteUseCase } = buildController();
      const cliente = ClienteEntity.create({
        nombre: CREATE_DTO.nombre,
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_deadbeef',
        activo: true,
      });
      crearClienteUseCase.execute.mockResolvedValue(Result.ok(cliente));

      const result = await controller.create(ROOT_USER, CREATE_DTO as any);

      expect(result).toEqual({
        id: cliente.id,
        nombre: cliente.nombre,
        razonSocial: null,
        cuit: null,
        dbName: cliente.dbName,
        activo: true,
      });
      expect(crearClienteUseCase.execute).toHaveBeenCalledWith(
        {
          nombre: CREATE_DTO.nombre,
          razonSocial: null,
          cuit: null,
          adminEmail: CREATE_DTO.adminEmail,
          adminNombre: CREATE_DTO.adminNombre,
          adminApellido: CREATE_DTO.adminApellido,
          adminPassword: CREATE_DTO.adminPassword,
        },
        { isGlobalAdmin: true },
      );
    });

    it('propaga 403 ForbiddenException cuando el use case falla con OnlyRootCanCreateClienteError', async () => {
      const { controller, crearClienteUseCase } = buildController();
      crearClienteUseCase.execute.mockResolvedValue(
        Result.fail(new OnlyRootCanCreateClienteError()),
      );

      await expect(controller.create(ROOT_USER, CREATE_DTO as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('propaga 409 ConflictException cuando el use case falla con AdminEmailYaRegistradoError', async () => {
      const { controller, crearClienteUseCase } = buildController();
      crearClienteUseCase.execute.mockResolvedValue(
        Result.fail(new AdminEmailYaRegistradoError(CREATE_DTO.adminEmail)),
      );

      await expect(controller.create(ROOT_USER, CREATE_DTO as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('propaga 500 InternalServerErrorException cuando el use case falla con AdministradorRoleNotFoundError', async () => {
      const { controller, crearClienteUseCase } = buildController();
      crearClienteUseCase.execute.mockResolvedValue(
        Result.fail(new AdministradorRoleNotFoundError()),
      );

      await expect(controller.create(ROOT_USER, CREATE_DTO as any)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('GET /clientes (G3 parcial, sdd/beta-frontend — ROOT vía GlobalAdminGuard)', () => {
    it('retorna la lista de clientes mapeada a DTO', async () => {
      const { controller, listarClientesUseCase } = buildController();
      const cliente = ClienteEntity.create({
        nombre: CREATE_DTO.nombre,
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_deadbeef',
        activo: true,
      });
      listarClientesUseCase.execute.mockResolvedValue(Result.ok([cliente]));

      const result = await controller.listar();

      expect(result).toEqual([
        {
          id: cliente.id,
          nombre: cliente.nombre,
          razonSocial: null,
          cuit: null,
          dbName: cliente.dbName,
          activo: true,
        },
      ]);
    });
  });

  function buildCliente() {
    return ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: true,
    });
  }

  describe('PATCH /clientes/:id (editar)', () => {
    it('edita el cliente y retorna 200 con el DTO de respuesta', async () => {
      const { controller, editarClienteUseCase } = buildController();
      const cliente = buildCliente();
      editarClienteUseCase.execute.mockResolvedValue(Result.ok(cliente));

      const result = await controller.editar(cliente.id, {
        nombre: 'ACME Modificada',
        razonSocial: 'ACME Sociedad Anónima',
      } as any);

      expect(result.id).toBe(cliente.id);
      expect(editarClienteUseCase.execute).toHaveBeenCalledWith({
        clienteId: cliente.id,
        nombre: 'ACME Modificada',
        razonSocial: 'ACME Sociedad Anónima',
        cuit: undefined,
      });
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, editarClienteUseCase } = buildController();
      editarClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('id-inexistente')),
      );

      await expect(
        controller.editar('id-inexistente', { nombre: 'X' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH /clientes/:id/desactivar', () => {
    it('desactiva el cliente y retorna 200 con el DTO de respuesta (activo=false)', async () => {
      const { controller, desactivarClienteUseCase } = buildController();
      const cliente = buildCliente();
      cliente.suspend();
      desactivarClienteUseCase.execute.mockResolvedValue(Result.ok(cliente));

      const result = await controller.desactivar(cliente.id);

      expect(result.activo).toBe(false);
      expect(desactivarClienteUseCase.execute).toHaveBeenCalledWith(cliente.id);
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, desactivarClienteUseCase } = buildController();
      desactivarClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('id-inexistente')),
      );

      await expect(controller.desactivar('id-inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('PATCH /clientes/:id/activar', () => {
    it('reactiva el cliente y retorna 200 con el DTO de respuesta (activo=true)', async () => {
      const { controller, reactivarClienteUseCase } = buildController();
      const cliente = buildCliente();
      reactivarClienteUseCase.execute.mockResolvedValue(Result.ok(cliente));

      const result = await controller.activar(cliente.id);

      expect(result.activo).toBe(true);
      expect(reactivarClienteUseCase.execute).toHaveBeenCalledWith(cliente.id);
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, reactivarClienteUseCase } = buildController();
      reactivarClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('id-inexistente')),
      );

      await expect(controller.activar('id-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
