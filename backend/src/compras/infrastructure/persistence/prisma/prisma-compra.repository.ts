/**
 * PrismaCompraRepository — implementación del puerto ICompraRepository
 * (ADR-C2, PR-11).
 *
 * Reglas (mismo patrón que `PrismaTicketRepository`):
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - `guardar()`/`guardarItem()` son upsert por id (INSERT si nuevo, UPDATE si
 *   existe); nunca pisan `createdAt` en el UPDATE.
 * - `findByIdConItems()` incluye compras soft-deleted (la entidad exige
 *   `items` siempre cargados — ver `CompraEntity.reconstitute`);
 *   `findAllConItems()` las excluye.
 * - `findLastSecuencia()` (ADR-C5): bajo un advisory lock transaccional de
 *   Postgres, ver JSDoc del método.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.1 (S1-S3). Ref design:
 * ADR-C2, ADR-C5. Tarea: PR-11.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICompraRepository, CompraListFiltros } from '../../../domain/ports/i-compra.repository';
import { CompraEntity } from '../../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';
import { CompraMapper } from './compra.mapper';
import { ItemCompraMapper } from './item-compra.mapper';

@Injectable()
export class PrismaCompraRepository implements ICompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /** Retorna el cliente Prisma del tenant activo. Lanza si no hay TenantContext activo. */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * Busca una compra por id, con TODOS sus ítems cargados (activos y
   * soft-deleted). Incluye compras soft-deleted — `findByIdConItems` no
   * filtra por `deletedAt` (a diferencia de `findAllConItems`): el caller
   * (casos de uso de detalle) necesita poder mostrar/auditar una compra
   * eliminada por id explícito.
   */
  async findByIdConItems(id: string): Promise<CompraEntity | null> {
    const row = await this.client.compra.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? CompraMapper.toDomain(row) : null;
  }

  /**
   * Retorna las compras del tenant activo con sus ítems cargados (S32),
   * excluye soft-deleted, ordenadas por `created_at DESC`. `filtros.limit`/
   * `filtros.offset` aplican paginación vía `take`/`skip` — una sola
   * sentencia SQL gracias al `include` (el `count` de paginación, si el
   * caller lo necesita, es una segunda sentencia aparte, a cargo del caso de
   * uso — S32 exige máximo 2, no 1).
   */
  async findAllConItems(filtros?: CompraListFiltros): Promise<CompraEntity[]> {
    const rows = await this.client.compra.findMany({
      where: { deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      ...(filtros?.limit !== undefined && { take: filtros.limit }),
      ...(filtros?.offset !== undefined && { skip: filtros.offset }),
    });
    return rows.map((row) => CompraMapper.toDomain(row));
  }

  /**
   * Retorna la última secuencia LOCAL (tenant+año) usada en `numero`
   * (formato `COM-{anio}-{SEQ5}`). 0 si no hay compras previas de ese año.
   *
   * Concurrencia (ADR-C5, espejo de `PrismaTicketRepository.findLastSecuencia`
   * en `prisma-ticket.repository.ts:73-90`): ANTES de leer, adquiere un
   * advisory lock transaccional de Postgres
   * (`pg_advisory_xact_lock(hashtext(...))`) scopeado a `compra-numero:año`.
   * El advisory lock serializa TODA la sección crítica (lectura de secuencia
   * + INSERT de la compra) para el mismo año, incluso para la PRIMERA
   * compra del año (no hay fila previa que lockear con `FOR UPDATE`). El
   * lock se libera automáticamente al cerrar la transacción (commit o
   * rollback) — nunca hay que liberarlo manualmente.
   *
   * **MEJORA sobre `PrismaTicketRepository` (deliberada, no una copia)**: el
   * `LIKE` es LEFT-ANCHORED (`'COM-{anio}-%'`), a diferencia del
   * `'%-{anio}-%'` de tickets. Al anclar el patrón al inicio de la columna,
   * Postgres puede resolver la búsqueda con un range scan sobre el índice
   * único de `numero` (`@unique`) en vez de un seq scan completo de la
   * tabla — un `LIKE` con wildcard inicial (`%...`) nunca puede usar un
   * índice B-tree de esa forma. El formato de `numero` es siempre
   * `COM-{anio}-{SEQ5}` (prefijo fijo, sin variación por tipo como en
   * tickets), así que anclar al inicio no pierde ningún caso: no existe un
   * `numero` de compra válido que empiece distinto de `COM-`.
   *
   * **CRÍTICO — el lock SOLO sirve si `findLastSecuencia()` y el `guardar()`
   * subsiguiente de la compra corren DENTRO de la MISMA transacción**
   * (`ITenantTransactionRunner.run(...)`, como hará `CrearCompraUseCase`,
   * PR-14). Invocado FUERA de una transacción explícita, Postgres abre una
   * transacción implícita de una sola sentencia: el lock se adquiere y
   * libera de inmediato, sin efecto de serialización — dos llamadas
   * concurrentes a `findLastSecuencia()` sueltas (sin `guardar()` en la
   * misma tx) verían la MISMA secuencia y ambos números duplicados
   * pasarían el lock, aunque después el `@unique` de `numero` rechace el
   * segundo INSERT. La protección real de S3 depende de que el caller
   * envuelva lectura + escritura en un solo `run(...)`.
   */
  async findLastSecuencia(anio: number): Promise<number> {
    const lockKey = `compra-numero:${anio}`;
    await this.client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const rows = await this.client.$queryRaw<Array<{ numero: string }>>`
      SELECT numero FROM compras
      WHERE numero LIKE ${`COM-${anio}-%`}
      ORDER BY numero DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return 0;
    }

    const partes = rows[0].numero.split('-');
    return parseInt(partes[partes.length - 1], 10) || 0;
  }

  /**
   * Persiste SOLO los campos de cabecera de la compra (upsert por id, ADR-C2
   * — `items` los persiste `guardarItem()` por separado). Nunca pisa
   * `createdAt` en el UPDATE.
   */
  async guardar(compra: CompraEntity): Promise<void> {
    const data = CompraMapper.toPersistence(compra);
    // createdAt se incluye en el CREATE; se excluye del UPDATE para nunca
    // pisar el timestamp de creación existente en DB.
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.compra.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  /** Persiste un ítem individual del agregado (upsert por id). Mismo criterio de `createdAt` que `guardar()`. */
  async guardarItem(item: ItemCompraEntity): Promise<void> {
    const data = ItemCompraMapper.toPersistence(item);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.itemCompra.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
