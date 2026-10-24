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
import { EstadoEntity } from '../../domain/entities/estado.entity';
import {
  TareaAccionNoPermitidaError,
  TareaNoCompletadaError,
  TareaNoEncontradaError,
  TareaTicketNoEditableError,
  TareaYaCompletadaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import {
  TicketNoEncontradoError,
  TicketSoloComentariosError,
} from '../../domain/errors/tickets.errors';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import { alcancePorTipo } from '../../test-helpers/alcance-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from '../services/elegibilidad-asignado';
import { EventoTarea } from '../../domain/policies/estado-por-tareas.policy';
import { ActorTarea } from '../services/tareas-ticket.reglas';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
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

/** Acciones por id de tipo, como las carga la capa de interface (odd/permisos-por-tipo-ticket). */
type Permisos = Readonly<Record<string, readonly AccionTipoTicket[]>>;

const VER: readonly AccionTipoTicket[] = ['LECTURA', 'VER_TODOS'];
/** Ve los dos tipos del fixture y modifica solo Edilicia; los casos por tipo lo acotan. */
const PERMISOS_BASE: Permisos = {
  [TIPO_ID]: [...VER, 'MODIFICACION'],
  [TIPO_SOPORTE_ID]: VER,
};

function actor(
  id: string,
  permisos: Permisos = PERMISOS_BASE,
  esAdministrador = false,
): ActorTarea {
  return { id, esAdministrador, permisosPorTipo: alcancePorTipo(id, permisos).permisosPorTipo };
}

/** DTO de listado de un actor con `permisos` por tipo. */
function listado(ticketId: string, actorId: string, permisos: Permisos) {
  return { ticketId, ...alcancePorTipo(actorId, permisos) };
}

const ACTORES = {
  responsable: actor(RESPONSABLE),
  responsableSinModificacion: actor(RESPONSABLE, {
    [TIPO_ID]: VER,
    [TIPO_SOPORTE_ID]: [...VER, 'MODIFICACION'],
  }),
  administrador: { id: ADMIN, esAdministrador: true, permisosPorTipo: null },
  administradorSinModificacion: actor(ADMIN, { [TIPO_ID]: VER, [TIPO_SOPORTE_ID]: VER }, true),
  tecnicoDeLaTarea: actor(TECNICO),
  otroTecnico: actor(OTRO_TECNICO),
  ajenoSinVerTodos: actor(OTRO_TECNICO, {
    [TIPO_ID]: ['LECTURA', 'MODIFICACION'],
    [TIPO_SOPORTE_ID]: ['LECTURA'],
  }),
  solicitante: actor(SOLICITANTE, { [TIPO_ID]: ['LECTURA'], [TIPO_SOPORTE_ID]: ['LECTURA'] }),
} satisfies Record<string, ActorTarea>;
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
  // odd/ticket-cerrado-solo-lectura: el código del estado de cada ticket (por defecto EN_PROCESO) y
  // qué tickets tienen una reparación bloqueada por una compra activa.
  const estadoDe = new Map<string, string>();
  const bloqueados = new Set<string>();
  const estadoRepo = {
    findById: async (id: string) =>
      EstadoEntity.create(
        {
          codigo: estadoDe.get(id) ?? 'EN_PROCESO',
          nombre: id,
          color: null,
          orden: 1,
          activo: true,
        },
        id,
      ),
  };
  const bloqueoRepo = {
    estaBloqueadoPorCompra: vi.fn(async (ticketId: string) => bloqueados.has(ticketId)),
  };
  const verificadorEditable = new VerificadorTicketEditable(estadoRepo, bloqueoRepo);
  /** Deja al ticket en ese estado: el id del estado pasa a ser su propio código. */
  function ponerEstado(ticketId: string, codigo: string): void {
    const ticket = tickets.get(ticketId);
    if (!ticket) throw new Error(`no existe ${ticketId}`);
    ticket.updateEstado(`estado-${codigo}`);
    estadoDe.set(`estado-${codigo}`, codigo);
  }

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
  // Elegibilidad real (odd/permisos-por-tipo-ticket, D5 g): Tina y Otto son técnicos con LECTURA
  // sobre el tipo de Edilicia; Sofi atiende solo Soporte; Celia tiene la celda del módulo EDILICIA
  // sin fila del tipo; el ADMINISTRADOR tiene la fila pero no es agente.
  const master = new MasterAgentesEnMemoria();
  master.agregar({ id: TECNICO, rol: 'TECNICO', celdas: [] });
  master.agregar({ id: OTRO_TECNICO, rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'usuario-solo-soporte', rol: 'TECNICO', celdas: [] });
  master.agregar({ id: 'usuario-con-celda', rol: 'TECNICO', celdas: ['EDILICIA:LECTURA'] });
  master.agregar({ id: ADMIN, rol: 'ADMINISTRADOR', celdas: [] });
  const elegibilidad = new ElegibilidadAsignado(
    master,
    new PermisosTipoTicketEnMemoria(
      [],
      [
        { usuarioId: TECNICO, tipoId: TIPO_ID, accion: 'LECTURA' },
        { usuarioId: OTRO_TECNICO, tipoId: TIPO_ID, accion: 'LECTURA' },
        { usuarioId: 'usuario-solo-soporte', tipoId: TIPO_SOPORTE_ID, accion: 'LECTURA' },
        { usuarioId: ADMIN, tipoId: TIPO_ID, accion: 'LECTURA' },
      ],
    ),
  );
  const esAgenteDeTipo = vi.spyOn(elegibilidad, 'esAgenteDeTipo');
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

  /**
   * Carrera con un borrado (odd/permisos-por-tipo-ticket, L45): otra transacción borra el ticket y
   * hace commit mientras el caso de uso espera el lock. El ticket que ya cargó sigue activo; solo
   * una relectura después del lock ve el borrado.
   */
  function borrarAlBloquear(ticketId: string): void {
    ticketRepo.bloquear.mockImplementationOnce(async (id: string) => {
      secuencia.push(`bloquear:${id}`);
      const borrado = crearTicket(ticketId);
      borrado.softDelete(AHORA);
      tickets.set(ticketId, borrado);
    });
  }

  return {
    tickets,
    tareas,
    operaciones,
    sembrarTarea,
    borrarAlBloquear,
    esAgenteDeTipo,
    tareaRepo,
    operacionRepo,
    ticketRepo,
    avanzarEstado,
    secuencia,
    bloqueados,
    bloqueoRepo,
    ponerEstado,
    crear: new CrearTareaTicketUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      verificadorEditable,
    ),
    asignar: new AsignarTecnicoTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      elegibilidad,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      verificadorEditable,
      ahora,
    ),
    completar: new CompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      avanzarEstado,
      verificadorEditable,
      ahora,
    ),
    descompletar: new DescompletarTareaUseCase(
      ticketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      avanzarEstado,
      verificadorEditable,
      ahora,
    ),
    eliminar: new EliminarTareaUseCase(
      ticketRepo,
      tipoTicketRepo,
      tareaRepo,
      operacionRepo,
      tipoOperacionRepo,
      txRunner,
      verificadorEditable,
      ahora,
    ),
    listar: new ListarTareasTicketUseCase(ticketRepo, tareaRepo),
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

  it('un ticket borrado entre la carga y el lock da 404 y no escribe la tarea ni el historial (L45)', async () => {
    const deps = armar();
    deps.borrarAlBloquear(TICKET_ID);

    const result = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: ACTORES.responsable,
      descripcion: 'Cambiar el flotante',
    });

    expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
    expect(deps.secuencia).toEqual([`bloquear:${TICKET_ID}`]);
    expect(deps.tareas.size).toBe(0);
    expect(deps.operaciones).toHaveLength(0);
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
    expect(deps.esAgenteDeTipo).toHaveBeenCalledWith(TECNICO, CLIENTE_ID, TIPO_ID);
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

  it('quitar el técnico no consulta la elegibilidad y deja registro del retiro', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await asignar(deps, ACTORES.administrador, null);

    expect(result.getValue().tecnicoId).toBeNull();
    expect(deps.esAgenteDeTipo).not.toHaveBeenCalled();
    expect(deps.operaciones[0].metadata).toEqual({
      tarea_id: 't1',
      tecnico_anterior_id: TECNICO,
      tecnico_nuevo_id: null,
    });
  });

  it('rechaza un técnico no elegible (ADMINISTRADOR, sin LECTURA sobre el tipo o de otro tipo) con TecnicoTareaNoElegibleError', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1');

    for (const tecnicoId of [
      ADMIN,
      RESPONSABLE,
      'usuario-con-celda',
      'usuario-solo-soporte',
      'usuario-inexistente',
    ]) {
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

  it('un ticket borrado entre la carga y el lock da 404 y no escribe nada (L45)', async () => {
    const deps = armar();
    deps.sembrarTarea('t1', { tecnicoId: TECNICO, completada: true });
    deps.borrarAlBloquear(TICKET_ID);

    const result = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: ACTORES.responsable,
    });

    expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
    expect(deps.secuencia).toEqual([`bloquear:${TICKET_ID}`]);
    expect(deps.tareaRepo.descompletarSiCompletada).not.toHaveBeenCalled();
    expect(deps.operaciones).toHaveLength(0);
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

    const result = await deps.listar.execute(listado(TICKET_ID, TECNICO, { [TIPO_ID]: VER }));

    const { tareas, avance } = result.getValue();
    expect(tareas.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(avance).toEqual({ total: 3, completadas: 1, porcentaje: 33.33 });
  });

  it('un ticket sin tareas tiene avance 0', async () => {
    const deps = armar();
    const result = await deps.listar.execute(listado(TICKET_ID, TECNICO, { [TIPO_ID]: VER }));
    expect(result.getValue()).toEqual({
      tareas: [],
      avance: { total: 0, completadas: 0, porcentaje: 0 },
    });
  });

  it('el solicitante con LECTURA sobre el tipo las ve sin VER_TODOS; un ajeno sin VER_TODOS recibe 404', async () => {
    const deps = armar();
    const soloLectura = { [TIPO_SOPORTE_ID]: ['LECTURA'] } as const;
    const propio = await deps.listar.execute(listado(SOPORTE_TICKET_ID, SOLICITANTE, soloLectura));
    const ajeno = await deps.listar.execute(listado(SOPORTE_TICKET_ID, OTRO_TECNICO, soloLectura));
    expect(propio.isOk()).toBe(true);
    expect(errorDe(ajeno)).toBeInstanceOf(TicketNoEncontradoError);
  });

  describe('listar exige ver el ticket: LECTURA sobre su tipo y fila (odd/permisos-por-tipo-ticket, S3)', () => {
    type Esperado = 'ok' | 404;
    const comprobar = (
      result: Awaited<ReturnType<ReturnType<typeof armar>['listar']['execute']>>,
      esperado: Esperado,
    ): void => {
      if (esperado === 'ok') {
        expect(result.getValue().tareas.map((t) => t.id)).toEqual(['t1']);
      } else {
        expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
      }
    };

    it.each<[string, string, Permisos, Esperado]>([
      ['LECTURA y VER_TODOS sobre el tipo', OTRO_TECNICO, { [TIPO_SOPORTE_ID]: VER }, 'ok'],
      [
        'VER_TODOS sin LECTURA sobre el tipo (404)',
        OTRO_TECNICO,
        { [TIPO_SOPORTE_ID]: ['VER_TODOS'] },
        404,
      ],
      [
        'LECTURA sin ver el ticket por fila (404)',
        OTRO_TECNICO,
        { [TIPO_SOPORTE_ID]: ['LECTURA'] },
        404,
      ],
      ['solicitante con LECTURA', SOLICITANTE, { [TIPO_SOPORTE_ID]: ['LECTURA'] }, 'ok'],
      ['solicitante sin LECTURA sobre el tipo (404)', SOLICITANTE, { [TIPO_ID]: VER }, 404],
      [
        'LECTURA y VER_TODOS sobre OTRO tipo no alcanzan (404)',
        OTRO_TECNICO,
        { [TIPO_ID]: VER },
        404,
      ],
      ['sin permisos (404)', OTRO_TECNICO, {}, 404],
    ])('ticket de Soporte — %s', async (_caso, actorId, permisos, esperado) => {
      const deps = armar();
      deps.sembrarTarea('t1', { ticketId: SOPORTE_TICKET_ID });

      comprobar(await deps.listar.execute(listado(SOPORTE_TICKET_ID, actorId, permisos)), esperado);
    });

    it.each([TICKET_ID, SOPORTE_TICKET_ID])(
      'el técnico de una tarea activa lista con LECTURA y sin VER_TODOS (CA10) — %s',
      async (ticketId) => {
        const deps = armar();
        deps.sembrarTarea('t1', { ticketId, tecnicoId: TECNICO });
        const soloLectura = { [TIPO_ID]: ['LECTURA'], [TIPO_SOPORTE_ID]: ['LECTURA'] } as const;

        comprobar(await deps.listar.execute(listado(ticketId, TECNICO, soloLectura)), 'ok');
      },
    );

    it('el técnico de una tarea activa SIN LECTURA sobre el tipo no lista: 404 (S3)', async () => {
      const deps = armar();
      deps.sembrarTarea('t1', { tecnicoId: TECNICO });

      comprobar(
        await deps.listar.execute(listado(TICKET_ID, TECNICO, { [TIPO_SOPORTE_ID]: VER })),
        404,
      );
    });

    it('el técnico de una tarea BORRADA ya no lista sin VER_TODOS', async () => {
      const deps = armar();
      deps.sembrarTarea('t1', { tecnicoId: TECNICO }).eliminar(AHORA);

      comprobar(
        await deps.listar.execute(listado(TICKET_ID, TECNICO, { [TIPO_ID]: ['LECTURA'] })),
        404,
      );
    });
  });
});

describe('Visibilidad por tarea (CA10)', () => {
  const tecnicoSinVerTodos = actor(TECNICO, { [TIPO_ID]: ['LECTURA', 'MODIFICACION'] });
  const listarComo = (deps: ReturnType<typeof armar>) =>
    deps.listar.execute(listado(TICKET_ID, TECNICO, { [TIPO_ID]: ['LECTURA'] }));

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

describe('tareas en un ticket resuelto, cerrado o cancelado (odd/cerrado-solo-comentarios, S1-S3) o bloqueado por compra (odd/ticket-cerrado-solo-lectura, S2)', () => {
  type Accion = 'crear' | 'asignar' | 'completar' | 'descompletar' | 'eliminar';
  const ACCIONES: Accion[] = ['crear', 'asignar', 'completar', 'descompletar', 'eliminar'];

  /**
   * Ejecuta la acción sobre una tarea sembrada. Por defecto, como el responsable del ticket, que
   * pasa la autorización de las cinco acciones sin ser administrador.
   */
  async function ejecutar(
    deps: ReturnType<typeof armar>,
    accion: Accion,
    actor: ActorTarea = ACTORES.responsable,
  ): Promise<Result<unknown, DomainError>> {
    const base = { ticketId: TICKET_ID, actor };
    switch (accion) {
      case 'crear':
        return deps.crear.execute({ ...base, descripcion: 'Nueva' });
      case 'asignar':
        return deps.asignar.execute({
          ...base,
          tareaId: 'pendiente',
          // Otro técnico: reasignar al mismo no escribe nada y no probaría la escritura.
          tecnicoId: OTRO_TECNICO,
          clienteId: CLIENTE_ID,
        });
      case 'completar':
        return deps.completar.execute({ ...base, tareaId: 'pendiente' });
      case 'descompletar':
        return deps.descompletar.execute({ ...base, tareaId: 'hecha' });
      case 'eliminar':
        return deps.eliminar.execute({ ...base, tareaId: 'pendiente' });
    }
  }

  function armarConTareas(): ReturnType<typeof armar> {
    const deps = armar();
    deps.sembrarTarea('pendiente', { tecnicoId: TECNICO, orden: 0 });
    deps.sembrarTarea('hecha', { tecnicoId: TECNICO, completada: true, orden: 1 });
    return deps;
  }

  /** Las tareas como se ven desde afuera: lo que ninguna acción rechazada tiene que cambiar. */
  function fotoDeTareas(deps: ReturnType<typeof armar>) {
    return [...deps.tareas.values()].map((t) => ({
      id: t.id,
      completada: t.completada,
      tecnicoId: t.tecnicoId,
      eliminada: t.isDeleted(),
    }));
  }

  const ESTADOS: [string, string][] = [
    ['RESUELTO', 'El ticket está resuelto: solo admite comentarios.'],
    ['CERRADO', 'El ticket está cerrado: solo admite comentarios.'],
    ['CANCELADO', 'El ticket está cancelado: solo admite comentarios.'],
  ];

  describe.each(ESTADOS)('ticket %s', (codigo, inicioMensaje) => {
    it.each(ACCIONES)(
      'el responsable (no administrador) no puede %s: TicketSoloComentariosError y no escribe nada',
      async (accion) => {
        const deps = armarConTareas();
        deps.ponerEstado(TICKET_ID, codigo);
        const antes = fotoDeTareas(deps);

        const error = errorDe(await ejecutar(deps, accion));

        expect(error).toBeInstanceOf(TicketSoloComentariosError);
        expect((error as TicketSoloComentariosError).estadoCodigo).toBe(codigo);
        expect(error.message).toBe(
          `${inicioMensaje} Solo un administrador puede modificarlo o reabrirlo.`,
        );
        expect(deps.operaciones).toHaveLength(0);
        expect(deps.avanzarEstado.aplicar).not.toHaveBeenCalled();
        expect(fotoDeTareas(deps)).toEqual(antes);
      },
    );

    it('el técnico de la tarea tampoco puede completarla', async () => {
      const deps = armarConTareas();
      deps.ponerEstado(TICKET_ID, codigo);

      const error = errorDe(await ejecutar(deps, 'completar', ACTORES.tecnicoDeLaTarea));

      expect(error).toBeInstanceOf(TicketSoloComentariosError);
      expect(deps.operaciones).toHaveLength(0);
    });

    it.each(ACCIONES)('un ADMINISTRADOR o ROOT sí puede %s (S3)', async (accion) => {
      const deps = armarConTareas();
      deps.ponerEstado(TICKET_ID, codigo);

      const result = await ejecutar(deps, accion, ACTORES.administrador);

      expect(result.isOk()).toBe(true);
      expect(deps.operaciones).toHaveLength(1);
    });
  });

  it('un administrador descompleta en RESUELTO y el ticket vuelve a EN_PROCESO (lo reabre)', async () => {
    const deps = armarConTareas();
    deps.ponerEstado(TICKET_ID, 'RESUELTO');

    const result = await ejecutar(deps, 'descompletar', ACTORES.administrador);

    expect(result.isOk()).toBe(true);
    expect(deps.avanzarEstado.aplicar).toHaveBeenCalledWith('DESCOMPLETAR', TICKET_ID, ADMIN);
  });

  it.each(['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'ESPERANDO_CLIENTE'])(
    'en %s el responsable sigue pudiendo todo',
    async (codigo) => {
      const deps = armarConTareas();
      deps.ponerEstado(TICKET_ID, codigo);

      for (const accion of ACCIONES) {
        expect((await ejecutar(deps, accion)).isOk(), accion).toBe(true);
      }
    },
  );

  describe('bloqueado por una compra activa', () => {
    it.each(ACCIONES)(
      '%s da TareaTicketNoEditableError a cualquiera, administrador incluido, y no escribe nada',
      async (accion) => {
        const deps = armarConTareas();
        deps.bloqueados.add(TICKET_ID);
        const antes = fotoDeTareas(deps);

        for (const actor of [ACTORES.responsable, ACTORES.administrador]) {
          const error = errorDe(await ejecutar(deps, accion, actor));
          expect(error).toBeInstanceOf(TareaTicketNoEditableError);
          expect(error.message).toBe(
            'La reparación está bloqueada por una compra en curso y no acepta cambios en sus tareas.',
          );
        }
        expect(deps.operaciones).toHaveLength(0);
        expect(fotoDeTareas(deps)).toEqual(antes);
      },
    );
  });

  it('el estado manda antes que el bloqueo por compra, y sin ese estado se consulta el bloqueo', async () => {
    const deps = armarConTareas();
    deps.ponerEstado(TICKET_ID, 'CERRADO');
    deps.bloqueados.add(TICKET_ID);

    expect(errorDe(await ejecutar(deps, 'crear'))).toBeInstanceOf(TicketSoloComentariosError);
    expect(deps.bloqueoRepo.estaBloqueadoPorCompra).not.toHaveBeenCalled();

    deps.ponerEstado(TICKET_ID, 'EN_PROCESO');
    expect(errorDe(await ejecutar(deps, 'crear'))).toBeInstanceOf(TareaTicketNoEditableError);
    expect(deps.bloqueoRepo.estaBloqueadoPorCompra).toHaveBeenCalledWith(TICKET_ID);
  });

  it('la autorización del actor sigue mandando antes: un ajeno recibe 404/403, no 422', async () => {
    const deps = armarConTareas();
    deps.ponerEstado(TICKET_ID, 'CERRADO');

    expect(errorDe(await ejecutar(deps, 'crear', ACTORES.ajenoSinVerTodos))).toBeInstanceOf(
      TicketNoEncontradoError,
    );
    expect(errorDe(await ejecutar(deps, 'crear', ACTORES.solicitante))).toBeInstanceOf(
      TareaAccionNoPermitidaError,
    );
    expect(errorDe(await ejecutar(deps, 'completar', ACTORES.otroTecnico))).toBeInstanceOf(
      TareaAccionNoPermitidaError,
    );
  });
});

describe('permisos por tipo del ticket (odd/permisos-por-tipo-ticket, S2, S3)', () => {
  /** Ve y modifica Soporte; de Edilicia tiene VER_TODOS pero no LECTURA, así que no la ve. */
  const sinLecturaEdilicia = actor(OTRO_TECNICO, {
    [TIPO_ID]: ['VER_TODOS', 'MODIFICACION'],
    [TIPO_SOPORTE_ID]: [...VER, 'MODIFICACION'],
  });
  /** El técnico de la tarea, sin LECTURA sobre el tipo Edilicia. */
  const tecnicoSinLectura = actor(TECNICO, { [TIPO_SOPORTE_ID]: VER });

  it('listar las tareas de un ticket de un tipo sin LECTURA es 404, aunque tenga VER_TODOS sobre él', async () => {
    const deps = armar();
    deps.sembrarTarea('t1');

    const result = await deps.listar.execute(
      listado(TICKET_ID, OTRO_TECNICO, { [TIPO_ID]: ['VER_TODOS'], [TIPO_SOPORTE_ID]: VER }),
    );

    expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('crear una tarea en un ticket de un tipo sin LECTURA es 404 y no escribe nada', async () => {
    const deps = armar();

    const result = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: sinLecturaEdilicia,
      descripcion: 'Cambiar el flotante',
    });

    expect(errorDe(result)).toBeInstanceOf(TicketNoEncontradoError);
    expect(deps.tareas.size).toBe(0);
    expect(deps.tareaRepo.crear).not.toHaveBeenCalled();
    expect(deps.operaciones).toHaveLength(0);
  });

  it('asignar y borrar en un ticket de un tipo sin LECTURA son 404 y no escriben nada', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const asignado = await deps.asignar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: sinLecturaEdilicia,
      clienteId: CLIENTE_ID,
      tecnicoId: OTRO_TECNICO,
    });
    const borrado = await deps.eliminar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: sinLecturaEdilicia,
    });

    expect(errorDe(asignado)).toBeInstanceOf(TicketNoEncontradoError);
    expect(errorDe(borrado)).toBeInstanceOf(TicketNoEncontradoError);
    expect(tarea.tecnicoId).toBe(TECNICO);
    expect(tarea.isDeleted()).toBe(false);
    expect(deps.tareaRepo.asignarTecnicoSiActiva).not.toHaveBeenCalled();
    expect(deps.tareaRepo.darDeBajaSiActiva).not.toHaveBeenCalled();
    expect(deps.esAgenteDeTipo).not.toHaveBeenCalled();
    expect(deps.operaciones).toHaveLength(0);
  });

  it('el técnico de la tarea sin LECTURA sobre el tipo no la completa ni la descompleta: 404 sin escribir (S3)', async () => {
    const deps = armar();
    const pendiente = deps.sembrarTarea('t1', { tecnicoId: TECNICO });
    const completada = deps.sembrarTarea('t2', { tecnicoId: TECNICO, completada: true });

    const completar = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: tecnicoSinLectura,
    });
    const descompletar = await deps.descompletar.execute({
      ticketId: TICKET_ID,
      tareaId: 't2',
      actor: tecnicoSinLectura,
    });

    expect(errorDe(completar)).toBeInstanceOf(TicketNoEncontradoError);
    expect(errorDe(descompletar)).toBeInstanceOf(TicketNoEncontradoError);
    expect(pendiente.completada).toBe(false);
    expect(completada.completada).toBe(true);
    expect(deps.tareaRepo.completarSiPendiente).not.toHaveBeenCalled();
    expect(deps.tareaRepo.descompletarSiCompletada).not.toHaveBeenCalled();
    expect(deps.avanzarEstado.aplicar).not.toHaveBeenCalled();
    expect(deps.operaciones).toHaveLength(0);
  });

  it('el mismo responsable gestiona las tareas del tipo con MODIFICACION y recibe 403 en el que solo ve (S2)', async () => {
    const deps = armar();
    // Ve los dos tipos; modifica Soporte, no Edilicia.
    const responsable = ACTORES.responsableSinModificacion;

    const enSoporte = await deps.crear.execute({
      ticketId: SOPORTE_TICKET_ID,
      actor: responsable,
      descripcion: 'Reinstalar el driver',
    });
    const enEdilicia = await deps.crear.execute({
      ticketId: TICKET_ID,
      actor: responsable,
      descripcion: 'Cambiar el flotante',
    });

    expect(enSoporte.getValue().ticketId).toBe(SOPORTE_TICKET_ID);
    expect(errorDe(enEdilicia)).toBeInstanceOf(TareaAccionNoPermitidaError);
    expect([...deps.tareas.values()].map((t) => t.ticketId)).toEqual([SOPORTE_TICKET_ID]);
  });

  it('caso hermano: el técnico de la tarea con LECTURA sobre el tipo la sigue completando', async () => {
    const deps = armar();
    const tarea = deps.sembrarTarea('t1', { tecnicoId: TECNICO });

    const result = await deps.completar.execute({
      ticketId: TICKET_ID,
      tareaId: 't1',
      actor: actor(TECNICO, { [TIPO_ID]: ['LECTURA'] }),
    });

    expect(result.isOk()).toBe(true);
    expect(tarea.completada).toBe(true);
  });
});
