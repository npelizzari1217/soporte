/**
 * RoutingController — entry point HTTP del routing usuario↔tipo_ticket
 * (`usuario_tipos_ticket`, spec T3 — PR8).
 *
 * Rutas:
 *   GET    /routing                            → ListarRoutingUseCase (`usuario:gestionar` — item 5)
 *   POST   /routing/:usuarioId/:tipoTicketId   → AsociarUsuarioTipoTicketUseCase (`usuario:gestionar`)
 *   DELETE /routing/:usuarioId/:tipoTicketId   → DesasociarUsuarioTipoTicketUseCase (`usuario:gestionar`)
 *
 * Este vínculo es SOLO enrutamiento de trabajo (quién atiende qué tipo de
 * ticket) — NUNCA un permiso RBAC (spec T3). TODOS los endpoints exigen
 * `usuario:gestionar` (ADMINISTRADOR, mismo permiso que gestiona
 * usuarios/membresías en el módulo auth) — `GET` incluido: es la misma
 * vista de gestión (`RoutingAdminView`), no un catálogo de lectura pública
 * como `GET /catalogos/*` (sdd/beta-frontend item 5, cierra el gap "operaba
 * a ciegas" documentado en apply-progress B4).
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` + `PermissionsGuard`, mismo patrón
 * que `TicketsController`.
 *
 * Tarea: T8.5 (PR8 — endpoints de routing); item 5 (sdd/beta-frontend/backend-gaps).
 */
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AsociarUsuarioTipoTicketUseCase } from '../../application/use-cases/asociar-usuario-tipo-ticket.use-case';
import { DesasociarUsuarioTipoTicketUseCase } from '../../application/use-cases/desasociar-usuario-tipo-ticket.use-case';
import { ListarRoutingUseCase } from '../../application/use-cases/listar-routing.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { RequirePermissions } from '../../../auth/infrastructure/guards/decorators';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('routing')
export class RoutingController {
  constructor(
    private readonly asociarUseCase: AsociarUsuarioTipoTicketUseCase,
    private readonly desasociarUseCase: DesasociarUsuarioTipoTicketUseCase,
    private readonly listarRoutingUseCase: ListarRoutingUseCase,
  ) {}

  /**
   * GET /routing
   * Lista TODAS las asociaciones usuario↔tipo_ticket del tenant (item 5).
   * @throws 403 sin `usuario:gestionar`
   */
  @Get()
  @RequirePermissions('usuario:gestionar')
  async listar(): Promise<{ usuarioId: string; tipoTicketId: string }[]> {
    return this.listarRoutingUseCase.execute();
  }

  /**
   * POST /routing/:usuarioId/:tipoTicketId
   * Habilita a `usuarioId` para atender tickets de `tipoTicketId` (T3).
   * @throws 403 sin `usuario:gestionar`
   * @throws 422 `tipoTicketId` inexistente en el catálogo del tenant
   */
  @Post(':usuarioId/:tipoTicketId')
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.CREATED)
  async asociar(
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Param('tipoTicketId', new ParseUUIDPipe()) tipoTicketId: string,
  ): Promise<{ usuarioId: string; tipoTicketId: string }> {
    const result = await this.asociarUseCase.execute({ usuarioId, tipoTicketId });
    if (result.isFail()) {
      throw new UnprocessableEntityException(result.getError().message);
    }
    return { usuarioId, tipoTicketId };
  }

  /**
   * DELETE /routing/:usuarioId/:tipoTicketId
   * Revoca la elegibilidad de `usuarioId` para `tipoTicketId`. Eliminación
   * física, idempotente (no falla si la fila no existe — T3).
   * @throws 403 sin `usuario:gestionar`
   */
  @Delete(':usuarioId/:tipoTicketId')
  @RequirePermissions('usuario:gestionar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desasociar(
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Param('tipoTicketId', new ParseUUIDPipe()) tipoTicketId: string,
  ): Promise<void> {
    await this.desasociarUseCase.execute({ usuarioId, tipoTicketId });
  }
}
