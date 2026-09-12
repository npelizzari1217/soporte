/**
 * PrismaFamiliaInsumoRepository — implementación del puerto
 * `IFamiliaInsumoRepository`. Obtiene el cliente vía `TenantContext` (nunca
 * `PrismaService` directo). `findAllActive()` excluye las filas con baja
 * lógica, pero SÍ devuelve las deshabilitadas (`activo: false`).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IFamiliaInsumoRepository } from '../../../domain/ports/i-familia-insumo.repository';
import { FamiliaInsumoEntity } from '../../../domain/entities/familia-insumo.entity';
import { FamiliaInsumoMapper } from './familia-insumo.mapper';

@Injectable()
export class PrismaFamiliaInsumoRepository implements IFamiliaInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * @param id Id de la familia.
   * @returns La familia, o `null` si no existe.
   */
  async findById(id: string): Promise<FamiliaInsumoEntity | null> {
    const row = await this.client.familiaInsumo.findUnique({ where: { id } });
    return row ? FamiliaInsumoMapper.toDomain(row) : null;
  }

  /**
   * Busca por el UNIQUE de `codigo`, SIN filtrar por `deletedAt` ni por
   * `activo`: el índice no es parcial, así que un código ocupado sigue tomado
   * aunque la familia esté deshabilitada o con baja lógica, y el chequeo de
   * duplicado tiene que verlo.
   *
   * @param codigo Código ya normalizado en mayúscula.
   * @returns La familia, o `null` si no existe.
   */
  async findByCodigo(codigo: string): Promise<FamiliaInsumoEntity | null> {
    const row = await this.client.familiaInsumo.findUnique({ where: { codigo } });
    return row ? FamiliaInsumoMapper.toDomain(row) : null;
  }

  /**
   * Filtra por `deletedAt: null`, NO por `activo`: una familia deshabilitada
   * tiene que seguir llegando al listado para que el administrador pueda
   * volver a habilitarla.
   *
   * @returns Las familias vigentes del tenant —habilitadas o no—, ordenadas
   *   por código.
   */
  async findAllActive(): Promise<FamiliaInsumoEntity[]> {
    const rows = await this.client.familiaInsumo.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(FamiliaInsumoMapper.toDomain);
  }

  /**
   * Upsert por id: INSERT si es nueva, UPDATE si existe. Nunca pisa
   * `createdAt` en el UPDATE — y desde el issue #172 tampoco lo fija en el
   * CREATE: `FamiliaInsumoMapper.toPersistence()` ya omite el campo del todo,
   * así que el mismo shape sirve para las dos ramas del `upsert` y el
   * `DEFAULT clock_timestamp()` de la columna es quien decide la fecha de
   * alta.
   *
   * @param familia Familia de dominio a persistir.
   */
  async save(familia: FamiliaInsumoEntity): Promise<void> {
    const data = FamiliaInsumoMapper.toPersistence(familia);
    await this.client.familiaInsumo.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
