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
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteEmailConfigState } from '../../domain/ports/i-cliente-email-config.repository';
import {
  AdminEmailYaRegistradoError,
  AdministradorRoleNotFoundError,
  ClienteNoEncontradoError,
  CorreoNoConfiguradoError,
  CorreoPasswordFaltanteError,
  EmailCryptoKeyAusenteError,
  OnlyRootCanCreateClienteError,
} from '../../domain/errors/clientes.errors';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

function buildController() {
  const crearClienteUseCase = { execute: vi.fn() };
  const listarClientesUseCase = { execute: vi.fn() };
  const editarClienteUseCase = { execute: vi.fn() };
  const desactivarClienteUseCase = { execute: vi.fn() };
  const reactivarClienteUseCase = { execute: vi.fn() };
  const configurarCorreoClienteUseCase = { execute: vi.fn() };
  const quitarCorreoClienteUseCase = { execute: vi.fn() };
  const probarCorreoClienteUseCase = { execute: vi.fn() };
  const verCorreoClienteUseCase = { execute: vi.fn() };
  const controller = new ClientesController(
    crearClienteUseCase as any,
    listarClientesUseCase as any,
    editarClienteUseCase as any,
    desactivarClienteUseCase as any,
    reactivarClienteUseCase as any,
    configurarCorreoClienteUseCase as any,
    quitarCorreoClienteUseCase as any,
    probarCorreoClienteUseCase as any,
    verCorreoClienteUseCase as any,
  );
  return {
    controller,
    crearClienteUseCase,
    listarClientesUseCase,
    editarClienteUseCase,
    desactivarClienteUseCase,
    reactivarClienteUseCase,
    configurarCorreoClienteUseCase,
    quitarCorreoClienteUseCase,
    probarCorreoClienteUseCase,
    verCorreoClienteUseCase,
  };
}

const CORREO_STATE_CONFIGURADO: ClienteEmailConfigState = {
  configurado: true,
  host: 'smtp.acme.com',
  port: 587,
  user: 'u',
  secure: false,
  from: 'from@acme.com',
  verificadoAt: new Date('2026-08-20T12:00:00Z'),
  verificacionError: null,
};

const ROOT_USER: JwtPayload = payloadDeTest({
  sub: 'root-id',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
});

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
    it('retorna la lista de clientes mapeada a DTO, con el resumen de correo (D7/#2359)', async () => {
      const { controller, listarClientesUseCase } = buildController();
      const cliente = ClienteEntity.create({
        nombre: CREATE_DTO.nombre,
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_deadbeef',
        activo: true,
      });
      const verificadoAt = new Date('2026-08-20T12:00:00Z');
      listarClientesUseCase.execute.mockResolvedValue(
        Result.ok([{ cliente, correo: { configurado: true, verificadoAt } }]),
      );

      const result = await controller.listar();

      expect(result).toEqual([
        {
          id: cliente.id,
          nombre: cliente.nombre,
          razonSocial: null,
          cuit: null,
          dbName: cliente.dbName,
          activo: true,
          correo: { configurado: true, verificadoAt },
        },
      ]);
    });

    it('[CRITICAL] el resumen de correo del listado NUNCA incluye la contraseña bajo ninguna clave', async () => {
      const { controller, listarClientesUseCase } = buildController();
      const cliente = ClienteEntity.create({
        nombre: CREATE_DTO.nombre,
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_deadbeef',
        activo: true,
      });
      listarClientesUseCase.execute.mockResolvedValue(
        Result.ok([{ cliente, correo: { configurado: true, verificadoAt: null } }]),
      );

      const [result] = await controller.listar();

      expect(Object.keys(result.correo)).not.toContain('password');
      expect(Object.keys(result.correo)).toEqual(['configurado', 'verificadoAt']);
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

  describe('GET /clientes/:id/correo (ver, D7)', () => {
    it('retorna el detalle de correo del cliente', async () => {
      const { controller, verCorreoClienteUseCase } = buildController();
      verCorreoClienteUseCase.execute.mockResolvedValue(Result.ok(CORREO_STATE_CONFIGURADO));

      const result = await controller.verCorreo('cliente-1');

      expect(result).toEqual({
        configurado: true,
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
        verificadoAt: CORREO_STATE_CONFIGURADO.verificadoAt,
        verificacionError: null,
      });
      expect(verCorreoClienteUseCase.execute).toHaveBeenCalledWith('cliente-1');
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, verCorreoClienteUseCase } = buildController();
      verCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('inexistente')),
      );

      await expect(controller.verCorreo('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PATCH /clientes/:id/correo (configurar, D7)', () => {
    it('[CRITICAL] la respuesta NUNCA incluye la contraseña bajo ninguna clave', async () => {
      const { controller, configurarCorreoClienteUseCase } = buildController();
      configurarCorreoClienteUseCase.execute.mockResolvedValue(Result.ok(CORREO_STATE_CONFIGURADO));

      const result = await controller.configurarCorreo('cliente-1', {
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
        password: 'super-secreta',
      } as any);

      expect(Object.keys(result)).not.toContain('password');
      expect(JSON.stringify(result)).not.toContain('super-secreta');
      expect(result).toEqual({
        configurado: true,
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
        verificadoAt: CORREO_STATE_CONFIGURADO.verificadoAt,
        verificacionError: null,
      });
    });

    it('traduce el command con `password: undefined` cuando el DTO lo omite (preserva la existente)', async () => {
      const { controller, configurarCorreoClienteUseCase } = buildController();
      configurarCorreoClienteUseCase.execute.mockResolvedValue(Result.ok(CORREO_STATE_CONFIGURADO));

      await controller.configurarCorreo('cliente-1', {
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
      } as any);

      expect(configurarCorreoClienteUseCase.execute).toHaveBeenCalledWith({
        clienteId: 'cliente-1',
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
        password: undefined,
      });
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, configurarCorreoClienteUseCase } = buildController();
      configurarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('inexistente')),
      );

      await expect(
        controller.configurarCorreo('inexistente', {
          host: 'h',
          port: 1,
          user: 'u',
          secure: false,
          from: 'f',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propaga 400 BadRequestException cuando falta la contraseña y no hay nada que preservar', async () => {
      const { controller, configurarCorreoClienteUseCase } = buildController();
      configurarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new CorreoPasswordFaltanteError()),
      );

      await expect(
        controller.configurarCorreo('cliente-1', {
          host: 'h',
          port: 1,
          user: 'u',
          secure: false,
          from: 'f',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('[CRITICAL] propaga 503 ServiceUnavailableException cuando falta EMAIL_CRYPTO_KEY', async () => {
      const { controller, configurarCorreoClienteUseCase } = buildController();
      configurarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new EmailCryptoKeyAusenteError()),
      );

      await expect(
        controller.configurarCorreo('cliente-1', {
          host: 'h',
          port: 1,
          user: 'u',
          secure: false,
          from: 'f',
          password: 'x',
        } as any),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('DELETE /clientes/:id/correo (quitar, D7)', () => {
    it('quita la config y retorna el estado "no configurado"', async () => {
      const { controller, quitarCorreoClienteUseCase } = buildController();
      const estadoVacio: ClienteEmailConfigState = {
        configurado: false,
        host: null,
        port: null,
        user: null,
        secure: null,
        from: null,
        verificadoAt: null,
        verificacionError: null,
      };
      quitarCorreoClienteUseCase.execute.mockResolvedValue(Result.ok(estadoVacio));

      const result = await controller.quitarCorreo('cliente-1');

      expect(result.configurado).toBe(false);
      expect(quitarCorreoClienteUseCase.execute).toHaveBeenCalledWith('cliente-1');
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, quitarCorreoClienteUseCase } = buildController();
      quitarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('inexistente')),
      );

      await expect(controller.quitarCorreo('inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('POST /clientes/:id/correo/probar (D6)', () => {
    it('prueba la conexión y retorna el estado actualizado', async () => {
      const { controller, probarCorreoClienteUseCase } = buildController();
      probarCorreoClienteUseCase.execute.mockResolvedValue(Result.ok(CORREO_STATE_CONFIGURADO));

      const result = await controller.probarCorreo('cliente-1');

      expect(result).toEqual({
        configurado: true,
        host: 'smtp.acme.com',
        port: 587,
        user: 'u',
        secure: false,
        from: 'from@acme.com',
        verificadoAt: CORREO_STATE_CONFIGURADO.verificadoAt,
        verificacionError: null,
      });
      expect(probarCorreoClienteUseCase.execute).toHaveBeenCalledWith('cliente-1');
    });

    it('propaga 400 BadRequestException cuando el cliente no tiene config guardada', async () => {
      const { controller, probarCorreoClienteUseCase } = buildController();
      probarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new CorreoNoConfiguradoError()),
      );

      await expect(controller.probarCorreo('cliente-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('propaga 404 NotFoundException cuando el cliente no existe', async () => {
      const { controller, probarCorreoClienteUseCase } = buildController();
      probarCorreoClienteUseCase.execute.mockResolvedValue(
        Result.fail(new ClienteNoEncontradoError('inexistente')),
      );

      await expect(controller.probarCorreo('inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
