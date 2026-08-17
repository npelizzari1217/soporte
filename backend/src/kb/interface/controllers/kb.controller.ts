/**
 * KbController — entry point HTTP del CRUD de la base de conocimiento (K1-K4).
 *
 * Rutas:
 *   POST   /kb                → CrearKbArticuloUseCase (`kb:gestionar`)
 *   GET    /kb                → ListarKbArticulosUseCase (cualquier tenant autenticado; scope K3)
 *   GET    /kb/:id             → ObtenerKbArticuloUseCase (cualquier tenant autenticado; scope K3)
 *   PATCH  /kb/:id             → EditarKbArticuloUseCase (`kb:gestionar`)
 *   PATCH  /kb/:id/visibilidad → CambiarVisibilidadKbArticuloUseCase (`kb:gestionar`) — publicar/despublicar (K2)
 *   DELETE /kb/:id             → EliminarKbArticuloUseCase (`kb:gestionar`) — soft delete (K1)
 *
 * Guards a nivel de controller: `JwtAuthGuard` + `TenantGuard` +
 * `AccionesGuard` (WU-7.3, sdd/matriz-permisos-por-usuario) — los dos
 * primeros SIEMPRE aplican; `AccionesGuard` solo actúa cuando el endpoint
 * declara `@RequiereAcciones(...)` (sin metadata → pass-through). Los
 * endpoints GET declaran `@RequiereAcciones('KB:LECTURA')` (corrección
 * post-verify, R5): el backfill le da esa celda a TODA membresía activa
 * (regla universal, R7), nadie pierde acceso hoy, pero la casilla de la
 * grilla del ABM pasa a gobernar algo real. El scope de FILAS (publicados
 * vs. todos) sigue resolviéndose DENTRO del use case según si el actor
 * tiene `KB:VER_TODOS` (K3, R11) — mismo criterio que
 * `TicketsController.findAll`/`findOne`, eso NO cambió.
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
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
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

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
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
   * @throws 403 sin `kb:gestionar`
   * @throws 422 titulo/contenido vacíos
   */
  @Post()
  @RequiereAcciones('KB:ALTAS')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateKbArticuloDto,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.crearKbArticuloUseCase.execute({
      titulo: dto.titulo,
      contenido: dto.contenido,
      tipoTicketId: dto.tipoTicketId ?? null,
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
      tipoTicketId: query.tipoTicketId,
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
   * Edita titulo/contenido/tipoTicketId. NO cambia visibilidad (endpoint
   * dedicado, K2).
   * @throws 403 sin `kb:gestionar`
   * @throws 404 artículo inexistente/otro tenant
   * @throws 422 titulo/contenido vacíos
   */
  @Patch(':id')
  @RequiereAcciones('KB:MODIFICACION')
  async update(
    @Param('id') id: string,
    @Body() dto: EditKbArticuloDto,
  ): Promise<KbArticuloResponseDto> {
    const result = await this.editarKbArticuloUseCase.execute({
      id,
      titulo: dto.titulo,
      contenido: dto.contenido,
      tipoTicketId: dto.tipoTicketId,
    });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toKbArticuloResponseDto(result.getValue());
  }

  /**
   * PATCH /kb/:id/visibilidad
   * Publica (`visible=true`) o despublica (`visible=false`) un artículo (K2).
   * @throws 403 sin `kb:gestionar`
   * @throws 404 artículo inexistente/otro tenant
   */
  @Patch(':id/visibilidad')
  @RequiereAcciones('KB:PUBLICAR')
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
   * @throws 403 sin `kb:gestionar`
   * @throws 404 artículo inexistente/otro tenant/ya eliminado
   */
  @Delete(':id')
  @RequiereAcciones('KB:BORRADO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    const result = await this.eliminarKbArticuloUseCase.execute({ id });

    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
  }
}
