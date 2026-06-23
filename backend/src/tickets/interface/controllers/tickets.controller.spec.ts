/**
 * 3.E.1 TEST — Unit tests para TicketsController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Extrae clienteId y autorId del JWT via @CurrentUser().
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 * - @RequirePermissions() aplicado por endpoint.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 * El guard chain se verifica vía Reflect.getMetadata.
 *
 * Tarea: 3.E.1
 */

import {
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ArchivoEntity } from '../../domain/entities/archivo.entity';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  TicketNoEncontradoError,
  TransicionInvalidaError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  ArchivoTamanoCeroError,
  EstadoCatalogoNoEncontradoError,
  EstadoDestinoInvalidoError,
} from '../../domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import {
  CreateTicketHttpDto,
  TransicionarEstadoHttpDto,
  AsignarTicketHttpDto,
} from '../dtos/tickets.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'test@example.com',
    roles: ['ADMIN'],
    permisos: ['ticket:crear', 'ticket:asignar', 'ticket:cerrar', 'ticket:ver_todos'],
    ...overrides,
  };
}

function makeTicket(): TicketEntity {
  return TicketEntity.create({
    numero: 'SOP-2026-00001',
    titulo: 'Ticket de prueba',
    descripcion: null,
    tipoId: 'tipo-001',
    estadoId: 'estado-abierto',
    prioridadId: 'prioridad-media',
    cicloId: null,
    solicitanteId: 'user-001',
    asignadoId: null,
    fechaVencimiento: null,
  });
}

function makeArchivo(): ArchivoEntity {
  const result = ArchivoEntity.create({
    storageKey: 'tickets/ticket-001/archivo-001',
    nombreOriginal: 'documento.pdf',
    mimeType: 'application/pdf',
    tamanoBytes: BigInt(1024),
    subidoPorId: 'user-001',
  });
  return result.getValue();
}

function makeMockFile(): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'documento.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: Buffer.from('test content'),
    size: 1024,
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  };
}

function makeCreateDto(): CreateTicketHttpDto {
  return {
    titulo: 'Nuevo ticket',
    tipoId: 'tipo-001',
    prioridadId: 'prioridad-media',
    solicitanteId: 'user-001',
  };
}

function makeUseCaseMocks() {
  return {
    crearTicketUseCase: { execute: jest.fn() },
    obtenerTicketUseCase: { execute: jest.fn() },
    transicionarEstadoUseCase: { execute: jest.fn() },
    asignarTicketUseCase: { execute: jest.fn() },
    adjuntarArchivoUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TicketsController', () => {
  let controller: TicketsController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new TicketsController(
      mocks.crearTicketUseCase as any,
      mocks.obtenerTicketUseCase as any,
      mocks.transicionarEstadoUseCase as any,
      mocks.asignarTicketUseCase as any,
      mocks.adjuntarArchivoUseCase as any,
    );
  });

  // ─── POST /tickets ─────────────────────────────────────────────────────────

  describe('POST /tickets (crearTicket)', () => {
    it('retorna 201 con datos del ticket creado', async () => {
      const ticket = makeTicket();
      mocks.crearTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.crearTicket(makeCreateDto(), user);

      expect(result).toMatchObject({
        id: ticket.id,
        numero: 'SOP-2026-00001',
        titulo: 'Ticket de prueba',
        estadoId: 'estado-abierto',
      });
    });

    it('lanza UnprocessableEntityException cuando el solicitante es inválido', async () => {
      mocks.crearTicketUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('user-x')),
      );

      await expect(controller.crearTicket(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el tipo de ticket no existe en catálogo', async () => {
      mocks.crearTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TipoTicketNoEncontradoError('tipo-x')),
      );

      await expect(controller.crearTicket(makeCreateDto(), user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza InternalServerErrorException para error de catálogo interno (seed)', async () => {
      mocks.crearTicketUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO')),
      );

      await expect(controller.crearTicket(makeCreateDto(), user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('pasa clienteId y autorId del JWT al use case', async () => {
      const ticket = makeTicket();
      mocks.crearTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));
      const dto = makeCreateDto();

      await controller.crearTicket(dto, user);

      expect(mocks.crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'cli-abc',
          autorId: 'user-001',
        }),
      );
    });
  });

  // ─── GET /tickets/:id ──────────────────────────────────────────────────────

  describe('GET /tickets/:id (obtenerTicket)', () => {
    it('retorna 200 con datos del ticket encontrado', async () => {
      const ticket = makeTicket();
      mocks.obtenerTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.obtenerTicket(ticket.id);

      expect(result).toMatchObject({
        id: ticket.id,
        numero: 'SOP-2026-00001',
        titulo: 'Ticket de prueba',
      });
      expect(mocks.obtenerTicketUseCase.execute).toHaveBeenCalledWith(ticket.id);
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.obtenerTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('id-inexistente')),
      );

      await expect(controller.obtenerTicket('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── PATCH /tickets/:id/estado ─────────────────────────────────────────────

  describe('PATCH /tickets/:id/estado (transicionarEstado)', () => {
    const estadoDto: TransicionarEstadoHttpDto = { nuevoEstadoCodigo: 'EN_PROGRESO' };

    it('retorna 200 con ticket en el nuevo estado', async () => {
      const ticket = makeTicket();
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.transicionarEstado(ticket.id, estadoDto, user);

      expect(result).toMatchObject({ id: ticket.id });
      expect(mocks.transicionarEstadoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: ticket.id,
          nuevoEstadoCodigo: 'EN_PROGRESO',
          autorId: 'user-001',
        }),
      );
    });

    it('lanza UnprocessableEntityException en transición inválida', async () => {
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(
        Result.fail(new TransicionInvalidaError('CERRADO', 'EN_PROGRESO')),
      );

      await expect(controller.transicionarEstado('ticket-id', estadoDto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-id')),
      );

      await expect(controller.transicionarEstado('ticket-id', estadoDto, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('pasa autorId del JWT al use case', async () => {
      const ticket = makeTicket();
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(Result.ok(ticket));

      await controller.transicionarEstado('t-id', estadoDto, user);

      expect(mocks.transicionarEstadoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ autorId: 'user-001' }),
      );
    });

    it('lanza UnprocessableEntityException cuando el código de estado destino no existe en catálogo', async () => {
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoDestinoInvalidoError('ESTADO_INEXISTENTE')),
      );

      await expect(controller.transicionarEstado('ticket-id', estadoDto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ─── POST /tickets/:id/asignar ─────────────────────────────────────────────

  describe('POST /tickets/:id/asignar (asignarTicket)', () => {
    const asignarDto: AsignarTicketHttpDto = { asignadoId: 'user-002' };

    it('retorna 200 con ticket asignado', async () => {
      const ticket = makeTicket();
      mocks.asignarTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.asignarTicket('ticket-id', asignarDto, user);

      expect(result).toMatchObject({ id: ticket.id });
      expect(mocks.asignarTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-id',
          asignadoId: 'user-002',
          clienteId: 'cli-abc',
          autorId: 'user-001',
        }),
      );
    });

    it('lanza UnprocessableEntityException cuando el asignado no existe o está inactivo', async () => {
      mocks.asignarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new AsignadoInvalidoError('user-x')),
      );

      await expect(controller.asignarTicket('ticket-id', asignarDto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza UnprocessableEntityException cuando el asignado no es elegible para el tipo', async () => {
      mocks.asignarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new AsignadoNoElegibleError('user-002', 'tipo-001')),
      );

      await expect(controller.asignarTicket('ticket-id', asignarDto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.asignarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-id')),
      );

      await expect(controller.asignarTicket('ticket-id', asignarDto, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── POST /tickets/:id/adjuntos ────────────────────────────────────────────

  describe('POST /tickets/:id/adjuntos (adjuntarArchivo)', () => {
    it('retorna 201 con metadata del archivo adjunto', async () => {
      const archivo = makeArchivo();
      mocks.adjuntarArchivoUseCase.execute.mockResolvedValue(Result.ok(archivo));
      const file = makeMockFile();

      const result = await controller.adjuntarArchivo('ticket-id', file, user);

      expect(result).toMatchObject({
        id: archivo.id,
        nombreOriginal: 'documento.pdf',
        mimeType: 'application/pdf',
        tamanoBytes: '1024',
      });
      expect(mocks.adjuntarArchivoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-id',
          nombreOriginal: 'documento.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: BigInt(1024),
          subidoPorId: 'user-001',
        }),
      );
    });

    it('lanza UnprocessableEntityException cuando tamano_bytes = 0', async () => {
      mocks.adjuntarArchivoUseCase.execute.mockResolvedValue(
        Result.fail(new ArchivoTamanoCeroError(BigInt(0))),
      );
      const file = { ...makeMockFile(), size: 0 };

      await expect(controller.adjuntarArchivo('ticket-id', file, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.adjuntarArchivoUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-id')),
      );
      const file = makeMockFile();

      await expect(controller.adjuntarArchivo('ticket-id', file, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso ticket:crear en crearTicket', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.crearTicket) ?? [];
      expect(perms).toContain('ticket:crear');
    });

    it('requiere permiso ticket:asignar en asignarTicket', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.asignarTicket) ?? [];
      expect(perms).toContain('ticket:asignar');
    });

    it('requiere permiso ticket:crear en adjuntarArchivo', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.adjuntarArchivo) ?? [];
      expect(perms).toContain('ticket:crear');
    });
  });
});
