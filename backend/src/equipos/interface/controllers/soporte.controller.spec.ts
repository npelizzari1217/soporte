/**
 * T13.4 [C][RED→GREEN] — SoporteController.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (mismo patrón que `equipos.controller.spec.ts`). Verifica: traducción
 * HTTP ↔ use case, mapeo de errores de dominio → HttpException, y guards
 * `ticket:crear` (crear) / `ticket:editar` (registrar solución).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4, F3-Q5. Tarea: T13.4.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SoporteController } from './soporte.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import {
  EquipoInvalidoError,
  TicketSoporteNoEncontradoError,
} from '../../domain/errors/equipos.errors';
import {
  SolicitanteInvalidoError,
  SinCicloActivoError,
} from '../../../tickets/domain/errors/tickets.errors';
import { ResolverQrAutenticadoUseCase } from '../../application/use-cases/resolver-qr-autenticado.use-case';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

const USER = payloadDeTest({
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'USUARIO',
  permisos: ['ticket:crear', 'ticket:editar'],
  cliente_nombre: 'Cliente Test',
});

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'No tengo acceso a la VPN',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
    },
    'ticket-uuid',
  );
}

describe('SoporteController (T13.4)', () => {
  function buildController() {
    const crearTicketSoporteUseCase = { execute: vi.fn() };
    const registrarSolucionUseCase = { execute: vi.fn() };
    const obtenerEquipoDeTicketUseCase = { execute: vi.fn() };

    const controller = new SoporteController(
      crearTicketSoporteUseCase as any,
      registrarSolucionUseCase as any,
      obtenerEquipoDeTicketUseCase as any,
      // Real y con repos vacíos: este spec no ejercita la ruta del QR (la cubre su e2e).
      new ResolverQrAutenticadoUseCase({ findById: vi.fn() }, { findByQrHash: vi.fn() }),
    );

    return {
      controller,
      crearTicketSoporteUseCase,
      registrarSolucionUseCase,
      obtenerEquipoDeTicketUseCase,
    };
  }

  describe('POST /soporte', () => {
    it('crea el ticket de soporte → 201 + response unificado', async () => {
      const { controller, crearTicketSoporteUseCase } = buildController();
      const ticket = makeTicket();
      const ticketSoporte = TicketSoporteEntity.create(
        { ticketId: ticket.id, equipoId: null, descripcionProblema: 'Sin VPN' },
        'ticket-soporte-uuid',
      );
      crearTicketSoporteUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketSoporte }));

      const result = await controller.crear(
        { titulo: 'No tengo acceso a la VPN', prioridadId: 'prioridad-media-uuid' } as any,
        USER,
      );

      expect(result.id).toBe('ticket-soporte-uuid');
      expect(result.ticketId).toBe('ticket-uuid');
      expect(result.numero).toBe('SOP-2026-00001');
      expect(crearTicketSoporteUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ solicitanteId: 'usuario-uuid', autorId: 'usuario-uuid' }),
      );
    });

    it('equipo inválido → 422', async () => {
      const { controller, crearTicketSoporteUseCase } = buildController();
      crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInvalidoError('equipo-invalido')),
      );

      await expect(controller.crear({} as any, USER)).rejects.toThrow(UnprocessableEntityException);
    });

    it('solicitante inválido → 422', async () => {
      const { controller, crearTicketSoporteUseCase } = buildController();
      crearTicketSoporteUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('usuario-uuid')),
      );

      await expect(controller.crear({} as any, USER)).rejects.toThrow(UnprocessableEntityException);
    });

    it('sin ciclo activo → 409', async () => {
      const { controller, crearTicketSoporteUseCase } = buildController();
      const { ConflictException } = await import('@nestjs/common');
      crearTicketSoporteUseCase.execute.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      await expect(controller.crear({} as any, USER)).rejects.toThrow(ConflictException);
    });

    it('declara @RequiereAcciones("TICKETS:ALTAS")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, SoporteController.prototype.crear);
      expect(meta).toEqual(['TICKETS:ALTAS']);
    });
  });

  describe('POST /soporte/:id/solucion', () => {
    it('registra la solución', async () => {
      const { controller, registrarSolucionUseCase } = buildController();
      const ticketSoporte = TicketSoporteEntity.create({
        ticketId: 'ticket-uuid',
        equipoId: null,
        descripcionProblema: null,
      });
      ticketSoporte.registrarSolucion('Se reinstaló el cliente VPN.');
      registrarSolucionUseCase.execute.mockResolvedValue(Result.ok(ticketSoporte));

      const result = await controller.registrarSolucion('ticket-uuid', {
        solucion: 'Se reinstaló el cliente VPN.',
      } as any);

      expect(result.solucionAplicada).toBe('Se reinstaló el cliente VPN.');
    });

    it('ticket_soporte inexistente → 404', async () => {
      const { controller, registrarSolucionUseCase } = buildController();
      registrarSolucionUseCase.execute.mockResolvedValue(
        Result.fail(new TicketSoporteNoEncontradoError('no-existe')),
      );

      await expect(
        controller.registrarSolucion('no-existe', { solucion: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('declara @RequiereAcciones("TICKETS:MODIFICACION")', () => {
      const meta = Reflect.getMetadata(ACCIONES_KEY, SoporteController.prototype.registrarSolucion);
      expect(meta).toEqual(['TICKETS:MODIFICACION']);
    });
  });

  describe('GET /soporte/:ticketId', () => {
    it('retorna el equipo vinculado al ticket', async () => {
      const { controller, obtenerEquipoDeTicketUseCase } = buildController();
      obtenerEquipoDeTicketUseCase.execute.mockResolvedValue(
        Result.ok({ equipo: { id: 'equipo-1', nombre: 'Notebook Dell', numeroSerie: 'SN-123' } }),
      );

      const result = await controller.obtenerEquipoDeTicket('ticket-1');

      expect(result).toEqual({
        equipo: { id: 'equipo-1', nombre: 'Notebook Dell', numeroSerie: 'SN-123' },
      });
      expect(obtenerEquipoDeTicketUseCase.execute).toHaveBeenCalledWith({ ticketId: 'ticket-1' });
    });

    it('retorna equipo:null cuando el ticket no tiene equipo asociado', async () => {
      const { controller, obtenerEquipoDeTicketUseCase } = buildController();
      obtenerEquipoDeTicketUseCase.execute.mockResolvedValue(Result.ok({ equipo: null }));

      const result = await controller.obtenerEquipoDeTicket('ticket-1');

      expect(result).toEqual({ equipo: null });
    });

    it('declara @RequiereAcciones("TICKETS:LECTURA") (R5-a: gatea por TICKETS, no EQUIPOS)', () => {
      const meta = Reflect.getMetadata(
        ACCIONES_KEY,
        SoporteController.prototype.obtenerEquipoDeTicket,
      );
      expect(meta).toEqual(['TICKETS:LECTURA']);
    });
  });
});
