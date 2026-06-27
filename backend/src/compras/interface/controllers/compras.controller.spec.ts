/**
 * 4.D.1 TEST — Unit tests para ComprasController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Extrae aprobadoPorId y autorId del JWT via @CurrentUser().
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 * - @RequirePermissions('compra:aprobar') en endpoints de aprobación.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 * El guard chain se verifica vía Reflect.getMetadata.
 *
 * Tarea: 4.D.1
 */

import {
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ComprasController } from './compras.controller';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import {
  TicketNoEsComprasError,
  TicketCompraNoEncontradoError,
  MotivoRechazoRequeridoError,
  SinItemsActivosError,
} from '../../domain/errors/compras.errors';
import {
  TicketNoEncontradoError,
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  EstadoCatalogoNoEncontradoError,
  TransicionInvalidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CreateTicketCompraHttpDto, RechazarCompraHttpDto } from '../dtos/compras.dto';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'aprobador-001',
    cliente_id: 'cli-abc',
    email: 'aprobador@example.com',
    roles: ['APROBADOR_COMPRAS'],
    permisos: ['ticket:crear', 'compra:aprobar', 'compra:gestionar'],
    cliente_nombre: 'Test Corp',
    ...overrides,
  };
}

function makeTicket(): TicketEntity {
  return TicketEntity.create({
    numero: 'COM-2026-00001',
    titulo: 'Compra de insumos',
    descripcion: null,
    tipoId: 'tipo-compras',
    estadoId: 'estado-abierto',
    prioridadId: 'prioridad-media',
    cicloId: null,
    solicitanteId: 'user-001',
    asignadoId: null,
    fechaVencimiento: null,
  });
}

function makeTicketCompra(
  ticketId: string,
  {
    aprobadoPorId = null,
    aprobadoEn = null,
    motivoRechazo = null,
  }: {
    aprobadoPorId?: string | null;
    aprobadoEn?: Date | null;
    motivoRechazo?: string | null;
  } = {},
): TicketCompraEntity {
  return TicketCompraEntity.reconstitute(
    { ticketId, aprobadoPorId, aprobadoEn, motivoRechazo },
    'tc-001',
    new Date(),
    new Date(),
    null,
  );
}

function makeCreateDto(): CreateTicketCompraHttpDto {
  return {
    titulo: 'Compra de insumos',
    tipoId: 'tipo-compras',
    prioridadId: 'prioridad-media',
    solicitanteId: 'user-001',
  };
}

function makeUseCaseMocks() {
  return {
    listarComprasUseCase: { execute: jest.fn() },
    crearTicketCompraUseCase: { execute: jest.fn() },
    enviarAAprobacionUseCase: { execute: jest.fn() },
    aprobarCompraUseCase: { execute: jest.fn() },
    rechazarCompraUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ComprasController', () => {
  let controller: ComprasController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new ComprasController(
      mocks.listarComprasUseCase as any,
      mocks.crearTicketCompraUseCase as any,
      mocks.enviarAAprobacionUseCase as any,
      mocks.aprobarCompraUseCase as any,
      mocks.rechazarCompraUseCase as any,
    );
  });

  // ─── GET /compras ───────────────────────────────────────────────────────────

  describe('GET /compras (listarCompras)', () => {
    it('retorna 200 con lista vacía cuando no hay compras', async () => {
      mocks.listarComprasUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.listarCompras();

      expect(result).toEqual([]);
      expect(mocks.listarComprasUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('retorna lista de TicketCompraConTicketResponseDto mapeados con toResponseWithSatelite', async () => {
      const ticket = makeTicket();
      const ticketCompra = makeTicketCompra(ticket.id);
      mocks.listarComprasUseCase.execute.mockResolvedValue(Result.ok([{ ticket, ticketCompra }]));

      const result = await controller.listarCompras();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tc-001');
      expect(result[0].ticketId).toBe(ticket.id);
      expect(result[0].numero).toBe('COM-2026-00001');
    });

    it('no requiere permiso adicional (solo autenticación)', () => {
      // No PERMISSIONS_KEY metadata on the method — only class-level guards apply
      const permsMeta =
        Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.listarCompras) ?? [];
      expect(permsMeta).toHaveLength(0);
    });
  });

  // ─── POST /compras ──────────────────────────────────────────────────────────

  describe('POST /compras (crearTicketCompra)', () => {
    it('retorna 201 con datos del ticket compra creado', async () => {
      const ticket = makeTicket();
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.crearTicketCompra(makeCreateDto(), user);

      expect(result).toMatchObject({
        numero: 'COM-2026-00001',
        titulo: 'Compra de insumos',
      });
    });

    it('pasa clienteId y autorId del JWT al use case', async () => {
      const ticket = makeTicket();
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));
      const dto = makeCreateDto();

      await controller.crearTicketCompra(dto, user);

      expect(mocks.crearTicketCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'cli-abc',
          autorId: 'aprobador-001',
        }),
      );
    });

    it('lanza UnprocessableEntityException cuando el solicitante es inválido', async () => {
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('user-x')),
      );

      await expect(controller.crearTicketCompra(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el tipo de ticket no existe en catálogo', async () => {
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TipoTicketNoEncontradoError('tipo-x')),
      );

      await expect(controller.crearTicketCompra(makeCreateDto(), user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException cuando el tipo de ticket no es COMPRAS', async () => {
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEsComprasError('SOPORTE')),
      );

      await expect(controller.crearTicketCompra(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza InternalServerErrorException cuando el catálogo tenant no está sembrado', async () => {
      mocks.crearTicketCompraUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO')),
      );

      await expect(controller.crearTicketCompra(makeCreateDto(), user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── POST /compras/:id/enviar-aprobacion ────────────────────────────────────

  describe('POST /compras/:id/enviar-aprobacion (enviarAAprobacion)', () => {
    it('retorna 200 con el ticket en estado PENDIENTE_APROBACION', async () => {
      const ticket = makeTicket();
      mocks.enviarAAprobacionUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.enviarAAprobacion(ticket.id, user);

      expect(result).toMatchObject({ id: ticket.id });
      expect(mocks.enviarAAprobacionUseCase.execute).toHaveBeenCalledWith({
        ticketId: ticket.id,
        autorId: 'aprobador-001',
      });
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.enviarAAprobacionUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-x')),
      );

      await expect(controller.enviarAAprobacion('ticket-x', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException cuando no hay ítems activos', async () => {
      mocks.enviarAAprobacionUseCase.execute.mockResolvedValue(
        Result.fail(new SinItemsActivosError('compra-001')),
      );

      await expect(controller.enviarAAprobacion('ticket-x', user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza UnprocessableEntityException cuando la transición es inválida', async () => {
      mocks.enviarAAprobacionUseCase.execute.mockResolvedValue(
        Result.fail(new TransicionInvalidaError('CERRADO', 'PENDIENTE_APROBACION')),
      );

      await expect(controller.enviarAAprobacion('ticket-x', user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ─── POST /compras/:id/aprobar ──────────────────────────────────────────────

  describe('POST /compras/:id/aprobar (aprobarCompra)', () => {
    it('retorna 200 con ticketId del ticket y id del ticket_compra', async () => {
      const ticket = makeTicket();
      const ticketCompra = makeTicketCompra(ticket.id);
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.aprobarCompra(ticket.id, user);

      expect(result).toMatchObject({ ticketId: ticket.id, id: 'tc-001' });
      expect(mocks.aprobarCompraUseCase.execute).toHaveBeenCalledWith({
        ticketId: ticket.id,
        aprobadoPorId: 'aprobador-001',
      });
    });

    it('respuesta de aprobar incluye aprobadoPorId y aprobadoEn no nulos', async () => {
      const ticket = makeTicket();
      const aprobadoEn = new Date('2026-06-23T10:00:00Z');
      const ticketCompra = makeTicketCompra(ticket.id, {
        aprobadoPorId: 'aprobador-001',
        aprobadoEn,
      });
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.aprobarCompra(ticket.id, user);

      expect(result.id).toBe('tc-001');
      expect(result.aprobadoPorId).toBe('aprobador-001');
      expect(result.aprobadoEn).toBe(aprobadoEn.toISOString());
      expect(result.motivoRechazo).toBeNull();
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-x')),
      );

      await expect(controller.aprobarCompra('ticket-x', user)).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException cuando el ticket_compra no existe', async () => {
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketCompraNoEncontradoError('ticket-x')),
      );

      await expect(controller.aprobarCompra('ticket-x', user)).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException cuando la transición es inválida', async () => {
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TransicionInvalidaError('ABIERTO', 'APROBADO')),
      );

      await expect(controller.aprobarCompra('ticket-x', user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('usa el sub del JWT como aprobadoPorId (NO del body)', async () => {
      const ticket = makeTicket();
      const ticketCompra = makeTicketCompra(ticket.id);
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      await controller.aprobarCompra('ticket-id', user);

      expect(mocks.aprobarCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ aprobadoPorId: 'aprobador-001' }),
      );
    });
  });

  // ─── POST /compras/:id/rechazar ─────────────────────────────────────────────

  describe('POST /compras/:id/rechazar (rechazarCompra)', () => {
    const rechazarDto: RechazarCompraHttpDto = { motivoRechazo: 'Falta de presupuesto' };

    it('retorna 200 con id del ticket_compra y motivoRechazo (doble transición automática)', async () => {
      const ticket = makeTicket();
      const ticketCompra = makeTicketCompra(ticket.id, {
        aprobadoPorId: 'aprobador-001',
        aprobadoEn: new Date(),
        motivoRechazo: 'Falta de presupuesto',
      });
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      const result = await controller.rechazarCompra('ticket-id', rechazarDto, user);

      expect(result).toMatchObject({ id: 'tc-001', ticketId: ticket.id });
      expect(result.motivoRechazo).toBe('Falta de presupuesto');
      expect(mocks.rechazarCompraUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-id',
        aprobadoPorId: 'aprobador-001',
        motivoRechazo: 'Falta de presupuesto',
      });
    });

    it('usa el sub del JWT como aprobadoPorId (NO del body)', async () => {
      const ticket = makeTicket();
      const ticketCompra = makeTicketCompra(ticket.id);
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketCompra }));

      await controller.rechazarCompra('ticket-id', rechazarDto, user);

      expect(mocks.rechazarCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ aprobadoPorId: 'aprobador-001' }),
      );
    });

    it('lanza UnprocessableEntityException cuando motivoRechazo está vacío', async () => {
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new MotivoRechazoRequeridoError()),
      );

      await expect(
        controller.rechazarCompra('ticket-id', { motivoRechazo: '' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza NotFoundException cuando el ticket no existe', async () => {
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-x')),
      );

      await expect(controller.rechazarCompra('ticket-x', rechazarDto, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComprasController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComprasController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComprasController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComprasController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('requiere permiso ticket:crear en crearTicketCompra', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.crearTicketCompra) ?? [];
      expect(perms).toContain('ticket:crear');
    });

    it('requiere permiso ticket:crear en enviarAAprobacion (flujo del solicitante)', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.enviarAAprobacion) ?? [];
      expect(perms).toContain('ticket:crear');
    });

    it('requiere permiso compra:aprobar en aprobarCompra', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.aprobarCompra) ?? [];
      expect(perms).toContain('compra:aprobar');
    });

    it('requiere permiso compra:aprobar en rechazarCompra', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComprasController.prototype.rechazarCompra) ?? [];
      expect(perms).toContain('compra:aprobar');
    });
  });
});
