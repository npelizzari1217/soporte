/**
 * 5.D.1 TEST — Unit tests para TicketsEdilicioController.
 *
 * Verifica que el controlador:
 * - Delega a CrearTicketEdilicioUseCase con los datos correctos.
 * - Extrae clienteId y autorId del JWT via @CurrentUser().
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 * - @RequirePermissions('ticket:crear') en crearTicketEdilicio.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 *
 * Tarea: 5.D.1
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TicketsEdilicioController } from './tickets-edilicio.controller';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  SinCicloActivoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  TicketNoEsEdiliciaError,
  UbicacionInvalidaError,
} from '../../domain/errors/reparaciones.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { CreateTicketEdilicioHttpDto } from '../dtos/reparaciones.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'solicitante-001',
    cliente_id: 'cli-abc',
    email: 'solicitante@example.com',
    roles: ['SOLICITANTE'],
    permisos: ['ticket:crear'],
    cliente_nombre: 'Test Corp',
    ...overrides,
  };
}

function makeTicket(): TicketEntity {
  return TicketEntity.create({
    numero: 'EDI-2026-00001',
    titulo: 'Reparar grieta en piso 3',
    descripcion: null,
    tipoId: 'tipo-edilicia',
    estadoId: 'estado-abierto',
    prioridadId: 'prioridad-media',
    cicloId: null,
    solicitanteId: 'solicitante-001',
    asignadoId: null,
    fechaCierre: null,
  });
}

function makeCreateDto(): CreateTicketEdilicioHttpDto {
  return {
    titulo: 'Reparar grieta en piso 3',
    tipoId: 'tipo-edilicia',
    prioridadId: 'prioridad-media',
    solicitanteId: 'solicitante-001',
    ubicacionId: 'ub-piso3',
  };
}

function makeUseCaseMocks() {
  return {
    crearTicketEdilicioUseCase: { execute: vi.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TicketsEdilicioController', () => {
  let controller: TicketsEdilicioController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new TicketsEdilicioController(mocks.crearTicketEdilicioUseCase as any);
  });

  // ─── POST /tickets-edilicio ─────────────────────────────────────────────────

  describe('POST /tickets-edilicio (crearTicketEdilicio)', () => {
    it('retorna 201 con datos del ticket edilicio creado', async () => {
      const ticket = makeTicket();
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.crearTicketEdilicio(makeCreateDto(), user);

      expect(result).toMatchObject({
        numero: 'EDI-2026-00001',
        titulo: 'Reparar grieta en piso 3',
      });
    });

    it('pasa clienteId y autorId del JWT al use case', async () => {
      const ticket = makeTicket();
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.ok(ticket));

      await controller.crearTicketEdilicio(makeCreateDto(), user);

      expect(mocks.crearTicketEdilicioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'cli-abc',
          autorId: 'solicitante-001',
        }),
      );
    });

    it('pasa ubicacionId del body al use case', async () => {
      const ticket = makeTicket();
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.ok(ticket));

      await controller.crearTicketEdilicio(makeCreateDto(), user);

      expect(mocks.crearTicketEdilicioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ubicacionId: 'ub-piso3' }),
      );
    });

    it('lanza ConflictException (409) cuando el tenant no tiene ciclo activo (Fase 4, ciclos-master-tenant)', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new SinCicloActivoError()),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        ConflictException,
      );
    });

    it('lanza UnprocessableEntityException cuando el solicitante es inválido', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('user-x')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza UnprocessableEntityException cuando la ubicacion es inválida', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new UbicacionInvalidaError('ub-x')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza NotFoundException cuando el tipo de ticket no existe en catálogo', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new TipoTicketNoEncontradoError('tipo-x')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza UnprocessableEntityException cuando el tipo de ticket no es EDILICIA', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEsEdiliciaError('COMPRAS')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('lanza InternalServerErrorException cuando el catálogo tenant no está sembrado (estado)', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('lanza InternalServerErrorException cuando el catálogo tenant no está sembrado (operacion)', async () => {
      mocks.crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO')),
      );

      await expect(controller.crearTicketEdilicio(makeCreateDto(), user)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsEdilicioController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsEdilicioController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsEdilicioController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketsEdilicioController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso ticket:crear en crearTicketEdilicio', () => {
      const perms: string[] =
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          TicketsEdilicioController.prototype.crearTicketEdilicio,
        ) ?? [];
      expect(perms).toContain('ticket:crear');
    });
  });
});
