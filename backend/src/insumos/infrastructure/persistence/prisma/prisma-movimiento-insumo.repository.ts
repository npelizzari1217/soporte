/**
 * PrismaMovimientoInsumoRepository — implementación del puerto
 * `IMovimientoInsumoRepository`: la bitácora append-only de existencias y la
 * sección crítica que la protege.
 *
 * Obtiene el cliente vía `TenantContext.getClient()`, NUNCA `PrismaService`
 * directo, y NO abre `$transaction` a mano: el cliente activo puede ser ya un
 * `Prisma.TransactionClient` —cuando el caso de uso corre dentro de
 * `ITenantTransactionRunner.run()`—, y ese cliente no expone `$transaction`.
 * Quien abre la transacción es el caso de uso; el repositorio solo participa
 * de la que esté en curso.
 *
 * Solo dos métodos, y ningún `update` ni `delete`: la firma del puerto es lo
 * que hace estructuralmente append-only a la tabla.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 1 y 4.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IMovimientoInsumoRepository,
  SumasPorTipoMovimiento,
} from '../../../domain/ports/i-movimiento-insumo.repository';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import { TIPOS_MOVIMIENTO_INSUMO } from '../../../domain/entities/tipo-movimiento-insumo';
import { MovimientoInsumoMapper } from './movimiento-insumo.mapper';

/**
 * Prefijo de la clave del advisory lock. Va acá, en una constante, y no
 * inline: el lock solo sirve si TODOS los que lo toman usan exactamente la
 * misma clave, y una segunda copia del literal es la forma exacta en que dos
 * escritores terminan bloqueando espacios distintos y creyendo que se
 * serializan.
 *
 * `hashtext()` reduce la clave a un `int4`, así que dos claves distintas
 * pueden colisionar: el efecto de una colisión es que dos insumos se esperen
 * de más, nunca que uno deje de esperar. Es el mismo criterio con el que
 * `PrismaCompraRepository.findLastSecuencia` lockea por año.
 */
const PREFIJO_LOCK_STOCK = 'insumo-stock:';

@Injectable()
export class PrismaMovimientoInsumoRepository implements IMovimientoInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /** Retorna el cliente Prisma del tenant activo. Lanza si no hay TenantContext activo. */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * Asienta un movimiento nuevo. `create` y no `upsert`: la tabla es
   * append-only, así que un id repetido tiene que rebotar contra la PK en vez
   * de pisar en silencio un asiento ya escrito.
   *
   * @param movimiento Movimiento de dominio a asentar.
   */
  async insert(movimiento: MovimientoInsumoEntity): Promise<void> {
    await this.client.movimientoInsumo.create({
      data: MovimientoInsumoMapper.toPersistence(movimiento),
    });
  }

  /**
   * Toma el advisory lock transaccional del insumo y devuelve el desglose de
   * su bitácora por tipo. Ver el contrato completo en
   * `IMovimientoInsumoRepository.lockAndSumByTipo`.
   *
   * **El contrato de la transacción se hace cumplir acá, no se confía.** El
   * JSDoc del puerto advierte que fuera de una transacción explícita Postgres
   * abre una implícita de una sola sentencia, toma el lock y lo libera de
   * inmediato: la llamada devolvería sumas que no protegen nada, y dos
   * salidas simultáneas del mismo insumo pasarían las dos. Una advertencia que
   * nadie hace cumplir se incumple, así que la precondición se verifica contra
   * el flag `enTransaccion` que ya pone `PrismaTenantTransactionRunner.run()`
   * y se falla fuerte. Es un `throw` y no un `Result` porque llamar sin
   * transacción es una violación de contrato del caller —un bug de armado del
   * caso de uso—, no una desviación de negocio que el usuario deba ver.
   *
   * El chequeo va DESPUÉS de resolver el cliente para que las dos condiciones
   * queden distinguibles: sin `TenantContext` lanza `getClient()` con su
   * propio mensaje; con contexto pero sin transacción, lanza este.
   *
   * El desglose se arma desde `TIPOS_MOVIMIENTO_INSUMO` y no desde las filas
   * que devuelve el `GROUP BY`: un agregado no emite filas para los tipos sin
   * movimientos, y el contrato promete los cuatro tipos siempre presentes.
   *
   * @param insumoId Insumo cuya bitácora se bloquea y se suma.
   * @returns Las sumas por tipo, con `0` en los tipos sin movimientos.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async lockAndSumByTipo(insumoId: string): Promise<SumasPorTipoMovimiento> {
    const client = this.client;

    if (this.tenantContext.get()?.enTransaccion !== true) {
      throw new Error(
        'PrismaMovimientoInsumoRepository.lockAndSumByTipo() requiere una transacción activa ' +
          '(ITenantTransactionRunner.run): fuera de ella Postgres libera el advisory lock al ' +
          'terminar la sentencia y dos escritores del mismo insumo verían las mismas sumas.',
      );
    }

    // El lock se toma ANTES de leer y se libera solo al cerrar la transacción
    // (commit o rollback) — nunca hay que liberarlo a mano. Serializa por
    // INSUMO: dos técnicos sacando cosas distintas no se esperan entre sí.
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PREFIJO_LOCK_STOCK + insumoId}))`;

    const filas = await client.movimientoInsumo.groupBy({
      by: ['tipo'],
      where: { insumoId },
      _sum: { cantidad: true },
    });

    const porTipo = new Map(filas.map((fila) => [fila.tipo, Number(fila._sum.cantidad ?? 0)]));

    // Único cast del método, y es de construcción: las claves salen de
    // `TIPOS_MOVIMIENTO_INSUMO`, que ES el catálogo del que se deriva
    // `TipoMovimientoInsumo`. `Object.fromEntries` no conserva las claves
    // literales de la tupla, así que TypeScript no puede probarlo solo; lo
    // prueba el spec de integración, que compara las claves devueltas contra
    // el catálogo.
    return Object.fromEntries(
      TIPOS_MOVIMIENTO_INSUMO.map((tipo) => [tipo, porTipo.get(tipo) ?? 0]),
    ) as SumasPorTipoMovimiento;
  }
}
