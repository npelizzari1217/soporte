/**
 * EquiposController — entry point HTTP del inventario de equipos IT
 * (F3-Q1..Q3).
 *
 * Rutas (la acción entre backticks es la que el handler declara con
 * `@RequiereAcciones`; NINGUNA ruta de este controller queda sólo con
 * autenticación):
 *   POST   /equipos                                           → CrearEquipoUseCase           `EQUIPOS:ALTAS`
 *   GET    /equipos                                           → ListarEquiposUseCase         `EQUIPOS:LECTURA`
 *   GET    /equipos/tipos-componente                          → ListarTiposComponenteUseCase `EQUIPOS:LECTURA`
 *   GET    /equipos/export                                    → ExportarEquiposUseCase       `EQUIPOS:LECTURA` (sdd/exportar-listados-csv)
 *   GET    /equipos/:id                                       → ObtenerEquipoUseCase         `EQUIPOS:LECTURA`
 *   PATCH  /equipos/:id                                       → EditarEquipoUseCase          `EQUIPOS:MODIFICACION`
 *   DELETE /equipos/:id                                       → EliminarEquipoUseCase        `EQUIPOS:BORRADO`
 *   POST   /equipos/:id/componentes                           → InstalarComponenteDesdeDepositoUseCase (descontarStock, por defecto) o AgregarComponenteUseCase (descontarStock=false) `EQUIPOS:ALTAS`
 *   DELETE /equipos/:id/componentes/:componenteId             → EliminarComponenteUseCase    `EQUIPOS:BORRADO`
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
 * `GET /equipos/tipos-componente` se declara ANTES de `GET /equipos/:id` en
 * la clase para que Nest lo matchee como ruta estática y NO como
 * `id="tipos-componente"` (mismo criterio de orden que cualquier router
 * Express-like). El catálogo de tipos de componente es READ-ONLY (F3-Q3), pero
 * READ-ONLY no es lo mismo que ABIERTO: declara `EQUIPOS:LECTURA`, igual que
 * el listado. Estuvo un tiempo sin gate alguno —`AccionesGuard` sin metadata
 * deja pasar— y eso se cerró; el JSDoc del handler cuenta ese episodio.
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
import { EliminarComponenteUseCase } from '../../application/use-cases/eliminar-componente.use-case';
import { EditarComponenteUseCase } from '../../application/use-cases/editar-componente.use-case';
import { ReactivarComponenteUseCase } from '../../application/use-cases/reactivar-componente.use-case';
import { ListarTiposComponenteUseCase } from '../../application/use-cases/listar-tipos-componente.use-case';
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
  EditarEquipoHttpDto,
  EquipoDetalleResponseDto,
  EquipoResponseDto,
  TipoComponenteResponseDto,
  toComponenteResponseDto,
  toEquipoDetalleResponseDto,
  toEquipoResponseDto,
  toTipoComponenteResponseDto,
} from '../dtos/equipos.dto';

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
    private readonly eliminarComponenteUseCase: EliminarComponenteUseCase,
    private readonly editarComponenteUseCase: EditarComponenteUseCase,
    private readonly reactivarComponenteUseCase: ReactivarComponenteUseCase,
    private readonly listarTiposComponenteUseCase: ListarTiposComponenteUseCase,
    // Agregado al final (no reordena los anteriores) — mismo criterio que
    // `TicketsController.exportarTicketsUseCase`: evita reindexar los tests
    // existentes que instancian el controller con args posicionales.
    private readonly exportarEquiposUseCase: ExportarEquiposUseCase,
    // WU-4 (sdd/repuestos-instalar-desde-deposito, issue #153) — mismo
    // criterio: agregado al final.
    private readonly instalarComponenteDesdeDepositoUseCase: InstalarComponenteDesdeDepositoUseCase,
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
   * GET /equipos/tipos-componente
   * Lista el catálogo READ-ONLY de tipos de componente activos (F3-Q3).
   *
   * Fix W5 (post-verify): al reemplazar `ModulosGuard` por `AccionesGuard`
   * esta ruta se quedó SIN gate, porque el guard nuevo sin metadata deja
   * pasar (R3) y el `@RequireModulo('EQUIPOS')` que la cubría vivía a nivel
   * de clase. Quedaba abierta a cualquier autenticado del tenant: un
   * ensanchamiento de acceso dentro de un cambio cuyo objetivo era el
   * contrario. `EQUIPOS:LECTURA` restaura exactamente la población anterior,
   * porque el backfill sembró esa celda a quien tenía el módulo asignado.
   * Sigue SIN exigir permiso de escritura: el catálogo es read-only y hace
   * falta para poblar el selector al agregar componentes.
   */
  @Get('tipos-componente')
  @RequiereAcciones('EQUIPOS:LECTURA')
  async listarTiposComponente(): Promise<TipoComponenteResponseDto[]> {
    const result = await this.listarTiposComponenteUseCase.execute();
    return result.getValue().map(toTipoComponenteResponseDto);
  }

  /**
   * GET /equipos/export
   * Exporta a CSV el inventario ACTIVO completo de equipos
   * (sdd/exportar-listados-csv) — sin filtros, por diseño (spec, capability
   * exportacion-equipos): cualquier query string que llegue se ignora.
   *
   * **Va declarada ANTES de `GET /equipos/:id`, mismo criterio funcional que
   * `GET /equipos/tipos-componente`** (design D6): Nest resuelve las rutas
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
    const result =
      (dto.descontarStock ?? true)
        ? await this.instalarComponenteDesdeDepositoUseCase.execute({
            ...datos,
            usuarioId: user.sub,
          })
        : await this.agregarComponenteUseCase.execute(datos);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toComponenteResponseDto(result.getValue());
  }

  /**
   * DELETE /equipos/:id/componentes/:componenteId
   * Baja lógica (soft delete) de un componente.
   * @throws 404 componente inexistente
   */
  @Delete(':id/componentes/:componenteId')
  @RequiereAcciones('EQUIPOS:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarComponente(
    @Param('id') equipoId: string,
    @Param('componenteId') componenteId: string,
  ): Promise<void> {
    const result = await this.eliminarComponenteUseCase.execute({ equipoId, componenteId });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
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
