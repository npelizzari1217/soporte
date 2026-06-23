/**
 * TenantGuard — valida que el JWT contenga un cliente_id activo en master.clientes
 * y vincula TenantContext para los repositorios del tenant.
 *
 * Responsabilidades (spec: clientes-tenancy, task 2.D.1):
 *  1. Verifica que el JWT contenga un cliente_id no vacío.
 *  2. Consulta `master.clientes WHERE id = cliente_id` para resolver `db_name`.
 *  3. Verifica `activo = true` y `deleted_at IS NULL` — detecta suspensión en mid-sesión.
 *  4. Obtiene el TenantPrismaClient vía `PrismaService.getTenantClient(dbName)`.
 *  5. Vincula `TenantContext` con `{ prismaClient, dbName, clienteId }` usando
 *     `bind()` (AsyncLocalStorage.enterWith) para que el contexto persista a través
 *     de todo el pipeline del request (interceptors + controller + repositorios).
 *
 * Debe ejecutarse DESPUÉS de JwtAuthGuard (que hidrata `request.user`).
 *
 * PrismaService y TenantContext son @Global (SharedModule) — no requieren imports
 * explícitos en AuthModule.
 *
 * Tarea: 2.D.2 / fix PR-06
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext, TenantContextData } from '../../../shared/tenancy/tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user || !user.cliente_id) {
      throw new ForbiddenException('Acceso denegado: tenant no identificado');
    }

    const cliente = await this.prismaService.getMasterClient().cliente.findUnique({
      where: { id: user.cliente_id },
      select: { id: true, dbName: true, activo: true, deletedAt: true },
    });

    if (!cliente || !cliente.activo || cliente.deletedAt !== null) {
      throw new ForbiddenException('Acceso denegado: cliente inactivo o suspendido');
    }

    const tenantClient = this.prismaService.getTenantClient(cliente.dbName);
    const ctx: TenantContextData = {
      prismaClient: tenantClient,
      dbName: cliente.dbName,
      clienteId: user.cliente_id,
    };

    this.tenantContext.bind(ctx);
    return true;
  }
}
