/**
 * ReparacionesController — entry point HTTP del módulo `reparaciones/`
 * (F3-E1, F3-E3, F3-E4, F3-E5).
 *
 * Rutas:
 *   POST   /reparaciones                                    → CrearTicketEdilicioUseCase [ticket:crear]
 *   GET    /reparaciones                                    → ListarReparacionesUseCase  (autenticado)
 *   GET    /reparaciones/export                              → ExportarReparacionesUseCase (`EDILICIA:LECTURA`, sdd/exportar-listados-csv)
 *   POST   /reparaciones/:reparacionId/subtareas             → CrearSubtareaUseCase       [subtarea:actualizar]
 *   POST   /reparaciones/subtareas/:subtareaId/completar     → CompletarSubtareaUseCase   [subtarea:actualizar]
 *   DELETE /reparaciones/subtareas/:subtareaId               → EliminarSubtareaUseCase    [subtarea:actualizar]
 *   POST   /reparaciones/:reparacionId/comentarios           → CrearComentarioReparacionUseCase    [EDILICIA:ALTAS]
 *   GET    /reparaciones/:reparacionId/comentarios           → ListarComentariosReparacionUseCase  [EDILICIA:LECTURA]
 *   POST   /reparaciones/:reparacionId/compras                → VincularCompraAReparacionUseCase   [EDILICIA:ALTAS + COMPRAS:LECTURA]
 *   DELETE /reparaciones/:reparacionId/compras/:compraId       → DesvincularCompraDeReparacionUseCase [EDILICIA:BORRADO]
 *
 * Vincular una compra exige DOS acciones (decisión de producto #2435,
 * sdd/reparacion-bloqueada-por-compra WU5): el selector del diálogo del
 * frontend consume `GET /compras` (`COMPRAS:LECTURA`), y esa exigencia se
 * sostiene acá en el `AccionesGuard` — no solo en que la interfaz esconda el
 * selector. Un cliente HTTP directo con `EDILICIA:ALTAS` y sin
 * `COMPRAS:LECTURA` recibe 403. Desvincular NO repite el segundo permiso:
 * el `numero` que ve quien desvincula sale de `comprasQueBloquean[]` en
 * `GET /reparaciones` (`EDILICIA:LECTURA`), no de `GET /compras`.
 *
 * `:reparacionId` = id del satélite `ticket_edilicia` (mismo criterio que
 * `:compraId` en `ComprasController`). Las rutas de subtareas usan
 * `:subtareaId` directamente (sin anidar bajo `:reparacionId`) porque
 * `CompletarSubtareaUseCase`/`EliminarSubtareaUseCase` resuelven el
 * `ticket_edilicia` internamente a partir de la subtarea.
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario — reemplaza a
 * `PermissionsGuard`+`ModulosGuard`+`@RequireModulo('EDILICIA')` de clase).
 * `GET /reparaciones` declara `@RequiereAcciones('EDILICIA:LECTURA')`
 * (reemplaza el gate de módulo puro de hoy, R7).
 *
 * Tarea: T8.6, T9.6.
 */
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
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
  SinCicloActivoError,
  SecuenciaAgotadaError,
  TicketNoEncontradoError,
} from '../../../tickets/domain/errors/tickets.errors';

import {
  USUARIO_MASTER_CHECKER,
  IUsuarioMasterChecker,
} from '../../../tickets/domain/ports/i-usuario-master.checker';

import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import { ListarReparacionesUseCase } from '../../application/use-cases/listar-reparaciones.use-case';
import { CrearSubtareaUseCase } from '../../application/use-cases/crear-subtarea.use-case';
import { CompletarSubtareaUseCase } from '../../application/use-cases/completar-subtarea.use-case';
import { EliminarSubtareaUseCase } from '../../application/use-cases/eliminar-subtarea.use-case';
import { CrearComentarioReparacionUseCase } from '../../application/use-cases/crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from '../../application/use-cases/listar-comentarios-reparacion.use-case';
import { ExportarReparacionesUseCase } from '../../application/use-cases/exportar-reparaciones.use-case';
import { VincularCompraAReparacionUseCase } from '../../application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from '../../application/use-cases/desvincular-compra-de-reparacion.use-case';

import {
  TicketEdiliciaNoEncontradoError,
  SubtareaNoEncontradaError,
  ExportacionDemasiadoGrandeError,
  CompraNoEncontradaError,
  VinculoNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';

import {
  ComentarioReparacionResponseDto,
  CreateComentarioReparacionHttpDto,
  CreateSubtareaHttpDto,
  CreateTicketEdilicioHttpDto,
  ReparacionListItemResponseDto,
  SubtareaEdiliciaResponseDto,
  TicketEdiliciaConTicketResponseDto,
  VincularCompraHttpDto,
  toComentarioReparacionResponseDto,
  toReparacionListItemResponseDto,
  toSubtareaEdiliciaResponseDto,
  toTicketEdiliciaResponseDto,
} from '../dtos/reparaciones.dto';

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
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (
    error instanceof TicketNoEncontradoError ||
    error instanceof TicketEdiliciaNoEncontradoError ||
    error instanceof SubtareaNoEncontradaError ||
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
    // Exportación a CSV (sdd/exportar-listados-csv, decisión D2): cae igual
    // en 422 por el default, pero se lista explícito como los demás — el
    // default existe para el error que NADIE mapeó, no para ahorrarse una
    // línea en uno conocido.
    error instanceof ExportacionDemasiadoGrandeError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  // Deviación de diseño no mapeada explícitamente: 422 por defecto (nunca
  // 500 silencioso para un DomainError, que por definición es un fallo esperado).
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
    private readonly crearSubtareaUseCase: CrearSubtareaUseCase,
    private readonly completarSubtareaUseCase: CompletarSubtareaUseCase,
    private readonly eliminarSubtareaUseCase: EliminarSubtareaUseCase,
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
  ) {}

  /**
   * POST /reparaciones
   * Crea un ticket edilicio (ticket base + satélite `ticket_edilicia`, ADR-3).
   * `solicitanteId`/`autorId` = JWT.sub; `anio` lo resuelve el servidor.
   * @throws 409 sin ciclo activo
   * @throws 422 solicitante inválido
   */
  @Post()
  @RequiereAcciones('EDILICIA:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @Body() dto: CreateTicketEdilicioHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TicketEdiliciaConTicketResponseDto> {
    const result = await this.crearTicketEdilicioUseCase.execute({
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? null,
      prioridadId: dto.prioridadId,
      ubicacion: dto.ubicacion ?? null,
      solicitanteId: user.sub,
      clienteId: user.cliente_id as string,
      autorId: user.sub,
      anio: new Date().getFullYear(),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { ticket, ticketEdilicia } = result.getValue();
    return toTicketEdiliciaResponseDto(ticket, ticketEdilicia);
  }

  /**
   * GET /reparaciones
   * Lista los tickets edilicios del tenant (ticket base + satélite + ubicación).
   */
  @Get()
  @RequiereAcciones('EDILICIA:LECTURA')
  async listar(): Promise<ReparacionListItemResponseDto[]> {
    const result = await this.listarReparacionesUseCase.execute();
    return result.getValue().map(toReparacionListItemResponseDto);
  }

  /**
   * GET /reparaciones/export
   * Exporta a CSV el listado COMPLETO de reparaciones edilicias del tenant
   * (sdd/exportar-listados-csv) — sin filtros, por diseño (spec, capability
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
   * Gateada por `EDILICIA:LECTURA`, la misma acción que el listado.
   *
   * @throws 422 la exportación supera el tope de filas (no hay filtros que acotar)
   */
  @Get('export')
  @RequiereAcciones('EDILICIA:LECTURA')
  async exportar(
    @Res({ passthrough: true }) res: RespuestaConHeaders,
    @Query('formato', ParseFormatoExportPipe) formato: FormatoExport = 'csv',
  ): Promise<string | StreamableFile> {
    const result = await this.exportarReparacionesUseCase.execute(formato);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return entregarExport(res, formato, result.getValue());
  }

  /**
   * POST /reparaciones/:reparacionId/subtareas
   * Agrega una subtarea al checklist de avance (F3-E3).
   * @throws 404 ticket_edilicia inexistente
   */
  @Post(':reparacionId/subtareas')
  @RequiereAcciones('EDILICIA:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crearSubtarea(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: CreateSubtareaHttpDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.crearSubtareaUseCase.execute({
      ticketEdiliciaId: reparacionId,
      descripcion: dto.descripcion,
      orden: dto.orden,
      autorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSubtareaEdiliciaResponseDto(result.getValue());
  }

  /**
   * POST /reparaciones/subtareas/:subtareaId/completar
   * Marca la subtarea como completada (F3-E4). `completadaPorId` viene del JWT.
   * @throws 404 subtarea inexistente
   */
  @Post('subtareas/:subtareaId/completar')
  @RequiereAcciones('EDILICIA:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async completarSubtarea(
    @Param('subtareaId') subtareaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubtareaEdiliciaResponseDto> {
    const result = await this.completarSubtareaUseCase.execute({
      subtareaId,
      completadaPorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSubtareaEdiliciaResponseDto(result.getValue());
  }

  /**
   * DELETE /reparaciones/subtareas/:subtareaId
   * Baja lógica (soft delete) de una subtarea (F3-E5).
   * @throws 404 subtarea inexistente
   */
  @Delete('subtareas/:subtareaId')
  @RequiereAcciones('EDILICIA:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarSubtarea(
    @Param('subtareaId') subtareaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const result = await this.eliminarSubtareaUseCase.execute({ subtareaId, autorId: user.sub });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * POST /reparaciones/:reparacionId/comentarios
   * Asienta una nota sobre la reparación (ej. por qué se está demorando).
   * `autorId` viene del JWT. Reusa `EDILICIA:ALTAS` — es el mismo permiso que
   * agregar una subtarea: sumar información al expediente de la reparación.
   * @throws 404 ticket_edilicia inexistente
   */
  @Post(':reparacionId/comentarios')
  @RequiereAcciones('EDILICIA:ALTAS')
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
   * `EDILICIA:LECTURA` y no `EDILICIA:ALTAS`: leer es leer — es el mismo gate
   * que `GET /reparaciones`, que ya expone la reparación entera. Los
   * comentarios no tienen flag de visibilidad (a diferencia de
   * `operaciones_ticket.es_interno`): quien puede ver la reparación, los ve.
   *
   * Los nombres de los autores se resuelven en UN batch cross-DB
   * (`resolverNombres`, sin N+1) — `autor_id` es soft ref a `master.usuarios`
   * y no hay JOIN posible entre las dos bases.
   * @throws 404 ticket_edilicia inexistente
   */
  @Get(':reparacionId/comentarios')
  @RequiereAcciones('EDILICIA:LECTURA')
  async listarComentarios(
    @Param('reparacionId') reparacionId: string,
  ): Promise<ComentarioReparacionResponseDto[]> {
    const result = await this.listarComentariosUseCase.execute(reparacionId);

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
   * `@RequiereAcciones('EDILICIA:ALTAS', 'COMPRAS:LECTURA')` — AND (R3,
   * decisión de producto #2435, WU5.9): el segundo argumento cierra el
   * agujero que demostró el test de autorización real por HTTP de WU5.8
   * (con un solo argumento, un actor con SOLO `EDILICIA:ALTAS` pasaba y
   * recibía 201/404, nunca 403). El candado vive acá, en el `AccionesGuard`
   * del backend, no en que el frontend esconda el selector de compras.
   * @throws 404 reparación o compra inexistente
   */
  @Post(':reparacionId/compras')
  @RequiereAcciones('EDILICIA:ALTAS', 'COMPRAS:LECTURA')
  @HttpCode(HttpStatus.CREATED)
  async vincularCompra(
    @Param('reparacionId') reparacionId: string,
    @Body() dto: VincularCompraHttpDto,
  ): Promise<void> {
    const result = await this.vincularCompraUseCase.execute({
      ticketEdiliciaId: reparacionId,
      compraId: dto.compraId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * DELETE /reparaciones/:reparacionId/compras/:compraId
   * Desvincula (HARD DELETE real, D5) una compra de la reparación.
   *
   * Solo `EDILICIA:BORRADO` — sin `COMPRAS:LECTURA`: el `numero` que ve
   * quien desvincula sale de `comprasQueBloquean[]` en `GET /reparaciones`
   * (`EDILICIA:LECTURA`), no de `GET /compras`. No navega el universo de
   * compras, opera sobre un vínculo que ya es visible.
   * @throws 404 vínculo inexistente
   */
  @Delete(':reparacionId/compras/:compraId')
  @RequiereAcciones('EDILICIA:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desvincularCompra(
    @Param('reparacionId') reparacionId: string,
    @Param('compraId') compraId: string,
  ): Promise<void> {
    const result = await this.desvincularCompraUseCase.execute({
      ticketEdiliciaId: reparacionId,
      compraId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
