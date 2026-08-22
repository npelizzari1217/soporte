/**
 * tickets.controller.spec.ts — regresión del bypass ROOT en los chequeos de
 * permiso INLINE del controller (los que NO pasan por `PermissionsGuard` porque
 * dependen del `body`/`query`, no de metadata estática por ruta).
 *
 * Bug (sdd/root-access-fix): un ROOT (`is_global_admin=true`) tiene `permisos=[]`
 * cuando trabaja scopeado a un tenant sin membresía. Los chequeos inline
 * (`user.permisos.includes(...)`) le negaban por 403 el comentario interno
 * (`ticket:observar`) y le degradaban el scope de `ticket:ver_todos` en
 * list/detalle/timeline. `PermissionsGuard` ya bypassea al ROOT; estos chequeos
 * inline deben honrar el MISMO criterio.
 */
import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TicketsController, toHttpException } from './tickets.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  TicketBloqueadoParaEdicionError,
} from '../../domain/errors/tickets.errors';
import * as TicketsErrors from '../../domain/errors/tickets.errors';

type Ctor = ConstructorParameters<typeof TicketsController>;

/** Operación de dominio mínima para alimentar `toOperacionResponseDto`. */
function fakeOperacion(esInterno: boolean): OperacionTicketEntity {
  return {
    id: 'op-1',
    ticketId: 'ticket-1',
    tipoOperacionId: 'tipo-op-comentario',
    descripcion: 'Nota interna del ROOT',
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: 'root-1',
    esInterno,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as unknown as OperacionTicketEntity;
}

const ROOT: JwtPayload = payloadDeTest({
  sub: 'root-1',
  cliente_id: 'cliente-1',
  rol: null,
  permisos: [], // ROOT scopeado a un tenant sin membresía → sin permisos de rol
  is_global_admin: true,
  cliente_nombre: 'Cliente 1',
  modulos: [], // ROOT no necesita módulos: bypassa por is_global_admin
});

const USUARIO_SIN_OBSERVAR: JwtPayload = payloadDeTest({
  sub: 'usr-1',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: ['ticket:comentar'], // tiene comentar, NO observar
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE'],
});

const ADMINISTRADOR: JwtPayload = payloadDeTest({
  sub: 'admin-1',
  cliente_id: 'cliente-1',
  rol: 'ADMINISTRADOR',
  permisos: ['ticket:ver_todos'],
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS'],
});

const USUARIO_SOPORTE: JwtPayload = payloadDeTest({
  sub: 'usr-2',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: [],
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE'],
});

/** Doble de un use case: al controller sólo le interesa `execute`. */
type MockUseCase = { execute: ReturnType<typeof vi.fn> };

/** Las once dependencias-use-case del controller, con el nombre corto que usan los tests. */
type DependenciasControlador = {
  crearTicket: MockUseCase;
  obtenerTicket: MockUseCase;
  listarTickets: MockUseCase;
  editarTicket: MockUseCase;
  transicionar: MockUseCase;
  asignarTicket: MockUseCase;
  crearComentario: MockUseCase;
  listarTimeline: MockUseCase;
  listarTecnicos: MockUseCase;
  asignarEnProceso: MockUseCase;
  exportarTickets: MockUseCase;
  obtenerCsatTicket: MockUseCase;
};

type ControladorDeTest = DependenciasControlador & {
  controller: TicketsController;
  usuarioMasterChecker: { resolverNombres: ReturnType<typeof vi.fn> };
};

/**
 * Construye el controller con las DOCE dependencias del constructor siempre
 * completas, dejando pisar sólo las que el test necesita observar.
 *
 * El porqué de que haya un único constructor y no uno por `describe`: antes
 * cada bloque armaba su propia lista de argumentos y cuatro de ellas habían
 * quedado cortas (9 u 11 de 12). Nadie se enteró porque `tsconfig.json` excluye
 * los `*.spec.ts` del typecheck, y los tests pasaban sólo de casualidad — la
 * dependencia faltante llegaba `undefined` y ningún caso la tocaba. Es
 * confianza falsa: el primer test que ejercitara esa ruta reventaba en runtime
 * en vez de fallar al compilar. Con un solo punto de construcción, agregar una
 * dependencia al controller se arregla en un único lugar y no puede volver a
 * desincronizarse por partes.
 */
function buildController(overrides: Partial<DependenciasControlador> = {}): ControladorDeTest {
  const stub = (): MockUseCase => ({ execute: vi.fn() });
  const deps: DependenciasControlador = {
    crearTicket: overrides.crearTicket ?? stub(),
    obtenerTicket: overrides.obtenerTicket ?? stub(),
    // Default con página vacía válida: `findAll` es el único método que los
    // tests ejercitan SIN pisar su use case, y necesita un `Result` real.
    listarTickets: overrides.listarTickets ?? {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ items: [], total: 0, pagina: 1, porPagina: 20 })),
    },
    editarTicket: overrides.editarTicket ?? stub(),
    transicionar: overrides.transicionar ?? stub(),
    asignarTicket: overrides.asignarTicket ?? stub(),
    crearComentario: overrides.crearComentario ?? stub(),
    listarTimeline: overrides.listarTimeline ?? stub(),
    listarTecnicos: overrides.listarTecnicos ?? stub(),
    asignarEnProceso: overrides.asignarEnProceso ?? stub(),
    exportarTickets: overrides.exportarTickets ?? stub(),
    // WU9.2: default sin dato CSAT — la mayoría de los tests no ejercitan findOne.
    obtenerCsatTicket: overrides.obtenerCsatTicket ?? { execute: vi.fn().mockResolvedValue(null) },
  };
  // `findAll`/`exportar` resuelven nombres batch de los items — con lista vacía
  // devuelve un Map vacío sin N+1.
  const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

  const controller = new TicketsController(
    deps.crearTicket as unknown as Ctor[0], // crearTicketUseCase
    deps.obtenerTicket as unknown as Ctor[1], // obtenerTicketUseCase
    deps.listarTickets as unknown as Ctor[2], // listarTicketsUseCase
    deps.editarTicket as unknown as Ctor[3], // editarTicketUseCase
    deps.transicionar as unknown as Ctor[4], // transicionarEstadoUseCase
    deps.asignarTicket as unknown as Ctor[5], // asignarTicketUseCase
    deps.crearComentario as unknown as Ctor[6], // crearComentarioUseCase
    deps.listarTimeline as unknown as Ctor[7], // listarTimelineUseCase
    usuarioMasterChecker as unknown as Ctor[8], // usuarioMasterChecker
    deps.listarTecnicos as unknown as Ctor[9], // listarTecnicosAsignablesUseCase
    deps.asignarEnProceso as unknown as Ctor[10], // asignarYPonerEnProcesoUseCase
    deps.exportarTickets as unknown as Ctor[11], // exportarTicketsUseCase
    deps.obtenerCsatTicket as unknown as Ctor[12], // obtenerCsatTicketUseCase
  );
  return { controller, ...deps, usuarioMasterChecker };
}

describe('TicketsController — bypass ROOT en chequeos inline (sdd/root-access-fix)', () => {
  it('ROOT con permisos=[] PUEDE crear un comentario interno (no 403) y lo delega con esInterno=true', async () => {
    const crearComentario = { execute: vi.fn().mockResolvedValue(Result.ok(fakeOperacion(true))) };
    const { controller } = buildController({ crearComentario });

    const res = await controller.comentar(ROOT, 'ticket-1', {
      texto: 'Nota interna del ROOT',
      esInterno: true,
    });

    expect(crearComentario.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', autorId: 'root-1', esInterno: true }),
    );
    expect(res.esInterno).toBe(true);
  });

  it('preserva el guard: NO-ROOT sin ticket:observar recibe 403 al comentar interno', async () => {
    const crearComentario = { execute: vi.fn() };
    const { controller } = buildController({ crearComentario });

    await expect(
      controller.comentar(USUARIO_SIN_OBSERVAR, 'ticket-1', {
        texto: 'Intento de nota interna',
        esInterno: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crearComentario.execute).not.toHaveBeenCalled();
  });

  it('ROOT ve TODO el scope: timeline se invoca con ver_todos y observar en true', async () => {
    const listarTimeline = { execute: vi.fn().mockResolvedValue(Result.ok([])) };
    const { controller } = buildController({ listarTimeline });

    await controller.timeline(ROOT, 'ticket-1');

    expect(listarTimeline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tienePermisoVerTodos: true, tienePermisoObservar: true }),
    );
  });
});

describe('TicketsController.findAll — gate de módulo (5.2 CAPA 2)', () => {
  it('ADMINISTRADOR → pasa modulosPermitidos=null (sin restricción de módulo)', async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(ADMINISTRADOR, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: null }),
    );
  });

  it("usuario normal con modulos=['SOPORTE'] → pasa modulosPermitidos=['SOPORTE']", async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(USUARIO_SOPORTE, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: ['SOPORTE'] }),
    );
  });

  it('ROOT → pasa modulosPermitidos=null (bypass por is_global_admin)', async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(ROOT, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: null }),
    );
  });
});

describe('TicketsController — asignación unificada (asignables + asignar-en-proceso)', () => {
  it('GET :id/asignables → delega con el clienteId del JWT y devuelve la lista de técnicos', async () => {
    const tecnicos = [{ id: 'tec-1', nombre: 'Ana', apellido: 'García' }];
    const listarTecnicos = { execute: vi.fn().mockResolvedValue(Result.ok(tecnicos)) };
    const { controller } = buildController({ listarTecnicos });

    const res = await controller.asignables(USUARIO_SOPORTE, 'ticket-1');

    expect(listarTecnicos.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      clienteId: 'cliente-1',
    });
    expect(res).toEqual(tecnicos);
  });

  it('GET :id/asignables → ticket inexistente propaga 404', async () => {
    const listarTecnicos = {
      execute: vi.fn().mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-x'))),
    };
    const { controller } = buildController({ listarTecnicos });

    await expect(controller.asignables(USUARIO_SOPORTE, 'ticket-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH :id/asignar-en-proceso → delega con asignadoId del body + autor/cliente del JWT', async () => {
    const ticket = TicketEntity.create(
      {
        numero: 'SOP-2026-0001',
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-en-proceso',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-1',
    );
    ticket.assignTo('agente-1');
    const asignarEnProceso = { execute: vi.fn().mockResolvedValue(Result.ok(ticket)) };
    const { controller } = buildController({ asignarEnProceso });

    await controller.asignarEnProceso(USUARIO_SOPORTE, 'ticket-1', { asignadoId: 'agente-1' });

    expect(asignarEnProceso.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      asignadoId: 'agente-1',
      autorId: 'usr-2',
      clienteId: 'cliente-1',
    });
  });
});

describe('TicketsController — bloqueo de edición y salto correctivo (actor flags)', () => {
  function makeTicketEntity(): TicketEntity {
    return TicketEntity.create(
      {
        numero: 'SOP-2026-0001',
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-en-proceso',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-1',
    );
  }

  it('update: ROOT → delega con actorEsRoot=true', async () => {
    const editarTicket = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ editarTicket });

    await controller.update(ROOT, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', actorEsRoot: true }),
    );
  });

  it('update: ADMINISTRADOR (no-ROOT) → delega con actorEsRoot=false', async () => {
    const editarTicket = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ editarTicket });

    await controller.update(ADMINISTRADOR, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsRoot: false }),
    );
  });

  it('update: TicketBloqueadoParaEdicionError → 403 ForbiddenException', async () => {
    const editarTicket = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new TicketBloqueadoParaEdicionError('EN_PROCESO'))),
    };
    const { controller } = buildController({ editarTicket });

    await expect(
      controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transicionarEstado: ROOT → actorEsCorrector=true', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ROOT, 'ticket-1', { nuevoEstadoCodigo: 'ASIGNADO' });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: ADMINISTRADOR → actorEsCorrector=true', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ADMINISTRADOR, 'ticket-1', {
      nuevoEstadoCodigo: 'ASIGNADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: rol no-ADMINISTRADOR/no-ROOT → actorEsCorrector=false (solo arcos normales)', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(USUARIO_SOPORTE, 'ticket-1', {
      nuevoEstadoCodigo: 'CANCELADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: false }),
    );
  });
});

describe('TicketsController.exportar — GET /tickets/export (sdd/exportar-listados-csv)', () => {
  /** Doble mínimo de la respuesta HTTP: sólo hace falta poder escribir headers. */
  function respuestaFalsa() {
    const headers = new Map<string, string>();
    return {
      res: { setHeader: (nombre: string, valor: string) => void headers.set(nombre, valor) },
      headers,
    };
  }

  it('entrega el CSV como descarga, con el nombre que resolvió el use case', async () => {
    const exportarTickets = { execute: vi.fn() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: 'Número;Título', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USUARIO_SOPORTE, {}, res);

    expect(salida).toBe('Número;Título');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe(
      'attachment; filename="tickets-2026-08-19.csv"',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('deriva el scope de filas del actor (TICKETS:VER_TODOS), NUNCA del query — sin el permiso, exporta acotado al actor', async () => {
    const exportarTickets = { execute: vi.fn() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });

    await controller.exportar(USUARIO_SOPORTE, {}, respuestaFalsa().res);

    expect(exportarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'usr-2', tienePermisoVerTodos: false }),
    );
  });

  it('ADMINISTRADOR → pasa modulosPermitidos=null (mismo gate de módulo que findAll)', async () => {
    const exportarTickets = { execute: vi.fn() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });

    await controller.exportar(ADMINISTRADOR, {}, respuestaFalsa().res);

    expect(exportarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: null }),
    );
  });

  it('traduce los filtros de query a filtros del DTO, sin paginación', async () => {
    const exportarTickets = { execute: vi.fn() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });

    await controller.exportar(
      USUARIO_SOPORTE,
      { estado: 'estado-1', tipo: 'tipo-1', prioridad: 'prioridad-1' },
      respuestaFalsa().res,
    );

    const dto = exportarTickets.execute.mock.calls[0][0] as { filtros: Record<string, unknown> };
    expect(dto.filtros).toMatchObject({
      estadoId: 'estado-1',
      tiposIds: ['tipo-1'],
      prioridadId: 'prioridad-1',
    });
    expect(dto.filtros).not.toHaveProperty('pagina');
    expect(dto.filtros).not.toHaveProperty('porPagina');
  });

  it('traduce el tope excedido a 422 y no escribe headers de descarga', async () => {
    const exportarTickets = { execute: vi.fn() };
    exportarTickets.execute.mockResolvedValue(
      Result.fail(new TicketsErrors.ExportacionDemasiadoGrandeError(6000, 5000)),
    );
    const { controller } = buildController({ exportarTickets });
    const { res, headers } = respuestaFalsa();

    await expect(controller.exportar(USUARIO_SOPORTE, {}, res)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(headers.size).toBe(0);
  });

  /**
   * Regresión del gap CRITICAL de sdd-verify: el decorador ya estaba presente
   * en la ruta, pero ningún test lo ejercía — borrarlo no rompía nada acá.
   * Mismo patrón que equipos/reparaciones (`ACCIONES_KEY` vía `Reflect.getMetadata`).
   */
  it('declara @RequiereAcciones("TICKETS:LECTURA")', () => {
    const meta = Reflect.getMetadata(ACCIONES_KEY, TicketsController.prototype.exportar);
    expect(meta).toEqual(['TICKETS:LECTURA']);
  });
});

describe('TicketsController.findOne — CSAT en el detalle (WU9.2, ADR-C5)', () => {
  function makeTicketAsignado(asignadoId: string | null): TicketEntity {
    const ticket = TicketEntity.create(
      {
        numero: 'SOP-2026-0002',
        titulo: 'Ticket con CSAT',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-cerrado',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-csat-1',
    );
    ticket.assignTo(asignadoId);
    return ticket;
  }

  const TECNICO_ASIGNADO: JwtPayload = payloadDeTest({
    sub: 'tecnico-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'CSAT:LECTURA'],
    cliente_nombre: 'Cliente 1',
    modulos: ['SOPORTE'],
  });

  it('con CSAT:LECTURA y el ticket asignado al actor, delega ticketId/asignadoId/actorRol y arma la respuesta con puntaje/comentario', async () => {
    const ticket = makeTicketAsignado('tecnico-1');
    const obtenerTicket = { execute: vi.fn().mockResolvedValue(Result.ok(ticket)) };
    const obtenerCsatTicket = {
      execute: vi.fn().mockResolvedValue({ puntaje: 5, comentario: 'Todo perfecto' }),
    };
    const { controller } = buildController({ obtenerTicket, obtenerCsatTicket });

    const respuesta = await controller.findOne(TECNICO_ASIGNADO, 'ticket-csat-1');

    expect(obtenerCsatTicket.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-csat-1',
      asignadoId: 'tecnico-1',
      actorId: 'tecnico-1',
      actorRol: 'TECNICO',
      tieneCsatLectura: true,
    });
    expect(respuesta.csatPuntaje).toBe(5);
    expect(respuesta.csatComentario).toBe('Todo perfecto');
  });

  it('cuando el use case de CSAT devuelve null (sin permiso o TECNICO ajeno), la respuesta NO trae csatPuntaje/csatComentario', async () => {
    const ticket = makeTicketAsignado('otro-tecnico');
    const obtenerTicket = { execute: vi.fn().mockResolvedValue(Result.ok(ticket)) };
    const obtenerCsatTicket = { execute: vi.fn().mockResolvedValue(null) };
    const { controller } = buildController({ obtenerTicket, obtenerCsatTicket });

    const respuesta = await controller.findOne(TECNICO_ASIGNADO, 'ticket-csat-1');

    expect('csatPuntaje' in respuesta).toBe(false);
    expect('csatComentario' in respuesta).toBe(false);
  });
});

describe('toHttpException — catálogo de errores → HTTP (sdd/exportar-listados-csv, decisión D2)', () => {
  /** Clases de error exportadas por `tickets.errors.ts` — el número de la verdad, no un literal a mano. */
  // Sin type predicate a propósito: cada export de `tickets.errors.ts` ya es
  // `typeof AlgunErrorConcreto`, con sus estáticos heredados de `Error`
  // (captureStackTrace, etc.) — una firma de constructor inventada acá los
  // pierde y el chequeo TS2677 lo rechaza. El filtro es puro guardarraíl
  // runtime si el módulo alguna vez exporta algo que no sea una clase.
  const CLASES_DE_ERROR = Object.values(TicketsErrors).filter(
    (valor) => typeof valor === 'function' && valor.prototype instanceof DomainError,
  );

  it('el catálogo tiene EXACTAMENTE 23 clases de error (22 previas + ExportacionDemasiadoGrandeError)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(23);
  });

  const TABLA: Array<[string, () => DomainError, 403 | 404 | 409 | 422]> = [
    ['TicketNoEncontradoError', () => new TicketsErrors.TicketNoEncontradoError('ticket-1'), 404],
    [
      'TicketBloqueadoParaEdicionError',
      () => new TicketsErrors.TicketBloqueadoParaEdicionError('EN_PROCESO'),
      403,
    ],
    [
      'TipoTicketNoEncontradoError',
      () => new TicketsErrors.TipoTicketNoEncontradoError('tipo-1'),
      422,
    ],
    [
      'EstadoDestinoInvalidoError',
      () => new TicketsErrors.EstadoDestinoInvalidoError('NO_EXISTE'),
      422,
    ],
    [
      'TransicionInvalidaError',
      () => new TicketsErrors.TransicionInvalidaError('CERRADO', 'NUEVO'),
      422,
    ],
    ['FechaCierreRequeridaError', () => new TicketsErrors.FechaCierreRequeridaError(), 422],
    ['AsignadoInvalidoError', () => new TicketsErrors.AsignadoInvalidoError('user-1'), 422],
    [
      'AsignadoNoElegibleError',
      () => new TicketsErrors.AsignadoNoElegibleError('user-1', 'tipo-1'),
      422,
    ],
    ['SolicitanteInvalidoError', () => new TicketsErrors.SolicitanteInvalidoError('user-1'), 422],
    [
      'ComentarioNoPermitidoError',
      () => new TicketsErrors.ComentarioNoPermitidoError('CERRADO'),
      422,
    ],
    ['ArchivoTamanoCeroError', () => new TicketsErrors.ArchivoTamanoCeroError(BigInt(0)), 422],
    [
      'TipoArchivoNoPermitidoError',
      () => new TicketsErrors.TipoArchivoNoPermitidoError('application/x-msdownload'),
      422,
    ],
    ['SecuenciaAgotadaError', () => new TicketsErrors.SecuenciaAgotadaError('SOPORTE', 2026), 409],
    ['TipoTicketDesconocidoError', () => new TicketsErrors.TipoTicketDesconocidoError(''), 422],
    ['SinCicloActivoError', () => new TicketsErrors.SinCicloActivoError(), 409],
    [
      'PrioridadNoEncontradaError',
      () => new TicketsErrors.PrioridadNoEncontradaError('prioridad-1'),
      422,
    ],
    [
      'TicketReferenciaInvalidaError',
      () => new TicketsErrors.TicketReferenciaInvalidaError('ticket-x'),
      422,
    ],
    [
      'TipoTicketCodigoDuplicadoError',
      () => new TicketsErrors.TipoTicketCodigoDuplicadoError('SOPORTE'),
      422,
    ],
    [
      'PrefijoTipoTicketColisionError',
      () => new TicketsErrors.PrefijoTipoTicketColisionError('COMPRAS', 'COMISION', 'COM'),
      422,
    ],
    [
      'PrioridadCodigoDuplicadaError',
      () => new TicketsErrors.PrioridadCodigoDuplicadaError('ALTA'),
      422,
    ],
    [
      'ModuloTipoTicketInvalidoError',
      () => new TicketsErrors.ModuloTipoTicketInvalidoError('DESCONOCIDO'),
      422,
    ],
    [
      'TipoTicketModuloNoCorrespondeError',
      () => new TicketsErrors.TipoTicketModuloNoCorrespondeError('tipo-1', 'COMPRAS', 'SOPORTE'),
      422,
    ],
    [
      'ExportacionDemasiadoGrandeError',
      () => new TicketsErrors.ExportacionDemasiadoGrandeError(6000, 5000),
      422,
    ],
  ];

  it('TABLA cubre EXACTAMENTE las clases exportadas (ninguna falta, ninguna sobra)', () => {
    expect(TABLA).toHaveLength(CLASES_DE_ERROR.length);
    const nombresEnTabla = new Set(TABLA.map(([nombre]) => nombre));
    for (const clase of CLASES_DE_ERROR) {
      expect(nombresEnTabla.has(clase.name)).toBe(true);
    }
  });

  it.each(TABLA)('%s → HTTP %i', (_nombre, factory, httpEsperado) => {
    const excepcion = toHttpException(factory());

    expect(excepcion.getStatus()).toBe(httpEsperado);
    if (httpEsperado === 403) {
      expect(excepcion).toBeInstanceOf(ForbiddenException);
    } else if (httpEsperado === 404) {
      expect(excepcion).toBeInstanceOf(NotFoundException);
    } else if (httpEsperado === 409) {
      expect(excepcion).toBeInstanceOf(ConflictException);
    } else {
      expect(excepcion).toBeInstanceOf(UnprocessableEntityException);
    }
  });
});
