/**
 * PrismaEquipoInformaticoRepository — implementación del puerto IEquipoInformaticoRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ EquipoInformaticoEntity vía EquipoInformaticoMapper.
 * - save() es un upsert por id.
 * - delete() es soft delete: setea deleted_at = now().
 * - findAllActive() retorna solo activo=true Y deleted_at IS NULL.
 * - findByNumeroSerie() retorna null si soft-deleted (deleted_at IS NOT NULL).
 * - findByAsignadoAId() retorna equipos no soft-deleted del usuario.
 *
 * Nota sobre UNIQUE parcial de numero_serie:
 *   El índice `equipos_informaticos_numero_serie_key` en la migration SQL aplica
 *   WHERE numero_serie IS NOT NULL. La DB rechaza dos filas con el mismo valor
 *   non-null. La aplicación (GestionarEquipoUseCase) llama findByNumeroSerie()
 *   antes de insertar para manejar el conflicto con un 409 apropiado.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 6.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IEquipoInformaticoRepository } from '../../../domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';
import { EquipoInformaticoMapper } from './equipo-informatico.mapper';

@Injectable()
export class PrismaEquipoInformaticoRepository implements IEquipoInformaticoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<EquipoInformaticoEntity | null> {
    const row = await this.client.equipoInformatico.findUnique({ where: { id } });
    return row ? EquipoInformaticoMapper.toDomain(row) : null;
  }

  async findByNumeroSerie(numeroSerie: string): Promise<EquipoInformaticoEntity | null> {
    // Excluye soft-deleted: solo equipos con deleted_at IS NULL.
    const row = await this.client.equipoInformatico.findFirst({
      where: { numeroSerie, deletedAt: null },
    });
    return row ? EquipoInformaticoMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<EquipoInformaticoEntity[]> {
    const rows = await this.client.equipoInformatico.findMany({
      where: { activo: true, deletedAt: null },
    });
    return rows.map(EquipoInformaticoMapper.toDomain);
  }

  async findByAsignadoAId(asignadoAId: string): Promise<EquipoInformaticoEntity[]> {
    const rows = await this.client.equipoInformatico.findMany({
      where: { asignadoAId, deletedAt: null },
    });
    return rows.map(EquipoInformaticoMapper.toDomain);
  }

  async save(equipo: EquipoInformaticoEntity): Promise<void> {
    const data = EquipoInformaticoMapper.toPersistence(equipo);
    const { id, ...updateData } = data;
    await this.client.equipoInformatico.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.equipoInformatico.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
