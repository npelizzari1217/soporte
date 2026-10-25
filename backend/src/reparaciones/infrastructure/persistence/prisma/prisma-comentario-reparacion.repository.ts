/**
 * PrismaComentarioReparacionRepository — implementación del puerto
 * IComentarioReparacionRepository sobre el timeline del ticket (odd/ticket-unificado, S3).
 *
 * Cuenta las operaciones `COMENTARIO` activas de cada ticket, separadas por `es_interno`, en UNA
 * consulta agregada. La tabla vieja `comentarios_reparacion` ya no existe (migración 20261025150000).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ConteoComentariosTicket,
  IComentarioReparacionRepository,
} from '../../../domain/ports/i-comentario-reparacion.repository';

/** Código del tipo de operación con el que se asienta un comentario (catálogo fijo del tenant). */
const CODIGO_COMENTARIO = 'COMENTARIO';

@Injectable()
export class PrismaComentarioReparacionRepository implements IComentarioReparacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async contarPorTickets(ticketIds: string[]): Promise<Map<string, ConteoComentariosTicket>> {
    // Cortar acá y no delegar en Prisma: un `IN ()` vacío es una ida a la base cuyo resultado ya
    // conocemos.
    if (ticketIds.length === 0) {
      return new Map();
    }

    const grupos = await this.client.operacionTicket.groupBy({
      by: ['ticketId', 'esInterno'],
      where: {
        ticketId: { in: ticketIds },
        deletedAt: null,
        tipoOperacion: { codigo: CODIGO_COMENTARIO },
      },
      _count: { _all: true },
    });

    const resultado = new Map<string, ConteoComentariosTicket>();
    for (const grupo of grupos) {
      const previo = resultado.get(grupo.ticketId) ?? { publicos: 0, internos: 0 };
      resultado.set(
        grupo.ticketId,
        grupo.esInterno
          ? { ...previo, internos: grupo._count._all }
          : { ...previo, publicos: grupo._count._all },
      );
    }
    return resultado;
  }
}
