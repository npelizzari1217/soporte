/**
 * PrismaArchivoRepository — implementación del puerto IArchivoRepository.
 *
 * Gestiona solo METADATA de archivos. El binario vive en IFileStorage
 * (ADR-7) — este repo nunca toca el filesystem.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - save() es solo INSERT (los archivos son inmutables una vez subidos).
 * - linkToTicket()/linkToOperacion() crean las filas de join
 *   (`archivos_ticket`/`archivos_operacion`) — DEBEN llamarse DESPUÉS de
 *   save() y dentro de la MISMA transacción (ADR-7, T22).
 *
 * Tarea: alcance PR5 explícito de Fase 2 (adelanta desde PR10 — ver
 * apply-progress). `linkToPresupuesto` (Fase 3, ADR-8) fue removido en
 * sdd/redisenio-modulo-compras PR-1 junto con `archivos_presupuesto` y su
 * único consumidor (`compras/AdjuntarPresupuestoUseCase`).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IArchivoRepository } from '../../../domain/ports/i-archivo.repository';
import { ArchivoEntity } from '../../../domain/entities/archivo.entity';
import { ArchivoMapper } from './archivo.mapper';

@Injectable()
export class PrismaArchivoRepository implements IArchivoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async save(archivo: ArchivoEntity): Promise<void> {
    const data = ArchivoMapper.toPersistence(archivo);
    await this.client.archivo.create({ data });
  }

  async linkToTicket(archivoId: string, ticketId: string): Promise<void> {
    await this.client.archivoTicket.create({ data: { archivoId, ticketId } });
  }

  async linkToOperacion(archivoId: string, operacionId: string): Promise<void> {
    await this.client.archivoOperacion.create({ data: { archivoId, operacionId } });
  }
}
