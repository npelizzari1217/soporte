/**
 * [UNIT] `EditarReparacionUseCase` (odd/detalle-ticket-legible, S4-S5): la regla "no se empezó a
 * trabajar", el bloqueo por compra, la escritura del ticket dentro de la transacción con la fila
 * bloqueada, y el evento de reprioritización post-commit. Desde odd/ticket-unificado (S1) la
 * ubicación es la del ticket y el caso de uso recibe el id del ticket, de cualquier tipo.
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
  AccionSobreTipoNoPermitidaError,
  PrioridadNoEncontradaError,
  SectorTicketInexistenteError,
  TicketNoEncontradoError,
  TicketSoloComentariosError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  alcancePorTipo,
  alcanceSinRestriccion,
} from '../../../tickets/test-helpers/alcance-ticket';
import { ReparacionNoEditableError } from '../../domain/errors/reparaciones.errors';
import { CompraVinculada } from '../../domain/services/bloqueo-reparacion';
import { EditarReparacionUseCase } from './editar-reparacion.use-case';

const TICKET_ID = 'ticket-1';
const AHORA = new Date('2026-10-17T12:00:00Z');

const estadoId = (codigo: string) => `estado-${codigo.toLowerCase()}`;

/** Una compra en curso (sin cancelar, con un ítem pendiente) bloquea la reparación. */
function compraActiva(id: string): CompraVinculada {
  return {
    compraId: id,
    numero: `C-${id}`,
    tipoTicketId: null,
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
      ubicacion: 'Aula 1',
    },
    TICKET_ID,
  );
  const tareas = (params.tareas ?? []).map((t, i) => {
    const tarea = TareaTicketEntity.crear({ ticketId: TICKET_ID, descripcion: `t${i}`, orden: i });
    if (t.completada) tarea.completar('usuario-tecnico', AHORA);
    if (t.borrada) tarea.eliminar(AHORA);
    return tarea;
  });
  const estados = new Map(
    ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'RESUELTO', 'CERRADO', 'CANCELADO'].map((codigo, orden) => [
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
  const ticketRepo = {
    findById: vi.fn(async (id: string) => {
      llamadas.push('findById');
      return id === TICKET_ID ? ticket : null;
    }),
    bloquear: vi.fn(async (_id: string) => {
      llamadas.push('bloquear');
    }),
    // El actor no solicitó el ticket ni es su responsable: solo lo ve con VER_TODOS.
    esVisiblePara: vi.fn(async (_ticketId: string, _actorId: string) => false),
    save: vi.fn(async (_t: TicketEntity) => {
      llamadas.push('save-ticket');
    }),
  };
  const useCase = new EditarReparacionUseCase(
    ticketRepo,
    { listarPorTicket: async () => tareas.filter((t) => !t.isDeleted()) },
    {
      findComprasVinculadasByTicketIds: async (ids: string[]) =>
        new Map(ids.map((id) => [id, params.bloqueada ? [compraActiva('c1')] : []])),
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
    ticketRepo,
    llamadas,
    publicados,
    commitear: () => postCommit.forEach((fn) => fn()),
  };
}

const dtoBase = {
  ticketId: TICKET_ID,
  actorEsRoot: false,
  alcance: alcanceSinRestriccion('usuario-editor'),
};

describe('EditarReparacionUseCase: escritura (S4)', () => {
  it('edita título, descripción, prioridad, sector y ubicación del ticket, y lo guarda en la tx', async () => {
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
    const { ticket, sectorNombre } = r.getValue();
    expect(ticket.titulo).toBe('Titulo nuevo');
    expect(ticket.descripcion).toBe('Desc nueva');
    expect(ticket.prioridadId).toBe('prioridad-alta');
    expect(ticket.sectorId).toBe('sector-1');
    // Una sola ubicación, la del ticket (odd/ticket-unificado, S1).
    expect(ticket.ubicacion).toBe('Aula 2');
    expect(sectorNombre).toBe('Secundario');
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.llamadas).toEqual(['run', 'bloquear', 'findById', 'save-ticket']);
  });

  it('un campo ausente no se toca y null limpia', async () => {
    const c = armar({});

    const r = await c.useCase.execute({ ...dtoBase, ubicacion: null, descripcion: null });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().ticket.titulo).toBe('Titulo original');
    expect(r.getValue().ticket.descripcion).toBeNull();
    expect(r.getValue().ticket.ubicacion).toBeNull();
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

  it('un ticket inexistente da TicketNoEncontradoError sin escribir', async () => {
    const c = armar({});

    const r = await c.useCase.execute({ ...dtoBase, ticketId: 'otro-ticket', titulo: 'x' });

    expect(r.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('un ticket de cualquier tipo, sin satélite de Edilicia, se edita igual (odd/ticket-unificado)', async () => {
    const c = armar({});

    const r = await c.useCase.execute({
      ...dtoBase,
      ubicacion: 'Depósito',
      alcance: alcancePorTipo('usuario-editor', {
        'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
      }),
    });

    expect(r.getValue().ticket.ubicacion).toBe('Depósito');
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

describe('EditarReparacionUseCase: permisos por tipo del ticket base (odd/permisos-por-tipo-ticket, D5 c)', () => {
  it('no ve el ticket (sin LECTURA sobre su tipo) → 404, decidido con la fila bloqueada y sin escribir', async () => {
    const c = armar({});

    const r = await c.useCase.execute({
      ...dtoBase,
      titulo: 'x',
      alcance: alcancePorTipo('usuario-editor', {
        'tipo-otro': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
      }),
    });

    expect(r.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.llamadas).toEqual(['run', 'bloquear', 'findById']);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('lo ve sin MODIFICACION sobre su tipo → 403 sin escribir', async () => {
    const c = armar({});

    const r = await c.useCase.execute({
      ...dtoBase,
      titulo: 'x',
      alcance: alcancePorTipo('usuario-editor', {
        'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'ALTAS'],
      }),
    });

    expect(r.getError()).toBeInstanceOf(AccionSobreTipoNoPermitidaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('con LECTURA, VER_TODOS y MODIFICACION sobre su tipo → edita', async () => {
    const c = armar({});

    const r = await c.useCase.execute({
      ...dtoBase,
      titulo: 'Titulo nuevo',
      alcance: alcancePorTipo('usuario-editor', {
        'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
      }),
    });

    expect(r.getValue().ticket.titulo).toBe('Titulo nuevo');
  });
});

describe('EditarReparacionUseCase: resuelto, cerrado o cancelado, solo comentarios (odd/cerrado-solo-comentarios, S1-S3)', () => {
  // Ve el ticket con VER_TODOS y tiene MODIFICACION sobre su tipo: lo único que lo frena es el estado.
  const tecnico = alcancePorTipo('usuario-editor', {
    'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'MODIFICACION'],
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
    'en %s un no administrador recibe TicketSoloComentariosError (422) y no escribe',
    async (estado) => {
      const c = armar({ estado });

      const r = await c.useCase.execute({
        ...dtoBase,
        alcance: tecnico,
        titulo: 'x',
        ubicacion: 'Otra',
      });

      const error = r.getError();
      expect(error).toBeInstanceOf(TicketSoloComentariosError);
      expect((error as TicketSoloComentariosError).estadoCodigo).toBe(estado);
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
      expect(c.ticket.titulo).toBe('Titulo original');
      expect(c.ticket.ubicacion).toBe('Aula 1');
    },
  );

  it('un ADMINISTRADOR (no ROOT) en CERRADO sigue con la regla de siempre: motivo EN_PROCESO', async () => {
    const c = armar({ estado: 'CERRADO' });

    const r = await c.useCase.execute({ ...dtoBase, titulo: 'x' });

    expect(motivoDe(r)).toBe('EN_PROCESO');
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('ROOT edita en CANCELADO', async () => {
    const c = armar({ estado: 'CANCELADO' });

    const r = await c.useCase.execute({ ...dtoBase, actorEsRoot: true, titulo: 'Corregido' });

    expect(r.getValue().ticket.titulo).toBe('Corregido');
  });

  it('el bloqueo por compra sigue mandando antes que el estado', async () => {
    const c = armar({ estado: 'RESUELTO', bloqueada: true });

    const r = await c.useCase.execute({ ...dtoBase, alcance: tecnico, titulo: 'x' });

    expect(motivoDe(r)).toBe('BLOQUEADA');
  });
});
