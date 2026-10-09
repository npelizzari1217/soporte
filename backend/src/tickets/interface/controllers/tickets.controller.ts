/**
 * TicketsController — entry point HTTP del CRUD lectura/creación, transición
 * de estado y asignación de tickets (T4, T6, T7, T8 — PR6; T9/T10 — PR7;
 * T14/T15 — PR8).
 *
 * Rutas:
 *   POST   /tickets            → CrearTicketUseCase (`ticket:crear`, USUARIO+)
 *   GET    /tickets            → ListarTicketsUseCase (cualquier tenant autenticado; scope T6)
 *   GET    /tickets/export     → ExportarTicketsUseCase (`TICKETS:LECTURA`, sdd/exportar-listados-csv)
 *   GET    /tickets/:id        → ObtenerTicketUseCase (cualquier tenant autenticado; scope T6)
 *   PATCH  /tickets/:id        → EditarTicketUseCase (`ticket:editar`, TECNICO+)
 *   PATCH  /tickets/:id/estado → TransicionarEstadoUseCase (`ticket:transicionar`, TECNICO+)
 *   PATCH  /tickets/:id/asignar → AsignarTicketUseCase (`ticket:asignar`, TECNICO+)
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario — reemplaza a
 * `PermissionsGuard`+`ModulosGuard`) — los dos primeros SIEMPRE aplican
 * (requieren JWT válido + tenant resuelto); `AccionesGuard` solo actúa
 * cuando el endpoint tiene `@RequiereAcciones(...)` (sin metadata →
 * pass-through). Los endpoints GET declaran `@RequiereAcciones('TICKETS:LECTURA')`
 * (corrección post-verify, sdd/matriz-permisos-por-usuario R5): el backfill
 * le da esa celda a TODA membresía activa (regla universal, R7), así que
 * nadie pierde acceso hoy, pero a partir de ahora la casilla de la grilla del
 * ABM gobierna algo real. El scope de FILAS (propios vs. todos) sigue
 * resolviéndose DENTRO del use case según si el actor tiene
 * `TICKETS:VER_TODOS` (T6/T7, R11) — eso NO cambió, sigue sin ser un 403
 * binario.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException` (presentación).
 *
 * Tarea: T6.6 (PR6 — CRUD lectura/creación), T7.5 (PR7), T8.5 (PR8)
 */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { FormatoExport } from '../../../shared/application/armar-export';
import { entregarExport } from '../../../shared/interface/export/entregar-export';
import { ParseFormatoExportPipe } from '../../../shared/interface/export/formato-export.pipe';
import { CrearTicketUseCase } from '../../application/use-cases/crear-ticket.use-case';
import { ObtenerTicketUseCase } from '../../application/use-cases/obtener-ticket.use-case';
import { ListarTicketsUseCase } from '../../application/use-cases/listar-tickets.use-case';
import { EditarTicketUseCase } from '../../application/use-cases/editar-ticket.use-case';
import { TransicionarEstadoUseCase } from '../../application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from '../../application/use-cases/asignar-ticket.use-case';
import { AsignarYPonerEnProcesoUseCase } from '../../application/use-cases/asignar-y-poner-en-proceso.use-case';
import {
  ListarTecnicosAsignablesUseCase,
  TecnicoAsignable,
} from '../../application/use-cases/listar-tecnicos-asignables.use-case';
import { CrearComentarioUseCase } from '../../application/use-cases/crear-comentario.use-case';
import { ListarTimelineUseCase } from '../../application/use-cases/listar-timeline.use-case';
import { ExportarTicketsUseCase } from '../../application/use-cases/exportar-tickets.use-case';
import { ObtenerCsatTicketUseCase } from '../../../csat/application/use-cases/obtener-csat-ticket.use-case';
import {
  AsignarTicketDto,
  CreateComentarioDto,
  CreateTicketDto,
  EditTicketDto,
  ExportarTicketsQueryDto,
  ListTicketsQueryDto,
  ListTicketsResponseDto,
  NombresResueltos,
  OperacionResponseDto,
  TicketResponseDto,
  TransitionTicketStateDto,
  toOperacionResponseDto,
  toTicketResponseDto,
} from '../dtos/ticket.dto';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketReferenciaInvalidaError,
  SolicitanteInvalidoError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
  TipoTicketDesconocidoError,
  EstadoDestinoInvalidoError,
  TransicionInvalidaError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  TicketCerradoNoReasignableError,
  ComentarioNoPermitidoError,
  ArchivoTamanoCeroError,
  TipoArchivoNoPermitidoError,
  TicketBloqueadoParaEdicionError,
  SolicitanteExternoInvalidoError,
  ExportacionDemasiadoGrandeError,
} from '../../domain/errors/tickets.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { puedeEjecutar } from '../../../auth/domain/permisos.util';
import { DomainError } from '../../../shared/domain/result';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../../domain/ports/i-usuario-master.checker';
import {
  ISolicitanteExternoRepository,
  SOLICITANTE_EXTERNO_REPOSITORY,
} from '../../domain/ports/i-solicitante-externo.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../../domain/ports/i-estado.repository';

const ACCION_VER_TODOS = 'TICKETS:VER_TODOS';
const ACCION_OBSERVAR = 'TICKETS:OBSERVAR';
/** WU9.2 (ADR-C5): gateo del puntaje/comentario CSAT POR CAMPO, no por decorador. */
const ACCION_CSAT_LECTURA = 'CSAT:LECTURA';

/** Mapea un `DomainError` de los use cases de tickets a la `HttpException` correspondiente. */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException | ForbiddenException {
  if (error instanceof TicketNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof TicketBloqueadoParaEdicionError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof TipoTicketNoEncontradoError ||
    error instanceof PrioridadNoEncontradaError ||
    error instanceof TicketReferenciaInvalidaError ||
    error instanceof SolicitanteInvalidoError ||
    error instanceof TipoTicketDesconocidoError ||
    error instanceof EstadoDestinoInvalidoError ||
    error instanceof TransicionInvalidaError ||
    error instanceof AsignadoInvalidoError ||
    error instanceof AsignadoNoElegibleError ||
    error instanceof TicketCerradoNoReasignableError ||
    error instanceof ComentarioNoPermitidoError ||
    error instanceof ArchivoTamanoCeroError ||
    error instanceof TipoArchivoNoPermitidoError ||
    // Exportación a CSV (sdd/exportar-listados-csv, decisión D2): cae igual
    // en 422 por el default, pero se lista explícito como los demás — el
    // default existe para el error que NADIE mapeó, no para ahorrarse una
    // línea en uno conocido.
    error instanceof ExportacionDemasiadoGrandeError ||
    // Formulario público (sdd/formulario-publico-qr, WU-6): datos del externo inválidos.
    error instanceof SolicitanteExternoInvalidoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof SecuenciaAgotadaError) {
    return new ConflictException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca 500
  // silencioso para un DomainError, que por definición es un fallo esperado).
  return new UnprocessableEntityException(error.message);
}

/**
 * Lo único que este controller necesita de la respuesta HTTP para entregar
 * una descarga: poder escribir headers.
 *
 * Se declara acá en vez de importar `Response` de `express` a propósito
 * (mismo criterio que `ComprasController`, sdd/exportar-listados-csv): el
 * tipo completo traería `@types/express` como dependencia nueva, y este
 * proyecto tiene un motivo concreto para no tocar el lockfile sin necesidad
 * (el deploy aborta cuando cambia). Tipar exactamente lo que se usa deja el
 * mismo chequeo estricto sin arrastrar nada.
 */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets')
export class TicketsController {
  private readonly logger = new Logger(TicketsController.name);

  constructor(
    private readonly crearTicketUseCase: CrearTicketUseCase,
    private readonly obtenerTicketUseCase: ObtenerTicketUseCase,
    private readonly listarTicketsUseCase: ListarTicketsUseCase,
    private readonly editarTicketUseCase: EditarTicketUseCase,
    private readonly transicionarEstadoUseCase: TransicionarEstadoUseCase,
    private readonly asignarTicketUseCase: AsignarTicketUseCase,
    private readonly crearComentarioUseCase: CrearComentarioUseCase,
    private readonly listarTimelineUseCase: ListarTimelineUseCase,
    @Inject(USUARIO_MASTER_CHECKER) private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly listarTecnicosAsignablesUseCase: ListarTecnicosAsignablesUseCase,
    private readonly asignarYPonerEnProcesoUseCase: AsignarYPonerEnProcesoUseCase,
    private readonly exportarTicketsUseCase: ExportarTicketsUseCase,
    private readonly obtenerCsatTicketUseCase: ObtenerCsatTicketUseCase,
    @Inject(SOLICITANTE_EXTERNO_REPOSITORY)
    private readonly solicitanteExternoRepo: ISolicitanteExternoRepository,
    @Inject(ESTADO_REPOSITORY) private readonly estadoRepo: IEstadoRepository,
  ) {}

  /**
   * Códigos de estado por `estadoId` (el catálogo es fijo y chico): el estado SLA derivado se
   * calcula con el código (`ESTADOS_RELOJ_CORRE`), y el DTO solo conoce el id.
   */
  private async codigosPorEstadoId(): Promise<Map<string, string>> {
    const estados = await this.estadoRepo.findAllActive();
    return new Map(estados.map((e) => [e.id, e.codigo]));
  }

  /**
   * Código del estado o `''` si el catálogo no lo conoce (se registra). La política del estado SLA
   * trata el código desconocido como "corriendo", nunca como resuelto.
   */
  private codigoDeEstado(codigos: Map<string, string>, estadoId: string): string {
    const codigo = codigos.get(estadoId);
    if (codigo === undefined) {
      this.logger.warn(`Estado ${estadoId} fuera del catálogo activo: SLA derivado sin código`);
      return '';
    }
    return codigo;
  }

  /**
   * Resuelve batch (sin N+1) los nombres de `solicitanteId`/`asignadoId` de
   * un lote de tickets y devuelve la proyección `NombresResueltos` de CADA
   * ticket, indexada por `ticket.id` (sdd/beta-frontend item 2).
   */
  private async resolverNombresPorTicket(
    tickets: Pick<
      TicketResponseDto,
      'id' | 'solicitanteId' | 'solicitanteExternoId' | 'asignadoId'
    >[],
  ): Promise<Map<string, NombresResueltos>> {
    const idsUsuarios = new Set<string>();
    const idsExternos = new Set<string>();
    for (const t of tickets) {
      if (t.solicitanteId) {
        idsUsuarios.add(t.solicitanteId);
      }
      if (t.solicitanteExternoId) {
        idsExternos.add(t.solicitanteExternoId);
      }
      if (t.asignadoId) {
        idsUsuarios.add(t.asignadoId);
      }
    }
    const [nombresPorUsuario, nombresExternos] = await Promise.all([
      this.usuarioMasterChecker.resolverNombres([...idsUsuarios]),
      this.solicitanteExternoRepo.findNombres([...idsExternos]),
    ]);

    const porTicket = new Map<string, NombresResueltos>();
    for (const t of tickets) {
      const nombreExterno = t.solicitanteExternoId
        ? nombresExternos.get(t.solicitanteExternoId)
        : undefined;
      porTicket.set(t.id, {
        solicitante: t.solicitanteId ? nombresPorUsuario.get(t.solicitanteId) : undefined,
        solicitanteExterno: nombreExterno === undefined ? undefined : { nombre: nombreExterno },
        asignado: t.asignadoId ? nombresPorUsuario.get(t.asignadoId) : undefined,
      });
    }
    return porTicket;
  }

  /** `toTicketResponseDto` con el código de estado resuelto del catálogo. */
  private async aDto(
    ticket: Parameters<typeof toTicketResponseDto>[0],
    nombres: NombresResueltos | undefined,
    csat?: { puntaje: number; comentario: string | null } | null,
    solicitanteTelefono?: string | null,
  ): Promise<TicketResponseDto> {
    const codigos = await this.codigosPorEstadoId();
    return toTicketResponseDto(
      ticket,
      nombres,
      csat,
      solicitanteTelefono,
      this.codigoDeEstado(codigos, ticket.estadoId),
    );
  }

  /**
   * POST /tickets
   * Crea un ticket nuevo. `solicitanteId`/`autorId` = JWT.sub (T4); el
   * `clienteId` del checker cross-DB es el `cliente_id` del JWT. `anio` lo
   * resuelve el servidor (año en curso), nunca el cliente HTTP.
   * @throws 422 tipoId/prioridadId/ticketReferenciaId inválidos, o solicitante inválido
   * @throws 409 sin ciclo activo, o secuencia agotada
   */
  @Post()
  @RequiereAcciones('TICKETS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketResponseDto> {
    const result = await this.crearTicketUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      tipoId: dto.tipoId,
      prioridadId: dto.prioridadId,
      ticketReferenciaId: dto.ticketReferenciaId ?? null,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticket = result.getValue();
    const nombres = (await this.resolverNombresPorTicket([ticket])).get(ticket.id);
    return this.aDto(ticket, nombres);
  }

  /**
   * GET /tickets
   * Lista tickets del tenant con filtros combinables + paginación (T7). El
   * scope (propios vs. todos) se deriva del permiso `TICKETS:VER_TODOS` del
   * actor — esa celda NO se requiere para poder listar (lista sus propios
   * tickets si no la tiene). `TICKETS:LECTURA` sí se requiere para poder
   * entrar al listado (corrección post-verify, R5).
   */
  @Get()
  @RequiereAcciones('TICKETS:LECTURA')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListTicketsQueryDto,
  ): Promise<ListTicketsResponseDto> {
    // Gate de módulo (5.2 CAPA 2): ROOT y ADMINISTRADOR ven todos los tipos
    // (incl. custom del tenant); el resto sólo los tipos de sus módulos.
    const sinRestriccionModulo = user.is_global_admin || user.rol === 'ADMINISTRADOR';
    const modulosPermitidos = sinRestriccionModulo ? null : user.modulos;

    const result = await this.listarTicketsUseCase.execute({
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      modulosPermitidos,
      pagina: query.pagina,
      porPagina: query.porPagina,
      filtros: {
        estadoId: query.estado,
        tiposIds: query.tipo ? [query.tipo] : undefined,
        prioridadId: query.prioridad,
        asignadoId: query.asignado,
        cicloId: query.ciclo,
        fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : undefined,
        fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : undefined,
        busqueda: query.busqueda,
      },
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { items, total, pagina, porPagina } = result.getValue();
    const nombresPorTicket = await this.resolverNombresPorTicket(items);
    const codigos = await this.codigosPorEstadoId();
    return {
      items: items.map((t) =>
        toTicketResponseDto(
          t,
          nombresPorTicket.get(t.id),
          undefined,
          undefined,
          this.codigoDeEstado(codigos, t.estadoId),
        ),
      ),
      total,
      pagina,
      porPagina,
    };
  }

  /**
   * GET /tickets/export
   * Exporta a CSV el listado completo que producen los filtros recibidos
   * (sdd/exportar-listados-csv) — NO la página visible.
   *
   * **Va declarada ANTES de `GET /tickets/:id`, y el orden es funcional, no
   * de estilo** (design D6): Nest resuelve las rutas en el orden en que se
   * registran, y `:id` es un comodín que también matchea la palabra
   * `export`. Declarada después, esta ruta sería inalcanzable y el pedido
   * caería en `ObtenerTicketUseCase` con `id="export"`, devolviendo un 404
   * desconcertante.
   *
   * Gateada por `TICKETS:LECTURA`, la misma acción que el listado. El scope
   * de FILAS (propios vs. todos) se resuelve DENTRO de `ExportarTicketsUseCase`
   * al componer `ListarTicketsUseCase` — igual que `findAll`, nunca se
   * amplía por exportar en vez de listar.
   *
   * @throws 422 la exportación supera el tope de filas (hay que acotar filtros)
   */
  @Get('export')
  @RequiereAcciones('TICKETS:LECTURA')
  async exportar(
    @CurrentUser() user: JwtPayload,
    @Query() query: ExportarTicketsQueryDto,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
    @Query('formato', ParseFormatoExportPipe) formato: FormatoExport = 'csv',
  ): Promise<string | StreamableFile> {
    const sinRestriccionModulo = user.is_global_admin || user.rol === 'ADMINISTRADOR';
    const modulosPermitidos = sinRestriccionModulo ? null : user.modulos;

    const result = await this.exportarTicketsUseCase.execute(
      {
        actorId: user.sub,
        tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
        modulosPermitidos,
        filtros: {
          estadoId: query.estado,
          tiposIds: query.tipo ? [query.tipo] : undefined,
          prioridadId: query.prioridad,
          asignadoId: query.asignado,
          cicloId: query.ciclo,
          fechaDesde: query.fechaDesde ? new Date(query.fechaDesde) : undefined,
          fechaHasta: query.fechaHasta ? new Date(query.fechaHasta) : undefined,
          busqueda: query.busqueda,
        },
      },
      formato,
    );

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return entregarExport(res, formato, result.getValue());
  }

  /**
   * GET /tickets/:id
   * Consulta un ticket. Sin `TICKETS:VER_TODOS`, solo si el actor es el
   * solicitante — caso contrario 404 (no revela existencia, T6).
   *
   * `csatPuntaje`/`csatComentario` viajan SOLO si el actor tiene
   * `CSAT:LECTURA` (WU9.2, ADR-C5) Y, si es TECNICO, el ticket le está
   * asignado ACTUALMENTE (mismo límite conocido que el KPI del dashboard,
   * ADR-C8) — gateo dentro del payload, sin tocar el decorador de la ruta.
   */
  @Get(':id')
  @RequiereAcciones('TICKETS:LECTURA')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<TicketResponseDto> {
    const result = await this.obtenerTicketUseCase.execute({
      ticketId: id,
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticket = result.getValue();
    const [nombres, csat] = await Promise.all([
      this.resolverNombresPorTicket([ticket]).then((porTicket) => porTicket.get(ticket.id)),
      this.obtenerCsatTicketUseCase.execute({
        ticketId: ticket.id,
        asignadoId: ticket.asignadoId,
        actorId: user.sub,
        actorRol: user.rol,
        tieneCsatLectura: puedeEjecutar(user, ACCION_CSAT_LECTURA),
      }),
    ]);
    // El teléfono del externo viaja solo en el detalle (nunca en el listado).
    const externo = ticket.solicitanteExternoId
      ? await this.solicitanteExternoRepo.findById(ticket.solicitanteExternoId)
      : null;
    return this.aDto(ticket, nombres, csat, externo?.telefono ?? null);
  }

  /**
   * PATCH /tickets/:id
   * Edita titulo/descripcion/prioridadId. El `estado` NUNCA se cambia por
   * esta vía (T9, endpoint dedicado en PR7). Regla de bloqueo por estado: una
   * vez que el ticket entra EN_PROCESO (o posterior), SOLO ROOT
   * (`is_global_admin`) puede editar; en NUEVO/ASIGNADO edita cualquier
   * TECNICO+ (`TICKETS:MODIFICACION`).
   * @throws 403 sin `TICKETS:MODIFICACION` (AccionesGuard), o ticket EN_PROCESO+
   *             editado por un no-ROOT (`TicketBloqueadoParaEdicionError`)
   * @throws 404 ticket inexistente/otro tenant
   * @throws 422 prioridadId inexistente en el catálogo
   */
  @Patch(':id')
  @RequiereAcciones('TICKETS:MODIFICACION')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EditTicketDto,
  ): Promise<TicketResponseDto> {
    const result = await this.editarTicketUseCase.execute({
      ticketId: id,
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      prioridadId: dto.prioridadId,
      // ROOT edita SIEMPRE, incluso con el ticket EN_PROCESO o posterior.
      actorEsRoot: user.is_global_admin,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticketEditado = result.getValue();
    const nombresEditado = (await this.resolverNombresPorTicket([ticketEditado])).get(
      ticketEditado.id,
    );
    return this.aDto(ticketEditado, nombresEditado);
  }

  /**
   * PATCH /tickets/:id/estado
   * Transiciona el estado del ticket (T9, T10, T12, T13). SOLO TECNICO+
   * (`TICKETS:TRANSICIONAR`) — USUARIO/COLABORADOR reciben 403
   * (`AccionesGuard`). El evento `TicketEstadoCambiado` se emite
   * internamente en el use case cuando el destino es notificable.
   *
   * Salto correctivo: ROOT (`is_global_admin`) y ADMINISTRADOR del cliente
   * pueden ADEMÁS mover el ticket a cualquier estado NO terminal salteando el
   * grafo (volver atrás/corregir, incluso reabrir desde CERRADO/CANCELADO).
   * Para LLEGAR a un estado terminal se usan los arcos normales.
   * @throws 403 sin `ticket:transicionar`
   * @throws 404 ticket inexistente/otro tenant
   * @throws 422 `nuevoEstadoCodigo` inexistente en el catálogo, o transición
   *             inválida (arco no válido y sin salto correctivo aplicable)
   */
  @Patch(':id/estado')
  @RequiereAcciones('TICKETS:TRANSICIONAR')
  async transicionarEstado(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: TransitionTicketStateDto,
  ): Promise<TicketResponseDto> {
    const result = await this.transicionarEstadoUseCase.execute({
      ticketId: id,
      nuevoEstadoCodigo: dto.nuevoEstadoCodigo,
      autorId: user.sub,
      // Salto correctivo: ROOT (flag ortogonal) o ADMINISTRADOR del cliente
      // pueden mover el ticket a cualquier estado NO terminal salteando el grafo.
      actorEsCorrector: user.is_global_admin || user.rol === 'ADMINISTRADOR',
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticketTransicionado = result.getValue();
    const nombresTransicionado = (await this.resolverNombresPorTicket([ticketTransicionado])).get(
      ticketTransicionado.id,
    );
    return this.aDto(ticketTransicionado, nombresTransicionado);
  }

  /**
   * PATCH /tickets/:id/asignar
   * Asignación manual de un responsable (T14, T15). `asignadoId` puede ser
   * el propio actor ("tomar" el ticket) o un tercero — ambos son
   * asignación MANUAL. Un ticket nacido por regla de tipo se reasigna igual que
   * cualquier otro. Un ticket NUEVO pasa a ASIGNADO; uno CERRADO/CANCELADO no se
   * reasigna. Requiere `ticket:asignar`. El `asignadoId` debe existir/estar activo en el
   * tenant (cross-DB) y ser elegible para el `tipoId` del ticket
   * (elegibilidad por el módulo del catálogo del tipo) — la elegibilidad es
   * ortogonal al permiso del actor (T15).
   * @throws 403 sin `ticket:asignar`
   * @throws 404 ticket inexistente/otro tenant
   * @throws 422 asignado inválido (`AsignadoInvalidoError`) o no elegible (`AsignadoNoElegibleError`),
   *             o ticket CERRADO/CANCELADO (`TicketCerradoNoReasignableError`)
   */
  @Patch(':id/asignar')
  @RequiereAcciones('TICKETS:ASIGNAR')
  async asignar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AsignarTicketDto,
  ): Promise<TicketResponseDto> {
    const result = await this.asignarTicketUseCase.execute({
      ticketId: id,
      asignadoId: dto.asignadoId,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticketAsignado = result.getValue();
    const nombresAsignado = (await this.resolverNombresPorTicket([ticketAsignado])).get(
      ticketAsignado.id,
    );
    return this.aDto(ticketAsignado, nombresAsignado);
  }

  /**
   * GET /tickets/:id/asignables
   * Lista los AGENTES elegibles para atender el ticket (combo del control
   * unificado "Asignar y poner en proceso"). Elegibilidad por módulo del tipo
   * del ticket: usuarios activos con membresía TECNICO o COLABORADOR (ambos
   * cumplen funciones de técnico) en el tenant y el módulo asignado. Un tipo
   * custom (sin módulo) devuelve `[]`.
   * Requiere `ticket:asignar`. `clienteId` = `cliente_id` del JWT.
   * @throws 403 sin `ticket:asignar`
   * @throws 404 ticket inexistente/otro tenant
   */
  @Get(':id/asignables')
  @RequiereAcciones('TICKETS:ASIGNAR')
  async asignables(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<TecnicoAsignable[]> {
    const result = await this.listarTecnicosAsignablesUseCase.execute({
      ticketId: id,
      clienteId: user.cliente_id as string,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * PATCH /tickets/:id/asignar-en-proceso
   * Asigna un técnico Y avanza el ticket hasta EN_PROCESO en una sola acción
   * atómica (rediseño de la asignación). Recorre los arcos válidos desde el
   * estado actual (NUEVO→ASIGNADO→EN_PROCESO). Requiere AMBOS permisos
   * `ticket:asignar` y `ticket:transicionar`. `asignadoId` en el body;
   * `clienteId`/`autorId` del JWT.
   * @throws 403 sin `ticket:asignar` o `ticket:transicionar`
   * @throws 404 ticket inexistente/otro tenant
   * @throws 422 asignado inválido/no elegible, o el estado actual no puede
   *             llegar a EN_PROCESO (RESUELTO/CERRADO/CANCELADO)
   */
  @Patch(':id/asignar-en-proceso')
  @RequiereAcciones('TICKETS:ASIGNAR', 'TICKETS:TRANSICIONAR')
  async asignarEnProceso(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AsignarTicketDto,
  ): Promise<TicketResponseDto> {
    const result = await this.asignarYPonerEnProcesoUseCase.execute({
      ticketId: id,
      asignadoId: dto.asignadoId,
      autorId: user.sub,
      clienteId: user.cliente_id as string,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const ticketEnProceso = result.getValue();
    const nombresEnProceso = (await this.resolverNombresPorTicket([ticketEnProceso])).get(
      ticketEnProceso.id,
    );
    return this.aDto(ticketEnProceso, nombresEnProceso);
  }

  /**
   * POST /tickets/:id/comentarios
   * Crea un comentario público o interno en el timeline del ticket (T16,
   * T17). Requiere `TICKETS:COMENTAR` (base, USUARIO+). `esInterno=true`
   * (T17) exige ADEMÁS `TICKETS:OBSERVAR` (TECNICO+) — chequeo condicional
   * al `body`, no expresable con el `@RequiereAcciones` estático de
   * `AccionesGuard` (metadata fija por ruta) — mismo criterio que el
   * scope de `TICKETS:VER_TODOS` resuelto inline en `findAll`/`findOne`.
   * @throws 403 sin `TICKETS:COMENTAR`, o `esInterno=true` sin `TICKETS:OBSERVAR`
   * @throws 404 ticket inexistente/otro tenant
   * @throws 422 ticket en estado terminal (solo comentarios públicos, T16)
   */
  @Post(':id/comentarios')
  @RequiereAcciones('TICKETS:COMENTAR')
  @HttpCode(HttpStatus.CREATED)
  async comentar(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateComentarioDto,
  ): Promise<OperacionResponseDto> {
    const esInterno = dto.esInterno ?? false;
    if (esInterno && !puedeEjecutar(user, ACCION_OBSERVAR)) {
      throw new ForbiddenException(
        `Acceso denegado: se requiere la acción "${ACCION_OBSERVAR}" para crear un comentario interno.`,
      );
    }

    const result = await this.crearComentarioUseCase.execute({
      ticketId: id,
      texto: dto.texto,
      autorId: user.sub,
      esInterno,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toOperacionResponseDto(result.getValue());
  }

  /**
   * GET /tickets/:id/timeline
   * Lista el timeline tipado del ticket (cambios de estado, comentarios,
   * asignaciones, adjuntos) en orden cronológico (T18). Mismo scope de
   * acceso que `GET /tickets/:id` (T6: `ticket:ver_todos` o solicitante,
   * caso contrario 404). Sin `ticket:observar` excluye las operaciones
   * `es_interno=true` del resultado — NUNCA visibles al solicitante/USUARIO.
   */
  @Get(':id/timeline')
  @RequiereAcciones('TICKETS:LECTURA')
  async timeline(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<OperacionResponseDto[]> {
    const result = await this.listarTimelineUseCase.execute({
      ticketId: id,
      actorId: user.sub,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      tienePermisoObservar: puedeEjecutar(user, ACCION_OBSERVAR),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue().map(toOperacionResponseDto);
  }
}
