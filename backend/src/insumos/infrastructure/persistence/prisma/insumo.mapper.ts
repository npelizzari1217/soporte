/**
 * InsumoMapper / InsumoCodigoAlternativoMapper — conversión entre las filas
 * Prisma del agregado `Insumo` y sus entidades de dominio.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Los dos mappers viven juntos porque los dos lados son UN agregado: el
 * insumo nunca se lee ni se escribe sin su lista de códigos alternativos, y
 * separarlos en dos archivos daría a entender que el hijo tiene un ciclo de
 * vida propio que no tiene.
 */
import type {
  Insumo as PrismaInsumo,
  InsumoCodigoAlternativo as PrismaInsumoCodigoAlternativo,
  Prisma,
} from '.prisma/tenant';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../../domain/entities/insumo-codigo-alternativo.entity';

/**
 * Fila de `insumos` tal como la devuelven las consultas del repositorio, que
 * siempre traen el agregado completo (`include: { codigosAlternativos }`).
 */
export type FilaInsumoConCodigos = PrismaInsumo & {
  codigosAlternativos: PrismaInsumoCodigoAlternativo[];
};

/**
 * Shape de escritura ANIDADA de un código alternativo: va sin `insumoId`
 * porque Prisma resuelve la FK desde el insumo padre, y sin `updatedAt`
 * porque lo maneja el ORM.
 */
export type FilaCodigoAlternativoAnidada = Omit<
  PrismaInsumoCodigoAlternativo,
  'updatedAt' | 'insumoId'
>;

export class InsumoCodigoAlternativoMapper {
  /**
   * @param row Fila de `insumos_codigos_alternativos` tal como la devuelve Prisma.
   * @returns La entidad hija reconstituida, con id y timestamps preservados.
   */
  static toDomain(row: PrismaInsumoCodigoAlternativo): InsumoCodigoAlternativoEntity {
    return InsumoCodigoAlternativoEntity.reconstitute(
      { codigo: row.codigo, fabricante: row.fabricante ?? null },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE, así el
   * reguardado del agregado no le pisa la fecha de alta a un código que ya
   * existía.
   *
   * @param entity Código alternativo de dominio a persistir.
   * @returns El shape anidado que espera Prisma bajo el insumo padre.
   */
  static toPersistence(entity: InsumoCodigoAlternativoEntity): FilaCodigoAlternativoAnidada {
    return {
      id: entity.id,
      codigo: entity.codigo,
      fabricante: entity.fabricante,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}

export class InsumoMapper {
  /**
   * Convierte la fila del agregado a `InsumoEntity`.
   *
   * `stockMinimo` es `Decimal` en Prisma (columna `DECIMAL(10,2)`) y se
   * convierte a `number` — misma decisión que compras y equipos. El `null` se
   * preserva como `null` y NO pasa por `Number()`: `Number(null)` es `0`, y
   * "sin punto de reposición" no es "avisar al llegar a cero".
   *
   * @param row Fila de `insumos` con sus códigos alternativos incluidos.
   * @returns La entidad raíz reconstituida, con timestamps y baja lógica.
   */
  static toDomain(row: FilaInsumoConCodigos): InsumoEntity {
    return InsumoEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        familiaId: row.familiaId,
        unidadMedidaId: row.unidadMedidaId,
        stockMinimo: row.stockMinimo !== null ? Number(row.stockMinimo) : null,
        activo: row.activo,
        codigosAlternativos: row.codigosAlternativos.map(InsumoCodigoAlternativoMapper.toDomain),
        // El dominio ya modela la compatibilidad, pero este mapper todavía no
        // la lee: la fila de `insumos_modelos_equipo` no viaja en el `include`
        // del repositorio. La lista vacía no puede pisar nada guardado porque
        // ningún camino la escribe —`toPersistence` no la emite— y por eso el
        // puerto tampoco la promete. Quien enseñe a leer esa tabla tiene que
        // cambiar las tres cosas juntas: el `include`, esta línea y el
        // contrato del puerto.
        compatibilidad: [],
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte la raíz del agregado al shape plano de `insumos`. Los códigos
   * alternativos NO viajan acá: los arma el repositorio como escritura
   * anidada, con su propio mapper.
   *
   * `stockMinimo` va como `number | null` (Prisma acepta number/string en
   * columnas Decimal), con el tipo de retorno explícito que usa
   * `equipo-informatico.mapper.ts` para sus decimales. El `null` SÍ viaja en
   * el objeto: el UPDATE del upsert manda este mismo shape, así que un campo
   * ausente sería un punto de reposición imposible de borrar.
   *
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   *
   * @param entity Insumo de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM).
   */
  static toPersistence(entity: InsumoEntity): Omit<PrismaInsumo, 'updatedAt' | 'stockMinimo'> & {
    stockMinimo: Prisma.Decimal | number | string | null;
  } {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      familiaId: entity.familiaId,
      unidadMedidaId: entity.unidadMedidaId,
      stockMinimo: entity.stockMinimo,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
