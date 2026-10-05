/**
 * EquiposController — entry point HTTP del inventario de equipos IT
 * (F3-Q1..Q3).
 *
 * Rutas (la acción entre backticks es la que el handler declara con
 * `@RequiereAcciones`; NINGUNA ruta de este controller queda sólo con
 * autenticación):
 *   POST   /equipos                                           → CrearEquipoUseCase           `EQUIPOS:ALTAS`
 *   GET    /equipos                                           → ListarEquiposUseCase         `EQUIPOS:LECTURA`
 *   GET    /equipos/export                                    → ExportarEquiposUseCase       `EQUIPOS:LECTURA` (sdd/exportar-listados-csv)
 *   GET    /equipos/:id                                       → ObtenerEquipoUseCase         `EQUIPOS:LECTURA`
 *   PATCH  /equipos/:id                                       → EditarEquipoUseCase          `EQUIPOS:MODIFICACION`
 *   DELETE /equipos/:id                                       → EliminarEquipoUseCase        `EQUIPOS:BORRADO`
 *   GET    /equipos/:id/baja/resumen                          → ResumenBajaEquipoUseCase     `EQUIPOS:BORRADO` (baja-equipo-completo)
 *   POST   /equipos/:id/baja                                  → DarDeBajaEquipoUseCase       `EQUIPOS:BORRADO` (baja-equipo-completo)
 *   POST   /equipos/:id/qr                                    → EmitirQrEquipoUseCase        `EQUIPOS:MODIFICACION` (formulario-publico-qr)
 *   GET    /equipos/:id/qr                                    → ObtenerQrEquipoUseCase       `EQUIPOS:MODIFICACION` (issue #356)
 *   POST   /equipos/:id/componentes                           → InstalarComponenteDesdeDepositoUseCase (descontarStock, por defecto) o AgregarComponenteSinDescuentoUseCase (descontarStock=false) `EQUIPOS:ALTAS`
 *   POST   /equipos/:id/componentes/:componenteId/baja        → RetirarComponenteUseCase     `EQUIPOS:BORRADO`
 *   PATCH  /equipos/:id/componentes/:componenteId             → EditarComponenteUseCase      `EQUIPOS:MODIFICACION`
 *   PATCH  /equipos/:id/componentes/:componenteId/reactivar   → ReactivarComponenteUseCase   `EQUIPOS:MODIFICACION`
 *
 * `[equipo:gestionar]` y `(autenticado)` figuraban acá como gate de varias de
 * estas rutas: ninguno de los dos existe ya en el código. Las acciones
 * `EQUIPOS:*` de arriba las reemplazaron con `AccionesGuard` (WU-7.3), y esta
 * tabla se había quedado describiendo el esquema anterior. Es documentación de
 * AUTORIZACIÓN: mientras miente, miente sobre quién puede escribir el
 * inventario.
 *
 * `GET /equipos/export` se declara ANTES de `GET /equipos/:id` (ver su JSDoc).
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario — reemplaza a
 * `PermissionsGuard`+`ModulosGuard`+`@RequireModulo('EQUIPOS')` de clase).
 *
 * Tarea: T12.6.
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
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError } from '../../../shared/domain/result';

import { CrearEquipoUseCase } from '../../application/use-cases/crear-equipo.use-case';
import { EditarEquipoUseCase } from '../../application/use-cases/editar-equipo.use-case';
import { ObtenerEquipoUseCase } from '../../application/use-cases/obtener-equipo.use-case';
import { ListarEquiposUseCase } from '../../application/use-cases/listar-equipos.use-case';
import { EliminarEquipoUseCase } from '../../application/use-cases/eliminar-equipo.use-case';
import { AgregarComponenteSinDescuentoUseCase } from '../../application/use-cases/agregar-componente-sin-descuento.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from '../../application/use-cases/instalar-componente-desde-deposito.use-case';
import { EditarComponenteUseCase } from '../../application/use-cases/editar-componente.use-case';
import { RetirarComponenteUseCase } from '../../application/use-cases/retirar-componente.use-case';
import { ReactivarComponenteUseCase } from '../../application/use-cases/reactivar-componente.use-case';
import { ExportarEquiposUseCase } from '../../application/use-cases/exportar-equipos.use-case';
import { DarDeBajaEquipoUseCase } from '../../application/use-cases/dar-de-baja-equipo.use-case';
import { EmitirQrEquipoUseCase } from '../../application/use-cases/emitir-qr-equipo.use-case';
import { ObtenerQrEquipoUseCase } from '../../application/use-cases/obtener-qr-equipo.use-case';
import {
  ResumenBajaEquipo,
  ResumenBajaEquipoUseCase,
} from '../../application/use-cases/resumen-baja-equipo.use-case';

import {
  EquipoNoEncontradoError,
  EquipoInvalidoError,
  NumeroSerieDuplicadoError,
  ModeloEquipoInexistenteError,
  ModeloEquipoDeshabilitadoError,
  ComponenteNoEncontradoError,
  ComponenteDadoDeBajaError,
  ComponenteYaActivoError,
  ComponenteDevueltoAlStockError,
  SerialDeUnidadNoEditableError,
  MotivoRetiroRequeridoError,
  ExportacionDemasiadoGrandeError,
  InsumoRepuestoInexistenteError,
  InsumoNoEsRepuestoError,
  FamiliaRepuestoDeshabilitadaError,
  UnidadConAltaSinDescuentoError,
  EquipoDadoDeBajaError,
  EquipoConComponentesActivosError,
  MotivoBajaEquipoInvalidoError,
  BajaEquipoConPiezasProblematicasError,
  EquipoModificadoDuranteLaBajaError,
  QrRequiereSlugError,
  QrSlugCambiadoError,
} from '../../domain/errors/equipos.errors';
import { ClienteNoEncontradoError } from '../../../clientes/domain/errors/clientes.errors';

import {
  SerialDuplicadoError,
  SerialRequeridoError,
  UnidadNoAdmitidaError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
  UnidadRequeridaError,
} from '../../../insumos/domain/errors/unidades-insumo.errors';
import {
  ComponenteResponseDto,
  CreateComponenteHttpDto,
  CreateEquipoHttpDto,
  DarDeBajaEquipoHttpDto,
  QrEquipoLeidoResponseDto,
  QrEquipoResponseDto,
  EditarComponenteHttpDto,
  RetirarComponenteHttpDto,
  EditarEquipoHttpDto,
  EquipoDetalleResponseDto,
  EquipoResponseDto,
  ListarEquiposQueryDto,
  toComponenteResponseDto,
  toEquipoDetalleResponseDto,
  toEquipoResponseDto,
} from '../dtos/equipos.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mapea un `DomainError` de los use cases de equipos a la `HttpException` correspondiente. */
export function toHttpException(
  error: DomainError,
): NotFoundException | ConflictException | UnprocessableEntityException {
  if (
    error instanceof EquipoNoEncontradoError ||
    error instanceof ComponenteNoEncontradoError ||
    // Emitir QR (formulario-publico-qr): el cliente de la sesión ya no existe.
    error instanceof ClienteNoEncontradoError ||
    // `unidadId` del body que no existe: se contesta como las rutas de unidades de insumo.
    error instanceof UnidadNoEncontradaError
  ) {
    return new NotFoundException(error.message);
  }
  // Baja de equipo completo (baja-equipo-completo, R6): el conjunto de piezas cambió entre el
  // chequeo previo y el lock del equipo. Nada se escribió y reintentar es seguro.
  if (error instanceof EquipoModificadoDuranteLaBajaError) {
    return new ConflictException(error.message);
  }
  // Emitir QR (formulario-publico-qr, ADR-2): sin slug no hay URL que codificar, o el slug cambió
  // mientras se emitía. Viaja el `code` para que la pantalla elija el aviso sin leer el texto.
  if (error instanceof QrRequiereSlugError || error instanceof QrSlugCambiadoError) {
    return new ConflictException({ statusCode: 409, message: error.message, code: error.code });
  }
  // Alta sin descuento de un insumo `SERIE` (D3): el serial ya lo tiene otra unidad.
  if (error instanceof SerialDuplicadoError) {
    return new ConflictException(error.message);
  }
  // Baja de equipo completo (ADR-7): con destino `STOCK_USADO`, lista TODAS las piezas que no
  // pueden volver al depósito, cada una con su causa.
  if (error instanceof BajaEquipoConPiezasProblematicasError) {
    return new UnprocessableEntityException({
      statusCode: 422,
      message: error.message,
      code: error.code,
      piezas: error.piezas.map(({ componenteId, insumoId, causa }) => ({
        componenteId,
        insumoId,
        causa,
      })),
    });
  }
  // El motivo de la baja no cabe (o la categoría no sirve): `largoMaximo` es el espacio
  // disponible para el texto, el mismo que informa el resumen.
  if (error instanceof MotivoBajaEquipoInvalidoError) {
    return new UnprocessableEntityException({
      statusCode: 422,
      message: error.message,
      code: error.code,
      ...(error.largoMaximo === undefined ? {} : { largoMaximo: error.largoMaximo }),
    });
  }
  // Borrar un equipo con piezas activas: informa la cantidad para que la pantalla ofrezca la baja.
  if (error instanceof EquipoConComponentesActivosError) {
    return new UnprocessableEntityException({
      statusCode: 422,
      message: error.message,
      code: error.code,
      cantidad: error.cantidad,
    });
  }
  // Reactivar (ADR-14): la unidad ya no está descartada por este componente. Viaja el `code`
  // para que el frontend elija el aviso sin comparar el texto del mensaje. Llega del módulo
  // equipos o, sin traducir, del de insumos (clase duplicada): por `code`.
  if (error.code === 'UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE') {
    return new UnprocessableEntityException({
      statusCode: 422,
      message: error.message,
      code: error.code,
    });
  }
  if (
    error instanceof EquipoInvalidoError ||
    error instanceof NumeroSerieDuplicadoError ||
    // `modeloEquipoId` es un valor del BODY que referencia un catálogo:
    // 422, no 404. Un 404 acá se leería como "el
    // equipo no existe", que es otra cosa.
    error instanceof ModeloEquipoInexistenteError ||
    error instanceof ModeloEquipoDeshabilitadoError ||
    error instanceof ComponenteDadoDeBajaError ||
    error instanceof ComponenteYaActivoError ||
    // Reactivar tras devolver al stock (sdd/stock-usado-componentes): doble conteo.
    error instanceof ComponenteDevueltoAlStockError ||
    error instanceof MotivoRetiroRequeridoError ||
    // El serial de un componente con unidad se corrige desde la unidad (ADR-7).
    error instanceof SerialDeUnidadNoEditableError ||
    // Instalar con unidad (ADR-7): la unidad elegida no sirve, o el insumo exige elegir una.
    error instanceof UnidadNoDisponibleError ||
    error instanceof UnidadRequeridaError ||
    error instanceof UnidadNoAdmitidaError ||
    error instanceof UnidadConAltaSinDescuentoError ||
    error instanceof SerialRequeridoError ||
    // `insumoId` es otro valor del BODY que referencia un catálogo (WU-3,
    // sdd/repuestos-vinculo-componente): mismo criterio 422 que
    // `modeloEquipoId`.
    error instanceof InsumoRepuestoInexistenteError ||
    error instanceof InsumoNoEsRepuestoError ||
    error instanceof FamiliaRepuestoDeshabilitadaError ||
    // Exportación a CSV (sdd/exportar-listados-csv, decisión D2): cae igual
    // en 422 por el default, pero se lista explícito como los demás — el
    // default existe para el error que NADIE mapeó, no para ahorrarse una
    // línea en uno conocido.
    error instanceof ExportacionDemasiadoGrandeError ||
    // Baja de equipo completo (R8, R13): un equipo dado de baja no admite la operación.
    error instanceof EquipoDadoDeBajaError
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
 * (mismo criterio que `TicketsController`, sdd/exportar-listados-csv): el
 * tipo completo traería `@types/express` como dependencia nueva, y este
 * proyecto tiene un motivo concreto para no tocar el lockfile sin necesidad
 * (el deploy aborta cuando cambia). Tipar exactamente lo que se usa deja el
 * mismo chequeo estricto sin arrastrar nada.
 */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

/**
 * Mapea un campo fecha (string ISO) del PATCH al dominio con semántica de PATCH:
 * `undefined` = no tocar, `null` = limpiar, string → `Date`.
 */
function fechaPatch(valor: string | null | undefined): Date | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return new Date(valor);
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('equipos')
export class EquiposController {
  constructor(
    private readonly crearEquipoUseCase: CrearEquipoUseCase,
    private readonly editarEquipoUseCase: EditarEquipoUseCase,
    private readonly obtenerEquipoUseCase: ObtenerEquipoUseCase,
    private readonly listarEquiposUseCase: ListarEquiposUseCase,
    private readonly eliminarEquipoUseCase: EliminarEquipoUseCase,
    private readonly agregarComponenteSinDescuentoUseCase: AgregarComponenteSinDescuentoUseCase,
    private readonly editarComponenteUseCase: EditarComponenteUseCase,
    private readonly reactivarComponenteUseCase: ReactivarComponenteUseCase,
    // Agregado al final (no reordena los anteriores) — mismo criterio que
    // `TicketsController.exportarTicketsUseCase`: evita reindexar los tests
    // existentes que instancian el controller con args posicionales.
    private readonly exportarEquiposUseCase: ExportarEquiposUseCase,
    // WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153) — mismo
    // criterio: agregado al final.
    private readonly instalarComponenteDesdeDepositoUseCase: InstalarComponenteDesdeDepositoUseCase,
    // sdd/stock-usado-componentes (WU-8a) — agregado al final por el mismo criterio.
    private readonly retirarComponenteUseCase: RetirarComponenteUseCase,
    // sdd/baja-equipo-completo (WU-11) — agregados al final por el mismo criterio.
    private readonly darDeBajaEquipoUseCase: DarDeBajaEquipoUseCase,
    private readonly resumenBajaEquipoUseCase: ResumenBajaEquipoUseCase,
    // sdd/formulario-publico-qr (WU-4) — agregado al final por el mismo criterio.
    private readonly emitirQrEquipoUseCase: EmitirQrEquipoUseCase,
    // issue #356 — agregado al final por el mismo criterio.
    private readonly obtenerQrEquipoUseCase: ObtenerQrEquipoUseCase,
  ) {}

  /**
   * POST /equipos
   * Crea un equipo en el inventario.
   * @throws 422 numeroSerie duplicado
   */
  @Post()
  @RequiereAcciones('EQUIPOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CreateEquipoHttpDto): Promise<EquipoResponseDto> {
    const result = await this.crearEquipoUseCase.execute({
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie ?? null,
      marca: dto.marca ?? null,
      modelo: dto.modelo ?? null,
      fechaAdquisicion: dto.fechaAdquisicion ? new Date(dto.fechaAdquisicion) : null,
      ubicacion: dto.ubicacion ?? null,
      modeloEquipoId: dto.modeloEquipoId ?? null,
      importe: dto.importe ?? null,
      fechaValoracion: dto.fechaValoracion ? new Date(dto.fechaValoracion) : null,
      observaciones: dto.observaciones ?? null,
      valorResidual: dto.valorResidual ?? null,
      fechaValorResidual: dto.fechaValorResidual ? new Date(dto.fechaValorResidual) : null,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoResponseDto(result.getValue());
  }

  /**
   * GET /equipos
   * Lista los equipos del inventario. Por defecto solo los vigentes; con `?incluirBajas=true`
   * suma los dados de baja (R11, cada uno con su `baja`).
   */
  @Get()
  @RequiereAcciones('EQUIPOS:LECTURA')
  async listar(@Query() query: ListarEquiposQueryDto): Promise<EquipoResponseDto[]> {
    const result = await this.listarEquiposUseCase.execute({
      incluirDadosDeBaja: query.incluirBajas ?? false,
    });
    return result.getValue().map(toEquipoResponseDto);
  }

  /**
   * GET /equipos/export
   * Exporta a CSV el inventario de equipos (sdd/exportar-listados-csv). Sigue el mismo filtro
   * que la lista (R11): por defecto solo los vigentes; con `?incluirBajas=true` incluye los dados
   * de baja, con "Baja" en la columna Estado. Cualquier otro query param se ignora.
   *
   * **Va declarada ANTES de `GET /equipos/:id`** (design D6): Nest resuelve las rutas
   * en el orden en que se registran y `:id` también matchea la palabra
   * literal `export`; declarada después, esta ruta sería inalcanzable.
   *
   * Gateada por `EQUIPOS:LECTURA`, la misma acción que el listado.
   *
   * @throws 422 la exportación supera el tope de filas (no hay filtros que acotar)
   */
  @Get('export')
  @RequiereAcciones('EQUIPOS:LECTURA')
  async exportar(
    @Query() query: ListarEquiposQueryDto,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
  ): Promise<string> {
    const result = await this.exportarEquiposUseCase.execute({
      incluirDadosDeBaja: query.incluirBajas ?? false,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { contenido, nombreArchivo } = result.getValue();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    // El navegador no puede leer un header que no esté expuesto por CORS, y
    // sin esto el frontend no tiene de dónde sacar el nombre del archivo.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    return contenido;
  }

  /**
   * GET /equipos/:id
   * Obtiene el detalle de un equipo, con `componentes` EMBEBIDOS
   * (sdd/beta-frontend item 1 — cierra G7).
   * @throws 404 equipo inexistente
   */
  @Get(':id')
  @RequiereAcciones('EQUIPOS:LECTURA')
  async obtener(@Param('id') id: string): Promise<EquipoDetalleResponseDto> {
    // Un id que no es UUID no puede existir: 404 en vez de dejar que la columna
    // `uuid` de Postgres rompa con 500. Cubre las rutas retiradas que caen acá
    // (p. ej. `GET /equipos/tipos-componente`).
    if (!UUID_REGEX.test(id)) {
      throw toHttpException(new EquipoNoEncontradoError(id));
    }
    const result = await this.obtenerEquipoUseCase.execute({ equipoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoDetalleResponseDto(result.getValue());
  }

  /**
   * PATCH /equipos/:id
   * Edita datos del equipo (PATCH semántico).
   * @throws 404 equipo inexistente
   * @throws 422 numeroSerie duplicado
   */
  @Patch(':id')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarEquipoHttpDto,
  ): Promise<EquipoResponseDto> {
    const result = await this.editarEquipoUseCase.execute({
      equipoId: id,
      nombre: dto.nombre,
      numeroSerie: dto.numeroSerie,
      marca: dto.marca,
      modelo: dto.modelo,
      fechaAdquisicion: fechaPatch(dto.fechaAdquisicion),
      ubicacion: dto.ubicacion,
      modeloEquipoId: dto.modeloEquipoId,
      importe: dto.importe,
      fechaValoracion: fechaPatch(dto.fechaValoracion),
      observaciones: dto.observaciones,
      valorResidual: dto.valorResidual,
      fechaValorResidual: fechaPatch(dto.fechaValorResidual),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toEquipoResponseDto(result.getValue());
  }

  /**
   * DELETE /equipos/:id
   * Borrado lógico (soft delete) de un equipo cargado por error.
   * @throws 404 equipo inexistente
   * @throws 422 el equipo tiene piezas activas (informa la cantidad) o está dado de baja
   */
  @Delete(':id')
  @RequiereAcciones('EQUIPOS:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarEquipoUseCase.execute({ equipoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }

  /**
   * GET /equipos/:id/baja/resumen
   * Lo que el diálogo de baja muestra antes de confirmar: piezas activas con su serial y la causa
   * que impediría devolverlas, tickets abiertos y el espacio del texto libre por categoría. Solo
   * lectura. Exige `EQUIPOS:BORRADO`, la misma acción que la baja.
   * @throws 404 equipo inexistente o con borrado lógico
   * @throws 422 el equipo ya está dado de baja
   */
  @Get(':id/baja/resumen')
  @RequiereAcciones('EQUIPOS:BORRADO')
  async resumenBaja(@Param('id') id: string): Promise<ResumenBajaEquipo> {
    if (!UUID_REGEX.test(id)) {
      throw toHttpException(new EquipoNoEncontradoError(id));
    }
    const result = await this.resumenBajaEquipoUseCase.execute({ equipoId: id });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }

  /**
   * POST /equipos/:id/baja
   * Da de baja el equipo con TODAS sus piezas activas en un mismo destino (`STOCK_USADO` o
   * `DESCARTE`), todo o nada. `destino` es uno solo y obligatorio: un destino por pieza se
   * descarta (R17). `usuarioId` sale de `JWT.sub`. Exige `EQUIPOS:BORRADO` y ningún permiso de
   * insumos: el asiento de stock lo registra el caso de uso. Responde la ficha del equipo.
   * @throws 400 `destino` o `categoria` ausentes o inválidos, `motivo` de más de 500 caracteres,
   *   `seriales` con un `componenteId` repetido
   * @throws 404 equipo inexistente o con borrado lógico
   * @throws 409 las piezas cambiaron durante la baja (reintentable)
   * @throws 422 equipo ya dado de baja, categoría `OTRA` sin texto, texto que no cabe
   *   (`largoMaximo`), o piezas que no pueden volver al depósito (`piezas[]`)
   */
  @Post(':id/baja')
  @RequiereAcciones('EQUIPOS:BORRADO')
  @HttpCode(HttpStatus.OK)
  async darDeBaja(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DarDeBajaEquipoHttpDto,
  ): Promise<EquipoDetalleResponseDto> {
    if (!UUID_REGEX.test(id)) {
      throw toHttpException(new EquipoNoEncontradoError(id));
    }
    const result = await this.darDeBajaEquipoUseCase.execute({
      equipoId: id,
      destino: dto.destino,
      categoria: dto.categoria,
      motivo: dto.motivo,
      seriales: dto.seriales,
      usuarioId: user.sub,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const detalle = await this.obtenerEquipoUseCase.execute({ equipoId: id });
    if (detalle.isFail()) {
      throw toHttpException(detalle.getError());
    }
    return toEquipoDetalleResponseDto(detalle.getValue());
  }

  /**
   * GET /equipos/:id/qr
   * Devuelve el QR vigente del equipo (issue #356) para mostrarlo, descargarlo o imprimirlo las
   * veces que haga falta. Mismo permiso que emitirlo. "Sin QR para mostrar" NO es un 404: el
   * recurso (el equipo) existe, así que contesta 200 con `estado` (`SIN_EMITIR` si nunca se
   * emitió, `REQUIERE_REGENERAR` si se emitió antes de guardar el token en claro) y la pantalla
   * elige el aviso sin tratar un caso normal como error.
   * @throws 404 equipo inexistente o con borrado lógico
   * @throws 422 el equipo está dado de baja
   */
  @Get(':id/qr')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  async obtenerQr(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<QrEquipoLeidoResponseDto> {
    if (!UUID_REGEX.test(id)) {
      throw toHttpException(new EquipoNoEncontradoError(id));
    }
    if (user.cliente_id === null) {
      throw new ForbiddenException('Ver el QR requiere un cliente en la sesión.');
    }
    const result = await this.obtenerQrEquipoUseCase.execute({
      equipoId: id,
      clienteId: user.cliente_id,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const qr = result.getValue();
    return qr.estado === 'VIGENTE'
      ? { estado: qr.estado, url: qr.url, emitidoAt: qr.emitidoAt.toISOString() }
      : { estado: qr.estado, url: null, emitidoAt: null };
  }

  /**
   * POST /equipos/:id/qr
   * Emite el QR del equipo, o lo regenera si ya tenía uno (el token anterior deja de resolver de
   * inmediato). Devuelve la URL pública armada por el backend desde `APP_BASE_URL`: el token se
   * guarda en claro junto a su hash (issue #356) y se vuelve a leer con `GET /equipos/:id/qr`. El primer QR congela el slug del cliente
   * (`clienteId` sale del JWT, nunca del body). No exige que el formulario esté habilitado.
   * @throws 404 equipo inexistente o con borrado lógico
   * @throws 409 el cliente no tiene slug (`QR_REQUIERE_SLUG`) o su slug cambió durante la
   *   emisión (`QR_SLUG_CAMBIADO`, reintentable)
   * @throws 422 el equipo está dado de baja
   */
  @Post(':id/qr')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  async emitirQr(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<QrEquipoResponseDto> {
    if (!UUID_REGEX.test(id)) {
      throw toHttpException(new EquipoNoEncontradoError(id));
    }
    if (user.cliente_id === null) {
      throw new ForbiddenException('La emisión del QR requiere un cliente en la sesión.');
    }
    const result = await this.emitirQrEquipoUseCase.execute({
      equipoId: id,
      clienteId: user.cliente_id,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { url, emitidoAt } = result.getValue();
    return { url, emitidoAt: emitidoAt.toISOString() };
  }

  /**
   * POST /equipos/:id/componentes
   * Alta de un componente desde el catálogo de repuestos. `insumoId` es
   * obligatorio y el tipo se deriva de la familia del repuesto. Con
   * `descontarStock` omitido o `true`, registra en UNA transacción la SALIDA de
   * 1 unidad y el alta (`InstalarComponenteDesdeDepositoUseCase`); con `false`
   * agrega el componente sin movimiento (`AgregarComponenteSinDescuentoUseCase`);
   * con un insumo `SERIE` el `numeroSerie` es obligatorio y crea la unidad ya instalada (D3). `usuarioId` sale
   * siempre de `JWT.sub` vía `@CurrentUser()`, nunca del body.
   * @throws 400 `insumoId` ausente o inválido, `descontarStock` no booleano
   * @throws 404 equipo inexistente
   * @throws 422 insumo inexistente/deshabilitado, familia que no es de
   *   repuesto o deshabilitada, o stock insuficiente (con descuento); con
   *   insumo `SERIE`, falta `unidadId` o la unidad no está disponible (pendiente,
   *   de otro insumo, ya tomada)
   * @throws 404 además: `unidadId` inexistente
   * @throws 422 además, sin descuento: `unidadId` (no se elige una unidad) o insumo
   *   `SERIE` sin `numeroSerie`
   * @throws 409 sin descuento, insumo `SERIE`: el serial ya lo tiene otra unidad
   */
  @Post(':id/componentes')
  @RequiereAcciones('EQUIPOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async agregarComponente(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateComponenteHttpDto,
  ): Promise<ComponenteResponseDto> {
    const datos = {
      equipoId: id,
      insumoId: dto.insumoId,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    };
    // ADR-7: con descuento, `condicion` es la del saldo del que sale la unidad. Sin
    // descuento no hay movimiento: el caso de uso la aplica a la unidad que nace
    // solo si el insumo es `SERIE` (D3) y con `NINGUNO` la ignora, en vez de dar 400
    // al diálogo que desmarca la casilla tras elegir USADO. `unidadId` sin descuento
    // se pasa igual para que el caso de uso lo rechace (422) y no se descarte en silencio.
    const result =
      (dto.descontarStock ?? true)
        ? await this.instalarComponenteDesdeDepositoUseCase.execute({
            ...datos,
            usuarioId: user.sub,
            condicion: dto.condicion,
            unidadId: dto.unidadId,
          })
        : await this.agregarComponenteSinDescuentoUseCase.execute({
            ...datos,
            usuarioId: user.sub,
            condicion: dto.condicion,
            unidadId: dto.unidadId,
          });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * POST /equipos/:id/componentes/:componenteId/baja
   * Retira un componente con dos desenlaces: `STOCK_USADO` lo devuelve al
   * depósito como ENTRADA USADO y `DESCARTE` solo lo da de baja. `usuarioId`
   * sale de `JWT.sub`, nunca del body. Exige `EQUIPOS:BORRADO` y ningún permiso
   * de insumos: el asiento de stock lo registra el caso de uso.
   * @throws 400 `destino` ausente o inválido
   * @throws 404 componente inexistente o de otro equipo
   * @throws 409 el serial del legado ya lo tiene otra unidad del insumo
   * @throws 422 componente ya dado de baja, `DESCARTE` sin motivo, o un legado de un
   *   insumo `SERIE` sin `numeroSerie`
   */
  @Post(':id/componentes/:componenteId/baja')
  @RequiereAcciones('EQUIPOS:BORRADO')
  @HttpCode(HttpStatus.OK)
  async retirarComponente(
    @CurrentUser() user: JwtPayload,
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
    @Body() dto: RetirarComponenteHttpDto,
  ): Promise<ComponenteResponseDto> {
    const result = await this.retirarComponenteUseCase.execute({
      equipoId,
      componenteId,
      destino: dto.destino,
      motivo: dto.motivo,
      numeroSerie: dto.numeroSerie,
      usuarioId: user.sub,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * PATCH /equipos/:id/componentes/:componenteId
   * Edita un componente ACTIVO (listado enriquecido de componentes).
   * @throws 404 componente inexistente
   * @throws 422 componente dado de baja
   */
  @Patch(':id/componentes/:componenteId')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async editarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
    @Body() dto: EditarComponenteHttpDto,
  ): Promise<ComponenteResponseDto> {
    const result = await this.editarComponenteUseCase.execute({
      equipoId,
      componenteId,
      descripcion: dto.descripcion,
      numeroSerie: dto.numeroSerie,
      capacidad: dto.capacidad,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * PATCH /equipos/:id/componentes/:componenteId/reactivar
   * Revierte la baja lógica de un componente (listado enriquecido de componentes).
   * @throws 404 componente inexistente
   * @throws 422 componente ya activo, devuelto al stock, con unidad que ya no está
   *   descartada por él, o de un insumo que dejó de seguirse por serie
   */
  @Patch(':id/componentes/:componenteId/reactivar')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async reactivarComponente(
    @CurrentUser() user: JwtPayload,
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
  ): Promise<ComponenteResponseDto> {
    const result = await this.reactivarComponenteUseCase.execute({
      equipoId,
      componenteId,
      usuarioId: user.sub,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }
}
