/**
 * TenantGuard — valida que el JWT contenga un cliente_id activo en master.clientes
 * y vincula TenantContext para los repositorios del tenant.
 *
 * Responsabilidades (spec: clientes-tenancy, task 2.D.1):
 *  1. Verifica que el JWT contenga un cliente_id no vacío.
 *  2. Si el header X-Tenant-Id está presente:
 *     a. SEGURIDAD: solo se honra cuando is_global_admin === true en el JWT.
 *        Si is_global_admin === false con X-Tenant-Id → ForbiddenException (403).
 *     b. Consulta master.clientes WHERE id = X-Tenant-Id para resolver db_name.
 *     c. Verifica activo = true y deleted_at IS NULL.
 *     d. Registra AUDIT LOG con who, target tenant, timestamp.
 *     e. Vincula TenantContext con el tenant objetivo (clienteId = X-Tenant-Id).
 *  3. Sin X-Tenant-Id: comportamiento base:
 *     a. Consulta master.clientes WHERE id = cliente_id para resolver db_name.
 *     b. Verifica activo = true y deleted_at IS NULL.
 *     c. Vincula TenantContext con el propio tenant del usuario.
 *
 * Debe ejecutarse DESPUÉS de JwtAuthGuard (que hidrata request.user).
 *
 * PrismaService y TenantContext son @Global (SharedModule) — no requieren imports
 * explícitos en AuthModule.
 *
 * Tareas: 2.D.2 / fix PR-06 / T3.13 (PR3 Change B)
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext, TenantContextData } from '../../../shared/tenancy/tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload | null; headers: Record<string, string> }>();
    const user = request.user;

    if (!user || !user.cliente_id) {
      throw new ForbiddenException('Acceso denegado: tenant no identificado');
    }

    const xTenantId = request.headers['x-tenant-id'];

    if (xTenantId) {
      return this.resolveCrossTenant(user, xTenantId);
    }

    return this.resolveOwnTenant(user);
  }

  /**
   * Resuelve acceso cross-tenant via header X-Tenant-Id.
   *
   * SEGURIDAD: el header SOLO se honra cuando is_global_admin === true.
   * Un usuario normal que envíe X-Tenant-Id recibe 403 — cero escalación de privilegios.
   */
  private async resolveCrossTenant(user: JwtPayload, targetTenantId: string): Promise<boolean> {
    if (!user.is_global_admin) {
      throw new ForbiddenException(
        'Acceso denegado: operación cross-tenant requiere is_global_admin',
      );
    }

    const targetCliente = await this.prismaService.getMasterClient().cliente.findUnique({
      where: { id: targetTenantId },
      select: { id: true, dbName: true, activo: true, deletedAt: true },
    });

    if (!targetCliente || !targetCliente.activo || targetCliente.deletedAt !== null) {
      throw new NotFoundException('Tenant objetivo no encontrado o inactivo');
    }

    // AUDIT LOG: quién, desde qué tenant, hacia qué tenant, cuándo.
    this.logger.log(
      `CROSS-TENANT ACCESS | usuario=${user.sub} | from=${user.cliente_id} | to=${targetTenantId} | at=${new Date().toISOString()}`,
    );

    const tenantClient = this.prismaService.getTenantClient(targetCliente.dbName);
    const ctx: TenantContextData = {
      prismaClient: tenantClient,
      dbName: targetCliente.dbName,
      clienteId: targetTenantId,
    };

    this.tenantContext.bind(ctx);
    return true;
  }

  /**
   * Resuelve acceso al tenant propio del usuario (comportamiento base, sin cross-tenant).
   */
  private async resolveOwnTenant(user: JwtPayload): Promise<boolean> {
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
