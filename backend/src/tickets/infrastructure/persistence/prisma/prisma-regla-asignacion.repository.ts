/**
 * PrismaReglaAsignacionRepository — implementación de IReglaAsignacionRepository.
 *
 * El cliente sale de TenantContext: las reglas viven solo en la base del tenant bindeado.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IReglaAsignacionRepository,
  ReglaAsignacion,
} from '../../../domain/ports/i-regla-asignacion.repository';

@Injectable()
export class PrismaReglaAsignacionRepository implements IReglaAsignacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findByTipoId(tipoId: string): Promise<ReglaAsignacion | null> {
    return this.client.reglaAsignacion.findUnique({ where: { tipoId } });
  }

  async listar(): Promise<ReglaAsignacion[]> {
    return this.client.reglaAsignacion.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async fijar(
    tipoId: string,
    responsableId: string,
    actualizadoPor: string,
  ): Promise<ReglaAsignacion> {
    return this.client.reglaAsignacion.upsert({
      where: { tipoId },
      create: { tipoId, responsableId, actualizadoPor },
      update: { responsableId, actualizadoPor },
    });
  }

  async quitar(tipoId: string): Promise<void> {
    await this.client.reglaAsignacion.deleteMany({ where: { tipoId } });
  }
}
