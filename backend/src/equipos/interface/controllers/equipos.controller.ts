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
 *   POST   /equipos/:id/componentes                           → InstalarComponenteDesdeDepositoUseCase (descontarStock, por defecto) o AgregarComponenteUseCase (descontarStock=false) `EQUIPOS:ALTAS`
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
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { AgregarComponenteUseCase } from '../../application/use-cases/agregar-componente.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from '../../application/use-cases/instalar-componente-desde-deposito.use-case';
import { EditarComponenteUseCase } from '../../application/use-cases/editar-componente.use-case';
import { RetirarComponenteUseCase } from '../../application/use-cases/retirar-componente.use-case';
import { ReactivarComponenteUseCase } from '../../application/use-cases/reactivar-componente.use-case';
import { ExportarEquiposUseCase } from '../../application/use-cases/exportar-equipos.use-case';

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
} from '../../domain/errors/equipos.errors';

import {
  ComponenteResponseDto,
  CreateComponenteHttpDto,
  CreateEquipoHttpDto,
  EditarComponenteHttpDto,
  RetirarComponenteHttpDto,
  EditarEquipoHttpDto,
  EquipoDetalleResponseDto,
  EquipoResponseDto,
  toComponenteResponseDto,
  toEquipoDetalleResponseDto,
  toEquipoResponseDto,
} from '../dtos/equipos.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mapea un `DomainError` de los use cases de equipos a la `HttpException` correspondiente. */
export function toHttpException(
  error: DomainError,
): NotFoundException | UnprocessableEntityException {
  if (error instanceof EquipoNoEncontradoError || error instanceof ComponenteNoEncontradoError) {
    return new NotFoundException(error.message);
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
    private readonly agregarComponenteUseCase: AgregarComponenteUseCase,
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
   * Lista los equipos activos del inventario.
   */
  @Get()
  @RequiereAcciones('EQUIPOS:LECTURA')
  async listar(): Promise<EquipoResponseDto[]> {
    const result = await this.listarEquiposUseCase.execute();
    return result.getValue().map(toEquipoResponseDto);
  }

  /**
   * GET /equipos/export
   * Exporta a CSV el inventario ACTIVO completo de equipos
   * (sdd/exportar-listados-csv) — sin filtros, por diseño (spec, capability
   * exportacion-equipos): cualquier query string que llegue se ignora.
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
  async exportar(@Res({ passthrough: true }) res: RespuestaConHeaders): Promise<string> {
    const result = await this.exportarEquiposUseCase.execute();

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
   * Baja lógica (soft delete) del equipo.
   * @throws 404 equipo inexistente
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
   * POST /equipos/:id/componentes
   * Alta de un componente desde el catálogo de repuestos. `insumoId` es
   * obligatorio y el tipo se deriva de la familia del repuesto. Con
   * `descontarStock` omitido o `true`, registra en UNA transacción la SALIDA de
   * 1 unidad y el alta (`InstalarComponenteDesdeDepositoUseCase`); con `false`
   * solo agrega el componente (`AgregarComponenteUseCase`). `usuarioId` sale
   * siempre de `JWT.sub` vía `@CurrentUser()`, nunca del body.
   * @throws 400 `insumoId` ausente o inválido, `descontarStock` no booleano
   * @throws 404 equipo inexistente
   * @throws 422 insumo inexistente/deshabilitado, familia que no es de
   *   repuesto o deshabilitada, o stock insuficiente (con descuento)
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
    // ADR-7: `condicion` solo tiene sentido con descuento (es la del saldo del
    // que sale la unidad). Con `descontarStock=false` no hay movimiento y se
    // ignora, en vez de dar 400 al diálogo que desmarca la casilla tras elegir USADO.
    const result =
      (dto.descontarStock ?? true)
        ? await this.instalarComponenteDesdeDepositoUseCase.execute({
            ...datos,
            usuarioId: user.sub,
            condicion: dto.condicion,
          })
        : await this.agregarComponenteUseCase.execute(datos);

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
   * @throws 422 componente ya dado de baja, o `DESCARTE` sin motivo
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
   * @throws 422 componente ya activo
   */
  @Patch(':id/componentes/:componenteId/reactivar')
  @RequiereAcciones('EQUIPOS:MODIFICACION')
  @HttpCode(HttpStatus.OK)
  async reactivarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
  ): Promise<ComponenteResponseDto> {
    const result = await this.reactivarComponenteUseCase.execute({ equipoId, componenteId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }
}
