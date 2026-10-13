import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { DatosWebhookDestino, esEventoWebhook, WebhookDestino } from '../domain/webhook-destino';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';

interface FilaWebhookDestino extends Omit<WebhookDestino, 'eventos'> {
  eventos: string[];
}

/** Repositorio de `webhook_destinos` en master. Guarda y devuelve el secreto cifrado tal cual. */
@Injectable()
export class PrismaWebhookDestinoRepository implements IWebhookDestinoRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  // Un evento que el dominio ya no reconoce se descarta al leer, como los permisos de `api_claves`.
  private aDominio(fila: FilaWebhookDestino): WebhookDestino {
    return { ...fila, eventos: fila.eventos.filter(esEventoWebhook) };
  }

  async buscarPorCliente(clienteId: string): Promise<WebhookDestino | null> {
    const fila = await this.client.webhookDestino.findUnique({ where: { clienteId } });
    return fila ? this.aDominio(fila) : null;
  }

  async guardar(datos: DatosWebhookDestino): Promise<WebhookDestino> {
    const { clienteId, ...cambios } = datos;
    const fila = await this.client.webhookDestino.upsert({
      where: { clienteId },
      create: datos,
      update: cambios,
    });
    return this.aDominio(fila);
  }
}
