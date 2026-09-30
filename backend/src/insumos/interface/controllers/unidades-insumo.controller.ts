/**
 * UnidadesInsumoController — borde HTTP de las unidades por número de serie de
 * un insumo (repuestos-numero-de-serie, ADR-8 y ADR-9).
 *
 * Rutas (`@RequiereAcciones` POR MÉTODO, nunca a nivel de clase):
 *   GET  /insumos/:insumoId/unidades                          [INSUMOS:LECTURA]
 *   GET  /insumos/:insumoId/unidades/:unidadId/historial      [INSUMOS:LECTURA]
 *   POST /insumos/:insumoId/unidades/:unidadId/serial         [INSUMOS:ALTAS]
 *   POST /insumos/:insumoId/unidades/:unidadId/correccion-serial [INSUMOS:AJUSTAR]
 *   POST /insumos/:insumoId/unidades/:unidadId/devolucion-entrega [INSUMOS:ALTAS]
 *   POST /insumos/:insumoId/unidades/:unidadId/recuperacion   [INSUMOS:AJUSTAR]
 *
 * Completar un serial pendiente es parte de dar de alta (`ALTAS`); corregir uno
 * ya cargado explica una diferencia, igual que el ajuste (`AJUSTAR`). El
 * `usuarioId` sale siempre del JWT, nunca del body. Los errores se mapean con
 * `toHttpExceptionMovimiento` (409 serial duplicado, 404 unidad/insumo
 * inexistente, 422 el resto de las reglas). La devolución de una entrega es una
 * ENTRADA de una pieza que vuelve físicamente (`ALTAS`, ADR-13). Recuperar una
 * pieza descartada revierte una baja, así que exige `AJUSTAR` y un motivo (ADR-14).
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

import { ListarUnidadesInsumoUseCase } from '../../application/use-cases/listar-unidades-insumo.use-case';
import { ConsultarHistorialUnidadUseCase } from '../../application/use-cases/consultar-historial-unidad.use-case';
import { CargarSerialUnidadUseCase } from '../../application/use-cases/cargar-serial-unidad.use-case';
import { CorregirSerialUnidadUseCase } from '../../application/use-cases/corregir-serial-unidad.use-case';
import { DevolverEntregaUseCase } from '../../application/use-cases/devolver-entrega.use-case';
import { RecuperarUnidadDescartadaUseCase } from '../../application/use-cases/recuperar-unidad-descartada.use-case';
import { toHttpExceptionMovimiento } from './movimientos-insumo.controller';
import {
  MovimientoInsumoResponseDto,
  toMovimientoInsumoResponseDto,
} from '../dtos/movimientos-insumo.dto';
import {
  CargarSerialUnidadHttpDto,
  CorregirSerialUnidadHttpDto,
  DevolverEntregaHttpDto,
  EventoUnidadResponseDto,
  ListarUnidadesInsumoQueryDto,
  RecuperarUnidadDescartadaHttpDto,
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
    private readonly cargarSerialUseCase: CargarSerialUnidadUseCase,
    private readonly corregirSerialUseCase: CorregirSerialUnidadUseCase,
    private readonly devolverEntregaUseCase: DevolverEntregaUseCase,
    private readonly recuperarUnidadUseCase: RecuperarUnidadDescartadaUseCase,
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

  /**
   * POST /insumos/:insumoId/unidades/:unidadId/serial — completa un serial pendiente.
   *
   * @throws 400 id mal formado o serial fuera de 1 a 255 (recortado y normalizado)
   * @throws 403 sin `INSUMOS:ALTAS`
   * @throws 404 unidad inexistente o de otro insumo
   * @throws 409 el serial ya lo tiene otra unidad del insumo
   * @throws 422 la unidad ya tiene serial (se corrige) o no admite la carga
   */
  @Post(':unidadId/serial')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async cargarSerial(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Param('unidadId', new ParseUUIDPipe()) unidadId: string,
    @Body() dto: CargarSerialUnidadHttpDto,
  ): Promise<UnidadInsumoResponseDto> {
    const result = await this.cargarSerialUseCase.execute({
      insumoId,
      unidadId,
      numeroSerie: dto.numeroSerie,
      usuarioId: user.sub,
    });
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return toUnidadInsumoResponseDto({ unidad: result.getValue(), equipoNombre: null });
  }

  /**
   * POST /insumos/:insumoId/unidades/:unidadId/correccion-serial — corrige un serial ya cargado.
   *
   * @throws 400 id mal formado, serial fuera de rango o motivo por encima de 500
   * @throws 403 sin `INSUMOS:AJUSTAR`
   * @throws 404 unidad inexistente o de otro insumo
   * @throws 409 el serial nuevo ya lo tiene otra unidad del insumo
   * @throws 422 motivo vacío, unidad instalada o pendiente
   */
  @Post(':unidadId/correccion-serial')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:AJUSTAR')
  @HttpCode(HttpStatus.CREATED)
  async corregirSerial(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Param('unidadId', new ParseUUIDPipe()) unidadId: string,
    @Body() dto: CorregirSerialUnidadHttpDto,
  ): Promise<UnidadInsumoResponseDto> {
    const result = await this.corregirSerialUseCase.execute({
      insumoId,
      unidadId,
      numeroSerie: dto.numeroSerie,
      usuarioId: user.sub,
      motivo: dto.motivo ?? null,
    });
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return toUnidadInsumoResponseDto({ unidad: result.getValue(), equipoNombre: null });
  }

  /**
   * POST /insumos/:insumoId/unidades/:unidadId/devolucion-entrega — una unidad entregada vuelve al depósito.
   *
   * @throws 400 id mal formado, condición fuera de NUEVO/USADO o motivo por encima de 500
   * @throws 403 sin `INSUMOS:ALTAS`
   * @throws 404 unidad inexistente o de otro insumo
   * @throws 422 unidad no entregada, insumo sin serie o dado de baja, USADO fuera de repuestos
   */
  @Post(':unidadId/devolucion-entrega')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async devolverEntrega(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Param('unidadId', new ParseUUIDPipe()) unidadId: string,
    @Body() dto: DevolverEntregaHttpDto,
  ): Promise<MovimientoInsumoResponseDto> {
    const result = await this.devolverEntregaUseCase.execute({
      insumoId,
      unidadId,
      condicion: dto.condicion,
      motivo: dto.motivo ?? null,
      usuarioId: user.sub,
    });
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return toMovimientoInsumoResponseDto(result.getValue());
  }

  /**
   * POST /insumos/:insumoId/unidades/:unidadId/recuperacion — una pieza descartada vuelve al depósito.
   *
   * @throws 400 id mal formado, condición fuera de NUEVO/USADO o motivo por encima de 500
   * @throws 403 sin `INSUMOS:AJUSTAR`
   * @throws 404 unidad inexistente o de otro insumo
   * @throws 422 sin motivo, unidad no descartada, insumo sin serie o dado de baja, USADO fuera de repuestos
   */
  @Post(':unidadId/recuperacion')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:AJUSTAR')
  @HttpCode(HttpStatus.CREATED)
  async recuperar(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Param('unidadId', new ParseUUIDPipe()) unidadId: string,
    @Body() dto: RecuperarUnidadDescartadaHttpDto,
  ): Promise<MovimientoInsumoResponseDto> {
    const result = await this.recuperarUnidadUseCase.execute({
      insumoId,
      unidadId,
      condicion: dto.condicion,
      motivo: dto.motivo ?? null,
      usuarioId: user.sub,
    });
    if (result.isFail()) throw toHttpExceptionMovimiento(result.getError());
    return toMovimientoInsumoResponseDto(result.getValue());
  }
}
