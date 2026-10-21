/**
 * PrismaPermisoTipoTicketRepository — implementación de IPermisoTipoTicketRepository.
 *
 * El cliente sale de TenantContext: los permisos por tipo viven solo en la base del tenant
 * bindeado, junto a `tipos_ticket` (odd/tasks/permisos-por-tipo-ticket.md, D1).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ACCIONES_TIPO_TICKET,
  AccionTipoTicket,
  TipoTicketConModulo,
} from '../../../domain/permisos-tipo-ticket';
import {
  IPermisoTipoTicketRepository,
  PermisoTipoTicketFila,
} from '../../../domain/ports/i-permiso-tipo-ticket.repository';

type TenantClient = InstanceType<typeof TenantPrismaClient>;
type TenantTx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

/** Valida que el valor leído de la columna pertenezca al vocabulario; el CHECK lo garantiza. */
function aAccion(valor: string): AccionTipoTicket {
  const accion = ACCIONES_TIPO_TICKET.find((a) => a === valor);
  if (accion === undefined) {
    throw new Error(`Acción de permiso por tipo desconocida en la base: ${valor}`);
  }
  return accion;
}

@Injectable()
export class PrismaPermisoTipoTicketRepository implements IPermisoTipoTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): TenantClient {
    return this.tenantContext.getClient() as TenantClient;
  }

  async listarPorUsuario(usuarioId: string): Promise<Map<string, Set<AccionTipoTicket>>> {
    const filas = await this.client.permisoTipoTicket.findMany({
      where: { usuarioId },
      select: { tipoId: true, accion: true },
    });
    const porTipo = new Map<string, Set<AccionTipoTicket>>();
    for (const { tipoId, accion } of filas) {
      const acciones = porTipo.get(tipoId) ?? new Set<AccionTipoTicket>();
      acciones.add(aAccion(accion));
      porTipo.set(tipoId, acciones);
    }
    return porTipo;
  }

  async reemplazarDeUsuario(
    usuarioId: string,
    filas: readonly Omit<PermisoTipoTicketFila, 'usuarioId'>[],
  ): Promise<void> {
    const data = filas.map(({ tipoId, accion }) => ({ usuarioId, tipoId, accion }));
    const reemplazar = async (tx: TenantTx): Promise<void> => {
      await tx.permisoTipoTicket.deleteMany({ where: { usuarioId } });
      if (data.length > 0) {
        // skipDuplicates: un par repetido en `filas` no debe abortar el reemplazo por la PK.
        await tx.permisoTipoTicket.createMany({ data, skipDuplicates: true });
      }
    };
    // Dentro de una transacción ya abierta el cliente es un TransactionClient, que no expone
    // `$transaction`: se participa de la transacción en curso en vez de abrir otra.
    if (this.tenantContext.get()?.enTransaccion === true) {
      await reemplazar(this.client as TenantTx);
      return;
    }
    await this.client.$transaction(reemplazar);
  }

  async agregarSiFaltan(filas: readonly PermisoTipoTicketFila[]): Promise<number> {
    if (filas.length === 0) return 0;
    const { count } = await this.client.permisoTipoTicket.createMany({
      data: filas.map(({ usuarioId, tipoId, accion }) => ({ usuarioId, tipoId, accion })),
      skipDuplicates: true,
    });
    return count;
  }

  async listarTipos(): Promise<TipoTicketConModulo[]> {
    // Sin filtro de `deletedAt`: los tipos dados de baja también reciben permisos (L24).
    return this.client.tipoTicket.findMany({ select: { id: true, modulo: true } });
  }
}
