/**
 * KbController — entry point HTTP de la Ayuda (K1-K4). Los artículos son
 * ÚNICOS y GLOBALES: viven en la DB master, iguales para todos los clientes.
 *
 * Rutas:
 *   POST   /kb                 → CrearKbArticuloUseCase (ROOT)
 *   GET    /kb                 → ListarKbArticulosUseCase (`KB:LECTURA`; scope K3)
 *   GET    /kb/:id             → ObtenerKbArticuloUseCase (`KB:LECTURA`; scope K3)
 *   PATCH  /kb/:id             → EditarKbArticuloUseCase (ROOT)
 *   PATCH  /kb/:id/visibilidad → CambiarVisibilidadKbArticuloUseCase (ROOT) — publicar/despublicar (K2)
 *   DELETE /kb/:id             → EliminarKbArticuloUseCase (ROOT) — soft delete (K1)
 *
 * ESCRITURA reservada a ROOT (`GlobalAdminGuard`, aplicado por MÉTODO): al ser
 * una sola Ayuda para todo el sistema, un administrador de cliente que la
 * editara estaría cambiando lo que leen los demás clientes. Las celdas
 * `KB:ALTAS`/`KB:MODIFICACION`/`KB:BORRADO`/`KB:PUBLICAR` siguen existiendo en
 * el catálogo y se siguen dibujando en la grilla, pero ya no gobiernan nada:
 * sacarlas obligaría a migrar el CHECK compuesto de `usuario_cliente_permisos`
 * y a limpiar filas en producción, riesgo desproporcionado frente al beneficio.
 *
 * LECTURA sigue gateada por `KB:LECTURA` (`AccionesGuard`), y esa celda es
 * además de la que el menú lateral deriva el ítem "Ayuda". El scope de FILAS
 * (publicados vs. todos) se resuelve DENTRO del use case según si el actor
 * tiene `KB:VER_TODOS` (K3, R11) — eso NO cambió.
 *
 * SIN `TenantGuard`, a diferencia del resto de los controllers de negocio: el
 * módulo dejó de tocar la DB del cliente, y exigir un tenant activo dejaría a
 * un ROOT sin cliente seleccionado sin poder mantener la Ayuda global. La
 * lectura no queda abierta por eso: `KB:LECTURA` sale de la matriz del cliente
 * activo y sin membresía viva el JWT no la trae.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException`.
 *
 * Ref spec: sdd/premium/spec K1-K4. Tarea: K7/K8.
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
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CrearKbArticuloUseCase } from '../../application/use-cases/crear-kb-articulo.use-case';
import { EditarKbArticuloUseCase } from '../../application/use-cases/editar-kb-articulo.use-case';
import { CambiarVisibilidadKbArticuloUseCase } from '../../application/use-cases/cambiar-visibilidad-kb-articulo.use-case';
import { EliminarKbArticuloUseCase } from '../../application/use-cases/eliminar-kb-articulo.use-case';
import { ObtenerKbArticuloUseCase } from '../../application/use-cases/obtener-kb-articulo.use-case';
import { ListarKbArticulosUseCase } from '../../application/use-cases/listar-kb-articulos.use-case';
import {
  CambiarVisibilidadKbArticuloDto,
  CreateKbArticuloDto,
  EditKbArticuloDto,
  KbArticuloResponseDto,
  ListKbArticulosQueryDto,
  ListKbArticulosResponseDto,
  toKbArticuloResponseDto,
} from '../dtos/kb-articulo.dto';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { puedeEjecutar } from '../../../auth/domain/permisos.util';
import { DomainError } from '../../../shared/domain/result';

const ACCION_VER_TODOS = 'KB:VER_TODOS';

/** Mapea un `DomainError` de los use cases de KB a la `HttpException` correspondiente. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof KbArticuloNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  // TituloVacioError / ContenidoVacioError → 422.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, AccionesGuard)
@Controller('kb')
export class KbController {
  constructor(
    private readonly crearKbArticuloUseCase: CrearKbArticuloUseCase,
    private readonly editarKbArticuloUseCase: EditarKbArticuloUseCase,
    private readonly cambiarVisibilidadKbArticuloUseCase: CambiarVisibilidadKbArticuloUseCase,
    private readonly eliminarKbArticuloUseCase: EliminarKbArticuloUseCase,
    private readonly obtenerKbArticuloUseCase: ObtenerKbArticuloUseCase,
    private readonly listarKbArticulosUseCase: ListarKbArticulosUseCase,
  ) {}

  /**
   * POST /kb
   * Crea un artículo. `autorId` = JWT.sub (K1). Nace interno
   * (`visibleParaSolicitante=false`) — se publica vía `PATCH /kb/:id/visibilidad`.
   * @throws 403 si el actor no es ROOT
   * @throws 422 titulo/contenido vacíos
   */
  @Post()
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateKbArticuloDto,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.crearKbArticuloUseCase.execute({
      titulo: dto.titulo,
      contenido: dto.contenido,
      autorId: user.sub,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toKbArticuloResponseDto(result.getValue());
  }

  /**
   * GET /kb
   * Lista artículos con filtros combinables + paginación. El scope
   * (publicados vs. todos) se deriva del permiso `KB:VER_TODOS` del
   * actor (K3) — esa celda NO se requiere para listar. `KB:LECTURA` sí se
   * requiere para poder entrar al listado (corrección post-verify, R5).
   */
  @Get()
  @RequiereAcciones('KB:LECTURA')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListKbArticulosQueryDto,
  ): Promise<ListKbArticulosResponseDto> {
    const result = await this.listarKbArticulosUseCase.execute({
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
      busqueda: query.busqueda,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: result.items.map(toKbArticuloResponseDto),
      total: result.total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  /**
   * GET /kb/:id
   * Consulta un artículo. Sin `KB:VER_TODOS`, solo si está publicado
   * (`visibleParaSolicitante=true`) y activo — caso contrario 404 (no
   * revela existencia, K3).
   */
  @Get(':id')
  @RequiereAcciones('KB:LECTURA')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.obtenerKbArticuloUseCase.execute({
      id,
      tienePermisoVerTodos: puedeEjecutar(user, ACCION_VER_TODOS),
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toKbArticuloResponseDto(result.getValue());
  }

  /**
   * PATCH /kb/:id
   * Edita titulo/contenido. NO cambia visibilidad (endpoint dedicado, K2).
   * @throws 403 si el actor no es ROOT
   * @throws 404 artículo inexistente
   * @throws 422 titulo/contenido vacíos
   */
  @Patch(':id')
  @UseGuards(GlobalAdminGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: EditKbArticuloDto,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.editarKbArticuloUseCase.execute({
      id,
      titulo: dto.titulo,
      contenido: dto.contenido,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toKbArticuloResponseDto(result.getValue());
  }

  /**
   * PATCH /kb/:id/visibilidad
   * Publica (`visible=true`) o despublica (`visible=false`) un artículo (K2).
   * @throws 403 si el actor no es ROOT
   * @throws 404 artículo inexistente
   */
  @Patch(':id/visibilidad')
  @UseGuards(GlobalAdminGuard)
  async cambiarVisibilidad(
    @Param('id') id: string,
    @Body() dto: CambiarVisibilidadKbArticuloDto,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.cambiarVisibilidadKbArticuloUseCase.execute({
      id,
      visible: dto.visible,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toKbArticuloResponseDto(result.getValue());
  }

  /**
   * DELETE /kb/:id
   * Baja lógica (soft delete) de un artículo (K1).
   * @throws 403 si el actor no es ROOT
   * @throws 404 artículo inexistente/ya eliminado
   */
  @Delete(':id')
  @UseGuards(GlobalAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarKbArticuloUseCase.execute({ id });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
