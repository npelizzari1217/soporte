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
  TicketNoEditableError,
  TituloInvalidoError,
  PrioridadNoEncontradaError,
  CicloNoEncontradoError,
  TipoOperacionNoEncontradoError,
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
  UpdateTicketHttpDto,
  ListarTicketsQueryDto,
  CicloActivoResponseDto,
} from '../dtos/tickets.dto';
import { FechaResolucionRequeridaError } from '../../domain/errors/tickets.errors';
import { CicloClienteEntity, CicloClienteProps } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'test@example.com',
    roles: ['ADMIN'],
    permisos: ['ticket:crear', 'ticket:asignar', 'ticket:cerrar', 'ticket:ver_todos'],
    cliente_nombre: 'Test Corp',
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
    fechaResolucion: null,
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

function makeCiclo(overrides: Partial<CicloClienteProps> = {}): CicloClienteEntity {
  return CicloClienteEntity.reconstitute(
    {
      cicloVigenteId: 'cv-001',
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
      ...overrides,
    },
    'ciclo-uuid-001',
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    null,
  );
}

function makeUseCaseMocks() {
  return {
    crearTicketUseCase: { execute: vi.fn() },
    listarTicketsUseCase: { execute: vi.fn() },
    obtenerTicketUseCase: { execute: vi.fn() },
    transicionarEstadoUseCase: { execute: vi.fn() },
    asignarTicketUseCase: { execute: vi.fn() },
    adjuntarArchivoUseCase: { execute: vi.fn() },
    editarTicketUseCase: { execute: vi.fn() },
    eliminarTicketUseCase: { execute: vi.fn() },
    cicloClienteRepo: {
      findById: vi.fn(),
      findActive: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
    } satisfies vi.Mocked<ICicloClienteRepository>,
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
      mocks.listarTicketsUseCase as any,
      mocks.obtenerTicketUseCase as any,
      mocks.transicionarEstadoUseCase as any,
      mocks.asignarTicketUseCase as any,
      mocks.adjuntarArchivoUseCase as any,
      mocks.editarTicketUseCase as any,
      mocks.eliminarTicketUseCase as any,
      mocks.cicloClienteRepo as any,
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

  // ─── GET /tickets ──────────────────────────────────────────────────────────

  describe('GET /tickets (listarTickets)', () => {
    it('retorna 200 con la lista de tickets del tenant (sin filtros)', async () => {
      const ticket = makeTicket();
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([ticket]));

      const result = await controller.listarTickets({}, user);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: ticket.id,
        numero: 'SOP-2026-00001',
        titulo: 'Ticket de prueba',
      });
      expect(mocks.listarTicketsUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('retorna 200 con lista vacía cuando no hay tickets', async () => {
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.listarTickets({}, user);

      expect(result).toHaveLength(0);
    });

    // ─── Filtros (T1.7 RED) ──────────────────────────────────────────────

    it('coerce tiposIds string único a array al pasar al use case', async () => {
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([]));
      const query: ListarTicketsQueryDto = { tiposIds: 'uuid-a' };

      await controller.listarTickets(query, user);

      expect(mocks.listarTicketsUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tiposIds: ['uuid-a'] }),
      );
    });

    it('pasa tiposIds array tal como llega al use case', async () => {
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([]));
      const query: ListarTicketsQueryDto = { tiposIds: ['uuid-a', 'uuid-b'] };

      await controller.listarTickets(query, user);

      expect(mocks.listarTicketsUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tiposIds: ['uuid-a', 'uuid-b'] }),
      );
    });

    it('convierte fechaDesde a startOfDay y fechaHasta a endOfDay', async () => {
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([]));
      const query: ListarTicketsQueryDto = { fechaDesde: '2026-01-01', fechaHasta: '2026-06-30' };

      await controller.listarTickets(query, user);

      const llamada = mocks.listarTicketsUseCase.execute.mock.calls[0][0];
      expect(llamada.fechaDesde).toBeInstanceOf(Date);
      expect(llamada.fechaHasta).toBeInstanceOf(Date);
      // startOfDay: 00:00:00.000
      expect(llamada.fechaDesde.getUTCHours()).toBe(0);
      expect(llamada.fechaDesde.getUTCMinutes()).toBe(0);
      // endOfDay: 23:59:59.999
      expect(llamada.fechaHasta.getUTCHours()).toBe(23);
      expect(llamada.fechaHasta.getUTCMinutes()).toBe(59);
    });

    it('lanza UnprocessableEntityException cuando fechaDesde > fechaHasta (rango inválido)', async () => {
      const query: ListarTicketsQueryDto = {
        fechaDesde: '2026-12-31',
        fechaHasta: '2026-01-01',
      };

      await expect(controller.listarTickets(query, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ignora fechaDesde con formato inválido (no lanza 422)', async () => {
      mocks.listarTicketsUseCase.execute.mockResolvedValue(Result.ok([]));
      const query: ListarTicketsQueryDto = { fechaDesde: 'no-es-fecha' };

      await controller.listarTickets(query, user);

      const llamada = mocks.listarTicketsUseCase.execute.mock.calls[0][0];
      expect(llamada.fechaDesde).toBeUndefined();
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

  // ─── PATCH /tickets/:id ────────────────────────────────────────────────────

  describe('PATCH /tickets/:id (editarTicket)', () => {
    const updateDto: UpdateTicketHttpDto = { titulo: 'Título actualizado' };

    it('happy path: retorna 200 con TicketResponseDto (campos del ticket mutado)', async () => {
      // Spec: tickets-core §"Edición exitosa de campos de datos"
      const ticket = makeTicket();
      mocks.editarTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.editarTicket(ticket.id, updateDto, user);

      expect(result).toMatchObject({
        id: ticket.id,
        numero: 'SOP-2026-00001',
        titulo: 'Ticket de prueba',
      });
      expect(mocks.editarTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: ticket.id,
          autorId: 'user-001',
        }),
      );
    });

    it('lanza NotFoundException cuando el ticket no existe o está soft-deleted', async () => {
      // Spec: tickets-core §"Edición rechazada — ticket soft-deleted"
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-id')),
      );

      await expect(controller.editarTicket('ticket-id', updateDto, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException para TicketNoEditableError (estado terminal)', async () => {
      // Spec: tickets-core §"Edición rechazada — ticket en estado terminal CERRADO"
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEditableError('CERRADO')),
      );

      await expect(controller.editarTicket('ticket-id', updateDto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza UnprocessableEntityException para TituloInvalidoError', async () => {
      mocks.editarTicketUseCase.execute.mockResolvedValue(Result.fail(new TituloInvalidoError()));

      await expect(controller.editarTicket('ticket-id', { titulo: '   ' }, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza UnprocessableEntityException para PrioridadNoEncontradaError', async () => {
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new PrioridadNoEncontradaError('prio-x')),
      );

      await expect(
        controller.editarTicket('ticket-id', { prioridadId: 'prio-x' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException para CicloNoEncontradoError', async () => {
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new CicloNoEncontradoError('ciclo-x')),
      );

      await expect(
        controller.editarTicket('ticket-id', { cicloId: 'ciclo-x' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza InternalServerErrorException para EstadoCatalogoNoEncontradoError', async () => {
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoCatalogoNoEncontradoError('estado-corrupto')),
      );

      await expect(controller.editarTicket('ticket-id', updateDto, user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('lanza InternalServerErrorException para TipoOperacionNoEncontradoError', async () => {
      mocks.editarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TipoOperacionNoEncontradoError('EDICION')),
      );

      await expect(controller.editarTicket('ticket-id', updateDto, user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('@RequirePermissions ticket:editar configurado en el handler', () => {
      // Auth-rbac §"Usuario sin ticket:editar recibe 403"
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.editarTicket) ?? [];
      expect(perms).toContain('ticket:editar');
    });
  });

  // ─── DELETE /tickets/:id ───────────────────────────────────────────────────

  describe('DELETE /tickets/:id (eliminarTicket)', () => {
    it('happy path: retorna void (204 No Content) cuando el borrado es exitoso', async () => {
      // Locked decision L3: DELETE exitoso → 204 No Content, sin body
      const ticket = makeTicket();
      mocks.eliminarTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.eliminarTicket('ticket-id', user);

      // El handler retorna void explícito → result debe ser undefined
      expect(result).toBeUndefined();
      expect(mocks.eliminarTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: 'ticket-id',
          autorId: 'user-001',
        }),
      );
    });

    it('idempotente: también retorna void (204) cuando el ticket ya estaba borrado', async () => {
      // Locked decision L2: no-op idempotente → mismo 204 sin body
      const ticket = makeTicket();
      mocks.eliminarTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.eliminarTicket('ticket-id', user);

      expect(result).toBeUndefined();
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      // Spec: tickets-core §"Soft delete rechazado — ticket de otro tenant"
      mocks.eliminarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-id')),
      );

      await expect(controller.eliminarTicket('ticket-id', user)).rejects.toThrow(NotFoundException);
    });

    it('lanza InternalServerErrorException para TipoOperacionNoEncontradoError', async () => {
      // Spec: tickets-core §"Rollback si falla el registro de auditoría en eliminación"
      mocks.eliminarTicketUseCase.execute.mockResolvedValue(
        Result.fail(new TipoOperacionNoEncontradoError('ELIMINACION')),
      );

      await expect(controller.eliminarTicket('ticket-id', user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('@RequirePermissions ticket:eliminar configurado en el handler', () => {
      // Auth-rbac §"Usuario sin ticket:eliminar recibe 403 en DELETE"
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, TicketsController.prototype.eliminarTicket) ?? [];
      expect(perms).toContain('ticket:eliminar');
    });

    it('@HttpCode(204) configurado en el handler', () => {
      // Locked decision L3: 204 No Content sin body
      // NestJS almacena el HTTP code con la clave '__httpCode__'
      const code: number =
        Reflect.getMetadata('__httpCode__', TicketsController.prototype.eliminarTicket) ?? 200;
      expect(code).toBe(204);
    });
  });

  // ─── GET /tickets/ciclo-activo (T1.7 RED) ─────────────────────────────────

  describe('GET /tickets/ciclo-activo (cicloActivo)', () => {
    it('retorna 200 con CicloActivoResponseDto cuando hay ciclo activo', async () => {
      const ciclo = makeCiclo();
      mocks.cicloClienteRepo.findActive.mockResolvedValue(ciclo);

      const result = (await controller.cicloActivo()) as CicloActivoResponseDto;

      expect(result).toMatchObject({
        id: 'ciclo-uuid-001',
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });
    });

    it('lanza NotFoundException (404) cuando no hay ciclo activo', async () => {
      mocks.cicloClienteRepo.findActive.mockResolvedValue(null);

      await expect(controller.cicloActivo()).rejects.toThrow(NotFoundException);
    });

    it('inyecta ICicloClienteRepository en el constructor', () => {
      // El constructor debe tener exactamente 9 parámetros (8 use cases + cicloRepo)
      expect(TicketsController.length).toBe(9);
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

  // ─── PR3: fechaResolucion OBLIGATORIA en RESUELTO (T3.9 RED) ─────────────────

  describe('PATCH /tickets/:id/estado — fechaResolucion en RESUELTO (ADR-4)', () => {
    it('pasa fechaResolucion al use case cuando destino es RESUELTO y fecha es válida', async () => {
      const ticket = makeTicket();
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(Result.ok(ticket));
      const dto: TransicionarEstadoHttpDto = {
        nuevoEstadoCodigo: 'RESUELTO',
        fechaResolucion: '2026-06-28',
      };

      await controller.transicionarEstado('ticket-id', dto, user);

      expect(mocks.transicionarEstadoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          nuevoEstadoCodigo: 'RESUELTO',
          fechaResolucion: expect.any(Date),
        }),
      );
      const llamadaFecha = mocks.transicionarEstadoUseCase.execute.mock.calls[0][0].fechaResolucion;
      expect((llamadaFecha as Date).toISOString().slice(0, 10)).toBe('2026-06-28');
    });

    it('lanza 422 cuando destino es RESUELTO pero falta fechaResolucion en el body', async () => {
      const dto: TransicionarEstadoHttpDto = { nuevoEstadoCodigo: 'RESUELTO' };

      await expect(controller.transicionarEstado('ticket-id', dto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mocks.transicionarEstadoUseCase.execute).not.toHaveBeenCalled();
    });

    it('lanza 422 cuando fechaResolucion tiene formato inválido', async () => {
      const dto: TransicionarEstadoHttpDto = {
        nuevoEstadoCodigo: 'RESUELTO',
        fechaResolucion: 'no-es-fecha',
      };

      await expect(controller.transicionarEstado('ticket-id', dto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mocks.transicionarEstadoUseCase.execute).not.toHaveBeenCalled();
    });

    it('mapea FechaResolucionRequeridaError del use case a 422', async () => {
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(
        Result.fail(new FechaResolucionRequeridaError()),
      );
      const dto: TransicionarEstadoHttpDto = {
        nuevoEstadoCodigo: 'RESUELTO',
        fechaResolucion: '2026-06-28',
      };

      await expect(controller.transicionarEstado('ticket-id', dto, user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ignora fechaResolucion cuando el destino NO es RESUELTO (no la pasa al use case)', async () => {
      const ticket = makeTicket();
      mocks.transicionarEstadoUseCase.execute.mockResolvedValue(Result.ok(ticket));
      const dto: TransicionarEstadoHttpDto = {
        nuevoEstadoCodigo: 'EN_PROGRESO',
        fechaResolucion: '2026-06-28',
      };

      await controller.transicionarEstado('ticket-id', dto, user);

      expect(mocks.transicionarEstadoUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          nuevoEstadoCodigo: 'EN_PROGRESO',
          fechaResolucion: undefined,
        }),
      );
    });
  });

  // ─── PR3: fechaCreacion en POST /tickets (T3.9 RED) ──────────────────────────

  describe('POST /tickets — fechaCreacion override (ADR-5)', () => {
    it('pasa fechaCreacion al use case cuando llega en el body con formato válido', async () => {
      const ticket = makeTicket();
      mocks.crearTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));
      const dto: CreateTicketHttpDto = {
        ...makeCreateDto(),
        fechaCreacion: '2026-06-15',
      };

      await controller.crearTicket(dto, user);

      expect(mocks.crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          fechaCreacion: expect.any(Date),
        }),
      );
      const llamadaFecha = mocks.crearTicketUseCase.execute.mock.calls[0][0].fechaCreacion;
      expect((llamadaFecha as Date).toISOString().slice(0, 10)).toBe('2026-06-15');
    });

    it('lanza 422 cuando fechaCreacion tiene formato inválido', async () => {
      const dto: CreateTicketHttpDto = {
        ...makeCreateDto(),
        fechaCreacion: 'no-es-fecha',
      };

      await expect(controller.crearTicket(dto, user)).rejects.toThrow(UnprocessableEntityException);
      expect(mocks.crearTicketUseCase.execute).not.toHaveBeenCalled();
    });

    it('pasa fechaCreacion undefined al use case cuando no llega en el body', async () => {
      const ticket = makeTicket();
      mocks.crearTicketUseCase.execute.mockResolvedValue(Result.ok(ticket));

      await controller.crearTicket(makeCreateDto(), user);

      expect(mocks.crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          fechaCreacion: undefined,
        }),
      );
    });
  });
});
