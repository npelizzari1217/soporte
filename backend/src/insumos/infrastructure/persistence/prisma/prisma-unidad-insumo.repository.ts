/**
 * PrismaUnidadInsumoRepository — implementación del puerto
 * `IUnidadInsumoRepository`. Obtiene el cliente vía `TenantContext.getClient()`
 * y NO abre `$transaction`: participa de la que haya abierto el caso de uso.
 *
 * Ref design: openspec/changes/repuestos-numero-de-serie/design.md, ADR-1,
 * ADR-4 y ADR-12.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { exigirTransaccionActiva } from '../../../../shared/infrastructure/persistence/exigir-transaccion-activa';
import { IUnidadInsumoRepository } from '../../../domain/ports/i-unidad-insumo.repository';
import {
  ESTADOS_UNIDAD_INSUMO,
  EstadoUnidadInsumo,
  UnidadInsumoEntity,
} from '../../../domain/entities/unidad-insumo.entity';
import {
  CONDICIONES_STOCK,
  ConteoPorCondicion,
} from '../../../domain/entities/tipo-movimiento-insumo';
import { SerialDuplicadoError } from '../../../domain/errors/unidades-insumo.errors';
import { FalloOperacionDeUnidad } from '../../../domain/errors/fallo-operacion-de-unidad';
import { UnidadInsumoMapper } from './unidad-insumo.mapper';

/** Detecta un P2002 de Prisma sin importar sus tipos de error. */
function esViolacionDeUnicidad(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

@Injectable()
export class PrismaUnidadInsumoRepository implements IUnidadInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * `create` y no `upsert`: un id repetido tiene que rebotar contra la PK. El
   * P2002 del índice `(insumo_id, numero_serie_normalizado)` es la única falla
   * posterior a escribir que admite ADR-4 y se lanza como `FalloOperacionDeUnidad`.
   *
   * @param unidad Unidad de dominio nueva.
   * @throws FalloOperacionDeUnidad si el serial ya lo tiene otra unidad del insumo.
   */
  async insertar(unidad: UnidadInsumoEntity): Promise<void> {
    try {
      await this.client.unidadInsumo.create({ data: UnidadInsumoMapper.toPersistence(unidad) });
    } catch (err) {
      throw this.traducirUnicidad(err, unidad);
    }
  }

  /**
   * `SELECT … ORDER BY id FOR NO KEY UPDATE` (L3 de ADR-12). El orden de id es
   * parte del contrato: dos lotes que se cruzan toman los locks en el mismo
   * orden y no se abrazan. El `FOR NO KEY UPDATE` (y no `FOR UPDATE`) es lo que
   * deja pasar los `FOR KEY SHARE` implícitos de las FK.
   *
   * @param ids Ids de las unidades.
   * @returns Las unidades encontradas, ordenadas por id.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async bloquearPorIds(ids: readonly string[]): Promise<UnidadInsumoEntity[]> {
    const client = this.client;
    exigirTransaccionActiva(this.tenantContext, 'PrismaUnidadInsumoRepository.bloquearPorIds()');
    if (ids.length === 0) return [];

    const bloqueadas = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM unidades_insumo
      WHERE id = ANY(${[...ids]}::uuid[])
      ORDER BY id
      FOR NO KEY UPDATE
    `;
    if (bloqueadas.length === 0) return [];

    // Las filas ya están bloqueadas: releerlas por Prisma devuelve el estado
    // vigente (READ COMMITTED) y evita mapear a mano las columnas del raw.
    const filas = await client.unidadInsumo.findMany({
      where: { id: { in: bloqueadas.map((fila) => fila.id) } },
      orderBy: { id: 'asc' },
    });
    return filas.map(UnidadInsumoMapper.toDomain);
  }

  /**
   * `updateMany` con `estado` en el `where`: es el CAS. `updateMany` y no
   * `update` para que 0 filas sea un conteo y no un `P2025` crudo.
   *
   * @param unidad Unidad con el estado nuevo ya aplicado.
   * @param estadoEsperado Estado con el que se leyó bajo el lock.
   * @throws Error si el CAS no afectó ninguna fila.
   * @throws FalloOperacionDeUnidad si el serial nuevo ya lo tiene otra unidad del insumo.
   */
  async guardarConEstadoEsperado(
    unidad: UnidadInsumoEntity,
    estadoEsperado: EstadoUnidadInsumo,
  ): Promise<void> {
    const { id, insumoId: _insumoId, ...datos } = UnidadInsumoMapper.toPersistence(unidad);
    let count: number;
    try {
      ({ count } = await this.client.unidadInsumo.updateMany({
        where: { id, estado: estadoEsperado },
        data: datos,
      }));
    } catch (err) {
      throw this.traducirUnicidad(err, unidad);
    }
    if (count === 0) {
      throw new Error(
        `PrismaUnidadInsumoRepository.guardarConEstadoEsperado(): la unidad ${id} no estaba ` +
          `${estadoEsperado} bajo el lock de fila; alguien escribió sin respetar el orden de locks (ADR-12).`,
      );
    }
  }

  /**
   * @param insumoId Insumo a contar.
   * @returns Las unidades `EN_DEPOSITO` por condición, con `0` donde no hay.
   */
  async contarEnDepositoPorCondicion(insumoId: string): Promise<ConteoPorCondicion> {
    const grupos = await this.client.unidadInsumo.groupBy({
      by: ['condicion'],
      where: { insumoId, estado: 'EN_DEPOSITO' },
      _count: { _all: true },
    });
    const porCondicion = new Map(grupos.map((g) => [g.condicion, g._count._all]));
    return Object.fromEntries(
      CONDICIONES_STOCK.map((condicion) => [condicion, porCondicion.get(condicion) ?? 0]),
    ) as ConteoPorCondicion;
  }

  /**
   * @param insumoId Insumo a contar.
   * @returns Las unidades por estado, con los cuatro estados presentes.
   */
  async contarPorEstado(insumoId: string): Promise<Record<EstadoUnidadInsumo, number>> {
    const grupos = await this.client.unidadInsumo.groupBy({
      by: ['estado'],
      where: { insumoId },
      _count: { _all: true },
    });
    const porEstado = new Map(grupos.map((g) => [g.estado, g._count._all]));
    return Object.fromEntries(
      ESTADOS_UNIDAD_INSUMO.map((estado) => [estado, porEstado.get(estado) ?? 0]),
    ) as Record<EstadoUnidadInsumo, number>;
  }

  /**
   * @param insumoId Insumo a listar.
   * @param estados Filtro opcional por estado.
   * @returns Las unidades ordenadas por id.
   */
  async listarPorInsumo(
    insumoId: string,
    estados?: readonly EstadoUnidadInsumo[],
  ): Promise<UnidadInsumoEntity[]> {
    const filas = await this.client.unidadInsumo.findMany({
      where: { insumoId, ...(estados !== undefined ? { estado: { in: [...estados] } } : {}) },
      orderBy: { id: 'asc' },
    });
    return filas.map(UnidadInsumoMapper.toDomain);
  }

  /**
   * @param id Id de la unidad.
   * @returns La unidad, o `null` si no existe.
   */
  async findById(id: string): Promise<UnidadInsumoEntity | null> {
    const fila = await this.client.unidadInsumo.findUnique({ where: { id } });
    return fila ? UnidadInsumoMapper.toDomain(fila) : null;
  }

  /**
   * Convierte un P2002 en `FalloOperacionDeUnidad(SerialDuplicadoError)` y deja
   * pasar cualquier otro error tal cual. Con un serial `null` no hay índice que
   * pueda chocar (es parcial sobre `numero_serie_normalizado IS NOT NULL`), así
   * que un P2002 sin serial es otra cosa —la PK— y no se disfraza.
   */
  private traducirUnicidad(err: unknown, unidad: UnidadInsumoEntity): unknown {
    if (esViolacionDeUnicidad(err) && unidad.numeroSerie !== null) {
      return new FalloOperacionDeUnidad(new SerialDuplicadoError(unidad.numeroSerie));
    }
    return err;
  }
}
