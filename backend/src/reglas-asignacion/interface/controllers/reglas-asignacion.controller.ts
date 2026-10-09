/**
 * ReglasAsignacionController — configuración de la asignación automática por tipo.
 *
 *   GET /reglas-asignacion          → ADMINISTRADOR/ROOT
 *   PUT /reglas-asignacion/:tipoId  → ADMINISTRADOR/ROOT
 *
 * `JwtAuthGuard, TenantGuard` por clase y `AdminClienteGuard` por método (molde
 * `PoliticaTfaController`). Sin permiso nuevo en la matriz (R5). El `clienteId` sale de
 * `actor.cliente_id`, nunca del body.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { DomainError } from '../../../shared/domain/result';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import {
  ListarReglasAsignacionUseCase,
  ReglasAsignacionVista,
} from '../../application/use-cases/listar-reglas-asignacion.use-case';
import { ConfigurarReglaAsignacionUseCase } from '../../application/use-cases/configurar-regla-asignacion.use-case';
import { ReglaAsignacionFila } from '../../domain/estado-regla-asignacion';
import { TipoTicketNoConfigurableError } from '../../domain/errors';
import { ConfigurarReglaAsignacionBodyDto } from '../dtos/reglas-asignacion.dto';

/** 404 si el tipo no existe o está dado de baja; 422 para el resto (responsable no elegible). */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof TipoTicketNoConfigurableError) {
    return new NotFoundException(error.message);
  }
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('reglas-asignacion')
export class ReglasAsignacionController {
  constructor(
    private readonly listarUseCase: ListarReglasAsignacionUseCase,
    private readonly configurarUseCase: ConfigurarReglaAsignacionUseCase,
  ) {}

  /**
   * GET /reglas-asignacion — una fila por tipo activo y los candidatos por módulo.
   *
   * @throws 403 sin rol ADMINISTRADOR ni ROOT
   */
  @Get()
  @UseGuards(AdminClienteGuard)
  async listar(@CurrentUser() user: JwtPayload): Promise<ReglasAsignacionVista> {
    return this.listarUseCase.execute(user.cliente_id as string);
  }

  /**
   * PUT /reglas-asignacion/:tipoId — fija, reemplaza o quita (`null`) la regla del tipo.
   *
   * @throws 403 sin rol ADMINISTRADOR ni ROOT
   * @throws 404 tipo inexistente o dado de baja
   * @throws 422 responsable no elegible para el tipo
   */
  @Put(':tipoId')
  @UseGuards(AdminClienteGuard)
  @HttpCode(HttpStatus.OK)
  async configurar(
    @CurrentUser() user: JwtPayload,
    @Param('tipoId', new ParseUUIDPipe()) tipoId: string,
    @Body() dto: ConfigurarReglaAsignacionBodyDto,
  ): Promise<ReglaAsignacionFila> {
    const result = await this.configurarUseCase.execute({
      tipoId,
      responsableId: dto.responsableId,
      clienteId: user.cliente_id as string,
      actorId: user.sub,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return result.getValue();
  }
}
