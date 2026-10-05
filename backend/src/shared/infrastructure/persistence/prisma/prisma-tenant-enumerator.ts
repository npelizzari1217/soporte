/**
 * PrismaTenantEnumerator — implementación del puerto ITenantEnumerator (S5).
 * Opera SIEMPRE sobre la DB MASTER (`PrismaService.getMasterClient()`) — NO
 * usa TenantContext, mismo criterio que `UsuarioMasterChecker`.
 *
 * Tarea: SB5/SB6.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ITenantEnumerator,
  TenantActivo,
  TenantConBase,
} from '../../../domain/ports/i-tenant-enumerator';

@Injectable()
export class PrismaTenantEnumerator implements ITenantEnumerator {
  constructor(private readonly prismaService: PrismaService) {}

  async listActiveTenants(): Promise<TenantActivo[]> {
    const rows = await this.prismaService.getMasterClient().cliente.findMany({
      where: { activo: true, deletedAt: null },
      select: { id: true, dbName: true },
    });
    return rows.map((row: { id: string; dbName: string }) => ({
      clienteId: row.id,
      dbName: row.dbName,
    }));
  }

  async listTenantsConBase(): Promise<TenantConBase[]> {
    const rows = await this.prismaService.getMasterClient().cliente.findMany({
      select: { id: true, dbName: true, activo: true, deletedAt: true },
    });
    return rows.map(
      (row: { id: string; dbName: string; activo: boolean; deletedAt: Date | null }) => ({
        clienteId: row.id,
        dbName: row.dbName,
        vivo: row.activo && row.deletedAt === null,
      }),
    );
  }
}
