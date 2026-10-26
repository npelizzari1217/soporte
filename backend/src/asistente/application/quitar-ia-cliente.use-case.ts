import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import { ClienteIaNoEncontradoError } from '../domain/asistente.errors';
import { IAsistenteIaConfigRepository } from '../domain/asistente-ia-config-repository.port';
import { ESTADO_IA_SIN_CONFIGURAR, EstadoConfigIa } from '../domain/config-ia';

/**
 * QuitarIaClienteUseCase — borra la configuración de IA de un cliente, clave incluida (S4). Desde
 * ese momento el asistente de ese cliente responde con la Ayuda directamente.
 */
export class QuitarIaClienteUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly configs: Pick<IAsistenteIaConfigRepository, 'quitar'>,
  ) {}

  /**
   * @param clienteId cliente al que se le quita la IA
   * @returns el estado "sin configurar", o `ClienteIaNoEncontradoError` si el cliente no existe
   */
  async execute(clienteId: string): Promise<Result<EstadoConfigIa, ClienteIaNoEncontradoError>> {
    if (!(await this.clientes.findById(clienteId))) {
      return Result.fail(new ClienteIaNoEncontradoError(clienteId));
    }
    await this.configs.quitar(clienteId);
    return Result.ok(ESTADO_IA_SIN_CONFIGURAR);
  }
}
