import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IClienteEmailConfigRepository } from '../../../clientes/domain/ports/i-cliente-email-config.repository';
import { EstadoCorreoCliente, ICorreoDeCliente } from '../../domain/ports/i-correo-de-cliente.port';

/**
 * CorreoDeClienteAdapter — implementación de `ICorreoDeCliente` (design
 * ADR-4). `enviar()` resuelve el `dbName` del cliente y bindea el
 * `TenantContext` mínimo antes de delegar en `IEmailSender.send()` — molde
 * de `SlaSweepScheduler.ejecutarBarrido()`
 * (`sla/infrastructure/schedulers/sla-sweep.scheduler.ts:45-49`).
 *
 * Cumple el "nunca lanza" del puerto: un fallo de repositorio o de Prisma se
 * loguea (solo `clienteId` y el mensaje del error, nunca el mail) y `estado()`
 * lo trata como `CLIENTE_NO_DISPONIBLE`.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme". Ref design: ADR-4. Tarea: 3.5.
 */
@Injectable()
export class CorreoDeClienteAdapter implements ICorreoDeCliente {
  private readonly logger = new Logger(CorreoDeClienteAdapter.name);

  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly emailConfigRepo: Pick<IClienteEmailConfigRepository, 'findState'>,
    private readonly prismaService: Pick<PrismaService, 'getTenantClient'>,
    private readonly tenantContext: TenantContext,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
  ) {}

  async estado(clienteId: string): Promise<EstadoCorreoCliente> {
    try {
      const cliente = await this.clienteRepo.findById(clienteId);
      if (!cliente || !cliente.activo || cliente.isDeleted()) {
        return 'CLIENTE_NO_DISPONIBLE';
      }

      const configState = await this.emailConfigRepo.findState(clienteId);
      return configState.configurado ? 'LISTO' : 'SIN_CORREO';
    } catch (error) {
      this.logError('estado', clienteId, error);
      return 'CLIENTE_NO_DISPONIBLE';
    }
  }

  async enviar(clienteId: string, msg: EmailMessage): Promise<void> {
    try {
      const cliente = await this.clienteRepo.findById(clienteId);
      if (!cliente) {
        // No debería pasar: el caller ya validó `estado() === 'LISTO'` con este
        // clienteId. Defensivo: sin dbName no hay a qué tenant bindear.
        return;
      }

      const prismaClient = this.prismaService.getTenantClient(cliente.dbName);
      await this.tenantContext.run({ prismaClient, dbName: cliente.dbName, clienteId }, () =>
        this.emailSender.send(msg),
      );
    } catch (error) {
      this.logError('enviar', clienteId, error);
    }
  }

  private logError(operacion: string, clienteId: string, error: unknown): void {
    const detalle = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `CORREO_CLIENTE_ERROR | op=${operacion} | clienteId=${clienteId} | error=${detalle}`,
    );
  }
}
