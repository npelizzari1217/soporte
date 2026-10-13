import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import {
  ConfiguracionWebhookDestino,
  DatosWebhookDestino,
  esEventoWebhook,
  WebhookDestino,
} from '../domain/webhook-destino';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';

interface FilaWebhookDestino extends Omit<WebhookDestino, 'eventos'> {
  eventos: string[];
}

const codigoPrisma = (err: unknown): unknown =>
  typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;

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

  /**
   * `create` y no `createMany({ skipDuplicates: true })`: el P2002 de la PK `cliente_id` dice sin
   * ambigüedad que ESTE insert no ocurrió, y si ocurrió devuelve su fila en el mismo viaje. Con
   * `createMany` haría falta una segunda lectura, que puede ver una fila ya cambiada por otro.
   */
  async crear(datos: DatosWebhookDestino): Promise<WebhookDestino | null> {
    try {
      return this.aDominio(await this.client.webhookDestino.create({ data: datos }));
    } catch (err) {
      if (codigoPrisma(err) === 'P2002') return null;
      throw err;
    }
  }

  async actualizarConfiguracion(
    clienteId: string,
    configuracion: ConfiguracionWebhookDestino,
  ): Promise<WebhookDestino | null> {
    const { url, eventos, activo } = configuracion;
    return this.actualizar(clienteId, { url, eventos, activo });
  }

  async actualizarSecreto(
    clienteId: string,
    secretoCifrado: string,
  ): Promise<WebhookDestino | null> {
    return this.actualizar(clienteId, { secretoCifrado });
  }

  // P2025: el cliente no tiene destino. Un único UPDATE por clave, que solo escribe `cambios`.
  private async actualizar(
    clienteId: string,
    cambios: Partial<Omit<DatosWebhookDestino, 'clienteId'>>,
  ): Promise<WebhookDestino | null> {
    try {
      return this.aDominio(
        await this.client.webhookDestino.update({ where: { clienteId }, data: cambios }),
      );
    } catch (err) {
      if (codigoPrisma(err) === 'P2025') return null;
      throw err;
    }
  }
}
