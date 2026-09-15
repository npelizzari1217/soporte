import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { MasterPrismaClient, TenantPrismaClient } from './prisma-clients';
import { conUtc } from './utc-connection-string';

/**
 * PrismaService — factory multi-tenant de clientes Prisma.
 *
 * Aislamiento físico database-per-tenant:
 * - Un `MasterPrismaClient` fijo (singleton) apunta a la DB master.
 * - Un `Map<dbName, TenantPrismaClient>` con lazy init y cache por cliente.
 *
 * Prisma 7 pasa la URL de conexión a través de un driver adapter
 * (`@prisma/adapter-pg` + `pg.Pool`) en lugar de `datasourceUrl` en el
 * constructor. Este servicio NUNCA se conecta al construirse — `pg.Pool` es
 * lazy y no abre conexiones TCP hasta la primera query.
 *
 * IMPORTANTE: PrismaService solo debe vivir en infrastructure/. La fitness
 * rule de ESLint (no-restricted-imports) prohíbe importar @prisma/client (y
 * por lo tanto este servicio, transitivamente) fuera de infrastructure/.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly masterClient: InstanceType<typeof MasterPrismaClient>;
  private readonly tenantClients = new Map<string, InstanceType<typeof TenantPrismaClient>>();
  private readonly masterUrl: string;

  // pg.Pool se guarda aparte para poder llamar pool.end() en onModuleDestroy().
  // @prisma/adapter-pg NO cierra el pool en $disconnect() porque no es dueño
  // de él (se lo pasamos como argumento). Sin este cleanup explícito las
  // conexiones TCP quedan abiertas hasta el idle timeout del pool.
  private readonly masterPool: Pool;
  private readonly tenantPools = new Map<string, Pool>();

  constructor(masterUrl: string) {
    this.masterUrl = masterUrl;
    // Pool vía conUtc() (ADR-1, sdd/sesion-utc-y-backfill-de-fechas): fuerza
    // la sesión Postgres a TimeZone='UTC' sin importar el TimeZone del rol o
    // de la base. Único punto autorizado a construir `pg.Pool` (ver el
    // comment de utc-connection-string.ts y la fitness rule de ESLint).
    const pool = conUtc(masterUrl);
    this.masterPool = pool;
    const adapter = new PrismaPg(pool);
    this.masterClient = new MasterPrismaClient({ adapter });
  }

  /**
   * Cliente Prisma de la base de datos master (singleton).
   * Usar para entidades globales: clientes, usuarios, membresias, RBAC.
   */
  getMasterClient(): InstanceType<typeof MasterPrismaClient> {
    return this.masterClient;
  }

  /**
   * Cliente Prisma de la base de datos del tenant indicado.
   * Lazy init: crea el cliente la primera vez y lo cachea para las siguientes.
   *
   * @param dbName Nombre de la DB PostgreSQL del tenant (ej. "cliente_acme").
   */
  getTenantClient(dbName: string): InstanceType<typeof TenantPrismaClient> {
    if (!this.tenantClients.has(dbName)) {
      const tenantUrl = this.buildTenantUrl(dbName);
      // Pool vía conUtc() — misma garantía que el pool master, ver arriba.
      const pool = conUtc(tenantUrl);
      this.tenantPools.set(dbName, pool);
      const adapter = new PrismaPg(pool);
      const client = new TenantPrismaClient({ adapter });
      this.tenantClients.set(dbName, client);
    }
    return this.tenantClients.get(dbName)!;
  }

  /**
   * Construye la URL de conexión de un tenant reemplazando el nombre de DB
   * en la URL master. Ej.: `postgresql://u:p@host:5432/master` →
   * `postgresql://u:p@host:5432/cliente_acme`.
   */
  buildTenantUrl(dbName: string): string {
    const url = new URL(this.masterUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }

  /** Desconecta todos los clientes y cierra los pools al destruir el módulo. */
  async onModuleDestroy(): Promise<void> {
    await this.masterClient.$disconnect();

    const disconnectAll = Array.from(this.tenantClients.values()).map((client) =>
      client.$disconnect(),
    );
    await Promise.all(disconnectAll);
    this.tenantClients.clear();

    await this.masterPool.end().catch(() => undefined);

    const endAll = Array.from(this.tenantPools.values()).map((pool) =>
      pool.end().catch(() => undefined),
    );
    await Promise.all(endAll);
    this.tenantPools.clear();
  }
}
