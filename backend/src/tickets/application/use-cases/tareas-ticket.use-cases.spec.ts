/**
 * [UNIT] Casos de uso de tareas de un ticket (odd/tareas-con-tecnico, T2), con fakes en memoria:
 * quién puede cada acción (CA3, CA4), la elegibilidad del técnico (punto 9), las entradas del
 * historial (CA8), los errores y el avance (CA7).
 */
import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TareaAccionNoPermitidaError,
  TareaNoCompletadaError,
  TareaNoEncontradaError,
  TareaYaCompletadaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { EventoTarea } from '../../domain/policies/estado-por-tareas.policy';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { AsignarTecnicoTareaUseCase } from './asignar-tecnico-tarea.use-case';
import { CompletarTareaUseCase } from './completar-tarea.use-case';
import { CrearTareaTicketUseCase } from './crear-tarea-ticket.use-case';
import { DescompletarTareaUseCase } from './descompletar-tarea.use-case';
import { EliminarTareaUseCase } from './eliminar-tarea.use-case';
import { ListarTareasTicketUseCase } from './listar-tareas-ticket.use-case';

const TICKET_ID = 'ticket-1';
const OTRO_TICKET_ID = 'ticket-2';
const TIPO_ID = 'tipo-edilicia';
/** Ticket de un tipo del módulo TICKETS (Soporte), para la regla de lectura de T12. */
const SOPORTE_TICKET_ID = 'ticket-soporte';
const TIPO_SOPORTE_ID = 'tipo-soporte';
const CLIENTE_ID = 'cliente-1';
const SOLICITANTE = 'usuario-solicitante';
const RESPONSABLE = 'usuario-responsable';
const TECNICO = 'usuario-tecnico';
const OTRO_TECNICO = 'usuario-otro-tecnico';
const ADMIN = 'usuario-admin';
const AHORA = new Date('2026-10-13T12:00:00Z');

const TODOS = ['TICKETS', 'COMPRAS', 'EDILICIA', 'EQUIPOS'];

function actor(id: string, extra: Partial<ActorTarea> = {}): ActorTarea {
  return {
    id,
    esAdministrador: false,
    tienePermisoVerTodos: true,
    modulosConModificacion: ['EDILICIA'],
    ...extra,
  };
}

const ACTORES = {
  responsable: actor(RESPONSABLE),
  responsableSinModificacion: actor(RESPONSABLE, { modulosConModificacion: ['TICKETS'] }),
  administrador: actor(ADMIN, { esAdministrador: true, modulosConModificacion: TODOS }),
  administradorSinModificacion: actor(ADMIN, { esAdministrador: true, modulosConModificacion: [] }),
  tecnicoDeLaTarea: actor(TECNICO),
  otroTecnico: actor(OTRO_TECNICO),
  ajenoSinVerTodos: actor(OTRO_TECNICO, { tienePermisoVerTodos: false }),
  solicitante: actor(SOLICITANTE, { tienePermisoVerTodos: false, modulosConModificacion: [] }),
};
type NombreActor = keyof typeof ACTORES;

function crearTicket(id: string, tipoId: string = TIPO_ID): TicketEntity {
  const ticket = TicketEntity.create(
    {
      numero: `ED-${id}`,
      titulo: 'Pérdida en el baño',
      descripcion: null,
      tipoId,
      estadoId: 'estado-en-proceso',
      prioridadId: 'prioridad-media',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: SOLICITANTE,
    },
    id,
  );
  ticket.assignTo(RESPONSABLE);
  return ticket;
}

function armar() {
  const tickets = new Map<string, TicketEntity>([
    [TICKET_ID, crearTicket(TICKET_ID)],
    [OTRO_TICKET_ID, crearTicket(OTRO_TICKET_ID)],
    [SOPORTE_TICKET_ID, crearTicket(SOPORTE_TICKET_ID, TIPO_SOPORTE_ID)],
  ]);
  const operaciones: OperacionTicketEntity[] = [];

  const tareas = new Map<string, TareaTicketEntity>();
  /** Orden de las llamadas dentro de la transacción (odd/estado-por-tareas, S5-S6). */
  const secuencia: string[] = [];
  const ticketRepo = {
    findById: async (id: string) => tickets.get(id) ?? null,
    bloquear: vi.fn(async (id: string) => {
      secuencia.push(`bloquear:${id}`);
    }),
    // Espejo en memoria de `whereVisiblePara` (CA10): solicitante o técnico de una tarea activa.
    esVisiblePara: async (ticketId: string, actorId: string) =>
      tickets.get(ticketId)?.solicitanteId === actorId ||
      [...tareas.values()].some(
        (t) => t.ticketId === ticketId && t.tecnicoId === actorId && !t.isDeleted(),
      ),
  };
  const tipoTicketRepo = {
    findById: async (id: string) => {
      if (id === TIPO_ID) {
        return TipoTicketEntity.create(
          { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
          TIPO_ID,
        );
      }
      if (id === TIPO_SOPORTE_ID) {
        return TipoTicketEntity.create(
          { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
          TIPO_SOPORTE_ID,
        );
      }
      return null;
    },
  };
  const tareaRepo = {
    listarPorTicket: async (ticketId: string) =>
      [...tareas.values()].filter((t) => t.ticketId === ticketId && !t.isDeleted()),
    buscarPorId: async (id: string) => tareas.get(id) ?? null,
    crear: vi.fn(async (tarea: TareaTicketEntity) => {
      tareas.set(tarea.id, tarea);
    }),
    // El caso de uso muta la misma instancia que guarda el Map, así que la condición de las
    // escrituras ya no se puede observar acá: la prueba la integración de concurrencia (T10).
    completarSiPendiente: vi.fn(async (_tarea: TareaTicketEntity) => {
      secuencia.push('completarSiPendiente');
      return true;
    }),
    descompletarSiCompletada: vi.fn(async (_tarea: TareaTicketEntity) => {
      secuencia.push('descompletarSiCompletada');
      return true;
    }),
    asignarTecnicoSiActiva: vi.fn(async (_tarea: TareaTicketEntity) => true),
    darDeBajaSiActiva: vi.fn(async (_tarea: TareaTicketEntity) => true),
  };
  const operacionRepo = {
    save: vi.fn(async (operacion: OperacionTicketEntity) => {
      operaciones.push(operacion);
    }),
  };
  const tipoOperacionRepo = { findIdByCodigo: async (codigo: string) => `tipo-op-${codigo}` };
  let enTransaccion = false;
  const txRunner = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      enTransaccion = true;
      try {
        return await fn();
      } finally {
        enTransaccion = false;
      }
    },
  };
  // Doble de `AvanzarEstadoPorTareasService`: registra con qué y si corrió dentro de la transacción.
  const avanzarEstado = {
    aplicar: vi.fn(async (evento: EventoTarea, ticketId: string, autorId: string) => {
      secuencia.push(
        `aplicar:${evento}:${ticketId}:${autorId}:${enTransaccion ? 'en-tx' : 'fuera'}`,
      );
      return tickets.get(ticketId) ?? null;
    }),
  };
  const checker = {
    listarTecnicosAsignables: vi.fn(async (_clienteId: string, modulo: string | null) =>
      modulo === 'EDILICIA'
        ? [
            { id: TECNICO, nombre: 'Tina', apellido: 'Técnica' },
            { id: OTRO_TECNICO, nombre: 'Otto', apellido: 'Técnico' },
          ]
        : [],
    ),
  };
  const ahora = () => AHORA;

  function sembrarTarea(
    id: string,
    extra: {
      ticketId?: string;
      tecnicoId?: string | null;
      completada?: boolean;
      orden?: number;
    } = {},
  ): TareaTicketEntity {
    const tarea = TareaTicketEntity.crear(
      {
        ticketId: extra.ticketId ?? TICKET_ID,
        descripcion: `Tarea ${id}`,
        orden: extra.orden ?? 0,
        tecnicoId: extra.tecnicoId ?? null,
      },
      id,
    );
    if (extra.completada) tarea.completar(TECNICO, AHORA);
    tareas.set(id, tarea);
    return tarea;
  }

  return {
    tickets,
    tareas,
    operaciones,
    sembrarTarea,
    checker,
    tareaRepo,
    operacionRepo,
    ticketRepo,
    avanzarEstado,
    secuencia,
    crear: new CrearTareaTicketUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
    ),
    asignar: new AsignarTecnicoTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      checker,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      ahora,
    ),
    completar: new CompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      avanzarEstado,
      ahora,
    ),
    descompletar: new DescompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      avanzarEstado,
      ahora,
    ),
    eliminar: new EliminarTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      ahora,
    ),
    listar: new ListarTareasTicketUseCase(ticketRepo, tipoTicketRepo, tareaRepo),
  };
}

function errorDe<T>(result: Result<T, DomainError>): DomainError {
  expect(result.isFail()).toBe(true);
  return result.getError();
}

/** Resultado esperado de la matriz de actores: permitido, 403 o 404 del ticket. */
type Esperado = 'ok' | 'prohibido' | 'no-visible';

function verificarRechazo(result: Result<unknown, DomainError>, esperado: Esperado): void {
  if (esperado === 'ok') {
    expect(result.isOk()).toBe(true);
  } else if (esperado === 'prohibido') {
    expect(errorDe(result)).toBeInstanceOf(TareaAccionNoPermitidaError);
  } else {
    expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
  }
}

/** CA3: crear, asignar y borrar. */
const MATRIZ_GESTION: [NombreActor, Esperado][] = [
  ['responsable', 'ok'],
  ['administrador', 'ok'],
  ['responsableSinModificacion', 'prohibido'],
  ['administradorSinModificacion', 'prohibido'],
  ['tecnicoDeLaTarea', 'prohibido'],
  ['otroTecnico', 'prohibido'],
  ['ajenoSinVerTodos', 'no-visible'],
  ['solicitante', 'prohibido'],
];

/** CA4: completar y descompletar. */
const MATRIZ_COMPLETADO: [NombreActor, Esperado][] = [
  ['responsable', 'ok'],
  ['responsableSinModificacion', 'ok'],
  ['administrador', 'ok'],
  ['tecnicoDeLaTarea', 'ok'],
  ['otroTecnico', 'prohibido'],
  ['ajenoSinVerTodos', 'no-visible'],
  ['solicitante', 'prohibido'],
];

describe('CrearTareaTicketUseCase', () => {
  it.each(MATRIZ_GESTION)('actor %s → %s', async (nombre, esperado) => {
    const deps = armar();
    const result = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: ACTORES[nombre],
      descripcion: 'Cambiar el flotante',
    });
    verificarRechazo(result, esperado);
    expect(deps.tareas.size).toBe(esperado === 'ok' ? 1 : 0);
    expect(deps.operaciones).toHaveLength(esperado === 'ok' ? 1 : 0);
  });

  it('crea la tarea pendiente, sin técnico, después de la última activa, y escribe TAREA_CREADA', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { orden: 0 });
    deps.sembrarTarea('t2', { orden: 4 });
    const borrada = deps.sembrarTarea('t3', { orden: 9 });
    borrada.eliminar(AHORA);

    const result = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: ACTORES.responsable,
      descripcion: 'Cambiar el flotante',
    });

    const tarea = result.getValue();
    expect(tarea.orden).toBe(5);
    expect(tarea.tecnicoId).toBeNull();
    expect(tarea.completada).toBe(false);
    expect(deps.tareaRepo.crear).toHaveBeenCalledWith(tarea);
    const [operacion] = deps.operaciones;
    expect(operacion.tipoOperacionId).toBe('tipo-op-TAREA_CREADA');
    expect(operacion.autorId).toBe(RESPONSABLE);
    expect(operacion.ticketId).toBe(TICKET_ID);
    expect(operacion.descripcion).toBe('Cambiar el flotante');
    expect(operacion.esInterno).toBe(false);
    expect(operacion.metadata).toEqual({ tarea_id: tarea.id });
  });

  it('la primera tarea de un ticket va con orden 0', async () => {
    const deps = armar();
    const result = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: ACTORES.administrador,
      descripcion: 'Primera',
    });
    expect(result.getValue().orden).toBe(0);
  });

  it('un ticket inexistente o dado de baja da TicketNoEncontradoError', async () => {
    const deps = armar();
    deps.tickets.get(OTRO_TICKET_ID)?.softDelete(AHORA);
    for (const ticketId of ['no-existe', OTRO_TICKET_ID]) {
      const result = await deps.crear.execute({
        ticketId,
        actor: ACTORES.administrador,
        descripcion: 'x',
      });
      expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
    }
  });
});

describe('AsignarTecnicoTareaUseCase', () => {
  const asignar = (deps: ReturnType<typeof armar>, a: ActorTarea, tecnicoId: string | null) =>
    deps.asignar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: a,
      clienteId: CLIENTE_ID,
      tecnicoId,
    });

  it.each(MATRIZ_GESTION)('actor %s → %s', async (nombre, esperado) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    const result = await asignar(deps, ACTORES[nombre], OTRO_TECNICO);
    verificarRechazo(result, esperado);
    expect(tarea.tecnicoId).toBe(esperado === 'ok' ? OTRO_TECNICO : TECNICO);
    expect(deps.operaciones).toHaveLength(esperado === 'ok' ? 1 : 0);
  });

  it('asigna un técnico elegible y escribe TAREA_ASIGNADA con el anterior y el nuevo', async () => {
    const deps = armar();
    deps.sembrarTarea('t1');

    const result = await asignar(deps, ACTORES.responsable, TECNICO);

    expect(result.getValue().tecnicoId).toBe(TECNICO);
    expect(deps.checker.listarTecnicosAsignables).toHaveBeenCalledWith(CLIENTE_ID, 'EDILICIA');
    expect(deps.tareaRepo.asignarTecnicoSiActiva).toHaveBeenCalledTimes(1);
    const [operacion] = deps.operaciones;
    expect(operacion.tipoOperacionId).toBe('tipo-op-TAREA_ASIGNADA');
    expect(operacion.autorId).toBe(RESPONSABLE);
    expect(operacion.metadata).toEqual({
      tarea_id: 't1',
      tecnico_anterior_id: null,
      tecnico_nuevo_id: TECNICO,
    });
  });

  it('quitar el técnico no consulta master y deja registro del retiro', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await asignar(deps, ACTORES.administrador, null);

    expect(result.getValue().tecnicoId).toBeNull();
    expect(deps.checker.listarTecnicosAsignables).not.toHaveBeenCalled();
    expect(deps.operaciones[0].metadata).toEqual({
      tarea_id: 't1',
      tecnico_anterior_id: TECNICO,
      tecnico_nuevo_id: null,
    });
  });

  it('rechaza un técnico no elegible (ADMINISTRADOR o sin el módulo) con TecnicoTareaNoElegibleError', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1');

    for (const tecnicoId of [ADMIN, RESPONSABLE, 'usuario-sin-modulo']) {
      const result = await asignar(deps, ACTORES.administrador, tecnicoId);
      expect(errorDe(result)).toBeInstanceOf(TecnicoTareaNoElegibleError);
    }
    expect(tarea.tecnicoId).toBeNull();
    expect(deps.operaciones).toHaveLength(0);
  });

  it('reasignar el mismo técnico no guarda ni escribe historial', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await asignar(deps, ACTORES.responsable, TECNICO);

    expect(result.isOk()).toBe(true);
    expect(deps.tareaRepo.asignarTecnicoSiActiva).not.toHaveBeenCalled();
    expect(deps.operaciones).toHaveLength(0);
  });

  it('el crédito no se toca al cambiar el técnico de una tarea completada', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    await asignar(deps, ACTORES.responsable, OTRO_TECNICO);

    expect(tarea.completadaPorId).toBe(TECNICO);
  });

  it('una tarea inexistente, dada de baja o de otro ticket da TareaNoEncontradaError', async () => {
    const deps = armar();
    deps.sembrarTarea('borrada').eliminar(AHORA);
    deps.sembrarTarea('ajena', { ticketId: OTRO_TICKET_ID });

    for (const tareaId of ['no-existe', 'borrada', 'ajena']) {
      const result = await deps.asignar.execute({
        ticketId: TICKET_ID,
        tareaId,
        actor: ACTORES.administrador,
        clienteId: CLIENTE_ID,
        tecnicoId: TECNICO,
      });
      expect(errorDe(result)).toBeInstanceOf(TareaNoEncontradaError);
    }
    expect(deps.tareas.get('ajena')?.tecnicoId).toBeNull();
  });
});

describe('CompletarTareaUseCase', () => {
  it.each(MATRIZ_COMPLETADO)('actor %s → %s', async (nombre, esperado) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    const result = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES[nombre],
    });
    verificarRechazo(result, esperado);
    expect(tarea.completada).toBe(esperado === 'ok');
    expect(deps.operaciones).toHaveLength(esperado === 'ok' ? 1 : 0);
  });

  it('el crédito es de quien completa, no del técnico asignado, y escribe TAREA_COMPLETADA', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.responsable,
    });

    const tarea = result.getValue();
    expect(tarea.completadaPorId).toBe(RESPONSABLE);
    expect(tarea.completadaEn).toEqual(AHORA);
    expect(deps.tareaRepo.completarSiPendiente).toHaveBeenCalledWith(tarea, {});
    const [operacion] = deps.operaciones;
    expect(operacion.tipoOperacionId).toBe('tipo-op-TAREA_COMPLETADA');
    expect(operacion.autorId).toBe(RESPONSABLE);
    expect(operacion.metadata).toEqual({ tarea_id: 't1' });
  });

  // JD-S2 (T13): solo el permiso que sale de ser el técnico de la tarea condiciona la escritura a
  // que la tarea siga siendo suya. El responsable y el administrador no dependen del técnico.
  it.each<[NombreActor, Record<string, string>]>([
    ['tecnicoDeLaTarea', { tecnicoId: TECNICO }],
    ['responsable', {}],
    ['administrador', {}],
  ])('actor %s condiciona la escritura a %o', async (nombre, condicion) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    await deps.completar.execute({ ticketId: TICKET_ID, tareaId: 't1', actor: ACTORES[nombre] });

    expect(deps.tareaRepo.completarSiPendiente).toHaveBeenCalledWith(tarea, condicion);
  });

  // odd/estado-por-tareas (S5-S6): el lock del ticket va ANTES de escribir la tarea, y el avance de
  // estado corre después, dentro de la misma transacción, con el actor como autor.
  it('bloquea el ticket antes de escribir y aplica el avance de estado dentro de la transacción', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.tecnicoDeLaTarea,
    });

    expect(deps.secuencia).toEqual([
      `bloquear:${TICKET_ID}`,
      'completarSiPendiente',
      `aplicar:COMPLETAR:${TICKET_ID}:${TECNICO}:en-tx`,
    ]);
  });

  it('si la escritura de la tarea no aplica, no avanza el estado del ticket', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    deps.tareaRepo.completarSiPendiente.mockResolvedValueOnce(false);

    const result = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.administrador,
    });

    expect(result.isFail()).toBe(true);
    expect(deps.avanzarEstado.aplicar).not.toHaveBeenCalled();
  });

  it('completar una tarea ya completada da TareaYaCompletadaError y conserva el crédito', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    const result = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.administrador,
    });

    expect(errorDe(result)).toBeInstanceOf(TareaYaCompletadaError);
    expect(tarea.completadaPorId).toBe(TECNICO);
    expect(deps.operaciones).toHaveLength(0);
  });

  it('una tarea dada de baja o de otro ticket da TareaNoEncontradaError', async () => {
    const deps = armar();
    deps.sembrarTarea('borrada').eliminar(AHORA);
    deps.sembrarTarea('ajena', { ticketId: OTRO_TICKET_ID });

    for (const tareaId of ['borrada', 'ajena']) {
      const result = await deps.completar.execute({
        ticketId: TICKET_ID,
        tareaId,
        actor: ACTORES.administrador,
      });
      expect(errorDe(result)).toBeInstanceOf(TareaNoEncontradaError);
    }
  });
});

describe('DescompletarTareaUseCase', () => {
  it.each(MATRIZ_COMPLETADO)('actor %s → %s', async (nombre, esperado) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });
    const result = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES[nombre],
    });
    verificarRechazo(result, esperado);
    expect(tarea.completada).toBe(esperado !== 'ok');
  });

  it('limpia quién y cuándo, y escribe TAREA_DESCOMPLETADA con quién la había completado', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    const result = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.responsable,
    });

    const tarea = result.getValue();
    expect(tarea.completada).toBe(false);
    expect(tarea.completadaPorId).toBeNull();
    expect(tarea.completadaEn).toBeNull();
    const [operacion] = deps.operaciones;
    expect(operacion.tipoOperacionId).toBe('tipo-op-TAREA_DESCOMPLETADA');
    expect(operacion.autorId).toBe(RESPONSABLE);
    expect(operacion.metadata).toEqual({ tarea_id: 't1', completada_por_anterior_id: TECNICO });
  });

  // JD-S1 y JD-S2 (T13): la escritura exige el completado que se leyó y, si el permiso sale solo
  // de ser el técnico de la tarea, que la tarea siga siendo suya.
  it.each<[NombreActor, Record<string, string>]>([
    ['tecnicoDeLaTarea', { tecnicoId: TECNICO }],
    ['responsable', {}],
    ['administrador', {}],
  ])('actor %s condiciona la escritura al completado leído y a %o', async (nombre, extra) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    await deps.descompletar.execute({ ticketId: TICKET_ID, tareaId: 't1', actor: ACTORES[nombre] });

    expect(deps.tareaRepo.descompletarSiCompletada).toHaveBeenCalledWith(tarea, {
      completadoLeido: { completadaPorId: TECNICO, completadaEn: AHORA },
      ...extra,
    });
  });

  it('bloquea el ticket antes de escribir y aplica DESCOMPLETAR dentro de la transacción', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.responsable,
    });

    expect(deps.secuencia).toEqual([
      `bloquear:${TICKET_ID}`,
      'descompletarSiCompletada',
      `aplicar:DESCOMPLETAR:${TICKET_ID}:${RESPONSABLE}:en-tx`,
    ]);
  });

  it('si la escritura de la tarea no aplica, no toca el estado del ticket', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });
    deps.tareaRepo.descompletarSiCompletada.mockResolvedValueOnce(false);

    const result = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.administrador,
    });

    expect(result.isFail()).toBe(true);
    expect(deps.avanzarEstado.aplicar).not.toHaveBeenCalled();
  });

  it('descompletar una tarea pendiente da TareaNoCompletadaError', async () => {
    const deps = armar();
    deps.sembrarTarea('t1');

    const result = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.administrador,
    });

    expect(errorDe(result)).toBeInstanceOf(TareaNoCompletadaError);
    expect(deps.operaciones).toHaveLength(0);
  });
});

describe('EliminarTareaUseCase', () => {
  it.each(MATRIZ_GESTION)('actor %s → %s', async (nombre, esperado) => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    const result = await deps.eliminar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES[nombre],
    });
    verificarRechazo(result, esperado);
    expect(tarea.isDeleted()).toBe(esperado === 'ok');
  });

  it('da de baja lógica, conserva el crédito y escribe TAREA_ELIMINADA', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });

    const result = await deps.eliminar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.responsable,
    });

    expect(result.isOk()).toBe(true);
    expect(tarea.deletedAt).toEqual(AHORA);
    expect(tarea.completadaPorId).toBe(TECNICO);
    expect(deps.tareaRepo.darDeBajaSiActiva).toHaveBeenCalledWith(tarea);
    const [operacion] = deps.operaciones;
    expect(operacion.tipoOperacionId).toBe('tipo-op-TAREA_ELIMINADA');
    expect(operacion.metadata).toEqual({ tarea_id: 't1' });
  });

  it('borrar dos veces da TareaNoEncontradaError', async () => {
    const deps = armar();
    deps.sembrarTarea('t1');
    const dto = { ticketId: TICKET_ID, tareaId: 't1', actor: ACTORES.administrador };

    await deps.eliminar.execute(dto);
    const result = await deps.eliminar.execute(dto);

    expect(errorDe(result)).toBeInstanceOf(TareaNoEncontradaError);
    expect(deps.operaciones).toHaveLength(1);
  });
});

describe('ListarTareasTicketUseCase', () => {
  it('devuelve las tareas activas con el avance sobre las activas', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { completada: true });
    deps.sembrarTarea('t2');
    deps.sembrarTarea('t3');
    deps.sembrarTarea('t4', { completada: true }).eliminar(AHORA);
    deps.sembrarTarea('ajena', { ticketId: OTRO_TICKET_ID, completada: true });

    const result = await deps.listar.execute({
      ticketId: TICKET_ID,
      actorId: TECNICO,
      tienePermisoVerTodos: true,
      modulosConLectura: ['EDILICIA'],
    });

    const { tareas, avance } = result.getValue();
    expect(tareas.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(avance).toEqual({ total: 3, completadas: 1, porcentaje: 33.33 });
  });

  it('un ticket sin tareas tiene avance 0', async () => {
    const deps = armar();
    const result = await deps.listar.execute({
      ticketId: TICKET_ID,
      actorId: TECNICO,
      tienePermisoVerTodos: true,
      modulosConLectura: ['EDILICIA'],
    });
    expect(result.getValue()).toEqual({
      tareas: [],
      avance: { total: 0, completadas: 0, porcentaje: 0 },
    });
  });

  it('en un ticket de TICKETS, el solicitante con TICKETS:LECTURA las ve sin VER_TODOS; un ajeno sin VER_TODOS recibe 404', async () => {
    const deps = armar();
    const propio = await deps.listar.execute({
      ticketId: SOPORTE_TICKET_ID,
      actorId: SOLICITANTE,
      tienePermisoVerTodos: false,
      modulosConLectura: ['TICKETS'],
    });
    const ajeno = await deps.listar.execute({
      ticketId: SOPORTE_TICKET_ID,
      actorId: OTRO_TECNICO,
      tienePermisoVerTodos: false,
      modulosConLectura: ['TICKETS'],
    });
    expect(propio.isOk()).toBe(true);
    expect(errorDe(ajeno)).toBeInstanceOf(TicketNoEncontradoError);
  });

  describe('listar sigue el permiso de lectura del módulo del tipo (T12, JD-W3)', () => {
    type Esperado = 'ok' | 403 | 404;
    const listar = (
      deps: ReturnType<typeof armar>,
      ticketId: string,
      actorId: string,
      tienePermisoVerTodos: boolean,
      modulosConLectura: string[],
    ) => deps.listar.execute({ ticketId, actorId, tienePermisoVerTodos, modulosConLectura });
    const comprobar = (result: Awaited<ReturnType<typeof listar>>, esperado: Esperado): void => {
      if (esperado === 'ok') {
        expect(result.getValue().tareas.map((t) => t.id)).toEqual(['t1']);
      } else {
        expect(errorDe(result)).toBeInstanceOf(
          esperado === 403 ? TareaAccionNoPermitidaError : TicketNoEncontradoError,
        );
      }
    };

    it.each<[string, string, boolean, string[], Esperado]>([
      [
        'VER_TODOS sin TICKETS:LECTURA: ve el ticket, pero no lista (403)',
        OTRO_TECNICO,
        true,
        [],
        403,
      ],
      ['VER_TODOS con TICKETS:LECTURA', OTRO_TECNICO, true, ['TICKETS'], 'ok'],
      ['TICKETS:LECTURA sin ver el ticket (404)', OTRO_TECNICO, false, ['TICKETS'], 404],
      ['solicitante sin TICKETS:LECTURA (403)', SOLICITANTE, false, [], 403],
      [
        'EDILICIA:LECTURA no alcanza en un ticket de TICKETS',
        OTRO_TECNICO,
        true,
        ['EDILICIA'],
        403,
      ],
      ['sin permisos ni visibilidad (404)', OTRO_TECNICO, false, [], 404],
    ])('ticket de TICKETS — %s', async (_caso, actorId, verTodos, lectura, esperado) => {
      const deps = armar();
      deps.sembrarTarea('t1', { ticketId: SOPORTE_TICKET_ID });

      comprobar(await listar(deps, SOPORTE_TICKET_ID, actorId, verTodos, lectura), esperado);
    });

    it.each<[string, string, boolean, string[], Esperado]>([
      ['EDILICIA:LECTURA sin ver el ticket: alcanza', OTRO_TECNICO, false, ['EDILICIA'], 'ok'],
      ['EDILICIA:LECTURA con VER_TODOS', OTRO_TECNICO, true, ['EDILICIA'], 'ok'],
      [
        'TICKETS:LECTURA y VER_TODOS sin EDILICIA:LECTURA (403)',
        OTRO_TECNICO,
        true,
        ['TICKETS'],
        403,
      ],
      ['sin permisos ni visibilidad (404)', OTRO_TECNICO, false, [], 404],
    ])('ticket de Edilicia — %s', async (_caso, actorId, verTodos, lectura, esperado) => {
      const deps = armar();
      deps.sembrarTarea('t1');

      comprobar(await listar(deps, TICKET_ID, actorId, verTodos, lectura), esperado);
    });

    it.each([TICKET_ID, SOPORTE_TICKET_ID])(
      'el técnico de una tarea activa lista sin permiso de lectura ni VER_TODOS (CA10) — %s',
      async (ticketId) => {
        const deps = armar();
        deps.sembrarTarea('t1', { ticketId, tecnicoId: TECNICO });

        comprobar(await listar(deps, ticketId, TECNICO, false, []), 'ok');
      },
    );

    it('el técnico de una tarea BORRADA ya no lista sin permiso de lectura', async () => {
      const deps = armar();
      deps.sembrarTarea('t1', { tecnicoId: TECNICO }).eliminar(AHORA);

      expect(errorDe(await listar(deps, TICKET_ID, TECNICO, false, []))).toBeInstanceOf(
        TicketNoEncontradoError,
      );
    });
  });
});

describe('Visibilidad por tarea (CA10)', () => {
  const tecnicoSinVerTodos = actor(TECNICO, { tienePermisoVerTodos: false });
  const listarComo = (deps: ReturnType<typeof armar>) =>
    deps.listar.execute({
      ticketId: TICKET_ID,
      actorId: TECNICO,
      tienePermisoVerTodos: false,
      modulosConLectura: [],
    });

  it('el técnico de una tarea activa lista las tareas sin VER_TODOS ni ser el responsable', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await listarComo(deps);

    expect(result.getValue().tareas.map((t) => t.id)).toEqual(['t1']);
  });

  it('una tarea en otro ticket no le da visibilidad sobre este', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { ticketId: OTRO_TICKET_ID, tecnicoId: TECNICO });

    expect(errorDe(await listarComo(deps))).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('deja de verlo al quitarlo de la tarea', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    await deps.asignar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      tecnicoId: null,
      clienteId: CLIENTE_ID,
      actor: ACTORES.responsable,
    });

    expect(errorDe(await listarComo(deps))).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('deja de verlo cuando la tarea se borra', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    await deps.eliminar.execute({ ticketId: TICKET_ID, tareaId: 't1', actor: ACTORES.responsable });

    expect(errorDe(await listarComo(deps))).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ver el ticket no amplía lo que modifica: crear y borrar le dan 403, completar la suya sí', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const crear = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: tecnicoSinVerTodos,
      descripcion: 'Intrusa',
    });
    const borrar = await deps.eliminar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: tecnicoSinVerTodos,
    });
    const completar = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: tecnicoSinVerTodos,
    });

    expect(errorDe(crear)).toBeInstanceOf(TareaAccionNoPermitidaError);
    expect(errorDe(borrar)).toBeInstanceOf(TareaAccionNoPermitidaError);
    expect(completar.isOk()).toBe(true);
  });
});
