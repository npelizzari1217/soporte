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
 *   `findPaginaConItems()` las excluye.
 * - `findLastSecuencia()` (ADR-C5): bajo un advisory lock transaccional de
 *   Postgres, ver JSDoc del método.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.1 (S1-S3). Ref design:
 * ADR-C2, ADR-C5. Tarea: PR-11.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ICompraRepository,
  CompraListFiltros,
  CompraPaginaConItems,
} from '../../../domain/ports/i-compra.repository';
import { ORDEN_GRUPO_ESTADO_COMPRA } from '../../../domain/services/estado-compra';
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
   * filtra por `deletedAt` (a diferencia de `findPaginaConItems`): el caller
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
   * Condiciones de filtro sobre la CABECERA (`compras c`), las que no
   * dependen del grupo derivado: soft-delete, ciclo, sector y rango de
   * `fecha_solicitud`. Devuelve un fragmento `Prisma.Sql` con TODOS los
   * valores como parámetros ligados — nunca interpolación de strings (es
   * multi-tenant: una concatenación acá es una inyección).
   *
   * `::uuid` explícito en ciclo/sector: el parámetro viaja como texto y
   * Postgres no compara `uuid = text` sin un cast. `::date` en las fechas:
   * `fecha_solicitud` es `DATE` puro, así que el filtro se expresa como
   * fecha calendaria (misma semántica UTC con la que Prisma escribe y lee
   * un `@db.Date`), sin arrastrar la hora ni el offset del `Date` de JS.
   */
  private condicionesDeCabecera(filtros?: CompraListFiltros): Prisma.Sql {
    const condiciones: Prisma.Sql[] = [Prisma.sql`c.deleted_at IS NULL`];

    if (filtros?.cicloId !== undefined) {
      condiciones.push(Prisma.sql`c.ciclo_id = ${filtros.cicloId}::uuid`);
    }
    if (filtros?.sectorId !== undefined) {
      condiciones.push(Prisma.sql`c.sector_id = ${filtros.sectorId}::uuid`);
    }
    if (filtros?.fechaDesde !== undefined) {
      condiciones.push(
        Prisma.sql`c.fecha_solicitud >= ${PrismaCompraRepository.aFechaCalendaria(filtros.fechaDesde)}::date`,
      );
    }
    if (filtros?.fechaHasta !== undefined) {
      condiciones.push(
        Prisma.sql`c.fecha_solicitud <= ${PrismaCompraRepository.aFechaCalendaria(filtros.fechaHasta)}::date`,
      );
    }

    return Prisma.join(condiciones, ' AND ');
  }

  /** `Date` de JS a `YYYY-MM-DD` en UTC — el mismo componente de fecha que Prisma persiste en un `@db.Date`. */
  private static aFechaCalendaria(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
  }

  /**
   * Condición sobre el grupo derivado (WU-25). `TODAS`/`undefined` no
   * restringe; el resto compara contra el ordinal de
   * `ORDEN_GRUPO_ESTADO_COMPRA` — la MISMA constante que arma el `CASE` del
   * SQL, así que filtro y orden no pueden desalinearse.
   */
  private condicionDeGrupo(filtros?: CompraListFiltros): Prisma.Sql {
    const grupo = filtros?.grupoEstado;
    if (grupo === undefined || grupo === 'TODAS') {
      return Prisma.sql`TRUE`;
    }
    return Prisma.sql`grupo = ${ORDEN_GRUPO_ESTADO_COMPRA[grupo]}::int`;
  }

  /**
   * Resuelve, en UNA sentencia, los ids de la página YA ORDENADOS más el
   * `total` del universo filtrado completo (WU-25).
   *
   * El `LEFT JOIN LATERAL` calcula de un solo barrido de `items_compra` los
   * MISMOS conteos que recibe `derivarEstadoDesdeConteos`
   * (`estado-compra.ts`): `n`, `n_pendientes`, `n_aprobados`,
   * `n_rechazados`; más `n_aprobados_no_entregados`, que es la negación
   * SQL de `itemEntregado` (`cantidad_entregada >= cantidad ∨
   * cerrado_con_faltante`, S22). `i.deleted_at IS NULL` deja los ítems
   * soft-deleted fuera de TODOS los conteos (F6 de la matriz WU-12).
   *
   * La comparación `cantidad_entregada < cantidad` es exacta sin pasar por
   * centésimas: ambas columnas son `DECIMAL(10,2)` y Postgres compara
   * `numeric` en decimal exacto, así que equivale a la comparación en
   * centésimas de `enCentesimas` (ADR-C3) — no hay float de por medio. Los
   * fixtures F11/F12 de la matriz WU-12 ejercitan justamente ese borde.
   *
   * El `CASE` transcribe la definición de los tres grupos EN EL MISMO ORDEN
   * de evaluación que `derivarGrupoEstadoCompra`: primero `CANCELADAS`
   * (Regla 0 ∪ T5), después `ACTIVAS` (¬cerrado), y `COMPLETADAS` como
   * `ELSE`. Al ser un `CASE` encadenado, la exclusividad y la exhaustividad
   * son estructurales, igual que en el dominio.
   *
   * Devuelve SIEMPRE exactamente una fila: los ids viajan agregados en un
   * `array_agg` (`ARRAY[]` cuando la página quedó vacía), así que el
   * `total` llega incluso con `offset` más allá del universo — el borde que
   * en su momento descartó `COUNT(*) OVER()`.
   */
  private async idsDePaginaOrdenados(
    filtros?: CompraListFiltros,
  ): Promise<{ ids: string[]; total: number }> {
    const condicionesCabecera = this.condicionesDeCabecera(filtros);
    const condicionGrupo = this.condicionDeGrupo(filtros);
    const limite = filtros?.limit !== undefined ? Prisma.sql`LIMIT ${filtros.limit}` : Prisma.empty;
    const desplazamiento =
      filtros?.offset !== undefined ? Prisma.sql`OFFSET ${filtros.offset}` : Prisma.empty;

    const filas = await this.client.$queryRaw<Array<{ ids: string[]; total: number }>>`
      WITH agrupadas AS (
        SELECT
          c.id,
          c.fecha_solicitud,
          c.created_at,
          CASE
            WHEN c.cancelada_en IS NOT NULL
              OR (k.n > 0 AND k.n_pendientes = 0 AND k.n_aprobados = 0 AND k.n_rechazados >= 1)
              THEN ${ORDEN_GRUPO_ESTADO_COMPRA.CANCELADAS}::int
            WHEN k.n_pendientes >= 1 OR k.n = 0 OR k.n_aprobados_no_entregados >= 1
              THEN ${ORDEN_GRUPO_ESTADO_COMPRA.ACTIVAS}::int
            ELSE ${ORDEN_GRUPO_ESTADO_COMPRA.COMPLETADAS}::int
          END AS grupo
        FROM compras c
        LEFT JOIN LATERAL (
          SELECT
            count(*)::int AS n,
            count(*) FILTER (WHERE i.estado_aprobacion = 'PENDIENTE')::int AS n_pendientes,
            count(*) FILTER (WHERE i.estado_aprobacion = 'APROBADO')::int AS n_aprobados,
            count(*) FILTER (WHERE i.estado_aprobacion = 'RECHAZADO')::int AS n_rechazados,
            count(*) FILTER (
              WHERE i.estado_aprobacion = 'APROBADO'
                AND i.cerrado_con_faltante = false
                AND i.cantidad_entregada < i.cantidad
            )::int AS n_aprobados_no_entregados
          FROM items_compra i
          WHERE i.compra_id = c.id AND i.deleted_at IS NULL
        ) k ON TRUE
        WHERE ${condicionesCabecera}
      ),
      filtradas AS (
        SELECT * FROM agrupadas WHERE ${condicionGrupo}
      ),
      pagina AS (
        SELECT
          id,
          row_number() OVER (ORDER BY grupo ASC, fecha_solicitud DESC, created_at DESC) AS orden
        FROM filtradas
        ORDER BY grupo ASC, fecha_solicitud DESC, created_at DESC
        ${limite} ${desplazamiento}
      )
      SELECT
        (SELECT count(*) FROM filtradas)::int AS total,
        COALESCE(
          (SELECT array_agg(p.id::text ORDER BY p.orden) FROM pagina p),
          ARRAY[]::text[]
        ) AS ids
    `;

    const fila = filas[0];
    return { ids: fila?.ids ?? [], total: fila?.total ?? 0 };
  }

  /**
   * Retorna una página del listado YA ORDENADA (grupo ASC, fechaSolicitud
   * DESC, createdAt DESC) más el `total` del universo filtrado — ver el
   * JSDoc del puerto para el contrato y el presupuesto de sentencias.
   *
   * Dos pasos: (1) `idsDePaginaOrdenados` resuelve filtro + orden +
   * paginación + total en SQL; (2) la hidratación reusa el `findMany` con
   * `include` de siempre (`CompraMapper.toDomain` sigue recibiendo la MISMA
   * forma camelCase de Prisma — el SQL crudo nunca alimenta al mapper). El
   * `IN` no preserva el orden pedido, así que la página se re-arma
   * siguiendo la secuencia de ids, no la que devolvió Postgres.
   */
  async findPaginaConItems(filtros?: CompraListFiltros): Promise<CompraPaginaConItems> {
    const { ids, total } = await this.idsDePaginaOrdenados(filtros);
    if (ids.length === 0) {
      return { compras: [], total };
    }

    const rows = await this.client.compra.findMany({
      where: { id: { in: ids } },
      include: { items: true },
    });
    const porId = new Map(rows.map((row) => [row.id, row]));

    const compras: CompraEntity[] = [];
    for (const id of ids) {
      const row = porId.get(id);
      if (row !== undefined) {
        compras.push(CompraMapper.toDomain(row));
      }
    }

    return { compras, total };
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
