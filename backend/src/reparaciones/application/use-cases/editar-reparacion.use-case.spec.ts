/**
 * [UNIT] `EditarReparacionUseCase` (odd/detalle-ticket-legible, S4-S5): la regla "no se empezó a
 * trabajar", el bloqueo por compra, la escritura conjunta de ticket y satélite dentro de la
 * transacción con la fila bloqueada, y el evento de reprioritización post-commit.
 */
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { SectorEntity } from '../../../sectores/domain/entities/sector.entity';
import { EstadoEntity } from '../../../tickets/domain/entities/estado.entity';
import { PrioridadEntity } from '../../../tickets/domain/entities/prioridad.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';
import {
  PrioridadNoEncontradaError,
  SectorTicketInexistenteError,
} from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import {
  ReparacionNoEditableError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';
import { EditarReparacionUseCase } from './editar-reparacion.use-case';

const TICKET_ID = 'ticket-1';
const EDILICIA_ID = 'edilicia-1';
const AHORA = new Date('2026-10-17T12:00:00Z');

const estadoId = (codigo: string) => `estado-${codigo.toLowerCase()}`;

/** Una compra en curso (sin cancelar, con un ítem pendiente) bloquea la reparación. */
function compraActiva(id: string): CompraVinculada {
  return {
    compraId: id,
    numero: `C-${id}`,
    cancelada: false,
    items: [],
  };
}

/** Narrowing sin cast: el motivo del rechazo, o falla el test si no es el error esperado. */
function motivoDe(r: { getError(): unknown }): string {
  const error = r.getError();
  if (!(error instanceof ReparacionNoEditableError))
    throw new Error(`Error inesperado: ${String(error)}`);
  return error.motivo;
}

function armar(params: {
  estado?: string;
  tareas?: Array<{ completada: boolean; borrada?: boolean }>;
  bloqueada?: boolean;
  sinSatelite?: boolean;
}) {
  const ticket = TicketEntity.create(
    {
      numero: 'EDI-1',
      titulo: 'Titulo original',
      descripcion: 'Descripcion original',
      tipoId: 'tipo-edilicia',
      estadoId: estadoId(params.estado ?? 'NUEVO'),
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-solicitante',
    },
    TICKET_ID,
  );
  const satelite = TicketEdiliciaEntity.create(
    { ticketId: TICKET_ID, ubicacion: 'Aula 1' },
    EDILICIA_ID,
  );
  const tareas = (params.tareas ?? []).map((t, i) => {
    const tarea = TareaTicketEntity.crear({ ticketId: TICKET_ID, descripcion: `t${i}`, orden: i });
    if (t.completada) tarea.completar('usuario-tecnico', AHORA);
    if (t.borrada) tarea.eliminar(AHORA);
    return tarea;
  });
  const estados = new Map(
    ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'RESUELTO'].map((codigo, orden) => [
      estadoId(codigo),
      EstadoEntity.create(
        { codigo, nombre: codigo, color: null, orden, activo: true },
        estadoId(codigo),
      ),
    ]),
  );
  const publicados: unknown[] = [];
  const postCommit: Array<() => void> = [];
  const llamadas: string[] = [];
  const txRunner: Pick<ITenantTransactionRunner, 'run' | 'alCommitear'> = {
    run: async (fn) => {
      llamadas.push('run');
      return fn();
    },
    alCommitear: (fn) => void postCommit.push(fn),
  };
  const eventPublisher: IDomainEventPublisher = { publish: (e) => void publicados.push(e) };
  const ticketEdiliciaRepo = {
    findById: vi.fn(async (id: string) =>
      !params.sinSatelite && id === EDILICIA_ID ? satelite : null,
    ),
    save: vi.fn(async (_s: TicketEdiliciaEntity) => {
      llamadas.push('save-satelite');
    }),
  };
  const ticketRepo = {
    findById: vi.fn(async (id: string) => {
      llamadas.push('findById');
      return id === TICKET_ID ? ticket : null;
    }),
    bloquear: vi.fn(async (_id: string) => {
      llamadas.push('bloquear');
    }),
    save: vi.fn(async (_t: TicketEntity) => {
      llamadas.push('save-ticket');
    }),
  };
  const useCase = new EditarReparacionUseCase(
    ticketEdiliciaRepo,
    ticketRepo,
    { listarPorTicket: async () => tareas.filter((t) => !t.isDeleted()) },
    {
      findComprasVinculadasByTicketEdiliciaIds: async () =>
        new Map([[EDILICIA_ID, params.bloqueada ? [compraActiva('c1')] : []]]),
    },
    { findById: async (id) => estados.get(id) ?? null },
    {
      findById: async (id) =>
        id === 'prioridad-alta' || id === 'prioridad-media'
          ? PrioridadEntity.create(
              { codigo: id, nombre: id, color: null, orden: 1, activo: true },
              id,
            )
          : null,
    },
    {
      findById: async (id) =>
        id === 'sector-1'
          ? SectorEntity.create({ codigo: 'S1', nombre: 'Secundario', activo: true }, id)
          : null,
    },
    eventPublisher,
    txRunner,
  );
  return {
    useCase,
    ticket,
    satelite,
    ticketRepo,
    ticketEdiliciaRepo,
    llamadas,
    publicados,
    commitear: () => postCommit.forEach((fn) => fn()),
  };
}

const dtoBase = { reparacionId: EDILICIA_ID, actorEsRoot: false };

describe('EditarReparacionUseCase: escritura (S4)', () => {
  it('edita título, descripción, prioridad, sector y la ubicación de Edilicia, y guarda las dos entidades en la tx', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: false }] });

    const r = await c.useCase.execute({
      ...dtoBase,
      titulo: 'Titulo nuevo',
      descripcion: 'Desc nueva',
      prioridadId: 'prioridad-alta',
      ubicacion: 'Aula 2',
      sectorId: 'sector-1',
    });

    expect(r.isOk()).toBe(true);
    const { ticket, ticketEdilicia, sectorNombre } = r.getValue();
    expect(ticket.titulo).toBe('Titulo nuevo');
    expect(ticket.descripcion).toBe('Desc nueva');
    expect(ticket.prioridadId).toBe('prioridad-alta');
    expect(ticket.sectorId).toBe('sector-1');
    expect(ticketEdilicia.ubicacion).toBe('Aula 2');
    expect(sectorNombre).toBe('Secundario');
    // La ubicación general del ticket no se toca: Edilicia usa la suya.
    expect(ticket.ubicacion).toBeNull();
    expect(c.llamadas).toEqual(['run', 'bloquear', 'findById', 'save-ticket', 'save-satelite']);
  });

  it('un campo ausente no se toca y null limpia', async () => {
    const c = armar({});

    const r = await c.useCase.execute({ ...dtoBase, ubicacion: null, descripcion: null });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().ticket.titulo).toBe('Titulo original');
    expect(r.getValue().ticket.descripcion).toBeNull();
    expect(r.getValue().ticketEdilicia.ubicacion).toBeNull();
  });

  it('publica ticket.reprioritizado solo después del commit y solo si la prioridad cambió', async () => {
    const c = armar({});

    await c.useCase.execute({ ...dtoBase, prioridadId: 'prioridad-alta' });
    expect(c.publicados).toEqual([]);
    c.commitear();
    expect(c.publicados).toHaveLength(1);
    expect(c.publicados[0]).toBeInstanceOf(TicketReprioritizadoEvent);

    const sinCambio = armar({});
    await sinCambio.useCase.execute({ ...dtoBase, prioridadId: 'prioridad-media' });
    sinCambio.commitear();
    expect(sinCambio.publicados).toEqual([]);
  });

  it('prioridad o sector inexistentes se rechazan antes de abrir la transacción', async () => {
    const c = armar({});

    const p = await c.useCase.execute({ ...dtoBase, prioridadId: 'no-existe' });
    const s = await c.useCase.execute({ ...dtoBase, sectorId: 'no-existe' });

    expect(p.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(s.getError()).toBeInstanceOf(SectorTicketInexistenteError);
    expect(c.llamadas).toEqual([]);
  });

  it('una reparación inexistente da TicketEdiliciaNoEncontradoError sin escribir', async () => {
    const c = armar({ sinSatelite: true });

    const r = await c.useCase.execute({ ...dtoBase, titulo: 'x' });

    expect(r.getError()).toBeInstanceOf(TicketEdiliciaNoEncontradoError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });
});

describe('EditarReparacionUseCase: regla "no se empezó a trabajar" (S5)', () => {
  it.each(['NUEVO', 'ASIGNADO'])('en %s sin tareas completadas se edita', async (estado) => {
    const c = armar({
      estado,
      tareas: [{ completada: false }, { completada: true, borrada: true }],
    });

    const r = await c.useCase.execute({ ...dtoBase, titulo: 'ok' });

    expect(r.isOk()).toBe(true);
  });

  it.each(['EN_PROCESO', 'RESUELTO'])(
    'en %s un no ROOT recibe el motivo EN_PROCESO y no escribe',
    async (estado) => {
      const c = armar({ estado });

      const r = await c.useCase.execute({ ...dtoBase, titulo: 'x' });

      expect(motivoDe(r)).toBe('EN_PROCESO');
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
      expect(c.ticketEdiliciaRepo.save).not.toHaveBeenCalled();
    },
  );

  it('en NUEVO con una tarea completada un no ROOT recibe el motivo TAREAS_COMPLETADAS', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: true }] });

    const r = await c.useCase.execute({ ...dtoBase, titulo: 'x' });

    expect(motivoDe(r)).toBe('TAREAS_COMPLETADAS');
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('ROOT edita aunque esté EN_PROCESO y con tareas completadas', async () => {
    const c = armar({ estado: 'EN_PROCESO', tareas: [{ completada: true }] });

    const r = await c.useCase.execute({ ...dtoBase, actorEsRoot: true, titulo: 'root' });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().ticket.titulo).toBe('root');
  });

  it('una reparación bloqueada por una compra no la edita nadie, ni ROOT', async () => {
    const c = armar({ estado: 'NUEVO', bloqueada: true });

    const comun = await c.useCase.execute({ ...dtoBase, titulo: 'x' });
    const root = await c.useCase.execute({ ...dtoBase, actorEsRoot: true, titulo: 'x' });

    expect(motivoDe(comun)).toBe('BLOQUEADA');
    expect(motivoDe(root)).toBe('BLOQUEADA');
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });
});
