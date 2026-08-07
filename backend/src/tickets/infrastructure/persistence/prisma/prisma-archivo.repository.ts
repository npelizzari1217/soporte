/**
 * PrismaArchivoRepository — implementación del puerto IArchivoRepository.
 *
 * Gestiona solo METADATA de archivos. El binario vive en IFileStorage
 * (ADR-7) — este repo nunca toca el filesystem.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - save() es solo INSERT (los archivos son inmutables una vez subidos).
 * - linkToTicket()/linkToOperacion()/linkToPresupuesto() crean las filas de
 *   join (`archivos_ticket`/`archivos_operacion`/`archivos_presupuesto`) —
 *   DEBEN llamarse DESPUÉS de save() y dentro de la MISMA transacción
 *   (ADR-7 Fase 2 / ADR-8 Fase 3, T22). El schema real tiene TRES tablas de
 *   join (a diferencia de la referencia soporte1, que solo tiene
 *   `archivos_ticket`).
 *
 * Tarea: alcance PR5 explícito de Fase 2 (adelanta desde PR10 — ver
 * apply-progress). `linkToPresupuesto` agregado en Fase 3 (T3.3, ADR-8,
 * extensión retrocompatible del puerto).
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

  /** Fase 3 (ADR-8): join `archivos_presupuesto` ↔ `compras/AdjuntarPresupuestoUseCase`. */
  async linkToPresupuesto(archivoId: string, presupuestoId: string): Promise<void> {
    await this.client.archivoPresupuesto.create({ data: { archivoId, presupuestoId } });
  }
}
