/**
 * TareasTicketController — tareas de un ticket de cualquier tipo (odd/tareas-con-tecnico, T3).
 *
 * Rutas:
 *   GET    /tickets/:id/tareas                          → ListarTareasTicketUseCase   → { items, avance }
 *   GET    /tickets/:id/tareas/tecnicos-elegibles       → ListarTecnicosElegiblesTareaUseCase
 *   POST   /tickets/:id/tareas                          → CrearTareaTicketUseCase     → 201, la tarea
 *   PATCH  /tickets/:id/tareas/:tareaId/tecnico         → AsignarTecnicoTareaUseCase  → la tarea
 *   POST   /tickets/:id/tareas/:tareaId/completar       → CompletarTareaUseCase       → la tarea
 *   POST   /tickets/:id/tareas/:tareaId/descompletar    → DescompletarTareaUseCase    → la tarea
 *   DELETE /tickets/:id/tareas/:tareaId                 → EliminarTareaUseCase        → 204
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` + `AccionesGuard`, como `TicketsController`. Ninguna
 * ruta declara `@RequiereAcciones`: quién puede depende del ticket (su responsable, el técnico de
 * la tarea) y de los permisos sobre su tipo (`LECTURA`, `MODIFICACION`), que se conocen recién al
 * cargarlo. Lo decide el caso de uso (`tareas-ticket.reglas.ts`), con el `ActorTarea` que arma
 * `CargadorAlcanceTicket` por request. Un ticket de un tipo sin `LECTURA` es 404 en todas las
 * rutas (odd/permisos-por-tipo-ticket, S3).
 *
 * Errores: el cuerpo es el de Nest (`{ statusCode, message, error }`), igual que el resto de
 * `TicketsController`; no hay códigos de error en la respuesta.
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
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError, Result } from '../../../shared/domain/result';
import { CrearTareaTicketUseCase } from '../../application/use-cases/crear-tarea-ticket.use-case';
import { AsignarTecnicoTareaUseCase } from '../../application/use-cases/asignar-tecnico-tarea.use-case';
import { CompletarTareaUseCase } from '../../application/use-cases/completar-tarea.use-case';
import { DescompletarTareaUseCase } from '../../application/use-cases/descompletar-tarea.use-case';
import { EliminarTareaUseCase } from '../../application/use-cases/eliminar-tarea.use-case';
import { ListarTareasTicketUseCase } from '../../application/use-cases/listar-tareas-ticket.use-case';
import { ListarTecnicosElegiblesTareaUseCase } from '../../application/use-cases/listar-tecnicos-elegibles-tarea.use-case';
import { TecnicoAsignable } from '../../application/use-cases/listar-tecnicos-asignables.use-case';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import {
  TareaAccionNoPermitidaError,
  TareaNoCompletadaError,
  TareaNoEncontradaError,
  TareaTicketNoEditableError,
  TareaYaCompletadaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../../domain/ports/i-usuario-master.checker';
import { CargadorAlcanceTicket } from '../alcance-ticket';
import {
  AsignarTecnicoTareaBodyDto,
  CrearTareaTicketBodyDto,
  TareaTicketResponseDto,
  TareasTicketResponseDto,
  toTareaTicketResponseDto,
  usuariosDeTareas,
} from '../dtos/tarea-ticket.dto';
import { toHttpException } from './tickets.controller';

/**
 * Mapea los errores de los casos de uso de tareas a HTTP. Lo reusan las rutas de subtareas de
 * reparaciones que delegan en estos casos de uso. Cualquier otro error sigue el mapeo de tickets.
 */
export function toHttpExceptionTareas(
  error: DomainError,
): NotFoundException | ConflictException | ForbiddenException | UnprocessableEntityException {
  if (error instanceof TareaNoEncontradaError || error instanceof TicketNoEncontradoError) {
    return new NotFoundException(error.message);
  }
  if (error instanceof TareaYaCompletadaError || error instanceof TareaNoCompletadaError) {
    return new ConflictException(error.message);
  }
  if (error instanceof TareaAccionNoPermitidaError) {
    return new ForbiddenException(error.message);
  }
  if (error instanceof TecnicoTareaNoElegibleError || error instanceof TareaTicketNoEditableError) {
    return new UnprocessableEntityException(error.message);
  }
  return toHttpException(error);
}

function valorOExcepcion<T>(result: Result<T, DomainError>): T {
  if (result.isFail()) throw toHttpExceptionTareas(result.getError());
  return result.getValue();
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets')
export class TareasTicketController {
  constructor(
    private readonly listarTareas: ListarTareasTicketUseCase,
    private readonly listarTecnicosElegibles: ListarTecnicosElegiblesTareaUseCase,
    private readonly crearTarea: CrearTareaTicketUseCase,
    private readonly asignarTecnico: AsignarTecnicoTareaUseCase,
    private readonly completarTarea: CompletarTareaUseCase,
    private readonly descompletarTarea: DescompletarTareaUseCase,
    private readonly eliminarTarea: EliminarTareaUseCase,
    @Inject(USUARIO_MASTER_CHECKER) private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /** Nombres del técnico y de quien completó, en un solo batch cross-DB (sin N+1). */
  private async aDtos(tareas: readonly TareaTicketEntity[]): Promise<TareaTicketResponseDto[]> {
    const nombres = await this.usuarioMasterChecker.resolverNombres(usuariosDeTareas(tareas));
    return tareas.map((tarea) => toTareaTicketResponseDto(tarea, nombres));
  }

  private async aDto(tarea: TareaTicketEntity): Promise<TareaTicketResponseDto> {
    const [dto] = await this.aDtos([tarea]);
    return dto;
  }

  /**
   * GET /tickets/:id/tareas — las lista quien ve el ticket: `LECTURA` sobre su tipo y, sin
   * `VER_TODOS` sobre ese tipo, el solicitante, el responsable o el técnico de una tarea activa
   * (CA10, odd/permisos-por-tipo-ticket S3). Lo decide el caso de uso.
   * @throws 404 ticket inexistente, de otro cliente o no visible para el actor
   */
  @Get(':id/tareas')
  async listar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
  ): Promise<TareasTicketResponseDto> {
    const { tareas, avance } = valorOExcepcion(
      await this.listarTareas.execute({ ticketId, ...(await this.alcances.cargar(user)) }),
    );
    return { items: await this.aDtos(tareas), avance };
  }

  /**
   * GET /tickets/:id/tareas/tecnicos-elegibles — selector de técnico de una tarea. Lo pide quien
   * puede asignar (responsable, ADMINISTRADOR o ROOT con `MODIFICACION` sobre el tipo).
   * @throws 403 ve el ticket pero no puede asignar · 404 ticket inexistente o no visible
   */
  @Get(':id/tareas/tecnicos-elegibles')
  async tecnicosElegibles(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
  ): Promise<TecnicoAsignable[]> {
    return valorOExcepcion(
      await this.listarTecnicosElegibles.execute({
        ticketId,
        actor: await this.alcances.cargarActorTarea(user),
        clienteId: user.cliente_id as string,
      }),
    );
  }

  /**
   * POST /tickets/:id/tareas — alta de una tarea pendiente y sin técnico (CA3).
   * @throws 403 sin permiso · 404 ticket inexistente o no visible
   */
  @Post(':id/tareas')
  @HttpCode(HttpStatus.CREATED)
  async crear(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Body() body: CrearTareaTicketBodyDto,
  ): Promise<TareaTicketResponseDto> {
    const tarea = valorOExcepcion(
      await this.crearTarea.execute({
        ticketId,
        actor: await this.alcances.cargarActorTarea(user),
        descripcion: body.descripcion,
      }),
    );
    return this.aDto(tarea);
  }

  /**
   * PATCH /tickets/:id/tareas/:tareaId/tecnico — asigna (`tecnicoId`) o quita (`null`) el técnico.
   * @throws 403 sin permiso · 404 ticket o tarea · 422 técnico no elegible
   */
  @Patch(':id/tareas/:tareaId/tecnico')
  async asignar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Param('tareaId') tareaId: string,
    @Body() body: AsignarTecnicoTareaBodyDto,
  ): Promise<TareaTicketResponseDto> {
    const tarea = valorOExcepcion(
      await this.asignarTecnico.execute({
        ticketId,
        tareaId,
        actor: await this.alcances.cargarActorTarea(user),
        clienteId: user.cliente_id as string,
        tecnicoId: body.tecnicoId,
      }),
    );
    return this.aDto(tarea);
  }

  /**
   * POST /tickets/:id/tareas/:tareaId/completar — el crédito es del actor (CA4).
   * @throws 403 sin permiso · 404 ticket o tarea · 409 ya completada
   */
  @Post(':id/tareas/:tareaId/completar')
  @HttpCode(HttpStatus.OK)
  async completar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Param('tareaId') tareaId: string,
  ): Promise<TareaTicketResponseDto> {
    const tarea = valorOExcepcion(
      await this.completarTarea.execute({
        ticketId,
        tareaId,
        actor: await this.alcances.cargarActorTarea(user),
      }),
    );
    return this.aDto(tarea);
  }

  /**
   * POST /tickets/:id/tareas/:tareaId/descompletar — vuelve a pendiente y limpia el crédito (CA4).
   * @throws 403 sin permiso · 404 ticket o tarea · 409 no estaba completada
   */
  @Post(':id/tareas/:tareaId/descompletar')
  @HttpCode(HttpStatus.OK)
  async descompletar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Param('tareaId') tareaId: string,
  ): Promise<TareaTicketResponseDto> {
    const tarea = valorOExcepcion(
      await this.descompletarTarea.execute({
        ticketId,
        tareaId,
        actor: await this.alcances.cargarActorTarea(user),
      }),
    );
    return this.aDto(tarea);
  }

  /**
   * DELETE /tickets/:id/tareas/:tareaId — baja lógica (CA3).
   * @throws 403 sin permiso · 404 ticket o tarea
   */
  @Delete(':id/tareas/:tareaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Param('tareaId') tareaId: string,
  ): Promise<void> {
    valorOExcepcion(
      await this.eliminarTarea.execute({
        ticketId,
        tareaId,
        actor: await this.alcances.cargarActorTarea(user),
      }),
    );
  }
}
