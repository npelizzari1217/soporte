import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import { ClienteIaNoEncontradoError } from '../domain/asistente.errors';
import { IAsistenteIaConfigRepository } from '../domain/asistente-ia-config-repository.port';
import { EstadoConfigIa, estadoConfigIa } from '../domain/config-ia';

/** VerIaClienteUseCase — estado de la configuración de IA de un cliente, sin la clave (S4). */
export class VerIaClienteUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly configs: Pick<IAsistenteIaConfigRepository, 'buscarPorCliente'>,
  ) {}

  /**
   * @param clienteId cliente a consultar
   * @returns el estado público, o `ClienteIaNoEncontradoError` si el cliente no existe
   */
  async execute(clienteId: string): Promise<Result<EstadoConfigIa, ClienteIaNoEncontradoError>> {
    if (!(await this.clientes.findById(clienteId))) {
      return Result.fail(new ClienteIaNoEncontradoError(clienteId));
    }
    return Result.ok(estadoConfigIa(await this.configs.buscarPorCliente(clienteId)));
  }
}
