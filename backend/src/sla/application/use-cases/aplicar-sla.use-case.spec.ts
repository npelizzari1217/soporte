/**
 * SA12 [UNIT] — RED→GREEN: AplicarSlaUseCase (S2/S3 — cálculo de
 * sla_vence_at al crear/repriorizar un ticket, consumido por los listeners
 * `ticket.creado`/`ticket.reprioritizado`).
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P2/ADR-P4. Tarea: SA12.
 */
import { AplicarSlaUseCase } from './aplicar-sla.use-case';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { CalcularSlaVenceService } from '../../domain/services/calcular-sla-vence.service';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';

/** Fixture de prioridad con SLA configurado (`slaHoras`/`slaActivo`, movidos de `sla_config`). */
function makePrioridadConSla(overrides: { slaHoras?: number | null; slaActivo?: boolean } = {}) {
  return PrioridadEntity.create({
    codigo: 'ALTA',
    nombre: 'Alta',
    color: null,
    orden: 30,
    activo: true,
    // `??` trataría `slaHoras: null` explícito como "ausente" — usar
    // `!== undefined` para distinguir "sin SLA aplicable" (null) de "no
    // especificado en el fixture" (undefined → default 8).
    slaHoras: overrides.slaHoras !== undefined ? overrides.slaHoras : 8,
    slaActivo: overrides.slaActivo ?? true,
  });
}

function makeTicket(overrides: { estadoId?: string; createdAt?: Date } = {}): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: overrides.estadoId ?? 'estado-nuevo-uuid',
      prioridadId: 'prioridad-alta-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  if (overrides.createdAt) {
    Object.assign(ticket, { _createdAt: overrides.createdAt });
  }
  return ticket;
}

function makeCollaborators() {
  const prioridadRepo = { findById: vi.fn() };
  const slaTicketWriteRepo = { setSlaVenceAt: vi.fn().mockResolvedValue(undefined) };
  const ticketRepo = { findById: vi.fn() };
  const estadoRepo = { findById: vi.fn() };
  const calculador = new CalcularSlaVenceService();

  const useCase = new AplicarSlaUseCase(
    prioridadRepo as never,
    slaTicketWriteRepo as never,
    ticketRepo as never,
    estadoRepo as never,
    calculador,
  );

  return { useCase, prioridadRepo, slaTicketWriteRepo, ticketRepo, estadoRepo };
}

describe('AplicarSlaUseCase', () => {
  describe('alCrear()', () => {
    it('S2: setea sla_vence_at = createdAt + slaHoras(prioridad con SLA activo)', async () => {
      const c = makeCollaborators();
      const createdAt = new Date('2026-08-06T10:00:00.000Z');
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ createdAt }));
      c.prioridadRepo.findById.mockResolvedValue(
        makePrioridadConSla({ slaHoras: 8, slaActivo: true }),
      );

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
        'ticket-uuid',
        new Date('2026-08-06T18:00:00.000Z'),
      );
    });

    it.each([
      ['prioridad inexistente (defensivo)', null],
      ['slaHoras null (sin SLA aplicable)', makePrioridadConSla({ slaHoras: null })],
      ['slaActivo false', makePrioridadConSla({ slaHoras: 8, slaActivo: false })],
    ])('S2: %s → sla_vence_at = null', async (_label, prioridad) => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket());
      c.prioridadRepo.findById.mockResolvedValue(prioridad);

      await c.useCase.alCrear({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith('ticket-uuid', null);
    });
  });

  describe('alReprioritizar()', () => {
    it('S3: recalcula desde el createdAt ORIGINAL del ticket (ancla fija)', async () => {
      const c = makeCollaborators();
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ createdAt }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
          'estado-nuevo-uuid',
        ),
      );
      c.prioridadRepo.findById.mockResolvedValue(
        makePrioridadConSla({ slaHoras: 4, slaActivo: true }),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).toHaveBeenCalledWith(
        'ticket-uuid',
        new Date('2026-08-01T04:00:00.000Z'),
      );
    });

    it('S3: ticket en estado terminal (CERRADO) NO recalcula', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estadoId: 'estado-cerrado-uuid' }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 5, activo: true },
          'estado-cerrado-uuid',
        ),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });

    it('S3: ticket en estado terminal (CANCELADO) NO recalcula', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket({ estadoId: 'estado-cancelado-uuid' }));
      c.estadoRepo.findById.mockResolvedValue(
        EstadoEntity.create(
          { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 6, activo: true },
          'estado-cancelado-uuid',
        ),
      );

      await c.useCase.alReprioritizar({
        ticketId: 'ticket-uuid',
        prioridadId: 'prioridad-critica-uuid',
      });

      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });

    it('ticket inexistente → no hace nada (defensivo, no lanza)', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(null);

      await expect(
        c.useCase.alReprioritizar({ ticketId: 'no-existe', prioridadId: 'prioridad-alta-uuid' }),
      ).resolves.toBeUndefined();
      expect(c.slaTicketWriteRepo.setSlaVenceAt).not.toHaveBeenCalled();
    });
  });
});
