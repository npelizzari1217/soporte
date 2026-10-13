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
    private readonly destinos: Pick<IWebhookDestinoRepository, 'actualizarSecreto'>,
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
    // Un único UPDATE del secreto: no relee ni reescribe URL, eventos ni activo, así que tampoco
    // pisa un PUT concurrente (JD-2).
    const secreto = generarSecretoWebhook();
    const actualizado = await this.destinos.actualizarSecreto(
      clienteId,
      this.secretos.cifrar(clienteId, secreto),
    );
    if (!actualizado) {
      return Result.fail<RegenerarSecretoWebhookOutput, RegenerarSecretoWebhookError>(
        new WebhookDestinoNoEncontradoError(),
      );
    }
    return Result.ok({ secreto });
  }
}
