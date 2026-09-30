/**
 * InsumoMapper / InsumoCodigoAlternativoMapper / CompatibilidadModeloMapper —
 * conversión entre las filas Prisma del agregado `Insumo` y sus entidades y
 * value objects de dominio.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Los tres mappers viven juntos porque los tres lados son UN agregado: el
 * insumo nunca se lee ni se escribe sin su lista de códigos alternativos ni
 * sin su compatibilidad, y separarlos en tres archivos daría a entender que
 * los hijos tienen un ciclo de vida propio que no tienen.
 */
import type {
  Insumo as PrismaInsumo,
  InsumoCodigoAlternativo as PrismaInsumoCodigoAlternativo,
  InsumoModeloEquipo as PrismaInsumoModeloEquipo,
  Prisma,
} from '.prisma/tenant';
import type { SeguimientoInsumo } from '../../../domain/entities/unidad-insumo.entity';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../../domain/entities/insumo-codigo-alternativo.entity';
import { CompatibilidadModelo } from '../../../domain/entities/compatibilidad-modelo';

/**
 * Fila de `insumos` tal como la devuelven las consultas del repositorio, que
 * siempre traen el agregado completo (`include: { codigosAlternativos,
 * compatibilidad }`).
 */
export type FilaInsumoConAgregado = PrismaInsumo & {
  codigosAlternativos: PrismaInsumoCodigoAlternativo[];
  compatibilidad: PrismaInsumoModeloEquipo[];
};

/**
 * Shape de escritura ANIDADA de un código alternativo: va sin `insumoId`
 * porque Prisma resuelve la FK desde el insumo padre, y sin `updatedAt`
 * porque lo maneja el ORM.
 */
export type FilaCodigoAlternativoAnidada = Omit<
  PrismaInsumoCodigoAlternativo,
  'updatedAt' | 'insumoId' | 'createdAt'
>;

/**
 * Shape de escritura ANIDADA de una compatibilidad: va sin `insumoId` porque
 * Prisma resuelve la FK desde el insumo padre, y sin `createdAt` porque la
 * fila NO tiene id ni `updatedAt` —su identidad es el par—, así que su
 * `createdAt` es el único rastro de cuándo se declaró esa compatibilidad. El
 * `upsert` manda este mismo shape en la rama de UPDATE: emitirlo le pisaría la
 * fecha de alta a un par que no cambió. En el CREATE lo pone el
 * `@default(now())` de la columna.
 */
export type FilaCompatibilidadAnidada = Omit<PrismaInsumoModeloEquipo, 'insumoId' | 'createdAt'>;

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
   * SIN `createdAt` — issue #172. El shape sirve para el CREATE y para el
   * UPDATE del `upsert` de `PrismaInsumoRepository.save()`: mandarlo en el
   * CREATE traía el reloj del PROCESO (`BaseEntity` lo fija con `new Date()`
   * al construir la entidad) y dejaba sin disparar nunca el
   * `DEFAULT clock_timestamp()` de la columna; mandarlo en el UPDATE le
   * pisaría la fecha de alta a un código que ya existía. Omitirlo del todo
   * resuelve las dos ramas con un solo shape, mismo criterio que
   * `CompatibilidadModeloMapper.toPersistence` en este archivo.
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
    };
  }
}

export class CompatibilidadModeloMapper {
  /**
   * Construye el value object DIRECTO, sin pasar por
   * `crearCompatibilidadModelo()`: esa función valida el largo del rol, y una
   * lectura que explota por un dato histórico convierte un valor legado en una
   * caída de sistema. Es el mismo criterio por el que `reconstitute()` no
   * valida.
   *
   * @param row Fila de `insumos_modelos_equipo` tal como la devuelve Prisma.
   * @returns El par de dominio, con el rol tal como está guardado.
   */
  static toDomain(row: PrismaInsumoModeloEquipo): CompatibilidadModelo {
    return { modeloEquipoId: row.modeloEquipoId, rol: row.rol ?? null };
  }

  /**
   * @param vo Compatibilidad de dominio a persistir.
   * @returns El shape anidado que espera Prisma bajo el insumo padre, con el
   *   `rol` SIEMPRE presente —el `null` viaja en el objeto, porque el UPDATE
   *   del upsert manda este mismo shape y un `rol` ausente sería un rol
   *   imposible de borrar—.
   */
  static toPersistence(vo: CompatibilidadModelo): FilaCompatibilidadAnidada {
    return { modeloEquipoId: vo.modeloEquipoId, rol: vo.rol };
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
   * @param row Fila de `insumos` con sus códigos alternativos y su compatibilidad incluidos.
   * @returns La entidad raíz reconstituida, con timestamps y baja lógica.
   */
  static toDomain(row: FilaInsumoConAgregado): InsumoEntity {
    return InsumoEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        familiaId: row.familiaId,
        unidadMedidaId: row.unidadMedidaId,
        stockMinimo: row.stockMinimo !== null ? Number(row.stockMinimo) : null,
        activo: row.activo,
        // VarChar sin enum de Prisma: seguro por el CHECK `insumos_seguimiento_check`.
        seguimiento: row.seguimiento as SeguimientoInsumo,
        codigosAlternativos: row.codigosAlternativos.map(InsumoCodigoAlternativoMapper.toDomain),
        compatibilidad: row.compatibilidad.map(CompatibilidadModeloMapper.toDomain),
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte la raíz del agregado al shape plano de `insumos`: id, código,
   * nombre, las dos FK de catálogo, el punto de reposición, el estado y la
   * baja lógica. Ni los códigos alternativos ni la compatibilidad viajan acá:
   * los arma el repositorio como escritura anidada, cada uno con su propio
   * mapper.
   *
   * `stockMinimo` va como `number | null` (Prisma acepta number/string en
   * columnas Decimal), con el tipo de retorno explícito que usa
   * `equipo-informatico.mapper.ts` para sus decimales. El `null` SÍ viaja en
   * el objeto: el UPDATE del upsert manda este mismo shape, así que un campo
   * ausente sería un punto de reposición imposible de borrar.
   *
   * SIN `createdAt` — issue #172. `save()` manda este mismo shape en las dos
   * ramas del `upsert` (CREATE y UPDATE): incluirlo traía el reloj del
   * PROCESO (`BaseEntity` lo fija con `new Date()` al construir la entidad,
   * no el de la base) y dejaba sin disparar nunca el
   * `DEFAULT clock_timestamp()` de la columna (ver
   * `prisma_tenant/schema.prisma`, sobre `Insumo.createdAt`). Omitirlo del
   * todo alcanza para las dos ramas: en el CREATE dispara el `DEFAULT`, y en
   * el UPDATE, al no viajar, no pisa la fecha de alta de un insumo que ya
   * existía — mismo mecanismo que ya usaba `CompatibilidadModeloMapper` en
   * este archivo, y que ahora también usa `InsumoCodigoAlternativoMapper`.
   *
   * `seguimiento` viaja para la rama CREATE. Que el UPDATE del `upsert` NO lo
   * pise (un `EditarInsumo` con la entidad leída antes de una activación lo
   * reescribiría con el valor viejo, W3) lo resuelve `save()` en WU-3a: quita
   * la clave de la rama `update`. El escritor único es
   * `CambiarSeguimientoInsumoUseCase`.
   *
   * @param entity Insumo de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM) ni `createdAt`.
   */
  static toPersistence(entity: InsumoEntity): Omit<
    PrismaInsumo,
    'updatedAt' | 'stockMinimo' | 'createdAt'
  > & {
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
      seguimiento: entity.seguimiento,
      deletedAt: entity.deletedAt,
    };
  }
}
