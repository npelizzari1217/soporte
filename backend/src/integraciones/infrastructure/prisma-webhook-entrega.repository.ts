import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { esEventoWebhook } from '../domain/webhook-destino';
import {
  DatosEncolarEntrega,
  EstadoEntregaWebhook,
  ESTADOS_ENTREGA_WEBHOOK,
  FalloEntrega,
  LARGO_MAXIMO_ERROR_ENTREGA,
  PaginaEntregas,
  PayloadWebhook,
  WebhookEntrega,
} from '../domain/webhook-entrega';
import { IWebhookEntregaRepository } from '../domain/webhook-entrega-repository.port';

type FilaWebhookEntrega = Omit<WebhookEntrega, 'evento' | 'estado' | 'payload'> & {
  evento: string;
  estado: string;
  payload: Prisma.JsonValue;
};

function esEstadoEntrega(valor: string): valor is EstadoEntregaWebhook {
  return (ESTADOS_ENTREGA_WEBHOOK as readonly string[]).includes(valor);
}

/**
 * Repositorio de `webhook_entregas`. El cliente sale de `TenantContext`: la cola vive solo en la
 * base del inquilino bindeado, así un aviso del cliente A nunca se lee desde el contexto de B.
 */
@Injectable()
export class PrismaWebhookEntregaRepository implements IWebhookEntregaRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  // El CHECK de la tabla y `EVENTOS_WEBHOOK` acotan los valores; una fila fuera de ellos es un
  // defecto de datos, no un caso de negocio, y se reporta en vez de esconderse.
  private aDominio(fila: FilaWebhookEntrega): WebhookEntrega {
    if (!esEventoWebhook(fila.evento) || !esEstadoEntrega(fila.estado)) {
      throw new Error(`Entrega de webhook ${fila.id} con evento o estado desconocido`);
    }
    return {
      ...fila,
      evento: fila.evento,
      estado: fila.estado,
      payload: fila.payload as PayloadWebhook,
    };
  }

  async encolar(datos: DatosEncolarEntrega): Promise<WebhookEntrega> {
    const fila = await this.client.webhookEntrega.create({
      data: { ...datos, payload: datos.payload as Prisma.InputJsonObject },
    });
    return this.aDominio(fila);
  }

  async tomarVencidas(ahora: Date, limite: number): Promise<WebhookEntrega[]> {
    const filas = await this.client.webhookEntrega.findMany({
      where: { estado: 'PENDIENTE', proximoIntentoAt: { lte: ahora } },
      orderBy: [{ proximoIntentoAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limite,
    });
    return filas.map((fila) => this.aDominio(fila));
  }

  async marcarEntregada(id: string, codigo: number, ahora: Date): Promise<boolean> {
    const { count } = await this.client.webhookEntrega.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data: {
        estado: 'ENTREGADA',
        intentos: { increment: 1 },
        ultimoCodigo: codigo,
        ultimoError: null,
        entregadaAt: ahora,
      },
    });
    return count === 1;
  }

  async registrarFallo(id: string, fallo: FalloEntrega): Promise<boolean> {
    const data: Prisma.WebhookEntregaUpdateManyMutationInput = {
      intentos: { increment: 1 },
      ultimoCodigo: fallo.codigo ?? null,
      ultimoError: fallo.error.slice(0, LARGO_MAXIMO_ERROR_ENTREGA),
    };
    if (fallo.proximoIntentoAt) {
      data.proximoIntentoAt = fallo.proximoIntentoAt;
    } else {
      data.estado = 'FALLIDA';
    }
    const { count } = await this.client.webhookEntrega.updateMany({
      where: { id, estado: 'PENDIENTE' },
      data,
    });
    return count === 1;
  }

  async listar({
    pagina,
    porPagina,
  }: {
    pagina: number;
    porPagina: number;
  }): Promise<PaginaEntregas> {
    const [filas, total] = await Promise.all([
      this.client.webhookEntrega.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (Math.max(pagina, 1) - 1) * porPagina,
        take: porPagina,
      }),
      this.client.webhookEntrega.count(),
    ]);
    return { items: filas.map((fila) => this.aDominio(fila)), total };
  }

  async purgarAnterioresA(fecha: Date): Promise<number> {
    const { count } = await this.client.webhookEntrega.deleteMany({
      where: { createdAt: { lt: fecha } },
    });
    return count;
  }
}
