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
  TipoTicketDePermisos,
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

  async listarUsuariosConAccion(
    tipoIds: readonly string[],
    accion: AccionTipoTicket,
  ): Promise<Map<string, string[]>> {
    const porTipo = new Map<string, string[]>();
    if (tipoIds.length === 0) return porTipo;
    const filas = await this.client.permisoTipoTicket.findMany({
      where: { tipoId: { in: [...tipoIds] }, accion },
      select: { tipoId: true, usuarioId: true },
    });
    for (const { tipoId, usuarioId } of filas) {
      porTipo.set(tipoId, [...(porTipo.get(tipoId) ?? []), usuarioId]);
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

  async copiarDeTipo(origenId: string, destinoId: string): Promise<number> {
    // Un solo INSERT ... SELECT: la copia no pasa por memoria y, con el cliente del contexto, corre
    // dentro de la transacción del alta del tipo cuando la hay.
    return this.client.$executeRaw`
      INSERT INTO "permisos_tipo_ticket" ("usuario_id", "tipo_id", "accion")
      SELECT "usuario_id", ${destinoId}::uuid, "accion"
        FROM "permisos_tipo_ticket"
       WHERE "tipo_id" = ${origenId}::uuid
      ON CONFLICT DO NOTHING`;
  }

  async listarTipos(): Promise<TipoTicketConModulo[]> {
    // Sin filtro de `deletedAt`: los tipos dados de baja también reciben permisos (L24).
    return this.client.tipoTicket.findMany({ select: { id: true, modulo: true } });
  }

  async listarTiposConDetalle(): Promise<TipoTicketDePermisos[]> {
    // Mismo universo que `listarTipos` (L24): un tipo dado de baja figura como inactivo.
    const tipos = await this.client.tipoTicket.findMany({
      select: { id: true, modulo: true, nombre: true, activo: true, deletedAt: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    });
    return tipos.map(({ id, modulo, nombre, activo, deletedAt }) => ({
      id,
      modulo,
      nombre,
      activo: activo && deletedAt === null,
    }));
  }
}
