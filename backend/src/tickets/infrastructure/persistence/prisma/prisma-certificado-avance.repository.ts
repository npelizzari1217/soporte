/**
 * PrismaCertificadoAvanceRepository — implementación de `ICertificadoAvanceRepository` sobre
 * `certificaciones_avance` y `certificacion_tarea`, con el cliente del inquilino de `TenantContext`
 * (el de la transacción cuando corre dentro de una).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { CertificadoAvanceEntity } from '../../../domain/entities/certificado-avance.entity';
import { ICertificadoAvanceRepository } from '../../../domain/ports/i-certificado-avance.repository';
import { CertificadoAvanceMapper } from './certificado-avance.mapper';

@Injectable()
export class PrismaCertificadoAvanceRepository implements ICertificadoAvanceRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async listarPorTicket(ticketId: string): Promise<CertificadoAvanceEntity[]> {
    const rows = await this.client.certificacionAvance.findMany({
      where: { ticketId },
      include: { tareas: true },
      orderBy: { numero: 'asc' },
    });
    return rows.map((row) => CertificadoAvanceMapper.toDomain(row));
  }

  async buscarPorId(id: string): Promise<CertificadoAvanceEntity | null> {
    const row = await this.client.certificacionAvance.findUnique({
      where: { id },
      include: { tareas: true },
    });
    return row ? CertificadoAvanceMapper.toDomain(row) : null;
  }

  async tareasCertificadas(ticketId: string): Promise<Set<string>> {
    const rows = await this.client.certificacionTarea.findMany({
      where: { vigente: true, certificacion: { ticketId } },
      select: { tareaId: true },
    });
    return new Set(rows.map((row) => row.tareaId));
  }

  async siguienteNumero(ticketId: string): Promise<number> {
    const { _max } = await this.client.certificacionAvance.aggregate({
      where: { ticketId },
      _max: { numero: true },
    });
    return (_max.numero ?? 0) + 1;
  }

  async crear(certificado: CertificadoAvanceEntity): Promise<void> {
    await this.client.certificacionAvance.create({
      data: {
        id: certificado.id,
        ticketId: certificado.ticketId,
        numero: certificado.numero,
        porcentaje: certificado.porcentaje,
        emitidoPorId: certificado.emitidoPorId,
        emitidoEn: certificado.emitidoEn,
        tareas: {
          create: certificado.tareas.map((tarea) => ({ tareaId: tarea.tareaId, peso: tarea.peso })),
        },
      },
    });
  }

  async anular(certificado: CertificadoAvanceEntity): Promise<void> {
    await this.client.certificacionAvance.update({
      where: { id: certificado.id },
      data: {
        anuladoEn: certificado.anuladoEn,
        anuladoPorId: certificado.anuladoPorId,
        motivoAnulacion: certificado.motivoAnulacion,
      },
    });
    await this.client.certificacionTarea.updateMany({
      where: { certificacionId: certificado.id },
      data: { vigente: false },
    });
  }
}
