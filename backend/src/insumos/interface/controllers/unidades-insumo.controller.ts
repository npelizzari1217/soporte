/**
 * UnidadesInsumoController — borde HTTP de las unidades por número de serie de
 * un insumo (repuestos-numero-de-serie, ADR-8 y ADR-9).
 *
 * Rutas (`@RequiereAcciones` POR MÉTODO, nunca a nivel de clase):
 *   GET  /insumos/:insumoId/unidades                          [INSUMOS:LECTURA]
 *   GET  /insumos/:insumoId/unidades/:unidadId/historial      [INSUMOS:LECTURA]
 *
 * Las dos lecturas llevan `INSUMOS:LECTURA`. Las escrituras (cargar y corregir
 * serial) llegan en la parte 2 de WU-8b. Los errores se mapean con
 * `toHttpExceptionMovimiento` (409 serial duplicado, 404 unidad/insumo
 * inexistente, 422 el resto de las reglas).
 */
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';

import { ListarUnidadesInsumoUseCase } from '../../application/use-cases/listar-unidades-insumo.use-case';
import { ConsultarHistorialUnidadUseCase } from '../../application/use-cases/consultar-historial-unidad.use-case';
import { toHttpExceptionMovimiento } from './movimientos-insumo.controller';
import {
  EventoUnidadResponseDto,
  ListarUnidadesInsumoQueryDto,
  UnidadInsumoResponseDto,
  toEventoUnidadResponseDto,
  toUnidadInsumoResponseDto,
} from '../dtos/unidades-insumo.dto';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('insumos/:insumoId/unidades')
export class UnidadesInsumoController {
  constructor(
    private readonly listarUnidadesUseCase: ListarUnidadesInsumoUseCase,
    private readonly consultarHistorialUseCase: ConsultarHistorialUnidadUseCase,
  ) {}

  /**
   * GET /insumos/:insumoId/unidades — las unidades del insumo.
   *
   * @param query `estado` y `disponibles=true` (EN_DEPOSITO con serial).
   * @throws 400 id o filtro mal formado
   * @throws 403 sin `INSUMOS:LECTURA`
   * @throws 404 insumo inexistente o dado de baja
   */
  @Get()
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async listar(
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Query() query: ListarUnidadesInsumoQueryDto,
  ): Promise<UnidadInsumoResponseDto[]> {
    const result = await this.listarUnidadesUseCase.execute({
      insumoId,
      estado: query.estado,
      disponibles: query.disponibles,
    });
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return result.getValue().map(toUnidadInsumoResponseDto);
  }

  /**
   * GET /insumos/:insumoId/unidades/:unidadId/historial — cronológico.
   *
   * @throws 400 id mal formado
   * @throws 403 sin `INSUMOS:LECTURA`
   * @throws 404 unidad inexistente o de otro insumo
   */
  @Get(':unidadId/historial')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async historial(
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Param('unidadId', new ParseUUIDPipe()) unidadId: string,
  ): Promise<EventoUnidadResponseDto[]> {
    const result = await this.consultarHistorialUseCase.execute(insumoId, unidadId);
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return result.getValue().map(toEventoUnidadResponseDto);
  }
}
