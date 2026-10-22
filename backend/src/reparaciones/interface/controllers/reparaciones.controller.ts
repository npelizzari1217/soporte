/**
 * ReparacionesController — entry point HTTP del módulo `reparaciones/`
 * (F3-E1, F3-E3, F3-E4, F3-E5).
 *
 * Rutas (entre corchetes, lo que exige el caso de uso sobre el tipo del ticket base, D5 c):
 *   POST   /reparaciones                                    → CrearTicketEdilicioUseCase [ALTAS sobre el tipo resultante]
 *   GET    /reparaciones                                    → ListarReparacionesUseCase  [tipos con LECTURA; fila sin VER_TODOS]
 *   GET    /reparaciones/export                              → ExportarReparacionesUseCase [mismo alcance que el listado]
 *   PATCH  /reparaciones/:reparacionId                       → EditarReparacionUseCase    [MODIFICACION]
 *   POST   /reparaciones/:reparacionId/comentarios           → CrearComentarioReparacionUseCase    [ALTAS o COMENTAR]
 *   GET    /reparaciones/:reparacionId/comentarios           → ListarComentariosReparacionUseCase  [LECTURA]
 *   POST   /reparaciones/:reparacionId/compras                → VincularCompraAReparacionUseCase   [ALTAS] + ruta COMPRAS:LECTURA
 *   DELETE /reparaciones/:reparacionId/compras/:compraId       → DesvincularCompraDeReparacionUseCase [LECTURA] + ruta EDILICIA:BORRADO
 *
 * Las celdas `EDILICIA:*` de la matriz dejaron de decidir las operaciones sobre
 * tickets (odd/permisos-por-tipo-ticket, D5 d): cada caso de uso exige su acción
 * sobre el tipo del ticket base (403 si falta) y responde 404 si el actor no lo
 * ve. Quedan dos `@RequiereAcciones`, ambos de permisos que no son por tipo:
 * `COMPRAS:LECTURA` al vincular, porque el selector del diálogo consume
 * `GET /compras` (decisión de producto #2435: un cliente HTTP directo sin esa
 * celda recibe 403), y `EDILICIA:BORRADO` al desvincular, que sigue siendo un
 * permiso del módulo (L21). Desvincular no repite `COMPRAS:LECTURA`: el `numero`
 * que ve quien desvincula sale de `comprasQueBloquean[]` en `GET /reparaciones`.
 *
 * `:reparacionId` = id del satélite `ticket_edilicia` (mismo criterio que
 * `:compraId` en `ComprasController`).
 *
 * Subtareas (odd/tareas-con-tecnico): son las tareas del ticket base y se
 * gestionan en `/tickets/:id/tareas`. T8 retiró las rutas viejas
 * `/reparaciones/.../subtareas`; `GET /reparaciones` las sigue embebiendo.
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario). Los permisos por
 * tipo del actor los carga `CargadorAlcanceTicket` por request.
 *
 * Tarea: T8.6, T9.6.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  TipoTicketNoPermitidoEnAltaError,
  SectorTicketInexistenteError,
  SinCicloActivoError,
  SecuenciaAgotadaError,
  TicketNoEncontradoError,
  AccionSobreTipoNoPermitidaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';

import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from '../../../tickets/domain/ports/i-usuario-master.checker';

import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from '../../application/use-cases/listar-reparaciones.use-case';
import { CrearComentarioReparacionUseCase } from '../../application/use-cases/crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from '../../application/use-cases/listar-comentarios-reparacion.use-case';
import { ExportarReparacionesUseCase } from '../../application/use-cases/exportar-reparaciones.use-case';
import { VincularCompraAReparacionUseCase } from '../../application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from '../../application/use-cases/desvincular-compra-de-reparacion.use-case';
import { EditarReparacionUseCase } from '../../application/use-cases/editar-reparacion.use-case';

import {
  TicketEdiliciaNoEncontradoError,
  ExportacionDemasiadoGrandeError,
  CompraNoEncontradaError,
  VinculoNoEncontradoError,
  ReparacionNoEditableError,
  ComentarioReparacionNoPermitidoError,
} from '../../domain/errors/reparaciones.errors';

import {
  ComentarioReparacionResponseDto,
  CreateComentarioReparacionHttpDto,
  CreateTicketEdilicioHttpDto,
  ListReparacionesQueryDto,
  ListReparacionesResponseDto,
  TicketEdiliciaConTicketResponseDto,
  VincularCompraHttpDto,
  EditarReparacionHttpDto,
  toComentarioReparacionResponseDto,
  toReparacionListItemResponseDto,
  toTicketEdiliciaResponseDto,
} from '../dtos/reparaciones.dto';

/** Tamaño de página por defecto del listado, el mismo que `GET /tickets`. */
const POR_PAGINA_DEFAULT = 20;

/**
 * Mapea un `DomainError` de los use cases de reparaciones a la
 * `HttpException` correspondiente.
 *
 * `export` (antes privada): el catálogo de errores de exportación
 * (sdd/exportar-listados-csv, decisión D2) se prueba por reflexión sobre
 * `reparaciones.errors.ts` en `reparaciones.controller.spec.ts`, igual que
 * `equipos.controller.spec.ts`/`tickets.controller.spec.ts` — hace falta
 * poder importar esta función desde el spec.
 */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException | ForbiddenException {
  // odd/permisos-por-tipo-ticket (D5 c): ve la reparación pero le falta la acción sobre el tipo.
  if (error instanceof AccionSobreTipoNoPermitidaError) {
    return new ForbiddenException(error.message);
  }
  if (
    error instanceof TicketNoEncontradoError ||
    error instanceof TicketEdiliciaNoEncontradoError ||
    // Vínculo reparación-compra (sdd/reparacion-bloqueada-por-compra, WU1):
    // los casos de uso de vincular/desvincular (WU5) todavía no existen, pero
    // el catálogo cerrado de errores del módulo exige que TODO error
    // exportado por `reparaciones.errors.ts` tenga mapeo acá — dejarlos sin
    // mapear rompería el fitness test de este mismo archivo.
    error instanceof CompraNoEncontradaError ||
    error instanceof VinculoNoEncontradoError
  ) {
    return new NotFoundException(error.message);
  }
  if (error instanceof SinCicloActivoError || error instanceof SecuenciaAgotadaError) {
    return new ConflictException(error.message);
  }
  if (
    error instanceof SolicitanteInvalidoError ||
    // odd/ubicacion-sector-ticket: sector del alta inexistente.
    error instanceof SectorTicketInexistenteError ||
    // odd/tasks/tipos-ticket-por-modulo.md (S2): tipo elegido inexistente, inactivo o no admitido.
    error instanceof TipoTicketNoEncontradoError ||
    error instanceof TipoTicketNoPermitidoEnAltaError ||
    // Exportación a CSV (sdd/exportar-listados-csv, decisión D2): cae igual
    // en 422 por el default, pero se lista explícito como los demás — el
    // default existe para el error que NADIE mapeó, no para ahorrarse una
    // línea en uno conocido.
    error instanceof ExportacionDemasiadoGrandeError ||
    // odd/detalle-ticket-legible (S5): la reparación ya se empezó a trabajar o está bloqueada.
    error instanceof ReparacionNoEditableError ||
    error instanceof ComentarioReparacionNoPermitidoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

/**
 * Lo único que este controller necesita de la respuesta HTTP para entregar
 * una descarga: poder escribir headers.
 *
 * Se declara acá en vez de importar `Response` de `express` a propósito
 * (mismo criterio que `EquiposController`/`TicketsController`,
 * sdd/exportar-listados-csv): el tipo completo traería `@types/express`
 * como dependencia nueva, y este proyecto tiene un motivo concreto para no
 * tocar el lockfile sin necesidad (el deploy aborta cuando cambia). Tipar
 * exactamente lo que se usa deja el mismo chequeo estricto sin arrastrar nada.
 */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('reparaciones')
export class ReparacionesController {
  constructor(
    private readonly crearTicketEdilicioUseCase: CrearTicketEdilicioUseCase,
    private readonly listarReparacionesUseCase: ListarReparacionesUseCase,
    private readonly crearComentarioUseCase: CrearComentarioReparacionUseCase,
    private readonly listarComentariosUseCase: ListarComentariosReparacionUseCase,
    @Inject(USUARIO_MASTER_CHECKER) private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    // Agregado al final (no reordena los anteriores) — mismo criterio que
    // `EquiposController.exportarEquiposUseCase`: evita reindexar los tests
    // existentes que instancian el controller con args posicionales.
    private readonly exportarReparacionesUseCase: ExportarReparacionesUseCase,
    // WU5 (sdd/reparacion-bloqueada-por-compra) — mismo criterio, al final.
    private readonly vincularCompraUseCase: VincularCompraAReparacionUseCase,
    private readonly desvincularCompraUseCase: DesvincularCompraDeReparacionUseCase,
    // odd/detalle-ticket-legible — mismo criterio, al final.
    private readonly editarReparacionUseCase: EditarReparacionUseCase,
    // odd/permisos-por-tipo-ticket (D5 a) — mismo criterio, al final.
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /**
   * POST /reparaciones
   * Crea un ticket edilicio (ticket base + satélite `ticket_edilicia`, ADR-3).
   * `solicitanteId`/`autorId` = JWT.sub; `anio` lo resuelve el servidor.
   * @throws 403 sin `ALTAS` sobre el tipo resultante (el elegido o EDILICIA)
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante inválido
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateTicketEdilicioHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketEdiliciaConTicketResponseDto> {
    const result = await this.crearTicketEdilicioUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      prioridadId: dto.prioridadId,
      tipoId: dto.tipoId ?? null,
      ubicacion: dto.ubicacion ?? null,
      sectorId: dto.sectorId ?? null,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketEdilicia, sectorNombre } = result.getValue();
    return toTicketEdiliciaResponseDto(ticket, ticketEdilicia, sectorNombre);
  }

  /**
   * GET /reparaciones
   * Una página de los tickets edilicios que el actor ve (ticket base + satélite +
   * ubicación), la más reciente primero (odd/reparaciones-paginadas). Solo tipos
   * con `LECTURA`; sin `VER_TODOS` sobre el tipo, la regla de fila
   * (odd/permisos-por-tipo-ticket, D5 e).
   *
   * @param query `pagina` (default 1), `porPagina` (default 20, máx. 100) y
   *   `bloqueo` (default `TODAS`).
   * @returns La página y su metadata, con la forma de `GET /tickets`.
   */
  @Get()
  async listar(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListReparacionesQueryDto,
  ): Promise<ListReparacionesResponseDto> {
    const result = await this.listarReparacionesUseCase.executePaginado({
      pagina: query.pagina ?? 1,
      porPagina: query.porPagina ?? POR_PAGINA_DEFAULT,
      bloqueo: query.bloqueo ?? 'TODAS',
      alcance: await this.alcances.cargar(user),
    });
    const pagina = result.getValue();
    return { ...pagina, items: pagina.items.map(toReparacionListItemResponseDto) };
  }

  /**
   * GET /reparaciones/export
   * Exporta a CSV el listado COMPLETO de reparaciones edilicias que el actor ve
   * (sdd/exportar-listados-csv; mismo alcance que el listado, D5 e) — sin filtros, por diseño (spec, capability
   * exportacion-reparaciones): cualquier query string que llegue se ignora.
   *
   * **Reparaciones NO tiene hoy ninguna ruta `GET /reparaciones/:id`** (a
   * diferencia de equipos/tickets), así que esta ruta podría declararse en
   * cualquier posición sin ambigüedad de matching (design D6). Se declara
   * de todos modos justo después de `GET /reparaciones`, mismo criterio de
   * legibilidad que las demás — y para que si el día de mañana se agrega un
   * `GET /reparaciones/:reparacionId` de detalle, quien lo escriba lo
   * declare DESPUÉS de esta, nunca antes (Nest matchea rutas en el orden de
   * declaración, y `:reparacionId` también matchearía la palabra literal
   * `export`).
   *
   * Mismo alcance por tipo que el listado.
   *
   * @throws 422 la exportación supera el tope de filas (no hay filtros que acotar)
   */
  @Get('export')
  async exportar(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
    @Query('formato', ParseFormatoExportPipe) formato: FormatoExport = 'csv',
  ): Promise<string | StreamableFile> {
    const result = await this.exportarReparacionesUseCase.execute(
      await this.alcances.cargar(user),
      formato,
    );

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return entregarExport(res, formato, result.getValue());
  }

  /**
   * POST /reparaciones/:reparacionId/comentarios
   * Asienta una nota sobre la reparación (ej. por qué se está demorando).
   * `autorId` viene del JWT. Exige `ALTAS` o `COMENTAR` sobre el tipo del
   * ticket base (odd/permisos-por-tipo-ticket, D5 c).
   * @throws 403 sin `ALTAS` ni `COMENTAR` sobre el tipo
   * @throws 404 ticket_edilicia inexistente o que el actor no ve
   */
  /**
   * PATCH /reparaciones/:reparacionId
   * Edita una reparación que todavía no se empezó a trabajar (odd/detalle-ticket-legible, S4-S5):
   * título, descripción, prioridad y sector del ticket base, y la ubicación propia de Edilicia. ROOT
   * salta la regla de "no empezada"; el bloqueo por compra no lo salta nadie. Declarada después de
   * `GET /reparaciones/export` por el orden de matching de Nest.
   *
   * @throws 403 sin `MODIFICACION` sobre el tipo del ticket base
   * @throws 404 reparación o ticket inexistente, o que el actor no ve
   * @throws 422 ya en proceso, con tareas completadas, bloqueada, prioridad o sector inexistente
   */
  @Patch(':reparacionId')
  async editar(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: EditarReparacionHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketEdiliciaConTicketResponseDto> {
    const result = await this.editarReparacionUseCase.execute({
      reparacionId,
      titulo: dto.titulo,
      descripcion: dto.descripcion,
      prioridadId: dto.prioridadId,
      ubicacion: dto.ubicacion,
      sectorId: dto.sectorId,
      actorEsRoot: user.is_global_admin === true,
      alcance: await this.alcances.cargar(user),
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketEdilicia, sectorNombre } = result.getValue();
    return toTicketEdiliciaResponseDto(ticket, ticketEdilicia, sectorNombre);
  }

  @Post(':reparacionId/comentarios')
  @HttpCode(HttpStatus.CREATED)
  async crearComentario(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: CreateComentarioReparacionHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ComentarioReparacionResponseDto> {
    const result = await this.crearComentarioUseCase.execute({
      ticketEdiliciaId: reparacionId,
      texto: dto.texto,
      autorId: user.sub,
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    const comentario = result.getValue();
    const nombres = await this.usuarioMasterChecker.resolverNombres([comentario.autorId]);
    return toComentarioReparacionResponseDto(comentario, nombres.get(comentario.autorId));
  }

  /**
   * GET /reparaciones/:reparacionId/comentarios
   * Lista los comentarios de la reparación, MÁS NUEVO PRIMERO.
   *
   * Exige ver el ticket base (`LECTURA` sobre su tipo y regla de fila,
   * odd/permisos-por-tipo-ticket D5 b): leer es leer. Los comentarios no tienen
   * flag de visibilidad (a diferencia de `operaciones_ticket.es_interno`): quien
   * puede ver la reparación, los ve.
   *
   * Los nombres de los autores se resuelven en UN batch cross-DB
   * (`resolverNombres`, sin N+1) — `autor_id` es soft ref a `master.usuarios`
   * y no hay JOIN posible entre las dos bases.
   * @throws 404 ticket_edilicia inexistente o que el actor no ve
   */
  @Get(':reparacionId/comentarios')
  async listarComentarios(
    @Param('reparacionId') reparacionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ComentarioReparacionResponseDto[]> {
    const result = await this.listarComentariosUseCase.execute(
      reparacionId,
      await this.alcances.cargar(user),
    );

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }

    const comentarios = result.getValue();
    const nombres = await this.usuarioMasterChecker.resolverNombres([
      ...new Set(comentarios.map((c) => c.autorId)),
    ]);
    return comentarios.map((c) => toComentarioReparacionResponseDto(c, nombres.get(c.autorId)));
  }

  /**
   * POST /reparaciones/:reparacionId/compras
   * Vincula una compra existente del tenant a la reparación (WU5,
   * sdd/reparacion-bloqueada-por-compra).
   *
   * IDEMPOTENTE (D4): vincular el mismo par dos veces no crea una segunda
   * fila ni falla.
   *
   * `@RequiereAcciones('COMPRAS:LECTURA')` (decisión de producto #2435,
   * WU5.9): el selector de compras consume `GET /compras`, y el candado vive
   * acá, en el `AccionesGuard` del backend, no en que el frontend esconda el
   * selector. `ALTAS` sobre el tipo del ticket base lo exige el caso de uso
   * (odd/permisos-por-tipo-ticket, D5 c; antes era la celda `EDILICIA:ALTAS`).
   * @throws 403 sin `COMPRAS:LECTURA`, o sin `ALTAS` sobre el tipo
   * @throws 404 reparación o compra inexistente, o reparación que el actor no ve
   */
  @Post(':reparacionId/compras')
  @RequiereAcciones('COMPRAS:LECTURA')
  @HttpCode(HttpStatus.CREATED)
  async vincularCompra(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: VincularCompraHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.vincularCompraUseCase.execute({
      ticketEdiliciaId: reparacionId,
      compraId: dto.compraId,
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * DELETE /reparaciones/:reparacionId/compras/:compraId
   * Desvincula (HARD DELETE real, D5) una compra de la reparación.
   *
   * `EDILICIA:BORRADO` sigue siendo permiso del módulo (L21), sin acción por
   * tipo; el caso de uso exige además ver el ticket base (D5 b). Sin
   * `COMPRAS:LECTURA`: el `numero` que ve quien desvincula sale de
   * `comprasQueBloquean[]` en `GET /reparaciones`, no de `GET /compras`. No
   * navega el universo de compras, opera sobre un vínculo que ya es visible.
   * @throws 404 vínculo inexistente, o reparación que el actor no ve
   */
  @Delete(':reparacionId/compras/:compraId')
  @RequiereAcciones('EDILICIA:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desvincularCompra(
    @Param('reparacionId') reparacionId: string,
    @Param('compraId') compraId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.desvincularCompraUseCase.execute({
      ticketEdiliciaId: reparacionId,
      compraId,
      alcance: await this.alcances.cargar(user),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
