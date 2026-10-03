/**
 * PrismaSolicitanteExternoRepository — implementación de ISolicitanteExternoRepository.
 *
 * El cliente sale de TenantContext (nunca de PrismaService directo): los datos del externo viven
 * solo en la base del tenant bindeado, jamás en master (D2).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISolicitanteExternoRepository } from '../../../domain/ports/i-solicitante-externo.repository';
import { SolicitanteExternoEntity } from '../../../domain/entities/solicitante-externo.entity';
import { SolicitanteExternoMapper } from './solicitante-externo.mapper';

@Injectable()
export class PrismaSolicitanteExternoRepository implements ISolicitanteExternoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async save(solicitante: SolicitanteExternoEntity): Promise<void> {
    await this.client.solicitanteExterno.create({
      data: {
        id: solicitante.id,
        nombre: solicitante.nombre,
        email: solicitante.email,
        telefono: solicitante.telefono,
        emailVerificadoAt: solicitante.emailVerificadoAt,
        createdAt: solicitante.createdAt,
      },
    });
  }

  async findById(id: string): Promise<SolicitanteExternoEntity | null> {
    const row = await this.client.solicitanteExterno.findUnique({ where: { id } });
    return row ? SolicitanteExternoMapper.toDomain(row) : null;
  }

  async findNombres(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.client.solicitanteExterno.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, nombre: true },
    });
    return new Map(rows.map((row) => [row.id, row.nombre]));
  }
}
