/**
 * CompraMapper — convierte entre Prisma Compra (fila de DB, con `items`
 * incluidos) y CompraEntity (dominio, raíz del agregado — ADR-C2).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * `toDomain` delega la conversión de cada ítem en `ItemCompraMapper` — este
 * mapper NO reimplementa la conversión `Decimal -> number` de los campos de
 * `ItemCompra` (ADR-C3, un solo lugar). `toPersistence` retorna SOLO los
 * campos de cabecera: `ICompraRepository.guardarItem` persiste cada ítem
 * por separado (ADR-C2) — este mapper no expone una versión que incluya
 * `items` para evitar que un caller intente persistir el agregado completo
 * en una sola llamada, rompiendo la división de responsabilidades del puerto.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1. Ref design: ADR-C2.
 * Tarea: PR-10.
 */
import type { Compra as PrismaCompra, ItemCompra as PrismaItemCompra } from '.prisma/tenant';
import { CompraEntity } from '../../../domain/entities/compra.entity';
import { ItemCompraMapper } from './item-compra.mapper';

/** Fila de `Compra` con sus `items` cargados vía `include` (forma que exige `ICompraRepository.findByIdConItems`/`findAllConItems`, ver ADR-C2). */
export type PrismaCompraConItems = PrismaCompra & { items: PrismaItemCompra[] };

export class CompraMapper {
  /**
   * Convierte una fila de DB Prisma (con `items` incluidos) →
   * CompraEntity de dominio. `items` viaja COMPLETO (activos + soft-deleted)
   * — `CompraEntity.reconstitute` lo exige así (ver `compra.entity.ts:113-118`),
   * la propia entidad filtra los soft-deleted internamente al derivar estado.
   */
  static toDomain(row: PrismaCompraConItems): CompraEntity {
    const items = row.items.map((item) => ItemCompraMapper.toDomain(item));

    return CompraEntity.reconstitute(
      {
        numero: row.numero,
        fechaSolicitud: row.fechaSolicitud,
        motivo: row.motivo,
        descripcion: row.descripcion ?? null,
        solicitanteId: row.solicitanteId,
        cicloId: row.cicloId,
        canceladaEn: row.canceladaEn ?? null,
        canceladoPorId: row.canceladoPorId ?? null,
        motivoCancelacion: row.motivoCancelacion ?? null,
      },
      items,
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte CompraEntity → objeto plano de CABECERA para Prisma upsert.
   * SIN `items` (ver JSDoc de cabecera). Incluye `createdAt` para que el
   * repo lo use en el CREATE y lo excluya del UPDATE (nunca pisar el
   * timestamp de creación existente en DB).
   */
  static toPersistence(entity: CompraEntity): Omit<PrismaCompra, 'updatedAt'> {
    return {
      id: entity.id,
      numero: entity.numero,
      fechaSolicitud: entity.fechaSolicitud,
      motivo: entity.motivo,
      descripcion: entity.descripcion,
      solicitanteId: entity.solicitanteId,
      cicloId: entity.cicloId,
      canceladaEn: entity.canceladaEn,
      canceladoPorId: entity.canceladoPorId,
      motivoCancelacion: entity.motivoCancelacion,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
