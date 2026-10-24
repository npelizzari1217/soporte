/**
 * [UNIT] `AvanzarEstadoPorTareasService` (odd/estado-por-tareas, S2-S5): aplica el plan de la
 * política sobre un ticket, con dobles en memoria de los repositorios y del runner.
 */
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { TicketEstadoCambiadoEvent } from '../../domain/events/ticket-estado-cambiado.event';
import { TicketTransicionadoEvent } from '../../domain/events/ticket-transicionado.event';
import { IRelojSlaMarcador } from '../../domain/ports/i-reloj-sla-marcador';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';
import {
  ELEGIBLES_PARA_ASIGNAR,
  NO_ELEGIBLES_PARA_ASIGNAR,
  sumarCandidatosDeAsignacion,
} from '../../test-helpers/candidatos-asignacion';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { AvanzarEstadoPorTareasService } from './avanzar-estado-por-tareas.service';
import { ElegibilidadAsignado } from './elegibilidad-asignado';

const TICKET_ID = 'ticket-1';
const TIPO_ID = 'tipo-edilicia';
const OTRO_TIPO_ID = 'tipo-soporte';
const CLIENTE_ID = 'cliente-1';
const SOLICITANTE = 'usuario-solicitante';
const RESPONSABLE = 'usuario-responsable';
const TECNICO = 'usuario-tecnico';
const AHORA = new Date('2026-10-16T15:00:00Z');

const CODIGOS = [
  'NUEVO',
  'ASIGNADO',
  'EN_PROCESO',
  'ESPERANDO_CLIENTE',
  'RESUELTO',
  'CERRADO',
  'CANCELADO',
] as const;

const estadoId = (codigo: string) => `estado-${codigo.toLowerCase()}`;

function crearTicket(estado: string, asignadoId: string | null): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: 'ED-1',
      titulo: 'Pérdida en el baño',
      descripcion: null,
      tipoId: TIPO_ID,
      estadoId: estadoId(estado),
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: SOLICITANTE,
    },
    TICKET_ID,
  );
  ticket.assignTo(asignadoId);
  if (estado === 'RESUELTO') ticket.setFechaCierre(new Date('2026-10-15T10:00:00Z'));
  return ticket;
}

function armar(params: {
  estado: string;
  asignadoId?: string | null;
  tareas: Array<{ completada: boolean; borrada?: boolean }>;
}) {
  const ticket = crearTicket(
    params.estado,
    params.asignadoId === undefined ? RESPONSABLE : params.asignadoId,
  );
  const estados = new Map(
    CODIGOS.map((codigo, orden) => [
      codigo,
      EstadoEntity.create(
        { codigo, nombre: codigo, color: null, orden, activo: true },
        estadoId(codigo),
      ),
    ]),
  );
  const tareas = params.tareas.map((t, i) => {
    const tarea = TareaTicketEntity.crear({
      ticketId: TICKET_ID,
      descripcion: `tarea ${i}`,
      orden: i,
    });
    if (t.completada) tarea.completar(TECNICO, AHORA);
    if (t.borrada) tarea.eliminar(AHORA);
    return tarea;
  });
  const operaciones: OperacionTicketEntity[] = [];
  const publicados: unknown[] = [];
  const postCommit: Array<() => void> = [];
  const eventPublisher: IDomainEventPublisher = { publish: (e) => void publicados.push(e) };
  const txRunner: Pick<ITenantTransactionRunner, 'alCommitear'> = {
    alCommitear: (fn) => void postCommit.push(fn),
  };
  const relojMarcador: IRelojSlaMarcador = { marcar: vi.fn(async () => undefined) };
  // TECNICO es agente del tipo: el caso por defecto de quien completa (odd/permisos-por-tipo-ticket).
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: TECNICO, rol: 'TECNICO', celdas: [] });
  const permisos = new PermisosTipoTicketEnMemoria(
    [
      { id: TIPO_ID, modulo: 'EDILICIA' },
      { id: OTRO_TIPO_ID, modulo: 'TICKETS' },
    ],
    [{ usuarioId: TECNICO, tipoId: TIPO_ID, accion: 'LECTURA' }],
  );
  const ticketRepo = {
    findById: vi.fn(async (id: string) => (id === TICKET_ID ? ticket : null)),
    save: vi.fn(async (_t: TicketEntity) => undefined),
  };
  const servicio = new AvanzarEstadoPorTareasService(
    ticketRepo,
    { listarPorTicket: async () => tareas.filter((t) => !t.isDeleted()) },
    { save: async (o) => void operaciones.push(o) },
    {
      findById: async (id) => [...estados.values()].find((e) => e.id === id) ?? null,
      findByCodigo: async (codigo) => estados.get(codigo as (typeof CODIGOS)[number]) ?? null,
    },
    {
      findById: async () =>
        TipoTicketEntity.create(
          { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
          TIPO_ID,
        ),
    },
    { findIdByCodigo: async (codigo) => `tipo-op-${codigo}` },
    new TicketStateMachineFactory(),
    relojMarcador,
    eventPublisher,
    txRunner,
    new ElegibilidadAsignado(master, permisos),
    () => AHORA,
  );
  const commitear = () => postCommit.forEach((fn) => fn());
  return {
    ticket,
    servicio,
    operaciones,
    publicados,
    commitear,
    relojMarcador,
    ticketRepo,
    master,
    permisos,
  };
}

const cambiosDeEstado = (operaciones: OperacionTicketEntity[]) =>
  operaciones
    .filter((o) => o.tipoOperacionId === 'tipo-op-CAMBIO_ESTADO')
    .map((o) => [o.estadoAnteriorId, o.estadoNuevoId]);

describe('AvanzarEstadoPorTareasService al COMPLETAR con pendientes (S2)', () => {
  it('NUEVO sin responsable: asigna a quien completa, recorre ASIGNADO y EN_PROCESO y publica ticket.asignado', async () => {
    const c = armar({
      estado: 'NUEVO',
      asignadoId: null,
      tareas: [{ completada: true }, { completada: false }],
    });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, TECNICO, CLIENTE_ID);

    expect(ticket?.asignadoId).toBe(TECNICO);
    expect(ticket?.estadoId).toBe(estadoId('EN_PROCESO'));
    expect(ticket?.fechaCierre).toBeNull();
    const asignaciones = c.operaciones.filter((o) => o.tipoOperacionId === 'tipo-op-ASIGNACION');
    expect(asignaciones).toHaveLength(1);
    expect(asignaciones[0].autorId).toBe(TECNICO);
    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('NUEVO'), estadoId('ASIGNADO')],
      [estadoId('ASIGNADO'), estadoId('EN_PROCESO')],
    ]);
    expect(c.operaciones.every((o) => o.autorId === TECNICO)).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    // Nada sale antes del commit.
    expect(c.publicados).toEqual([]);
    c.commitear();
    expect(c.publicados).toHaveLength(1);
    const evento = c.publicados[0] as TicketAsignadoEvent;
    expect(evento).toBeInstanceOf(TicketAsignadoEvent);
    expect(evento.asignadoId).toBe(TECNICO);
    expect(evento.origen).toBe('MANUAL');
    // NUEVO→ASIGNADO→EN_PROCESO no cambia la categoría del reloj: no se marca ni se notifica.
    expect(c.relojMarcador.marcar).not.toHaveBeenCalled();
  });

  it('NUEVO con responsable: no reasigna y llega a EN_PROCESO', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: true }, { completada: false }] });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, TECNICO, CLIENTE_ID);

    expect(ticket?.asignadoId).toBe(RESPONSABLE);
    expect(ticket?.estadoId).toBe(estadoId('EN_PROCESO'));
    expect(c.operaciones.some((o) => o.tipoOperacionId === 'tipo-op-ASIGNACION')).toBe(false);
  });

  it('ASIGNADO pasa a EN_PROCESO con una sola operación', async () => {
    const c = armar({ estado: 'ASIGNADO', tareas: [{ completada: true }, { completada: false }] });

    await c.servicio.aplicar('COMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('ASIGNADO'), estadoId('EN_PROCESO')],
    ]);
  });

  it('EN_PROCESO con pendientes no cambia nada ni guarda', async () => {
    const c = armar({
      estado: 'EN_PROCESO',
      tareas: [{ completada: true }, { completada: false }],
    });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId('EN_PROCESO'));
    expect(c.operaciones).toEqual([]);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('una tarea borrada pendiente no cuenta: con las activas completas, resuelve', async () => {
    const c = armar({
      estado: 'EN_PROCESO',
      tareas: [{ completada: true }, { completada: false, borrada: true }],
    });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId('RESUELTO'));
  });
});

describe('AvanzarEstadoPorTareasService al COMPLETAR la última (S3)', () => {
  it('EN_PROCESO → RESUELTO: fecha_cierre, CAMBIO_ESTADO, reloj y notificación post-commit', async () => {
    const c = armar({ estado: 'EN_PROCESO', tareas: [{ completada: true }, { completada: true }] });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, TECNICO, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId('RESUELTO'));
    expect(ticket?.fechaCierre).toEqual(AHORA);
    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('EN_PROCESO'), estadoId('RESUELTO')],
    ]);
    expect(c.relojMarcador.marcar).toHaveBeenCalledWith(TICKET_ID, c.operaciones[0].id);
    expect(c.publicados).toEqual([]);
    c.commitear();
    const transicionado = c.publicados.find((e) => e instanceof TicketTransicionadoEvent) as
      TicketTransicionadoEvent | undefined;
    const cambiado = c.publicados.find((e) => e instanceof TicketEstadoCambiadoEvent) as
      TicketEstadoCambiadoEvent | undefined;
    expect(transicionado?.estadoNuevoCodigo).toBe('RESUELTO');
    expect(cambiado?.estadoAnteriorCodigo).toBe('EN_PROCESO');
    expect(cambiado?.estadoNuevoCodigo).toBe('RESUELTO');
    expect(cambiado?.autorId).toBe(TECNICO);
  });

  it('NUEVO sin responsable → asigna y recorre ASIGNADO, EN_PROCESO y RESUELTO', async () => {
    const c = armar({ estado: 'NUEVO', asignadoId: null, tareas: [{ completada: true }] });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, TECNICO, CLIENTE_ID);

    expect(ticket?.asignadoId).toBe(TECNICO);
    expect(ticket?.estadoId).toBe(estadoId('RESUELTO'));
    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('NUEVO'), estadoId('ASIGNADO')],
      [estadoId('ASIGNADO'), estadoId('EN_PROCESO')],
      [estadoId('EN_PROCESO'), estadoId('RESUELTO')],
    ]);
    // Solo el arco que llega a RESUELTO cambia la categoría del reloj.
    expect(c.relojMarcador.marcar).toHaveBeenCalledTimes(1);
  });

  it('ESPERANDO_CLIENTE → RESUELTO directo', async () => {
    const c = armar({ estado: 'ESPERANDO_CLIENTE', tareas: [{ completada: true }] });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId('RESUELTO'));
    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('ESPERANDO_CLIENTE'), estadoId('RESUELTO')],
    ]);
  });

  it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])('en %s no cambia nada', async (estado) => {
    const c = armar({ estado, tareas: [{ completada: true }] });

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId(estado));
    expect(c.operaciones).toEqual([]);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });
});

describe('AvanzarEstadoPorTareasService: solo un agente del tipo queda como responsable', () => {
  async function conCandidatos(tareas: Array<{ completada: boolean }>) {
    const c = armar({ estado: 'NUEVO', asignadoId: null, tareas });
    await sumarCandidatosDeAsignacion(c.master, c.permisos, TIPO_ID, OTRO_TIPO_ID);
    return c;
  }

  it.each(NO_ELEGIBLES_PARA_ASIGNAR)(
    'NUEVO sin responsable: %s completa, el ticket sigue sin responsable y avanza igual',
    async (_caso, autorId) => {
      const c = await conCandidatos([{ completada: true }, { completada: false }]);

      const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, autorId, CLIENTE_ID);

      expect(ticket?.asignadoId).toBeNull();
      expect(c.operaciones.some((o) => o.tipoOperacionId === 'tipo-op-ASIGNACION')).toBe(false);
      // El estado sigue a las tareas igual que antes: ningún arco exige responsable.
      expect(ticket?.estadoId).toBe(estadoId('EN_PROCESO'));
      expect(cambiosDeEstado(c.operaciones)).toEqual([
        [estadoId('NUEVO'), estadoId('ASIGNADO')],
        [estadoId('ASIGNADO'), estadoId('EN_PROCESO')],
      ]);
      expect(c.operaciones.every((o) => o.autorId === autorId)).toBe(true);
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
      c.commitear();
      expect(c.publicados.some((e) => e instanceof TicketAsignadoEvent)).toBe(false);
    },
  );

  it('NUEVO sin responsable: un ADMINISTRADOR completa la última tarea y lo resuelve sin responsable', async () => {
    const c = await conCandidatos([{ completada: true }]);

    const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, 'admin-uuid', CLIENTE_ID);

    expect(ticket?.asignadoId).toBeNull();
    expect(ticket?.estadoId).toBe(estadoId('RESUELTO'));
    expect(ticket?.fechaCierre).toEqual(AHORA);
    c.commitear();
    expect(c.publicados.some((e) => e instanceof TicketAsignadoEvent)).toBe(false);
    expect(c.publicados.some((e) => e instanceof TicketEstadoCambiadoEvent)).toBe(true);
  });

  it.each(ELEGIBLES_PARA_ASIGNAR)(
    'NUEVO sin responsable: %s completa y queda como responsable',
    async (_caso, autorId) => {
      const c = await conCandidatos([{ completada: true }, { completada: false }]);

      const ticket = await c.servicio.aplicar('COMPLETAR', TICKET_ID, autorId, CLIENTE_ID);

      expect(ticket?.asignadoId).toBe(autorId);
      expect(c.operaciones.filter((o) => o.tipoOperacionId === 'tipo-op-ASIGNACION')).toHaveLength(
        1,
      );
      c.commitear();
      const asignado = c.publicados.find((e) => e instanceof TicketAsignadoEvent) as
        TicketAsignadoEvent | undefined;
      expect(asignado?.asignadoId).toBe(autorId);
    },
  );

  it('con responsable no consulta la elegibilidad de quien completa', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: true }, { completada: false }] });

    await c.servicio.aplicar('COMPLETAR', TICKET_ID, 'admin-uuid', CLIENTE_ID);

    expect(c.master.consultasDeAgentes).toBe(0);
  });
});

describe('AvanzarEstadoPorTareasService al DESCOMPLETAR (S4)', () => {
  it('RESUELTO vuelve a EN_PROCESO: limpia fecha_cierre, marca el reloj y publica la transición', async () => {
    const c = armar({ estado: 'RESUELTO', tareas: [{ completada: false }, { completada: true }] });

    const ticket = await c.servicio.aplicar('DESCOMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId('EN_PROCESO'));
    expect(ticket?.fechaCierre).toBeNull();
    expect(cambiosDeEstado(c.operaciones)).toEqual([
      [estadoId('RESUELTO'), estadoId('EN_PROCESO')],
    ]);
    expect(c.relojMarcador.marcar).toHaveBeenCalledTimes(1);
    c.commitear();
    expect(c.publicados.some((e) => e instanceof TicketTransicionadoEvent)).toBe(true);
    // EN_PROCESO no es notificable.
    expect(c.publicados.some((e) => e instanceof TicketEstadoCambiadoEvent)).toBe(false);
  });

  it.each(['NUEVO', 'EN_PROCESO', 'CERRADO'])('en %s no cambia nada', async (estado) => {
    const c = armar({ estado, asignadoId: null, tareas: [{ completada: false }] });

    const ticket = await c.servicio.aplicar('DESCOMPLETAR', TICKET_ID, RESPONSABLE, CLIENTE_ID);

    expect(ticket?.estadoId).toBe(estadoId(estado));
    expect(ticket?.asignadoId).toBeNull();
    expect(c.operaciones).toEqual([]);
  });
});

describe('AvanzarEstadoPorTareasService, bordes', () => {
  it('un ticket inexistente devuelve null y no escribe', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: true }] });

    expect(await c.servicio.aplicar('COMPLETAR', 'otro', TECNICO, CLIENTE_ID)).toBeNull();
    expect(c.operaciones).toEqual([]);
  });

  it('relee el ticket por id, no usa el que cargó el caso de uso', async () => {
    const c = armar({ estado: 'NUEVO', tareas: [{ completada: true }] });

    await c.servicio.aplicar('COMPLETAR', TICKET_ID, TECNICO, CLIENTE_ID);

    expect(c.ticketRepo.findById).toHaveBeenCalledWith(TICKET_ID);
  });
});
