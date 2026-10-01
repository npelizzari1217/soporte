/**
 * MovimientosInsumoController — entry point HTTP de la bitácora de existencias
 * de un insumo: quién movió cuánto, por qué, y cuánto queda.
 *
 * Rutas (`@UseGuards(AccionesGuard)` + `@RequiereAcciones` POR MÉTODO, NUNCA a
 * nivel de clase):
 *   POST /insumos/:insumoId/movimientos/entrada → RegistrarEntradaInsumoUseCase [INSUMOS:ALTAS]
 *   POST /insumos/:insumoId/movimientos/salida  → RegistrarSalidaInsumoUseCase  [INSUMOS:ALTAS]
 *   POST /insumos/:insumoId/movimientos/ajuste  → RegistrarAjusteInsumoUseCase  [INSUMOS:AJUSTAR]
 *   GET  /insumos/:insumoId/stock               → ConsultarStockInsumoUseCase   [INSUMOS:LECTURA]
 *   GET  /insumos/:insumoId/movimientos         → ListarMovimientosInsumoUseCase [INSUMOS:LECTURA]
 *
 * Las tres primeras ESCRIBEN la bitácora; las dos últimas la LEEN, y responden
 * dos preguntas distintas: el stock contesta "cuánto hay" y el listado "qué
 * pasó". Las dos llevan `INSUMOS:LECTURA` porque las dos exponen el mismo
 * secreto —qué tiene el depósito—, y ninguna necesita el `sub` del JWT: la
 * firma del asiento es cosa de las rutas de escritura.
 *
 * ## Por qué UNA RUTA POR OPERACIÓN y no un solo `POST /movimientos` con el
 * `tipo` en el body
 *
 * El endpoint único es la forma más idiomática —una colección, un recurso, un
 * discriminador— y se descartó igual, porque **un decorador no puede leer el
 * body**. `@RequiereAcciones` es metadata estática por ruta, y el permiso que
 * hace falta acá depende del `tipo`: la entrada y la salida son la operación
 * cotidiana del técnico (`ALTAS`), y el ajuste es la única que puede tapar un
 * faltante (`AJUSTAR`). Con una sola ruta, esa diferencia solo se puede
 * expresar con un `puedeEjecutar(...)` inline dentro del handler — exactamente
 * el segundo lugar donde el `AGENTS.md` de este repo dice que vive la
 * autorización, y el que "no se ve grepeando decoradores".
 *
 * Con rutas separadas, `rg "INSUMOS:AJUSTAR"` devuelve el conjunto COMPLETO de
 * caminos por los que se puede firmar un ajuste. Y las dos formas fallan
 * distinto: si mañana entra una operación nueva, con una sola ruta hereda el
 * gate de `ALTAS` en silencio apenas se agrega a la unión del `tipo`, mientras
 * que acá no tiene por dónde entrar hasta que alguien le escriba una ruta — y
 * escribirla obliga a elegir un decorador.
 *
 * **La entrada y la salida no se unifican entre sí aunque compartan gate**: son
 * dos casos de uso con invariantes distintas —la salida abre transacción y toma
 * el advisory lock, la entrada a propósito no—, así que fusionarlas metería un
 * `switch` sobre el `tipo` en el controller para elegir cuál invocar. El
 * controller se mantiene fino: parsea, delega y mapea.
 *
 * **El `tipo` SÍ viaja en el body del ajuste**, y no es una inconsistencia: la
 * regla que sale de todo lo anterior es que el body puede discriminar mientras
 * NO cambie el permiso. `AJUSTE_POSITIVO` y `AJUSTE_NEGATIVO` son la misma
 * operación de negocio con distinto signo, comparten el gate `INSUMOS:AJUSTAR`
 * y las dos exigen motivo (decisión 4 del diseño), así que el discriminador es
 * inocuo para la autorización. Que el `@IsIn` del DTO lo acote a esas dos
 * direcciones es parte del gate: si admitiera `ENTRADA`, quien solo tiene
 * `AJUSTAR` registraría la operación cotidiana por esta puerta.
 *
 * ## Por qué un controller propio y no dos métodos más en `InsumosController`
 *
 * Los dos modelos de autorización del módulo no se mezclan en un archivo. El
 * ABM del catálogo se gatea 100% por rol (`AdminClienteGuard`, Entrega 1);
 * estas cinco rutas se gatean por la matriz `MODULO:ACCION`. Tenerlas
 * separadas deja las celdas de `INSUMOS` en un solo lugar auditable, y evita
 * que un `@UseGuards` copiado de un método vecino aplique el gate equivocado.
 *
 * ## El `usuarioId` lo estampa el borde, nunca el body
 *
 * Sale siempre de `JWT.sub` vía `@CurrentUser()`. La bitácora existe para
 * responder "quién lo movió": aceptarlo del payload dejaría a cualquiera
 * firmando un movimiento con el nombre de otro. Ningún DTO de entrada lo
 * declara, así que el `ValidationPipe` global (`whitelist: true`) lo descarta
 * antes del handler, y el handler además nunca lo lee del body. Mismo criterio
 * que `solicitanteId` en `ComprasController`.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 2 y 4.
 */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { DomainError } from '../../../shared/domain/result';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

import { RegistrarEntradaInsumoUseCase } from '../../application/use-cases/registrar-entrada-insumo.use-case';
import { RegistrarSalidaInsumoUseCase } from '../../application/use-cases/registrar-salida-insumo.use-case';
import { RegistrarAjusteInsumoUseCase } from '../../application/use-cases/registrar-ajuste-insumo.use-case';
import { ConsultarStockInsumoUseCase } from '../../application/use-cases/consultar-stock-insumo.use-case';
import { ListarMovimientosInsumoUseCase } from '../../application/use-cases/listar-movimientos-insumo.use-case';

// El mapeo `DomainError` → `HttpException` se REUSA del controller del catálogo
// en vez de copiarse: el criterio —solo el insumo de la URL es 404, el resto
// del dominio es 422— es una propiedad del catálogo de errores del módulo, no
// de un controller. Dos copias derivarían, y la que se olvidara de un error
// nuevo lo devolvería con el código equivocado.
import { toHttpException } from './insumos.controller';
import {
  CantidadNoEnteraError,
  MotivoCorreccionSerialInvalidoError,
  MotivoRecuperacionRequeridoError,
  SeguimientoNoModificableError,
  SerialDuplicadoError,
  SerialesNoCoincidenError,
  SerialRequeridoError,
  UnidadDelComponenteNoDisponibleError,
  UnidadNoAdmitidaError,
  UnidadNoDisponibleError,
  UnidadNoEncontradaError,
  UnidadRequeridaError,
} from '../../domain/errors/unidades-insumo.errors';
import {
  UnidadMedidaCambiadaError,
  UnidadMedidaEnUsoPorSerieError,
  UnidadMedidaNoEnteraError,
} from '../../domain/errors/unidades-medida.errors';

import {
  ListarMovimientosInsumoQueryDto,
  ListarMovimientosInsumoResponseDto,
  MovimientoInsumoResponseDto,
  MovimientosRegistradosResponseDto,
  RegistrarAjusteInsumoHttpDto,
  RegistrarMovimientoInsumoHttpDto,
  StockInsumoResponseDto,
  toListarMovimientosInsumoResponseDto,
  toMovimientoInsumoResponseDto,
  toMovimientosRegistradosResponseDto,
  toStockInsumoResponseDto,
} from '../dtos/movimientos-insumo.dto';

/**
 * Mapeo EXPLÍCITO de los errores de unidades por número de serie (ADR-8) a
 * HTTP; el resto del dominio cae en `toHttpException` (404 del insumo, 422 por
 * defecto).
 *
 * - 409: conflicto con el estado vigente —`SerialDuplicadoError` (otra unidad
 *   del insumo ya lleva ese serial) y `UnidadMedidaCambiadaError` (la unidad de
 *   medida cambió mientras se operaba; reintentable)—.
 * - 404: `UnidadNoEncontradaError`.
 * - 422: las demás violaciones de regla de negocio, una por una para que el
 *   mapeo no dependa de que el default siga siendo 422.
 *
 * @param error Error de dominio devuelto por un caso de uso.
 * @returns La excepción HTTP a lanzar.
 */
export function toHttpExceptionMovimiento(
  error: DomainError,
): NotFoundException | UnprocessableEntityException | ConflictException {
  if (error instanceof SerialDuplicadoError || error instanceof UnidadMedidaCambiadaError) {
    return new ConflictException(error.message);
  }
  if (error instanceof UnidadNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  if (
    error instanceof UnidadNoAdmitidaError ||
    error instanceof UnidadRequeridaError ||
    error instanceof UnidadNoDisponibleError ||
    error instanceof SerialesNoCoincidenError ||
    error instanceof SerialRequeridoError ||
    error instanceof CantidadNoEnteraError ||
    error instanceof SeguimientoNoModificableError ||
    error instanceof UnidadMedidaNoEnteraError ||
    error instanceof UnidadMedidaEnUsoPorSerieError ||
    error instanceof MotivoCorreccionSerialInvalidoError ||
    error instanceof MotivoRecuperacionRequeridoError ||
    error instanceof UnidadDelComponenteNoDisponibleError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  return toHttpException(error);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('insumos')
export class MovimientosInsumoController {
  constructor(
    private readonly registrarEntradaInsumoUseCase: RegistrarEntradaInsumoUseCase,
    private readonly registrarSalidaInsumoUseCase: RegistrarSalidaInsumoUseCase,
    private readonly registrarAjusteInsumoUseCase: RegistrarAjusteInsumoUseCase,
    private readonly consultarStockInsumoUseCase: ConsultarStockInsumoUseCase,
    private readonly listarMovimientosInsumoUseCase: ListarMovimientosInsumoUseCase,
  ) {}

  /**
   * POST /insumos/:insumoId/movimientos/entrada — asienta lo que ENTRÓ al
   * depósito.
   *
   * @param user Usuario autenticado; su `sub` firma el asiento.
   * @param insumoId Insumo cuya existencia se mueve.
   * @param dto Cantidad, y opcionalmente motivo, equipo y sector.
   * @returns El asiento registrado.
   * @throws 400 id mal formado, cantidad fuera de rango o de escala, motivo por encima de su tope
   * @throws 401 sin JWT
   * @throws 403 sin `INSUMOS:ALTAS`
   * @throws 404 insumo inexistente o dado de baja
   * @throws 400 además: `seriales` con más de 100, o algún serial fuera de 1 a 255 (recortado y normalizado), o `unidadId` mal formado
   * @throws 409 serial duplicado en el insumo
   * @throws 422 insumo deshabilitado (la entrada es la única que lo exige habilitado), `unidadId` (la entrada no nombra unidades), o seriales que no cuadran con la cantidad / cantidad no entera en un insumo `SERIE`
   */
  @Post(':insumoId/movimientos/entrada')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async registrarEntrada(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Body() dto: RegistrarMovimientoInsumoHttpDto,
  ): Promise<MovimientosRegistradosResponseDto> {
    // La entrada DA DE ALTA unidades: no hay unidad que nombrar.
    if (dto.unidadId != null) {
      throw toHttpExceptionMovimiento(new UnidadNoAdmitidaError(insumoId));
    }

    const result = await this.registrarEntradaInsumoUseCase.executeTodos({
      insumoId,
      cantidad: dto.cantidad,
      usuarioId: user.sub,
      motivo: dto.motivo ?? null,
      equipoId: dto.equipoId ?? null,
      sectorId: dto.sectorId ?? null,
      condicion: dto.condicion,
      seriales: dto.seriales,
    });

    if (result.isFail()) {
      throw toHttpExceptionMovimiento(result.getError());
    }
    return toMovimientosRegistradosResponseDto(result.getValue());
  }

  /**
   * POST /insumos/:insumoId/movimientos/salida — asienta lo que SALIÓ del
   * depósito.
   *
   * Comparte la celda `INSUMOS:ALTAS` con la entrada porque las dos son la
   * operación cotidiana del técnico. Lo que no comparten es la invariante: esta
   * resta, así que el caso de uso decide bajo el advisory lock si hay con qué.
   *
   * @param user Usuario autenticado; su `sub` firma el asiento.
   * @param insumoId Insumo cuya existencia se mueve.
   * @param dto Cantidad, y opcionalmente motivo, equipo y sector.
   * @returns El asiento registrado.
   * @throws 400 id mal formado, cantidad fuera de rango o de escala, motivo por encima de su tope
   * @throws 401 sin JWT
   * @throws 403 sin `INSUMOS:ALTAS`
   * @throws 404 insumo inexistente o dado de baja
   * @throws 422 stock insuficiente
   */
  @Post(':insumoId/movimientos/salida')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async registrarSalida(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Body() dto: RegistrarMovimientoInsumoHttpDto,
  ): Promise<MovimientoInsumoResponseDto> {
    // La salida SACA una unidad existente: no hay seriales que dar de alta.
    if (dto.seriales != null) {
      throw toHttpExceptionMovimiento(new UnidadNoAdmitidaError(insumoId));
    }

    const result = await this.registrarSalidaInsumoUseCase.execute({
      insumoId,
      cantidad: dto.cantidad,
      usuarioId: user.sub,
      motivo: dto.motivo ?? null,
      equipoId: dto.equipoId ?? null,
      sectorId: dto.sectorId ?? null,
      condicion: dto.condicion,
      unidadId: dto.unidadId,
    });

    if (result.isFail()) {
      throw toHttpExceptionMovimiento(result.getError());
    }
    return toMovimientoInsumoResponseDto(result.getValue());
  }

  /**
   * POST /insumos/:insumoId/movimientos/ajuste — corrige la existencia contra
   * el conteo físico, en cualquiera de sus dos direcciones.
   *
   * Ruta propia y celda propia (`INSUMOS:AJUSTAR`): es la única operación que
   * puede tapar un faltante, y separarla de `ALTAS` es lo que permite que
   * quien registra todos los días no sea necesariamente quien firma una
   * corrección.
   *
   * @param user Usuario autenticado; su `sub` firma el asiento.
   * @param insumoId Insumo cuya existencia se corrige.
   * @param dto Dirección del ajuste, cantidad y motivo.
   * @returns El asiento registrado.
   * @throws 400 id mal formado, tipo fuera de las dos direcciones del ajuste, cantidad o motivo fuera de sus topes
   * @throws 401 sin JWT
   * @throws 403 sin `INSUMOS:AJUSTAR` — tener `INSUMOS:ALTAS` no alcanza
   * @throws 404 insumo inexistente o dado de baja
   * @throws 422 motivo sin contenido, o stock insuficiente en un ajuste negativo
   */
  @Post(':insumoId/movimientos/ajuste')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:AJUSTAR')
  @HttpCode(HttpStatus.CREATED)
  async registrarAjuste(
    @CurrentUser() user: JwtPayload,
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Body() dto: RegistrarAjusteInsumoHttpDto,
  ): Promise<MovimientosRegistradosResponseDto> {
    const result = await this.registrarAjusteInsumoUseCase.executeTodos({
      insumoId,
      tipo: dto.tipo,
      cantidad: dto.cantidad,
      usuarioId: user.sub,
      motivo: dto.motivo ?? null,
      equipoId: dto.equipoId ?? null,
      sectorId: dto.sectorId ?? null,
      condicion: dto.condicion,
      seriales: dto.seriales,
      unidadId: dto.unidadId,
    });

    if (result.isFail()) {
      throw toHttpExceptionMovimiento(result.getError());
    }
    return toMovimientosRegistradosResponseDto(result.getValue());
  }

  /**
   * GET /insumos/:insumoId/stock — cuánto hay y si llegó al punto de
   * reposición.
   *
   * Lleva `INSUMOS:LECTURA` aunque el caso de uso no tenga gate propio, y esa
   * asimetría es correcta: un caso de uso no decide quién lo invoca, un
   * endpoint sí. El saldo del depósito no es un dato de catálogo abierto como
   * el listado de insumos — dice cuánto hay de cada cosa.
   *
   * El `sub` del JWT no participa: es una lectura, y el asiento que firma es
   * cosa de las tres rutas de escritura.
   *
   * @param insumoId Insumo cuya existencia se consulta.
   * @returns El saldo con su punto de reposición y su estado de reposición.
   * @throws 400 id mal formado
   * @throws 401 sin JWT
   * @throws 403 sin `INSUMOS:LECTURA`
   * @throws 404 insumo inexistente o dado de baja
   */
  @Get(':insumoId/stock')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async consultarStock(
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
  ): Promise<StockInsumoResponseDto> {
    const result = await this.consultarStockInsumoUseCase.execute(insumoId);

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toStockInsumoResponseDto(result.getValue());
  }

  /**
   * GET /insumos/:insumoId/movimientos — la bitácora de la ficha: qué pasó con
   * la existencia de este insumo, del más reciente al más viejo.
   *
   * Comparte la celda `INSUMOS:LECTURA` con el stock porque las dos lecturas
   * exponen el mismo secreto: qué hay en el depósito. Y es la que además dice
   * de DÓNDE vino cada entrada — el `itemCompraId` que publica el mapper es lo
   * único que distingue un asiento nacido de una recepción de una carga manual.
   *
   * La ventana pedida viaja CRUDA al caso de uso, incluidos sus `undefined`:
   * los defaults de `pagina` y `porPagina` son suyos, y completarlos acá le
   * daría dos dueños a la misma regla. El controller se mantiene fino: parsea,
   * delega y mapea.
   *
   * @param insumoId Insumo cuya bitácora se lista.
   * @param query Ventana pedida; ausente significa la primera página con el tamaño por defecto.
   * @returns La página de movimientos con el total del insumo y la ventana efectiva.
   * @throws 400 id mal formado, o paginación fuera de rango — un `porPagina` menor a 1 invertiría el orden y una `pagina` menor a 1 daría un offset negativo
   * @throws 401 sin JWT
   * @throws 403 sin `INSUMOS:LECTURA`
   * @throws 404 insumo inexistente o dado de baja — una bitácora vacía y un insumo que no está son cosas distintas
   */
  @Get(':insumoId/movimientos')
  @UseGuards(AccionesGuard)
  @RequiereAcciones('INSUMOS:LECTURA')
  async listarMovimientos(
    @Param('insumoId', new ParseUUIDPipe()) insumoId: string,
    @Query() query: ListarMovimientosInsumoQueryDto,
  ): Promise<ListarMovimientosInsumoResponseDto> {
    const result = await this.listarMovimientosInsumoUseCase.execute(insumoId, {
      pagina: query.pagina,
      porPagina: query.porPagina,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toListarMovimientosInsumoResponseDto(result.getValue());
  }
}
