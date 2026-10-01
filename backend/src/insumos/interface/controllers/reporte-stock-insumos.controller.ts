/**
 * ReporteStockInsumosController — reporte de stock de todos los insumos y su
 * exportacion a CSV (reporte-stock-insumos, WU-4).
 *
 *   GET /insumos/reporte-stock         → ConsultarReporteStockUseCase   `INSUMOS:LECTURA`
 *   GET /insumos/reporte-stock/export  → ExportarReporteStockUseCase    `INSUMOS:LECTURA`
 *
 * **Se registra ANTES de `InsumosController` en `InsumosModule`** (ver el
 * modulo): `InsumosController` tiene rutas `GET /insumos/:id/...` y Nest
 * resuelve en el orden de registro. El e2e fija que `/insumos/reporte-stock`
 * no la captura otra ruta.
 *
 * Guards de clase (`JwtAuthGuard`, `TenantGuard`) y `AccionesGuard` por metodo,
 * sin chequeos de permiso inline. Los dos handlers comparten el DTO de query:
 * los filtros del CSV son los del JSON.
 */
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { ConsultarReporteStockUseCase } from '../../application/use-cases/consultar-reporte-stock.use-case';
import { ExportarReporteStockUseCase } from '../../application/use-cases/exportar-reporte-stock.use-case';
import {
  ReporteStockQueryDto,
  ReporteStockResponseDto,
  toReporteStockResponseDto,
} from '../dtos/reporte-stock.dto';
import { toHttpException } from './insumos.controller';

/** Superficie minima de la respuesta que usa el handler (como `EquiposController`). */
interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('insumos/reporte-stock')
export class ReporteStockInsumosController {
  constructor(
    private readonly consultarReporteStockUseCase: ConsultarReporteStockUseCase,
    private readonly exportarReporteStockUseCase: ExportarReporteStockUseCase,
  ) {}

  /**
   * GET /insumos/reporte-stock — el reporte como JSON `{ generadoEn, filas }`.
   *
   * @param query Filtros opcionales `familiaId`, `esRepuesto`, `soloBajoMinimo`, `ocultarSinStock`.
   */
  @Get()
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async consultar(@Query() query: ReporteStockQueryDto): Promise<ReporteStockResponseDto> {
    const reporte = await this.consultarReporteStockUseCase.execute(query);
    return toReporteStockResponseDto(reporte);
  }

  /**
   * GET /insumos/reporte-stock/export — el mismo reporte, con los mismos
   * filtros, como CSV descargable.
   *
   * @throws 422 el reporte supera el tope de filas de la exportacion
   */
  @Get('export')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async exportar(
    @Query() query: ReporteStockQueryDto,
    @Res({ passthrough: true }) res: RespuestaConHeaders,
  ): Promise<string> {
    const result = await this.exportarReporteStockUseCase.execute(query);
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    const { contenido, nombreArchivo } = result.getValue();

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    // Sin esto el navegador no puede leer el nombre del archivo.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    return contenido;
  }
}
