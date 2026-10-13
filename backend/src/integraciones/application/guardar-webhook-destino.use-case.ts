import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import {
  BuscarDirecciones,
  resolverDestinoSeguro,
  validarUrlDestino,
} from '../domain/destino-webhook-seguro';
import { generarSecretoWebhook } from '../domain/firma-webhook';
import {
  ApiNoHabilitadaError,
  DestinoWebhookNoAdmitidoError,
  EventosWebhookInvalidosError,
  UrlWebhookInvalidaError,
} from '../domain/integraciones.errors';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';
import { esEventoWebhook, EventoWebhook } from '../domain/webhook-destino';
import { vistaWebhookDestino, WebhookDestinoVista } from './consultar-webhook-destino.use-case';
import { SecretoWebhookCifrado } from './secreto-webhook-cifrado';

export interface GuardarWebhookDestinoCommand {
  clienteId: string;
  url: string;
  eventos: string[];
  activo: boolean;
}

/**
 * La vista del destino guardado. `secreto` viaja en claro SOLO cuando el destino se acaba de crear
 * (CA7): en una actualización el secreto se conserva y la respuesta no lo lleva.
 */
export type GuardarWebhookDestinoOutput = WebhookDestinoVista & { secreto?: string };

export type GuardarWebhookDestinoError =
  | ApiNoHabilitadaError
  | EventosWebhookInvalidosError
  | UrlWebhookInvalidaError
  | DestinoWebhookNoAdmitidoError;

/**
 * GuardarWebhookDestinoUseCase — crea o actualiza el destino de webhooks del cliente del actor
 * (odd/webhooks, T6: CA6, CA7 y CA8).
 *
 * 1. Exige la API habilitada (CA6), como la emisión de claves.
 * 2. Los eventos son un subconjunto no vacío de `EVENTOS_WEBHOOK`; los repetidos se descartan.
 * 3. La URL pasa `validarUrlDestino` y después `resolverDestinoSeguro` (CA8). Los dos rechazos de
 *    DNS se informan como `DestinoWebhookNoAdmitidoError`, un único mensaje que no dice si el host
 *    no existe o si resuelve a una red interna. Se guarda la URL normalizada.
 * 4. La primera vez genera el secreto, lo guarda cifrado y lo devuelve en claro esa única vez. En
 *    una actualización conserva el payload cifrado tal cual y no lo devuelve.
 */
export class GuardarWebhookDestinoUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly destinos: Pick<IWebhookDestinoRepository, 'buscarPorCliente' | 'guardar'>,
    private readonly secretos: Pick<SecretoWebhookCifrado, 'cifrar'>,
    private readonly buscarDirecciones: BuscarDirecciones,
  ) {}

  async execute(
    command: GuardarWebhookDestinoCommand,
  ): Promise<Result<GuardarWebhookDestinoOutput, GuardarWebhookDestinoError>> {
    const falla = (error: GuardarWebhookDestinoError) =>
      Result.fail<GuardarWebhookDestinoOutput, GuardarWebhookDestinoError>(error);

    const cliente = await this.clientes.findById(command.clienteId);
    if (!cliente?.apiHabilitada) return falla(new ApiNoHabilitadaError());

    if (command.eventos.length === 0 || !command.eventos.every(esEventoWebhook)) {
      return falla(new EventosWebhookInvalidosError());
    }
    const eventos: EventoWebhook[] = [...new Set(command.eventos.filter(esEventoWebhook))];

    const url = validarUrlDestino(command.url.trim());
    if (url.isFail()) return falla(url.getError());
    const resuelto = await resolverDestinoSeguro(url.getValue().hostname, this.buscarDirecciones);
    if (resuelto.isFail()) return falla(new DestinoWebhookNoAdmitidoError());

    const actual = await this.destinos.buscarPorCliente(command.clienteId);
    let secreto: string | undefined;
    let secretoCifrado: string;
    if (actual) {
      secretoCifrado = actual.secretoCifrado;
    } else {
      secreto = generarSecretoWebhook();
      secretoCifrado = this.secretos.cifrar(command.clienteId, secreto);
    }
    const guardado = await this.destinos.guardar({
      clienteId: command.clienteId,
      url: url.getValue().href,
      eventos,
      activo: command.activo,
      secretoCifrado,
    });

    const vista = vistaWebhookDestino(guardado);
    return Result.ok(secreto ? { ...vista, secreto } : vista);
  }
}
