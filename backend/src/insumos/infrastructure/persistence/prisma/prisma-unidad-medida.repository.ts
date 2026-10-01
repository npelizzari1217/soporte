/**
 * PrismaUnidadMedidaRepository — implementación del puerto
 * `IUnidadMedidaRepository`. Obtiene el cliente vía `TenantContext` (nunca
 * `PrismaService` directo). `findAllActive()` excluye las filas con baja
 * lógica, pero SÍ devuelve las deshabilitadas (`activo: false`).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IUnidadMedidaRepository } from '../../../domain/ports/i-unidad-medida.repository';
import { UnidadMedidaEntity } from '../../../domain/entities/unidad-medida.entity';
import { UnidadMedidaMapper } from './unidad-medida.mapper';
import { exigirTransaccionActiva } from '../../../../shared/infrastructure/persistence/exigir-transaccion-activa';

@Injectable()
export class PrismaUnidadMedidaRepository implements IUnidadMedidaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * @param id Id de la unidad.
   * @returns La unidad, o `null` si no existe.
   */
  async findById(id: string): Promise<UnidadMedidaEntity | null> {
    const row = await this.client.unidadMedida.findUnique({ where: { id } });
    return row ? UnidadMedidaMapper.toDomain(row) : null;
  }

  /**
   * Busca por el UNIQUE de `codigo`, SIN filtrar por `deletedAt` ni por
   * `activo`: el índice no es parcial, así que un código ocupado sigue tomado
   * aunque la unidad esté deshabilitada o con baja lógica, y el chequeo de
   * duplicado tiene que verlo.
   *
   * @param codigo Código ya normalizado en mayúscula.
   * @returns La unidad, o `null` si no existe.
   */
  async findByCodigo(codigo: string): Promise<UnidadMedidaEntity | null> {
    const row = await this.client.unidadMedida.findUnique({ where: { codigo } });
    return row ? UnidadMedidaMapper.toDomain(row) : null;
  }

  /**
   * Filtra por `deletedAt: null`, NO por `activo`: una unidad deshabilitada
   * tiene que seguir llegando al listado para que el administrador pueda
   * volver a habilitarla.
   *
   * @returns Las unidades vigentes del tenant —habilitadas o no—, ordenadas
   *   por código.
   */
  async findAllActive(): Promise<UnidadMedidaEntity[]> {
    const rows = await this.client.unidadMedida.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(UnidadMedidaMapper.toDomain);
  }

  /**
   * Upsert por id: INSERT si es nueva, UPDATE si existe. Nunca pisa
   * `createdAt` en el UPDATE — y desde el issue #172 tampoco lo fija en el
   * CREATE: `UnidadMedidaMapper.toPersistence()` ya omite el campo del todo,
   * así que el mismo shape sirve para las dos ramas del `upsert` y el
   * `DEFAULT clock_timestamp()` de la columna es quien decide la fecha de
   * alta.
   *
   * @param unidad Unidad de dominio a persistir.
   */
  async save(unidad: UnidadMedidaEntity): Promise<void> {
    const data = UnidadMedidaMapper.toPersistence(unidad);
    await this.client.unidadMedida.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  /**
   * `FOR SHARE` sobre la fila (L0 de ADR-12) y lectura de `entera`. El contrato
   * completo está en `IUnidadMedidaRepository.leerParaUso`.
   *
   * @param id Id de la unidad de medida.
   * @returns `{ entera }`, o `null` si no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async leerParaUso(id: string): Promise<{ entera: boolean } | null> {
    const client = this.client;
    exigirTransaccionActiva(this.tenantContext, 'PrismaUnidadMedidaRepository.leerParaUso()');
    const filas = await client.$queryRaw<Array<{ entera: boolean }>>`
      SELECT entera FROM unidades_medida WHERE id = ${id}::uuid FOR SHARE
    `;
    return filas.length > 0 ? { entera: filas[0].entera } : null;
  }

  /**
   * `FOR UPDATE` si el cambio toca `codigo`, `FOR NO KEY UPDATE` si no (L0 de
   * ADR-12). Bloquea primero y lee después, en dos sentencias: bajo READ
   * COMMITTED la segunda ve lo que comiteó quien tenía la fila antes.
   *
   * @param id Id de la unidad de medida.
   * @param modo Si el cambio toca `codigo` o no.
   * @returns La unidad leída bajo el lock, o `null` si no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async bloquearParaEdicion(
    id: string,
    modo: 'CAMBIA_CODIGO' | 'SIN_CAMBIO_DE_CODIGO',
  ): Promise<UnidadMedidaEntity | null> {
    const client = this.client;
    exigirTransaccionActiva(
      this.tenantContext,
      'PrismaUnidadMedidaRepository.bloquearParaEdicion()',
    );
    if (modo === 'CAMBIA_CODIGO') {
      await client.$queryRaw`SELECT id FROM unidades_medida WHERE id = ${id}::uuid FOR UPDATE`;
    } else {
      await client.$queryRaw`SELECT id FROM unidades_medida WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    }
    const row = await client.unidadMedida.findUnique({ where: { id } });
    return row ? UnidadMedidaMapper.toDomain(row) : null;
  }
}
