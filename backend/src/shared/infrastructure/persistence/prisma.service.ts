import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { MasterPrismaClient, TenantPrismaClient } from './prisma-clients';

/**
 * PrismaService — factory multi-tenant de clientes Prisma.
 *
 * Implementa el patrón de aislamiento físico database-per-tenant:
 * - Un `MasterPrismaClient` fijo (singleton) apunta a la DB master.
 * - Un `Map<dbName, TenantPrismaClient>` con lazy init y cache por cliente.
 *
 * En Prisma 7, la URL de conexión se pasa a través de un driver adapter
 * (PrismaPg + Pool de pg) en lugar de `datasourceUrl` en el constructor.
 *
 * IMPORTANTE: `PrismaService` solo debe vivir en `infrastructure/`.
 * La fitness rule (0.A.3) prohíbe importarlo fuera de `infrastructure/`.
 *
 * Tarea: 0.C.4
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly masterClient: InstanceType<typeof MasterPrismaClient>;
  private readonly tenantClients = new Map<string, InstanceType<typeof TenantPrismaClient>>();
  private readonly masterUrl: string;

  constructor(masterUrl: string) {
    this.masterUrl = masterUrl;
    const pool = new Pool({ connectionString: masterUrl });
    const adapter = new PrismaPg(pool);
    this.masterClient = new MasterPrismaClient({ adapter } as any);
  }

  /**
   * Retorna el cliente Prisma de la base de datos master (singleton).
   * Usar para entidades globales: clientes, usuarios, RBAC.
   */
  getMasterClient(): InstanceType<typeof MasterPrismaClient> {
    return this.masterClient;
  }

  /**
   * Retorna el cliente Prisma de la base de datos del tenant indicado.
   * Lazy init: crea el cliente la primera vez y lo cachea para las siguientes.
   *
   * @param dbName Nombre de la DB PostgreSQL del tenant (ej. "cliente_acme").
   */
  getTenantClient(dbName: string): InstanceType<typeof TenantPrismaClient> {
    if (!this.tenantClients.has(dbName)) {
      const tenantUrl = this.buildTenantUrl(dbName);
      const pool = new Pool({ connectionString: tenantUrl });
      const adapter = new PrismaPg(pool);
      const client = new TenantPrismaClient({ adapter } as any);
      this.tenantClients.set(dbName, client);
    }
    return this.tenantClients.get(dbName)!;
  }

  /**
   * Construye la URL de conexión de un tenant reemplazando el nombre de DB
   * en la URL master. Ej.: `postgresql://u:p@host:5432/master` →
   * `postgresql://u:p@host:5432/cliente_acme`.
   *
   * @param dbName Nombre de la base de datos del tenant.
   */
  buildTenantUrl(dbName: string): string {
    // La URL tiene el formato: postgresql://user:pass@host:port/dbname[?params]
    // Reemplazamos únicamente el segmento de nombre de DB.
    const url = new URL(this.masterUrl);
    // url.pathname es '/<dbname>'; reemplazamos con '/<tenantDbName>'
    url.pathname = `/${dbName}`;
    return url.toString();
  }

  /**
   * Desconecta todos los clientes al destruir el módulo NestJS.
   * Previene connection leaks en shutdown gracioso.
   */
  async onModuleDestroy(): Promise<void> {
    await this.masterClient.$disconnect();

    const disconnectAll = Array.from(this.tenantClients.values()).map((client) =>
      client.$disconnect(),
    );
    await Promise.all(disconnectAll);
    this.tenantClients.clear();
  }
}
