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
import type { Mock } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  StreamableFile,
} from '@nestjs/common';
import { TicketsController, toHttpException } from './tickets.controller';
import { accionesPorRuta } from '../../../shared/test-helpers/acciones-por-ruta';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { SolicitanteExternoEntity } from '../../domain/entities/solicitante-externo.entity';
import {
  TicketNoEncontradoError,
  TicketBloqueadoParaEdicionError,
  TipoTicketNoPermitidoEnAltaError,
} from '../../domain/errors/tickets.errors';
import * as TicketsErrors from '../../domain/errors/tickets.errors';
import { CrearTicketUseCase } from '../../application/use-cases/crear-ticket.use-case';
import { ObtenerTicketUseCase } from '../../application/use-cases/obtener-ticket.use-case';
import { ListarTicketsUseCase } from '../../application/use-cases/listar-tickets.use-case';
import { EditarTicketUseCase } from '../../application/use-cases/editar-ticket.use-case';
import { TransicionarEstadoUseCase } from '../../application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from '../../application/use-cases/asignar-ticket.use-case';
import { CrearComentarioUseCase } from '../../application/use-cases/crear-comentario.use-case';
import { ListarTimelineUseCase } from '../../application/use-cases/listar-timeline.use-case';
import { ListarTecnicosAsignablesUseCase } from '../../application/use-cases/listar-tecnicos-asignables.use-case';
import { AsignarYPonerEnProcesoUseCase } from '../../application/use-cases/asignar-y-poner-en-proceso.use-case';
import { ExportarTicketsUseCase } from '../../application/use-cases/exportar-tickets.use-case';
import { ObtenerCsatTicketUseCase } from '../../../csat/application/use-cases/obtener-csat-ticket.use-case';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import { ISolicitanteExternoRepository } from '../../domain/ports/i-solicitante-externo.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { unstubbed } from '../../../testing/mocks';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { CargadorAlcanceTicket } from '../alcance-ticket';
import { ObtenerPermisosPorTipoUseCase } from '../../application/use-cases/obtener-permisos-por-tipo.use-case';
import { BorrarTicketUseCase } from '../../application/use-cases/borrar-ticket.use-case';
import { RecuperarTicketUseCase } from '../../application/use-cases/recuperar-ticket.use-case';
import { ListarAgentesFiltroTicketsUseCase } from '../../application/use-cases/listar-agentes-filtro-tickets.use-case';

/** Operación de dominio mínima para alimentar `toOperacionResponseDto`. */
function fakeOperacion(esInterno: boolean): OperacionTicketEntity {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  return OperacionTicketEntity.reconstitute(
    {
      ticketId: 'ticket-1',
      tipoOperacionId: 'tipo-op-comentario',
      descripcion: 'Nota interna del ROOT',
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: 'root-1',
      esInterno,
      metadata: null,
    },
    'op-1',
    createdAt,
    createdAt,
    null,
  );
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

/**
 * Permisos por tipo en la tabla del tenant (odd/permisos-por-tipo-ticket, D5 a): `usr-2` ve y
 * modifica el tipo `ti1`; `usr-1` lo ve y comenta, sin comentario interno.
 */
const PERMISOS_POR_TIPO = [
  { usuarioId: 'usr-2', tipoId: 'ti1', accion: 'LECTURA' },
  { usuarioId: 'usr-2', tipoId: 'ti1', accion: 'MODIFICACION' },
  { usuarioId: 'usr-1', tipoId: 'ti1', accion: 'LECTURA' },
  { usuarioId: 'usr-1', tipoId: 'ti1', accion: 'COMENTAR' },
] as const;

/** Firma de `ISectorRepository.findNombres`, para tipar su doble sin casts. */
type FindNombresSector = (ids: readonly string[]) => Promise<Map<string, string>>;

/** Use case concreto: al controller sólo le interesa `execute`. */
type UseCaseConExecute = { execute: (...args: never[]) => unknown };

/** Doble de un use case: `execute` espiado y tipado contra la firma real. */
type MockUseCase<T extends UseCaseConExecute> = { execute: Mock<T['execute']> };

/** Doble vacío de un use case, con `execute` tipado y sin comportamiento. */
function stub<T extends UseCaseConExecute>(): MockUseCase<T> {
  return { execute: vi.fn<T['execute']>() };
}

/** Instancia real del prototipo del use case, con el `execute` espiado del doble. */
function casoReal<T extends UseCaseConExecute>(Clase: { prototype: T }, doble: MockUseCase<T>): T {
  return Object.create(Clase.prototype, { execute: { value: doble.execute } });
}

/** Las once dependencias-use-case del controller, con el nombre corto que usan los tests. */
type DependenciasControlador = {
  crearTicket: MockUseCase<CrearTicketUseCase>;
  obtenerTicket: MockUseCase<ObtenerTicketUseCase>;
  listarTickets: MockUseCase<ListarTicketsUseCase>;
  editarTicket: MockUseCase<EditarTicketUseCase>;
  transicionar: MockUseCase<TransicionarEstadoUseCase>;
  asignarTicket: MockUseCase<AsignarTicketUseCase>;
  crearComentario: MockUseCase<CrearComentarioUseCase>;
  listarTimeline: MockUseCase<ListarTimelineUseCase>;
  listarTecnicos: MockUseCase<ListarTecnicosAsignablesUseCase>;
  asignarEnProceso: MockUseCase<AsignarYPonerEnProcesoUseCase>;
  exportarTickets: MockUseCase<ExportarTicketsUseCase>;
  obtenerCsatTicket: MockUseCase<ObtenerCsatTicketUseCase>;
  borrarTicket: MockUseCase<BorrarTicketUseCase>;
  recuperarTicket: MockUseCase<RecuperarTicketUseCase>;
  listarAgentes: MockUseCase<ListarAgentesFiltroTicketsUseCase>;
  solicitanteExternoRepo: {
    findNombres: Mock<ISolicitanteExternoRepository['findNombres']>;
    findById: Mock<ISolicitanteExternoRepository['findById']>;
  };
  sectorRepo: { findNombres: ReturnType<typeof vi.fn<FindNombresSector>> };
};

type ControladorDeTest = DependenciasControlador & {
  controller: TicketsController;
  usuarioMasterChecker: { resolverNombres: Mock<IUsuarioMasterChecker['resolverNombres']> };
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
  const deps: DependenciasControlador = {
    crearTicket: overrides.crearTicket ?? stub(),
    obtenerTicket: overrides.obtenerTicket ?? stub(),
    // Default con página vacía válida: `findAll` es el único método que los
    // tests ejercitan SIN pisar su use case, y necesita un `Result` real.
    listarTickets: overrides.listarTickets ?? {
      execute: vi
        .fn<ListarTicketsUseCase['execute']>()
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
    obtenerCsatTicket: overrides.obtenerCsatTicket ?? {
      execute: vi.fn<ObtenerCsatTicketUseCase['execute']>().mockResolvedValue(null),
    },
    borrarTicket: overrides.borrarTicket ?? stub(),
    recuperarTicket: overrides.recuperarTicket ?? stub(),
    listarAgentes: overrides.listarAgentes ?? stub(),
    solicitanteExternoRepo: overrides.solicitanteExternoRepo ?? {
      findNombres: vi
        .fn<ISolicitanteExternoRepository['findNombres']>()
        .mockResolvedValue(new Map()),
      findById: vi.fn<ISolicitanteExternoRepository['findById']>().mockResolvedValue(null),
    },
    sectorRepo: overrides.sectorRepo ?? {
      findNombres: vi.fn<FindNombresSector>().mockResolvedValue(new Map()),
    },
  };
  // `findAll`/`exportar` resuelven nombres batch de los items — con lista vacía
  // devuelve un Map vacío sin N+1.
  const usuarioMasterChecker = {
    resolverNombres: vi.fn<IUsuarioMasterChecker['resolverNombres']>().mockResolvedValue(new Map()),
  };

  const usuarioMasterCheckerReal: IUsuarioMasterChecker = {
    existeEnTenant: unstubbed('existeEnTenant'),
    estaActivoEnTenant: unstubbed('estaActivoEnTenant'),
    esAdminTotalEnTenant: unstubbed('esAdminTotalEnTenant'),
    listarAgentes: unstubbed('listarAgentes'),
    resolverNombres: usuarioMasterChecker.resolverNombres,
  };
  const solicitanteExternoRepo: ISolicitanteExternoRepository = {
    save: unstubbed('save'),
    findById: deps.solicitanteExternoRepo.findById,
    findNombres: deps.solicitanteExternoRepo.findNombres,
  };
  const estadoRepo: IEstadoRepository = {
    findById: unstubbed('findById'),
    findByCodigo: unstubbed('findByCodigo'),
    findIdByCodigo: unstubbed('findIdByCodigo'),
    findAllActive: vi.fn<IEstadoRepository['findAllActive']>().mockResolvedValue([]),
  };

  const controller = new TicketsController(
    casoReal(CrearTicketUseCase, deps.crearTicket),
    casoReal(ObtenerTicketUseCase, deps.obtenerTicket),
    casoReal(ListarTicketsUseCase, deps.listarTickets),
    casoReal(EditarTicketUseCase, deps.editarTicket),
    casoReal(TransicionarEstadoUseCase, deps.transicionar),
    casoReal(AsignarTicketUseCase, deps.asignarTicket),
    casoReal(CrearComentarioUseCase, deps.crearComentario),
    casoReal(ListarTimelineUseCase, deps.listarTimeline),
    usuarioMasterCheckerReal,
    casoReal(ListarTecnicosAsignablesUseCase, deps.listarTecnicos),
    casoReal(AsignarYPonerEnProcesoUseCase, deps.asignarEnProceso),
    casoReal(ExportarTicketsUseCase, deps.exportarTickets),
    casoReal(ObtenerCsatTicketUseCase, deps.obtenerCsatTicket),
    solicitanteExternoRepo,
    estadoRepo,
    deps.sectorRepo,
    new CargadorAlcanceTicket(new PermisosTipoTicketEnMemoria([], PERMISOS_POR_TIPO)),
    new ObtenerPermisosPorTipoUseCase(
      new PermisosTipoTicketEnMemoria([{ id: 'ti1', modulo: 'TICKETS' }]),
    ),
    casoReal(BorrarTicketUseCase, deps.borrarTicket),
    casoReal(RecuperarTicketUseCase, deps.recuperarTicket),
    casoReal(ListarAgentesFiltroTicketsUseCase, deps.listarAgentes),
  );
  return { controller, ...deps, usuarioMasterChecker };
}

describe('TicketsController — bypass ROOT en chequeos inline (sdd/root-access-fix)', () => {
  it('ROOT con permisos=[] PUEDE crear un comentario interno (no 403) y lo delega con esInterno=true', async () => {
    const crearComentario = {
      execute: vi
        .fn<CrearComentarioUseCase['execute']>()
        .mockResolvedValue(Result.ok(fakeOperacion(true))),
    };
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

  it('el comentario interno lo decide el caso de uso con OBSERVAR sobre el tipo: su 403 llega como ForbiddenException', async () => {
    const crearComentario = {
      execute: vi
        .fn<CrearComentarioUseCase['execute']>()
        .mockResolvedValue(
          Result.fail(new TicketsErrors.AccionSobreTipoNoPermitidaError('OBSERVAR')),
        ),
    };
    const { controller } = buildController({ crearComentario });

    await expect(
      controller.comentar(USUARIO_SIN_OBSERVAR, 'ticket-1', {
        texto: 'Intento de nota interna',
        esInterno: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // La celda del JWT ya no corta antes: el caso de uso recibe el pedido con los permisos por tipo.
    expect(crearComentario.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        esInterno: true,
        actorId: 'usr-1',
        permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'COMENTAR'])]]),
      }),
    );
  });

  it('ROOT ve TODO el scope: timeline se invoca sin restricción por tipo', async () => {
    const listarTimeline = {
      execute: vi.fn<ListarTimelineUseCase['execute']>().mockResolvedValue(Result.ok([])),
    };
    const { controller } = buildController({ listarTimeline });

    await controller.timeline(ROOT, 'ticket-1');

    expect(listarTimeline.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      actorId: 'root-1',
      permisosPorTipo: null,
    });
  });
});

describe('TicketsController.findAll — alcance por tipo (odd/permisos-por-tipo-ticket, D5 e)', () => {
  it('usuario común → pasa los permisos por tipo de la tabla del tenant, no las celdas del JWT', async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(USUARIO_SOPORTE, { tipo: 'ti1' });

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        alcance: {
          actorId: 'usr-2',
          permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
        },
        filtros: expect.objectContaining({ tiposIds: ['ti1'] }),
      }),
    );
  });

  it.each([
    ['ADMINISTRADOR', ADMINISTRADOR],
    ['ROOT', ROOT],
  ])('%s → sin restricción por tipo (permisosPorTipo null)', async (_rol, actor) => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(actor, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ alcance: { actorId: actor.sub, permisosPorTipo: null } }),
    );
  });
});

describe('TicketsController — GET /tickets/agentes (filtro "Asignado" del listado)', () => {
  it('delega con el clienteId del JWT, el ?tipo= y el alcance por tipo del actor', async () => {
    const agentes = [{ id: 'tec-1', nombre: 'Ana', apellido: 'García' }];
    const listarAgentes = {
      execute: vi
        .fn<ListarAgentesFiltroTicketsUseCase['execute']>()
        .mockResolvedValue(Result.ok(agentes)),
    };
    const { controller } = buildController({ listarAgentes });

    const res = await controller.agentes(USUARIO_SOPORTE, { tipo: 'ti1' });

    expect(listarAgentes.execute).toHaveBeenCalledWith({
      clienteId: 'cliente-1',
      tipoId: 'ti1',
      actorId: 'usr-2',
      permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
    });
    expect(res).toEqual(agentes);
  });

  it('sin acceso a la lista → 403', async () => {
    const listarAgentes = {
      execute: vi
        .fn<ListarAgentesFiltroTicketsUseCase['execute']>()
        .mockResolvedValue(Result.fail(new TicketsErrors.ListaDeAgentesNoPermitidaError())),
    };
    const { controller } = buildController({ listarAgentes });

    await expect(controller.agentes(USUARIO_SOPORTE, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('TicketsController — asignación unificada (asignables + asignar-en-proceso)', () => {
  it('GET :id/asignables → delega con el clienteId del JWT y devuelve la lista de técnicos', async () => {
    const tecnicos = [{ id: 'tec-1', nombre: 'Ana', apellido: 'García' }];
    const listarTecnicos = {
      execute: vi
        .fn<ListarTecnicosAsignablesUseCase['execute']>()
        .mockResolvedValue(Result.ok(tecnicos)),
    };
    const { controller } = buildController({ listarTecnicos });

    const res = await controller.asignables(USUARIO_SOPORTE, 'ticket-1');

    expect(listarTecnicos.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      clienteId: 'cliente-1',
      actorId: 'usr-2',
      permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
    });
    expect(res).toEqual(tecnicos);
  });

  it('GET :id/asignables → ticket inexistente propaga 404', async () => {
    const listarTecnicos = {
      execute: vi
        .fn<ListarTecnicosAsignablesUseCase['execute']>()
        .mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-x'))),
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
    const asignarEnProceso = {
      execute: vi
        .fn<AsignarYPonerEnProcesoUseCase['execute']>()
        .mockResolvedValue(Result.ok(ticket)),
    };
    const { controller } = buildController({ asignarEnProceso });

    await controller.asignarEnProceso(USUARIO_SOPORTE, 'ticket-1', { asignadoId: 'agente-1' });

    expect(asignarEnProceso.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      asignadoId: 'agente-1',
      autorId: 'usr-2',
      clienteId: 'cliente-1',
      actorId: 'usr-2',
      permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
    });
  });
});

describe('TicketsController — alcance del actor en las escrituras (odd/permisos-por-tipo-ticket, D5 a)', () => {
  /** Alcance que carga `CargadorAlcanceTicket` para `usr-2`: sus filas de la tabla del tenant. */
  const ALCANCE_USUARIO_SOPORTE = {
    actorId: 'usr-2',
    permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
  };

  function makeTicketEntity(): TicketEntity {
    return TicketEntity.create(
      {
        numero: 'SOP-2026-0001',
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-nuevo',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-1',
    );
  }

  it('update delega con el alcance cargado por tipo', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ editarTicket });

    await controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining(ALCANCE_USUARIO_SOPORTE),
    );
  });

  it('transicionarEstado delega con el alcance cargado por tipo (nunca null: null es solo para sistema)', async () => {
    const transicionar = {
      execute: vi
        .fn<TransicionarEstadoUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(USUARIO_SOPORTE, 'ticket-1', {
      nuevoEstadoCodigo: 'ASIGNADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ alcance: ALCANCE_USUARIO_SOPORTE }),
    );
  });

  it('transicionarEstado de ROOT delega sin restricción por tipo', async () => {
    const transicionar = {
      execute: vi
        .fn<TransicionarEstadoUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ROOT, 'ticket-1', { nuevoEstadoCodigo: 'ASIGNADO' });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        alcance: { actorId: 'root-1', permisosPorTipo: null },
      }),
    );
  });

  it('asignar delega con el alcance cargado por tipo', async () => {
    const asignarTicket = {
      execute: vi
        .fn<AsignarTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ asignarTicket });

    await controller.asignar(USUARIO_SOPORTE, 'ticket-1', { asignadoId: 'agente-1' });

    expect(asignarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining(ALCANCE_USUARIO_SOPORTE),
    );
  });

  it('comentar delega con el alcance cargado por tipo', async () => {
    const crearComentario = {
      execute: vi
        .fn<CrearComentarioUseCase['execute']>()
        .mockResolvedValue(Result.ok(fakeOperacion(false))),
    };
    const { controller } = buildController({ crearComentario });

    await controller.comentar(USUARIO_SOPORTE, 'ticket-1', { texto: 'Hola' });

    expect(crearComentario.execute).toHaveBeenCalledWith(
      expect.objectContaining(ALCANCE_USUARIO_SOPORTE),
    );
  });

  it('un ticket que el actor no ve llega como 404 en las escrituras', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-1'))),
    };
    const { controller } = buildController({ editarTicket });

    await expect(
      controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un ticket que el actor ve sin la acción sobre su tipo llega como 403', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(
          Result.fail(new TicketsErrors.AccionSobreTipoNoPermitidaError('MODIFICACION')),
        ),
    };
    const { controller } = buildController({ editarTicket });

    await expect(
      controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ editarTicket });

    await controller.update(ROOT, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', actorEsRoot: true }),
    );
  });

  it('update: ADMINISTRADOR (no-ROOT) → delega con actorEsRoot=false', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ editarTicket });

    await controller.update(ADMINISTRADOR, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsRoot: false }),
    );
  });

  it('create: pasa ubicacion y sectorId del body; ausentes llegan como null', async () => {
    const crearTicket = {
      execute: vi
        .fn<CrearTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ crearTicket });
    const body = { titulo: 'X', tipoId: 't1', prioridadId: 'p1' };

    await controller.create(ADMINISTRADOR, { ...body, ubicacion: 'Aula 3', sectorId: 's1' });
    await controller.create(ADMINISTRADOR, body);

    expect(crearTicket.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ubicacion: 'Aula 3', sectorId: 's1' }),
    );
    expect(crearTicket.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ubicacion: null, sectorId: null }),
    );
  });

  it('create: delega con el alcance por tipo del actor; sin ALTAS sobre el tipo responde 403', async () => {
    const crearTicket = {
      execute: vi
        .fn<CrearTicketUseCase['execute']>()
        .mockResolvedValue(Result.fail(new TicketsErrors.AccionSobreTipoNoPermitidaError('ALTAS'))),
    };
    const { controller } = buildController({ crearTicket });

    const promesa = controller.create(USUARIO_SOPORTE, {
      titulo: 'X',
      tipoId: 'ti1',
      prioridadId: 'p1',
    });

    await expect(promesa).rejects.toBeInstanceOf(ForbiddenException);
    expect(crearTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoId: 'ti1',
        alcance: {
          actorId: 'usr-2',
          permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
        },
      }),
    );
  });

  it('create: exige tipos del módulo TICKETS y responde 422 a un tipo de otro módulo (S3)', async () => {
    const crearTicket = {
      execute: vi
        .fn<CrearTicketUseCase['execute']>()
        .mockResolvedValue(
          Result.fail(new TipoTicketNoPermitidoEnAltaError('MANTENIMIENTO', 'TICKETS')),
        ),
    };
    const { controller } = buildController({ crearTicket });

    const promesa = controller.create(ADMINISTRADOR, {
      titulo: 'X',
      tipoId: 't1',
      prioridadId: 'p1',
    });

    await expect(promesa).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(promesa).rejects.toThrow(
      'El tipo de ticket "MANTENIMIENTO" no se puede usar en el alta del módulo TICKETS.',
    );
    expect(crearTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ moduloRequerido: 'TICKETS' }),
    );
  });

  it('update: null en ubicacion/sectorId llega como null (limpia); omitidos llegan undefined', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ editarTicket });

    await controller.update(ADMINISTRADOR, 'ticket-1', { ubicacion: null, sectorId: null });
    await controller.update(ADMINISTRADOR, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute.mock.calls[0][0]).toMatchObject({
      ubicacion: null,
      sectorId: null,
    });
    const segunda = editarTicket.execute.mock.calls[1][0];
    expect(segunda.ubicacion).toBeUndefined();
    expect(segunda.sectorId).toBeUndefined();
  });

  it('update: TicketBloqueadoParaEdicionError → 403 ForbiddenException', async () => {
    const editarTicket = {
      execute: vi
        .fn<EditarTicketUseCase['execute']>()
        .mockResolvedValue(Result.fail(new TicketBloqueadoParaEdicionError('EN_PROCESO'))),
    };
    const { controller } = buildController({ editarTicket });

    await expect(
      controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transicionarEstado: ROOT → actorEsCorrector=true', async () => {
    const transicionar = {
      execute: vi
        .fn<TransicionarEstadoUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ROOT, 'ticket-1', { nuevoEstadoCodigo: 'ASIGNADO' });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: ADMINISTRADOR → actorEsCorrector=true', async () => {
    const transicionar = {
      execute: vi
        .fn<TransicionarEstadoUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ADMINISTRADOR, 'ticket-1', {
      nuevoEstadoCodigo: 'ASIGNADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: rol no-ADMINISTRADOR/no-ROOT → actorEsCorrector=false (solo arcos normales)', async () => {
    const transicionar = {
      execute: vi
        .fn<TransicionarEstadoUseCase['execute']>()
        .mockResolvedValue(Result.ok(makeTicketEntity())),
    };
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
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
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

  it('con ?formato=xlsx entrega un StreamableFile con el content-type y el nombre de xlsx; el use case recibe el formato', async () => {
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: Buffer.from('PK'), nombreArchivo: 'tickets-2026-08-19.xlsx' }),
    );
    const { controller } = buildController({ exportarTickets });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USUARIO_SOPORTE, {}, res, 'xlsx');

    expect(salida).toBeInstanceOf(StreamableFile);
    expect(exportarTickets.execute).toHaveBeenLastCalledWith(expect.anything(), 'xlsx');
    expect(headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers.get('Content-Disposition')).toBe(
      'attachment; filename="tickets-2026-08-19.xlsx"',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('sin ?formato sigue entregando CSV (default), el use case recibe csv', async () => {
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: 'a;b', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USUARIO_SOPORTE, {}, res);

    expect(salida).toBe('a;b');
    expect(exportarTickets.execute).toHaveBeenLastCalledWith(expect.anything(), 'csv');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('deriva el alcance de los permisos por tipo del actor, NUNCA del query', async () => {
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });

    await controller.exportar(USUARIO_SOPORTE, {}, respuestaFalsa().res);

    expect(exportarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        alcance: {
          actorId: 'usr-2',
          permisosPorTipo: new Map([['ti1', new Set(['LECTURA', 'MODIFICACION'])]]),
        },
      }),
      'csv',
    );
  });

  it('ADMINISTRADOR → sin restricción por tipo (mismo alcance que findAll)', async () => {
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
    exportarTickets.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'tickets-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarTickets });

    await controller.exportar(ADMINISTRADOR, {}, respuestaFalsa().res);

    expect(exportarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ alcance: { actorId: 'admin-1', permisosPorTipo: null } }),
      'csv',
    );
  });

  it('traduce los filtros de query a filtros del DTO, sin paginación', async () => {
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
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
    const exportarTickets = { execute: vi.fn<ExportarTicketsUseCase['execute']>() };
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
});

/**
 * odd/permisos-por-tipo-ticket, D5 d: ninguna ruta del controller exige una celda de módulo
 * (`TICKETS:*`): deciden los casos de uso con los permisos por tipo. Se recorren TODOS los métodos
 * con ruta, así que una ruta nueva con `@RequiereAcciones` de módulo también pone esto en rojo.
 */
describe('TicketsController — sin @RequiereAcciones de módulo (D5 d)', () => {
  it('ninguna de sus 15 rutas exige una celda: deciden los casos de uso por tipo', () => {
    const rutas = accionesPorRuta(TicketsController);

    expect(rutas.size).toBe(15);
    expect([...rutas].filter(([, acciones]) => acciones.length > 0)).toEqual([]);
  });
});

describe('TicketsController.permisosPorTipo — GET /tickets/permisos-por-tipo (T6, S6)', () => {
  it('usuario común → sus acciones por tipo de la tabla del tenant y la unión por módulo', async () => {
    const { controller } = buildController();

    await expect(controller.permisosPorTipo(USUARIO_SIN_OBSERVAR)).resolves.toEqual({
      sinRestriccion: false,
      porTipo: { ti1: ['LECTURA', 'COMENTAR'] },
      porModulo: { TICKETS: ['LECTURA', 'COMENTAR'] },
    });
  });

  it('ROOT sin membresía → sin restricción, aunque no tenga celdas ni filas', async () => {
    const { controller } = buildController();

    await expect(controller.permisosPorTipo(ROOT)).resolves.toEqual({
      sinRestriccion: true,
      porTipo: {},
      porModulo: {},
    });
  });

  it('se declara antes de GET /tickets/:id, para que `permisos-por-tipo` no se lea como un id', () => {
    const metodos = Object.getOwnPropertyNames(TicketsController.prototype);

    expect(metodos.indexOf('permisosPorTipo')).toBeGreaterThan(-1);
    expect(metodos.indexOf('permisosPorTipo')).toBeLessThan(metodos.indexOf('findOne'));
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
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const obtenerCsatTicket = {
      execute: vi
        .fn<ObtenerCsatTicketUseCase['execute']>()
        .mockResolvedValue({ puntaje: 5, comentario: 'Todo perfecto' }),
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
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const obtenerCsatTicket = {
      execute: vi.fn<ObtenerCsatTicketUseCase['execute']>().mockResolvedValue(null),
    };
    const { controller } = buildController({ obtenerTicket, obtenerCsatTicket });

    const respuesta = await controller.findOne(TECNICO_ASIGNADO, 'ticket-csat-1');

    expect('csatPuntaje' in respuesta).toBe(false);
    expect('csatComentario' in respuesta).toBe(false);
  });

  /**
   * [CRITICAL][WU12.1] Regresión del gap del segundo verify: los dos tests de
   * arriba prueban solo la dirección positiva (TECNICO_ASIGNADO CON
   * CSAT:LECTURA) o stubean `obtenerCsatTicket` de forma que `puedeEjecutar`
   * nunca corre. Ninguno distingue "lo calculó bien" de "está cableado a
   * true". Espejo exacto de `dashboard.controller.spec.ts` D2.
   */
  it('sin CSAT:LECTURA en permisos, delega tieneCsatLectura=false', async () => {
    const TECNICO_SIN_CSAT: JwtPayload = payloadDeTest({
      sub: 'tecnico-1',
      cliente_id: 'cliente-1',
      rol: 'TECNICO',
      permisos: ['TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
      cliente_nombre: 'Cliente 1',
      modulos: ['SOPORTE'],
    });
    const ticket = makeTicketAsignado('tecnico-1');
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const obtenerCsatTicket = {
      execute: vi.fn<ObtenerCsatTicketUseCase['execute']>().mockResolvedValue(null),
    };
    const { controller } = buildController({ obtenerTicket, obtenerCsatTicket });

    await controller.findOne(TECNICO_SIN_CSAT, 'ticket-csat-1');

    expect(obtenerCsatTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tieneCsatLectura: false }),
    );
  });
});

describe('TicketsController — lectores con datos del solicitante externo (WU-8)', () => {
  const LECTOR: JwtPayload = payloadDeTest({
    sub: 'tecnico-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: ['TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
    cliente_nombre: 'Cliente 1',
    modulos: ['SOPORTE'],
  });

  function ticketDe(id: string, origen: { usuario?: string; externo?: string }): TicketEntity {
    return TicketEntity.create(
      {
        numero: `SOP-2026-${id}`,
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e1',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: origen.usuario ?? null,
        solicitanteExternoId: origen.externo ?? null,
      },
      id,
    );
  }

  function externo(nombre: string, telefono: string | null): SolicitanteExternoEntity {
    return SolicitanteExternoEntity.create({
      nombre,
      email: 'ext@example.com',
      telefono,
      emailVerificadoAt: new Date('2026-10-03T10:00:00Z'),
    }).getValue();
  }

  it('listado con externo y registrado mezclados: nombra a cada uno y NO trae el telefono', async () => {
    const items = [ticketDe('t-ext', { externo: 'ext-1' }), ticketDe('t-reg', { usuario: 'u-1' })];
    const listarTickets = {
      execute: vi
        .fn<ListarTicketsUseCase['execute']>()
        .mockResolvedValue(Result.ok({ items, total: 2, pagina: 1, porPagina: 20 })),
    };
    const solicitanteExternoRepo = {
      findNombres: vi
        .fn<ISolicitanteExternoRepository['findNombres']>()
        .mockResolvedValue(new Map([['ext-1', 'Marta Externa']])),
      findById: vi.fn<ISolicitanteExternoRepository['findById']>(),
    };
    const { controller, usuarioMasterChecker } = buildController({
      listarTickets,
      solicitanteExternoRepo,
    });
    usuarioMasterChecker.resolverNombres.mockResolvedValue(
      new Map([['u-1', { nombre: 'Ana', apellido: 'Gomez' }]]),
    );

    const respuesta = await controller.findAll(LECTOR, {});

    const [ext, reg] = respuesta.items;
    expect(ext.solicitanteNombre).toBe('Marta Externa');
    expect(ext.solicitanteApellido).toBeNull();
    expect(ext.solicitanteEsExterno).toBe(true);
    expect(ext.solicitanteExternoId).toBe('ext-1');
    expect(reg.solicitanteNombre).toBe('Ana');
    expect(reg.solicitanteEsExterno).toBe(false);
    expect('solicitanteTelefono' in ext).toBe(false);
    // Un solo batch para todo el listado (sin N+1) y solo con ids de externos.
    expect(solicitanteExternoRepo.findNombres).toHaveBeenCalledTimes(1);
    expect(solicitanteExternoRepo.findNombres).toHaveBeenCalledWith(['ext-1']);
    expect(solicitanteExternoRepo.findById).not.toHaveBeenCalled();
  });

  it('detalle de un ticket externo: trae nombre y telefono', async () => {
    const ticket = ticketDe('t-ext', { externo: 'ext-1' });
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const solicitanteExternoRepo = {
      findNombres: vi
        .fn<ISolicitanteExternoRepository['findNombres']>()
        .mockResolvedValue(new Map([['ext-1', 'Marta Externa']])),
      findById: vi
        .fn<ISolicitanteExternoRepository['findById']>()
        .mockResolvedValue(externo('Marta Externa', '+54 11 5555-0000')),
    };
    const { controller } = buildController({ obtenerTicket, solicitanteExternoRepo });

    const respuesta = await controller.findOne(LECTOR, 't-ext');

    expect(respuesta.solicitanteNombre).toBe('Marta Externa');
    expect(respuesta.solicitanteTelefono).toBe('+54 11 5555-0000');
  });

  it('detalle de un externo sin telefono: solicitanteTelefono es null', async () => {
    const ticket = ticketDe('t-ext', { externo: 'ext-1' });
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const solicitanteExternoRepo = {
      findNombres: vi
        .fn<ISolicitanteExternoRepository['findNombres']>()
        .mockResolvedValue(new Map([['ext-1', 'Marta Externa']])),
      findById: vi
        .fn<ISolicitanteExternoRepository['findById']>()
        .mockResolvedValue(externo('Marta Externa', null)),
    };
    const { controller } = buildController({ obtenerTicket, solicitanteExternoRepo });

    const respuesta = await controller.findOne(LECTOR, 't-ext');

    expect(respuesta.solicitanteTelefono).toBeNull();
  });

  it('detalle de un ticket de usuario registrado: no consulta al externo y el telefono es null', async () => {
    const ticket = ticketDe('t-reg', { usuario: 'u-1' });
    const obtenerTicket = {
      execute: vi.fn<ObtenerTicketUseCase['execute']>().mockResolvedValue(Result.ok(ticket)),
    };
    const { controller, solicitanteExternoRepo } = buildController({ obtenerTicket });

    const respuesta = await controller.findOne(LECTOR, 't-reg');

    expect(respuesta.solicitanteTelefono).toBeNull();
    expect(respuesta.solicitanteEsExterno).toBe(false);
    expect(solicitanteExternoRepo.findById).not.toHaveBeenCalled();
  });

  describe('ubicacion y sector en la respuesta (odd/ubicacion-sector-ticket)', () => {
    function conSector(id: string, sectorId: string | null, ubicacion: string | null) {
      const t = ticketDe(id, { usuario: 'u-1' });
      t.actualizarDatos({ sectorId, ubicacion });
      return t;
    }

    it('listado: resuelve los nombres de sector en un solo lote y los expone con la ubicacion', async () => {
      const items = [
        conSector('t-1', 's-1', 'Aula 3'),
        conSector('t-2', 's-1', null),
        conSector('t-3', null, null),
        conSector('t-4', 's-viejo', null),
      ];
      const listarTickets = {
        execute: vi
          .fn<ListarTicketsUseCase['execute']>()
          .mockResolvedValue(Result.ok({ items, total: 4, pagina: 1, porPagina: 20 })),
      };
      const sectorRepo = {
        findNombres: vi.fn<FindNombresSector>().mockResolvedValue(
          new Map([
            ['s-1', 'Computacion'],
            ['s-viejo', 'Sector desactivado'],
          ]),
        ),
      };
      const { controller } = buildController({ listarTickets, sectorRepo });

      const { items: res } = await controller.findAll(LECTOR, {});

      expect(res.map((r) => [r.ubicacion, r.sectorId, r.sectorNombre])).toEqual([
        ['Aula 3', 's-1', 'Computacion'],
        [null, 's-1', 'Computacion'],
        [null, null, null],
        [null, 's-viejo', 'Sector desactivado'],
      ]);
      expect(sectorRepo.findNombres).toHaveBeenCalledTimes(1);
      expect(sectorRepo.findNombres).toHaveBeenCalledWith(['s-1', 's-viejo']);
    });

    it('detalle: trae ubicacion, sectorId y sectorNombre', async () => {
      const obtenerTicket = {
        execute: vi
          .fn<ObtenerTicketUseCase['execute']>()
          .mockResolvedValue(Result.ok(conSector('t-1', 's-1', 'Patio'))),
      };
      const sectorRepo = {
        findNombres: vi
          .fn<FindNombresSector>()
          .mockResolvedValue(new Map([['s-1', 'Mantenimiento']])),
      };
      const { controller } = buildController({ obtenerTicket, sectorRepo });

      const respuesta = await controller.findOne(LECTOR, 't-1');

      expect(respuesta).toMatchObject({
        ubicacion: 'Patio',
        sectorId: 's-1',
        sectorNombre: 'Mantenimiento',
      });
    });
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

  it('el catálogo tiene EXACTAMENTE 36 clases de error (32 previas + las tres del borrado, S8 y L45, + la de la lista de agentes)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(36);
  });

  const TABLA: Array<[string, () => DomainError, 403 | 404 | 409 | 422]> = [
    ['TicketNoEncontradoError', () => new TicketsErrors.TicketNoEncontradoError('ticket-1'), 404],
    [
      'AccionSobreTipoNoPermitidaError',
      () => new TicketsErrors.AccionSobreTipoNoPermitidaError('MODIFICACION'),
      403,
    ],
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
    [
      'TicketCerradoNoReasignableError',
      () => new TicketsErrors.TicketCerradoNoReasignableError('ticket-1', 'CERRADO'),
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
      'TipoTicketDelSistemaError',
      () => new TicketsErrors.TipoTicketDelSistemaError('PREVENTIVO'),
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
    [
      'SolicitanteExternoInvalidoError',
      () => new TicketsErrors.SolicitanteExternoInvalidoError('el nombre es obligatorio'),
      422,
    ],
    [
      'SectorTicketInexistenteError',
      () => new TicketsErrors.SectorTicketInexistenteError('sector-x'),
      422,
    ],
    [
      'TipoTicketNoPermitidoEnAltaError',
      () => new TicketsErrors.TipoTicketNoPermitidoEnAltaError('MANTENIMIENTO', 'TICKETS'),
      422,
    ],
    ['ModuloSinAltaDeTipoError', () => new TicketsErrors.ModuloSinAltaDeTipoError('COMPRAS'), 422],
    [
      'TipoOrigenPermisosNoEncontradoError',
      () => new TicketsErrors.TipoOrigenPermisosNoEncontradoError('tipo-1'),
      422,
    ],
    [
      'TipoOrigenPermisosDeOtroModuloError',
      () => new TicketsErrors.TipoOrigenPermisosDeOtroModuloError('EDILICIA', 'TICKETS'),
      422,
    ],
    [
      'TicketConPendientesNoBorrableError',
      () => new TicketsErrors.TicketConPendientesNoBorrableError(1, []),
      422,
    ],
    [
      'TicketPreventivoNoBorrableError',
      () => new TicketsErrors.TicketPreventivoNoBorrableError(),
      422,
    ],
    [
      'TicketsBorradosSoloAdministradorError',
      () => new TicketsErrors.TicketsBorradosSoloAdministradorError(),
      403,
    ],
    [
      'ListaDeAgentesNoPermitidaError',
      () => new TicketsErrors.ListaDeAgentesNoPermitidaError(),
      403,
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
