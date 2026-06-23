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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'aprobador-001',
    cliente_id: 'cli-abc',
    email: 'aprobador@example.com',
    roles: ['APROBADOR_COMPRAS'],
    permisos: ['ticket:crear', 'compra:aprobar', 'compra:gestionar'],
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
      mocks.crearTicketCompraUseCase as any,
      mocks.enviarAAprobacionUseCase as any,
      mocks.aprobarCompraUseCase as any,
      mocks.rechazarCompraUseCase as any,
    );
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
    it('retorna 200 con el ticket en estado APROBADO', async () => {
      const ticket = makeTicket();
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.aprobarCompra(ticket.id, user);

      expect(result).toMatchObject({ id: ticket.id });
      expect(mocks.aprobarCompraUseCase.execute).toHaveBeenCalledWith({
        ticketId: ticket.id,
        aprobadoPorId: 'aprobador-001',
      });
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
      mocks.aprobarCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));

      await controller.aprobarCompra('ticket-id', user);

      expect(mocks.aprobarCompraUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ aprobadoPorId: 'aprobador-001' }),
      );
    });
  });

  // ─── POST /compras/:id/rechazar ─────────────────────────────────────────────

  describe('POST /compras/:id/rechazar (rechazarCompra)', () => {
    const rechazarDto: RechazarCompraHttpDto = { motivoRechazo: 'Falta de presupuesto' };

    it('retorna 200 con el ticket en estado CERRADO (doble transición automática)', async () => {
      const ticket = makeTicket();
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.rechazarCompra('ticket-id', rechazarDto, user);

      expect(result).toMatchObject({ id: ticket.id });
      expect(mocks.rechazarCompraUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-id',
        aprobadoPorId: 'aprobador-001',
        motivoRechazo: 'Falta de presupuesto',
      });
    });

    it('usa el sub del JWT como aprobadoPorId (NO del body)', async () => {
      const ticket = makeTicket();
      mocks.rechazarCompraUseCase.execute.mockResolvedValue(Result.ok(ticket));

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
