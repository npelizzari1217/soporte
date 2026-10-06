/**
 * AplicarSlaUseCase [UNIT] — sdd/sla-primera-respuesta-y-pausa, WU-3c (ADR-4; sla-reloj-activo R2, R3, R7, R9).
 * Fija la meta del ticket, pliega primero lo pendiente y deriva `sla_vence_at` con una sola escritura
 * con el CAS de versión. El pliegue y la derivación son los reales (`RelojSla`); solo los repos son fakes.
 */
import { AplicarSlaUseCase } from './aplicar-sla.use-case';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { TicketEntity, SlaRegla } from '../../../tickets/domain/entities/ticket.entity';
import { IRelojSlaRepository } from '../../domain/ports/i-reloj-sla.repository';
import { RelojSlaFila, TransicionReloj } from '../../domain/entities/reloj-sla';
import {
  H,
  L,
  calculo,
  calendarioSemanal,
  fila,
  op,
} from '../../domain/entities/reloj-sla.fixtures';

const TIPO_PREVENTIVO = 'tipo-preventivo-uuid';
const DTO = { ticketId: 't1', prioridadId: 'prioridad-uuid' };

const prioridad = (slaHoras: number | null, slaActivo = true) =>
  PrioridadEntity.create({
    codigo: 'ALTA',
    nombre: 'Alta',
    color: null,
    orden: 30,
    activo: true,
    slaHoras,
    slaActivo,
  });

function ticket(over: { tipoId?: string; slaRegla?: SlaRegla } = {}): TicketEntity {
  const t = TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket',
      descripcion: null,
      tipoId: over.tipoId ?? 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    't1',
  );
  Object.assign(t, { _slaRegla: over.slaRegla ?? 'HABIL' });
  return t;
}

interface Montaje {
  fila?: Partial<RelojSlaFila>;
  historial?: TransicionReloj[];
  transiciones?: TransicionReloj[];
  prioridad?: PrioridadEntity | null;
  ticket?: TicketEntity | null;
}

function montar(m: Montaje = {}) {
  const relojRepo = {
    leer: vi.fn().mockResolvedValue(fila({ ticketId: 't1', ...m.fila })),
    historialSinSecuencia: vi.fn().mockResolvedValue(m.historial ?? []),
    transicionesDesde: vi.fn().mockResolvedValue(m.transiciones ?? []),
    guardarSiVersion: vi.fn().mockResolvedValue(true),
    findPendientes: vi.fn().mockResolvedValue([]),
  } satisfies IRelojSlaRepository;
  const prioridadRepo = {
    findById: vi.fn().mockResolvedValue(m.prioridad === undefined ? prioridad(8) : m.prioridad),
  };
  const ticketRepo = {
    findById: vi.fn().mockResolvedValue(m.ticket === undefined ? ticket() : m.ticket),
  };
  const tipoTicketRepo = { findIdByCodigo: vi.fn().mockResolvedValue(TIPO_PREVENTIVO) };
  const calendarioRepo = { obtener: vi.fn().mockResolvedValue(calendarioSemanal) };
  const feriadosRepo = { obtener: vi.fn().mockResolvedValue(new Set<string>()) };
  const useCase = new AplicarSlaUseCase(
    prioridadRepo,
    relojRepo,
    ticketRepo,
    tipoTicketRepo,
    calculo,
    calendarioRepo,
    feriadosRepo,
  );
  const escrito = () => relojRepo.guardarSiVersion.mock.calls[0][2];
  return { useCase, relojRepo, prioridadRepo, calendarioRepo, escrito };
}

describe('AplicarSlaUseCase', () => {
  describe('meta y vencimiento (R2, R9)', () => {
    it('alta: fija la meta de la prioridad y deriva el vencimiento desde el inicio del tramo', async () => {
      const c = montar();

      await c.useCase.alCrear(DTO);

      expect(c.relojRepo.guardarSiVersion).toHaveBeenCalledWith('t1', 1, {
        acumuladoS: 0,
        metaS: 8 * H,
        correDesde: L(10, 9),
        cumplido: null,
        slaVenceAt: L(10, 17),
      });
    });

    it('pliega lo pendiente primero: la pausa conserva lo acumulado y el vencimiento sale de lo que falta', async () => {
      const c = montar({
        fila: { version: 2 },
        transiciones: [
          op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12)),
          op('ESPERANDO_CLIENTE', 'EN_PROCESO', L(11, 9)),
        ],
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.relojRepo.transicionesDesde).toHaveBeenCalledWith('t1', 0);
      expect(c.escrito()).toMatchObject({
        acumuladoS: 3 * H,
        correDesde: L(11, 9),
        slaVenceAt: L(11, 14),
      });
      expect(c.relojRepo.guardarSiVersion.mock.calls[0][1]).toBe(2);
    });

    it('repriorizar con 3 h acumuladas a una prioridad de 4 h deja 1 h hábil por correr y conserva las pausas', async () => {
      const c = montar({
        fila: { acumuladoS: 3 * H, correDesde: L(11, 9), version: 3 },
        prioridad: prioridad(4),
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito()).toMatchObject({
        acumuladoS: 3 * H,
        metaS: 4 * H,
        slaVenceAt: L(11, 10),
      });
    });

    it('cohorte CORRIDO: suma tiempo de pared y no consulta el calendario', async () => {
      const c = montar({
        fila: { slaRegla: 'CORRIDO', acumuladoS: 10 * H, correDesde: L(10, 9) },
        ticket: ticket({ slaRegla: 'CORRIDO' }),
        prioridad: prioridad(24),
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito().slaVenceAt).toEqual(new Date(L(10, 9).getTime() + 14 * 3600_000));
      expect(c.calendarioRepo.obtener).not.toHaveBeenCalled();
    });

    it('con la meta ya superada el vencimiento no pasa del inicio del tramo', async () => {
      const c = montar({
        fila: { acumuladoS: 9 * H, correDesde: L(11, 9) },
        prioridad: prioridad(8),
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito().slaVenceAt).toEqual(L(11, 9));
    });

    it('con el reloj detenido fija la meta pero no toca el vencimiento', async () => {
      const c = montar({
        fila: { estadoCodigo: 'ESPERANDO_CLIENTE', acumuladoS: 3 * H, correDesde: null },
        prioridad: prioridad(4),
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito().metaS).toBe(4 * H);
      expect(c.escrito().slaVenceAt).toBeUndefined();
    });

    it.each([
      ['sin slaHoras', prioridad(null)],
      ['slaActivo false', prioridad(8, false)],
      ['prioridad inexistente', null],
    ])('%s: meta, vencimiento y cumplimiento quedan en null', async (_caso, p) => {
      const c = montar({ prioridad: p, fila: { cumplido: true } });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito()).toMatchObject({ metaS: null, cumplido: null, slaVenceAt: null });
    });

    it('preventivo: meta null y no consulta la prioridad', async () => {
      const c = montar({ ticket: ticket({ tipoId: TIPO_PREVENTIVO }) });

      await c.useCase.alCrear(DTO);

      expect(c.escrito()).toMatchObject({ metaS: null, cumplido: null, slaVenceAt: null });
      expect(c.prioridadRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('cumplimiento (R3)', () => {
    const resuelto = { estadoCodigo: 'RESUELTO', correDesde: null };

    it('RESUELTO: recalcula el cumplimiento con la meta nueva y no toca el vencimiento', async () => {
      const c = montar({
        fila: { ...resuelto, acumuladoS: 9 * H, cumplido: false },
        prioridad: prioridad(12),
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito()).toMatchObject({ metaS: 12 * H, cumplido: true });
      expect(c.escrito().slaVenceAt).toBeUndefined();
    });

    it('RESUELTO con 9 h sobre una meta de 8 h no cumple', async () => {
      const c = montar({ fila: { ...resuelto, acumuladoS: 9 * H } });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito().cumplido).toBe(false);
    });

    it('fuera de RESUELTO no inventa un cumplimiento', async () => {
      const c = montar({ fila: { cumplido: null } });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito().cumplido).toBeNull();
    });
  });

  describe('tickets previos (R7)', () => {
    const previo = {
      acumuladoS: null,
      metaS: null,
      correDesde: null,
      createdAt: L(10, 9),
      slaVenceAt: L(10, 17),
    };

    it('un previo corriendo se incorpora desde su creación y, con la misma meta, su vencimiento V no cambia', async () => {
      const c = montar({ fila: previo });

      await c.useCase.alReprioritizar(DTO);

      expect(c.relojRepo.historialSinSecuencia).toHaveBeenCalledWith('t1');
      expect(c.escrito()).toMatchObject({
        acumuladoS: 0,
        correDesde: L(10, 9),
        metaS: 8 * H,
        slaVenceAt: L(10, 17),
      });
    });

    it('un previo que pasa a espera se incorpora con el tiempo activo desde su creación y V no se reescribe', async () => {
      const c = montar({
        fila: { ...previo, estadoCodigo: 'ESPERANDO_CLIENTE', version: 1 },
        historial: [op('EN_PROCESO', 'ESPERANDO_CLIENTE', L(10, 12))],
      });

      await c.useCase.alReprioritizar(DTO);

      expect(c.escrito()).toMatchObject({ acumuladoS: 3 * H, correDesde: null });
      expect(c.escrito().slaVenceAt).toBeUndefined();
    });
  });

  describe('CAS de versión y casos límite', () => {
    it('un CAS perdido reintenta una vez con una lectura nueva', async () => {
      const c = montar();
      c.relojRepo.guardarSiVersion.mockResolvedValueOnce(false);

      await c.useCase.alCrear(DTO);

      expect(c.relojRepo.leer).toHaveBeenCalledTimes(2);
      expect(c.relojRepo.guardarSiVersion).toHaveBeenCalledTimes(2);
    });

    it('dos CAS perdidos propagan SLA_RELOJ_CONFLICTO para que el listener lo registre', async () => {
      const c = montar();
      c.relojRepo.guardarSiVersion.mockResolvedValue(false);

      await expect(c.useCase.alCrear(DTO)).rejects.toThrow('SLA_RELOJ_CONFLICTO');
    });

    it('un ticket en estado terminal no recalcula al repriorizar', async () => {
      const c = montar({ fila: { estadoCodigo: 'CERRADO', correDesde: null } });

      await c.useCase.alReprioritizar(DTO);

      expect(c.relojRepo.guardarSiVersion).not.toHaveBeenCalled();
    });

    it('ticket inexistente: no escribe nada', async () => {
      const c = montar({ ticket: null });

      await c.useCase.alCrear(DTO);

      expect(c.relojRepo.guardarSiVersion).not.toHaveBeenCalled();
    });

    it('fila del reloj inexistente: no escribe nada', async () => {
      const c = montar();
      c.relojRepo.leer.mockResolvedValue(null);

      await c.useCase.alCrear(DTO);

      expect(c.relojRepo.guardarSiVersion).not.toHaveBeenCalled();
    });

    it('un fallo del calendario propaga y no escribe (sin fallback silencioso)', async () => {
      const c = montar();
      c.calendarioRepo.obtener.mockRejectedValue(new Error('MASTER caído'));

      await expect(c.useCase.alCrear(DTO)).rejects.toThrow('MASTER caído');
      expect(c.relojRepo.guardarSiVersion).not.toHaveBeenCalled();
    });
  });
});
