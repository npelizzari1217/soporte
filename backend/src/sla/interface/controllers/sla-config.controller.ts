/**
 * SlaConfigController — entry point HTTP del CRUD lectura/edición de
 * `sla_config` (S1).
 *
 * Rutas:
 *   GET   /sla/config      → ListarSlaConfigUseCase
 *   PATCH /sla/config/:id  → EditarSlaConfigUseCase
 *
 * TODAS las rutas exigen el permiso `catalogo:gestionar` (reusado — decisión
 * explícita del dueño: sin permiso nuevo `sla:gestionar`, mismo criterio que
 * `CatalogosController`). GET también está gateado (a diferencia de
 * `CatalogosController` cuyo GET es implícito en el catálogo de lectura de
 * tickets): la config de SLA no es un catálogo de referencia público del
 * tenant, es configuración administrativa.
 *
 * El controller no tiene lógica de negocio: solo traduce HTTP ↔ use case y
 * mapea `DomainError` → `HttpException`.
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA8/SA9.
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ListarSlaConfigUseCase } from '../../application/use-cases/listar-sla-config.use-case';
import { EditarSlaConfigUseCase } from '../../application/use-cases/editar-sla-config.use-case';
import {
  EditSlaConfigDto,
  SlaConfigResponseDto,
  toSlaConfigResponseDto,
} from '../dtos/sla-config.dto';
import { SlaConfigNoEncontradaError } from '../../domain/errors/sla.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { DomainError } from '../../../shared/domain/result';

const PERMISO_CATALOGO_GESTIONAR = 'catalogo:gestionar';

/** Mapea un `DomainError` de los use cases de sla_config a la `HttpException` correspondiente. */
function toHttpException(error: DomainError): NotFoundException | UnprocessableEntityException {
  if (error instanceof SlaConfigNoEncontradaError) {
    return new NotFoundException(error.message);
  }
  // HorasInvalidasError → 422.
  return new UnprocessableEntityException(error.message);
}

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermissions(PERMISO_CATALOGO_GESTIONAR)
@Controller('sla/config')
export class SlaConfigController {
  constructor(
    private readonly listarSlaConfigUseCase: ListarSlaConfigUseCase,
    private readonly editarSlaConfigUseCase: EditarSlaConfigUseCase,
  ) {}

  /**
   * GET /sla/config
   * Lista las 4 filas de `sla_config` del tenant (una por prioridad fija).
   * @throws 403 sin `catalogo:gestionar`
   */
  @Get()
  async listar(): Promise<SlaConfigResponseDto[]> {
    const configs = await this.listarSlaConfigUseCase.execute();
    return configs.map(toSlaConfigResponseDto);
  }

  /**
   * PATCH /sla/config/:id
   * Edita `horas`/`activo` de una config existente. NO crea/elimina filas.
   * @throws 403 sin `catalogo:gestionar`
   * @throws 404 config inexistente
   * @throws 422 `horas` <= 0
   */
  @Patch(':id')
  async editar(
    @Param('id') id: string,
    @Body() dto: EditSlaConfigDto,
  ): Promise<SlaConfigResponseDto> {
    const result = await this.editarSlaConfigUseCase.execute({
      id,
      horas: dto.horas,
      activo: dto.activo,
    });
    if (result.isFail()) {
      throw toHttpException(result.getError());
    }
    return toSlaConfigResponseDto(result.getValue());
  }
}
