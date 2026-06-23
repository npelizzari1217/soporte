/**
 * 6.D.1 TEST — Unit tests para TicketSoporteController.
 *
 * Verifica que el controlador:
 * - Delega a CrearTicketSoporteUseCase con los DTOs correctos.
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 *
 * Tarea: 6.D.1
 */
import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TicketSoporteController } from './ticket-soporte.controller';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { EquipoInvalidoError, TicketNoEsSoporteError } from '../../domain/errors/equipos.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'soporte@example.com',
    roles: ['SOPORTE_IT'],
    permisos: ['ticket:crear', 'equipo:gestionar'],
    ...overrides,
  };
}

function makeTicket(): TicketEntity {
  return TicketEntity.create({
    numero: 'SOP-2026-00001',
    titulo: 'PC no enciende',
    descripcion: null,
    tipoId: 'tipo-soporte-uuid',
    estadoId: 'estado-abierto-uuid',
    prioridadId: 'prioridad-media-uuid',
    cicloId: null,
    solicitanteId: 'user-001',
    asignadoId: null,
    fechaVencimiento: null,
  });
}

function makeUseCaseMocks() {
  return {
    crearTicketSoporteUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('TicketSoporteController', () => {
  let controller: TicketSoporteController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new TicketSoporteController(mocks.crearTicketSoporteUseCase as any);
  });

  // ─── POST /tickets-soporte ──────────────────────────────────────────────────

  describe('POST /tickets-soporte (crearTicketSoporte)', () => {
    it('retorna 201 con datos del ticket creado', async () => {
      const ticket = makeTicket();
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const result = await controller.crearTicketSoporte(
        {
          titulo: 'PC no enciende',
          tipoId: 'tipo-soporte-uuid',
          prioridadId: 'prioridad-media-uuid',
          solicitanteId: 'user-001',
          equipoId: 'equipo-001',
        },
        user,
      );

      expect(result).toMatchObject({
        titulo: 'PC no enciende',
        numero: 'SOP-2026-00001',
      });
    });

    it('delega al use case con los datos del dto incluyendo equipoId null', async () => {
      const ticket = makeTicket();
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(Result.ok(ticket));

      const dto = {
        titulo: 'Problema de red',
        tipoId: 'tipo-soporte-uuid',
        prioridadId: 'prioridad-alta-uuid',
        solicitanteId: 'user-001',
        equipoId: null,
      };

      await controller.crearTicketSoporte(dto, user);

      expect(mocks.crearTicketSoporteUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: 'Problema de red',
          equipoId: null,
          clienteId: user.cliente_id,
          autorId: user.sub,
        }),
      );
    });

    it('lanza UnprocessableEntityException cuando solicitante no es válido', async () => {
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('user-x')),
      );

      await expect(
        controller.crearTicketSoporte(
          { titulo: 'Test', tipoId: 't', prioridadId: 'p', solicitanteId: 'user-x' },
          user,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException cuando el equipo no está activo', async () => {
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInvalidoError('eq-x')),
      );

      await expect(
        controller.crearTicketSoporte(
          { titulo: 'Test', tipoId: 't', prioridadId: 'p', solicitanteId: 'u', equipoId: 'eq-x' },
          user,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza UnprocessableEntityException cuando el tipo no es SOPORTE', async () => {
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEsSoporteError('COMPRAS')),
      );

      await expect(
        controller.crearTicketSoporte(
          { titulo: 'Test', tipoId: 'tipo-compras', prioridadId: 'p', solicitanteId: 'u' },
          user,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lanza NotFoundException cuando el tipo de ticket no existe en catálogo', async () => {
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new TipoTicketNoEncontradoError('tipo-x')),
      );

      await expect(
        controller.crearTicketSoporte(
          { titulo: 'Test', tipoId: 'tipo-x', prioridadId: 'p', solicitanteId: 'u' },
          user,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza InternalServerErrorException cuando el catálogo no está sembrado', async () => {
      mocks.crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO')),
      );

      await expect(
        controller.crearTicketSoporte(
          { titulo: 'Test', tipoId: 't', prioridadId: 'p', solicitanteId: 'u' },
          user,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketSoporteController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketSoporteController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketSoporteController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', TicketSoporteController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });
  });
});
