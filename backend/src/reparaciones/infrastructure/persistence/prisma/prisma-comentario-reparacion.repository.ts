/**
 * PrismaComentarioReparacionRepository — implementación del puerto
 * IComentarioReparacionRepository.
 *
 * Sin `update`/`delete`: la bitácora de comentarios es append-only y el
 * puerto no los declara.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IComentarioReparacionRepository } from '../../../domain/ports/i-comentario-reparacion.repository';
import { ComentarioReparacionEntity } from '../../../domain/entities/comentario-reparacion.entity';
import { ComentarioReparacionMapper } from './comentario-reparacion.mapper';

@Injectable()
export class PrismaComentarioReparacionRepository implements IComentarioReparacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async crear(comentario: ComentarioReparacionEntity): Promise<void> {
    await this.client.comentarioReparacion.create({
      data: ComentarioReparacionMapper.toPersistence(comentario),
    });
  }

  async listarPorTicketEdilicia(ticketEdiliciaId: string): Promise<ComentarioReparacionEntity[]> {
    const rows = await this.client.comentarioReparacion.findMany({
      where: { ticketEdiliciaId },
      // `id` DESC como desempate: es UUIDv7 (monótono), así que dos
      // comentarios escritos en el mismo milisegundo salen igual de estables.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(ComentarioReparacionMapper.toDomain);
  }
}
