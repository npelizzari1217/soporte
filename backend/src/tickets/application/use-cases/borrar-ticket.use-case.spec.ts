/**
 * [UNIT] Borrado lógico de un ticket (odd/tasks/permisos-por-tipo-ticket.md, S8, L39-L41), con
 * fakes en memoria: se afirma sobre el estado final (`deleted_at` del ticket y entradas del
 * historial), no sobre las llamadas.
 */
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  TicketConPendientesNoBorrableError,
  TicketNoEncontradoError,
  TicketPreventivoNoBorrableError,
} from '../../domain/errors/tickets.errors';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { TIPO_CODIGO_PREVENTIVO } from '../../domain/tipos-ticket.constants';
import { BorrarTicketUseCase } from './borrar-ticket.use-case';

const AHORA = new Date('2026-10-22T15:00:00Z');
const SOPORTE = 'tipo-soporte';
const MANTENIMIENTO = 'tipo-mantenimiento';
const PREVENTIVO = 'tipo-preventivo';
const ACTOR = 'usr-actor';

function ticket(id: string, tipoId: string, solicitanteId = 'usr-otro'): TicketEntity {
  return TicketEntity.create(
    {
      numero: `SOP-2026-${id}`,
      titulo: `Ticket ${id}`,
      descripcion: null,
      tipoId,
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: 'ciclo-1',
      ticketReferenciaId: null,
      solicitanteId,
    },
    id,
  );
}

/** Escenario con un ticket de cada tipo, sus tareas y las compras de su reparación. */
function escenario(
  opciones: { tareas?: TareaTicketEntity[]; compras?: Record<string, string[]> } = {},
) {
  const tickets = new Map(
    [
      ticket('t-soporte', SOPORTE),
      ticket('t-mant', MANTENIMIENTO),
      ticket('t-prev', PREVENTIVO),
      // Generado por un plan de tipo Mantenimiento (odd/preventivo-por-tipo).
      ticket('t-mant-plan', MANTENIMIENTO),
    ].map((t) => [t.id, t]),
  );
  /** Tickets enlazados a un plan por `preventivo_generacion`. */
  const generadosPorPlan = new Set(['t-mant-plan']);
  const tareas = opciones.tareas ?? [];
  const compras = opciones.compras ?? {};
  const operaciones: OperacionTicketEntity[] = [];
  let enTransaccion = false;

  const ticketRepo = {
    findById: async (id: string) => tickets.get(id) ?? null,
    esVisiblePara: async () => false,
    bloquear: vi.fn(async () => {
      expect(enTransaccion).toBe(true);
    }),
    borrarSiActivo: async (id: string, ahora: Date) => {
      const actual = tickets.get(id);
      if (!actual || actual.isDeleted()) return false;
      actual.softDelete(ahora);
      return true;
    },
  };
  const codigosDeTipo: Record<string, string> = {
    [SOPORTE]: 'SOPORTE',
    [MANTENIMIENTO]: 'MANTENIMIENTO',
    [PREVENTIVO]: TIPO_CODIGO_PREVENTIVO,
  };
  const useCase = new BorrarTicketUseCase(
    ticketRepo,
    {
      findIdByCodigo: async (codigo: string) =>
        Object.keys(codigosDeTipo).find((id) => codigosDeTipo[id] === codigo) ?? null,
    },
    {
      listarPorTicket: async (ticketId: string) =>
        tareas.filter((t) => t.ticketId === ticketId && !t.isDeleted()),
    },
    {
      comprasVinculadas: async (ticketId: string) => compras[ticketId] ?? [],
      generadoPorPlanPreventivo: async (ticketId: string) => generadosPorPlan.has(ticketId),
    },
    {
      save: async (operacion: OperacionTicketEntity) => {
        expect(enTransaccion).toBe(true);
        operaciones.push(operacion);
      },
    },
    { findIdByCodigo: async (codigo: string) => `tipo-op-${codigo}` },
    {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        enTransaccion = true;
        try {
          return await fn();
        } finally {
          enTransaccion = false;
        }
      },
    },
    () => AHORA,
  );
  return { useCase, tickets, operaciones, ticketRepo };
}

/** Actor con Ver todos en los dos tipos y Borrar solo en Soporte (S2). */
function actorQueBorraSoloSoporte() {
  const ver: AccionTipoTicket[] = ['LECTURA', 'VER_TODOS'];
  return alcancePorTipo(ACTOR, { [SOPORTE]: [...ver, 'BORRADO'], [MANTENIMIENTO]: ver });
}

describe('BorrarTicketUseCase', () => {
  it('con Borrar sobre el tipo, marca deleted_at y deja en el historial quién y cuándo', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const result = await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(result.isOk()).toBe(true);
    const borrado = tickets.get('t-soporte');
    expect(borrado?.deletedAt).toEqual(AHORA);
    // El borrado no toca el estado: es lo que permite recuperarlo tal cual (L41).
    expect(borrado?.estadoId).toBe('estado-en-proceso');
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]).toMatchObject({
      ticketId: 't-soporte',
      tipoOperacionId: 'tipo-op-TICKET_BORRADO',
      autorId: ACTOR,
      // Interna (L45): visible solo con OBSERVAR sobre el tipo.
      esInterno: true,
    });
  });

  it('sin Borrar sobre el tipo de ESE ticket: 403 aunque pueda borrar los de otro tipo (S2)', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const result = await useCase.execute({ ticketId: 't-mant', ...actorQueBorraSoloSoporte() });

    expect(result.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
    expect(result.getError().message).toBe(
      'El usuario no tiene el permiso "BORRADO" sobre el tipo de este ticket.',
    );
    expect(tickets.get('t-mant')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('sin Ver sobre el tipo: 404, aunque tenga Borrar en otro tipo (S3)', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const result = await useCase.execute({
      ticketId: 't-mant',
      ...alcancePorTipo(ACTOR, { [SOPORTE]: ['LECTURA', 'VER_TODOS', 'BORRADO'] }),
    });

    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(tickets.get('t-mant')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('con una tarea pendiente: 422 que dice qué resolver, y nada cambia', async () => {
    const pendiente = TareaTicketEntity.crear({
      ticketId: 't-soporte',
      descripcion: 'Cambiar fuente',
      orden: 1,
    });
    const { useCase, tickets, operaciones } = escenario({ tareas: [pendiente] });

    const result = await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(result.getError()).toBeInstanceOf(TicketConPendientesNoBorrableError);
    expect(result.getError().message).toBe(
      'No se puede borrar el ticket: antes hay que completar o eliminar su tarea pendiente.',
    );
    expect(tickets.get('t-soporte')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('con compras vinculadas: 422 que las nombra, y nada cambia', async () => {
    const { useCase, tickets, operaciones } = escenario({
      compras: { 't-soporte': ['COM-2026-00001', 'COM-2026-00007'] },
    });

    const result = await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(result.getError()).toBeInstanceOf(TicketConPendientesNoBorrableError);
    expect(result.getError().message).toBe(
      'No se puede borrar el ticket: antes hay que desvincular de la reparación las compras ' +
        'COM-2026-00001, COM-2026-00007.',
    );
    expect(tickets.get('t-soporte')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('con tareas pendientes y una compra: el 422 nombra las dos cosas', async () => {
    const tareas = [1, 2].map((orden) =>
      TareaTicketEntity.crear({ ticketId: 't-soporte', descripcion: `Tarea ${orden}`, orden }),
    );
    const { useCase } = escenario({ tareas, compras: { 't-soporte': ['COM-2026-00003'] } });

    const result = await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(result.getError().message).toBe(
      'No se puede borrar el ticket: antes hay que completar o eliminar sus 2 tareas pendientes ' +
        'y desvincular de la reparación la compra COM-2026-00003.',
    );
  });

  it('las tareas completadas y las dadas de baja no frenan el borrado (L40)', async () => {
    const completada = TareaTicketEntity.crear({
      ticketId: 't-soporte',
      descripcion: 'Hecha',
      orden: 1,
    });
    completada.completar('usr-tecnico', AHORA);
    const dadaDeBaja = TareaTicketEntity.crear({
      ticketId: 't-soporte',
      descripcion: 'Descartada',
      orden: 2,
    });
    dadaDeBaja.softDelete(AHORA);
    const { useCase, tickets } = escenario({ tareas: [completada, dadaDeBaja] });

    const result = await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(result.isOk()).toBe(true);
    expect(tickets.get('t-soporte')?.isDeleted()).toBe(true);
  });

  it('un ticket PREVENTIVO no se borra: 422 que dice por qué, y nada cambia (L45)', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const result = await useCase.execute({
      ticketId: 't-prev',
      ...alcancePorTipo(ACTOR, { [PREVENTIVO]: ['LECTURA', 'VER_TODOS', 'BORRADO'] }),
    });

    expect(result.getError()).toBeInstanceOf(TicketPreventivoNoBorrableError);
    expect(result.getError().message).toBe(
      'No se puede borrar un ticket de mantenimiento preventivo: lo genera el sistema a partir ' +
        'de su plan.',
    );
    expect(tickets.get('t-prev')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('el PREVENTIVO tampoco lo borra un administrador; sin Borrar sobre el tipo, manda el 403', async () => {
    const { useCase, tickets } = escenario();

    const admin = await useCase.execute({
      ticketId: 't-prev',
      ...alcanceSinRestriccion('usr-admin'),
    });
    const sinBorrar = await useCase.execute({
      ticketId: 't-prev',
      ...alcancePorTipo(ACTOR, { [PREVENTIVO]: ['LECTURA', 'VER_TODOS'] }),
    });

    expect(admin.getError()).toBeInstanceOf(TicketPreventivoNoBorrableError);
    expect(sinBorrar.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
    expect(tickets.get('t-prev')?.isDeleted()).toBe(false);
  });

  // odd/preventivo-por-tipo: el plan elige el tipo de sus tickets, así que "preventivo" deja de ser
  // un tipo. El ticket del fixture es de Mantenimiento, un tipo que sí se borra (caso hermano abajo).
  it('un ticket generado por un plan no se borra aunque su tipo no sea PREVENTIVO: 422, y nada cambia', async () => {
    const { useCase, tickets, operaciones } = escenario();

    const admin = await useCase.execute({
      ticketId: 't-mant-plan',
      ...alcanceSinRestriccion('usr-admin'),
    });

    expect(admin.getError()).toBeInstanceOf(TicketPreventivoNoBorrableError);
    expect(tickets.get('t-mant-plan')?.isDeleted()).toBe(false);
    expect(operaciones).toEqual([]);
  });

  it('hermano: un ticket del mismo tipo que NO generó un plan se borra', async () => {
    const { useCase, tickets } = escenario();

    const result = await useCase.execute({
      ticketId: 't-mant',
      ...alcanceSinRestriccion('usr-admin'),
    });

    expect(result.isOk()).toBe(true);
    expect(tickets.get('t-mant')?.isDeleted()).toBe(true);
  });

  it('un ticket ya borrado es 404 y no duplica el historial', async () => {
    const { useCase, operaciones } = escenario();
    await useCase.execute({ ticketId: 't-soporte', ...alcanceSinRestriccion('usr-admin') });

    const segunda = await useCase.execute({
      ticketId: 't-soporte',
      ...alcanceSinRestriccion('usr-admin'),
    });

    expect(segunda.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(operaciones).toHaveLength(1);
  });

  it('los chequeos corren dentro de la transacción, con el lock del ticket tomado', async () => {
    const { useCase, ticketRepo } = escenario();

    await useCase.execute({ ticketId: 't-soporte', ...actorQueBorraSoloSoporte() });

    expect(ticketRepo.bloquear).toHaveBeenCalledWith('t-soporte');
  });
});
