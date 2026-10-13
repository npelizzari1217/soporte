import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import { generarSecretoWebhook } from '../domain/firma-webhook';
import {
  ApiNoHabilitadaError,
  WebhookDestinoNoEncontradoError,
} from '../domain/integraciones.errors';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';
import { SecretoWebhookCifrado } from './secreto-webhook-cifrado';

export interface RegenerarSecretoWebhookOutput {
  /** Secreto en claro: esta es la UNICA vez que se devuelve (CA7). */
  secreto: string;
}

export type RegenerarSecretoWebhookError = ApiNoHabilitadaError | WebhookDestinoNoEncontradoError;

/**
 * RegenerarSecretoWebhookUseCase — reemplaza el secreto de firma del destino del cliente del actor
 * (odd/webhooks, T6, CA7). Exige la API habilitada, como cualquier cambio de configuración (CA6), y
 * un destino existente. El secreto anterior deja de valer en el próximo envío; URL, eventos y
 * estado se conservan.
 */
export class RegenerarSecretoWebhookUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly destinos: Pick<IWebhookDestinoRepository, 'buscarPorCliente' | 'guardar'>,
    private readonly secretos: Pick<SecretoWebhookCifrado, 'cifrar'>,
  ) {}

  async execute(
    clienteId: string,
  ): Promise<Result<RegenerarSecretoWebhookOutput, RegenerarSecretoWebhookError>> {
    const cliente = await this.clientes.findById(clienteId);
    if (!cliente?.apiHabilitada) {
      return Result.fail<RegenerarSecretoWebhookOutput, RegenerarSecretoWebhookError>(
        new ApiNoHabilitadaError(),
      );
    }
    const actual = await this.destinos.buscarPorCliente(clienteId);
    if (!actual) {
      return Result.fail<RegenerarSecretoWebhookOutput, RegenerarSecretoWebhookError>(
        new WebhookDestinoNoEncontradoError(),
      );
    }

    const secreto = generarSecretoWebhook();
    await this.destinos.guardar({
      clienteId,
      url: actual.url,
      eventos: actual.eventos,
      activo: actual.activo,
      secretoCifrado: this.secretos.cifrar(clienteId, secreto),
    });
    return Result.ok({ secreto });
  }
}
