/**
 * TenantGuard — valida que el JWT contenga un `cliente_id` de un cliente
 * activo/vivo en `master.clientes` y bindea `TenantContext` con el
 * PrismaClient del tenant resuelto.
 *
 * Responsabilidades (R12):
 * 1. Si `cliente_id` es null/vacío → 403 (los endpoints master/root NO
 *    aplican este guard — usan `GlobalAdminGuard` en su lugar).
 * 2. Resuelve `master.clientes WHERE id = cliente_id` vía `IClienteRepository`
 *    (único guard que consulta DB — 1 query por request, ADR-5).
 * 3. Verifica `activo = true && !isDeleted()`; si no → 403 con un
 *    `ForbiddenException` CRUDO. OJO: NO instancia `ClienteInactivoError`.
 *    Ese error de dominio existe y nadie lo usa — ver su comentario en
 *    `domain/errors/auth.errors.ts` antes de asumir que está cableado.
 * 4. Bindea `TenantContext` con `{ prismaClient: getTenantClient(dbName),
 *    dbName, clienteId }` para que los repositorios de infraestructura del
 *    tenant lo consuman sin conocer el ORM directamente (R15).
 *
 * NOTA de diseño (ADR-4): en soporte el switch (re-emisión de token) es el
 * ÚNICO mecanismo de salto de tenant para TODOS (incl. root). NO se
 * implementa el header `X-Tenant-Id` de soporte1 — una sola ruta de
 * autorización, menor superficie.
 *
 * Debe ejecutarse DESPUÉS de `JwtAuthGuard` (que hidrata `request.user`).
 *
 * Tarea: T6.2 (PR6 — Guards + AuthController + AuthModule)
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../../../clientes/domain/ports/i-cliente.repository';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext, TenantContextData } from '../../../shared/tenancy/tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(CLIENTE_REPOSITORY) private readonly clienteRepo: IClienteRepository,
    private readonly prismaService: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user || !user.cliente_id) {
      throw new ForbiddenException('Acceso denegado: tenant no identificado');
    }

    const cliente = await this.clienteRepo.findById(user.cliente_id);

    if (!cliente || !cliente.activo || cliente.isDeleted()) {
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
