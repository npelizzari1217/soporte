/**
 * OperacionCompraMapper — convierte entre Prisma OperacionCompra (fila de
 * DB) y `OperacionCompra` (tipo plano de dominio, ver
 * `i-operacion-compra.repository.ts` — NO es una `BaseEntity`, ver JSDoc del
 * puerto para el porqué).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Precedente: `operacion-ticket.mapper.ts` — mismo criterio para `datos`
 * JSON (`Prisma.JsonNull` como sentinel de "columna NULL", distinto de
 * `undefined` = "no tocar la columna").
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.10. Ref design: ADR-C4.
 * Tarea: PR-10.
 */
import { Prisma, type OperacionCompra as PrismaOperacionCompra } from '.prisma/tenant';
import {
  CrearOperacionCompraProps,
  OperacionCompra,
  TipoOperacionCompra,
} from '../../../domain/ports/i-operacion-compra.repository';

export class OperacionCompraMapper {
  /**
   * Convierte una fila de DB Prisma → `OperacionCompra` de dominio. `tipo`
   * es `VarChar` en DB (ADR-C7) — el CHECK `operaciones_compra_tipo_check`
   * (PR-2) garantiza que sólo contiene uno de los 10 valores del catálogo,
   * así que el cast es seguro.
   */
  static toDomain(row: PrismaOperacionCompra): OperacionCompra {
    return {
      id: row.id,
      compraId: row.compraId,
      itemCompraId: row.itemCompraId ?? null,
      tipo: row.tipo as TipoOperacionCompra,
      usuarioId: row.usuarioId,
      detalle: row.detalle,
      datos: (row.datos as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    };
  }

  /**
   * Convierte `CrearOperacionCompraProps` → input de creación Prisma. Sin
   * `id` (lo genera la DB, `dbgenerated`) ni `createdAt` (`@default(now())`).
   * `datos` null se traduce al sentinel `Prisma.JsonNull` — mismo criterio
   * que `OperacionTicketMapper.toPersistence`.
   */
  static toPersistence(
    props: CrearOperacionCompraProps,
  ): Omit<Prisma.OperacionCompraUncheckedCreateInput, 'id' | 'createdAt'> {
    return {
      compraId: props.compraId,
      itemCompraId: props.itemCompraId,
      tipo: props.tipo,
      usuarioId: props.usuarioId,
      detalle: props.detalle,
      datos: props.datos === null ? Prisma.JsonNull : (props.datos as Prisma.InputJsonValue),
    };
  }
}
