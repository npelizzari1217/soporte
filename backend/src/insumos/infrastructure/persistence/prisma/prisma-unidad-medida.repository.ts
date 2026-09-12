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
}
