/**
 * MovimientoInsumoMapper — conversión entre la fila de `movimientos_insumo` y
 * `MovimientoInsumoEntity`.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Es un mapper de UNA entidad y no de un agregado: el movimiento no tiene
 * hijos, y la bitácora de un insumo es una colección de asientos
 * independientes, no un árbol que se lea y se escriba entero.
 *
 * Sin `toPersistence` de UPDATE: la tabla es append-only, así que el único
 * shape de escritura es el del INSERT. Precedente exacto:
 * `ComentarioReparacionMapper`.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 4.
 */
import type { MovimientoInsumo as PrismaMovimientoInsumo, Prisma } from '.prisma/tenant';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import {
  CondicionStock,
  TipoMovimientoInsumo,
} from '../../../domain/entities/tipo-movimiento-insumo';

/**
 * Shape del INSERT de un movimiento. `cantidad` se ensancha a
 * `Prisma.Decimal | number` —Prisma acepta las dos en una columna `Decimal`—
 * con el mismo criterio que `InsumoMapper.toPersistence` para `stockMinimo`.
 * Sin `updatedAt` ni `deletedAt`: la tabla no tiene esas columnas.
 *
 * SIN `createdAt` — issue #159. Ver el porqué completo en el JSDoc de
 * `toPersistence()`: el campo se OMITE del INSERT a propósito, para que el
 * `DEFAULT clock_timestamp()` de la columna sea quien decida la fecha, y no
 * el reloj del proceso Node.
 */
export type FilaMovimientoInsumo = Omit<
  PrismaMovimientoInsumo,
  'cantidad' | 'createdAt' | 'unidadId'
> & {
  cantidad: Prisma.Decimal | number;
};

export class MovimientoInsumoMapper {
  /**
   * Convierte la fila de `movimientos_insumo` a `MovimientoInsumoEntity`.
   *
   * `cantidad` es `Decimal` en Prisma (columna `DECIMAL(10,2)`) y se convierte
   * a `number` — misma decisión que compras, equipos e insumos. Acá no hay
   * caso `null` que preservar: la columna es `NOT NULL`.
   *
   * `tipo` es `VarChar` en la base, no un enum de Prisma, así que el cast a
   * `TipoMovimientoInsumo` es inevitable. Es seguro por el CHECK
   * `movimientos_insumo_tipo_check`, que enumera exactamente
   * `TIPOS_MOVIMIENTO_INSUMO` — y que un spec de integración compara contra
   * `pg_get_constraintdef`, así que la deriva entre los dos catálogos sale en
   * rojo antes que en producción. Mismo criterio que `OperacionCompraMapper`.
   *
   * @param row Fila de `movimientos_insumo` tal como la devuelve Prisma.
   * @returns El asiento reconstituido, con su id y su fecha de alta.
   */
  static toDomain(row: PrismaMovimientoInsumo): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.reconstitute(
      {
        insumoId: row.insumoId,
        tipo: row.tipo as TipoMovimientoInsumo,
        // VarChar sin enum de Prisma: seguro por `movimientos_insumo_condicion_check`.
        condicion: row.condicion as CondicionStock,
        cantidad: Number(row.cantidad),
        usuarioId: row.usuarioId,
        motivo: row.motivo ?? null,
        equipoId: row.equipoId ?? null,
        sectorId: row.sectorId ?? null,
        itemCompraId: row.itemCompraId ?? null,
      },
      row.id,
      row.createdAt,
    );
  }

  /**
   * Convierte el asiento al shape plano del INSERT.
   *
   * Incluye `id` a propósito: lo genera `BaseEntity` ANTES del INSERT y la
   * entidad en memoria ya lo tiene. Dejárselo a la base —`DEFAULT
   * gen_random_uuid()`— haría que la fila guardada y el asiento que el caso de
   * uso devuelve no coincidan, y perdería además el desempate monótono del
   * UUIDv7 entre dos asientos con el mismo `created_at`, que es justo lo que
   * la entidad gana heredando de `BaseEntity`.
   *
   * **`createdAt` se OMITE a propósito — issue #159, y es lo INVERSO de lo que
   * hacía esta línea antes.** La entidad ya tiene un `createdAt` en memoria
   * (`BaseEntity` lo pone en su constructor con `new Date()`), pero ESE valor
   * es el reloj del PROCESO, no el de la base, y mandarlo en el INSERT es
   * exactamente el bug: verificado en producción, un VPS con el reloj
   * desviado ~44 minutos escribió filas con `created_at` en el futuro. Sin el
   * campo en el objeto, Prisma no lo incluye en el INSERT y el
   * `DEFAULT clock_timestamp()` de la columna —el reloj de POSTGRES— es quien
   * decide la fecha. Es lo mismo que ya pasa con `id` cuando la entidad NO lo
   * generara: acá es al revés, `id` sí viaja e `createdAt` no, y las dos
   * decisiones son consistentes con el mismo criterio — que la base sea dueña
   * de lo que la base puede garantizar mejor que el proceso.
   *
   * La consecuencia se paga del lado de la LECTURA, no de la escritura: el
   * `createdAt` en memoria de `entity` queda desactualizado apenas el INSERT
   * vuelve, así que el repositorio (`PrismaMovimientoInsumoRepository.insert`)
   * relee la fila real y devuelve el asiento reconstituido con ESA fecha —
   * nunca la de este objeto en memoria.
   *
   * Los cuatro nullables viajan como `null` EXPLÍCITO y no como campo ausente:
   * para Prisma no son lo mismo, y un `undefined` que se colara del caller se
   * leería como "no tocar la columna" en vez de "sin motivo". La entidad ya
   * resuelve el ausente a `null`, así que acá alcanza con leer sus getters.
   *
   * **`itemCompraId` se lee de la entidad y no se fija en `null`.** Mientras la
   * entidad no tuvo el campo, esta línea emitió un `null` constante; dejarla
   * así después de que la entidad lo ganó haría que un movimiento creado con
   * origen se persistiera SIN él — sin error, sin log y sin más síntoma que una
   * trazabilidad que nunca aparece. Por eso la entidad y su persistencia
   * viajaron en la misma unidad, y por eso el spec compara el valor emitido
   * contra el de la entidad en vez de contra un literal.
   *
   * @param entity Movimiento de dominio a asentar.
   * @returns El shape de fila que espera Prisma, sin `createdAt`, `updatedAt` ni `deletedAt`.
   */
  static toPersistence(entity: MovimientoInsumoEntity): FilaMovimientoInsumo {
    return {
      id: entity.id,
      insumoId: entity.insumoId,
      tipo: entity.tipo,
      condicion: entity.condicion,
      cantidad: entity.cantidad,
      usuarioId: entity.usuarioId,
      motivo: entity.motivo,
      equipoId: entity.equipoId,
      sectorId: entity.sectorId,
      itemCompraId: entity.itemCompraId,
    };
  }
}
