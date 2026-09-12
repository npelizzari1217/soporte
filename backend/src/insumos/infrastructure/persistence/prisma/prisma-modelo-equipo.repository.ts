/**
 * PrismaModeloEquipoRepository — implementación del puerto
 * `IModeloEquipoRepository`. Obtiene el cliente vía `TenantContext` (nunca
 * `PrismaService` directo). `findAllActive()` excluye las filas con baja
 * lógica, pero SÍ devuelve las deshabilitadas (`activo: false`).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IModeloEquipoRepository } from '../../../domain/ports/i-modelo-equipo.repository';
import { ModeloEquipoEntity } from '../../../domain/entities/modelo-equipo.entity';
import { ModeloEquipoMapper } from './modelo-equipo.mapper';

@Injectable()
export class PrismaModeloEquipoRepository implements IModeloEquipoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * @param id Id del modelo.
   * @returns El modelo, o `null` si no existe.
   */
  async findById(id: string): Promise<ModeloEquipoEntity | null> {
    const row = await this.client.modeloEquipo.findUnique({ where: { id } });
    return row ? ModeloEquipoMapper.toDomain(row) : null;
  }

  /**
   * Busca por el UNIQUE compuesto `(marca, modelo)`, SIN filtrar por
   * `deletedAt` ni por `activo`: el índice no es parcial, así que un par
   * ocupado sigue tomado aunque el modelo esté deshabilitado o con baja
   * lógica, y el chequeo de duplicado tiene que verlo.
   *
   * @param marca Marca ya normalizada en mayúscula.
   * @param modelo Designación comercial ya recortada.
   * @returns El modelo, o `null` si no existe.
   */
  async findByMarcaModelo(marca: string, modelo: string): Promise<ModeloEquipoEntity | null> {
    const row = await this.client.modeloEquipo.findUnique({
      where: { marca_modelo: { marca, modelo } },
    });
    return row ? ModeloEquipoMapper.toDomain(row) : null;
  }

  /**
   * Filtra por `deletedAt: null`, NO por `activo`: un modelo deshabilitado
   * tiene que seguir llegando al listado para que el administrador pueda
   * volver a habilitarlo.
   *
   * @returns Los modelos vigentes del tenant —habilitados o no—, ordenados por
   *   marca y después por modelo (el orden en que se leen: agrupados por
   *   fabricante).
   */
  async findAllActive(): Promise<ModeloEquipoEntity[]> {
    const rows = await this.client.modeloEquipo.findMany({
      where: { deletedAt: null },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
    });
    return rows.map(ModeloEquipoMapper.toDomain);
  }

  /**
   * Upsert por id: INSERT si es nuevo, UPDATE si existe. Nunca pisa
   * `createdAt` en el UPDATE — y desde el issue #172 tampoco lo fija en el
   * CREATE: `ModeloEquipoMapper.toPersistence()` ya omite el campo del todo,
   * así que el mismo shape sirve para las dos ramas del `upsert` y el
   * `DEFAULT clock_timestamp()` de la columna es quien decide la fecha de
   * alta.
   *
   * @param modelo Modelo de dominio a persistir.
   */
  async save(modelo: ModeloEquipoEntity): Promise<void> {
    const data = ModeloEquipoMapper.toPersistence(modelo);
    await this.client.modeloEquipo.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }
}
