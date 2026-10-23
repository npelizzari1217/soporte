import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { AplicarPlantillaPermisosTipoTicket } from '../../../tickets/application/services/aplicar-plantilla-permisos-tipo-ticket.service';
import {
  AplicarPlantillaPorTipoInput,
  IPermisosPorTipoDeCliente,
} from '../../domain/ports/i-permisos-por-tipo-de-cliente.port';

/**
 * PermisosPorTipoDeClienteAdapter — implementación de `IPermisosPorTipoDeCliente`
 * (odd/tasks/permisos-por-tipo-ticket.md, T4c, D1).
 *
 * Resuelve la base del tenant a partir de `clienteId` y bindea un `TenantContext` propio antes de
 * delegar en `AplicarPlantillaPermisosTipoTicket`, con el molde de `CorreoDeClienteAdapter`. No
 * depende del contexto que haya bindeado `TenantGuard`: el seed de demo invoca los mismos casos de
 * uso sin request, y así las filas van siempre al tenant del `clienteId` recibido.
 *
 * Un cliente dado de baja igual recibe las filas: su base se conserva y la baja es reversible.
 */
export class PermisosPorTipoDeClienteAdapter implements IPermisosPorTipoDeCliente {
  private readonly logger = new Logger(PermisosPorTipoDeClienteAdapter.name);

  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly tenantContext: TenantContext,
    private readonly plantilla: Pick<AplicarPlantillaPermisosTipoTicket, 'ejecutar'>,
  ) {}

  async aplicarPlantilla(input: AplicarPlantillaPorTipoInput): Promise<void> {
    try {
      const cliente = await this.clienteRepo.findById(input.clienteId);
      if (!cliente) {
        throw new Error(
          `El cliente ${input.clienteId} no existe: no hay base de tenant para los permisos por tipo.`,
        );
      }
      const prismaClient = this.prismaService.getTenantClient(cliente.dbName);
      await this.tenantContext.run(
        { prismaClient, dbName: cliente.dbName, clienteId: input.clienteId },
        () =>
          this.plantilla.ejecutar({
            usuarioId: input.usuarioId,
            plantilla: input.plantilla,
            sobrescribir: input.sobrescribir,
          }),
      );
    } catch (error) {
      // Se registra y se relanza: el caso de uso lo convierte en un error explícito para el
      // administrador, que no lleva la causa técnica.
      const detalle = error instanceof Error ? `${error.name}: ${error.message}` : typeof error;
      this.logger.error(
        `PERMISOS_TIPO_ERROR | clienteId=${input.clienteId} | usuarioId=${input.usuarioId} | error=${detalle}`,
      );
      throw error;
    }
  }
}
